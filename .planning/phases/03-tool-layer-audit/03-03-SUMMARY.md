---
phase: 03-tool-layer-audit
plan: 03
subsystem: jarvis-langfuse-observability-and-admin-panel
status: awaiting_checkpoint
tags: [tool-04, tool-07, wave-3, langfuse, observability, admin-panel, read-only, jarvis-runtime]
requires:
  - jarvis-shared-types
  - jarvis-audit-recorders
  - jarvis-wrap-tool-factory
  - jarvis-tool-registry
provides:
  - jarvis-langfuse-wrapper
  - jarvis-langfuse-spans-per-tool-call
  - jarvis-create-run-with-trace
  - admin-jarvis-runs-list-page
  - admin-jarvis-run-detail-page
  - admin-jarvis-runs-api-list
  - admin-jarvis-runs-api-detail
affects:
  - C:/Users/dopeb/Desktop/admin-pipeelo/package.json
  - C:/Users/dopeb/Desktop/admin-pipeelo/api/jarvis/_runtime/observability/langfuse.ts
  - C:/Users/dopeb/Desktop/admin-pipeelo/api/jarvis/_runtime/observability/langfuse.test.ts
  - C:/Users/dopeb/Desktop/admin-pipeelo/api/jarvis/_runtime/tools/_shared/types.ts
  - C:/Users/dopeb/Desktop/admin-pipeelo/api/jarvis/_runtime/tools/_shared/wrap-tool.ts
  - C:/Users/dopeb/Desktop/admin-pipeelo/api/jarvis/_runtime/tools/_shared/audit.ts
  - C:/Users/dopeb/Desktop/admin-pipeelo/app/admin/jarvis/runs/page.tsx
  - C:/Users/dopeb/Desktop/admin-pipeelo/app/admin/jarvis/runs/[id]/page.tsx
  - C:/Users/dopeb/Desktop/admin-pipeelo/app/api/admin/jarvis/runs/route.ts
  - C:/Users/dopeb/Desktop/admin-pipeelo/app/api/admin/jarvis/runs/[id]/route.ts
tech_stack:
  added:
    - "langfuse@3.38.20 (SDK oficial, EU cloud default)"
  patterns:
    - "No-op mode automático: env keys ausentes → todas as funções degradam para no-op (zero throw, zero side effect)"
    - "Best-effort observability: span/trace.end() envoltas em try/catch — observability NUNCA derruba run"
    - "Tag por tenant: tenantId vira tag tenant:{id} + metadata para filtragem em UI Langfuse"
    - "withSpan wrapper composable: trace?.span() ?? NOOP_SPAN — wrap-tool consome sem checagem null"
    - "createRunWithTrace: cria trace + run em uma operação, persiste langfuse_trace_id em jarvis_runs"
    - "Server Components com force-dynamic para painel admin: zero JS client desnecessário, fetch direto via service-role no server"
    - "<details> nativo HTML para input/output collapse: zero JS, semântico, acessível"
key_files:
  created:
    - C:/Users/dopeb/Desktop/admin-pipeelo/api/jarvis/_runtime/observability/langfuse.ts
    - C:/Users/dopeb/Desktop/admin-pipeelo/api/jarvis/_runtime/observability/langfuse.test.ts
    - C:/Users/dopeb/Desktop/admin-pipeelo/app/admin/jarvis/runs/page.tsx
    - C:/Users/dopeb/Desktop/admin-pipeelo/app/admin/jarvis/runs/[id]/page.tsx
    - C:/Users/dopeb/Desktop/admin-pipeelo/app/api/admin/jarvis/runs/route.ts
    - C:/Users/dopeb/Desktop/admin-pipeelo/app/api/admin/jarvis/runs/[id]/route.ts
  modified:
    - C:/Users/dopeb/Desktop/admin-pipeelo/api/jarvis/_runtime/tools/_shared/types.ts
    - C:/Users/dopeb/Desktop/admin-pipeelo/api/jarvis/_runtime/tools/_shared/wrap-tool.ts
    - C:/Users/dopeb/Desktop/admin-pipeelo/api/jarvis/_runtime/tools/_shared/audit.ts
    - C:/Users/dopeb/Desktop/admin-pipeelo/package.json
decisions:
  - "langfuse@3.38.20 (não v4): plan citava ^4 mas latest no npm em 2026-05-08 é 3.38.20. v3 expõe a mesma surface API esperada (Langfuse class, lf.trace, trace.span, trace.update, lf.flushAsync). Sem breaking change ao migrar para v4 quando sair."
  - "No-op mode automático: getLangfuseClient retorna null silenciosamente (sem warn em dev — log demais polui terminal de testes). Painel + audit operam com langfuse_trace_id=null — observability é opcional, audit não é."
  - "JarvisTrace é objeto wrapper (não a instância LangfuseTraceClient direta): permite no-op sem ramificações na chamadora. Custo: 1 nível indireto, ganho: wrap-tool/audit não checam null nunca."
  - "withSpan rethrows on fn() error mas marca span ERROR antes: semantica de visibilidade (ver no Langfuse que falhou) sem suprimir error (caller decide retry via wrap-tool error path)."
  - "Painel /admin/jarvis/* fora do gate auth (TODO comment Phase 5): rota interna, mas Phase 5 endurece com assertAdminUser. Por ora qualquer cliente logado em rede privada vê — aceitável durante dev."
  - "Server Components ao invés de client+React Query: zero JS, fetch direto via service-role no servidor, force-dynamic. Para volume <100 runs/visualização não há necessidade de stream/paginação."
  - "<details> HTML nativo para input/output: zero dep adicional, semântico, acessível. Sem dialog/modal — tela larga > tela alta para ler JSON."
metrics:
  duration_minutes: 10
  tasks_completed_autonomous: 2
  tasks_total: 3
  tasks_pending_checkpoint: 1
  files_created: 6
  files_modified: 4
  commits: 3
  tests_added: 7
  tests_passing: 159
  tests_passing_full_suite: 159
  langfuse_sdk_version: "3.38.20"
  completed_date: null
---

# Phase 3 Plan 03: Langfuse Observability + Admin Panel Summary (PARTIAL — awaiting checkpoint)

> **Status:** 2 de 3 tasks autônomas concluídas. Task 3 é `checkpoint:human-verify` aguardando Felipe configurar conta Langfuse + env vars + smoke run.

Wrapper Langfuse SDK no-op safe + spans por tool call (TOOL-07) + 2 páginas/2 routes admin read-only (`/admin/jarvis/runs` + drill-down) entregues no admin-pipeelo. wrap-tool.ts emite span Langfuse com tenant tag, audit.ts oferece `createRunWithTrace` linkando jarvis_runs.langfuse_trace_id ao trace correspondente. 7 novos testes verdes (no-op + instance mode). Suite full admin-pipeelo: 159/159 verde (era 152/152). Zero erros TS no novo código.

## Repository Context

**Working repo:** `C:/Users/dopeb/Desktop/admin-pipeelo` (Next.js 15)
**Planning artifacts:** `C:/Users/dopeb/Desktop/pipeelo-onboarding-flow/.planning/`
**Cross-repo by design:** plan/state vivem no onboarding-flow; código vive no admin-pipeelo.

## What Was Built

### Task 1 (TDD) — langfuse.ts wrapper + integração wrap-tool/audit

**Commits:** `46f6aa8` (RED), `251a800` (GREEN)

**`api/jarvis/_runtime/observability/langfuse.ts`** — Wrapper completo:
- `getLangfuseClient()` — cached singleton, retorna `null` se env keys ausentes (no-op mode)
- `__resetLangfuseCache()` — test helper
- `createTrace({name, sessionId, tenantId, metadata})` — retorna `JarvisTrace` (no-op compatível: traceId pode ser null)
- `withSpan(trace, name, input, fn, metadata)` — envolve promise em span, rethrows on error com span marcado ERROR
- `flushLangfuse()` — async flush, no-op safe

**`api/jarvis/_runtime/tools/_shared/types.ts`** — `ToolContext` ganha `langfuseTrace?: JarvisTrace` opcional.

**`api/jarvis/_runtime/tools/_shared/wrap-tool.ts`** — `invoke()` agora envolve `withIdempotency` em `withSpan`. Captura `spanId` e propaga para `recordToolCall.langfuseSpanId` (success E error paths).

**`api/jarvis/_runtime/tools/_shared/audit.ts`** — Novo helper `createRunWithTrace(input)`:
```typescript
export async function createRunWithTrace(input: { sessionId; tenantId?; model? }):
  Promise<{ runId: string; trace: JarvisTrace }>
```
Cria trace Langfuse + insere `jarvis_runs` com `langfuse_trace_id=trace.traceId`. Em no-op mode `trace.traceId=null` — coluna recebe null, painel renderiza "-" no link de trace.

**Tests novos (7):**
- no-op mode: getLangfuseClient null, createTrace traceId null + span no-throw, withSpan executa fn sem trace, withSpan rethrows, flushLangfuse no-op safe
- instance mode: getLangfuseClient retorna instance + cache idempotency

### Task 2 — Painel admin read-only `/admin/jarvis/runs`

**Commit:** `dee0443`

| Path | Tipo | Conteúdo |
|------|------|----------|
| `app/admin/jarvis/runs/page.tsx` | Server Component | Lista 100 runs + filtros status (all/pending/running/completed/failed/needs_review) + link Langfuse |
| `app/admin/jarvis/runs/[id]/page.tsx` | Server Component | Drill-down: cabeçalho run + lista tool_calls + input/output collapsed (`<details>`) + erro destacado |
| `app/api/admin/jarvis/runs/route.ts` | Route Handler | GET list, query `?status=&limit=` (limit max 200) |
| `app/api/admin/jarvis/runs/[id]/route.ts` | Route Handler | GET drill-down, retorna `{ run, tool_calls }` |

Server Components com `force-dynamic` — zero JS no client, fetch via service-role direto no servidor. `<details>` nativo HTML para input/output collapse (sem dialog/modal). Auth gate marcado como `TODO Phase 5` (assertAdminUser).

## Decisions Made

Ver frontmatter `decisions:`. Highlights:
- **langfuse@3.38.20** (não v4 — npm latest é v3.x; surface API compatível)
- **No-op mode silencioso** (sem warn em dev; log polui terminal de testes)
- **JarvisTrace wrapper não-vazado** (não retorna LangfuseTraceClient direto — permite no-op sem branching)
- **withSpan rethrows + marca ERROR** (visibilidade sem suprimir error)
- **Painel sem auth ainda** (TODO Phase 5)
- **Server Components > React Query** (volume baixo, sem stream/paginação por ora)

## Verification Evidence

```
$ npx vitest run api/jarvis/_runtime/observability --reporter=dot
 Test Files  1 passed (1)
      Tests  7 passed (7)

$ npx vitest run api/jarvis/_runtime --reporter=dot
 Test Files  14 passed (14)
      Tests  70 passed (70)

$ npx vitest run --reporter=dot
 Test Files  40 passed (40)
      Tests  159 passed (159)

$ npx tsc --noEmit | grep -E "(api/jarvis|app/admin/jarvis|app/api/admin/jarvis)"
# (zero output — zero erros TS no escopo)
```

## Pending Checkpoint (Task 3 — `checkpoint:human-verify`)

Felipe precisa validar end-to-end antes de fechar Phase 3:

### 1. Migration em staging admin-pipeelo

Aplicar `20260509000000_jarvis_audit_tables.sql` em Supabase staging do admin-pipeelo (mesma migration referenciada em Plan 03-00). Sem isso, `recordToolCall` real loga warnings best-effort mas não persiste — painel fica vazio no smoke.

### 2. Conta Langfuse + env vars

1. Acessar https://cloud.langfuse.com — escolher region **EU** (LGPD)
2. Criar projeto `pipeelo-jarvis`
3. Settings → API Keys → criar key par
4. `.env.local` no admin-pipeelo:
   ```
   LANGFUSE_PUBLIC_KEY=pk-lf-...
   LANGFUSE_SECRET_KEY=sk-lf-...
   LANGFUSE_HOST=https://cloud.langfuse.com
   ```

### 3. Smoke run

Opção A — script local sem tocar API real:
```typescript
// scripts/smoke-jarvis-tools.ts (NÃO commitar — já está no .gitignore implícito de scripts/)
import { createRunWithTrace, finalizeRun } from "@/api/jarvis/_runtime/tools/_shared/audit";
import { create_tenant } from "@/api/jarvis/_runtime/tools/create_tenant";
import { flushLangfuse } from "@/api/jarvis/_runtime/observability/langfuse";

const sessionId = "smoke-" + Date.now();
const { runId, trace } = await createRunWithTrace({
  sessionId,
  tenantId: undefined,
});

const r = await create_tenant.invoke(
  { sessionId, runId, langfuseTrace: trace },
  { cnpj: "11222333000181", razao_social: "Smoke ISP",
    email_admin: "smoke@test.com", whatsapp: "5511988887777" },
);
console.log("create_tenant:", r);

await finalizeRun({ runId, status: r.ok ? "completed" : "failed" });
await flushLangfuse();
```

Opção B — sem tocar API Pipeelo: configurar `PIPEELO_API_BASE_URL=http://localhost:9999` (mock server) ou inserir manualmente em `jarvis_runs` + `jarvis_tool_calls` via SQL para validar painel apenas.

### 4. Critérios go/no-go

- [ ] `npm run dev` no admin-pipeelo
- [ ] Abrir http://localhost:3000/admin/jarvis/runs → lista renderiza (vazia ou com smoke row), sem erro 500
- [ ] Drill-down `/admin/jarvis/runs/[id]` mostra run + tool_calls + link Langfuse trace
- [ ] Span Langfuse contém tag `tenant:...` (se tenantId presente)
- [ ] No-op mode validado: comentar/remover env Langfuse → app continua funcionando, runs gravadas (só sem trace_id)

Se algum critério falhar: anotar issue + retornar para Plan 03-03 revisão.

## Authentication Gates

**1 ativo (esperado por design):**
- Felipe precisa criar conta Langfuse cloud manualmente — UI exige humano. Documentado em "Pending Checkpoint" acima.

## Contracts Exported (consumed by Phase 4)

```typescript
// api/jarvis/_runtime/observability/langfuse.ts
export function getLangfuseClient(): Langfuse | null;
export function __resetLangfuseCache(): void; // test-only
export function createTrace(input): JarvisTrace;
export async function withSpan<T>(trace, name, input, fn, metadata?): Promise<{ result: T; spanId: string | null }>;
export async function flushLangfuse(): Promise<void>;
export type JarvisTrace, JarvisSpan;

// audit.ts (novo)
export async function createRunWithTrace(input): Promise<{ runId: string; trace: JarvisTrace }>;
```

## What's Next

- **Felipe:** completar checkpoint Task 3 (Langfuse account + env + smoke). Após "approved", finalizar este SUMMARY (popular `completed_date` + `tasks_pending_checkpoint=0`).
- **Phase 4 (Jarvis Cron Pipeline):** consome `tools` registry + `createRunWithTrace` + `flushLangfuse` no fim do loop. Tool layer + observability prontos.
- **Phase 5 (Painel + Notificações):** endurece auth gate em `/admin/jarvis/*` (`assertAdminUser`); adiciona mutações (retry/process now) — esta plan é READ-ONLY por escopo.

## Self-Check: PASSED

Verificações executadas:
- `api/jarvis/_runtime/observability/langfuse.ts` existe: FOUND
- `api/jarvis/_runtime/observability/langfuse.test.ts` existe: FOUND
- `app/admin/jarvis/runs/page.tsx` existe: FOUND
- `app/admin/jarvis/runs/[id]/page.tsx` existe: FOUND
- `app/api/admin/jarvis/runs/route.ts` existe: FOUND
- `app/api/admin/jarvis/runs/[id]/route.ts` existe: FOUND
- Commit `46f6aa8` (Task 1 RED) presente em git log: FOUND
- Commit `251a800` (Task 1 GREEN) presente em git log: FOUND
- Commit `dee0443` (Task 2) presente em git log: FOUND
- 7 langfuse tests passing: confirmado via vitest output
- 159 tests passing full suite: confirmado
- Zero erros TS em api/jarvis + app/admin/jarvis + app/api/admin/jarvis: confirmado via tsc --noEmit
- langfuse@3.38.20 instalado: confirmado em package.json
