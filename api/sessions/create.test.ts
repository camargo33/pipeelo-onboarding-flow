import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invokeHandler } from '../../tests/_helpers/handler';
import { makeSupabaseMock } from '../../tests/_helpers/supabase-mock';

vi.mock('../_lib/ratelimit', () => ({
  createSessionLimiter: () => ({
    limit: vi.fn(async () => ({ success: true, remaining: 4 })),
  }),
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
import handler from './create';

const VALID_CNPJ = '11222333000181';

describe('POST /api/sessions/create', () => {
  beforeEach(() => vi.clearAllMocks());

  it('cria session com slug+access_token (nanoid)', async () => {
    const m = makeSupabaseMock();
    m._chain.single = vi.fn(async () => ({
      data: { slug: 'abc', access_token: 'tok' },
      error: null,
    }));
    (getServiceSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(m);
    const r = await invokeHandler(handler as never, {
      method: 'POST',
      body: { empresa_nome: 'Acme', cnpj: VALID_CNPJ, turnstileToken: 't' },
    });
    expect(r.statusCode).toBe(201);
    expect(r.body).toMatchObject({
      slug: expect.any(String),
      access_token: expect.any(String),
    });
  });

  it('400 com cnpj inválido (não 14 dígitos)', async () => {
    const r = await invokeHandler(handler as never, {
      method: 'POST',
      body: { empresa_nome: 'Acme', cnpj: '123', turnstileToken: 't' },
    });
    expect(r.statusCode).toBe(400);
    expect((r.body as { error: string }).error).toBe('invalid_payload');
  });

  it('409 cnpj_already_exists em conflict 23505', async () => {
    const m = makeSupabaseMock();
    m._chain.single = vi.fn(async () => ({
      data: null,
      error: { code: '23505', message: 'dup' },
    }));
    (getServiceSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(m);
    const r = await invokeHandler(handler as never, {
      method: 'POST',
      body: { empresa_nome: 'Acme', cnpj: VALID_CNPJ, turnstileToken: 't' },
    });
    expect(r.statusCode).toBe(409);
    expect((r.body as { error: string }).error).toBe('cnpj_already_exists');
  });

  it('405 quando método != POST', async () => {
    const r = await invokeHandler(handler as never, { method: 'GET' });
    expect(r.statusCode).toBe(405);
  });

  it('passa colunas status_* = pendente no insert', async () => {
    const m = makeSupabaseMock();
    m._chain.single = vi.fn(async () => ({
      data: { slug: 'a', access_token: 't' },
      error: null,
    }));
    (getServiceSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(m);
    await invokeHandler(handler as never, {
      method: 'POST',
      body: { empresa_nome: 'Acme', cnpj: VALID_CNPJ, turnstileToken: 't' },
    });
    const args = (m._chain.insert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(args).toMatchObject({
      status_identificacao: 'pendente',
      status_sac_geral: 'pendente',
      status_financeiro: 'pendente',
      status_suporte: 'pendente',
      status_vendas: 'pendente',
    });
  });
});
