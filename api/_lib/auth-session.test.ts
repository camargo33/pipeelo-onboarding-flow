import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeSupabaseMock } from '../../tests/_helpers/supabase-mock';

vi.mock('./supabase', () => ({ getServiceSupabase: vi.fn(), requireSupabase: vi.fn() }));
import { getServiceSupabase } from './supabase';
import { assertSessionAccess, HttpError, TTL_DAYS } from './auth-session';

describe('assertSessionAccess', () => {
  const validSession = {
    id: 'sess-1',
    slug: 's',
    access_token: 'tok-32-chars-xxxxxxxxxxxxxxxxxx',
    created_at: new Date().toISOString(),
  };

  beforeEach(() => vi.clearAllMocks());

  it('expõe TTL_DAYS = 30', () => {
    expect(TTL_DAYS).toBe(30);
  });

  it('retorna session quando slug+token válidos e age ≤ 30d', async () => {
    const m = makeSupabaseMock();
    m._chain.maybeSingle = vi.fn(async () => ({ data: validSession, error: null }));
    (getServiceSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(m);
    const r = await assertSessionAccess('s', 'tok-32-chars-xxxxxxxxxxxxxxxxxx');
    expect(r).toEqual(validSession);
  });

  it('throws 401 invalid_session quando session não encontrada', async () => {
    const m = makeSupabaseMock();
    m._chain.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
    (getServiceSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(m);
    await expect(
      assertSessionAccess('s', 'bad-token-xxxxxxxxxxxxxx')
    ).rejects.toMatchObject({ status: 401, message: 'invalid_session' });
  });

  it('throws 401 quando token errado (registro retornado vazio)', async () => {
    const m = makeSupabaseMock();
    m._chain.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
    (getServiceSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(m);
    await expect(
      assertSessionAccess('s', 'wrong-token-xxxxxxxxxxxx')
    ).rejects.toMatchObject({ status: 401 });
  });

  it('throws 410 session_expired quando age > 30d', async () => {
    const old = {
      ...validSession,
      created_at: new Date(Date.now() - 31 * 86400_000).toISOString(),
    };
    const m = makeSupabaseMock();
    m._chain.maybeSingle = vi.fn(async () => ({ data: old, error: null }));
    (getServiceSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(m);
    await expect(
      assertSessionAccess('s', 'tok-32-chars-xxxxxxxxxxxxxxxxxx')
    ).rejects.toMatchObject({ status: 410, message: 'session_expired' });
  });

  it('HttpError carrega status e message', () => {
    const e = new HttpError(403, 'forbidden');
    expect(e.status).toBe(403);
    expect(e.message).toBe('forbidden');
  });
});
