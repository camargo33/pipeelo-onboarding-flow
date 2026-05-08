import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invokeHandler } from '../../tests/_helpers/handler';
import { makeSupabaseMock } from '../../tests/_helpers/supabase-mock';

vi.mock('../_lib/auth-session', () => ({
  assertSessionAccess: vi.fn(),
  HttpError: class extends Error {
    status = 0;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));
vi.mock('../_lib/supabase', () => ({
  getServiceSupabase: vi.fn(),
  requireSupabase: vi.fn(),
}));
import { assertSessionAccess } from '../_lib/auth-session';
import { getServiceSupabase } from '../_lib/supabase';
import handler from './complete-department';

describe('POST /api/sessions/complete-department', () => {
  beforeEach(() => vi.clearAllMocks());

  const baseBody = {
    slug: 's',
    token: 'tok-32-chars-xxxxxxxxxxxxxxxxxx',
    responsavel_nome: 'Felipe Camargo',
  };

  it('403 identification_gate quando dept ∈ GATED e identificação pendente', async () => {
    (assertSessionAccess as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      { id: 's', status_identificacao: 'em_andamento' }
    );
    const r = await invokeHandler(handler as never, {
      method: 'POST',
      body: { ...baseBody, departamento: 'financeiro' },
    });
    expect(r.statusCode).toBe(403);
    expect((r.body as { error: string }).error).toBe('identification_gate');
  });

  it('200 ok quando identificação concluída + dept gated', async () => {
    (assertSessionAccess as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      { id: 's', status_identificacao: 'concluido' }
    );
    const m = makeSupabaseMock();
    m._chain.eq = vi.fn(() =>
      Promise.resolve({ data: null, error: null })
    ) as never;
    (getServiceSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(m);

    const r = await invokeHandler(handler as never, {
      method: 'POST',
      body: { ...baseBody, departamento: 'financeiro' },
    });
    expect(r.statusCode).toBe(200);
    expect((r.body as { ok: boolean }).ok).toBe(true);
  });

  it('200 para identificacao mesmo se status pendente (não é gated)', async () => {
    (assertSessionAccess as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      { id: 's', status_identificacao: 'pendente' }
    );
    const m = makeSupabaseMock();
    m._chain.eq = vi.fn(() =>
      Promise.resolve({ data: null, error: null })
    ) as never;
    (getServiceSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(m);

    const r = await invokeHandler(handler as never, {
      method: 'POST',
      body: { ...baseBody, departamento: 'identificacao' },
    });
    expect(r.statusCode).toBe(200);
  });

  it('400 quando body inválido', async () => {
    const r = await invokeHandler(handler as never, {
      method: 'POST',
      body: { slug: '', token: 'short', departamento: 'x', responsavel_nome: '' },
    });
    expect(r.statusCode).toBe(400);
  });

  it('405 quando método != POST', async () => {
    const r = await invokeHandler(handler as never, { method: 'GET' });
    expect(r.statusCode).toBe(405);
  });

  it('passa colunas status_<dept>, responsavel_<dept>, concluido_<dept>_at no update', async () => {
    (assertSessionAccess as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      { id: 'sess-1', status_identificacao: 'concluido' }
    );
    const m = makeSupabaseMock();
    m._chain.eq = vi.fn(() =>
      Promise.resolve({ data: null, error: null })
    ) as never;
    (getServiceSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(m);

    await invokeHandler(handler as never, {
      method: 'POST',
      body: { ...baseBody, departamento: 'suporte' },
    });
    const updateArgs = (m._chain.update as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(updateArgs).toMatchObject({
      status_suporte: 'concluido',
      responsavel_suporte: 'Felipe Camargo',
    });
    expect(updateArgs.concluido_suporte_at).toBeDefined();
  });
});
