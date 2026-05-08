import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getServiceSupabase } from '../_lib/supabase';
import { sendTransactionalEmail } from '../_lib/email-sender';

/**
 * POST /api/email/send-welcome — Plan 05-02 / UI-04
 *
 * Dispara WelcomeCEO para o CEO da sessão. Auth via Bearer
 * ONBOARDING_WEBHOOK_TOKEN. Idempotente via email_log
 * (template+sessionId).
 *
 * Magic link aqui é o de RETOMADA (slug + access_token do Phase 1),
 * NÃO o credentials_token (esse é do CredentialsReady só).
 */

const Schema = z.object({ sessionId: z.string().min(1) });

function assertWebhookToken(req: VercelRequest): boolean {
  const expected = process.env.ONBOARDING_WEBHOOK_TOKEN;
  if (!expected) return false;
  return req.headers.authorization === `Bearer ${expected}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'method_not_allowed' });

  if (!assertWebhookToken(req)) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  try {
    const { sessionId } = Schema.parse(req.body);

    const sb = getServiceSupabase();
    const { data: session, error } = await sb
      .from('onboarding_sessions')
      .select('id, slug, access_token, ceo_email, ceo_nome, empresa_nome')
      .eq('id', sessionId)
      .maybeSingle();

    if (error || !session)
      return res.status(404).json({ error: 'session_not_found' });

    const s = session as {
      id: string;
      slug: string;
      access_token: string;
      ceo_email: string | null;
      ceo_nome: string | null;
      empresa_nome: string | null;
    };

    if (!s.ceo_email)
      return res.status(400).json({ error: 'ceo_email_missing' });

    const baseUrl =
      process.env.PUBLIC_APP_URL ??
      process.env.ONBOARDING_BASE_URL ??
      'https://onboarding.pipeelo.com';
    const magicLink = `${baseUrl}/?session=${s.slug}&token=${s.access_token}`;

    const result = await sendTransactionalEmail({
      template: 'WelcomeCEO',
      sessionId: s.id,
      to: s.ceo_email,
      props: {
        ceoNome: s.ceo_nome ?? 'CEO',
        empresaNome: s.empresa_nome ?? 'sua empresa',
        magicLink,
      },
    });

    return res.status(200).json({ ok: true, ...result });
  } catch (e: unknown) {
    const err = e as { name?: string };
    if (err.name === 'ZodError')
      return res.status(400).json({ error: 'invalid_payload' });
    console.error('[email/send-welcome]', e);
    return res.status(500).json({ error: 'internal' });
  }
}
