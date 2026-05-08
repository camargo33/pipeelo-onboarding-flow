import type { VercelRequest, VercelResponse } from '@vercel/node';
import { CompleteDepartmentSchema } from '../_lib/schemas/resposta';
import { assertSessionAccess, HttpError } from '../_lib/auth-session';
import { getServiceSupabase } from '../_lib/supabase';

const GATED = ['sac_geral', 'financeiro', 'suporte', 'vendas'] as const;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'method_not_allowed' });

  try {
    const body = CompleteDepartmentSchema.parse(req.body);
    const session = (await assertSessionAccess(body.slug, body.token)) as {
      id: string;
      status_identificacao?: string;
    };

    if (
      (GATED as readonly string[]).includes(body.departamento) &&
      session.status_identificacao !== 'concluido'
    ) {
      return res.status(403).json({
        error: 'identification_gate',
        message: 'Complete Identificação primeiro',
      });
    }

    const supabase = getServiceSupabase();
    const updateCols: Record<string, unknown> = {
      [`status_${body.departamento}`]: 'concluido',
      [`responsavel_${body.departamento}`]: body.responsavel_nome,
      [`concluido_${body.departamento}_at`]: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('onboarding_sessions')
      .update(updateCols)
      .eq('id', session.id);
    if (error) throw new HttpError(500, error.message);
    return res.status(200).json({ ok: true });
  } catch (e: unknown) {
    if (e instanceof HttpError)
      return res.status(e.status).json({ error: e.message });
    const err = e as { name?: string; flatten?: () => unknown };
    if (err.name === 'ZodError')
      return res
        .status(400)
        .json({ error: 'invalid_payload', details: err.flatten?.() });
    console.error('[sessions/complete-department]', e);
    return res.status(500).json({ error: 'internal' });
  }
}
