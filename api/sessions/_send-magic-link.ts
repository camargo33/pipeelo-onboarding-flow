import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getServiceSupabase } from '../_lib/supabase';

const Schema = z.object({ slug: z.string().min(1) });
const RESEND_API = 'https://api.resend.com/emails';
const FROM = process.env.RESEND_FROM_EMAIL ?? 'onboarding@pipeelo.com';
const ONBOARDING_BASE =
  process.env.ONBOARDING_BASE_URL ?? 'https://onboarding.pipeelo.com';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'method_not_allowed' });

  try {
    const { slug } = Schema.parse(req.body);
    const supabase = getServiceSupabase();
    const { data: session, error } = await supabase
      .from('onboarding_sessions')
      .select('id, slug, access_token, empresa_nome')
      .eq('slug', slug)
      .maybeSingle();
    if (error || !session)
      return res.status(404).json({ error: 'session_not_found' });

    const link = `${ONBOARDING_BASE}/${(session as { slug: string }).slug}?token=${(session as { access_token: string }).access_token}`;

    // NOTA Wave 3: onboarding_sessions ainda não tem coluna `email`.
    // Plan 04 adiciona schema completo de Identificação. Por ora endpoint
    // está no caminho mas o destinatário fica em `to: []` quando email
    // não existir — Resend é disparado apenas se RESEND_API_KEY presente.
    if (process.env.RESEND_API_KEY) {
      const r = await fetch(RESEND_API, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: FROM,
          to: [], // TODO Wave 3: pegar email salvo em onboarding_respostas (departamento=identificacao, pergunta_id=email)
          subject: `Continue seu onboarding Pipeelo`,
          html: `<p>Olá! Use este link para continuar:</p><p><a href="${link}">${link}</a></p>`,
        }),
      });
      if (!r.ok) console.error('[send-magic-link] resend failed', r.status);
    }

    return res.status(200).json({
      ok: true,
      link_preview: process.env.NODE_ENV === 'production' ? undefined : link,
    });
  } catch (e: unknown) {
    const err = e as { name?: string };
    if (err.name === 'ZodError')
      return res.status(400).json({ error: 'invalid_payload' });
    console.error('[sessions/send-magic-link]', e);
    return res.status(500).json({ error: 'internal' });
  }
}
