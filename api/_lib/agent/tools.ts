/**
 * Tools do agente de onboarding V2 + executor com validação determinística
 * inline (padrão prompt-optimizer: o modelo corrige lendo o erro da tool,
 * nada é salvo "no chute").
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  DEPARTMENT_ORDER,
  findQuestion,
  missingRequired,
  type DepartmentSlug,
} from './blueprint';
import type { ORToolDef } from './openrouter';
import { maybeNotifyOnboardingComplete } from '../whatsapp-notify';
import { maybePromoteToBoard } from '../promote-to-board';

export const INSIGHT_CATEGORIES = [
  'fluxo_base',
  'fluxo_personalizado',
  'servico_nao_oferecido',
  'regra_de_negocio',
  'excecao',
  'integracao',
  'expectativa',
  'outro',
] as const;

export interface AgentToolContext {
  supabase: SupabaseClient;
  session: Record<string, unknown>;
  /** Mapa vivo pergunta_id → valor (inclui pseudo-campos _session_*). */
  answers: Record<string, unknown>;
  slug: string;
  baseUrl: string;
  /** Side-effects (provision/sync/email/webhook) em voo — aguardados no fim do turno. */
  pendingSideEffects: Promise<unknown>[];
}

export const AGENT_TOOLS: ORToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'save_answers',
      description:
        'Salva respostas do questionário assim que o cliente as fornece. Use o pergunta_id exato do <session_context> e o formato de valor da pergunta. Pode salvar várias de uma vez.',
      parameters: {
        type: 'object',
        properties: {
          departamento: {
            type: 'string',
            enum: [...DEPARTMENT_ORDER],
            description: 'Slug do departamento das perguntas',
          },
          answers: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                pergunta_id: { type: 'string' },
                valor: {
                  description:
                    'Valor JSON no formato da pergunta (string, número, objeto ou array)',
                },
              },
              required: ['pergunta_id', 'valor'],
            },
          },
        },
        required: ['departamento', 'answers'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'record_insight',
      description:
        'Registra uma informação relevante que NÃO tem pergunta correspondente no questionário: fluxo de atendimento real, exceção, regra de negócio, serviço não oferecido, pedido de personalização, expectativa. Esses insights alimentam a configuração da conta e a geração dos prompts da IA de atendimento.',
      parameters: {
        type: 'object',
        properties: {
          departamento: {
            type: 'string',
            enum: [...DEPARTMENT_ORDER],
            description: 'Departamento relacionado (omita se for geral)',
          },
          categoria: { type: 'string', enum: [...INSIGHT_CATEGORIES] },
          titulo: { type: 'string', description: 'Resumo curto (até ~80 chars)' },
          detalhe: {
            type: 'string',
            description:
              'Descrição completa, no seu texto, com tudo que o time de implantação precisa saber',
          },
        },
        required: ['categoria', 'titulo', 'detalhe'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'complete_department',
      description:
        'Conclui uma etapa/departamento DEPOIS que as perguntas obrigatórias foram respondidas e o cliente confirmou o resumo. Dispara as integrações do fluxo oficial (criação de tenant na identificação, sync nos demais, webhook final quando tudo concluir).',
      parameters: {
        type: 'object',
        properties: {
          departamento: { type: 'string', enum: [...DEPARTMENT_ORDER] },
          responsavel_nome: {
            type: 'string',
            description: 'Nome da pessoa que respondeu esta etapa na conversa',
          },
        },
        required: ['departamento', 'responsavel_nome'],
      },
    },
  },
];

// ---------------------------------------------------------------------------
// Normalização de valores por tipo de pergunta
// ---------------------------------------------------------------------------

function normalizeValue(
  tipo: string,
  valor: unknown,
  opcoes?: Array<{ value: string; label: string }>
): { ok: true; valor: unknown; warning?: string } | { ok: false; error: string } {
  if (tipo === 'select' && opcoes?.length) {
    if (typeof valor !== 'string') return { ok: false, error: 'select espera string (value da opção)' };
    if (opcoes.some((o) => o.value === valor)) return { ok: true, valor };
    const byLabel = opcoes.find((o) => o.label.toLowerCase() === valor.toLowerCase());
    if (byLabel) return { ok: true, valor: byLabel.value, warning: `label convertido para value "${byLabel.value}"` };
    return {
      ok: false,
      error: `"${valor}" não é uma opção válida. Opções: ${opcoes.map((o) => o.value).join(' | ')}`,
    };
  }
  if (tipo === 'checkbox_multiple') {
    let obj: { selected?: unknown[]; outroTexto?: string };
    if (Array.isArray(valor)) obj = { selected: valor };
    else if (valor && typeof valor === 'object' && 'selected' in (valor as object))
      obj = valor as { selected?: unknown[] };
    else return { ok: false, error: 'checkbox_multiple espera {"selected": ["v1","v2"]} ou array de values' };
    if (!Array.isArray(obj.selected)) return { ok: false, error: 'selected deve ser array' };
    if (opcoes?.length) {
      obj.selected = obj.selected.map((v) => {
        if (typeof v !== 'string') return v;
        if (opcoes.some((o) => o.value === v)) return v;
        const byLabel = opcoes.find((o) => o.label.toLowerCase() === v.toLowerCase());
        return byLabel ? byLabel.value : v;
      });
    }
    return { ok: true, valor: obj };
  }
  if (tipo === 'horario_semanal') {
    if (
      !valor ||
      typeof valor !== 'object' ||
      !('segunda_sexta' in (valor as object))
    ) {
      return {
        ok: false,
        error:
          'horario_semanal espera {"segunda_sexta": {"inicio","fim","nao_atende"}, "sabado": {...}, "domingo_feriado": {...}}',
      };
    }
    return { ok: true, valor };
  }
  if (tipo === 'cnpj' || tipo === 'cpf' || tipo === 'phone') {
    // Mesmo comportamento do formulário: persiste só dígitos
    if (typeof valor !== 'string') return { ok: false, error: `${tipo} espera string` };
    const digits = valor.replace(/\D/g, '');
    if (tipo === 'cnpj' && digits.length !== 14)
      return { ok: false, error: `CNPJ deve ter 14 dígitos (recebi ${digits.length})` };
    if (tipo === 'cpf' && digits.length !== 11)
      return { ok: false, error: `CPF deve ter 11 dígitos (recebi ${digits.length})` };
    if (tipo === 'phone' && (digits.length < 10 || digits.length > 13))
      return { ok: false, error: 'telefone deve ter DDD + número (10-13 dígitos)' };
    return { ok: true, valor: digits };
  }
  if (tipo === 'number' || tipo === 'currency') {
    if (typeof valor === 'number') return { ok: true, valor };
    if (typeof valor === 'string') {
      const n = Number(valor.replace(/[R$\s.]/g, '').replace(',', '.'));
      if (!Number.isNaN(n)) return { ok: true, valor: n };
    }
    // valores textuais legítimos existem (ex.: "sob consulta") — aceita com aviso
    return { ok: true, valor, warning: 'valor não numérico salvo como texto' };
  }
  if (tipo === 'boolean') {
    if (typeof valor === 'boolean') return { ok: true, valor };
    if (typeof valor === 'string') {
      const v = valor.trim().toLowerCase();
      if (['sim', 'true', 'yes'].includes(v)) return { ok: true, valor: true };
      if (['não', 'nao', 'false', 'no'].includes(v)) return { ok: true, valor: false };
    }
    return { ok: false, error: 'boolean espera true/false' };
  }
  if (tipo === 'repeater') {
    if (!Array.isArray(valor)) return { ok: false, error: 'repeater espera array de objetos (um por item)' };
    return { ok: true, valor };
  }
  return { ok: true, valor };
}

// ---------------------------------------------------------------------------
// Side-effects do fluxo oficial (mesmos endpoints que o formulário dispara)
// ---------------------------------------------------------------------------

function firePost(ctx: AgentToolContext, path: string, body: unknown): void {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  const p = fetch(`${ctx.baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: controller.signal,
  })
    .then(async (r) => {
      const text = await r.text().catch(() => '');
      console.log(`[agent/side-effect] ${path} → ${r.status} ${text.slice(0, 200)}`);
    })
    .catch((e) => console.error(`[agent/side-effect] ${path} FAIL:`, e?.message ?? e))
    .finally(() => clearTimeout(timer));
  ctx.pendingSideEffects.push(p);
}

const SENSITIVE_PREFIXES = ['_session_', 'erp_', 'gateway_', 'rede_', 'mapas_'];

// ---------------------------------------------------------------------------
// Executor
// ---------------------------------------------------------------------------

export async function executeAgentTool(
  name: string,
  args: Record<string, unknown>,
  ctx: AgentToolContext
): Promise<Record<string, unknown>> {
  try {
    switch (name) {
      case 'save_answers':
        return await saveAnswers(args, ctx);
      case 'record_insight':
        return await recordInsight(args, ctx);
      case 'complete_department':
        return await completeDepartment(args, ctx);
      default:
        return { error: `Tool desconhecida: ${name}` };
    }
  } catch (e) {
    console.error(`[agent/tools] ${name} erro:`, e);
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

async function saveAnswers(
  args: Record<string, unknown>,
  ctx: AgentToolContext
): Promise<Record<string, unknown>> {
  const departamento = args.departamento as DepartmentSlug;
  const answers = args.answers as Array<{ pergunta_id: string; valor: unknown }>;
  if (!DEPARTMENT_ORDER.includes(departamento))
    return { error: `departamento inválido: ${departamento}` };
  if (!Array.isArray(answers) || !answers.length)
    return { error: 'answers vazio' };

  const rows: Array<Record<string, unknown>> = [];
  const saved: string[] = [];
  const rejected: Array<{ pergunta_id: string; error: string }> = [];
  const warnings: string[] = [];

  for (const a of answers) {
    const found = findQuestion(a.pergunta_id);
    if (!found) {
      rejected.push({
        pergunta_id: a.pergunta_id,
        error: 'pergunta_id não existe no questionário — confira o id exato no <session_context>',
      });
      continue;
    }
    const deptReal = found.departamento;
    if (deptReal !== departamento) {
      warnings.push(
        `${a.pergunta_id} pertence ao departamento "${deptReal}" — salvo lá`
      );
    }
    const norm = normalizeValue(found.question.tipo, a.valor, found.question.opcoes);
    if (norm.ok === false) {
      rejected.push({ pergunta_id: a.pergunta_id, error: norm.error });
      continue;
    }
    if (norm.warning) warnings.push(`${a.pergunta_id}: ${norm.warning}`);
    rows.push({
      session_id: ctx.session.id,
      departamento: deptReal,
      pergunta_id: a.pergunta_id,
      valor: norm.valor,
      updated_at: new Date().toISOString(),
    });
    saved.push(a.pergunta_id);
    ctx.answers[a.pergunta_id] = norm.valor;
  }

  if (rows.length) {
    const { error } = await ctx.supabase
      .from('onboarding_respostas')
      .upsert(rows, { onConflict: 'session_id,departamento,pergunta_id' });
    if (error) return { error: `falha ao salvar: ${error.message}`, rejected };
  }

  const stillMissing = missingRequired(departamento, ctx.answers).map((q) => q.id);
  return {
    saved,
    ...(rejected.length ? { rejected } : {}),
    ...(warnings.length ? { warnings } : {}),
    obrigatorias_pendentes_no_departamento: stillMissing,
  };
}

async function recordInsight(
  args: Record<string, unknown>,
  ctx: AgentToolContext
): Promise<Record<string, unknown>> {
  const categoria = args.categoria as string;
  if (!INSIGHT_CATEGORIES.includes(categoria as (typeof INSIGHT_CATEGORIES)[number]))
    return { error: `categoria inválida. Use: ${INSIGHT_CATEGORIES.join(' | ')}` };
  const titulo = String(args.titulo ?? '').trim();
  const detalhe = String(args.detalhe ?? '').trim();
  if (!titulo || !detalhe) return { error: 'titulo e detalhe são obrigatórios' };

  const { error } = await ctx.supabase.from('onboarding_agent_insights').insert({
    session_id: ctx.session.id,
    departamento: (args.departamento as string) ?? null,
    categoria,
    titulo,
    detalhe,
  });
  if (error) return { error: `falha ao registrar insight: ${error.message}` };
  return { ok: true, registrado: titulo };
}

async function completeDepartment(
  args: Record<string, unknown>,
  ctx: AgentToolContext
): Promise<Record<string, unknown>> {
  const departamento = args.departamento as DepartmentSlug;
  const responsavelNome = String(args.responsavel_nome ?? '').trim();
  if (!DEPARTMENT_ORDER.includes(departamento))
    return { error: `departamento inválido: ${departamento}` };
  if (!responsavelNome) return { error: 'responsavel_nome é obrigatório' };

  // Gate: identificação primeiro (mesma regra do formulário)
  if (
    departamento !== 'identificacao' &&
    ctx.session.status_identificacao !== 'concluido'
  ) {
    return {
      error:
        'A Identificação precisa ser concluída antes das outras etapas. Conclua-a primeiro.',
    };
  }

  // Gate determinístico: obrigatórias visíveis respondidas
  const missing = missingRequired(departamento, ctx.answers);
  if (missing.length) {
    return {
      error: 'Ainda há perguntas obrigatórias pendentes neste departamento.',
      pendentes: missing.map((q) => ({ pergunta_id: q.id, pergunta: q.pergunta })),
    };
  }

  const nowIso = new Date().toISOString();
  const updateCols: Record<string, unknown> = {
    [`status_${departamento}`]: 'concluido',
    [`responsavel_${departamento}`]: responsavelNome,
    [`concluido_${departamento}_at`]: nowIso,
  };
  const { error } = await ctx.supabase
    .from('onboarding_sessions')
    .update(updateCols)
    .eq('id', ctx.session.id);
  if (error) return { error: `falha ao concluir: ${error.message}` };
  Object.assign(ctx.session, updateCols);

  // Side-effects do fluxo oficial (mesmos do formulário, disparados server-side)
  const sessionId = ctx.session.id as string;
  if (departamento === 'identificacao') {
    firePost(ctx, '/api/provision-tenant', {
      sessionId,
      cnpj: ctx.answers.cnpj,
      razao_social: ctx.answers.razao_social,
      nome_fantasia: ctx.answers.nome_fantasia,
      responsavel_nome: ctx.answers.responsavel_nome,
      responsavel_cpf: ctx.answers.responsavel_cpf,
      admin_email: ctx.answers.admin_email,
      whatsapp_business: ctx.answers.whatsapp_business,
      numero_assinantes: ctx.answers.numero_assinantes,
    });
  } else {
    firePost(ctx, '/api/sync-department', { sessionId, departamento });
  }

  // Email de notificação com respostas do departamento (sem credenciais)
  const { data: deptRows } = await ctx.supabase
    .from('onboarding_respostas')
    .select('pergunta_id, valor')
    .eq('session_id', sessionId)
    .eq('departamento', departamento);
  const respostasSafe = Object.fromEntries(
    (deptRows ?? [])
      .filter((r) => !SENSITIVE_PREFIXES.some((p) => r.pergunta_id.startsWith(p)))
      .map((r) => [r.pergunta_id, r.valor])
  );
  firePost(ctx, '/api/send-email', {
    empresaNome: ctx.session.empresa_nome,
    departamento,
    departamentoNome: departamento,
    responsavelNome,
    respostas: respostasSafe,
    sessionId,
  });

  // Todos concluídos (conforme modo) → webhook final pro admin-pipeelo
  const modo = (ctx.session.modo as string) ?? 'completo';
  const required =
    modo === 'comercial'
      ? ['identificacao', 'vendas']
      : [...DEPARTMENT_ORDER];
  const allCompleted = required.every(
    (d) => ctx.session[`status_${d}`] === 'concluido'
  );
  if (allCompleted) {
    firePost(ctx, '/api/complete-onboarding', { sessionId });
  }

  // WhatsApp de conclusão + promoção pro board (mesma cadeia do formulário)
  void maybeNotifyOnboardingComplete(sessionId)
    .then((result) => {
      if ('sent' in result) {
        void maybePromoteToBoard(sessionId).catch((e) =>
          console.error('[agent/complete] promote-to-board:', e)
        );
      }
    })
    .catch((e) => console.error('[agent/complete] whatsapp-notify:', e));

  return {
    ok: true,
    departamento_concluido: departamento,
    todos_concluidos: allCompleted,
  };
}
