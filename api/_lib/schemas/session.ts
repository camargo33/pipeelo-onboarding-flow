import { z } from 'zod';

export const SlugTokenSchema = z.object({
  slug: z.string().min(1),
  token: z.string().min(16),
});

export const CreateSessionSchema = z.object({
  empresa_nome: z.string().trim().min(2).max(200),
  cnpj: z.string().regex(/^\d{14}$/, 'cnpj_must_be_14_digits'),
  turnstileToken: z.string().min(1),
});
