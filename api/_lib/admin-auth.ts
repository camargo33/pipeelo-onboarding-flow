import type { VercelRequest } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

/**
 * Valida JWT do Supabase Auth (Bearer token) enviado por AdminOnboarding.
 *
 * Uso:
 *   const user = await assertAdminUser(req);
 *   // se chegar aqui, o JWT é válido — continuar com service-role.
 *
 * Throws HttpError 401 se ausente/inválido.
 *
 * NOTA: este helper apenas valida que existe um usuário Supabase autenticado.
 * Phase 5 deve adicionar role-check (admin RBAC) — por ora, autenticação
 * com Supabase Auth + RLS-anon-bloqueado nas tabelas onboarding_* é o gate
 * (qualquer user logado tinha acesso pré-Phase 1 também via anon RLS).
 */
export class AdminAuthError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'AdminAuthError';
  }
}

export async function assertAdminUser(req: VercelRequest): Promise<{ id: string; email: string | null }> {
  const auth = req.headers.authorization || req.headers.Authorization;
  const headerVal = Array.isArray(auth) ? auth[0] : auth;
  const token = headerVal?.startsWith('Bearer ') ? headerVal.slice(7) : null;
  if (!token) throw new AdminAuthError(401, 'missing_authorization');

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !anonKey) throw new AdminAuthError(500, 'auth_misconfigured');

  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) throw new AdminAuthError(401, 'invalid_token');
  return { id: data.user.id, email: data.user.email ?? null };
}
