import { z } from 'zod';

/**
 * Horário em formato HH:MM ou string vazia (dia fechado).
 * Formato real do payload aceita também `null` (do banco) e dia "não atende".
 */
const HoraSchema = z
  .union([z.string().regex(/^\d{2}:\d{2}$/), z.literal(''), z.null()])
  .optional();

/**
 * Um dia da semana expandido — formato real produzido por
 * `expandHorarioSemanal()` em api/complete-onboarding.ts:
 *   { inicio, fim, nao_atende }
 *
 * Aceita também o formato alternativo do front antigo `{ abre, fecha, fechado }`
 * via passthrough.
 */
export const HorarioDiaSchema = z
  .object({
    inicio: HoraSchema,
    fim: HoraSchema,
    nao_atende: z.boolean().optional(),
    // Compat formato antigo
    abre: HoraSchema,
    fecha: HoraSchema,
    fechado: z.boolean().optional(),
  })
  .partial()
  .passthrough();

export const DIAS_SEMANA = [
  'segunda_feira',
  'terca_feira',
  'quarta_feira',
  'quinta_feira',
  'sexta_feira',
  'sabado',
  'domingo',
  'feriado',
] as const;
export type DiaSemana = typeof DIAS_SEMANA[number];

export type HorarioDia = z.infer<typeof HorarioDiaSchema>;
