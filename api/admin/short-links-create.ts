import type { VercelRequest, VercelResponse } from '@vercel/node';
import { assertAdminUser, AdminAuthError } from '../_lib/admin-auth';
import { getServiceSupabase } from '../_lib/supabase';

const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // sem 0/o/O/1/l/I
const CODE_LEN = 6;
const MAX_RETRIES = 5;

function generateCode(len = CODE_LEN): string {
  let out = '';
  for (let i = 0; i < len; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

/**
 * POST /api/admin/short-links-create
 *   Auth: Bearer <supabase-jwt>
 *   Body: { session_id: string, modo: 'completo' | 'comercial', target_url: string }
 *   200:  { code: string, short_url: string }
 *   400 invalid_input | 401 unauthorized | 500
 *
 * Idempotente por (session_id, modo): se já existe shortlink pra essa combinação,
 * retorna o mesmo. Senão gera novo code de 6 chars (alfabeto sem caracteres
 * confundíveis).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  try {
    await assertAdminUser(req);

    const { session_id, modo, target_url } = req.body ?? {};
    if (
      typeof session_id !== 'string' ||
      typeof target_url !== 'string' ||
      (modo !== 'completo' && modo !== 'comercial')
    ) {
      return res.status(400).json({ error: 'invalid_input' });
    }

    const supabase = getServiceSupabase();

    // Atualiza o modo da sessão (último link gerado define qual mensagem
    // de conclusão será disparada quando o cliente terminar).
    await supabase
      .from('onboarding_sessions')
      .update({ modo })
      .eq('id', session_id);

    // Idempotência: já existe shortlink pra esse (session_id, modo)?
    const { data: existing, error: existingErr } = await supabase
      .from('short_links')
      .select('code, target_url')
      .eq('session_id', session_id)
      .eq('modo', modo)
      .maybeSingle();

    if (existingErr) {
      console.error('[short-links-create] existing lookup failed:', existingErr);
      return res.status(500).json({ error: existingErr.message });
    }

    const host = req.headers.host ?? 'onboarding.pipeelo.com';
    const proto = (req.headers['x-forwarded-proto'] as string) ?? 'https';

    if (existing) {
      // Se target mudou (token regenerado), atualiza in-place
      if (existing.target_url !== target_url) {
        await supabase
          .from('short_links')
          .update({ target_url })
          .eq('code', existing.code);
      }
      return res.status(200).json({
        code: existing.code,
        short_url: `${proto}://${host}/s/${existing.code}`,
      });
    }

    // Gera novo code, retry se colidir
    let code: string | null = null;
    for (let i = 0; i < MAX_RETRIES; i++) {
      const candidate = generateCode();
      const { error: insertErr } = await supabase.from('short_links').insert({
        code: candidate,
        target_url,
        session_id,
        modo,
      });
      if (!insertErr) {
        code = candidate;
        break;
      }
      // 23505 = unique_violation
      const errCode = (insertErr as { code?: string }).code;
      if (errCode !== '23505') {
        console.error('[short-links-create] insert failed:', insertErr);
        return res.status(500).json({ error: insertErr.message });
      }
    }

    if (!code) {
      return res.status(500).json({ error: 'code_generation_exhausted' });
    }

    return res.status(200).json({
      code,
      short_url: `${proto}://${host}/s/${code}`,
    });
  } catch (e: unknown) {
    if (e instanceof AdminAuthError) return res.status(e.status).json({ error: e.message });
    console.error('[admin/short-links-create]', e);
    return res.status(500).json({ error: 'internal' });
  }
}
