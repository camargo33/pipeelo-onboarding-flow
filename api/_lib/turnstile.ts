/**
 * Cloudflare Turnstile siteverify — HARD-07.
 *
 * Modo dev permissivo: sem TURNSTILE_SECRET_KEY a função aceita qualquer
 * token (apenas avisa). Em produção/preview o env DEVE estar setado —
 * fail-closed se o fetch retornar erro.
 *
 * Docs: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */

const SITEVERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export async function verifyTurnstileToken(
  token: string,
  ip?: string,
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    // eslint-disable-next-line no-console
    console.warn(
      '[turnstile] TURNSTILE_SECRET_KEY ausente — modo dev permissivo',
    );
    return true;
  }
  if (!token || token.length === 0) return false;

  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set('remoteip', ip);

  try {
    const r = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(5000),
    });
    const json = (await r.json()) as {
      success: boolean;
      'error-codes'?: string[];
    };
    if (!json.success) {
      // eslint-disable-next-line no-console
      console.warn('[turnstile] failed', json['error-codes']);
    }
    return json.success === true;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[turnstile] verify error', e);
    return false;
  }
}
