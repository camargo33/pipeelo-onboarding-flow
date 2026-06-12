import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { fetchCnpj } from '../_lib/brasilapi';
import { HttpError } from '../_lib/auth-session';
import { CnpjSchema } from '../_lib/schemas/identificacao';

const Schema = z.object({ cnpj: CnpjSchema });

/**
 * POST /api/sessions/validate-cnpj
 *
 * Body: { cnpj: string (14 dígitos com ou sem máscara, checksum válido) }
 * 200: { data: <BrasilAPI/ReceitaWS payload> }
 * 400: { error: 'invalid_payload' } — checksum inválido / formato errado
 * 404: { error: 'cnpj_not_found' } — provider retornou not found
 * 503: { error: 'cnpj_lookup_unavailable' } — providers todos down
 *
 * Não exige auth (chamado de NovoOnboarding antes de existir sessão).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'method_not_allowed' });

  try {
    const { cnpj } = Schema.parse(req.body);
    const data = await fetchCnpj(cnpj);
    return res.status(200).json({ data });
  } catch (e: unknown) {
    if (e instanceof HttpError)
      return res.status(e.status).json({ error: e.message });
    const err = e as { name?: string; flatten?: () => unknown };
    if (err.name === 'ZodError')
      return res
        .status(400)
        .json({ error: 'invalid_payload', details: err.flatten?.() });
    // eslint-disable-next-line no-console
    console.error('[validate-cnpj]', e);
    return res.status(500).json({ error: 'internal' });
  }
}
