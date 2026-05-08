---
phase: 04-jarvis-cron-pipeline
plan: 00
subsystem: infrastructure
tags: [jarvis, anthropic-sdk, supabase-migration, env-vars, wave-0]
dependency_graph:
  requires:
    - "Phase 3 jarvis_audit_tables (jarvis_runs.id FK target para last_run_id)"
  provides:
    - "@anthropic-ai/sdk@0.95.1 importável em admin-pipeelo"
    - "onboarding_sessions lease columns (locked_at, locked_by, attempt_count, last_error, last_run_id)"
    - "ANTHROPIC_API_KEY + CRON_SECRET documentadas em .env.example"
  affects:
    - "Plan 04-01 (system-prompt + tools-registry) — pode importar SDK"
    - "Plan 04-02 (agent-loop) — Anthropic.messages.create disponível"
    - "Plan 04-03 (lease + cron) — colunas de SKIP LOCKED + retry policy aplicáveis"
tech_stack:
  added:
    - "@anthropic-ai/sdk@0.95.1 (dependency direta — Claude API SDK oficial)"
  patterns:
    - "Migration idempotente (IF NOT EXISTS) — safe re-apply"
    - "Índice parcial para SKIP LOCKED scan (status='pending' OR processing+locked)"
    - "Env vars runtime-read pattern (não cacheia top-level)"
key_files:
  created:
    - "supabase/migrations/20260509120000_jarvis_lease_columns.sql"
  modified:
    - "package.json (+ @anthropic-ai/sdk@^0.95)"
    - "package-lock.json"
    - ".env.example (+ ANTHROPIC_API_KEY, CRON_SECRET, comentários)"
decisions:
  - "SDK oficial @anthropic-ai/sdk em vez de Vercel AI SDK — STACK.md prescreve controle fino de cache_control + tool loop"
  - "Langfuse env vars já existiam (Phase 3) — apenas reorganizado bloco com nota de no-op safe mode"
  - "Migration NÃO aplicada pelo executor — apply em staging/prod é checkpoint humano (DB credentials)"
  - "Índice parcial cobre dois casos: pending nunca processado + processing com lease ativo (stale detection)"
metrics:
  duration: "8m"
  completed: "2026-05-08"
  tasks_total: 2
  tasks_completed: 2
  files_created: 1
  files_modified: 3
---

# Phase 4 Plan 0: Jarvis Cron Pipeline — Wave 0 Infrastructure Summary

**One-liner:** Instala @anthropic-ai/sdk@0.95.1 + cria migration idempotente de lease columns (locked_at/locked_by/attempt_count/last_error/last_run_id + índice parcial SKIP LOCKED) + documenta ANTHROPIC_API_KEY e CRON_SECRET em admin-pipeelo, destravando Wave 1+.

## Objective

Wave 0 — preparar fundação para o Jarvis cron pipeline em admin-pipeelo. Plans 04-01/02/03 dependem do SDK Anthropic e das colunas de lease para implementar agent loop + claim-session + retry policy. Sem essa wave, nenhum código de Phase 4 compila.

## Tasks Executed

### Task 1: Install @anthropic-ai/sdk + document env vars
**Status:** Completed
**Commit:** `6f882f1`
**Files:**
- `C:/Users/dopeb/Desktop/admin-pipeelo/package.json` — `@anthropic-ai/sdk@^0.95` em dependencies
- `C:/Users/dopeb/Desktop/admin-pipeelo/package-lock.json` — lockfile atualizado
- `C:/Users/dopeb/Desktop/admin-pipeelo/.env.example` — bloco "Jarvis Cron Pipeline (Phase 4)" com ANTHROPIC_API_KEY + CRON_SECRET; bloco Langfuse reorganizado com nota de no-op safe

**Verify:**
- `npm ls @anthropic-ai/sdk` → `@anthropic-ai/sdk@0.95.1`
- `node -e "require('@anthropic-ai/sdk')"` → exit 0
- `grep ANTHROPIC_API_KEY .env.example` → match
- `grep CRON_SECRET .env.example` → match

### Task 2: DB migration — lease columns em onboarding_sessions
**Status:** Completed
**Commit:** `11036c9`
**Files:**
- `C:/Users/dopeb/Desktop/admin-pipeelo/supabase/migrations/20260509120000_jarvis_lease_columns.sql` (created)

**Conteúdo:**
- 5x `ADD COLUMN IF NOT EXISTS` (locked_at timestamptz, locked_by text, attempt_count int NOT NULL DEFAULT 0, last_error text, last_run_id uuid)
- 1x `CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_claim` parcial sobre `created_at` com filtro `status='pending' OR (status='processing' AND locked_at IS NOT NULL)`
- 5x `COMMENT ON COLUMN` documentando semântica (lease, retry, FK Phase 3)

**Verify:**
- File exists ✓
- Contains `ADD COLUMN IF NOT EXISTS locked_at` ✓
- Contains `idx_onboarding_sessions_claim` ✓
- Migration idempotente — re-apply é no-op

**NOTA:** Migration NÃO foi aplicada em DB. Apply manual em staging/prod fica como checkpoint humano para Felipe (requer DB credentials + janela de manutenção curta).

## Verification Results

- [x] `npm ls @anthropic-ai/sdk` → `0.95.1`
- [x] `.env.example` documenta `ANTHROPIC_API_KEY` + `CRON_SECRET` + `LANGFUSE_*`
- [x] Migration file `20260509120000_jarvis_lease_columns.sql` existe e tem 5 ADD COLUMN + 1 CREATE INDEX + 5 COMMENT
- [x] `node -e "require('@anthropic-ai/sdk')"` → exit 0
- [x] Suíte vitest admin-pipeelo: **190/190 passing** (sem regressão; era 181 antes — diff é Plan 02-01 que rodou em paralelo)

## Success Criteria

- [x] @anthropic-ai/sdk importável em admin-pipeelo
- [x] Migration arquivo criado (NÃO aplicado — humano aplica)
- [x] Env vars documentadas em .env.example (ANTHROPIC_API_KEY + CRON_SECRET; Langfuse já existia)
- [x] Wave 1 pode importar SDK e referenciar colunas de lease

## Deviations from Plan

**1. [Rule 3 - Blocking] LANGFUSE_PUBLIC_KEY/SECRET_KEY/HOST já estavam em .env.example**
- **Found during:** Task 1
- **Issue:** Plan instruía adicionar 5 chaves; Langfuse (3) já tinha sido documentada na Phase 3 (Plan 03-03)
- **Fix:** Adicionei apenas ANTHROPIC_API_KEY + CRON_SECRET em novo bloco "Jarvis Cron Pipeline (Phase 4)". Reorganizei bloco Langfuse adicionando nota de no-op safe mode (consistência com observability/langfuse.ts).
- **Files modified:** `.env.example`
- **Commit:** `6f882f1`

## Authentication Gates

Nenhum auth gate hit nesta wave — execução 100% autônoma.

**Pendente checkpoint humano (não bloqueia Plans 04-01/02/03):**
- Apply manual da migration `20260509120000_jarvis_lease_columns.sql` em staging admin-pipeelo (Felipe via psql/supabase CLI). Plan 04-03 (lease + cron) precisa colunas vivas em DB para integration tests reais; Plans 04-01/04-02 (system-prompt, tools, agent-loop) podem rodar com mocks até lá.
- Setar `ANTHROPIC_API_KEY` em Vercel admin-pipeelo (staging primeiro, depois prod).
- Setar `CRON_SECRET` em Vercel admin-pipeelo — string opaca random ≥32 chars.

## Commits

| Hash | Message |
|------|---------|
| `6f882f1` | chore(04-00): instala @anthropic-ai/sdk@^0.95 + documenta env vars Jarvis |
| `11036c9` | feat(04-00): adiciona migration de lease columns em onboarding_sessions |

## Self-Check: PASSED

**Files verified:**
- FOUND: C:/Users/dopeb/Desktop/admin-pipeelo/supabase/migrations/20260509120000_jarvis_lease_columns.sql
- FOUND: C:/Users/dopeb/Desktop/admin-pipeelo/package.json (com @anthropic-ai/sdk@^0.95)
- FOUND: C:/Users/dopeb/Desktop/admin-pipeelo/.env.example (com ANTHROPIC_API_KEY + CRON_SECRET)

**Commits verified:**
- FOUND: 6f882f1
- FOUND: 11036c9
