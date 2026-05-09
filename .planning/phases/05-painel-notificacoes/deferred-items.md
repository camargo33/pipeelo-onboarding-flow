# Deferred Items — Phase 05

## From Plan 05-03 execution (2026-05-08)

### Pre-existing build issue (NOT caused by 05-03)
- **File:** `admin-pipeelo/app/api/clients/onboarding/create/route.ts`
- **Symptom:** `npm run build` (Turbopack) → `Module not found: Can't resolve 'pipeelo-onboarding-contracts'`
- **Root:** Turbopack module resolution doesn't follow `file:../pipeelo-onboarding-flow/contracts` linkage in monorepo-style setup
- **Workaround:** `npm test` (vitest) resolves it via path alias correctly — 312/312 tests verdes
- **Owner:** Phase 02 (originated 02-01/02-02 commits)
- **Action:** ignore for 05-03; revisitar antes do cutover Phase 6 (real deploy)

### Plan 05-00 + 05-02 não executados formalmente
- 05-01 SHIPPED (templates React Email)
- 05-00 (deps + DNS humano) e 05-02 (email-sender + idempotency lib) ficaram como gaps
- 05-03 contornou criando endpoint cross-repo `/api/email/send-failure-alert` que usa Resend direto + email_log idempotency UNIQUE diretamente (sem `email-sender.ts` shared lib)
- **Action:** quando 05-02 for executado, refactor opcional pra reusar `sendTransactionalEmail` (não bloqueia)

### Test rendering JSX (SessionsTable)
- Vitest config usa `environment: 'node'` sem jsdom/@testing-library
- Plan pedia `__tests__/onboarding-sessions/SessionsTable.test.tsx` com render real
- Substituído por `components/onboarding-sessions/types.test.ts` cobrindo invariantes do contract (STATUS_CONFIG, options, shape)
- **Action:** se desejar render-test, instalar `@testing-library/react + happy-dom` e setar environment per-file
