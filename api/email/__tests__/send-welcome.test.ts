import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invokeHandler } from '../../../tests/_helpers/handler';
import { makeSupabaseMock } from '../../../tests/_helpers/supabase-mock';

vi.mock('../../_lib/supabase', () => ({
  getServiceSupabase: vi.fn(),
  requireSupabase: vi.fn(),
}));

vi.mock('../../_lib/email-sender', () => ({
  sendTransactionalEmail: vi.fn(async () => ({ skipped: false, resend_id: 'r1' })),
}));

import { getServiceSupabase } from '../../_lib/supabase';
import { sendTransactionalEmail } from '../../_lib/email-sender';
import handler from '../_send-welcome';

describe('POST /api/email/send-welcome', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ONBOARDING_WEBHOOK_TOKEN = 'sekret';
    process.env.PUBLIC_APP_URL = 'https://onboarding.pipeelo.com';
  });

  it('401 sem Bearer válido', async () => {
    const r = await invokeHandler(handler as never, {
      method: 'POST',
      headers: { authorization: 'Bearer wrong' },
      body: { sessionId: 'sess-1' },
    });
    expect(r.statusCode).toBe(401);
  });

  it('200 + chama sendTransactionalEmail com template=WelcomeCEO', async () => {
    const m = makeSupabaseMock();
    m._chain.maybeSingle = vi.fn(async () => ({
      data: {
        id: 'sess-1',
        slug: 'abc123',
        access_token: 'tok-xyz',
        ceo_email: 'ceo@empresa.com',
        ceo_nome: 'Felipe',
        empresa_nome: 'Acme',
      },
      error: null,
    }));
    (getServiceSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(m);

    const r = await invokeHandler(handler as never, {
      method: 'POST',
      headers: { authorization: 'Bearer sekret' },
      body: { sessionId: 'sess-1' },
    });

    expect(r.statusCode).toBe(200);
    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
    const call = (sendTransactionalEmail as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.template).toBe('WelcomeCEO');
    expect(call.to).toBe('ceo@empresa.com');
    expect(call.props.magicLink).toContain('abc123');
    expect(call.props.magicLink).toContain('tok-xyz');
  });

  it('400 quando ceo_email ausente na sessão', async () => {
    const m = makeSupabaseMock();
    m._chain.maybeSingle = vi.fn(async () => ({
      data: {
        id: 'sess-1',
        slug: 'abc123',
        access_token: 'tok',
        ceo_email: null,
        ceo_nome: 'Felipe',
        empresa_nome: 'Acme',
      },
      error: null,
    }));
    (getServiceSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(m);

    const r = await invokeHandler(handler as never, {
      method: 'POST',
      headers: { authorization: 'Bearer sekret' },
      body: { sessionId: 'sess-1' },
    });
    expect(r.statusCode).toBe(400);
  });
});
