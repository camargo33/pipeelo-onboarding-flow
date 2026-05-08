import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

/**
 * Rate limit util — HARD-07.
 *
 * Usa Upstash Redis HTTP (único caminho viável em Vercel Functions Node:
 * sem TCP persistente). Cache de instância singleton por process pra evitar
 * construir Redis client a cada chamada — boa prática serverless.
 *
 * Sem env UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN o constructor
 * lança em runtime; deixamos vazar pra fail-fast em prod (config errada
 * é melhor falhar do que aceitar tráfego sem rate limit).
 */

let _redis: Redis | null = null;
function getRedis(): Redis {
  if (_redis) return _redis;
  _redis = Redis.fromEnv();
  return _redis;
}

let _createSessionLimiter: Ratelimit | null = null;

/**
 * Limiter para POST /api/sessions/create.
 * Janela deslizante 5 req/1min por chave (IP).
 * Cacheado por process.
 */
export function createSessionLimiter(): Ratelimit {
  if (_createSessionLimiter) return _createSessionLimiter;
  _createSessionLimiter = new Ratelimit({
    redis: getRedis(),
    limiter: Ratelimit.slidingWindow(5, '1 m'),
    analytics: true,
    prefix: 'rl:create-session',
  });
  return _createSessionLimiter;
}

// Para tests forçarem reset entre cenários
export function __resetLimiterCache() {
  _redis = null;
  _createSessionLimiter = null;
}
