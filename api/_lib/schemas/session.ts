import { z } from 'zod';
import { CnpjSchema } from './identificacao';

export const SlugTokenSchema = z.object({
  slug: z.string().min(1),
  token: z.string().min(16),
});

/**
 * CreateSessionSchema usa CnpjSchema (HARD-05) — checksum validado server-side.
 * turnstileToken pode vir vazio em modo dev (sem TURNSTILE_SECRET_KEY).
 */
export const CreateSessionSchema = z.object({
  empresa_nome: z.string().trim().min(2).max(200),
  cnpj: CnpjSchema,
  turnstileToken: z.string().default(''),
});
