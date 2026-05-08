import { describe, it, expect } from 'vitest';
import { OnboardingPayloadSkeletonSchema, PAYLOAD_VERSION } from './onboarding-payload';

describe('OnboardingPayloadSkeletonSchema', () => {
  it('exporta PAYLOAD_VERSION = v1', () => {
    expect(PAYLOAD_VERSION).toBe('v1');
  });

  it('aceita payload mínimo com session.id e respostas', () => {
    const r = OnboardingPayloadSkeletonSchema.safeParse({
      session: { id: 'abc' },
      respostas: {},
    });
    expect(r.success).toBe(true);
  });

  it('rejeita payload sem session.id', () => {
    const r = OnboardingPayloadSkeletonSchema.safeParse({
      session: {},
      respostas: {},
    });
    expect(r.success).toBe(false);
  });

  it('default payload_version = v1', () => {
    const r = OnboardingPayloadSkeletonSchema.parse({
      session: { id: 'x' },
      respostas: {},
    });
    expect(r.payload_version).toBe('v1');
  });
});
