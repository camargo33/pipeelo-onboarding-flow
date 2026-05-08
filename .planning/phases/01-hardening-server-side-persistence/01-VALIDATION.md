---
phase: 1
slug: hardening-server-side-persistence
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-08
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Phase 1 establishes the test infrastructure that all subsequent phases depend on.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.x (instalado em Wave 0) |
| **Config file** | `vitest.config.ts` (criado em Wave 0) |
| **Quick run command** | `npm test -- --run --reporter=dot` |
| **Full suite command** | `npm test -- --run --coverage` |
| **Estimated runtime** | ~30 seconds (quick), ~90s (full + coverage) |
| **CI gate** | `node scripts/audit-no-supabase-from.mjs` (HARD-01 enforcement) |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --run --reporter=dot`
- **After every plan wave:** Run `npm test -- --run --coverage` + `node scripts/audit-no-supabase-from.mjs`
- **Before `/gsd:verify-work`:** Full suite green + audit script returns 0 exit code
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 1-00-01 | 00 | 0 | infra | install | `npm i -D vitest @vitest/coverage-v8 @testing-library/react @testing-library/jest-dom jsdom` | ✅ d6b27f6 | ✅ green |
| 1-00-02 | 00 | 0 | infra | scaffold | `test -f vitest.config.ts` | ✅ d6b27f6 | ✅ green |
| 1-00-03 | 00 | 0 | HARD-01 | gate | `node scripts/audit-no-supabase-from.mjs` | ✅ 1a8d561 | ⚠️ exit 1 esperado (pré-Wave 2) |
| 1-01-01 | 01 | 1 | HARD-01 | unit | `npm test -- api/sessions/create.test.ts` | ❌ W0 | ⬜ pending |
| 1-01-02 | 01 | 1 | HARD-01 | unit | `npm test -- api/sessions/get.test.ts` | ❌ W0 | ⬜ pending |
| 1-01-03 | 01 | 1 | HARD-02 | unit | `npm test -- api/sessions/save-answer.test.ts` | ❌ W0 | ⬜ pending |
| 1-01-04 | 01 | 1 | HARD-02 | unit | `npm test -- api/sessions/save-answer.idempotency.test.ts` | ❌ W0 | ⬜ pending |
| 1-01-05 | 01 | 1 | HARD-03 | unit | `npm test -- api/sessions/_lib/access.test.ts` | ❌ W0 | ⬜ pending |
| 1-02-01 | 02 | 1 | HARD-10 | visual | `npm test -- ui/idv-2026.test.tsx` (snapshot) | ❌ W0 | ⬜ pending |
| 1-02-02 | 02 | 1 | HARD-10 | manual | DevTools color-pick `#000D0A` + `#01d5ac` em prod preview | n/a | ⬜ pending |
| 1-03-01 | 03 | 2 | HARD-01,02 | integration | `npm test -- src/lib/sessionApi.test.ts` | ❌ W0 | ⬜ pending |
| 1-03-02 | 03 | 2 | HARD-02 | unit | `npm test -- src/hooks/useAutosave.test.ts` | ❌ W0 | ⬜ pending |
| 1-03-03 | 03 | 2 | HARD-07 | unit | `npm test -- src/components/TurnstileWidget.test.tsx` | ❌ W0 | ⬜ pending |
| 1-04-01 | 04 | 3 | HARD-07 | integration | `npm test -- api/_lib/ratelimit.test.ts` | ❌ W0 | ⬜ pending |
| 1-04-02 | 04 | 3 | HARD-05 | integration | `npm test -- api/_lib/brasilApi.test.ts` (mocked) | ❌ W0 | ⬜ pending |
| 1-04-03 | 04 | 3 | HARD-04 | integration | `npm test -- api/sessions/advance-department.test.ts` | ❌ W0 | ⬜ pending |
| 1-04-04 | 04 | 3 | HARD-06 | unit | `npm test -- src/components/ProgressBar.test.tsx` | ❌ W0 | ⬜ pending |
| 1-05-01 | 05 | 4 | HARD-08,09 | integration | `npm test -- tests/rls/onboarding-sessions.test.ts` (anon key denied) | ❌ W0 | ⬜ pending |
| 1-05-02 | 05 | 4 | HARD-01 | gate | `node scripts/audit-no-supabase-from.mjs` returns exit 0 | ❌ W0 | ⬜ pending |
| 1-05-03 | 05 | 4 | HARD-08 | smoke | manual: deploy preview + test fluxo completo | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `vitest.config.ts` — config base com jsdom env, coverage v8, paths alias `@/*`
- [x] `vitest.setup.ts` — jest-dom matchers + Supabase env mocks
- [x] `tests/_helpers/handler.ts` — helper para testar Vercel Functions sem `vercel dev`
- [x] `tests/_helpers/supabase-mock.ts` — service role client mock pra testes unit
- [x] `tests/_helpers/db-staging.ts` — connection string DB staging dedicado pra testes RLS reais
- [x] `scripts/audit-no-supabase-from.mjs` — script CI que retorna exit 1 se `supabase.from(` aparecer em `src/` fora de `src/integrations/`
- [x] `package.json` — scripts `test`, `test:coverage`, `audit:no-supabase-from`
- [x] `.github/workflows/ci.yml` (se ainda não existe) — roda audit + test em PRs
- [x] Stubs vazios pra todos os arquivos `*.test.ts` referenciados na tabela acima (failing tests OK, presence garantida)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| IDV 2026 paleta correta | HAR-10 | Cor visual exige inspeção humana | DevTools → inspecionar `body` e botões → confirmar `#000D0A` background, `#01d5ac` accent, Inter font-family |
| Logo Pipeelo oficial | HARD-10 | Validação visual do SVG | Confirmar logo oficial 2026 (não o PNG legado de 19/Apr) carregado em todas as telas |
| Smoke staging end-to-end | HARD-08 | Migração RLS em produção exige humano confirmar zero quebras | Após RLS lock migration: rodar fluxo completo em staging, validar resposta salva via API, magic link funciona, anon key bloqueada |
| Rollback drill | HARD-08 | Migração reversível exige confirmação manual | Aplicar `supabase db reset` + reaplicar até a migration anterior + validar relax_rls está de volta como rede de segurança |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter (after Wave 0 done)

**Approval:** pending
