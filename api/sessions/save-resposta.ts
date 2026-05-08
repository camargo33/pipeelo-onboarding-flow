import type { VercelRequest, VercelResponse } from '@vercel/node';
import { SaveRespostaSchema } from '../_lib/schemas/resposta';
import { assertSessionAccess, HttpError } from '../_lib/auth-session';
import { getServiceSupabase } from '../_lib/supabase';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'PUT')
    return res.status(405).json({ error: 'method_not_allowed' });

  try {
    const body = SaveRespostaSchema.parse(req.body);
    const session = await assertSessionAccess(body.slug, body.token);
    const supabase = getServiceSupabase();
    const { error } = await supabase
      .from('onboarding_respostas')
      .upsert(
        {
          session_id: (session as { id: string }).id,
          departamento: body.departamento,
          pergunta_id: body.pergunta_id,
          valor: body.valor as never,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'session_id,departamento,pergunta_id' }
      );
    if (error) throw new HttpError(500, error.message);
    return res.status(200).json({ ok: true, saved_at: new Date().toISOString() });
  } catch (e: unknown) {
    if (e instanceof HttpError)
      return res.status(e.status).json({ error: e.message });
    const err = e as { name?: string; flatten?: () => unknown };
    if (err.name === 'ZodError')
      return res
        .status(400)
        .json({ error: 'invalid_payload', details: err.flatten?.() });
    console.error('[sessions/save-resposta]', e);
    return res.status(500).json({ error: 'internal' });
  }
}
