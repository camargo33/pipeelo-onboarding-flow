import { vi } from 'vitest';

/**
 * Fluent mock chain compatível com `.from(...).select().eq().single()` etc.
 * Use overrides para customizar resultados de single/maybeSingle por teste.
 *
 * Exemplo:
 *   const sb = makeSupabaseMock({ single: vi.fn(async () => ({ data: { id: 1 }, error: null })) });
 *   sb.from('onboarding_sessions').select('*').eq('id', 1).single();
 */
export function makeSupabaseMock(overrides: Record<string, unknown> = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    select: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    upsert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    delete: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    single: vi.fn(async () => ({ data: null, error: null })),
    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    then: undefined,
  };
  Object.assign(chain, overrides);
  return {
    from: vi.fn(() => chain),
    _chain: chain,
  };
}
