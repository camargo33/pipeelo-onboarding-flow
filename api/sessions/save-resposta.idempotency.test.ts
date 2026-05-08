import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invokeHandler } from '../../tests/_helpers/handler';
import { makeSupabaseMock } from '../../tests/_helpers/supabase-mock';

vi.mock('../_lib/auth-session', () => ({
  assertSessionAccess: vi.fn(async () => ({ id: 'sess-1' })),
  HttpError: class extends Error {
    status = 0;
  },
}));
vi.mock('../_lib/supabase', () => ({
  getServiceSupabase: vi.fn(),
  requireSupabase: vi.fn(),
}));
import { getServiceSupabase } from '../_lib/supabase';
import handler from './save-resposta';

describe('save-resposta idempotency', () => {
  beforeEach(() => vi.clearAllMocks());

  it('upsert usa onConflict session_id,departamento,pergunta_id (mesmo payload 2x)', async () => {
    const m = makeSupabaseMock();
    m._chain.upsert = vi.fn(async () => ({ data: null, error: null }));
    (getServiceSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(m);

    const body = {
      slug: 's',
      token: 'tok-32-chars-xxxxxxxxxxxxxxxxxx',
      departamento: 'identificacao',
      pergunta_id: 'q1',
      valor: 'v',
    };

    await invokeHandler(handler as never, { method: 'PUT', body });
    await invokeHandler(handler as never, { method: 'PUT', body });

    expect(m._chain.upsert).toHaveBeenCalledTimes(2);
    const firstCall = (m._chain.upsert as ReturnType<typeof vi.fn>).mock.calls[0];
    const secondCall = (m._chain.upsert as ReturnType<typeof vi.fn>).mock.calls[1];

    // Mesmo onConflict em ambas — garantia contratual de idempotência
    expect(firstCall[1]).toMatchObject({
      onConflict: 'session_id,departamento,pergunta_id',
    });
    expect(secondCall[1]).toMatchObject({
      onConflict: 'session_id,departamento,pergunta_id',
    });

    // Mesmos dados de identidade em ambas as chamadas
    expect(firstCall[0]).toMatchObject({
      session_id: 'sess-1',
      departamento: 'identificacao',
      pergunta_id: 'q1',
      valor: 'v',
    });
    expect(secondCall[0]).toMatchObject({
      session_id: 'sess-1',
      departamento: 'identificacao',
      pergunta_id: 'q1',
      valor: 'v',
    });
  });
});
