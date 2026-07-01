/**
 * Blueprint do questionário para o agente de onboarding V2.
 *
 * Lê o `src/lib/questions.json` (mesma fonte de verdade do formulário) e
 * produz: (1) índice de perguntas para validação das tools; (2) bloco
 * `<session_context>` renderizado para a 1ª user message do agente, com o
 * estado VIVO da sessão (respondido/pendente/condicional).
 */
import onboardingData from '../../../src/lib/questions.json';
import { evaluateConditional } from './conditional';

export interface BlueprintQuestion {
  id: string;
  pergunta: string;
  tipo: string;
  obrigatoria: boolean;
  opcoes?: Array<{ value: string; label: string }>;
  hint?: string;
  texto?: string;
  condicional?: string;
  campos?: Array<{
    id: string;
    label: string;
    tipo: string;
    obrigatoria?: boolean;
    opcoes?: Array<{ value: string; label: string }>;
  }>;
  rotulo_item?: string;
  minimo?: number;
  maximo?: number;
}

interface BlueprintSection {
  key: string;
  titulo: string;
  descricao?: string;
  condicional_secao?: string;
  perguntas: BlueprintQuestion[];
}

interface BlueprintDepartment {
  slug: string;
  nome: string;
  descricao: string;
  ordem: number;
  secoes: BlueprintSection[];
}

export const DEPARTMENT_ORDER = [
  'identificacao',
  'sac_geral',
  'financeiro',
  'suporte',
  'vendas',
] as const;
export type DepartmentSlug = (typeof DEPARTMENT_ORDER)[number];

type SessionRow = Record<string, unknown>;
type AnswerMap = Record<string, unknown>;

const departments: BlueprintDepartment[] = (() => {
  const out: BlueprintDepartment[] = [];
  const deps = (onboardingData as { departamentos: Record<string, unknown> }).departamentos;
  for (const [slug, raw] of Object.entries(deps)) {
    const d = raw as {
      nome: string;
      descricao: string;
      ordem_execucao: number;
      secoes: Record<string, { titulo: string; descricao?: string; condicional_secao?: string; perguntas: BlueprintQuestion[] }>;
    };
    out.push({
      slug,
      nome: d.nome,
      descricao: d.descricao,
      ordem: d.ordem_execucao,
      secoes: Object.entries(d.secoes).map(([key, s]) => ({
        key,
        titulo: s.titulo,
        descricao: s.descricao,
        condicional_secao: s.condicional_secao,
        perguntas: s.perguntas,
      })),
    });
  }
  out.sort((a, b) => a.ordem - b.ordem);
  return out;
})();

/** Índice global pergunta_id → { question, departamento } */
const questionIndex: Map<string, { question: BlueprintQuestion; departamento: string }> = (() => {
  const idx = new Map<string, { question: BlueprintQuestion; departamento: string }>();
  for (const dep of departments) {
    for (const sec of dep.secoes) {
      for (const q of sec.perguntas) {
        idx.set(q.id, { question: q, departamento: dep.slug });
      }
    }
  }
  return idx;
})();

export function findQuestion(perguntaId: string) {
  return questionIndex.get(perguntaId) ?? null;
}

/** Pseudo-campos `_session_*` injetados nos condicionais (espelha o form). */
export function pseudoFields(session: SessionRow): AnswerMap {
  return {
    _session_erp: (session.erp as string) ?? '',
    _session_mapas: (session.mapas as string) ?? '',
    _session_gerenciamento_rede: (session.gerenciamento_rede as string) ?? '',
    _session_gateway_pagamento: (session.gateway_pagamento as string) ?? '',
    _session_modo: (session.modo as string) ?? 'completo',
  };
}

export function buildAnswerMap(
  respostas: Array<{ pergunta_id: string; valor: unknown }>,
  session: SessionRow
): AnswerMap {
  const map: AnswerMap = { ...pseudoFields(session) };
  for (const r of respostas) map[r.pergunta_id] = r.valor;
  return map;
}

function isAnswered(valor: unknown): boolean {
  return valor !== undefined && valor !== null && valor !== '';
}

/** Perguntas visíveis (condicionais ativas) de um departamento. */
export function visibleQuestions(
  departamento: string,
  answers: AnswerMap
): BlueprintQuestion[] {
  const dep = departments.find((d) => d.slug === departamento);
  if (!dep) return [];
  const out: BlueprintQuestion[] = [];
  for (const sec of dep.secoes) {
    if (sec.condicional_secao && !evaluateConditional(sec.condicional_secao, answers)) continue;
    for (const q of sec.perguntas) {
      if (q.condicional && !evaluateConditional(q.condicional, answers)) continue;
      out.push(q);
    }
  }
  return out;
}

/** Obrigatórias visíveis ainda sem resposta (gate de complete_department). */
export function missingRequired(
  departamento: string,
  answers: AnswerMap
): BlueprintQuestion[] {
  return visibleQuestions(departamento, answers).filter(
    (q) =>
      q.obrigatoria &&
      q.tipo !== 'info' &&
      q.tipo !== 'info_link' &&
      !isAnswered(answers[q.id])
  );
}

function shortJson(v: unknown, max = 220): string {
  let s: string;
  if (typeof v === 'string') s = v;
  else s = JSON.stringify(v);
  if (s == null) return 'null';
  return s.length > max ? s.slice(0, max) + '…' : s;
}

const VALUE_SHAPE_HINTS: Record<string, string> = {
  checkbox_multiple: 'valor = {"selected": ["v1","v2"], "outroTexto": "..."} (outroTexto só se marcar "outro")',
  horario_semanal:
    'valor = {"segunda_sexta": {"inicio":"08:00","fim":"18:00","nao_atende":false}, "sabado": {...}, "domingo_feriado": {...}}',
  repeater: 'valor = array de objetos com os campos listados',
  boolean: 'valor = true|false',
};

function renderQuestionLine(q: BlueprintQuestion, answers: AnswerMap): string {
  if (q.tipo === 'info' || q.tipo === 'info_link') return '';
  const flags = [q.tipo, q.obrigatoria ? 'OBRIGATÓRIA' : 'opcional'].join(', ');
  let line = `  - ${q.id} [${flags}] "${q.pergunta}"`;
  if (q.opcoes?.length) {
    line += ` | opções: ${q.opcoes.map((o) => `${o.value}${o.label && o.label !== o.value ? ` (${o.label})` : ''}`).join(' | ')}`;
  }
  if (q.campos?.length) {
    line += ` | campos por item: ${q.campos
      .map((c) => `${c.id}${c.opcoes?.length ? `<${c.opcoes.map((o) => o.value).join('/')}>` : ''}`)
      .join(', ')}`;
  }
  const shape = VALUE_SHAPE_HINTS[q.tipo];
  if (shape) line += ` | ${shape}`;
  if (q.hint) line += ` | dica: ${q.hint}`;
  const valor = answers[q.id];
  line += isAnswered(valor) ? ` | RESPONDIDA: ${shortJson(valor)}` : ' | PENDENTE';
  return line;
}

/**
 * Bloco de contexto completo da sessão para a 1ª user message do agente.
 * Reconstruído FRESCO a cada request (estado vivo).
 */
export function renderSessionContext(
  session: SessionRow,
  respostas: Array<{ departamento: string; pergunta_id: string; valor: unknown }>,
  insights: Array<{ departamento: string | null; categoria: string; titulo: string; detalhe: string }>
): string {
  const answers = buildAnswerMap(respostas, session);
  const modo = (session.modo as string) ?? 'completo';
  const requiredDepts: string[] =
    modo === 'comercial' ? ['identificacao', 'vendas'] : [...DEPARTMENT_ORDER];

  const lines: string[] = [];
  lines.push('<session_context>');
  lines.push(`Empresa: ${session.empresa_nome ?? '?'}`);
  lines.push(`Modo do onboarding: ${modo} (departamentos exigidos: ${requiredDepts.join(', ')})`);
  lines.push(
    `Stack declarada: ERP=${session.erp || 'não informado'} | Mapas=${session.mapas || 'não informado'} | Gerência de rede=${session.gerenciamento_rede || 'não informado'} | Gateway pagamento=${session.gateway_pagamento || 'não informado'} | CRM contratado=${session.contratou_crm ? 'sim' : 'não'}`
  );
  lines.push('');
  lines.push('Status dos departamentos:');
  for (const dep of DEPARTMENT_ORDER) {
    const status = (session[`status_${dep}`] as string) || 'pendente';
    const exigido = requiredDepts.includes(dep) ? '' : ' (não exigido neste modo)';
    const missing = missingRequired(dep, answers);
    lines.push(
      `- ${dep}: ${status}${exigido}${status !== 'concluido' ? ` | obrigatórias pendentes: ${missing.length}` : ''}`
    );
  }

  for (const dep of departments) {
    if (!requiredDepts.includes(dep.slug)) continue;
    lines.push('');
    lines.push(`## Departamento: ${dep.nome} (slug: ${dep.slug})`);
    lines.push(`${dep.descricao}`);
    for (const sec of dep.secoes) {
      const secVisible = !sec.condicional_secao || evaluateConditional(sec.condicional_secao, answers);
      if (!secVisible) {
        lines.push(`### Seção "${sec.titulo}" — INATIVA (condição: ${sec.condicional_secao})`);
        continue;
      }
      lines.push(`### Seção: ${sec.titulo}${sec.descricao ? ` — ${sec.descricao}` : ''}`);
      for (const q of sec.perguntas) {
        const qVisible = !q.condicional || evaluateConditional(q.condicional, answers);
        if (!qVisible) {
          if (q.tipo !== 'info' && q.tipo !== 'info_link') {
            lines.push(`  - ${q.id} [condicional INATIVA: ${q.condicional}] "${q.pergunta}"`);
          }
          continue;
        }
        const line = renderQuestionLine(q, answers);
        if (line) lines.push(line);
      }
    }
  }

  lines.push('');
  if (insights.length) {
    lines.push('Insights já registrados nesta sessão (record_insight):');
    for (const i of insights) {
      lines.push(`- [${i.categoria}${i.departamento ? ` / ${i.departamento}` : ''}] ${i.titulo}: ${shortJson(i.detalhe, 300)}`);
    }
  } else {
    lines.push('Nenhum insight registrado ainda nesta sessão.');
  }
  lines.push('</session_context>');
  return lines.join('\n');
}
