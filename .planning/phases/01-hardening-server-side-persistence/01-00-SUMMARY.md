---
phase: 01-hardening-server-side-persistence
plan: 00
subsystem: test-infrastructure
tags: [vitest, ci, audit, hard-01, wave-0]
requires: []
provides:
  - vitest-config
  - test-helpers
  - audit-script-hard-01
  - ci-workflow
affects:
  - package.json
  - tsconfig.app.json
tech_stack:
  added:
    - "vitest@^4.1.5"
    - "@vitest/coverage-v8@^4.1.5"
    - "@vitest/ui@^4.1.5"
    - "@testing-library/react@^16.3.2"
    - "@testing-library/jest-dom@^6.9.1"
    - "jsdom@^29.1.1"
    - "supertest@^7.2.2"
    - "@types/supertest@^7.2.0"
  patterns:
    - "Vitest 4 com ambiente jsdom + alias @/* → src/*"
    - "Audit cross-platform via fs walk (sem dependência de git/grep)"
    - "Stubs it.todo para garantir presença de arquivos referenciados em VALIDATION.md"
key_files:
  created:
    - vitest.config.ts
    - vitest.setup.ts
    - tests/_helpers/handler.ts
    - tests/_helpers/supabase-mock.ts
    - tests/_helpers/db-staging.ts
    - scripts/audit-no-supabase-from.mjs
    - .github/workflows/ci.yml
    - api/sessions/__stubs__.test.ts
    - src/lib/__stubs__.test.ts
    - tests/rls/__stubs__.test.ts
  modified:
    - package.json
    - tsconfig.app.json
decisions:
  - "Audit script via fs walk + regex em vez de git grep — Windows/PowerShell quebra com '\\x27' e ':!' magic-pathspec"
  - "CI step de audit com continue-on-error: true até Wave 2 (Plan 03) completar migração"
  - "Vitest 4.x (não 2.x do plan) — release atual; reporter 'basic' substituído por default"
metrics:
  duration_minutes: 3
  tasks_completed: 3
  files_created: 10
  files_modified: 2
  commits: 3
  completed_date: 2026-05-08
---

# Phase 01 Plan 00: Wave 0 Test Infrastructure Summary

Estabeleceu Vitest 4 + jsdom + helpers + audit script HARD-01 + CI workflow para destravar Waves 1-4 de hardening RLS server-side.

## Objective Recap

Wave 0 BLOCKING: zero testes existiam no projeto. Migrate-then-lock (Pitfall 4) exige automação confiável antes de tocar RLS em prod. Audit `supabase.from(onboarding_*)` é gate inegociável de HARD-01.

## What Was Built

### 1. Vitest Test Infrastructure
- `vitest.config.ts` — jsdom env + alias `@/* → src/*` + coverage v8
- `vitest.setup.ts` — jest-dom matchers + mocks de env vars (Supabase, Upstash, Turnstile)
- `tsconfig.app.json` — types `vitest/globals` + `@testing-library/jest-dom`
- 4 scripts npm: `test`, `test:watch`, `test:coverage`, `audit:no-supabase-from`

### 2. Test Helpers
- `tests/_helpers/handler.ts` — `invokeHandler(handler, input)` simula `VercelRequest/Response` sem subir `vercel dev`. Captura `status`, `json/send body`, e mock de `setHeader`.
- `tests/_helpers/supabase-mock.ts` — `makeSupabaseMock(overrides)` retorna fluent chain compatível com `.from().select().eq().single()/maybeSingle()`. Customizável por teste via overrides.
- `tests/_helpers/db-staging.ts` — stub minimal expondo `STAGING_DB_URL`, `STAGING_ANON_KEY`, `isStagingConfigured()` para skip condicional em testes RLS reais (Wave 4).

### 3. Audit Script HARD-01
- `scripts/audit-no-supabase-from.mjs` — walk recursivo em `src/` (excluindo `src/integrations/`, `node_modules/`, `.git/`) procurando regex `/supabase\s*\.\s*from\s*\(\s*['"]onboarding_(sessions|respostas)['"]/`.
- Hoje detecta 9 ocorrências em `Onboarding.tsx`, `OnboardingSession.tsx`, `AdminOnboarding.tsx` → exit 1 (esperado).
- Cross-platform (Windows/Linux/macOS) — sem dependência de `git grep` ou shell.

### 4. Test Stubs (it.todo)
- `api/sessions/__stubs__.test.ts` — 7 todos (create, get, save-resposta x2, access TTL, advance gate, ratelimit)
- `src/lib/__stubs__.test.ts` — 5 todos (sessionApi, useAutosave, TurnstileWidget, ProgressBar, idv-2026)
- `tests/rls/__stubs__.test.ts` — 1 todo (anon key permission_denied pós-lock)

### 5. CI Workflow
- `.github/workflows/ci.yml` — jobs em PRs e push para `main`/`migration/vercel`:
  1. `npm ci`
  2. `npm run audit:no-supabase-from` (com `continue-on-error: true` até Wave 2)
  3. `npm test -- --run`

## Verification Results

| Check | Expected | Actual | Status |
|-------|----------|--------|--------|
| `npm test -- --run` | exit 0 | exit 0 (3 skipped, 13 todo) | PASS |
| `node scripts/audit-no-supabase-from.mjs` | exit 1 hoje | exit 1 (9 ocorrências) | PASS (esperado) |
| `vitest.config.ts`, `vitest.setup.ts` existem | yes | yes | PASS |
| 5 helpers/scripts/workflow criados | 5 | 5 | PASS |
| Stubs cobrem Wave 1-4 references | 13 it.todo | 13 it.todo | PASS |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocker] Audit script reescrito de `git grep` para `fs walk`**
- **Found during:** Task 2 verificação
- **Issue:** O comando `git grep -nE "supabase\.from\([\"\x27]onboarding_..." -- src/ ":!src/integrations/"` falhou no Windows com erro `O sistema não pode encontrar o caminho especificado`. Causa: `child_process.execSync` no PowerShell/Windows não interpreta corretamente `\x27` (apóstrofo escapado) e o magic-pathspec `:!` do git grep.
- **Fix:** Reimplementado em puro Node fs walk + regex. Mesmo comportamento (exit 1 com listagem; exit 0 quando limpo) sem dependência de shell ou git.
- **Files modified:** `scripts/audit-no-supabase-from.mjs`
- **Commit:** `1a8d561`

### Minor Adjustments

**2. Vitest 4.x em vez de 2.x**
- npm install instalou `vitest@^4.1.5` (release atual). Plan dizia 2.x.
- Impact: `--reporter=basic` foi removido em Vitest 4. Comandos do plan ajustados para usar default reporter (output equivalente).
- Sem impacto funcional para Wave 0; helpers e API de teste idênticos.

**3. CI step de audit com `continue-on-error: true`**
- Plan previa essa nota como opcional. Aplicado por padrão para não bloquear merges em Wave 0/1 (audit é esperado falhar até Plan 03 completar). Remover ao iniciar Wave 2 closure.

## Auth Gates

Nenhum encontrado nesta Wave 0 (puro setup local de tooling).

## Commits

| # | Hash | Message |
|---|------|---------|
| 1 | `d6b27f6` | chore(01-00): instalar Vitest + config base com jsdom e alias @/ |
| 2 | `1a8d561` | feat(01-00): helpers de teste + audit script HARD-01 |
| 3 | `8131820` | test(01-00): stubs it.todo + CI workflow audit + vitest |

## Next Steps

- Wave 1 (Plan 01): construir `/api/sessions/{create,get,save-resposta,advance-department}` com tests reais substituindo todos.
- Wave 2 (Plan 03): migrar páginas `Onboarding.tsx`, `OnboardingSession.tsx`, `NovoOnboarding.tsx` para usar `sessionApi` em vez de `supabase.from(...)`. Audit script deve retornar exit 0 ao final.
- Após audit green: remover `continue-on-error: true` no `.github/workflows/ci.yml` para travar HARD-01 como gate hard de PR.

## Self-Check: PASSED

- vitest.config.ts: FOUND
- vitest.setup.ts: FOUND
- tests/_helpers/handler.ts: FOUND
- tests/_helpers/supabase-mock.ts: FOUND
- tests/_helpers/db-staging.ts: FOUND
- scripts/audit-no-supabase-from.mjs: FOUND
- .github/workflows/ci.yml: FOUND
- api/sessions/__stubs__.test.ts: FOUND
- src/lib/__stubs__.test.ts: FOUND
- tests/rls/__stubs__.test.ts: FOUND
- Commit d6b27f6: FOUND
- Commit 1a8d561: FOUND
- Commit 8131820: FOUND
