---
phase: 03-tool-layer-audit
plan: 00
subsystem: tool-layer-infra-bootstrap
tags: [tool-04, wave-0, vitest-scaffold, jarvis-runtime, audit-tables, idempotency, ddl-only]
requires: []
provides:
  - admin-pipeelo-vitest-config
  - admin-pipeelo-tests-setup
  - jarvis-runtime-folder-structure
  - jarvis-audit-tables-ddl
  - jarvis-audit-rollback-script
affects:
  - C:/Users/dopeb/Desktop/admin-pipeelo/vitest.config.ts
  - C:/Users/dopeb/Desktop/admin-pipeelo/package.json
tech_stack:
  added:
    - "@vitest/coverage-v8@^4 (coverage provider)"
  patterns:
    - "Vitest globals=false + setupFiles via tests/setup.ts — explicit imports nos test files"
    - "afterEach restoreMocks/unstubEnvs/unstubGlobals como hygiene padrão"
    - "Coverage scoped a api/jarvis/_runtime/** — não polui report com legacy"
    - ".gitkeep para preservar estrutura de pastas vazias no git"
    - "Migration DDL only + rollback SQL pareado (rede de segurança <5min)"
    - "RLS enabled sem policies = service_role only (backend exclusivo)"
key_files:
  created:
    - C:/Users/dopeb/Desktop/admin-pipeelo/tests/setup.ts
    - C:/Users/dopeb/Desktop/admin-pipeelo/api/jarvis/_runtime/tools/_shared/.gitkeep
    - C:/Users/dopeb/Desktop/admin-pipeelo/api/jarvis/_runtime/tools/.gitkeep
    - C:/Users/dopeb/Desktop/admin-pipeelo/api/jarvis/_runtime/observability/.gitkeep
    - C:/Users/dopeb/Desktop/admin-pipeelo/supabase/migrations/20260509000000_jarvis_audit_tables.sql
    - C:/Users/dopeb/Desktop/admin-pipeelo/scripts/rollback-jarvis-audit-tables.sql
  modified:
    - C:/Users/dopeb/Desktop/admin-pipeelo/vitest.config.ts
    - C:/Users/dopeb/Desktop/admin-pipeelo/package.json
    - C:/Users/dopeb/Desktop/admin-pipeelo/package-lock.json
decisions:
  - "Vitest globals=false (vs config legacy globals=true): força imports explícitos `from 'vitest'`, alinhado com V4 prompt-optimizer tests. 26 test files / 89 tests pré-existentes seguem verdes."
  - "Include amplo (app|lib|api|tests/**/*.test.ts): substitui include hardcoded de V4. Permite Plans 03-01..03-03 colocarem tests em api/jarvis/_runtime/** sem editar config."
  - "Coverage include scoped só em api/jarvis/_runtime/**: relatório foca no que esta phase produz, não polui com legacy lib/."
  - "exclude lib/debugger/_attic/**: legacy quarantine — não roda nem entra em coverage."
  - "Migration DDL only (não aplicada): humano roda em smoke window com creds prod. Plan declara isso explícito em <action>."
  - "RLS enabled sem policies (vs policies permissivas): service_role bypassa RLS automaticamente. Anon/authenticated bloqueados sem precisar definir DENY policy."
  - "PK composto idempotency_keys (session_id, tool, args_hash) vs surrogate id: dedupe natural via UPSERT ON CONFLICT, sem index extra."
  - "FK jarvis_tool_calls.run_id ON DELETE CASCADE: limpeza de runs órfãos elimina tool_calls automaticamente. Operacionalmente útil em backfill/dev."
  - ".gitkeep em 3 pastas runtime: preserva layout antes dos Plans 03-01..03 escreverem código real. Sinaliza intent arquitetural já no commit Wave 0."
metrics:
  duration_minutes: 4
  tasks_completed: 2
  files_created: 6
  files_modified: 3
  commits: 2
  completed_date: "2026-05-08"
---

# Phase 3 Plan 00: Tool Layer Infra Bootstrap Summary

Wave 0 do tool layer Jarvis: Vitest scaffolded em admin-pipeelo (config + setup + coverage v8), estrutura `api/jarvis/_runtime/{tools,tools/_shared,observability}` criada via .gitkeep, e DDL das 3 tabelas de audit (`jarvis_runs`, `jarvis_tool_calls`, `idempotency_keys`) + rollback SQL pareado — pronto para humano aplicar em smoke window.

## Repository Context

**Working repo:** `C:/Users/dopeb/Desktop/admin-pipeelo` (Next.js 15)
**Planning artifacts:** `C:/Users/dopeb/Desktop/pipeelo-onboarding-flow/.planning/`
**Cross-repo by design:** plan/state vivem no onboarding-flow; código vive no admin-pipeelo.

## What Was Built

### Task 1 — Vitest config + jarvis runtime structure

**Commit:** `29e8696`

- `vitest.config.ts` reescrito: `globals: false`, `setupFiles: ['./tests/setup.ts']`, `include: [app|lib|api|tests/**/*.test.ts]`, `coverage.include: ['api/jarvis/_runtime/**/*.ts']`, exclude legacy `lib/debugger/_attic/**`, alias `@` → repo root.
- `tests/setup.ts`: `afterEach` restora mocks + unstub envs + unstub globals (Vitest 4 hygiene).
- `@vitest/coverage-v8@^4` instalado em devDependencies.
- 3 `.gitkeep` em `api/jarvis/_runtime/{tools,tools/_shared,observability}/`.

**Verificação:**
- `npm test` → exit 0, 26 test files / 89 tests passed (V4 prompt-optimizer pré-existente).
- `npx vitest run --passWithNoTests` → exit 0 confirmado.

### Task 2 — Migration jarvis_audit_tables (DDL only)

**Commit:** `b222897`

- `supabase/migrations/20260509000000_jarvis_audit_tables.sql`:
  * `jarvis_runs` — 1 row por agent run. Tokens (input/output/cache_read/cache_write), status enum (pending/running/completed/failed/needs_review), langfuse_trace_id, error jsonb. Indexes em `session_id` e `(status, started_at DESC)`.
  * `jarvis_tool_calls` — 1 row por tool dispatch. FK `run_id` ON DELETE CASCADE, `idempotent_hit boolean`, langfuse_span_id. Indexes em `run_id`, `(session_id, created_at DESC)`, `tool_name`.
  * `idempotency_keys` — PK composto `(session_id, tool, args_hash)`, result jsonb, external_id (id externo Pipeelo após criação). Index em `created_at DESC` para purge.
  * RLS enabled em todas, zero policies = service_role only.
  * COMMENT ON TABLE em todas documentando intent.
- `scripts/rollback-jarvis-audit-tables.sql` — `DROP TABLE IF EXISTS ... CASCADE` em ordem reversa de dependências (jarvis_tool_calls primeiro, depois idempotency_keys, depois jarvis_runs).

**Verificação:** Script Node.js inline confere presença de todos os `CREATE TABLE IF NOT EXISTS`, PK composto, e `DROP TABLE IF EXISTS` no rollback. Exit 0.

## Decisions Made

Ver frontmatter `decisions:`.

## Deviations from Plan

**None — plan executed exactly as written.**

Observação fora de escopo (não fixada): arquivo `lib/prompt-optimizer/v4/blueprint/__snapshots__/serialize.test.ts.snap` aparecia como modificado no `git status` pré-Task-1. Não tocado, não staged — pré-existente e não relacionado a esta plan. Logado aqui como awareness, não como deviation.

## Authentication Gates

Nenhum.

## What's Next

- **Plan 03-01 (Wave 1):** `api/jarvis/_runtime/tools/_shared/http.ts` (cliente HTTP com retry/timeout) + idempotency wrapper. Depende dos folders criados aqui.
- **Plan 03-02 (Wave 2):** 7 tools determinísticas em `api/jarvis/_runtime/tools/*.ts` (create_tenant, configure_api, etc.). Depende de Wave 1.
- **Plan 03-03 (Wave 3):** Langfuse integration em `api/jarvis/_runtime/observability/`. Depende de Wave 2.
- **Manual gate antes de Plan 03-03:** Felipe aplica `20260509000000_jarvis_audit_tables.sql` em staging + smoke + drill rollback + apply prod. Sem isso, Plan 03-03 não consegue persistir tool calls.

## Self-Check: PASSED

Verificações:
- vitest.config.ts existe e carrega: confirmado via `npm test` exit 0
- tests/setup.ts existe: criado
- 3 .gitkeep em api/jarvis/_runtime/{tools,tools/_shared,observability}/: criados
- supabase/migrations/20260509000000_jarvis_audit_tables.sql existe + 3 CREATE TABLE + PK composto + RLS enable: confirmado via verify automated
- scripts/rollback-jarvis-audit-tables.sql existe + DROP idempotente: confirmado
- Commit `29e8696` (Task 1) existe: `git log --oneline | grep 29e8696` OK
- Commit `b222897` (Task 2) existe: `git log --oneline | grep b222897` OK
- @vitest/coverage-v8 listado em devDependencies do package.json: confirmado
