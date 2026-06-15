import { describe, it, expect } from 'vitest';
import { buildIntegrationRequestMessage, PIPEELO_WHITELIST_IPS } from './integration-request';

/**
 * Fake mínimo do SupabaseClient: dispatcha por nome de tabela.
 *   - onboarding_sessions: .select().eq().maybeSingle() → { data: session }
 *   - onboarding_respostas: .select().eq() (thenable) → { data: respostas }
 */
function fakeSupabase(session: Record<string, unknown> | null, respostas: Record<string, string>) {
  const respostasRows = Object.entries(respostas).map(([pergunta_id, valor]) => ({ pergunta_id, valor }));

  return {
    from(table: string) {
      if (table === 'onboarding_sessions') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: session, error: null }),
            }),
          }),
        };
      }
      // onboarding_respostas — select().eq() resolve direto (thenable)
      return {
        select: () => ({
          eq: () => Promise.resolve({ data: respostasRows, error: null }),
        }),
      };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe('buildIntegrationRequestMessage', () => {
  it('retorna null em modo comercial', async () => {
    const sb = fakeSupabase({ erp: 'IXC' }, {});
    expect(await buildIntegrationRequestMessage(sb, 's1', 'comercial')).toBeNull();
  });

  it('retorna null quando nenhum sistema está integrado', async () => {
    const sb = fakeSupabase({ erp: null, mapas: null, gerenciamento_rede: null, gateway_pagamento: null }, {});
    expect(await buildIntegrationRequestMessage(sb, 's1', 'completo')).toBeNull();
  });

  it('caso Iron: ERP IXC + gerenciador de rede OLT Cloud — pede whitelist nos DOIS', async () => {
    const sb = fakeSupabase(
      { erp: 'IXC', gerenciamento_rede: 'OLT Cloud', mapas: null, gateway_pagamento: null },
      {
        erp_ixc_url: 'https://ixc.iron.com.br',
        erp_ixc_userid: '12',
        erp_ixc_token: 'tok',
        rede_oltcloud_url: 'https://olt.iron.com.br',
        rede_oltcloud_usuario: 'admin',
        rede_oltcloud_senha: 'secret',
      }
    );
    const msg = await buildIntegrationRequestMessage(sb, 's1', 'completo');
    expect(msg).toBeTruthy();
    // Whitelist cobre ERP E rede
    expect(msg).toContain('*IXC* (ERP)');
    expect(msg).toContain('*OLT Cloud* (gerenciador de rede)');
    for (const ip of PIPEELO_WHITELIST_IPS) expect(msg).toContain(ip);
    // Sem credenciais faltando
    expect(msg).toContain('Já recebemos todas as credenciais');
    expect(msg).not.toContain('faltaram no formulário');
    // Cliente de bancada referencia o ERP
    expect(msg).toContain('cliente de bancada* pra testes no IXC');
  });

  it('lista credenciais faltantes por sistema (rede e mapas inclusos)', async () => {
    const sb = fakeSupabase(
      { erp: 'IXC', gerenciamento_rede: 'OLT Cloud', mapas: 'OZMap', gateway_pagamento: '7AZ (Bemobi)' },
      {
        erp_ixc_url: 'https://ixc',
        erp_ixc_userid: '1',
        erp_ixc_token: 't',
        // OLT Cloud: faltando senha
        rede_oltcloud_url: 'https://olt',
        rede_oltcloud_usuario: 'admin',
        // OZMap: faltando token + senha
        mapas_ozmap_url: 'https://oz',
        mapas_ozmap_usuario: 'u',
        // 7AZ: token faltando
      }
    );
    const msg = await buildIntegrationRequestMessage(sb, 's1', 'completo');
    expect(msg).toContain('faltaram no formulário');
    expect(msg).toContain('*OLT Cloud* — Senha');
    expect(msg).toContain('*OZMap* — Token + Senha');
    expect(msg).toContain('*7AZ* — Token de API');
    // 7AZ entra na whitelist
    expect(msg).toContain('*7AZ* (gateway de pagamento)');
  });

  it('confirma o CPF do cliente de bancada quando preenchido no formulário', async () => {
    const sb = fakeSupabase(
      { erp: 'IXC', gerenciamento_rede: null, mapas: null, gateway_pagamento: null },
      {
        erp_ixc_url: 'u',
        erp_ixc_userid: '1',
        erp_ixc_token: 't',
        cliente_teste_cpf: '123.456.789-00',
      }
    );
    const msg = await buildIntegrationRequestMessage(sb, 's1', 'completo');
    expect(msg).toContain('cliente de bancada');
    expect(msg).toContain('123.456.789-00');
    // não deve pedir pra providenciar quando já temos o CPF
    expect(msg).not.toContain('Pode ser um CPF real ou fictício');
  });

  it('pede o cliente de bancada quando o CPF não veio no formulário', async () => {
    const sb = fakeSupabase(
      { erp: 'IXC', gerenciamento_rede: null, mapas: null, gateway_pagamento: null },
      { erp_ixc_url: 'u', erp_ixc_userid: '1', erp_ixc_token: 't' }
    );
    const msg = await buildIntegrationRequestMessage(sb, 's1', 'completo');
    expect(msg).toContain('cliente de bancada');
    expect(msg).toContain('Pode ser um CPF real ou fictício');
  });

  it('usa o nome custom quando o sistema é "Outros"', async () => {
    const sb = fakeSupabase(
      { erp: 'Outros', gerenciamento_rede: 'Outros', mapas: null, gateway_pagamento: null },
      { erp_outros_nome: 'Sistema XPTO', rede_outros_nome: 'Mikrotik' }
    );
    const msg = await buildIntegrationRequestMessage(sb, 's1', 'completo');
    expect(msg).toContain('*Sistema XPTO* (ERP)');
    expect(msg).toContain('*Mikrotik* (gerenciador de rede)');
  });

  it('gateway "Outros": usa o nome real do Financeiro (ex: Iugu) sem duplicar categoria', async () => {
    const sb = fakeSupabase(
      { erp: null, gerenciamento_rede: null, mapas: null, gateway_pagamento: 'Outros' },
      { gateway_pagamento: 'iugu' }
    );
    const msg = await buildIntegrationRequestMessage(sb, 's1', 'completo');
    expect(msg).toContain('*Iugu* (gateway de pagamento)');
    // sem o nome genérico duplicado
    expect(msg).not.toContain('(gateway de pagamento) (gateway de pagamento)');
  });

  it('gateway integrado ao ERP não entra na whitelist', async () => {
    const sb = fakeSupabase(
      { erp: 'IXC', gerenciamento_rede: null, mapas: null, gateway_pagamento: 'Outros' },
      { gateway_pagamento: 'integrado_erp', erp_ixc_url: 'u', erp_ixc_userid: '1', erp_ixc_token: 't' }
    );
    const msg = await buildIntegrationRequestMessage(sb, 's1', 'completo');
    expect(msg).not.toContain('gateway de pagamento');
  });

  it('fallback: sessão antiga sem coluna erp usa resposta erp_utilizado', async () => {
    const sb = fakeSupabase(
      { erp: null, gerenciamento_rede: null, mapas: null, gateway_pagamento: null },
      { erp_utilizado: 'ixc', erp_ixc_url: 'https://ixc', erp_ixc_userid: '1', erp_ixc_token: 't' }
    );
    const msg = await buildIntegrationRequestMessage(sb, 's1', 'completo');
    expect(msg).toContain('*IXC* (ERP)');
  });
});
