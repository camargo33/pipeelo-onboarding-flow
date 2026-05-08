---
phase: 04-jarvis-cron-pipeline
plan: 03
subsystem: jarvis-cron-lease
tags: [jarvis, cron, lease, skip-locked, retry-policy, whatsapp-alert, vercel-cron, wave-3]
dependency_graph:
  requires:
    - "Plan 04-00 (lease columns migration + @anthropic-ai/sdk)"
    - "Plan 04-01 (JARVIS_TOOLS + dispatchTool whitelist)"
    - "Plan 04-02 (runAgentLoop + MaxIter/TokenBudget/LoopDetected)"
    - "Phase 3 (jarvis_runs + jarvis_tool_calls + idempotency_keys + langfuse)"
  provides:
    - "claimPendingSessions(workerId, batchSize) — RPC SKIP LOCKED + 10min stuck-lock recovery"
    - "releaseSession(sessionId, outcome) — happy/permanent/transient com threshold MAX_ATTEMPTS=3"
    - "markNeedsReview(sessionId, reason, runId) + fireWhatsAppAlert"
    - "/api/cron/jarvis-tick — Bearer auth + claim batch=5 + fire-and-forget dispatch (<1s)"
    - "/api/jarvis/run — worker com createJarvisRun + runAgentLoop + finalizeJarvisRun"
    - "vercel.json — cron schedule 15min UTC + maxDuration 30s/300s"
  affects:
    - "Phase 5 UI: pode listar onboarding_sessions.status=needs_review + last_error para triage humano"
    - "Phase 5 UI-07 (Evolution API config): substituir stub fireWhatsAppAlert por endpoint real configurado"
tech_stack:
  added: []
  patterns:
    - "Postgres SELECT FOR UPDATE SKIP LOCKED via RPC (concurrent-safe lease, sem race conditions)"
    - "Stuck-lock recovery: re-claim de status='processing' AND locked_at < now()-10min (resiliencia a Vercel cold start morto/OOM)"
    - "Fire-and-forget dispatch: cron retorna em <1s, workers rodam em function invocations separadas (Vercel maxDuration 300s)"
    - "Bearer ${CRON_SECRET} em ambos endpoints (cron-tick + jarvis/run) — defesa em profundidade contra invocacao publica"
    - "Erro classificado: MaxIter/TokenBudget/LoopDetected -> permanent (needs_review imediato); excecao generica -> transient (retry ate 3x)"
    - "Mock builder fluente para Supabase em vitest (.from().update().eq() / .select().eq().single())"
    - "fetch global mock + AbortSignal.timeout(2000) para garantir socket egress mesmo se worker estourar maxDuration"
key_files:
  created:
    - "C:/Users/dopeb/Desktop/admin-pipeelo/api/jarvis/_runtime/retry-policy.ts"
    - "C:/Users/dopeb/Desktop/admin-pipeelo/api/jarvis/_runtime/claim-session.ts"
    - "C:/Users/dopeb/Desktop/admin-pipeelo/api/jarvis/_runtime/claim-session.test.ts"
    - "C:/Users/dopeb/Desktop/admin-pipeelo/supabase/migrations/20260509130000_claim_pending_sessions_rpc.sql"
    - "C:/Users/dopeb/Desktop/admin-pipeelo/app/api/cron/jarvis-tick/route.ts"
    - "C:/Users/dopeb/Desktop/admin-pipeelo/app/api/cron/jarvis-tick/route.test.ts"
    - "C:/Users/dopeb/Desktop/admin-pipeelo/app/api/jarvis/run/route.ts"
    - "C:/Users/dopeb/Desktop/admin-pipeelo/vercel.json"
  modified: []
decisions:
  - "createJarvisRun + finalizeJarvisRun INLINE em /api/jarvis/run/route.ts (nao foi criado helper runs.ts separado): plano referenciava import de runs.ts inexistente; INSERT/UPDATE direto em jarvis_runs e suficientemente legivel e evita arquivo de 30 linhas com 2 funcoes — Phase 5 UI provavelmente vai precisar de query helpers que justificam runs.ts no momento certo"
  - "RPC `claim_pending_sessions` em SQL ao inves de raw query via supabase-js: SKIP LOCKED nao e expresso no DSL do supabase-js, e RPC e a forma idiomatica de chamar plpgsql; bonus: reutilizavel em workers futuros (ex: scheduled jobs N8N) sem duplicar a logica"
  - "createJarvisRun fallback runId 'all-zeros UUID' quando insert falha: mantem releaseSession invocavel para registrar last_error mesmo em catastrofe — pendura sessao em pending para proxima tick com erro estruturado (contrato `last_run_id` e nullable no schema, mas nullable+last_run_id juntos significam 'orfa' — string-zero indica 'tentou criar e falhou')"
  - "AbortSignal.timeout(2000) no fetch fire-and-forget: socket precisa sair em 2s; o worker de fato roda 300s no seu proprio invocation, esse abort so previne cron-tick travar caso resolver DNS bug"
  - "errorType padrao para runAgentLoop result.success=false (stop_reason=max_tokens etc): 'transient' — modelo pode flake, da-se 3 chances antes de needs_review; runAgentLoop EXCEPTIONS classificadas (MaxIter/TokenBudget/LoopDetected) sao 'permanent' (sem ponto retry-on-loop-confirmado)"
  - "Plan instruiu CRON_SECRET sem expected → 401: implementacao falha-fechado (no expected = no auth = 401), evita acidentalmente expor endpoint em ambiente sem env var setada"
metrics:
  duration: "~10min"
  completed: "2026-05-08"
  tasks_total: 2
  tasks_completed: 2
  files_created: 8
  files_modified: 0
  commits: 2
  tests_added: 23
  tests_passing: 23
  jarvis_runtime_total_tests: 143
---

# Phase 4 Plan 3: Jarvis Cron Pipeline (Lease + Cron + Worker) Summary

**One-liner:** Pipeline cron end-to-end pronto: RPC `claim_pending_sessions` (SELECT FOR UPDATE SKIP LOCKED + recovery 10min) + `/api/cron/jarvis-tick` (Bearer auth, batch=5, fire-and-forget <1s) + `/api/jarvis/run` (createJarvisRun -> runAgentLoop -> releaseSession com classificacao permanent/transient + finalizeJarvisRun) + `vercel.json` cron 15min — 23 tests verdes (15 claim-session + 8 cron-tick), zero TS errors em arquivos novos. Sessao pending vira tenant ao vivo dentro de 15min, com retry ate 3x e alerta WhatsApp em needs_review.

## Repository Context

- **Working repo:** `C:/Users/dopeb/Desktop/admin-pipeelo` (Next.js 16, App Router)
- **Planning artifacts:** `C:/Users/dopeb/Desktop/pipeelo-onboarding-flow/.planning/`
- Cross-repo igual Phase 4-00/01/02: plan/state vivem no onboarding-flow; codigo vive no admin-pipeelo.

## Tasks Executed

### Task 1 — claim-session.ts + retry-policy.ts + RPC migration (TDD)

**Status:** Completed
**Commit:** `bbe07af`
**Files:**
- `api/jarvis/_runtime/retry-policy.ts` (created, MAX_ATTEMPTS=3 + fireWhatsAppAlert stub)
- `api/jarvis/_runtime/claim-session.ts` (created, claimPendingSessions/releaseSession/markNeedsReview)
- `api/jarvis/_runtime/claim-session.test.ts` (created, 15 tests)
- `supabase/migrations/20260509130000_claim_pending_sessions_rpc.sql` (created, plpgsql function)

**Behavior:**

`claim_pending_sessions(p_worker_id, p_batch_size)` plpgsql RPC:
- WHERE `status='pending' OR (status='processing' AND locked_at < now() - 10min)`
- SET `status='processing', locked_at=now(), locked_by=p_worker_id, attempt_count=COALESCE(attempt_count,0)+1`
- `FOR UPDATE SKIP LOCKED` na CTE — duas execucoes concorrentes nunca pegam mesma row.
- Retorna `SETOF onboarding_sessions` (todas as colunas, util para context na worker).

`claimPendingSessions(workerId, batchSize=5)`:
- Wrapper `supabase.rpc('claim_pending_sessions', {p_worker_id, p_batch_size})`
- Propaga erro como `Error('claim_pending_sessions failed: ...')`

`releaseSession(sessionId, outcome)`:
- `success=true` → status=completed + tenant_id + clear locks + last_run_id
- `success=false + permanent` → markNeedsReview imediato
- `success=false + transient + attempt_count>=3` → markNeedsReview (gastou tentativas)
- `success=false + transient + attempt_count<3` → reset para pending (re-claim na proxima tick)

`markNeedsReview(sessionId, reason, runId?)`:
- UPDATE status=needs_review + last_error + clear locks
- `await fireWhatsAppAlert(sessionId, reason)` (best-effort, no-op se env ausente)

`retry-policy.ts`:
- `MAX_ATTEMPTS=3`, `shouldRetry(n) = n < MAX_ATTEMPTS`
- `fireWhatsAppAlert`: Evolution API stub. Se `FELIPE_WHATSAPP/EVOLUTION_API_URL/EVOLUTION_API_TOKEN` ausentes, console.warn + return. Caso contrario POST `/message/sendText` com timeout 5s; falha de fetch e logada e nao-throw (best-effort).

**Cobre:** JARV-04 (lease), JARV-05 (recovery), JARV-09 (alerta).

**Verify:** `npx vitest run api/jarvis/_runtime/claim-session.test.ts` → 15/15 passing.

**Tests adicionados (15):**
- shouldRetry: MAX_ATTEMPTS=3, true para 0/1/2, false para 3/99
- claimPendingSessions: chama RPC com workerId+batchSize, retorna 2 sessoes, retorna [], default batchSize=5, propaga erro
- releaseSession success: status=completed + tenant_id + clear locks
- releaseSession permanent: markNeedsReview imediato + fireWhatsAppAlert
- releaseSession transient + attempt=1: reset para pending + sem alert
- releaseSession transient + attempt=3: needs_review + alert (gastou tentativas)
- releaseSession sem error: fallback "unknown error"
- markNeedsReview: status + alert + last_run_id presente
- markNeedsReview sem runId: omite last_run_id

### Task 2 — /api/cron/jarvis-tick + /api/jarvis/run + vercel.json

**Status:** Completed
**Commit:** `f18561a`
**Files:**
- `app/api/cron/jarvis-tick/route.ts` (created)
- `app/api/cron/jarvis-tick/route.test.ts` (created, 8 tests)
- `app/api/jarvis/run/route.ts` (created)
- `vercel.json` (created)

**Behavior:**

`/api/cron/jarvis-tick` (GET+POST):
- Auth: `Authorization: Bearer ${CRON_SECRET}`. Sem env ou bearer invalido → 401.
- workerId = `cron-${randomUUID()}`
- claimPendingSessions(workerId, 5)
- Para cada sessao: `fetch(runUrl, {method:'POST', body:{sessionId}, keepalive:true, signal:AbortSignal.timeout(2000)}).catch(log)`
- NAO awaita os fetches (JARV-07: fire-and-forget)
- Retorna `{claimed, sessionIds, workerId}` em <1s
- runUrl resolvido via `NEXT_PUBLIC_BASE_URL || ADMIN_BASE_URL || VERCEL_URL || localhost:3000`
- Mesmo handler para GET (default Vercel cron) e POST (manual trigger)

`/api/jarvis/run` (POST):
- Auth Bearer `${CRON_SECRET}` → 401
- Body: `{sessionId: uuid}` validado por Zod → 400 Invalid body
- Carrega session de `onboarding_sessions` → 404 se nao existe
- `createTrace` Langfuse + `createJarvisRun(supabase, sessionId, traceId)` (INSERT em jarvis_runs status=running)
- Monta `ToolContext` com `sessionId, runId, tenantId (do session), langfuseTrace`
- `runAgentLoop(session, ctx)` em try/catch
- Sucesso: `releaseSession(success:true, tenantId, runId)` + `finalizeJarvisRun(supabase, runId, {success, tenantId, result})` + trace.end + flushLangfuse → 200
- result.success=false (stop_reason): releaseSession transient + finalizeJarvisRun com errorPayload `stop_reason`
- Excecao classificada (MaxIter/TokenBudget/LoopDetected): releaseSession **permanent** + finalizeJarvisRun com code (`max_iterations|token_budget|loop_detected`) → 500
- Excecao generica: releaseSession **transient** + code=`unexpected` → 500

`vercel.json`:
```json
{
  "crons": [{ "path": "/api/cron/jarvis-tick", "schedule": "*/15 * * * *" }],
  "functions": {
    "app/api/cron/jarvis-tick/route.ts": { "maxDuration": 30 },
    "app/api/jarvis/run/route.ts": { "maxDuration": 300 }
  }
}
```

**Cobre:** JARV-06 (cron schedule + Bearer), JARV-07 (fire-and-forget).

**Verify:** `npx vitest run app/api/cron/jarvis-tick/route.test.ts` → 8/8 passing.

**Tests adicionados (8):**
- 401 sem header
- 401 com Bearer invalido
- 401 quando CRON_SECRET nao setado (failed-closed)
- 200 + 0 sessoes claimed: sem fetch, workerId formato `cron-{uuid}`
- 200 + 3 sessoes claimed: fetch 3x com shape correto (URL, POST, body, Authorization, keepalive)
- POST aceito (alem de GET)
- workerId UUID + batchSize=5 passados para claimPendingSessions
- Falha de fetch capturada (.catch) — nao bloqueia response

## Verification Results

```
$ npx vitest run api/jarvis/_runtime/ app/api/cron/ --reporter=dot
 Test Files  21 passed (21)
      Tests  143 passed (143)

$ grep -r "FOR UPDATE SKIP LOCKED" supabase/migrations/
supabase/migrations/20260509130000_claim_pending_sessions_rpc.sql

$ grep -E '\bfetch\s*\(' api/jarvis/_runtime/agent-loop.ts
# (zero matches — JARV-10 mantido)

$ grep "schedule" vercel.json
"schedule": "*/15 * * * *"

$ npx tsc --noEmit | grep -E "(jarvis-tick|app/api/jarvis/run|claim-session|retry-policy)"
# (zero erros — pre-existing 700+ TS errors em lib/ fora do escopo)
```

## Success Criteria

- [x] **JARV-04** ✅ SELECT FOR UPDATE SKIP LOCKED em RPC `claim_pending_sessions`
- [x] **JARV-05** ✅ Stuck-lock recovery: `status='processing' AND locked_at < now() - interval '10 minutes'` re-claim
- [x] **JARV-06** ✅ `/api/cron/jarvis-tick` em vercel.json schedule `*/15 * * * *` com Bearer `CRON_SECRET`; failed-closed se env ausente
- [x] **JARV-07** ✅ Cron fire-and-forget: fetch sem await + AbortSignal.timeout(2s); response retorna em <1s do tempo do response handler
- [x] **JARV-09** ✅ `attempt_count >= 3` (transient) ou `errorType=permanent` → status='needs_review' + `fireWhatsAppAlert(sessionId, reason)`
- [x] Phase 4 end-to-end pronta: pending → claim → agent-loop → tenant criado em ≤15min (smoke staging pendente humano)
- [x] 2 tasks executados, 2 commits atomicos
- [x] 23 tests novos verdes; suite jarvis runtime + cron passa com 143/143

## Deviations from Plan

**1. [Rule 1 - Bug] Sequencia `*/15 * * * *` em comentario JSDoc quebrou parser oxc do Vite**
- **Found during:** Task 2 — primeiro `npx vitest run` falhou com PARSE_ERROR no token `*/` dentro do bloco `/** ... */`.
- **Issue:** O parser oxc do Vitest interpretou `*/` (parte do cron expression `*/15`) como fim de comentario JSDoc, quebrando o resto do arquivo.
- **Fix:** Substituir comentario por descricao em prosa: `Schedule: definido em vercel.json (a cada 15 minutos UTC)`. O cron string real continua em vercel.json apenas (single source of truth).
- **Files modified:** `app/api/cron/jarvis-tick/route.ts`
- **Commit:** parte de `f18561a`

**2. [Rule 1 - Bug] TS strict 4 erros em route.test.ts (mock tuple narrowing + @ts-expect-error inutil)**
- **Found during:** `npx tsc --noEmit` apos primeiro commit Task 2.
- **Issue:** Mesmo padrao Phase 4-02 SUMMARY: vitest mock.calls e tipado como `Parameters<T>[]` que TS estreita para `[]`; indexacao por `[0]` falha TS2493. `@ts-expect-error` em `global.fetch = fetchMock` ficou unused (TS2578) por o cast `unknown` resolver.
- **Fix:** Cast atraves de `unknown[][]` em mock.calls + `as unknown as typeof fetch` em global.fetch (ja conhecido da Plan 02).
- **Files modified:** `app/api/cron/jarvis-tick/route.test.ts`
- **Commit:** parte de `f18561a` (in-place antes do commit final)

**3. [Decision/scope] createJarvisRun + finalizeJarvisRun inline ao inves de runs.ts helper**
- **Found during:** Task 2 planning — plano referenciava `import { createJarvisRun, finalizeJarvisRun } from '@/api/jarvis/_runtime/runs'` mas `runs.ts` nao existe (Phase 3 SUMMARY nao mencionou cria-lo).
- **Decision:** INSERT/UPDATE direto em `jarvis_runs` dentro do route handler. Fica 30 linhas de codigo + tipo local `JarvisSupabaseLike`. Justifica criar `runs.ts` em Phase 5 quando UI precisar de query helpers (listJarvisRuns, getJarvisRunById).
- **Files affected:** `app/api/jarvis/run/route.ts` (sem dependency externa)
- **Documentado em:** decisions na frontmatter

**Pre-existing TS errors (out of scope):** 700+ erros TS pre-existentes em `lib/storage.ts`, `lib/tags-database.ts` etc — mesma situacao Phase 3-02, 4-01, 4-02. Zero erros TS introduzidos em arquivos novos desta wave.

## Authentication Gates

Nenhum auth gate hit nesta wave — execucao 100% autonoma.

**Pendente checkpoint humano (gate de staging, nao bloqueia codigo):**
- Apply manual da migration `20260509130000_claim_pending_sessions_rpc.sql` em DB staging (alem da `20260509120000_jarvis_lease_columns.sql` da Wave 0).
- Setar env vars no Vercel admin-pipeelo (staging primeiro):
  - `CRON_SECRET` (string opaca random ≥32 chars)
  - `ANTHROPIC_API_KEY` (ja documentado Wave 0)
  - `FELIPE_WHATSAPP` + `EVOLUTION_API_URL` + `EVOLUTION_API_TOKEN` (opcional — sem essas, `fireWhatsAppAlert` no-op com console.warn)
  - `ADMIN_BASE_URL` (para deep link na mensagem WhatsApp)
- Smoke test em staging:
  1. INSERT manual em `onboarding_sessions` com status='pending' + respostas mock
  2. Aguardar tick cron (max 15min) ou disparar manual via `curl POST /api/cron/jarvis-tick -H "Authorization: Bearer ..."`
  3. Validar tenant criado + jarvis_runs.status='completed' + onboarding_sessions.status='completed'

## Commits

| Hash | Message |
|------|---------|
| `bbe07af` | feat(04-03): adiciona claim-session SKIP LOCKED + retry-policy + RPC migration |
| `f18561a` | feat(04-03): adiciona cron jarvis-tick + worker /api/jarvis/run + vercel.json |

## Contracts Exported

```typescript
// api/jarvis/_runtime/claim-session.ts
export interface ClaimedSession {
  id: string; slug: string; status: string;
  respostas: Record<string, unknown>;
  tenant_id: string | null;
  locked_at: string | null; locked_by: string | null;
  attempt_count: number; last_error: string | null;
  last_run_id: string | null; created_at: string;
}
export interface ReleaseOutcome {
  success: boolean; tenantId?: string; error?: string;
  errorType?: "transient" | "permanent"; runId: string;
}
export async function claimPendingSessions(workerId: string, batchSize?: number): Promise<ClaimedSession[]>;
export async function releaseSession(sessionId: string, outcome: ReleaseOutcome): Promise<void>;
export async function markNeedsReview(sessionId: string, reason: string, runId?: string): Promise<void>;
export { MAX_ATTEMPTS } from "./retry-policy";

// api/jarvis/_runtime/retry-policy.ts
export const MAX_ATTEMPTS: 3;
export function shouldRetry(attemptCount: number): boolean;
export async function fireWhatsAppAlert(sessionId: string, errorMsg: string): Promise<void>;

// app/api/cron/jarvis-tick/route.ts
export const GET, POST;  // Vercel Cron + manual trigger

// app/api/jarvis/run/route.ts
export const maxDuration = 300;
export async function POST(req: NextRequest);
```

## Pitfalls Endereçados

- **Pitfall 3 (Cross-tenant state bleed):** lease pattern garante 1 worker = 1 sessao. workerId em `locked_by` permite diagnostico de race condition se aparecer (nunca deveria, dado SKIP LOCKED).
- **Pitfall 6 (Cron drift / double execution):** Vercel Cron ja garante "at most once at scheduled time", mas ainda assim, se 2 ticks dispararem por overlap ou retry da Vercel, SKIP LOCKED no Postgres garante zero double-execution. Fail-safe defesa em profundidade.
- **Pitfall (worker travado / cold start morto):** stuck-lock recovery 10min — workers que morrem (Vercel OOM, function timeout, processo crash) NUNCA bloqueiam a sessao indefinidamente. Apos 10min, a sessao volta para fila com `attempt_count` ja incrementado.

## What's Next

- **Phase 5 UI (proxima fase):** Tela `/onboarding-sessions` listando todas as sessoes, com filtros por status. Foco em `needs_review` para triage humano. Botao "Reset to pending" que UPDATE status='pending' + clear locks + zera attempt_count (recuperacao manual). UI-07 vai substituir o stub `fireWhatsAppAlert` por configuracao real Evolution API.
- **Smoke staging (humano):** apply migrations + set env vars + INSERT mock session + aguardar tick. Ver checklist em "Authentication Gates".
- **Helper `runs.ts` (deferido):** listJarvisRuns, getJarvisRunById com joins para jarvis_tool_calls — sera criado em Phase 5 quando UI precisar.

## Self-Check: PASSED

**Files verified:**
- FOUND: C:/Users/dopeb/Desktop/admin-pipeelo/api/jarvis/_runtime/retry-policy.ts
- FOUND: C:/Users/dopeb/Desktop/admin-pipeelo/api/jarvis/_runtime/claim-session.ts
- FOUND: C:/Users/dopeb/Desktop/admin-pipeelo/api/jarvis/_runtime/claim-session.test.ts
- FOUND: C:/Users/dopeb/Desktop/admin-pipeelo/supabase/migrations/20260509130000_claim_pending_sessions_rpc.sql
- FOUND: C:/Users/dopeb/Desktop/admin-pipeelo/app/api/cron/jarvis-tick/route.ts
- FOUND: C:/Users/dopeb/Desktop/admin-pipeelo/app/api/cron/jarvis-tick/route.test.ts
- FOUND: C:/Users/dopeb/Desktop/admin-pipeelo/app/api/jarvis/run/route.ts
- FOUND: C:/Users/dopeb/Desktop/admin-pipeelo/vercel.json

**Commits verified:**
- FOUND: bbe07af
- FOUND: f18561a
