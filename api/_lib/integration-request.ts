/**
 * Mensagem de "próximo passo da implantação" enviada logo após a notificação
 * de conclusão do onboarding (modo completo).
 *
 * Pede ao cliente o que NÃO dá pra resolver do nosso lado:
 *   1. Liberação dos IPs da Pipeelo no ERP (e no 7AZ, se for o gateway)
 *   2. Cliente de testes no ERP
 *   3. Credenciais que faltaram no formulário (condicional)
 *
 * Montada dinamicamente a partir das respostas da sessão — ERP utilizado,
 * gateway de pagamento e presença/ausência de cada credencial.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export const PIPEELO_WHITELIST_IPS = ['154.53.42.153', '3.220.83.179', '35.168.169.27'];

const ERP_LABELS: Record<string, string> = {
  ixc: 'IXC',
  mk_solutions: 'MK Solutions',
  voalle: 'Voalle',
  hubsoft: 'HUBSOFT',
  topsapp: 'TopSapp',
  sgp: 'SGP',
  integrator: 'Integrator',
};

/** Credenciais exigidas por ERP: pergunta_id (identificacao) → rótulo humano. */
const ERP_CREDENTIALS: Record<string, Array<{ id: string; label: string }>> = {
  ixc: [
    { id: 'erp_ixc_url', label: 'URL da API' },
    { id: 'erp_ixc_token', label: 'Token de autenticação (gerado em *Configurações → Integrações → API* dentro do IXC)' },
  ],
  mk_solutions: [
    { id: 'erp_mk_url', label: 'URL da API' },
    { id: 'erp_mk_token', label: 'Token' },
    { id: 'erp_mk_senha', label: 'Senha' },
  ],
  voalle: [
    { id: 'erp_voalle_url', label: 'URL' },
    { id: 'erp_voalle_client_id', label: 'Client ID' },
    { id: 'erp_voalle_client_secret', label: 'Client Secret' },
    { id: 'erp_voalle_syndata', label: 'Syndata' },
  ],
};

/** ERPs sem campos dedicados no formulário caem nos campos "outros". */
const ERP_CREDENTIALS_OUTROS: Array<{ id: string; label: string }> = [
  { id: 'erp_outros_url', label: 'URL da API' },
  { id: 'erp_outros_token', label: 'Token / API Key' },
];

function asText(valor: unknown): string {
  if (typeof valor === 'string') return valor.trim();
  return '';
}

/**
 * Monta a mensagem de pedido de integração. Retorna null quando não se
 * aplica (modo comercial — sem integração ERP — ou sessão sem resposta de ERP).
 */
export async function buildIntegrationRequestMessage(
  supabase: SupabaseClient,
  sessionId: string,
  modo: 'completo' | 'comercial' | null
): Promise<string | null> {
  if ((modo ?? 'completo') === 'comercial') return null;

  const { data, error } = await supabase
    .from('onboarding_respostas')
    .select('pergunta_id, valor')
    .eq('session_id', sessionId);
  if (error || !data) return null;

  const respostas = new Map<string, string>();
  for (const r of data) respostas.set(r.pergunta_id, asText(r.valor));

  const erpValue = respostas.get('erp_utilizado') ?? '';
  if (!erpValue) return null;

  const erpNomeOutro =
    respostas.get('erp_outros_nome') || respostas.get('erp_outro_nome') || 'ERP';
  const erpLabel = ERP_LABELS[erpValue] ?? erpNomeOutro;

  const usa7az = (respostas.get('gateway_pagamento') ?? '') === '7az';

  // Credenciais faltantes por sistema
  const faltantes: Array<{ sistema: string; itens: string[] }> = [];

  const erpCreds = ERP_CREDENTIALS[erpValue] ?? ERP_CREDENTIALS_OUTROS;
  const erpFaltando = erpCreds.filter((c) => !respostas.get(c.id)).map((c) => c.label);
  if (erpFaltando.length > 0) faltantes.push({ sistema: erpLabel, itens: erpFaltando });

  if (usa7az && !respostas.get('gateway_7az_token')) {
    faltantes.push({ sistema: '7AZ (Bemobi)', itens: ['Token de API (gerado dentro do painel do 7AZ)'] });
  }

  const sistemasWhitelist = usa7az ? `*${erpLabel}* e no *7AZ*` : `*${erpLabel}*`;
  const totalItens = faltantes.length > 0 ? 'três' : 'duas';

  const credenciaisOk =
    faltantes.length === 0
      ? `Já recebemos as credenciais do ${erpLabel}${usa7az ? ' e do 7AZ' : ''} pelo formulário — tudo certo do nosso lado. ✅\n\n`
      : '';

  const itemCredenciais =
    faltantes.length > 0
      ? `\n\n*3.* *Credenciais que faltaram no formulário:*\n${faltantes
          .map((f) => `   • *${f.sistema}* — ${f.itens.join(' + ')}`)
          .join('\n')}`
      : '';

  return `Próximo passo da implantação 👇

${credenciaisOk}Antes do nosso time iniciar a integração, precisamos de ${totalItens} coisas do lado de vocês:

*1.* Liberação dos seguintes IPs no ${sistemasWhitelist} (whitelist da API):
${PIPEELO_WHITELIST_IPS.map((ip) => `\`${ip}\``).join('\n')}

*2.* Um *cliente de testes* no ${erpLabel} com ONU configurada, contratos e mensalidades — pra validarmos consulta de fatura, status de conexão e geração de 2ª via direto no WhatsApp antes de subir em produção.${itemCredenciais}

Assim que isso estiver pronto, me dá um retorno aqui que seguimos com a ativação. 🚀`;
}
