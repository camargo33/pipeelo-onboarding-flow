import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { assertSessionAccess, HttpError } from '../_lib/auth-session';
import { getServiceSupabase } from '../_lib/supabase';

const QuerySchema = z.object({
  slug: z.string().min(1),
  token: z.string().min(1),
});

/**
 * GET /api/agent/history — histórico exibível da conversa (user/assistant com
 * texto) + insights registrados. Usado pra rehidratar a tela do chat.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET')
    return res.status(405).json({ error: 'method_not_allowed' });

  try {
    const { slug, token } = QuerySchema.parse(req.query);
    const session = (await assertSessionAccess(slug, token)) as Record<string, unknown>;
    const supabase = getServiceSupabase();

    const [{ data: rows, error }, { data: insights }] = await Promise.all([
      supabase
        .from('onboarding_agent_messages')
        .select('role, content, created_at')
        .eq('session_id', session.id as string)
        .order('id', { ascending: true }),
      supabase
        .from('onboarding_agent_insights')
        .select('departamento, categoria, titulo, created_at')
        .eq('session_id', session.id as string)
        .order('created_at', { ascending: true }),
    ]);
    if (error) throw new HttpError(500, error.message);

    const messages = (rows ?? [])
      .map((r) => {
        const c = r.content as { role?: string; content?: string | null };
        if (r.role === 'tool') return null;
        const text = typeof c.content === 'string' ? c.content : '';
        if (!text.trim()) return null;
        return { role: r.role as 'user' | 'assistant', text, created_at: r.created_at };
      })
      .filter(Boolean);

    return res.status(200).json({ messages, insights: insights ?? [] });
  } catch (e) {
    if (e instanceof HttpError)
      return res.status(e.status).json({ error: e.message });
    const err = e as { name?: string };
    if (err.name === 'ZodError')
      return res.status(400).json({ error: 'invalid_payload' });
    console.error('[agent/history]', e);
    return res.status(500).json({ error: 'internal' });
  }
}
