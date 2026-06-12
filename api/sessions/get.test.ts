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
import handler from './_get';

describe('GET /api/sessions/get', () => {
  beforeEach(() => vi.clearAllMocks());

  it('200 com session+respostas quando válido + remove access_token do payload', async () => {
    (assertSessionAccess as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'sess-1',
      slug: 's',
      access_token: 'tok-must-be-stripped',
      empresa_nome: 'Acme',
      status_identificacao: 'pendente',
    });
    const m = makeSupabaseMock();
    m._chain.eq = vi.fn(() =>
      Promise.resolve({
        data: [
          {
            departamento: 'identificacao',
            pergunta_id: 'q1',
            valor: 'v',
            updated_at: 'now',
          },
        ],
        error: null,
      })
    ) as never;
    (getServiceSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(m);

    const r = await invokeHandler(handler as never, {
      method: 'GET',
      query: { slug: 's', token: 'tok-32-chars-xxxxxxxxxxxxxxxxxx' },
    });
    expect(r.statusCode).toBe(200);
    const body = r.body as {
      session: { access_token?: string; empresa_nome: string };
      respostas: unknown[];
    };
    expect(body.session.access_token).toBeUndefined();
    expect(body.session.empresa_nome).toBe('Acme');
    expect(body.respostas).toHaveLength(1);
  });

  it('401 quando assertSessionAccess throws invalid_session', async () => {
    (assertSessionAccess as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new HttpError(401, 'invalid_session')
    );
    const r = await invokeHandler(handler as never, {
      method: 'GET',
      query: { slug: 's', token: 'tok-32-chars-xxxxxxxxxxxxxxxxxx' },
    });
    expect(r.statusCode).toBe(401);
    expect((r.body as { error: string }).error).toBe('invalid_session');
  });

  it('410 quando session expirou', async () => {
    (assertSessionAccess as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new HttpError(410, 'session_expired')
    );
    const r = await invokeHandler(handler as never, {
      method: 'GET',
      query: { slug: 's', token: 'tok-32-chars-xxxxxxxxxxxxxxxxxx' },
    });
    expect(r.statusCode).toBe(410);
  });

  it('400 quando query sem slug/token', async () => {
    const r = await invokeHandler(handler as never, {
      method: 'GET',
      query: {},
    });
    expect(r.statusCode).toBe(400);
  });

  it('405 quando método != GET', async () => {
    const r = await invokeHandler(handler as never, { method: 'POST' });
    expect(r.statusCode).toBe(405);
  });
});
