import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invokeHandler } from '../../../tests/_helpers/handler';
import { makeSupabaseMock } from '../../../tests/_helpers/supabase-mock';

vi.mock('../../_lib/supabase', () => ({
  getServiceSupabase: vi.fn(),
  requireSupabase: vi.fn(),
}));

vi.mock('../../_lib/email-sender', () => ({
  sendTransactionalEmail: vi.fn(async () => ({ skipped: false, resend_id: 'r' })),
}));

import { getServiceSupabase } from '../../_lib/supabase';
import { sendTransactionalEmail } from '../../_lib/email-sender';
import handler from '../reminder-stalled';

function makeStaleSession(id: string, hoursAgo = 50, ceoEmail: string | null = `c${id}@test.com`) {
  return {
    id,
    slug: `slug-${id}`,
    access_token: `tok-${id}`,
    ceo_email: ceoEmail,
    ceo_nome: `CEO ${id}`,
    empresa_nome: `Empresa ${id}`,
    departamento_atual: 'Suporte',
    last_activity_at: new Date(Date.now() - hoursAgo * 3600_000).toISOString(),
  };
}

describe('GET /api/cron/reminder-stalled', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'cron-sekret';
    process.env.PUBLIC_APP_URL = 'https://onboarding.pipeelo.com';
  });

  it('401 sem Bearer CRON_SECRET', async () => {
    const r = await invokeHandler(handler as never, {
      method: 'GET',
      headers: { authorization: 'Bearer wrong' },
    });
    expect(r.statusCode).toBe(401);
  });

  it('processa N sessões stale, 1 sendTransactionalEmail por sessão com keys distintas', async () => {
    const sessions = [
      makeStaleSession('s1', 50),
      makeStaleSession('s2', 60),
      makeStaleSession('s3', 72),
    ];

    const m = makeSupabaseMock();
    // Cron handler usa .lt() .not() .order() .limit() — completa o chain.
    m._chain.lt = vi.fn(() => m._chain);
    m._chain.not = vi.fn(() => m._chain);
    m._chain.order = vi.fn(() => m._chain);
    m._chain.limit = vi.fn(async () => ({ data: sessions, error: null }));
    (getServiceSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(m);

    const r = await invokeHandler(handler as never, {
      method: 'GET',
      headers: { authorization: 'Bearer cron-sekret' },
    });

    expect(r.statusCode).toBe(200);
    expect((r.body as { processed: number }).processed).toBe(3);
    expect(sendTransactionalEmail).toHaveBeenCalledTimes(3);

    const calls = (sendTransactionalEmail as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const keys = calls.map((c) => (c[0] as { idempotencyKey: string }).idempotencyKey);
    expect(new Set(keys).size).toBe(3);

    // Cada call usa template ReminderStalled
    for (const c of calls) {
      const arg = c[0] as { template: string; props: { horasParado: number } };
      expect(arg.template).toBe('ReminderStalled');
      expect(arg.props.horasParado).toBeGreaterThanOrEqual(48);
    }
  });

  it('idempotency key inclui yyyymmdd para permitir escalation diária', async () => {
    const sessions = [makeStaleSession('s1', 50)];
    const m = makeSupabaseMock();
    m._chain.lt = vi.fn(() => m._chain);
    m._chain.not = vi.fn(() => m._chain);
    m._chain.order = vi.fn(() => m._chain);
    m._chain.limit = vi.fn(async () => ({ data: sessions, error: null }));
    (getServiceSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(m);

    await invokeHandler(handler as never, {
      method: 'GET',
      headers: { authorization: 'Bearer cron-sekret' },
    });

    const call = (sendTransactionalEmail as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    expect((call as { idempotencyKey: string }).idempotencyKey).toContain('reminder');
    expect((call as { idempotencyKey: string }).idempotencyKey).toContain('s1');
    expect((call as { idempotencyKey: string }).idempotencyKey).toContain(today);
  });

  it('responde 500 quando query falha', async () => {
    const m = makeSupabaseMock();
    m._chain.lt = vi.fn(() => m._chain);
    m._chain.not = vi.fn(() => m._chain);
    m._chain.order = vi.fn(() => m._chain);
    m._chain.limit = vi.fn(async () => ({
      data: null,
      error: { message: 'connection lost' },
    }));
    (getServiceSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(m);

    const r = await invokeHandler(handler as never, {
      method: 'GET',
      headers: { authorization: 'Bearer cron-sekret' },
    });
    expect(r.statusCode).toBe(500);
  });
});
