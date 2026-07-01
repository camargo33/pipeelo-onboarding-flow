import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { invokeHandler } from '../tests/_helpers/handler';
import { makeSupabaseMock } from '../tests/_helpers/supabase-mock';

vi.mock('./_lib/supabase', () => ({
  requireSupabase: vi.fn(),
  getServiceSupabase: vi.fn(),
}));

vi.mock('./_lib/outbox', () => ({
  enqueueOutbox: vi.fn(),
  markInFlight: vi.fn(),
  markDelivered: vi.fn(),
  markFailedAttempt: vi.fn(),
  deliverOutbox: vi.fn(),
}));

import { requireSupabase } from './_lib/supabase';
import {
  enqueueOutbox,
  markInFlight,
  markDelivered,
  markFailedAttempt,
  deliverOutbox,
} from './_lib/outbox';
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

function makeOutboxRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'out_1',
    session_id: validSession.id,
    target_url: 'https://admin.test/api/clients/onboarding/create',
    payload: {} as never,
    status: 'pending' as const,
    attempt_count: 0,
    max_attempts: 6,
    last_error: null,
    next_retry_at: '2026-05-08T12:00:00Z',
    delivered_at: null,
    ...overrides,
  };
}

/** Cria mock do supabase roteando por tabela: sessions + respostas + agent_insights */
function setupSupabaseFor(session: any, respostas: any[] = [], agentInsights: any[] = []) {
  const sessionChain = makeSupabaseMock();
  sessionChain._chain.single = vi.fn(async () => ({ data: session, error: null }));

  const respostasChain = makeSupabaseMock();
  respostasChain._chain.eq = vi.fn(() =>
    Promise.resolve({ data: respostas, error: null }),
  );

  const insightsChain = makeSupabaseMock();
  insightsChain._chain.order = vi.fn(async () => ({ data: agentInsights, error: null }));

  const sb = {
    from: vi.fn((table: string) => {
      if (table === 'onboarding_sessions') return sessionChain._chain;
      if (table === 'onboarding_agent_insights') return insightsChain._chain;
      return respostasChain._chain;
    }),
  };
  (requireSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(sb);
}

describe('POST /api/complete-onboarding (Plan 02-02: outbox-first)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('PIPEELO_ADMIN_API_URL', 'https://admin.test');
    vi.stubEnv('PIPEELO_ADMIN_API_TOKEN', 'admin-token-x');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('happy path — outbox row criada ANTES do fetch + markDelivered chamado em sucesso', async () => {
    setupSupabaseFor(validSession, []);
    const callOrder: string[] = [];
    (enqueueOutbox as unknown as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callOrder.push('enqueueOutbox');
      return makeOutboxRow();
    });
    (markInFlight as unknown as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callOrder.push('markInFlight');
    });
    (deliverOutbox as unknown as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callOrder.push('deliverOutbox');
      return { ok: true, status: 200 };
    });
    (markDelivered as unknown as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callOrder.push('markDelivered');
    });

    const r = await invokeHandler(handler as never, {
      method: 'POST',
      body: { sessionId: validSession.id },
    });

    expect(r.statusCode).toBe(200);
    expect((r.body as { outbox_id: string }).outbox_id).toBe('out_1');
    expect(callOrder).toEqual(['enqueueOutbox', 'markInFlight', 'deliverOutbox', 'markDelivered']);
    expect(markFailedAttempt).not.toHaveBeenCalled();
  });

  it('idempotency hit — outbox já delivered → 200 sem fetch', async () => {
    setupSupabaseFor(validSession, []);
    (enqueueOutbox as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeOutboxRow({ status: 'delivered', delivered_at: '2026-05-08T12:01:00Z' }),
    );

    const r = await invokeHandler(handler as never, {
      method: 'POST',
      body: { sessionId: validSession.id },
    });

    expect(r.statusCode).toBe(200);
    expect((r.body as { idempotent_hit: boolean }).idempotent_hit).toBe(true);
    expect(markInFlight).not.toHaveBeenCalled();
    expect(deliverOutbox).not.toHaveBeenCalled();
    expect(markDelivered).not.toHaveBeenCalled();
  });

  it('falha inline — deliverOutbox 500 → 202 + markFailedAttempt chamado', async () => {
    setupSupabaseFor(validSession, []);
    (enqueueOutbox as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(makeOutboxRow());
    (markInFlight as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (deliverOutbox as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
      body: 'admin internal error',
    });
    (markFailedAttempt as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const r = await invokeHandler(handler as never, {
      method: 'POST',
      body: { sessionId: validSession.id },
    });

    expect(r.statusCode).toBe(202);
    expect((r.body as { queued_for_retry: boolean }).queued_for_retry).toBe(true);
    expect(markFailedAttempt).toHaveBeenCalledTimes(1);
    expect(markDelivered).not.toHaveBeenCalled();
    const failArgs = (markFailedAttempt as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(failArgs[0]).toBe('out_1');
    expect(failArgs[1]).toContain('500');
    expect(failArgs[2]).toBe(0); // attempt_count
    expect(failArgs[3]).toBe(6); // max_attempts
  });

  it('500 invalid_outbound_payload quando session sem cnpj — outbox NÃO é tocado', async () => {
    const semCnpj = { ...validSession, cnpj: null };
    setupSupabaseFor(semCnpj, []);

    const r = await invokeHandler(handler as never, {
      method: 'POST',
      body: { sessionId: validSession.id },
    });

    expect(r.statusCode).toBe(500);
    expect((r.body as { error: string }).error).toBe('invalid_outbound_payload');
    expect(enqueueOutbox).not.toHaveBeenCalled();
  });

  it('500 invalid_outbound_payload quando ceo_email inválido', async () => {
    const emailRuim = { ...validSession, ceo_email: 'nao-eh-email' };
    setupSupabaseFor(emailRuim, []);

    const r = await invokeHandler(handler as never, {
      method: 'POST',
      body: { sessionId: validSession.id },
    });

    expect(r.statusCode).toBe(500);
    expect((r.body as { error: string }).error).toBe('invalid_outbound_payload');
    expect(enqueueOutbox).not.toHaveBeenCalled();
  });

  it('200 com message quando departamentos não completos (early return — outbox não tocado)', async () => {
    const incompleto = { ...validSession, status_vendas: 'pendente' };
    setupSupabaseFor(incompleto, []);

    const r = await invokeHandler(handler as never, {
      method: 'POST',
      body: { sessionId: validSession.id },
    });

    expect(r.statusCode).toBe(200);
    expect((r.body as { message: string }).message).toContain('complete');
    expect(enqueueOutbox).not.toHaveBeenCalled();
  });

  it('NÃO loga payload bruto / cnpj / email — só sessionId + issue paths', async () => {
    const semCnpj = { ...validSession, cnpj: null };
    setupSupabaseFor(semCnpj, []);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

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

  it('payload enviado pro outbox tem payload_version v1 + cnpj', async () => {
    setupSupabaseFor(validSession, []);
    let capturedPayload: unknown;
    (enqueueOutbox as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (args) => {
      capturedPayload = args.payload;
      return makeOutboxRow();
    });
    (markInFlight as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (deliverOutbox as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, status: 200 });
    (markDelivered as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    await invokeHandler(handler as never, {
      method: 'POST',
      body: { sessionId: validSession.id },
    });

    expect(capturedPayload).toMatchObject({
      payload_version: 'v1',
      session: { cnpj: VALID_CNPJ, id: validSession.id },
    });
  });
});
