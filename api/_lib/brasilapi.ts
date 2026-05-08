import { Redis } from '@upstash/redis';
import { HttpError } from './auth-session';

/**
 * BrasilAPI CNPJ lookup com cache Upstash 24h + fallback ReceitaWS — HARD-05.
 *
 * Fluxo:
 *   1) cache hit Redis → retorna direto
 *   2) BrasilAPI 200 → cacheia 24h + retorna
 *   3) BrasilAPI 404 → throw HttpError(404, cnpj_not_found)
 *   4) BrasilAPI 5xx/timeout → tenta ReceitaWS
 *      - ReceitaWS status='ERROR' → throw HttpError(404, cnpj_not_found)
 *      - ReceitaWS 5xx/timeout → throw HttpError(503, cnpj_lookup_unavailable)
 *      - ReceitaWS OK → cacheia + retorna
 *
 * Falha de rede no Redis (cache get/set) é tolerada (catch silencioso) —
 * cache é otimização, não bloqueio.
 *
 * Docs: https://brasilapi.com.br/docs
 */

const TTL_SECONDS = 86400; // 24h

let _redis: Redis | null = null;
function getRedis(): Redis {
  if (_redis) return _redis;
  _redis = Redis.fromEnv();
  return _redis;
}

export function __resetBrasilapiCache() {
  _redis = null;
}

export async function fetchCnpj(cnpj: string): Promise<unknown> {
  const clean = cnpj.replace(/\D/g, '');
  if (clean.length !== 14) throw new HttpError(400, 'cnpj_invalid_length');

  const redis = getRedis();
  const cacheKey = `cnpj:${clean}`;
  const cached = await redis.get(cacheKey).catch(() => null);
  if (cached) return cached;

  // Primary: BrasilAPI
  try {
    const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${clean}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (r.status === 404) throw new HttpError(404, 'cnpj_not_found');
    if (!r.ok) throw new Error(`brasilapi_${r.status}`);
    const data = await r.json();
    await redis.set(cacheKey, data, { ex: TTL_SECONDS }).catch(() => {});
    return data;
  } catch (e) {
    if (e instanceof HttpError) throw e; // 404 propaga (não é retry-worthy)

    // Fallback: ReceitaWS (rate-limit 3 req/min sem auth — aceitável p/ degraded mode)
    try {
      const r = await fetch(
        `https://www.receitaws.com.br/v1/cnpj/${clean}`,
        { signal: AbortSignal.timeout(5000) },
      );
      if (!r.ok) throw new HttpError(503, 'cnpj_lookup_unavailable');
      const data = (await r.json()) as { status?: string };
      if (data.status === 'ERROR') throw new HttpError(404, 'cnpj_not_found');
      await redis.set(cacheKey, data, { ex: TTL_SECONDS }).catch(() => {});
      return data;
    } catch (e2) {
      if (e2 instanceof HttpError) throw e2;
      throw new HttpError(503, 'cnpj_lookup_unavailable');
    }
  }
}
