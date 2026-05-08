/**
 * Util CNPJ client-side — HARD-05.
 *
 * Espelha api/_lib/schemas/identificacao.isValidCnpjChecksum.
 * Duplicação aceitável (Phase 1 escopo minimal — não inventar shared package).
 *
 * formatCnpj: formata para máscara visual XX.XXX.XXX/XXXX-XX (parcial OK).
 * cleanCnpj: remove tudo que não é dígito.
 */

export function cleanCnpj(raw: string): string {
  return raw.replace(/\D/g, '');
}

export function isValidCnpjChecksum(cnpj: string): boolean {
  const digits14 = cleanCnpj(cnpj);
  if (digits14.length !== 14) return false;
  if (/^(\d)\1+$/.test(digits14)) return false;

  const calc = (digits: number[], weights: number[]) => {
    const sum = digits.reduce((acc, d, i) => acc + d * weights[i], 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };

  const arr = digits14.split('').map(Number);
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const d1 = calc(arr.slice(0, 12), w1);
  const d2 = calc(arr.slice(0, 13), w2);
  return d1 === arr[12] && d2 === arr[13];
}

/**
 * Retorna mensagem de erro pt-BR ou null se válido.
 */
export function validateCnpj(raw: string): string | null {
  const clean = cleanCnpj(raw);
  if (clean.length === 0) return 'CNPJ é obrigatório';
  if (clean.length !== 14) return 'CNPJ deve ter 14 dígitos';
  if (!isValidCnpjChecksum(clean)) return 'CNPJ inválido (dígitos verificadores)';
  return null;
}

/**
 * Formata input progressivo para XX.XXX.XXX/XXXX-XX.
 * Aceita até 14 dígitos; mantém parcial enquanto digita.
 */
export function formatCnpj(raw: string): string {
  const d = cleanCnpj(raw).slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12)
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}
