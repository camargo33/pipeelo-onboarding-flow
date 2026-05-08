import { nanoid } from 'nanoid';
import { getServiceSupabase } from './supabase';

/**
 * Plan 05-02 — Magic link 72h opaco para CredentialsReady.
 *
 * Token = nanoid(32) URL-safe. Persistido em onboarding_sessions
 * junto com expires_at. Verificação faz lookup por (slug, token) +
 * checa expiração — sem criptografia ou JWT (chave única, rotacionável).
 *
 * NUNCA persistir senha plain — Pitfall 7+9.
 */

const DEFAULT_TTL_HOURS = 72;

export interface MagicLinkResult {
  /** URL completa /credentials?session={slug}&token={token} */
  url: string;
  /** ISO 8601 — expira ~72h a partir de agora */
  expiresAt: string;
}

export async function createCredentialsMagicLink(
  sessionId: string,
  ttlHours: number = DEFAULT_TTL_HOURS,
): Promise<MagicLinkResult> {
  const sb = getServiceSupabase();

  // Busca slug pelo id da sessão
  const { data: session, error: lookupErr } = await sb
    .from('onboarding_sessions')
    .select('id, slug')
    .eq('id', sessionId)
    .maybeSingle();

  if (lookupErr) throw new Error(`magic-link lookup: ${lookupErr.message}`);
  if (!session) throw new Error(`session not found: ${sessionId}`);

  const token = nanoid(32);
  const expiresAt = new Date(Date.now() + ttlHours * 3600_000).toISOString();

  const { error: updateErr } = await sb
    .from('onboarding_sessions')
    .update({
      credentials_token: token,
      credentials_token_expires_at: expiresAt,
    })
    .eq('id', sessionId);

  if (updateErr) throw new Error(`magic-link persist: ${updateErr.message}`);

  const baseUrl =
    process.env.PUBLIC_APP_URL ??
    process.env.ONBOARDING_BASE_URL ??
    'https://onboarding.pipeelo.com';

  const slug = (session as { slug: string }).slug;

  return {
    url: `${baseUrl}/credentials?session=${slug}&token=${token}`,
    expiresAt,
  };
}

export interface VerifiedSession {
  id: string;
  slug: string;
  credentials_token: string;
  credentials_token_expires_at: string;
}

export async function verifyCredentialsToken(
  slug: string,
  token: string,
): Promise<VerifiedSession | null> {
  if (!slug || !token) return null;

  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from('onboarding_sessions')
    .select(
      'id, slug, credentials_token, credentials_token_expires_at',
    )
    .eq('slug', slug)
    .eq('credentials_token', token)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as VerifiedSession;

  // Check expiração
  const expiresMs = new Date(row.credentials_token_expires_at).getTime();
  if (!Number.isFinite(expiresMs) || expiresMs <= Date.now()) return null;

  return row;
}
