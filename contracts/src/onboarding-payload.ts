import { z } from 'zod';

/** Versão do payload — incrementar quando schema break-changes */
export const PAYLOAD_VERSION = 'v1' as const;
export type PayloadVersion = typeof PAYLOAD_VERSION;

/**
 * Skeleton — schema completo será definido em Plan 02-01 com base em
 * api/complete-onboarding.ts (formato atual de payload).
 * Por ora aceita qualquer shape com session.id obrigatório (sanity guard).
 */
export const OnboardingPayloadSkeletonSchema = z.object({
  payload_version: z.literal(PAYLOAD_VERSION).default(PAYLOAD_VERSION),
  session: z
    .object({
      id: z.string().min(1),
    })
    .passthrough(),
  respostas: z.record(z.unknown()),
});

export type OnboardingPayloadSkeleton = z.infer<typeof OnboardingPayloadSkeletonSchema>;
