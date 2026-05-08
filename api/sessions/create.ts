import type { VercelRequest, VercelResponse } from '@vercel/node';
import { nanoid } from 'nanoid';
import { CreateSessionSchema } from '../_lib/schemas/session';
import { getServiceSupabase } from '../_lib/supabase';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'method_not_allowed' });

  try {
    const body = CreateSessionSchema.parse(req.body);
    // TODO Wave 3 (Plan 04): rate-limit + verifyTurnstileToken(body.turnstileToken)
    const supabase = getServiceSupabase();
    const slug = nanoid(12);
    const access_token = nanoid(32);

    const { data, error } = await supabase
      .from('onboarding_sessions')
      .insert({
        slug,
        access_token,
        empresa_nome: body.empresa_nome,
        cnpj: body.cnpj,
        status_identificacao: 'pendente',
        status_sac_geral: 'pendente',
        status_financeiro: 'pendente',
        status_suporte: 'pendente',
        status_vendas: 'pendente',
      })
      .select('slug, access_token')
      .single();

    if (error) {
      if (error.code === '23505')
        return res.status(409).json({ error: 'cnpj_already_exists' });
      return res.status(500).json({ error: error.message });
    }
    return res.status(201).json(data);
  } catch (e: unknown) {
    const err = e as { name?: string; flatten?: () => unknown };
    if (err.name === 'ZodError')
      return res
        .status(400)
        .json({ error: 'invalid_payload', details: err.flatten?.() });
    console.error('[sessions/create]', e);
    return res.status(500).json({ error: 'internal' });
  }
}
