---
phase: 03-tool-layer-audit
plan: 01
subsystem: jarvis-runtime-shared-helpers
tags: [tool-03, tool-05, wave-1, http-client, idempotency, audit-recorders, vitest, jarvis-runtime]
requires:
  - jarvis-runtime-folder-structure
  - jarvis-audit-tables-ddl
  - admin-pipeelo-vitest-config
provides:
  - jarvis-http-client-callExternal
  - jarvis-idempotency-wrapper
  - jarvis-audit-recorders
  - jarvis-shared-types
  - jarvis-supabase-service-role-helper
affects:
  - C:/Users/dopeb/Desktop/admin-pipeelo/api/jarvis/_runtime/tools/_shared/types.ts
  - C:/Users/dopeb/Desktop/admin-pipeelo/api/jarvis/_runtime/tools/_shared/supabase.ts
  - C:/Users/dopeb/Desktop/admin-pipeelo/api/jarvis/_runtime/tools/_shared/http.ts
  - C:/Users/dopeb/Desktop/admin-pipeelo/api/jarvis/_runtime/tools/_shared/idempotency.ts
  - C:/Users/dopeb/Desktop/admin-pipeelo/api/jarvis/_runtime/tools/_shared/audit.ts
tech_stack:
  added: []
  patterns:
    - "fetch nativo (Node 18+) com AbortController + setTimeout — sem axios/p-retry"
    - "Backoff exponencial com jitter inline (200ms × 2^attempt + random 0-100ms)"
    - "Retriable: 5xx, 408, 429, network, timeout. Não-retriable: 4xx demais"
    - "JSON canonicalization recursiva (sort de keys) + SHA-256 → idempotency hash estável"
    - "Upsert com onConflict + ignoreDuplicates p/ tolerar race entre 2 workers"
    - "Audit best-effort: recordToolCall e finalizeRun NUNCA propagam erro (anti-pattern 'audit kills run' impossível por construção)"
    - "Service-role Supabase singleton com cache + reset helper p/ tests"
    - "Vitest mock-by-factory: vi.mock('./supabase', () => ({...})) com store in-memory para Postgres simulation"
key_files:
  created:
    - C:/Users/dopeb/Desktop/admin-pipeelo/api/jarvis/_runtime/tools/_shared/types.ts
    - C:/Users/dopeb/Desktop/admin-pipeelo/api/jarvis/_runtime/tools/_shared/supabase.ts
    - C:/Users/dopeb/Desktop/admin-pipeelo/api/jarvis/_runtime/tools/_shared/supabase.test.ts
    - C:/Users/dopeb/Desktop/admin-pipeelo/api/jarvis/_runtime/tools/_shared/http.ts
    - C:/Users/dopeb/Desktop/admin-pipeelo/api/jarvis/_runtime/tools/_shared/http.test.ts
    - C:/Users/dopeb/Desktop/admin-pipeelo/api/jarvis/_runtime/tools/_shared/idempotency.ts
    - C:/Users/dopeb/Desktop/admin-pipeelo/api/jarvis/_runtime/tools/_shared/idempotency.test.ts
    - C:/Users/dopeb/Desktop/admin-pipeelo/api/jarvis/_runtime/tools/_shared/audit.ts
    - C:/Users/dopeb/Desktop/admin-pipeelo/api/jarvis/_runtime/tools/_shared/audit.test.ts
  modified: []
decisions:
  - "fetch nativo (Node 18+) sem axios/p-retry: dep zero, suporte de AbortController/AbortSignal embutido. Backoff inline ~10 LOC suficiente p/ Wave 1."
  - "Backoff com jitter (200ms × 2^attempt + random 0-100ms): evita thundering herd entre 2 workers concorrentes."
  - "4xx é não-retriable por default, exceto 408/429: Pipeelo API ocasionalmente devolve 429 (rate limit) — retentar é seguro e produtivo. 408 segue mesma lógica."
  - "Audit best-effort por design: recordToolCall + finalizeRun usam try/catch que LOGGA mas NÃO propaga. Anti-pattern 'falha de audit derruba run' literalmente impossível na implementação."
  - "createRun NÃO é best-effort: sem run_id, tool_calls não tem chave estrangeira válida. Caller deve abortar a session se createRun falhar."
  - "Upsert com onConflict='session_id,tool,args_hash' + ignoreDuplicates=true: tolerante a race condition entre 2 workers que processam o mesmo lease simultaneamente."
  - "Erro durante fn() em withIdempotency NÃO grava cache: próxima retry pode passar (essencial p/ resiliência — cache de erro permanente é veneno)."
  - "canonicalJson preserva ordem de array, ordena keys de object: arrays geralmente são significativos por ordem (ex.: lista de produtos), objects não."
  - "Supabase client cached com __resetJarvisSupabaseCache() helper test-only: permite mocking limpo + simula module isolation entre tests via vi.resetModules."
  - "Sem `Idempotency-Key` header automático: callExternal só propaga se caller passar explicitamente em req.headers. Wave 2 (Plan 03-02) decide quando setar (geralmente igual ao args_hash do withIdempotency)."
  - "Sem keepalive socket: Vercel Functions já reutiliza sockets por default, keepalive em fetch é browser-only beacon."
metrics:
  duration_minutes: 6
  tasks_completed: 3
  files_created: 9
  files_modified: 0
  commits: 3
  tests_added: 31
  tests_passing: 31
  coverage_lines: 95.4
  coverage_statements: 93.06
  coverage_functions: 100
  completed_date: "2026-05-08"
---

# Phase 3 Plan 01: Jarvis Runtime Shared Helpers Summary

3 helpers de runtime compartilhados (`_shared/`) entregues no admin-pipeelo: cliente HTTP central com retry/timeout (TOOL-05, único caminho de saída), wrapper de idempotency com canonicalJson + SHA-256 (TOOL-03, blinda Pitfall 1 e 6), e recorders de audit best-effort para `jarvis_runs` + `jarvis_tool_calls`. 31 testes verdes, coverage 95.4% lines / 100% funcs no _shared/.

## Repository Context

**Working repo:** `C:/Users/dopeb/Desktop/admin-pipeelo` (Next.js 15)
**Planning artifacts:** `C:/Users/dopeb/Desktop/pipeelo-onboarding-flow/.planning/`
**Cross-repo:** plan/state vivem no onboarding-flow; código vive no admin-pipeelo (mesmo padrão da Wave 0).

## What Was Built

### Task 1 — types.ts + supabase.ts + http.ts

**Commit:** `fd0285e`

- **`types.ts`** — `ToolContext`, `ToolResult<T>`, `HttpRequest`, `HttpMethod`, `HttpErrorCode`, classe `HttpError extends Error` com `code | status | retriable | body`.
- **`supabase.ts`** — `getJarvisSupabase()` cria/cacheia cliente service-role usando `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`. Throw explícito se env faltando. `__resetJarvisSupabaseCache()` test helper.
- **`http.ts` `callExternal<T>(req)`** — único wrapper fetch. 200 → parse JSON. 4xx → throw não-retriable (exceto 408/429). 5xx/408/429/network/timeout → retry com backoff `200ms × 2^attempt + jitter` até esgotar `retries` (default 2), depois throw retriable. AbortController dispara em `timeoutMs` (default 15000).
- **8 testes verdes:** 200 OK parse, 500 retry+throw, 400 no-retry, 429 retry, timeout via fake timers, header propagation (Idempotency-Key), HttpError shape, HttpRequest type compile-check.

### Task 2 — idempotency.ts (withIdempotency wrapper)

**Commit:** `76b7e6c`

- **`canonicalJson(value)`** — string determinística: keys de objects ordenadas recursivamente, ordem de arrays preservada, detecta circular reference, normaliza null/undefined.
- **`hashArgs(args)`** — SHA-256 hex sobre `canonicalJson(args)`.
- **`withIdempotency<T>(ctx, args, fn)`** — lookup `(session_id, tool, args_hash)` em `idempotency_keys` via service-role. Cache HIT retorna `{ data: cached.result, idempotentHit: true }` SEM executar fn. Cache MISS executa fn, faz upsert com `onConflict='session_id,tool,args_hash'` + `ignoreDuplicates: true` (race-tolerant), retorna `idempotentHit: false`. Erro em fn() propaga e NÃO grava cache.
- **12 testes verdes:** canonicalJson order/array/nested/circular, hashArgs determinism + sensitivity, primeira call executa+cacheia, segunda call hit, args reordenados → mesmo hash → hit, args distintos → re-executa, fn throw → não cacheia, sessões distintas não compartilham cache.

### Task 3 — audit.ts (jarvis_runs + jarvis_tool_calls)

**Commit:** `268d7df`

- **`createRun(input)`** — insere `jarvis_runs` com `status='running'` + `session_id`/`tenant_id`/`model`/`langfuse_trace_id`. Retorna `run_id` (uuid). Throw se insert falhar (não é best-effort — sem run_id, audit colapsa).
- **`recordToolCall(payload)`** — insere `jarvis_tool_calls` com `run_id`/`session_id`/`tool_name`/`input`/`output`/`duration_ms`/`idempotent_hit`/`error`/`langfuse_span_id`. **Best-effort:** try/catch envolve toda operação, falhas viram `console.error` mas NUNCA throw. Quando `error` é setado, `output` é forçado para null.
- **`finalizeRun(input)`** — update `jarvis_runs` com `status` (completed/failed/needs_review) + `finished_at` + `tokens_*` + `error`. Best-effort idem.
- **9 testes verdes:** createRun success + insert failure throw, recordToolCall happy path + error path (output nullified) + idempotent_hit true + DB failure best-effort, finalizeRun completed+tokens + failed+error + DB failure best-effort.
- **+2 testes** em `supabase.test.ts`: missing env throws + cached singleton.

## Decisions Made

Ver frontmatter `decisions:`. Highlights:

- **fetch nativo + backoff inline (sem axios, sem p-retry):** dep zero, ~10 LOC.
- **Audit best-effort by construction:** anti-pattern "audit kills run" literalmente impossível — try/catch envolve `recordToolCall` e `finalizeRun` inteiros.
- **Erro NÃO cacheia em withIdempotency:** retry pode passar, cache de erro permanente é veneno.
- **Upsert + ignoreDuplicates:** tolera race condition entre 2 workers no mesmo lease.

## Verification Evidence

```
$ npx vitest run api/jarvis/_runtime/tools/_shared/ --reporter=dot --coverage
 Test Files  4 passed (4)
      Tests  31 passed (31)

 % Coverage report from v8
File            | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
audit.ts        |   93.33 |    96.87 |     100 |   93.33 | 110
http.ts         |   94.73 |    87.09 |     100 |   93.75 | 70,79
idempotency.ts  |    87.5 |       75 |     100 |      96 | 34
All files       |   93.06 |    88.17 |     100 |    95.4

$ npx vitest run --reporter=dot
 Test Files  30 passed (30)
      Tests  120 passed (120)

$ grep -r "fetch(" api/jarvis/_runtime/tools/
 _shared/http.ts:37:  const res = await fetch(req.url, { ... }
# (1 ocorrência, dentro de http.ts — TOOL-05 gate clean)

$ npx tsc --noEmit | grep "api/jarvis"
# (zero erros TS no novo código)
```

## Deviations from Plan

**None — plan executado exatamente como escrito.**

Pequenos refinamentos não-disruptivos:
- Plan listava 5 testes de http.ts; entreguei 8 (adicionei 429 retry + HttpError shape + HttpRequest type compile-check).
- Plan listava 6 testes de idempotency.ts; entreguei 12 (separei canonicalJson/hashArgs em describes próprios + adicionei circular ref + sessões distintas).
- Plan listava 5 testes de audit.ts; entreguei 9 (criei `supabase.test.ts` adicional p/ subir coverage de 0 → 100% functions).
- Test "aborts on timeout" precisou de pre-attach `.catch(() => {})` em fetch mock para evitar `PromiseRejectionHandledWarning` do Vitest com fake timers — não muda comportamento, só silencia warning cosmético.

Pre-existing TS errors em `lib/storage.ts`, `lib/tags-database.ts`, `lib/thread-processor.ts` (Wave 0 já existiam): out of scope per scope_boundary — logged here as awareness only.

## Authentication Gates

Nenhum.

## Contracts Exported (consumed by Plan 03-02)

```typescript
// types.ts
export type ToolContext, ToolResult<T>, HttpRequest, HttpMethod, HttpErrorCode;
export class HttpError;

// supabase.ts
export function getJarvisSupabase(): SupabaseClient;
export function __resetJarvisSupabaseCache(): void; // test-only

// http.ts
export type HttpResponse<T>;
export async function callExternal<T>(req: HttpRequest): Promise<HttpResponse<T>>;

// idempotency.ts
export function canonicalJson(value: unknown): string;
export function hashArgs(args: unknown): string;
export type IdempotencyResult<T>;
export async function withIdempotency<T>(
  ctx: { sessionId: string; tool: string },
  args: unknown,
  fn: () => Promise<T>,
): Promise<IdempotencyResult<T>>;

// audit.ts
export type CreateRunInput, RecordToolCallInput, FinalizeRunInput;
export async function createRun(input: CreateRunInput): Promise<string>;
export async function recordToolCall(payload: RecordToolCallInput): Promise<void>;
export async function finalizeRun(input: FinalizeRunInput): Promise<void>;
```

## What's Next

- **Plan 03-02 (Wave 2):** 7 tools determinísticas em `api/jarvis/_runtime/tools/*.ts` (create_tenant, configure_api, create_assistants, link_kbs, link_functions, configure_followups, set_lifecycle). Cada tool consome `callExternal` + `withIdempotency` + `recordToolCall`. Coverage gate ≥80%.
- **Plan 03-03 (Wave 3):** Langfuse SDK + spans em `api/jarvis/_runtime/observability/`. Depende de Wave 2 + migration aplicada (`langfuse_trace_id`/`langfuse_span_id` colunas já existem na DDL Wave 0).
- **Manual gate antes de Plan 03-03 funcional end-to-end:** Felipe aplica `20260509000000_jarvis_audit_tables.sql` em staging + smoke + drill rollback + apply prod. Sem isso, `recordToolCall` real só vai logar best-effort warnings (testes seguem mockados, não bloqueia desenvolvimento).

## Pitfalls Endereçados

- **Pitfall 1 (Loop / context blow-up):** withIdempotency garante que mesmo args = 0 chamadas externas reais, mesmo se o agente entra em loop curto.
- **Pitfall 6 (Idempotency Mistakes):** canonicalJson + SHA-256 + PK composto `(session_id, tool, args_hash)` produzem chave estável independente de ordem de keys.
- **Anti-pattern "audit kills run":** literalmente impossível por construção — `recordToolCall`/`finalizeRun` envoltas em try/catch top-level.

## Self-Check: PASSED

Verificações executadas:
- `api/jarvis/_runtime/tools/_shared/types.ts` existe: FOUND
- `api/jarvis/_runtime/tools/_shared/supabase.ts` existe: FOUND
- `api/jarvis/_runtime/tools/_shared/supabase.test.ts` existe: FOUND
- `api/jarvis/_runtime/tools/_shared/http.ts` existe: FOUND
- `api/jarvis/_runtime/tools/_shared/http.test.ts` existe: FOUND
- `api/jarvis/_runtime/tools/_shared/idempotency.ts` existe: FOUND
- `api/jarvis/_runtime/tools/_shared/idempotency.test.ts` existe: FOUND
- `api/jarvis/_runtime/tools/_shared/audit.ts` existe: FOUND
- `api/jarvis/_runtime/tools/_shared/audit.test.ts` existe: FOUND
- Commit `fd0285e` (Task 1) presente em `git log`: FOUND
- Commit `76b7e6c` (Task 2) presente em `git log`: FOUND
- Commit `268d7df` (Task 3) presente em `git log`: FOUND
- 31 tests passing em `_shared/`: confirmado via vitest output
- Coverage lines 95.4% (>= 85% gate): confirmado
- TOOL-05 gate (1 fetch em _shared/http.ts only): confirmado via grep
- Zero erros TS em `api/jarvis/`: confirmado via tsc --noEmit
