import type { Request, Response } from 'express';
import { getServiceSupabase } from '../_lib/supabase';

/**
 * GET /s/:code  — handler público de redirect.
 * Resolve o code, faz 302 pro target_url e incrementa click_count
 * em background (não bloqueia o redirect).
 *
 * Montado diretamente no Express em server/index.ts (não passa pelos routes
 * `/api/*` porque o path é mais curto pra UX).
 */
export default async function handler(req: Request, res: Response) {
  const code = (req.params?.code ?? '').trim();

  if (!code || code.length > 16 || !/^[A-Za-z0-9]+$/.test(code)) {
    return res.redirect(302, '/');
  }

  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from('short_links')
      .select('target_url')
      .eq('code', code)
      .maybeSingle();

    if (error || !data) {
      return res.redirect(302, '/');
    }

    res.redirect(302, data.target_url);

    // Background: incrementa click_count + last_click_at (best effort)
    void supabase
      .rpc('short_link_register_click', { p_code: code })
      .then(({ error: rpcErr }) => {
        if (rpcErr) {
          // Fallback se a RPC não existir: update direto
          void supabase
            .from('short_links')
            .update({ last_click_at: new Date().toISOString() })
            .eq('code', code);
        }
      });
  } catch (e) {
    console.error('[s/redirect]', e);
    if (!res.headersSent) res.redirect(302, '/');
  }
}
