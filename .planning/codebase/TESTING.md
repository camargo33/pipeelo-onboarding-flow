# Testing Patterns

**Analysis Date:** 2026-05-08

## Test Framework

**Status:** **No test infrastructure configured.** This project (newly migrated from Lovable to Vercel + Supabase próprio) currently has zero automated tests.

**Evidence:**
- `package.json` has no test runner dependencies (no `vitest`, `jest`, `@testing-library/*`, `@playwright/test`)
- `package.json` has no `test` script (only `dev`, `build`, `build:dev`, `lint`, `preview`, `vercel-build`)
- No config files: no `vitest.config.*`, no `jest.config.*`, no `playwright.config.*`
- No `*.test.*` or `*.spec.*` files in `src/` or `api/`
- The substring `vitest`, `jest`, `playwright`, `describe(`, `it(` only appears as part of unrelated identifiers (e.g., `playwrightCheck`, `digest`, `infinitesimal` strings inside `useOnboarding.ts`, `Onboarding.tsx`, `QuestionRenderer.tsx`, `time-picker.tsx`, `clock-time-picker.tsx`, `scripts/run-migrations.mjs`) — never as test API calls

**Run Commands:**
- None available.

## Test File Organization

Not applicable — no tests exist.

**Recommended structure when introducing tests** (Pipeelo stack default per global rules):
- Co-locate component tests next to source: `src/components/onboarding/QuestionRenderer.test.tsx`
- Hooks: `src/hooks/useOnboarding.test.ts`
- API handlers: `api/<handler>.test.ts` (or `api/__tests__/<handler>.test.ts`)
- E2E (Playwright): top-level `e2e/` directory

## Test Structure

Not applicable.

**Recommended pattern (Vitest + Testing Library, per Pipeelo global stack):**
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

describe('QuestionRenderer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renderiza pergunta do tipo text', () => {
    // Arrange / Act / Assert
  });
});
```

## Mocking

Not applicable.

**Recommended approach when adding tests:**
- Mock the Supabase client with `vi.mock('@/integrations/supabase/client', ...)` returning a chainable stub
- Mock `useToast` to assert toast calls without rendering Sonner
- For API handlers (`api/*.ts`), mock `requireSupabase` from `api/_lib/supabase.ts`
- Do NOT mock `react-router-dom` — wrap with `MemoryRouter` instead
- Do NOT mock `framer-motion` — let it render synchronously in JSDOM (or use `motion`'s reduced-motion mode)

## Fixtures and Factories

Not applicable.

**Recommended:**
- Use `src/lib/questions.json` as the canonical fixture for question data
- Build session/responses factories in `src/__fixtures__/onboarding.ts` when introducing tests

## Coverage

**Status:** No coverage configured or measured.

**Risk:** All flows ship untested. Highest-risk surfaces:
1. `evaluateConditional` in `src/hooks/useOnboarding.ts` (custom DSL parser for `&&`, `||`, `==`, `!=`, `includes` — manual string parsing without a grammar)
2. `expandHorarioSemanal` in `api/complete-onboarding.ts` (transforms business-hour shape sent to admin webhook)
3. Vercel API handlers (`api/create-session.ts`, `api/complete-onboarding.ts`, `api/provision-tenant.ts`, `api/send-email.ts`, `api/sync-department.ts`) — all interact with Supabase service role and external services

## Test Types

**Unit Tests:** None
**Integration Tests:** None
**E2E Tests:** None

## Manual Verification Patterns

In absence of automated tests, the project relies on:
- **Browser smoke testing on Vercel preview deploys** before promoting to production (per global rule `feedback_testar_antes_deploy.md`)
- **Schema validation script:** `scripts/validate-schema.mjs` — runs against Supabase to verify table shape
- **Region probe:** `scripts/probe-region.mjs` — connectivity / latency check
- **Migrations runner:** `scripts/run-migrations.mjs` — applies SQL migrations from `supabase/migrations/`
- ESLint via `npm run lint` for static checks

## Common Patterns

Not applicable — no test patterns established.

## Recommendations for Future Test Setup

When tests are introduced, align with Pipeelo global stack:

1. **Install:** `vitest`, `@vitest/ui`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom`
2. **Add `vitest.config.ts`** with path alias `@/* → ./src/*` (mirror `tsconfig.app.json`)
3. **Add scripts** to `package.json`: `"test": "vitest"`, `"test:ui": "vitest --ui"`, `"test:coverage": "vitest --coverage"`
4. **Priority targets** (highest risk first):
   - `src/hooks/useOnboarding.ts` — `evaluateConditional` with table-driven tests for each operator (`==`, `!=`, `includes`, `&&`, `||`, parentheses, malformed input)
   - `api/complete-onboarding.ts` — `expandHorarioSemanal` shape transformation
   - `api/create-session.ts` — input validation (rejects empty `empresa_nome`, accepts valid payload)
5. **E2E (Playwright)** for the full onboarding flow: create session → answer all 5 departments → trigger webhook → verify completion

---

*Testing analysis: 2026-05-08*
