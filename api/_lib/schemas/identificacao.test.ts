import { describe, it, expect } from 'vitest';
import {
  CnpjSchema,
  EmailSchema,
  WhatsappBrSchema,
  IdentificacaoSchema,
  isValidCnpjChecksum,
} from './identificacao';

describe('isValidCnpjChecksum', () => {
  it('aceita CNPJ válido conhecido', () => {
    expect(isValidCnpjChecksum('11222333000181')).toBe(true);
  });
  it('rejeita CNPJ com checksum errado', () => {
    expect(isValidCnpjChecksum('11222333000180')).toBe(false);
  });
  it('rejeita repetição', () => {
    expect(isValidCnpjChecksum('11111111111111')).toBe(false);
  });
  it('rejeita comprimento inválido', () => {
    expect(isValidCnpjChecksum('1122233300018')).toBe(false);
  });
});

describe('CnpjSchema', () => {
  it('aceita CNPJ formatado e retorna apenas dígitos', () => {
    expect(CnpjSchema.parse('11.222.333/0001-81')).toBe('11222333000181');
  });
  it('aceita CNPJ raw', () => {
    expect(CnpjSchema.parse('11222333000181')).toBe('11222333000181');
  });
  it('rejeita 13 dígitos', () => {
    expect(() => CnpjSchema.parse('1122233300018')).toThrow();
  });
  it('rejeita checksum inválido', () => {
    expect(() => CnpjSchema.parse('11222333000180')).toThrow();
  });
  it('rejeita repetição (11111111111111)', () => {
    expect(() => CnpjSchema.parse('11111111111111')).toThrow();
  });
});

describe('EmailSchema', () => {
  it('aceita email válido e normaliza lowercase + trim', () => {
    expect(EmailSchema.parse('  Foo@Bar.COM  ')).toBe('foo@bar.com');
  });
  it('rejeita string sem @', () => {
    expect(() => EmailSchema.parse('not-an-email')).toThrow();
  });
});

describe('WhatsappBrSchema', () => {
  it('aceita móvel +55 + DDD + 9 + 8 dígitos', () => {
    expect(WhatsappBrSchema.parse('+5511987654321')).toBe('+5511987654321');
  });
  it('aceita fixo +55 + DDD + 8 dígitos', () => {
    expect(WhatsappBrSchema.parse('+551133334444')).toBe('+551133334444');
  });
  it('normaliza espaços e traços', () => {
    expect(WhatsappBrSchema.parse('+55 11 98765-4321')).toBe('+5511987654321');
  });
  it('rejeita sem +55', () => {
    expect(() => WhatsappBrSchema.parse('11987654321')).toThrow();
  });
  it('rejeita comprimento errado', () => {
    expect(() => WhatsappBrSchema.parse('+5511987654')).toThrow();
  });
});

describe('IdentificacaoSchema', () => {
  it('valida cnpj + email + whatsapp juntos', () => {
    const r = IdentificacaoSchema.parse({
      cnpj: '11.222.333/0001-81',
      email: 'CEO@empresa.com.br',
      whatsapp: '+55 11 98765-4321',
    });
    expect(r).toEqual({
      cnpj: '11222333000181',
      email: 'ceo@empresa.com.br',
      whatsapp: '+5511987654321',
    });
  });
});
