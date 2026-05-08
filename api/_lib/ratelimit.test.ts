import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks ANTES do import do módulo (vitest hoisting)
vi.mock('@upstash/redis', () => ({
  Redis: { fromEnv: vi.fn(() => ({ __mock: 'redis' })) },
}));

vi.mock('@upstash/ratelimit', () => {
  const mockCtor = vi.fn(function (this: Record<string, unknown>, opts: unknown) {
    this.opts = opts;
    this.limit = vi.fn();
  });
  // @ts-expect-error - attach static
  mockCtor.slidingWindow = vi.fn((req: number, win: string) => ({
    type: 'sw',
    req,
    win,
  }));
  return { Ratelimit: mockCtor };
});

import { createSessionLimiter, __resetLimiterCache } from './ratelimit';

describe('createSessionLimiter', () => {
  beforeEach(() => {
    __resetLimiterCache();
  });

  it('configura slidingWindow 5/1m com prefix correto', () => {
    const lim = createSessionLimiter() as unknown as { opts: Record<string, unknown> };
    expect(lim.opts.prefix).toBe('rl:create-session');
    expect(lim.opts.limiter).toMatchObject({ type: 'sw', req: 5, win: '1 m' });
    expect(lim.opts.analytics).toBe(true);
  });

  it('retorna mesma instância (cacheada por process)', () => {
    const a = createSessionLimiter();
    const b = createSessionLimiter();
    expect(a).toBe(b);
  });
});
