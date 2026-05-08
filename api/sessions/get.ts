import type { VercelRequest, VercelResponse } from '@vercel/node';
import { SlugTokenSchema } from '../_lib/schemas/session';
import { assertSessionAccess, HttpError } from '../_lib/auth-session';
import { getServiceSupabase } from '../_lib/supabase';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET')
    return res.status(405).json({ error: 'method_not_allowed' });

  try {
    const { slug, token } = SlugTokenSchema.parse(req.query);
    const session = await assertSessionAccess(slug, token);
    const supabase = getServiceSupabase();
    const { data: respostas, error } = await supabase
      .from('onboarding_respostas')
      .select('departamento, pergunta_id, valor, updated_at')
      .eq('session_id', (session as { id: string }).id);
    if (error) throw new HttpError(500, error.message);

    // NUNCA retornar access_token de volta
    const { access_token: _omit, ...sessionPublic } = session as Record<
      string,
      unknown
    > & { access_token?: string };
    void _omit;

    return res
      .status(200)
      .json({ session: sessionPublic, respostas: respostas ?? [] });
  } catch (e: unknown) {
    if (e instanceof HttpError)
      return res.status(e.status).json({ error: e.message });
    const err = e as { name?: string };
    if (err.name === 'ZodError')
      return res.status(400).json({ error: 'invalid_payload' });
    console.error('[sessions/get]', e);
    return res.status(500).json({ error: 'internal' });
  }
}
