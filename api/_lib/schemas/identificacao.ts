import { z } from 'zod';

/**
 * Schemas de Identificação — HARD-05.
 *
 * Validações server-side compartilhadas com cliente quando viável.
 * CNPJ checksum local NÃO depende de BrasilAPI (não bloquear cliente
 * quando provider está down — degrade gracefully para checksum-only).
 */

export function isValidCnpjChecksum(cnpj: string): boolean {
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1+$/.test(cnpj)) return false; // 11111111111111 etc

  const calc = (digits: number[], weights: number[]) => {
    const sum = digits.reduce((acc, d, i) => acc + d * weights[i], 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };

  const digits = cnpj.split('').map(Number);
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const d1 = calc(digits.slice(0, 12), w1);
  const d2 = calc(digits.slice(0, 13), w2);
  return d1 === digits[12] && d2 === digits[13];
}

export const CnpjSchema = z
  .string()
  .transform((s) => s.replace(/\D/g, ''))
  .refine((s) => s.length === 14, 'cnpj_must_be_14_digits')
  .refine(isValidCnpjChecksum, 'cnpj_invalid_checksum');

export const EmailSchema = z.string().trim().toLowerCase().email('email_invalid');

/**
 * E.164 BR: +55 + DDD(2) + (9? + 8 dígitos).
 * Móvel celular tem 9° dígito; fixo não.
 * Aceita inputs com espaços/traços (normaliza).
 */
export const WhatsappBrSchema = z
  .string()
  .transform((s) => s.replace(/[\s-]/g, ''))
  .refine((s) => /^\+55\d{2}9?\d{8}$/.test(s), 'whatsapp_invalid_e164_br');

export const IdentificacaoSchema = z.object({
  cnpj: CnpjSchema,
  email: EmailSchema,
  whatsapp: WhatsappBrSchema,
});

export type IdentificacaoInput = z.infer<typeof IdentificacaoSchema>;
