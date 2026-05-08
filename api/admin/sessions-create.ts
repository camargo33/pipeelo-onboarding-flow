import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { assertAdminUser, AdminAuthError } from '../_lib/admin-auth';
import { getServiceSupabase } from '../_lib/supabase';
import { sendTransactionalEmail } from '../_lib/email-sender';

const Body = z.object({
  empresa_nome: z.string().min(2).max(160),
  ceo_email: z.string().email().optional().or(z.literal('').transform(() => undefined)),
});

/**
 * POST /api/admin/sessions-create
 *   Auth: Bearer <supabase-jwt>
 *   body: { empresa_nome, ceo_email? }
 *   201: { session: SessionRow }
 *   400 invalid_payload | 401 unauthorized | 500
 *
 * Variante admin de create — não exige CNPJ (gerência manual de links).
 * O CNPJ pode ser preenchido depois pelo cliente em Identificação.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  try {
    await assertAdminUser(req);
    const body = Body.parse(req.body);
    const supabase = getServiceSupabase();
    const slug = nanoid(12);
    const access_token = nanoid(32);

    const { data, error } = await supabase
      .from('onboarding_sessions')
      .insert({
        slug,
        access_token,
        empresa_nome: body.empresa_nome,
        ceo_email: body.ceo_email ?? null,
        status_identificacao: 'pendente',
        status_sac_geral: 'pendente',
        status_financeiro: 'pendente',
        status_suporte: 'pendente',
        status_vendas: 'pendente',
      })
      .select('*')
      .single();

    if (error) return res.status(500).json({ error: error.message });

    // Plan 05-02 / UI-04: dispara WelcomeCEO assíncrono se ceo_email presente.
    // Não bloqueia create — falha de email cai em retry manual via painel
    // (Plan 05-03). Idempotente via email_log (Pitfall 7).
    const created = data as {
      id: string;
      slug: string;
      access_token: string;
      ceo_email: string | null;
      empresa_nome: string;
    };
    if (created?.ceo_email) {
      const baseUrl =
        process.env.PUBLIC_APP_URL ??
        process.env.ONBOARDING_BASE_URL ??
        'https://onboarding.pipeelo.com';
      void sendTransactionalEmail({
        template: 'WelcomeCEO',
        sessionId: created.id,
        to: created.ceo_email,
        props: {
          ceoNome: 'CEO',
          empresaNome: created.empresa_nome,
          magicLink: `${baseUrl}/?session=${created.slug}&token=${created.access_token}`,
        },
      }).catch((err) => {
        console.error('[admin/sessions-create] welcome email failed', {
          sessionId: created.id,
          err: err instanceof Error ? err.message : String(err),
        });
      });
    }

    return res.status(201).json({ session: data });
  } catch (e: unknown) {
    if (e instanceof AdminAuthError) return res.status(e.status).json({ error: e.message });
    const err = e as { name?: string; flatten?: () => unknown };
    if (err.name === 'ZodError')
      return res.status(400).json({ error: 'invalid_payload', details: err.flatten?.() });
    console.error('[admin/sessions-create]', e);
    return res.status(500).json({ error: 'internal' });
  }
}
