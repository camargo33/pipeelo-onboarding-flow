import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getServiceSupabase } from '../_lib/supabase';
import { sendTransactionalEmail } from '../_lib/email-sender';
import { createCredentialsMagicLink } from '../_lib/magic-link';

/**
 * POST /api/email/send-credentials — Plan 05-02 / UI-06
 *
 * Disparado pelo admin-pipeelo quando Jarvis termina (status='completed').
 * Auth: Bearer ONBOARDING_WEBHOOK_TOKEN.
 *
 * Fluxo:
 *   1) Lookup sessão (ceo_email obrigatório, tenant_slug opcional)
 *   2) Gera magic link 72h (createCredentialsMagicLink)
 *   3) Envia CredentialsReady via sendTransactionalEmail (idempotente)
 *   4) Marca onboarding_sessions.credentials_email_sent_at = now()
 *
 * NUNCA enviar senha plain — Pitfall 7+9.
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
      .select('id, slug, ceo_email, ceo_nome, empresa_nome, tenant_slug')
      .eq('id', sessionId)
      .maybeSingle();

    if (error || !session)
      return res.status(404).json({ error: 'session_not_found' });

    const s = session as {
      id: string;
      slug: string;
      ceo_email: string | null;
      ceo_nome: string | null;
      empresa_nome: string | null;
      tenant_slug: string | null;
    };

    if (!s.ceo_email)
      return res.status(400).json({ error: 'ceo_email_missing' });

    // 1) Magic link 72h
    const link = await createCredentialsMagicLink(s.id);

    // 2) Send (idempotente)
    const result = await sendTransactionalEmail({
      template: 'CredentialsReady',
      sessionId: s.id,
      to: s.ceo_email,
      props: {
        ceoNome: s.ceo_nome ?? 'CEO',
        empresaNome: s.empresa_nome ?? 'sua empresa',
        tenantSlug: s.tenant_slug ?? s.slug,
        magicLink: link.url,
        expiresAt: link.expiresAt,
      },
    });

    // 3) Marca dispatch (mesmo em skipped, pra UI mostrar "enviado")
    await sb
      .from('onboarding_sessions')
      .update({ credentials_email_sent_at: new Date().toISOString() })
      .eq('id', s.id);

    return res.status(200).json({
      ok: true,
      ...result,
      expiresAt: link.expiresAt,
    });
  } catch (e: unknown) {
    const err = e as { name?: string };
    if (err.name === 'ZodError')
      return res.status(400).json({ error: 'invalid_payload' });
    console.error('[email/send-credentials]', e);
    return res.status(500).json({ error: 'internal' });
  }
}
