import type { VercelRequest, VercelResponse } from '@vercel/node';
import { nanoid } from 'nanoid';
import { CreateSessionSchema } from '../_lib/schemas/session';
import { getServiceSupabase } from '../_lib/supabase';
import { createSessionLimiter } from '../_lib/ratelimit';
import { verifyTurnstileToken } from '../_lib/turnstile';

/**
 * POST /api/sessions/create — endurecido (HARD-04 + HARD-07).
 *
 * Pipeline (ordem importa):
 *   1) Rate-limit por IP (5/1min) — 429 antes de gastar Turnstile/DB
 *   2) Parse + checksum CNPJ — 400 antes de gastar Turnstile call
 *   3) Turnstile siteverify — 403 captcha_failed
 *   4) Insert session
 *
 * Header `X-RateLimit-Remaining` exposto sempre (mesmo em 429) p/ debug client.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'method_not_allowed' });

  try {
    const ip =
      (req.headers['x-forwarded-for'] as string | undefined)
        ?.split(',')[0]
        ?.trim() ?? 'unknown';

    // 1) Rate limit
    const { success: rlOk, remaining } = await createSessionLimiter().limit(ip);
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    if (!rlOk) return res.status(429).json({ error: 'rate_limit' });

    // 2) Parse + CNPJ checksum (não bloqueia em BrasilAPI down)
    const body = CreateSessionSchema.parse(req.body);

    // 3) Turnstile (modo dev permissivo se TURNSTILE_SECRET_KEY ausente)
    const captchaOk = await verifyTurnstileToken(body.turnstileToken, ip);
    if (!captchaOk) return res.status(403).json({ error: 'captcha_failed' });

    // 4) Insert
    const supabase = getServiceSupabase();
    const slug = nanoid(12);
    const access_token = nanoid(32);

    const { data, error } = await supabase
      .from('onboarding_sessions')
      .insert({
        slug,
        access_token,
        empresa_nome: body.empresa_nome,
        cnpj: body.cnpj,
        status_identificacao: 'pendente',
        status_sac_geral: 'pendente',
        status_financeiro: 'pendente',
        status_suporte: 'pendente',
        status_vendas: 'pendente',
      })
      .select('slug, access_token')
      .single();

    if (error) {
      if (error.code === '23505')
        return res.status(409).json({ error: 'cnpj_already_exists' });
      return res.status(500).json({ error: error.message });
    }
    return res.status(201).json(data);
  } catch (e: unknown) {
    const err = e as { name?: string; flatten?: () => unknown };
    if (err.name === 'ZodError')
      return res
        .status(400)
        .json({ error: 'invalid_payload', details: err.flatten?.() });
    // eslint-disable-next-line no-console
    console.error('[sessions/create]', e);
    return res.status(500).json({ error: 'internal' });
  }
}
