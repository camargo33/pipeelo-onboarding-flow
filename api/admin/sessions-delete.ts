import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { assertAdminUser, AdminAuthError } from '../_lib/admin-auth';
import { getServiceSupabase } from '../_lib/supabase';

const Body = z.object({ session_id: z.string().uuid() });

/**
 * POST /api/admin/sessions-delete
 *   Auth: Bearer <supabase-jwt>
 *   body: { session_id }
 *   200: { ok: true }
 *   400 invalid_payload | 401 unauthorized | 500
 *
 * Apaga sessão + respostas (cascade explícita: respostas first, depois session).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  try {
    await assertAdminUser(req);
    const { session_id } = Body.parse(req.body);
    const supabase = getServiceSupabase();

    const { error: respErr } = await supabase
      .from('onboarding_respostas')
      .delete()
      .eq('session_id', session_id);
    if (respErr) return res.status(500).json({ error: `respostas: ${respErr.message}` });

    const { error: sessErr } = await supabase
      .from('onboarding_sessions')
      .delete()
      .eq('id', session_id);
    if (sessErr) return res.status(500).json({ error: `sessions: ${sessErr.message}` });

    return res.status(200).json({ ok: true });
  } catch (e: unknown) {
    if (e instanceof AdminAuthError) return res.status(e.status).json({ error: e.message });
    const err = e as { name?: string; flatten?: () => unknown };
    if (err.name === 'ZodError')
      return res.status(400).json({ error: 'invalid_payload', details: err.flatten?.() });
    console.error('[admin/sessions-delete]', e);
    return res.status(500).json({ error: 'internal' });
  }
}
