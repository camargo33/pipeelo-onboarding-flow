---
phase: 04-jarvis-cron-pipeline
plan: 02
subsystem: jarvis-agent-loop
tags: [jarvis, agent-loop, anthropic-sdk, prompt-caching, loop-detector, token-budget, wave-2]
dependency_graph:
  requires:
    - "Plan 04-00 (@anthropic-ai/sdk@0.95.1 instalado)"
    - "Plan 04-01 (JARVIS_SYSTEM_PROMPT, buildTenantContext, JARVIS_TOOLS, dispatchTool)"
  provides:
    - "runAgentLoop(session, ctx) — orquestrador Anthropic Messages API com guardas"
    - "MAX_ITER=25, TOKEN_BUDGET=200000 — hard caps anti-loop"
    - "MaxIterationsError, TokenBudgetError, LoopDetectedError com session_id"
    - "anthropic singleton + buildCachedSystem (cache_control ephemeral 1h)"
    - "LoopDetector janela-3 com hash canonical (chave-order-insensitive)"
  affects:
    - "Plan 04-03 (lease + cron) — vai invocar runAgentLoop dentro de jarvis-tick handler"
tech_stack:
  added: []
  patterns:
    - "Hard cap MAX_ITER + token budget cumulativo (Pitfall #1: loop infinito custa USD)"
    - "Loop detector janela-3 com hash sha256 canonical-json (chaves ordenadas, recursivo)"
    - "Prompt caching ephemeral 1h via cache_control no bloco system[0] (JARV-08)"
    - "Tools como único exit (JARV-10): zero fetch direto no agent-loop"
    - "Mock queue-based para anthropic.messages.create (vi.hoisted, sem rede)"
    - "Tipos AnthropicResponse desacoplados do SDK exato (loose) — facilita mocks vitest"
key_files:
  created:
    - "C:/Users/dopeb/Desktop/admin-pipeelo/api/jarvis/_runtime/loop-detector.ts"
    - "C:/Users/dopeb/Desktop/admin-pipeelo/api/jarvis/_runtime/loop-detector.test.ts"
    - "C:/Users/dopeb/Desktop/admin-pipeelo/api/jarvis/_runtime/anthropic-client.ts"
    - "C:/Users/dopeb/Desktop/admin-pipeelo/api/jarvis/_runtime/agent-loop.ts"
    - "C:/Users/dopeb/Desktop/admin-pipeelo/api/jarvis/_runtime/agent-loop.test.ts"
  modified: []
decisions:
  - "MODEL constante = 'claude-opus-4-7' conforme CLAUDE.md global (não Sonnet/Haiku); custo é o tradeoff aceito por agora — Plan 04-03 pode trocar para Sonnet em fast path se métricas Langfuse indicarem"
  - "TOKEN_BUDGET=200_000 (input+output cumulativo) — ~$3 com Opus, conservador antes de explosão de custo. Cache hits NÃO entram no budget (já são input_tokens regular medidos via usage)"
  - "stop_reason fora de {end_turn, tool_use} retorna success=false COM prefixo [stop_reason=X] no finalMessage — Plan 04-03 popula last_error a partir disso para diagnóstico de needs_review"
  - "Loop detector chamado ANTES do dispatchTool (não depois): se mesma janela repetir, abortamos sem pagar idempotency cache miss + audit write"
  - "Tipos AnthropicResponse internos loose ao invés de Anthropic.Message — facilita mock queue em vitest sem precisar materializar todos os campos opcionais do SDK"
  - "buildCachedSystem retorna 2 blocos fixos (não array variádico): plan 03 não vai precisar adicionar mais blocos cacheados; KISS"
  - "finalMessage acumula o ÚLTIMO conteúdo de texto observado (não concatena turnos): em sucesso é o end_turn message; em falha é o último texto antes do max_tokens/erro"
metrics:
  duration: "~12min"
  completed: "2026-05-08"
  tasks_total: 2
  tasks_completed: 2
  files_created: 5
  files_modified: 0
  commits: 3
  tests_added: 18
  tests_passing: 18
  jarvis_runtime_total_tests: 120
  coverage_stmts_new_files: 98.63
  coverage_funcs_new_files: 100
---

# Phase 4 Plan 2: Jarvis Agent Loop Summary

**One-liner:** Coração do Jarvis pronto: `runAgentLoop()` orquestra `anthropic.messages.create` (model=`claude-opus-4-7`, max_tokens=8192) com 3 guardas anti-explosão (MAX_ITER=25, TOKEN_BUDGET=200k, LoopDetector janela-3 hash canonical), prompt caching ephemeral 1h via `buildCachedSystem`, e telemetria de cache hits para Langfuse — 18 tests verdes (9 LoopDetector + 9 agent-loop), 98.63% statements coverage nos 3 arquivos novos, zero fetch direto. Plan 04-03 pode importar `runAgentLoop(session, ctx)` direto no cron handler.

## Repository Context

- **Working repo:** `C:/Users/dopeb/Desktop/admin-pipeelo` (Next.js 15)
- **Planning artifacts:** `C:/Users/dopeb/Desktop/pipeelo-onboarding-flow/.planning/`
- Cross-repo igual Phase 4-00/01: plan/state vivem no onboarding-flow; código vive no admin-pipeelo.

## Tasks Executed

### Task 1 — anthropic-client.ts + loop-detector.ts (TDD)

**Status:** Completed
**Commit:** `67ac0b8`
**Files:**
- `api/jarvis/_runtime/anthropic-client.ts` (created)
- `api/jarvis/_runtime/loop-detector.ts` (created)
- `api/jarvis/_runtime/loop-detector.test.ts` (created, 9 tests)

**Behavior:**
- `anthropic`: singleton `new Anthropic({apiKey: process.env.ANTHROPIC_API_KEY ?? 'test-key'})`. Warn em import-time se key ausente; não throw (testes mockam).
- `buildCachedSystem(static, dynamic)`: 2-block array — `[0]` static com `cache_control: {type:'ephemeral', ttl:'1h'}`, `[1]` dynamic sem cache. Tipo `CachedSystemBlock` exportado.
- `LoopDetector`: janela 3 com hash sha256 truncado (16 chars). `record({name, input})` empilha hash; quando length ≥ 6, compara últimos-3 vs anteriores-3, se idêntico → `throw LoopDetectedError(hashes)`.
- `canonicalJson`: serialização recursiva com chaves ordenadas — `{a:1,b:2}` e `{b:2,a:1}` produzem mesmo hash.

**Test coverage:** sequência distinta OK; janela espelhada A,B,C,A,B,C → throw; mudança no último elemento (A,B,C,A,B,D) → ok; key-order-insensitive verificado; nested args canonicalizados; LoopDetectedError expõe `hashes[]`; `buildCachedSystem` shape verificado.

**Cobre:** JARV-03 (loop detector), JARV-08 (cache_control ephemeral 1h).

**Verify:** `npx vitest run api/jarvis/_runtime/loop-detector.test.ts` → 9/9 passing.

### Task 2 — agent-loop.ts: runAgentLoop com guardas + cache (TDD)

**Status:** Completed
**Commits:** `22588c1` (impl + 9 tests) + `3ce8247` (cleanup TS strict cast no test)
**Files:**
- `api/jarvis/_runtime/agent-loop.ts` (created)
- `api/jarvis/_runtime/agent-loop.test.ts` (created, 9 tests)

**Behavior:**
- `runAgentLoop(session, ctx)`: while iterations < MAX_ITER:
  1. `anthropic.messages.create({model:'claude-opus-4-7', max_tokens:8192, system:buildCachedSystem(...), tools:JARVIS_TOOLS, messages})`
  2. Acumula `totalInputTokens`, `totalOutputTokens`, `cacheReadTokens`, `cacheCreationTokens` de `resp.usage`
  3. `cumulative > TOKEN_BUDGET (200_000)` → `throw TokenBudgetError(sessionId, cumulative)`
  4. Captura último texto em `finalMessage`
  5. `stop_reason==='end_turn'` → return `{success:true, ...}`
  6. `stop_reason!=='tool_use'` (max_tokens/stop_sequence) → return `{success:false, finalMessage:'[stop_reason=X] ...'}`
  7. Para cada `tool_use` block: `detector.record(...)` (pode throw `LoopDetectedError`); depois `dispatchTool(...)` em paralelo via `Promise.all`
  8. Push assistant content + user tool_results em `messages`
  9. Loop atinge `MAX_ITER` → `throw MaxIterationsError(sessionId, iterations)`

- Constantes exportadas: `MAX_ITER=25`, `TOKEN_BUDGET=200_000`, `MODEL='claude-opus-4-7'`.
- Erros exportados: `MaxIterationsError`, `TokenBudgetError`, `LoopDetectedError` (re-export do detector).
- Tipo `AgentLoopResult` com `success | iterations | totalInputTokens | totalOutputTokens | cacheReadTokens | cacheCreationTokens | finalMessage`.

**Test coverage (9 cases):**
1. End_turn imediato → success, iter=1, tokens corretos, dispatchTool não chamado
2. Anthropic call shape (model claude-opus-4-7, max_tokens=8192, system[0] tem cache_control ephemeral 1h, system[1] sem cache, tools.length=1)
3. tool_use → tool_use → end_turn (3 iter, 2 dispatchTool)
4. MAX_ITER atingido → MaxIterationsError (verificado MAX_ITER===25)
5. Budget excedido → TokenBudgetError em ~4 turns com 60k input/turn
6. LoopDetectedError em sequência A,B,C,A,B,C
7. Cache ratio: 5 turns × 20k input × 15k cache_read → ratio 75% ≥ 0.7
8. stop_reason='max_tokens' → success=false, finalMessage contém "max_tokens"
9. Múltiplos tool_use blocks num turn → dispatchTool chamado N×

**Cobre:** JARV-03, JARV-08, JARV-10.

**Verify:** `npx vitest run api/jarvis/_runtime/agent-loop.test.ts` → 9/9 passing.

## Verification Results

```
$ npx vitest run api/jarvis/_runtime/ --reporter=dot
 Test Files  19 passed (19)
      Tests  120 passed (120)

$ npx vitest run --coverage \
    --coverage.include='api/jarvis/_runtime/agent-loop.ts' \
    --coverage.include='api/jarvis/_runtime/loop-detector.ts' \
    --coverage.include='api/jarvis/_runtime/anthropic-client.ts' \
    api/jarvis/_runtime/agent-loop.test.ts api/jarvis/_runtime/loop-detector.test.ts
-------------------|---------|----------|---------|---------|
File               | % Stmts | % Branch | % Funcs | % Lines |
-------------------|---------|----------|---------|---------|
All files          |   98.63 |    84.37 |     100 |   98.57 |
 agent-loop.ts     |     100 |    83.33 |     100 |     100 |
 anthropic-client  |     100 |       75 |     100 |     100 |
 loop-detector.ts  |      95 |       90 |     100 |   94.44 |
-------------------|---------|----------|---------|---------|

$ npx tsc --noEmit | grep -E "(agent-loop|loop-detector|anthropic-client)"
# (zero erros — pre-existing 700+ TS errors em lib/ fora do escopo)

$ grep -E '\bfetch\s*\(' api/jarvis/_runtime/agent-loop.ts
# (zero matches — JARV-10 cumprido)
```

## Success Criteria

- [x] **JARV-03** ✅ MAX_ITER=25 hard cap + TOKEN_BUDGET=200k cumulative + LoopDetector janela 3 com canonical hash
- [x] **JARV-08** ✅ `cache_control: {type:'ephemeral', ttl:'1h'}` no `system[0]`; `cacheReadTokens` acumulado e exposto em AgentLoopResult; ratio ≥ 0.7 verificado em fixture warm-cache
- [x] **JARV-10** ✅ agent-loop só chama `dispatchTool` (zero fetch direto verificável via grep); tools whitelist herdada do Plan 01
- [x] Plan 04-03 pode `import { runAgentLoop } from '../_runtime/agent-loop'` e invocar de dentro de `app/api/cron/jarvis-tick/route.ts`
- [x] 2 tasks executados, 3 commits atômicos
- [x] Tests passing >80% coverage (atingiu 98.63% statements)

## Deviations from Plan

**1. [Rule 1 - Bug] finalMessage para `stop_reason!==end_turn` precisava preservar contexto de diagnóstico**
- **Found during:** Task 2 — test `unexpected stop_reason (max_tokens)` esperava `finalMessage.toContain("max_tokens")`, mas implementação inicial retornava só o texto do bloco (`"truncated"`).
- **Issue:** Sem o stop_reason no finalMessage, Plan 04-03 não consegue popular `last_error` com sinal claro para `needs_review`.
- **Fix:** Sempre prefixar `[stop_reason=X]` antes do texto capturado (ou retornar só o prefixo se não há texto). Diagnóstico cirúrgico: Felipe consegue diferenciar `[stop_reason=max_tokens]` (truncamento) de `[stop_reason=stop_sequence]` (custom stop) sem rodar replay.
- **Files modified:** `api/jarvis/_runtime/agent-loop.ts`
- **Commit:** parte de `22588c1`

**2. [Rule 1 - Bug] TS2493 em `mocks.messagesCreate.mock.calls[0][0]` (tuple type narrowing)**
- **Found during:** `npx tsc --noEmit` após primeiro commit Task 2.
- **Issue:** Vitest mock.calls é tipado como `Parameters<T>[]` que TS estreita para `[]` quando o tipo da fn não é totalmente inferido pelo mock factory; indexação por `[0]` falha TS2493.
- **Fix:** Cast através de `unknown[][]` (`(mocks.messagesCreate.mock.calls as unknown as unknown[][])[0]`). Runtime intacto, TS happy.
- **Files modified:** `api/jarvis/_runtime/agent-loop.test.ts`
- **Commit:** `3ce8247`

**Pre-existing TS errors (out of scope per scope_boundary):** 714 erros TS pré-existentes em `lib/storage.ts`, `lib/tags-database.ts`, etc. Mesma situação documentada em Phase 3-02 e 4-01 SUMMARY. Zero erros TS introduzidos em arquivos novos desta wave.

## Authentication Gates

Nenhum auth gate hit nesta wave — execução 100% autônoma.

**Pendente checkpoint humano (não bloqueia Plan 04-03):**
- Setar `ANTHROPIC_API_KEY` em Vercel admin-pipeelo (já no .env.example pelo Plan 04-00). Plan 04-03 (lease + cron) precisa key viva apenas para integration test em staging — unit tests com mock queue funcionam offline.

## Commits

| Hash | Message |
|------|---------|
| `67ac0b8` | feat(04-02): adiciona loop-detector + anthropic-client com cache ephemeral 1h |
| `22588c1` | feat(04-02): adiciona agent-loop com MAX_ITER=25 + token budget + loop detector |
| `3ce8247` | chore(04-02): cleanup TS strict cast em agent-loop.test.ts |

## Contracts Exported (consumed by Plan 04-03)

```typescript
// api/jarvis/_runtime/agent-loop.ts
export const MAX_ITER: 25;
export const TOKEN_BUDGET: 200_000;
export const MODEL: "claude-opus-4-7";
export class MaxIterationsError extends Error { sessionId: string; iterations: number; }
export class TokenBudgetError extends Error { sessionId: string; totalTokens: number; }
export { LoopDetectedError } from "./loop-detector";

export interface AgentLoopResult {
  success: boolean;
  iterations: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  finalMessage: string;
}

export async function runAgentLoop(
  session: SessionContext,    // de ./system-prompt
  ctx: ToolContext,           // de ./tools/_shared/types
): Promise<AgentLoopResult>;

// api/jarvis/_runtime/anthropic-client.ts
export const anthropic: Anthropic;
export type CachedSystemBlock = ...;
export function buildCachedSystem(staticPrompt: string, dynamicContext: string): CachedSystemBlock[];

// api/jarvis/_runtime/loop-detector.ts
export class LoopDetector {
  record(call: { name: string; input: unknown }): void;  // throws LoopDetectedError
}
export class LoopDetectedError extends Error { hashes: string[]; }
```

## Pitfalls Endereçados

- **Pitfall 1 (Loop / context blow-up — risco #1 da Phase 4):** triple-defense — (a) `MAX_ITER=25` cap absoluto; (b) `TOKEN_BUDGET=200_000` cumulativo (input+output) com TokenBudgetError early-abort; (c) `LoopDetector` janela-3 com hash canonical — agente que oscile entre `{a,b}` e `{b,a}` é detectado.
- **Pitfall 5 (Tool whitelist bypass):** herdado de Plan 01 — `dispatchTool` é único exit; agent-loop nunca chama fetch.
- **Pitfall 6 (Token cost runaway):** `cacheReadTokens` exposto em `AgentLoopResult` permite Plan 04-03 escrever em `jarvis_runs.cache_read_tokens` para alerting/dashboard quando cache_hit_ratio < 0.7 (degradação de cache invalidando custo).

## What's Next

- **Plan 04-03 (lease + cron):** importar `runAgentLoop` em `app/api/cron/jarvis-tick/route.ts`. Fluxo: `claim_session` (SKIP LOCKED da Wave 0 migration) → `runAgentLoop(session, ctx)` → write `cache_read_tokens` em `jarvis_runs` → release lease ou bump `attempt_count + last_error` em caso de erro. Errors específicos (MaxIterationsError, TokenBudgetError, LoopDetectedError) viram `last_error` estruturado para `needs_review` triage.

## Self-Check: PASSED

**Files verified:**
- FOUND: C:/Users/dopeb/Desktop/admin-pipeelo/api/jarvis/_runtime/loop-detector.ts
- FOUND: C:/Users/dopeb/Desktop/admin-pipeelo/api/jarvis/_runtime/loop-detector.test.ts
- FOUND: C:/Users/dopeb/Desktop/admin-pipeelo/api/jarvis/_runtime/anthropic-client.ts
- FOUND: C:/Users/dopeb/Desktop/admin-pipeelo/api/jarvis/_runtime/agent-loop.ts
- FOUND: C:/Users/dopeb/Desktop/admin-pipeelo/api/jarvis/_runtime/agent-loop.test.ts

**Commits verified:**
- FOUND: 67ac0b8
- FOUND: 22588c1
- FOUND: 3ce8247
