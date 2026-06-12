import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { assertAdminUser, AdminAuthError } from '../_lib/admin-auth';
import { getServiceSupabase } from '../_lib/supabase';

const ERP_OPTIONS = ['IXC', 'SGP', 'MK Solution', 'RBX', 'Topp Sap', 'Hubsoft', 'Voalle', 'Outros'] as const;
const MAPAS_OPTIONS = ['OZMap', 'Geogrid', 'Geosite', 'Outros'] as const;
const REDE_OPTIONS = ['Smart OLT', 'Anlix', 'OLT Cloud', 'Made 4 Graph', 'Outros'] as const;
const GATEWAY_OPTIONS = ['7AZ (Bemobi)', 'Outros'] as const;

const nullableEnum = <T extends readonly [string, ...string[]]>(vals: T) =>
  z.enum(vals).nullable().or(z.literal('').transform(() => null));

const Body = z.object({
  session_id: z.string().uuid(),
  erp: nullableEnum(ERP_OPTIONS).optional(),
  mapas: nullableEnum(MAPAS_OPTIONS).optional(),
  gerenciamento_rede: nullableEnum(REDE_OPTIONS).optional(),
  gateway_pagamento: nullableEnum(GATEWAY_OPTIONS).optional(),
});

/**
 * POST /api/admin/sessions-update
 *   Auth: Bearer <supabase-jwt>
 *   body: { session_id, erp?, mapas?, gerenciamento_rede? }
 *   200: { session: SessionRow }
 *
 * Atualiza a stack tecnológica (campos preenchidos pelo admin).
 * Passe `null` ou string vazia para limpar um campo.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  try {
    await assertAdminUser(req);
    const body = Body.parse(req.body);
    const supabase = getServiceSupabase();

    const patch: Record<string, string | null> = {};
    if ('erp' in body) patch.erp = body.erp ?? null;
    if ('mapas' in body) patch.mapas = body.mapas ?? null;
    if ('gerenciamento_rede' in body) patch.gerenciamento_rede = body.gerenciamento_rede ?? null;
    if ('gateway_pagamento' in body) patch.gateway_pagamento = body.gateway_pagamento ?? null;

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: 'no_fields_to_update' });
    }

    const { data, error } = await supabase
      .from('onboarding_sessions')
      .update(patch)
      .eq('id', body.session_id)
      .select('*')
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ session: data });
  } catch (e: unknown) {
    if (e instanceof AdminAuthError) return res.status(e.status).json({ error: e.message });
    const err = e as { name?: string; flatten?: () => unknown };
    if (err.name === 'ZodError')
      return res.status(400).json({ error: 'invalid_payload', details: err.flatten?.() });
    console.error('[admin/sessions-update]', e);
    return res.status(500).json({ error: 'internal' });
  }
}
