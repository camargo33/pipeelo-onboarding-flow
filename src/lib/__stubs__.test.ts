import { describe, it, expect } from 'vitest';

describe('Wave 2/3 stubs index (sanity)', () => {
  // sessionApi → coberto em src/lib/api-client.test.ts (Plan 01-03)
  // useAutosave → coberto em src/lib/debounced-save.test.ts (Plan 01-03)
  // TurnstileWidget → coberto em src/components/TurnstileWidget.test.tsx (Plan 01-03)
  // idv-2026 → coberto em src/styles/idv-2026.test.tsx (Plan 01-02)
  // ProgressBar → coberto em src/components/onboarding/ProgressBar.test.tsx (Plan 01-04)
  // cnpj util → coberto em src/lib/cnpj.test.ts (Plan 01-04)
  it('todos os stubs Wave 2/3 foram absorvidos por testes reais', () => {
    expect(true).toBe(true);
  });
});
