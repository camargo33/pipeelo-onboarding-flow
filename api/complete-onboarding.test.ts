import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { invokeHandler } from '../tests/_helpers/handler';
import { makeSupabaseMock } from '../tests/_helpers/supabase-mock';

vi.mock('./_lib/supabase', () => ({
  requireSupabase: vi.fn(),
  getServiceSupabase: vi.fn(),
}));

import { requireSupabase } from './_lib/supabase';
import handler from './complete-onboarding';

const VALID_CNPJ = '11222333000181';

const validSession = {
  id: 'sess_abc_123',
  empresa_nome: 'ISP Teste',
  ceo_email: 'ceo@isp.com',
  cnpj: VALID_CNPJ,
  created_at: '2026-05-08T12:00:00Z',
  access_token: 'tok-x',
  tenant_id: null,
  pipeelo_token: null,
  status_sac_geral: 'concluido',
  status_financeiro: 'concluido',
  status_suporte: 'concluido',
  status_vendas: 'concluido',
  responsavel_sac_geral: 'João',
  responsavel_financeiro: 'Maria',
  responsavel_suporte: 'José',
  responsavel_vendas: 'Ana',
  concluido_sac_geral_at: '2026-05-08T11:00:00Z',
  concluido_financeiro_at: '2026-05-08T11:10:00Z',
  concluido_suporte_at: '2026-05-08T11:20:00Z',
  concluido_vendas_at: '2026-05-08T11:30:00Z',
};

/** Cria mock do supabase com dois `from()` calls: sessions + respostas */
function setupSupabaseFor(session: any, respostas: any[] = []) {
  const sessionChain = makeSupabaseMock();
  sessionChain._chain.single = vi.fn(async () => ({ data: session, error: null }));

  const respostasChain = makeSupabaseMock();
  // .eq() já retorna a chain; chamando o resultado como `await chain.eq(...)` precisa
  // ser thenable. Ajustamos `.eq` pra retornar a array de respostas direto via
  // override que torna o chain thenable.
  respostasChain._chain.eq = vi.fn(() =>
    Promise.resolve({ data: respostas, error: null }),
  );

  let callIndex = 0;
  const sb = {
    from: vi.fn(() => {
      callIndex++;
      return callIndex === 1 ? sessionChain._chain : respostasChain._chain;
    }),
  };
  (requireSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(sb);
}

describe('POST /api/complete-onboarding (Plan 02-01: contract-first)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('PIPEELO_ADMIN_API_URL', 'https://admin.test');
    vi.stubEnv('PIPEELO_ADMIN_API_TOKEN', 'admin-token-x');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('happy path — POSTa pro admin com payload validado + payload_version v1 + Idempotency-Key', async () => {
    setupSupabaseFor(validSession, []);
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const r = await invokeHandler(handler as never, {
      method: 'POST',
      body: { sessionId: validSession.id },
    });

    expect(r.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://admin.test/api/clients/onboarding/create');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['Idempotency-Key']).toBe(validSession.id);
    expect(headers['Authorization']).toBe('Bearer admin-token-x');
    const sentPayload = JSON.parse((init as RequestInit).body as string);
    expect(sentPayload.payload_version).toBe('v1');
    expect(sentPayload.session.cnpj).toBe(VALID_CNPJ);
  });

  it('500 invalid_outbound_payload quando session sem cnpj', async () => {
    const semCnpj = { ...validSession, cnpj: null };
    setupSupabaseFor(semCnpj, []);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const r = await invokeHandler(handler as never, {
      method: 'POST',
      body: { sessionId: validSession.id },
    });

    expect(r.statusCode).toBe(500);
    expect((r.body as { error: string }).error).toBe('invalid_outbound_payload');
    expect(Array.isArray((r.body as { issues: unknown[] }).issues)).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('500 invalid_outbound_payload quando ceo_email inválido', async () => {
    const emailRuim = { ...validSession, ceo_email: 'nao-eh-email' };
    setupSupabaseFor(emailRuim, []);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const r = await invokeHandler(handler as never, {
      method: 'POST',
      body: { sessionId: validSession.id },
    });

    expect(r.statusCode).toBe(500);
    expect((r.body as { error: string }).error).toBe('invalid_outbound_payload');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('502 admin_webhook_failed quando admin retorna 400', async () => {
    setupSupabaseFor(validSession, []);
    const fetchMock = vi.fn(async () =>
      new Response('{"error":"invalid_payload"}', { status: 400 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const r = await invokeHandler(handler as never, {
      method: 'POST',
      body: { sessionId: validSession.id },
    });

    expect(r.statusCode).toBe(502);
    expect((r.body as { error: string }).error).toBe('admin_webhook_failed');
    expect((r.body as { status: number }).status).toBe(400);
  });

  it('200 com message quando departamentos não completos (early return)', async () => {
    const incompleto = { ...validSession, status_vendas: 'pendente' };
    setupSupabaseFor(incompleto, []);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const r = await invokeHandler(handler as never, {
      method: 'POST',
      body: { sessionId: validSession.id },
    });

    expect(r.statusCode).toBe(200);
    expect((r.body as { message: string }).message).toContain('complete');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('NÃO loga payload bruto / cnpj / email — só sessionId + issue paths', async () => {
    const semCnpj = { ...validSession, cnpj: null };
    setupSupabaseFor(semCnpj, []);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn());

    await invokeHandler(handler as never, {
      method: 'POST',
      body: { sessionId: validSession.id },
    });

    const loggedArgs = errorSpy.mock.calls.flat();
    const serialized = JSON.stringify(loggedArgs);
    expect(serialized).toContain(validSession.id);
    expect(serialized).not.toContain('ceo@isp.com');
    expect(serialized).not.toContain(VALID_CNPJ);
  });
});
