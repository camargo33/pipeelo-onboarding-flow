import { describe, it, expect } from 'vitest';
import {
  OnboardingPayloadSchema,
  OnboardingPayloadSkeletonSchema,
  PAYLOAD_VERSION,
  DEPARTAMENTOS,
  SessionEnvelopeSchema,
  RespostasByDepartmentSchema,
  type OnboardingPayload,
} from './onboarding-payload';

const validPayload = {
  session: {
    id: 'sess_abc123',
    empresa_nome: 'ISP Teste LTDA',
    ceo_email: 'ceo@isp.com',
    cnpj: '11222333000181',
    created_at: '2026-05-08T12:00:00Z',
  },
  respostas: {
    identificacao: { empresa_nome: 'ISP Teste LTDA' },
    sac_geral: {},
  },
};

describe('OnboardingPayloadSchema (Plan 02-01)', () => {
  it('exporta PAYLOAD_VERSION = v1', () => {
    expect(PAYLOAD_VERSION).toBe('v1');
  });

  it('exporta DEPARTAMENTOS canônicos', () => {
    expect(DEPARTAMENTOS).toEqual([
      'identificacao',
      'sac_geral',
      'financeiro',
      'suporte',
      'vendas',
    ]);
  });

  it('aceita payload válido completo', () => {
    const r = OnboardingPayloadSchema.safeParse(validPayload);
    expect(r.success).toBe(true);
  });

  it('default payload_version = v1 quando ausente', () => {
    const r = OnboardingPayloadSchema.parse(validPayload);
    expect(r.payload_version).toBe('v1');
  });

  it('aceita payload_version explícito v1', () => {
    const r = OnboardingPayloadSchema.parse({
      ...validPayload,
      payload_version: 'v1',
    });
    expect(r.payload_version).toBe('v1');
  });

  it('rejeita payload_version desconhecido (v2)', () => {
    const r = OnboardingPayloadSchema.safeParse({
      ...validPayload,
      payload_version: 'v2',
    });
    expect(r.success).toBe(false);
  });

  it('rejeita session sem cnpj — issues[].path = ["session","cnpj"]', () => {
    const { cnpj: _omit, ...sessionSemCnpj } = validPayload.session;
    void _omit;
    const r = OnboardingPayloadSchema.safeParse({
      ...validPayload,
      session: sessionSemCnpj,
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const cnpjIssue = r.error.issues.find(
        (i) => i.path.join('.') === 'session.cnpj',
      );
      expect(cnpjIssue).toBeDefined();
    }
  });

  it('rejeita cnpj com 13 dígitos (regex 14)', () => {
    const r = OnboardingPayloadSchema.safeParse({
      ...validPayload,
      session: { ...validPayload.session, cnpj: '1122233300018' },
    });
    expect(r.success).toBe(false);
  });

  it('rejeita ceo_email inválido', () => {
    const r = OnboardingPayloadSchema.safeParse({
      ...validPayload,
      session: { ...validPayload.session, ceo_email: 'nao-eh-email' },
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const emailIssue = r.error.issues.find(
        (i) => i.path.join('.') === 'session.ceo_email',
      );
      expect(emailIssue).toBeDefined();
    }
  });

  it('rejeita session sem empresa_nome', () => {
    const { empresa_nome: _omit, ...semNome } = validPayload.session;
    void _omit;
    const r = OnboardingPayloadSchema.safeParse({
      ...validPayload,
      session: semNome,
    });
    expect(r.success).toBe(false);
  });

  it('rejeita session sem ceo_email', () => {
    const { ceo_email: _omit, ...semEmail } = validPayload.session;
    void _omit;
    const r = OnboardingPayloadSchema.safeParse({
      ...validPayload,
      session: semEmail,
    });
    expect(r.success).toBe(false);
  });

  it('aceita respostas com 5 deptos opcionais', () => {
    const r = RespostasByDepartmentSchema.safeParse({
      identificacao: {},
      sac_geral: { foo: 'bar' },
      financeiro: { tipo_bloqueio: 'automatico' },
      suporte: {},
      vendas: { combos_disponiveis: 'sim' },
    });
    expect(r.success).toBe(true);
  });

  it('aceita respostas vazias (objeto sem nenhum depto)', () => {
    const r = OnboardingPayloadSchema.safeParse({
      ...validPayload,
      respostas: {},
    });
    expect(r.success).toBe(true);
  });

  it('aceita campos opcionais da sessão (responsaveis, datas_conclusao, tenant_id)', () => {
    const r = OnboardingPayloadSchema.safeParse({
      ...validPayload,
      session: {
        ...validPayload.session,
        responsaveis: { sac_geral: 'Fulano' },
        datas_conclusao: { sac_geral: '2026-05-08T12:00:00Z' },
        tenant_id: null,
        pipeelo_token: null,
        access_token: 'tok-x',
      },
    });
    expect(r.success).toBe(true);
  });

  it('SessionEnvelopeSchema permite passthrough de campos extras', () => {
    const r = SessionEnvelopeSchema.safeParse({
      ...validPayload.session,
      campo_novo_inesperado: 'ok',
    });
    expect(r.success).toBe(true);
  });

  it('OnboardingPayload tipo z.infer compila com shape correto', () => {
    // Compile-time check via assignment
    const p: OnboardingPayload = {
      payload_version: 'v1',
      session: validPayload.session,
      respostas: validPayload.respostas,
    };
    expect(p.session.cnpj).toBe('11222333000181');
  });

  it('OnboardingPayloadSkeletonSchema (deprecated) é alias do schema completo', () => {
    expect(OnboardingPayloadSkeletonSchema).toBe(OnboardingPayloadSchema);
  });
});
