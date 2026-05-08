import { describe, it, expect } from 'vitest';
import {
  cleanCnpj,
  isValidCnpjChecksum,
  validateCnpj,
  formatCnpj,
} from './cnpj';

const VALID = '11222333000181';

describe('cleanCnpj', () => {
  it('remove tudo que não é dígito', () => {
    expect(cleanCnpj('11.222.333/0001-81')).toBe(VALID);
  });
});

describe('isValidCnpjChecksum', () => {
  it('aceita CNPJ válido', () => {
    expect(isValidCnpjChecksum(VALID)).toBe(true);
  });
  it('rejeita checksum errado', () => {
    expect(isValidCnpjChecksum('11222333000180')).toBe(false);
  });
  it('rejeita repetição', () => {
    expect(isValidCnpjChecksum('11111111111111')).toBe(false);
  });
});

describe('validateCnpj', () => {
  it('null para CNPJ válido', () => {
    expect(validateCnpj(VALID)).toBe(null);
    expect(validateCnpj('11.222.333/0001-81')).toBe(null);
  });
  it('mensagem pt-BR para vazio', () => {
    expect(validateCnpj('')).toBe('CNPJ é obrigatório');
  });
  it('mensagem pt-BR para comprimento errado', () => {
    expect(validateCnpj('123')).toBe('CNPJ deve ter 14 dígitos');
  });
  it('mensagem pt-BR para checksum inválido', () => {
    expect(validateCnpj('11222333000180')).toMatch(/dígitos verificadores/);
  });
});

describe('formatCnpj', () => {
  it('formata 14 dígitos completo', () => {
    expect(formatCnpj('11222333000181')).toBe('11.222.333/0001-81');
  });
  it('formata parcial (5 dígitos)', () => {
    expect(formatCnpj('11222')).toBe('11.222');
  });
  it('formata parcial (8 dígitos)', () => {
    expect(formatCnpj('11222333')).toBe('11.222.333');
  });
  it('limita a 14 dígitos', () => {
    expect(formatCnpj('11222333000181999')).toBe('11.222.333/0001-81');
  });
});
