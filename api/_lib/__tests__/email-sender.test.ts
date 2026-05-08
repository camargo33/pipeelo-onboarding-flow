import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeSupabaseMock } from '../../../tests/_helpers/supabase-mock';

// Mock Resend SDK — usar vi.hoisted pra compartilhar sendMock com a factory hoisted
const { sendMock } = vi.hoisted(() => ({
  sendMock: vi.fn(async () => ({ data: { id: 'resend_id_123' }, error: null })),
}));
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

// Mock supabase
vi.mock('../supabase', () => ({
  getServiceSupabase: vi.fn(),
  requireSupabase: vi.fn(),
}));

import { getServiceSupabase } from '../supabase';
import {
  sendTransactionalEmail,
  type EmailTemplate,
} from '../email-sender';
import {
  createCredentialsMagicLink,
  verifyCredentialsToken,
} from '../magic-link';

const TEMPLATE: EmailTemplate = 'WelcomeCEO';

describe('sendTransactionalEmail — idempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_API_KEY = 'test-key';
    process.env.RESEND_FROM_EMAIL = 'noreply@mail.pipeelo.com';
  });

  it('1ª chamada envia, 2ª chamada com mesmo (template, sessionId) NÃO envia', async () => {
    // Round 1: nenhum log existente -> envia
    const m1 = makeSupabaseMock();
    m1._chain.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
    m1._chain.insert = vi.fn(() => m1._chain);
    (getServiceSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(m1);

    const r1 = await sendTransactionalEmail({
      template: TEMPLATE,
      sessionId: 'sess-001',
      to: 'ceo@empresa.com',
      props: { ceoNome: 'Felipe', empresaNome: 'Acme', magicLink: 'https://x.com' },
    });
    expect(r1.skipped).toBeFalsy();
    expect(sendMock).toHaveBeenCalledTimes(1);

    // Round 2: log JÁ existe (mesma idempotency key) -> skip
    const m2 = makeSupabaseMock();
    m2._chain.maybeSingle = vi.fn(async () => ({
      data: { id: 'log-1', resend_id: 'resend_id_123', status: 'sent' },
      error: null,
    }));
    (getServiceSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(m2);

    const r2 = await sendTransactionalEmail({
      template: TEMPLATE,
      sessionId: 'sess-001',
      to: 'ceo@empresa.com',
      props: { ceoNome: 'Felipe', empresaNome: 'Acme', magicLink: 'https://x.com' },
    });
    expect(r2.skipped).toBe(true);
    expect(r2.resend_id).toBe('resend_id_123');
    // Total ainda 1 — não enviou de novo
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('em erro de Resend: persiste status=failed e propaga throw', async () => {
    const m = makeSupabaseMock();
    m._chain.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
    const insertSpy = vi.fn(() => m._chain);
    m._chain.insert = insertSpy;
    (getServiceSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(m);

    sendMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'rate limited', name: 'rate_limit' },
    } as never);

    await expect(
      sendTransactionalEmail({
        template: TEMPLATE,
        sessionId: 'sess-fail',
        to: 'ceo@empresa.com',
        props: { ceoNome: 'F', empresaNome: 'A', magicLink: 'https://x.com' },
      }),
    ).rejects.toThrow(/resend|rate limited/i);

    // Deve ter chamado insert com status='failed'
    const call = insertSpy.mock.calls[0]?.[0] as { status?: string; error?: string } | undefined;
    expect(call?.status).toBe('failed');
    expect(call?.error).toMatch(/rate limited/i);
  });
});

describe('createCredentialsMagicLink', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PUBLIC_APP_URL = 'https://onboarding.pipeelo.com';
  });

  it('gera token opaco persistido em onboarding_sessions com expires_at = now + 72h', async () => {
    const m = makeSupabaseMock();
    // Lookup do slug
    m._chain.maybeSingle = vi.fn(async () => ({
      data: { id: 'sess-1', slug: 'abc123' },
      error: null,
    }));
    const updateSpy = vi.fn(() => m._chain);
    m._chain.update = updateSpy;
    (getServiceSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(m);

    const before = Date.now();
    const result = await createCredentialsMagicLink('sess-1');
    const after = Date.now();

    expect(result.url).toMatch(/\/credentials\?session=abc123&token=[A-Za-z0-9_-]{32,}/);
    const expiresMs = new Date(result.expiresAt).getTime();
    const ttlMs = expiresMs - before;
    // 72h ± 1min
    expect(ttlMs).toBeGreaterThanOrEqual(72 * 3600_000 - 60_000);
    expect(ttlMs).toBeLessThanOrEqual(72 * 3600_000 + (after - before) + 60_000);

    // Confirma update foi chamado com credentials_token + expires_at
    const updateArgs = updateSpy.mock.calls[0]?.[0] as
      | { credentials_token?: string; credentials_token_expires_at?: string }
      | undefined;
    expect(updateArgs?.credentials_token).toEqual(expect.any(String));
    expect((updateArgs?.credentials_token ?? '').length).toBeGreaterThanOrEqual(32);
    expect(updateArgs?.credentials_token_expires_at).toBeTruthy();
  });
});

describe('verifyCredentialsToken', () => {
  beforeEach(() => vi.clearAllMocks());

  it('retorna null para token expirado', async () => {
    const expiredAt = new Date(Date.now() - 1000).toISOString();
    const m = makeSupabaseMock();
    m._chain.maybeSingle = vi.fn(async () => ({
      data: {
        id: 'sess-1',
        slug: 'abc123',
        credentials_token: 'tok-xyz',
        credentials_token_expires_at: expiredAt,
      },
      error: null,
    }));
    (getServiceSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(m);

    const result = await verifyCredentialsToken('abc123', 'tok-xyz');
    expect(result).toBeNull();
  });

  it('retorna sessão para token válido', async () => {
    const validUntil = new Date(Date.now() + 60_000).toISOString();
    const m = makeSupabaseMock();
    m._chain.maybeSingle = vi.fn(async () => ({
      data: {
        id: 'sess-1',
        slug: 'abc123',
        credentials_token: 'tok-xyz',
        credentials_token_expires_at: validUntil,
      },
      error: null,
    }));
    (getServiceSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(m);

    const result = await verifyCredentialsToken('abc123', 'tok-xyz');
    expect(result).not.toBeNull();
    expect(result?.id).toBe('sess-1');
  });
});
