import type { VercelRequest, VercelResponse } from '@vercel/node';
import { assertAdminUser, AdminAuthError } from '../_lib/admin-auth';
import { getServiceSupabase } from '../_lib/supabase';

/**
 * GET /api/admin/sessions-list
 *   Auth: Bearer <supabase-jwt>
 *   200: { sessions: SessionRow[] }
 *   401 unauthorized | 500
 *
 * Lista todas as sessões para o painel admin (HARD-01 server-side).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  try {
    await assertAdminUser(req);
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from('onboarding_sessions')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ sessions: data ?? [] });
  } catch (e: unknown) {
    if (e instanceof AdminAuthError) return res.status(e.status).json({ error: e.message });
    console.error('[admin/sessions-list]', e);
    return res.status(500).json({ error: 'internal' });
  }
}
