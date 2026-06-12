import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invokeHandler } from '../../tests/_helpers/handler';
import { makeSupabaseMock } from '../../tests/_helpers/supabase-mock';

const limitMock = vi.fn();

vi.mock('../_lib/ratelimit', () => ({
  createSessionLimiter: () => ({ limit: limitMock }),
  __resetLimiterCache: () => {},
}));

vi.mock('../_lib/turnstile', () => ({
  verifyTurnstileToken: vi.fn(async () => true),
}));

vi.mock('../_lib/supabase', () => ({
  getServiceSupabase: vi.fn(),
  requireSupabase: vi.fn(),
}));

import { getServiceSupabase } from '../_lib/supabase';
import { verifyTurnstileToken } from '../_lib/turnstile';
import handler from './_create';

const validBody = {
  empresa_nome: 'Acme ISP',
  cnpj: '11222333000181',
  turnstileToken: 'tok-123',
};

describe('POST /api/sessions/create — rate limit + turnstile + cnpj checksum', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const m = makeSupabaseMock();
    m._chain.single = vi.fn(async () => ({
      data: { slug: 'aaaa', access_token: 'bbbb' },
      error: null,
    }));
    (getServiceSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      m,
    );
    (verifyTurnstileToken as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async () => true,
    );
  });

  it('429 quando rate limit excedido', async () => {
    limitMock.mockResolvedValue({ success: false, remaining: 0 });
    const r = await invokeHandler(handler as never, {
      method: 'POST',
      body: validBody,
      headers: { 'x-forwarded-for': '1.2.3.4' },
    });
    expect(r.statusCode).toBe(429);
    expect(r.body).toMatchObject({ error: 'rate_limit' });
    expect(r.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '0');
  });

  it('403 captcha_failed quando turnstile retorna false', async () => {
    limitMock.mockResolvedValue({ success: true, remaining: 4 });
    (verifyTurnstileToken as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
    const r = await invokeHandler(handler as never, {
      method: 'POST',
      body: validBody,
    });
    expect(r.statusCode).toBe(403);
    expect(r.body).toMatchObject({ error: 'captcha_failed' });
  });

  it('400 invalid_payload em CNPJ checksum-inválido', async () => {
    limitMock.mockResolvedValue({ success: true, remaining: 4 });
    const r = await invokeHandler(handler as never, {
      method: 'POST',
      body: { ...validBody, cnpj: '11222333000180' }, // último dígito errado
    });
    expect(r.statusCode).toBe(400);
    expect(r.body).toMatchObject({ error: 'invalid_payload' });
  });

  it('201 quando rate-limit OK + turnstile OK + cnpj válido', async () => {
    limitMock.mockResolvedValue({ success: true, remaining: 4 });
    const r = await invokeHandler(handler as never, {
      method: 'POST',
      body: validBody,
    });
    expect(r.statusCode).toBe(201);
    expect(r.body).toMatchObject({ slug: 'aaaa', access_token: 'bbbb' });
  });

  it('429 não chama Turnstile (ordem importa)', async () => {
    limitMock.mockResolvedValue({ success: false, remaining: 0 });
    await invokeHandler(handler as never, {
      method: 'POST',
      body: validBody,
    });
    expect(verifyTurnstileToken).not.toHaveBeenCalled();
  });
});
