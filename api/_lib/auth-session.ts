import { getServiceSupabase } from './supabase';

export const TTL_DAYS = 30;

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

export async function assertSessionAccess(slug: string, token: string) {
  const supabase = getServiceSupabase();
  const { data: session, error } = await supabase
    .from('onboarding_sessions')
    .select('*')
    .eq('slug', slug)
    .eq('access_token', token)
    .maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!session) throw new HttpError(401, 'invalid_session');
  const ageDays =
    (Date.now() - new Date(session.created_at).getTime()) / 86_400_000;
  if (ageDays > TTL_DAYS) throw new HttpError(410, 'session_expired');
  return session;
}
