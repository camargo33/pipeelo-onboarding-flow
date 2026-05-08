import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { assertAdminUser, AdminAuthError } from '../_lib/admin-auth';
import { getServiceSupabase } from '../_lib/supabase';

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
