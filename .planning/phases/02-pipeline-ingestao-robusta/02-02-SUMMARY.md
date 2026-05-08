---
phase: 02
plan: 02
slug: outbox-reconciliation-state-machine
subsystem: cross-repo-webhook-delivery
tags: [outbox, reconciliation, cron, state-machine, idempotency, fsm, retry, backoff]
status: complete
created: 2026-05-08
completed: 2026-05-08

dependency_graph:
  requires:
    - "02-01 (schema Zod + Idempotency-Key header já implementados)"
  provides:
    - "Tabela webhook_outbox com RLS estrita (service_role only) — fonte de verdade transacional"
    - "api/_lib/outbox.ts: enqueueOutbox/markInFlight/markDelivered/markFailedAttempt/deliverOutbox"
    - "complete-onboarding outbox-first: row pending criada ANTES do fetch + 202 queued_for_retry em falha inline"
    - "Cron /api/cron/reconcile-webhooks (5min) drena pending com backoff exp 30s→8h + jitter"
    - "State machine no admin: 7 estados + canTransition + isReentryAllowed"
    - "Receiver re-entry guard: sessão em processing/live/failed/needs_review → 200 skipped"
  affects:
    - "Toda Phase 4 (Jarvis cron) precisa decidir: ler de webhook_outbox direto ou só consumir onboarding_sessions?"
    - "Migration webhook_outbox precisa ser aplicada manualmente em staging/prod (Felipe)"
    - "CRON_SECRET precisa ser criado em Vercel envs antes do cron entrar em prod"

tech_stack:
  added:
    - "p-retry@^6.2.0 (instalado mas NÃO usado — backoff manual em markFailedAttempt cobre o caso)"
  patterns:
    - "Outbox transacional: row gravada antes do side-effect (fetch)"
    - "Optimistic concurrency: markInFlight guard por status='pending'"
    - "Idempotency dupla: session_id UNIQUE no outbox + state machine guard no receiver"
    - "FSM com transitions table + canTransition + assertTransition + InvalidTransitionError"
    - "Re-entry guard via isReentryAllowed (subset dos estados que aceitam webhook re-delivery)"
    - "Cron auth Bearer CRON_SECRET com fail-secure (env vazia → 401 sempre)"

key_files:
  created:
    - "C:/Users/dopeb/Desktop/pipeelo-onboarding-flow/supabase/migrations/20260509000000_webhook_outbox.sql"
    - "C:/Users/dopeb/Desktop/pipeelo-onboarding-flow/api/_lib/outbox.ts"
    - "C:/Users/dopeb/Desktop/pipeelo-onboarding-flow/api/_lib/outbox.test.ts"
    - "C:/Users/dopeb/Desktop/pipeelo-onboarding-flow/api/cron/reconcile-webhooks.ts"
    - "C:/Users/dopeb/Desktop/pipeelo-onboarding-flow/api/cron/reconcile-webhooks.test.ts"
    - "C:/Users/dopeb/Desktop/admin-pipeelo/lib/onboarding-state-machine.ts"
    - "C:/Users/dopeb/Desktop/admin-pipeelo/lib/onboarding-state-machine.test.ts"
  modified:
    - "C:/Users/dopeb/Desktop/pipeelo-onboarding-flow/api/complete-onboarding.ts"
    - "C:/Users/dopeb/Desktop/pipeelo-onboarding-flow/api/complete-onboarding.test.ts"
    - "C:/Users/dopeb/Desktop/pipeelo-onboarding-flow/vercel.json"
    - "C:/Users/dopeb/Desktop/pipeelo-onboarding-flow/package.json"
    - "C:/Users/dopeb/Desktop/admin-pipeelo/app/api/clients/onboarding/create/route.ts"
    - "C:/Users/dopeb/Desktop/admin-pipeelo/app/api/clients/onboarding/create/route.test.ts"

decisions:
  - "p-retry instalado mas NÃO usado: backoff manual em markFailedAttempt (30s * 2^attempt + jitter, cap 8h) é mais simples de testar com mock de Date.now e basta para o caso (cada cron run é uma 'tentativa', não há retry inline aninhado). p-retry fica disponível pra Phase 4."
  - "supabase-js NÃO suporta SELECT FOR UPDATE SKIP LOCKED. Mitigador: markInFlight com guard status='pending' + backoff aleatório evita double-deliver na maioria dos casos. Receiver é idempotente via session_id UNIQUE — double-deliver retorna 200 skipped no segundo POST. Locking forte fica para o lease pattern do Phase 4 Jarvis."
  - "enqueueOutbox usa upsert com ignoreDuplicates=true + SELECT separado para preservar status='delivered' em re-entries. Sem isso, segundo POST regrediria delivered → pending."
  - "Receiver retorna 200 action='skipped' (não 409 Conflict) em re-entry de sessão avançada. Sender precisa enxergar 200 como sucesso definitivo (markDelivered no outbox), não como erro retryable. 409 traria semântica de retry."
  - "isTerminal('failed') === false (não puramente terminal): admite reset → pending para ressuscitação manual via UI/script. live é o único estado puramente terminal."
  - "Receiver guard usa isReentryAllowed (subset {pending, in_progress}) ao invés de canTransition direto — mais explícito sobre intent (\"este status aceita webhook re-delivery?\") e desacopla regras de FSM gerais das regras específicas de re-entry."

metrics:
  duration_minutes: 9
  tasks_completed: 2
  tests_added: 38  # 12 outbox + 8 sender (refatorado, líquido +6) + 9 cron + 26 state-machine + 3 receiver
  files_created: 7
  files_modified: 6
  commits: 3

commits:
  - hash: "9a53d32"
    repo: "pipeelo-onboarding-flow"
    branch: "migration/vercel"
    message: "feat(02-02): outbox-first webhook delivery + idempotency (Task 1)"
  - hash: "2e1bf28"
    repo: "pipeelo-onboarding-flow"
    branch: "migration/vercel"
    message: "feat(02-02): reconciliation cron drena outbox pending (Task 2 / sender)"
  - hash: "3b734ed"
    repo: "admin-pipeelo"
    branch: "main"
    message: "feat(02-02): state machine + re-entry guard no receiver (Task 2 / admin)"

requirements:
  completed: [PIPE-04, PIPE-05, PIPE-06, PIPE-07]
---

# Phase 2 Plan 02-02: Outbox + Reconciliation + State Machine Summary

**One-liner:** Webhook complete-onboarding agora é outbox-first — row gravada no Postgres ANTES do fetch, cron drena pendentes a cada 5min com backoff exponencial 30s→8h, e state machine no admin bloqueia re-entry em sessões já avançadas. Pitfall 5 (webhook fire-and-forget = tenant perdido) está coberto.

## Objetivo Atingido

Plan 02-02 transforma a entrega do webhook complete-onboarding numa máquina transacional resiliente a falhas de rede:

1. **Outbox transacional** (`webhook_outbox`): toda intenção de POST grava primeiro uma row `pending` com payload JSON. RLS estrita (service_role only) — zero acesso anon.
2. **Sender outbox-first**: `complete-onboarding.ts` chama `enqueueOutbox` antes de qualquer fetch. Idempotency hit (sessão já delivered) retorna 200 sem refetch. Falha inline retorna 202 `queued_for_retry` (cliente vê sucesso, cron drena depois).
3. **Reconciliation cron** (`/api/cron/reconcile-webhooks`, schedule `*/5 * * * *`): drena pending com `next_retry_at <= now()`, processa em paralelo via `Promise.allSettled`, backoff exponencial 30s × 2^attempt + 30% jitter (cap 8h, 6 tentativas máximas).
4. **Idempotency dupla** (PIPE-06):
   - `session_id` UNIQUE no outbox impede dupla-fila no sender.
   - State machine guard no receiver impede sessão em `processing/live/failed/needs_review` de ser sobrescrita por re-entry de webhook.
5. **State machine** (PIPE-07): 7 estados (`pending/in_progress/completed/processing/live/failed/needs_review`) com transições explícitas, `canTransition`, `assertTransition` (lança `InvalidTransitionError`), `isTerminal`, `isReentryAllowed`.

Resultado prático: matar a conexão de rede no momento "Concluir Onboarding" = sessão chega no admin dentro de 5 minutos sem intervenção humana.

## Tasks Executadas

### Task 1 — Migration + outbox helper + outbox-aware sender (commit `9a53d32`)

**Arquivos criados:**

- `supabase/migrations/20260509000000_webhook_outbox.sql`: tabela `webhook_outbox` com 12 colunas (id/session_id UNIQUE/target_url/payload jsonb/status/attempt_count/max_attempts/last_error/next_retry_at/delivered_at/created_at/updated_at), 2 índices (status+next_retry_at parcial WHERE pending; session_id), RLS estrita com 4 policies restritivas (select/insert/update/delete bloqueados para roles públicos — service_role bypassa RLS), trigger updated_at.

- `api/_lib/outbox.ts`: 5 funções
  - `enqueueOutbox`: upsert com `onConflict='session_id', ignoreDuplicates=true` + SELECT separado para preservar status existente. Idempotente: row já delivered NÃO regride pra pending.
  - `markInFlight`: optimistic update com guard `status='pending'`.
  - `markDelivered`: status='delivered' + delivered_at.
  - `markFailedAttempt`: backoff exp 30s×2^attempt + 30% jitter (cap 8h). Se attempt+1 >= max → status='failed' terminal.
  - `deliverOutbox`: fetch com timeout 15s, keepalive=true, headers Idempotency-Key + Authorization Bearer, NÃO lança (sempre retorna `{ok, status?, body?}`).

- `api/_lib/outbox.test.ts`: 12 testes — enqueue happy path, idempotency hit não regride delivered, erro upsert → throw, markDelivered/markInFlight com SQL guards corretos, markFailedAttempt < max e >= max, last_error truncado a 500 chars, deliverOutbox 2xx/500/network/headers.

**Arquivos modificados:**

- `api/complete-onboarding.ts`: fluxo reescrito após o `safeParse` do Plan 02-01:
  1. enqueueOutbox(sessionId, targetUrl, validatedPayload) ANTES de qualquer fetch.
  2. Se outbox.status === 'delivered' → 200 idempotent_hit (sem refetch).
  3. markInFlight + deliverOutbox.
  4. Sucesso → markDelivered + 200.
  5. Falha → markFailedAttempt + 202 queued_for_retry.

- `api/complete-onboarding.test.ts`: refatorado para mockar outbox helpers (8 testes — happy path com call order verificada, idempotency hit, falha inline → 202, payload sem cnpj/email não toca outbox, departamentos incompletos não tocam outbox, PII-safe log preservado, payload tem payload_version+cnpj).

- `package.json`: `p-retry@^6.2.0` adicionado (não usado neste plano — backoff manual cobre o caso; reservado pra Phase 4).

**Resultado:** Suite onboarding-flow 149 passed (era 135, +14).

### Task 2A — Reconciliation cron (commit `2e1bf28`)

**Arquivos criados:**

- `api/cron/reconcile-webhooks.ts`: handler de cron com auth Bearer CRON_SECRET (fail-secure: env vazia → 401 sempre). Drena `WHERE status='pending' AND next_retry_at <= now() ORDER BY next_retry_at ASC LIMIT 25`. Processa em paralelo via `Promise.allSettled` — uma row falhar não derruba o batch. Retorna `{ok, processed, summary: {delivered, retry_scheduled, errored}}`.

- `api/cron/reconcile-webhooks.test.ts`: 9 testes — 401 sem header, 401 secret errado, 401 env vazio (fail-secure), 200 outbox vazio, drain happy path, drain com falha → markFailedAttempt, paralelismo multi-row mistura sucesso/falha, query filters corretos (status=pending, lte next_retry_at, order, limit=25), 500 db error.

**Arquivos modificados:**

- `vercel.json`: bloco `crons` adicionado com `{ path: '/api/cron/reconcile-webhooks', schedule: '*/5 * * * *' }`.

**Resultado:** Suite onboarding-flow 158 passed (era 149, +9).

### Task 2B — State machine + re-entry guard no admin (commit `3b734ed`)

**Arquivos criados:**

- `admin-pipeelo/lib/onboarding-state-machine.ts`: type `OnboardingStatus` (7 valores), `ALL_STATUSES`, `TRANSITIONS` table, `canTransition`, `assertTransition`, `InvalidTransitionError`, `isTerminal`, `REENTRY_ALLOWED` set, `isReentryAllowed`.

- `admin-pipeelo/lib/onboarding-state-machine.test.ts`: 26 testes (8 grupos `it.each` + casos individuais) — todas as 15 transições válidas via `it.each`, rejeições críticas (pending→live skip, live é terminal sem saída, completed→live precisa processar), assertTransition lança InvalidTransitionError com from/to corretos, isTerminal apenas live, isReentryAllowed apenas {pending, in_progress}.

**Arquivos modificados:**

- `admin-pipeelo/app/api/clients/onboarding/create/route.ts`:
  - Import `isReentryAllowed, type OnboardingStatus` do `@/lib/onboarding-state-machine`.
  - Select existingSession agora inclui `status` (era só `id`).
  - Antes do UPDATE, valida `isReentryAllowed(currentStatus)` — se false, retorna 200 `action='skipped' reason='session_already_advanced'` com `current_status` no body.
  - Insert usa `status: "pending" satisfies OnboardingStatus` (type-safety).

- `admin-pipeelo/app/api/clients/onboarding/create/route.test.ts`: 3 novos testes — re-entry em processing → 200 skipped (update NÃO chamado), re-entry em live → 200 skipped, re-entry em pending → 200 updated (allowed).

**Resultado:** Suite admin-pipeelo route+state-machine 50 passed; suite total 237 passed (era 190, +47 — outras adições intervenientes presentes).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] enqueueOutbox como upsert simples regrediria status delivered → pending em re-entry**

- **Found during:** Task 1, escrevendo teste de idempotency hit.
- **Issue:** O plano sugeria `upsert(..., { ignoreDuplicates: false })` o que UPDATE-aria a row inteira incluindo `status='pending'`. Em re-entry de uma sessão já delivered, isso regrediria o estado e dispararia uma entrega duplicada.
- **Fix:** Usar `ignoreDuplicates: true` (insert pula se conflito) + SELECT separado por session_id para retornar a row real (recém-criada OU existente intacta). Teste cobrindo: row delivered preservada com `delivered_at` original.
- **Files modified:** `api/_lib/outbox.ts`.
- **Commit:** `9a53d32`.

**2. [Rule 2 - Missing Critical] Cron sem fail-secure quando CRON_SECRET env não setado**

- **Found during:** Task 2A, escrevendo teste de auth.
- **Issue:** Plano original `if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET ?? ''}`)` — se CRON_SECRET vazio E header também `Bearer ` (string vazia depois), passaria! Vulnerabilidade de bypass se o env nunca for configurado em prod.
- **Fix:** Guard adicional `if (!process.env.CRON_SECRET || got !== expected)` — sem env, SEMPRE 401. Teste cobrindo: "401 quando CRON_SECRET env não setado (fail-secure)".
- **Files modified:** `api/cron/reconcile-webhooks.ts`.
- **Commit:** `2e1bf28`.

**3. [Rule 1 - Bug] p-retry instalado mas estratégia incompatível com cron stateless**

- **Found during:** Task 1 + Task 2A.
- **Issue:** Plano descrevia `pRetry(fn, {retries:5, factor:2, minTimeout:30000, maxTimeout:8h})`. Mas p-retry mantém estado em memória do processo — em cron serverless, cada invocação é stateless e processa N rows em UM batch sem dormir. p-retry seria útil pra retry inline DENTRO de uma chamada (poll exponencial até timeout), não pra agendar próxima tentativa em cron diferente.
- **Fix:** Backoff manual em `markFailedAttempt` (calcula `next_retry_at` e persiste no DB). Cada cron run é "uma tentativa" — bate com a semântica do outbox. p-retry permanece instalado pra Phase 4 (cron Jarvis pode usar para retries inline de chamadas LLM). Documentado no decisions[0].
- **Files modified:** `api/_lib/outbox.ts` (markFailedAttempt manual), `api/cron/reconcile-webhooks.ts` (sem p-retry).
- **Commit:** `9a53d32`.

**4. [Rule 2 - Missing Critical] Receiver guard usava transição genérica em vez de re-entry-specific**

- **Found during:** Task 2B, wiring no route.ts.
- **Issue:** Plano sugeria `if (!['pending', 'in_progress'].includes(currentStatus))` inline. Lógica de re-entry específica não pertence ao componente — pertence ao módulo da FSM (single source of truth).
- **Fix:** Adicionado `REENTRY_ALLOWED` set + `isReentryAllowed(status)` no state-machine.ts. Receiver chama `if (!isReentryAllowed(currentStatus))`. Refatoração explícita sobre intent ("este status aceita webhook re-delivery?") e ainda permite usar `canTransition` para outros consumidores (Phase 4 cron Jarvis).
- **Files modified:** `admin-pipeelo/lib/onboarding-state-machine.ts`, `admin-pipeelo/app/api/clients/onboarding/create/route.ts`.
- **Commit:** `3b734ed`.

## Auth Gates

Nenhum.

## Deferred Issues

**Pre-existing test failure (NÃO causado por Plan 02-02):**

- `admin-pipeelo/api/jarvis/_runtime/system-prompt.test.ts` falha com `Cannot find module './system-prompt'` — test file referencia módulo de produção que ainda não existe (Phase 4 jarvis runtime). Existia antes do Plan 02-02 começar; não alterado neste plano. Out of scope per scope boundary rule.

**Tasks pendentes para humano (Felipe, antes de prod):**

- Aplicar migration `20260509000000_webhook_outbox.sql` em staging (Plan 02-03 fará checkpoint para isso).
- Aplicar migration em prod após smoke em staging.
- Criar env var `CRON_SECRET` em Vercel (projeto pipeelo-onboarding-flow). Antes desse passo, o cron retornará 401 em todas as invocações — fail-secure intencional.
- Verificar que `ONBOARDING_WEBHOOK_TOKEN` está sincronizado entre `pipeelo-onboarding-flow` e `admin-pipeelo` (já era requirement, mas agora outbox cron depende dele).

## Hand-off para Plan 02-03 (rotação de tokens / docs)

- Outbox + cron operacionais — falta apenas aplicação de migration + env CRON_SECRET.
- State machine pronta para Phase 4 consumir (Jarvis cron transiciona `completed → processing → live | needs_review | failed` usando `assertTransition`).
- Receiver guard cobre re-entry pós-completed; Phase 4 precisa fazer transição explícita `completed → processing` via `assertTransition` antes de tomar lease da row.
- Migration tem RLS estrita — qualquer ferramenta de admin (futura UI) que precisar listar `webhook_outbox` precisa usar service_role.

## Self-Check

- [x] `supabase/migrations/20260509000000_webhook_outbox.sql` existe → FOUND
- [x] `api/_lib/outbox.ts` exporta enqueueOutbox/markInFlight/markDelivered/markFailedAttempt/deliverOutbox → FOUND
- [x] `api/_lib/outbox.test.ts` 12 testes verde → CONFIRMED (158 passed, +12 desde 02-01)
- [x] `api/complete-onboarding.ts` chama enqueueOutbox ANTES de fetch → FOUND
- [x] `api/cron/reconcile-webhooks.ts` existe com auth Bearer CRON_SECRET → FOUND
- [x] `api/cron/reconcile-webhooks.test.ts` 9 testes verde → CONFIRMED
- [x] `vercel.json` declara cron `*/5 * * * *` → FOUND
- [x] `admin-pipeelo/lib/onboarding-state-machine.ts` exporta canTransition + InvalidTransitionError + isReentryAllowed → FOUND
- [x] `admin-pipeelo/lib/onboarding-state-machine.test.ts` 26 testes verde → CONFIRMED
- [x] `admin-pipeelo/app/api/clients/onboarding/create/route.ts` usa isReentryAllowed → FOUND
- [x] Receiver retorna 200 action='skipped' em re-entry pós-completed → CONFIRMED via 3 novos testes
- [x] Commit `9a53d32` (Task 1 onboarding-flow) → FOUND (`git log`)
- [x] Commit `2e1bf28` (Task 2A onboarding-flow) → FOUND
- [x] Commit `3b734ed` (Task 2B admin-pipeelo) → FOUND
- [x] Suite onboarding-flow: 158 passed | 5 skipped | 7 todo (era 149) → CONFIRMED
- [x] Suite admin-pipeelo: 237 passed (route+state-machine isolado: 50/50) → CONFIRMED
- [x] PIPE-04 (outbox antes da tela de sucesso) → COMPLETO
- [x] PIPE-05 (reconciliation cron com backoff) → COMPLETO
- [x] PIPE-06 (idempotency via session_id UNIQUE + state machine guard) → COMPLETO
- [x] PIPE-07 (7 estados + canTransition) → COMPLETO

## Self-Check: PASSED
