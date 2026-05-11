import { z } from 'zod';

/** Versão do payload — incrementar quando schema break-changes */
export const PAYLOAD_VERSION = 'v1' as const;
export type PayloadVersion = typeof PAYLOAD_VERSION;

/** Departamentos canônicos do questionário */
export const DEPARTAMENTOS = [
  'identificacao',
  'sac_geral',
  'financeiro',
  'suporte',
  'vendas',
] as const;
export type Departamento = typeof DEPARTAMENTOS[number];

/** CNPJ: 14 dígitos numéricos (sem máscara) */
const CnpjSchema = z.string().regex(/^\d{14}$/, 'CNPJ deve ter 14 dígitos');
const EmailSchema = z.string().email();

/**
 * Aceita ISO 8601 com offset OU string não-vazia (timestamps Postgres legacy
 * sem timezone explícito ainda existem em sessões antigas).
 */
const IsoDateTimeSchema = z.union([
  z.string().datetime({ offset: true }),
  z.string().min(1),
]);

/**
 * Envelope da sessão — espelha o formato real produzido por
 * `api/complete-onboarding.ts` agregando campos do banco
 * `onboarding_sessions`. Mantém `passthrough()` por enquanto pra não
 * quebrar com colunas novas (Plan 02-02 vai endurecer).
 */
export const SessionEnvelopeSchema = z
  .object({
    id: z.string().min(1),
    empresa_nome: z.string().min(1),
    ceo_email: EmailSchema.nullable(),
    cnpj: CnpjSchema.nullable(),
    created_at: IsoDateTimeSchema,
    access_token: z.string().nullable().optional(),
    tenant_id: z.string().nullable().optional(),
    pipeelo_token: z.string().nullable().optional(),
    responsaveis: z.record(z.union([z.string(), z.null()])).optional(),
    datas_conclusao: z.record(z.union([z.string(), z.null()])).optional(),
  })
  .passthrough();

export type SessionEnvelope = z.infer<typeof SessionEnvelopeSchema>;

/**
 * Respostas de um departamento são objetos arbitrários keyed por
 * `pergunta_id`. O conteúdo (string, número, objeto horário, etc.) é
 * heterogêneo — validação semântica fica no processor downstream.
 */
export const RespostasDepartmentSchema = z.record(z.unknown());

/** Mapa de departamento → respostas */
export const RespostasByDepartmentSchema = z
  .object({
    identificacao: RespostasDepartmentSchema.optional(),
    sac_geral: RespostasDepartmentSchema.optional(),
    financeiro: RespostasDepartmentSchema.optional(),
    suporte: RespostasDepartmentSchema.optional(),
    vendas: RespostasDepartmentSchema.optional(),
  })
  .passthrough();

export type RespostasByDepartment = z.infer<typeof RespostasByDepartmentSchema>;

/**
 * Payload completo trafegado entre onboarding-flow (sender)
 * e admin-pipeelo (receiver) via webhook
 * `POST /api/clients/onboarding/create`.
 *
 * `payload_version` é literal `'v1'` — mudança no shape exige bump
 * + suporte a múltiplas versões no receiver.
 */
export const OnboardingPayloadSchema = z.object({
  payload_version: z.literal(PAYLOAD_VERSION).default(PAYLOAD_VERSION),
  session: SessionEnvelopeSchema,
  respostas: RespostasByDepartmentSchema,
});

export type OnboardingPayload = z.infer<typeof OnboardingPayloadSchema>;

/**
 * @deprecated Use `OnboardingPayloadSchema`. Mantido em 02-01 só para
 * retrocompat dos sanity tests da Wave 0; será removido em Plan 02-02.
 */
export const OnboardingPayloadSkeletonSchema = OnboardingPayloadSchema;
export type OnboardingPayloadSkeleton = OnboardingPayload;
