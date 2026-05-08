import { z } from 'zod';

export const DEPARTAMENTOS = [
  'identificacao',
  'sac_geral',
  'financeiro',
  'suporte',
  'vendas',
] as const;

export const SaveRespostaSchema = z.object({
  slug: z.string().min(1),
  token: z.string().min(16),
  departamento: z.enum(DEPARTAMENTOS),
  pergunta_id: z.string().min(1),
  valor: z.unknown(),
});

export const CompleteDepartmentSchema = z.object({
  slug: z.string().min(1),
  token: z.string().min(16),
  departamento: z.enum(DEPARTAMENTOS),
  responsavel_nome: z.string().trim().min(2).max(200),
});
