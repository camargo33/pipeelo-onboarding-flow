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

vi.mock('../../_lib/magic-link', () => ({
  createCredentialsMagicLink: vi.fn(async () => ({
    url: 'https://onboarding.pipeelo.com/credentials?session=abc123&token=xyz',
    expiresAt: '2026-05-11T21:30:00.000Z',
  })),
}));

import { getServiceSupabase } from '../../_lib/supabase';
import { sendTransactionalEmail } from '../../_lib/email-sender';
import { createCredentialsMagicLink } from '../../_lib/magic-link';
import handler from '../_send-credentials';

describe('POST /api/email/send-credentials', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ONBOARDING_WEBHOOK_TOKEN = 'sekret';
  });

  it('401 sem Bearer', async () => {
    const r = await invokeHandler(handler as never, {
      method: 'POST',
      headers: {},
      body: { sessionId: 'sess-1' },
    });
    expect(r.statusCode).toBe(401);
  });

  it('200 + gera magic link 72h + chama send + marca credentials_email_sent_at', async () => {
    const m = makeSupabaseMock();
    m._chain.maybeSingle = vi.fn(async () => ({
      data: {
        id: 'sess-1',
        slug: 'abc123',
        ceo_email: 'ceo@empresa.com',
        ceo_nome: 'Felipe',
        empresa_nome: 'Acme',
        tenant_slug: 'acme-tenant',
      },
      error: null,
    }));
    const updateSpy = vi.fn(() => m._chain);
    m._chain.update = updateSpy;
    (getServiceSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(m);

    const r = await invokeHandler(handler as never, {
      method: 'POST',
      headers: { authorization: 'Bearer sekret' },
      body: { sessionId: 'sess-1' },
    });

    expect(r.statusCode).toBe(200);
    expect(createCredentialsMagicLink).toHaveBeenCalledWith('sess-1');
    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
    const call = (sendTransactionalEmail as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.template).toBe('CredentialsReady');
    expect(call.to).toBe('ceo@empresa.com');
    expect(call.props.magicLink).toMatch(/credentials\?session=abc123/);

    // credentials_email_sent_at populated
    const updateArgs = updateSpy.mock.calls.find((c) => {
      const v = c[0] as { credentials_email_sent_at?: string };
      return Boolean(v.credentials_email_sent_at);
    });
    expect(updateArgs).toBeTruthy();
  });
});
