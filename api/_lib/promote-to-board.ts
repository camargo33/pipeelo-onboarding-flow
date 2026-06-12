/**
 * Promove a sessão de onboarding pro client_board do admin-pipeelo (coluna
 * "Novo Cliente"). Chamado fire-and-forget pelo complete-department após o
 * envio da mensagem WhatsApp de conclusão.
 *
 * Idempotente via coluna `onboarding_sessions.card_created_at`. Se já está
 * marcada como criada, retorna `{ skipped, reason: 'already_created' }`.
 *
 * Requer:
 *   - PIPEELO_ADMIN_API_URL (default https://admin.pipeelo.com)
 *   - PIPEELO_ADMIN_ONBOARDING_TOKEN (mesmo ONBOARDING_WEBHOOK_TOKEN do admin)
 *   - session.tenant_id já provisionado (Identificação completa)
 */
import { getServiceSupabase } from './supabase';

const ADMIN_API_URL = process.env.PIPEELO_ADMIN_API_URL || 'https://admin.pipeelo.com';
const TOKEN = process.env.PIPEELO_ADMIN_ONBOARDING_TOKEN;

type SessionRow = {
  id: string;
  empresa_nome: string;
  tenant_id: string | null;
  modo: 'completo' | 'comercial' | null;
  card_created_at: string | null;
  erp: string | null;
  mapas: string | null;
  gerenciamento_rede: string | null;
  gateway_pagamento: string | null;
  slug: string;
  access_token: string | null;
};

type RespostaRow = {
  pergunta_id: string;
  valor: unknown;
};

/**
 * Mapeia (sistema → campos esperados na seção acessos_integracoes).
 * Espelha o que está em questions.json. Mudou lá? Mude aqui.
 */
const EXPECTED_FIELDS: Record<string, Record<string, string[]>> = {
  erp: {
    IXC: ['erp_ixc_url', 'erp_ixc_userid', 'erp_ixc_token'],
    'MK Solution': ['erp_mk_url', 'erp_mk_token', 'erp_mk_senha'],
    Voalle: [
      'erp_voalle_url',
      'erp_voalle_client_id',
      'erp_voalle_client_secret',
      'erp_voalle_syndata',
    ],
    Hubsoft: [
      'erp_hubsoft_url',
      'erp_hubsoft_usuario',
      'erp_hubsoft_senha',
      'erp_hubsoft_client_id',
      'erp_hubsoft_client_secret',
    ],
    SGP: ['erp_sgp_url', 'erp_sgp_token', 'erp_sgp_app'],
    RBX: ['erp_rbx_url', 'erp_rbx_token', 'erp_rbx_usuario', 'erp_rbx_senha'],
    'Topp Sap': ['erp_outros_url', 'erp_outros_token', 'erp_outros_usuario', 'erp_outros_senha'],
    Outros: ['erp_outros_nome', 'erp_outros_url', 'erp_outros_token'],
  },
  gateway_pagamento: {
    '7AZ (Bemobi)': ['gateway_7az_token'],
    Outros: ['gateway_outros_nome', 'gateway_outros_token'],
  },
  gerenciamento_rede: {
    'OLT Cloud': ['rede_oltcloud_url', 'rede_oltcloud_usuario', 'rede_oltcloud_senha'],
    Anlix: ['rede_anlix_url', 'rede_anlix_usuario', 'rede_anlix_senha'],
    'Smart OLT': ['rede_smartolt_url', 'rede_smartolt_usuario', 'rede_smartolt_senha'],
    'Made 4 Graph': [
      'rede_made4graph_url',
      'rede_made4graph_email',
      'rede_made4graph_senha',
      'rede_made4graph_token',
    ],
    Outros: ['rede_outros_nome', 'rede_outros_url', 'rede_outros_usuario', 'rede_outros_senha'],
  },
  mapas: {
    Geogrid: ['mapas_geogrid_url', 'mapas_geogrid_token'],
    Geosite: ['mapas_geosite_usuario', 'mapas_geosite_senha'],
    OZMap: ['mapas_ozmap_url', 'mapas_ozmap_token', 'mapas_ozmap_usuario', 'mapas_ozmap_senha'],
    Outros: ['mapas_outros_nome', 'mapas_outros_url', 'mapas_outros_token'],
  },
};

function buildDescription(s: SessionRow, respostas: RespostaRow[]): string {
  const got = new Set(
    respostas
      .filter((r) => r.valor !== null && r.valor !== '' && r.valor !== undefined)
      .map((r) => r.pergunta_id)
  );

  const lines: string[] = [];
  lines.push(`**${s.empresa_nome}**`);
  lines.push('');
  lines.push(`- Modo: ${s.modo === 'comercial' ? 'Comercial (CRM-only)' : 'Completo (Pipeelo Core)'}`);

  const stackParts = [
    s.erp && `ERP=${s.erp}`,
    s.gateway_pagamento && `Gateway=${s.gateway_pagamento}`,
    s.gerenciamento_rede && `Rede=${s.gerenciamento_rede}`,
    s.mapas && `Mapas=${s.mapas}`,
  ].filter(Boolean);
  if (stackParts.length) lines.push(`- Stack: ${stackParts.join(' · ')}`);

  // Credenciais faltantes por sistema
  const faltando: string[] = [];
  for (const [field, system] of [
    ['erp', s.erp],
    ['gateway_pagamento', s.gateway_pagamento],
    ['gerenciamento_rede', s.gerenciamento_rede],
    ['mapas', s.mapas],
  ] as const) {
    if (!system) continue;
    const expected = EXPECTED_FIELDS[field]?.[system] ?? [];
    const missing = expected.filter((f) => !got.has(f));
    if (missing.length) faltando.push(`${system}: ${missing.join(', ')}`);
  }

  if (faltando.length) {
    lines.push('');
    lines.push('**⚠️ Credenciais faltantes (cobrar do cliente):**');
    for (const f of faltando) lines.push(`- ${f}`);
  } else if (stackParts.length) {
    lines.push('');
    lines.push('✅ Todas as credenciais da stack foram preenchidas no formulário.');
  }

  // Link da sessão pro time de implantação
  if (s.access_token) {
    lines.push('');
    lines.push(
      `[Abrir formulário do cliente](https://onboarding.pipeelo.com/${s.slug}?token=${s.access_token})`
    );
  }

  return lines.join('\n');
}

export class PromoteToBoardConfigError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'PromoteToBoardConfigError';
  }
}

export async function maybePromoteToBoard(
  sessionId: string
): Promise<
  | { promoted: true; column_id: string; already_on_board: boolean }
  | { skipped: true; reason: string }
> {
  if (!TOKEN) {
    throw new PromoteToBoardConfigError(
      'PIPEELO_ADMIN_ONBOARDING_TOKEN ausente — não posso promover card sem auth cross-service'
    );
  }

  const supabase = getServiceSupabase();
  const { data: session, error } = await supabase
    .from('onboarding_sessions')
    .select(
      'id, empresa_nome, tenant_id, modo, card_created_at, erp, mapas, gerenciamento_rede, gateway_pagamento, slug, access_token'
    )
    .eq('id', sessionId)
    .maybeSingle<SessionRow>();

  if (error || !session) return { skipped: true, reason: 'session_not_found' };
  if (session.card_created_at) return { skipped: true, reason: 'already_created' };
  if (!session.tenant_id) return { skipped: true, reason: 'tenant_not_provisioned' };

  const { data: respostas } = await supabase
    .from('onboarding_respostas')
    .select('pergunta_id, valor')
    .eq('session_id', sessionId)
    .returns<RespostaRow[]>();

  const description = buildDescription(session, respostas ?? []);

  // Marca ANTES de chamar a API pra evitar dupla criação em race.
  const { error: markErr } = await supabase
    .from('onboarding_sessions')
    .update({ card_created_at: new Date().toISOString() })
    .eq('id', sessionId)
    .is('card_created_at', null);
  if (markErr) return { skipped: true, reason: `mark_failed: ${markErr.message}` };

  try {
    const r = await fetch(`${ADMIN_API_URL.replace(/\/+$/, '')}/api/clients/onboarding/promote-to-board`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tenantId: session.tenant_id,
        description,
      }),
    });
    if (!r.ok) {
      const text = await r.text();
      // Rollback do marker pra permitir retry depois.
      await supabase
        .from('onboarding_sessions')
        .update({ card_created_at: null })
        .eq('id', sessionId);
      return { skipped: true, reason: `admin_http_${r.status}: ${text.slice(0, 200)}` };
    }
    const data = (await r.json()) as { column_id: string; already_on_board: boolean };
    return { promoted: true, column_id: data.column_id, already_on_board: data.already_on_board };
  } catch (e) {
    // Network/runtime — rollback marker pra retry futuro.
    await supabase
      .from('onboarding_sessions')
      .update({ card_created_at: null })
      .eq('id', sessionId);
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[promote-to-board] erro:', msg);
    return { skipped: true, reason: `network_error: ${msg}` };
  }
}
