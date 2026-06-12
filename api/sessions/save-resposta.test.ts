import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invokeHandler } from '../../tests/_helpers/handler';
import { makeSupabaseMock } from '../../tests/_helpers/supabase-mock';

vi.mock('../_lib/auth-session', async () => {
  const actual = await vi.importActual<typeof import('../_lib/auth-session')>(
    '../_lib/auth-session'
  );
  return { ...actual, assertSessionAccess: vi.fn() };
});
vi.mock('../_lib/supabase', () => ({
  getServiceSupabase: vi.fn(),
  requireSupabase: vi.fn(),
}));
import { getServiceSupabase } from '../_lib/supabase';
import { assertSessionAccess, HttpError } from '../_lib/auth-session';
import handler from './_save-resposta';

describe('PUT /api/sessions/save-resposta', () => {
  beforeEach(() => vi.clearAllMocks());

  const validBody = {
    slug: 's',
    token: 'tok-32-chars-xxxxxxxxxxxxxxxxxx',
    departamento: 'identificacao',
    pergunta_id: 'razao_social',
    valor: 'Acme LTDA',
  };

  it('200 happy path com saved_at', async () => {
    (assertSessionAccess as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'sess-1',
    });
    const m = makeSupabaseMock();
    m._chain.upsert = vi.fn(async () => ({ data: null, error: null }));
    (getServiceSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(m);

    const r = await invokeHandler(handler as never, {
      method: 'PUT',
      body: validBody,
    });
    expect(r.statusCode).toBe(200);
    expect((r.body as { ok: boolean }).ok).toBe(true);
    expect((r.body as { saved_at: string }).saved_at).toBeDefined();
  });

  it('401 quando token inválido', async () => {
    (assertSessionAccess as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new HttpError(401, 'invalid_session')
    );
    const r = await invokeHandler(handler as never, {
      method: 'PUT',
      body: validBody,
    });
    expect(r.statusCode).toBe(401);
  });

  it('400 quando schema inválido (departamento desconhecido)', async () => {
    const r = await invokeHandler(handler as never, {
      method: 'PUT',
      body: { ...validBody, departamento: 'inexistente' },
    });
    expect(r.statusCode).toBe(400);
  });

  it('405 quando método != PUT', async () => {
    const r = await invokeHandler(handler as never, { method: 'POST' });
    expect(r.statusCode).toBe(405);
  });

  it('500 quando upsert falha', async () => {
    (assertSessionAccess as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'sess-1',
    });
    const m = makeSupabaseMock();
    m._chain.upsert = vi.fn(async () => ({
      data: null,
      error: { message: 'db down' },
    }));
    (getServiceSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(m);
    const r = await invokeHandler(handler as never, {
      method: 'PUT',
      body: validBody,
    });
    expect(r.statusCode).toBe(500);
  });
});
