---
phase: 06-evals-cutover
plan: 03
subsystem: cutover-prod-jarvis-flip-back-drill
status: awaiting_checkpoint_human_action
tags: [eval-05, eval-06, wave-3, cutover, flip-back, drill, monitor, runbook, vercel-env, hard-gate-prod, cli, tdd]

dependency_graph:
  requires:
    - phase: 06-evals-cutover
      provides: "Plan 06-00 — feature flag JARVIS_ENABLED runtime-read + branch handler legacy/jarvis (consumido por flip-back-drill)"
    - phase: 06-evals-cutover
      provides: "Plan 06-01 — replay sign-off (sem regressao funcional 5 sessoes)"
    - phase: 06-evals-cutover
      provides: "Plan 06-02 — threshold-check + EVAL-RESULTS GO-LIVE APPROVED"
    - phase: 03-tool-layer-audit
      provides: "jarvis_runs + jarvis_tool_calls (consumido por cutover-monitor)"
    - phase: 04-jarvis-cron-pipeline
      provides: "cron worker que processa pending pos-flip"
    - phase: 05-painel-notificacoes
      provides: "WhatsApp alertas Felipe + dashboard observabilidade humana"
  provides:
    - "scripts/flip-back-drill.ts (CLI cronometrado 5-step + hard gate prod + vercelClient injetavel)"
    - "scripts/cutover-monitor.ts (snapshot/--watch + alertas ERROR_RATE_HIGH/CROSS_TENANT_DETECTED/LATENCY_P95_HIGH)"
    - "scripts/flip-back-drill.test.ts (11 tests TDD)"
    - "CUTOVER-RUNBOOK.md (7 etapas humanas: pre-flight + drill staging + drill prod + flip ON + monitor 24h + expand + flip back + post-mortem)"
    - "CUTOVER-LOG.md (scaffold para Felipe documentar drills, flips, primeiros clientes, alertas, decisoes)"
  affects:
    - "Phase 6 (conclusao): bloqueada ate cutover real executado por Felipe + sign-off em CUTOVER-LOG.md"
    - "ROADMAP: Phase 6 marcada done somente apos checkpoint humano completo"

tech-stack:
  added: []
  patterns:
    - "VercelClient interface injetavel (setEnv/removeEnv) — testabilidade sem hit em API real"
    - "DrillStep com early stop on first failure: pipeline curto-circuita para nao mascarar root cause"
    - "Clock injetavel (() => number) em runDrill: testes simulam overrun de 30s sem timers reais"
    - "Hard gate em duas camadas: --env=production rejeitado sem --i-know-what-im-doing (drill); --env=prod|production proibido (monitor consulta janela passada — seguro)"
    - "computeSnapshot puro (sem IO) + detectAlerts puro: 100% testavel; main() apenas wires fetch + render"
    - "P95 latency via sort + ceil(0.95 * N) - 1: simples sem dependencia stat externa"
    - "lastErrors window de 5 mensagens: contexto suficiente para diagnostico, sem flood no terminal"

key-files:
  created:
    - C:/Users/dopeb/Desktop/admin-pipeelo/scripts/flip-back-drill.ts
    - C:/Users/dopeb/Desktop/admin-pipeelo/scripts/flip-back-drill.test.ts
    - C:/Users/dopeb/Desktop/admin-pipeelo/scripts/cutover-monitor.ts
    - C:/Users/dopeb/Desktop/pipeelo-onboarding-flow/.planning/phases/06-evals-cutover/CUTOVER-RUNBOOK.md
    - C:/Users/dopeb/Desktop/pipeelo-onboarding-flow/.planning/phases/06-evals-cutover/CUTOVER-LOG.md
  modified: []

key-decisions:
  - "VercelClient interface injetavel em vez de chamar fetch para api.vercel.com inline: permite testar runDrill sem hitar API real + facilita swap para vercel CLI no futuro. Implementacao default usa fetch + Vercel API v10."
  - "Drill executa 5 steps em ordem fixa (flip-on -> verify-jarvis -> flip-off -> verify-legacy -> smoke-processor): early stop em qualquer falha para nao mascarar cascata de erros. passedTarget = true so se TODOS os 5 ok E totalMs <=30s."
  - "Smoke processor invoca processOnboardingSession(opts.smokeSessionId, 'drill-smoke-'): exige DRILL_SMOKE_SESSION_ID em env (sessao ja completada usada como fixture). NAO usa payload sintetico — quer testar caminho real legacy fim-a-fim."
  - "cutover-monitor computeSnapshot retorna estrutura plana sem dependencia de Supabase: testavel com arrays inline. fetch real e isolado em fetchWindow."
  - "Threshold cross-tenant via regex `cross[-.\\s]?tenant|tenant[-.\\s]?bleed|wrong[-.\\s]?tenant` (mesmo padrao do Plan 06-02 threshold-check): consistencia entre fontes de detecao."
  - "Watch mode usa clear screen ANSI `\\x1b[2J\\x1b[H` e SIGINT handler: ctrl+c-friendly em terminais Windows + Unix. Stderr emite alertas criticos para visibilidade mesmo com pipe."
  - "Vercel removeEnv faz lookup por key em GET /env -> DELETE /env/{id}: Vercel API exige ID, nao key. Drill assume estado limpo (key existe pre-remove); em prod garantir cleanup."

requirements-completed:
  - EVAL-06  # codigo entregue; sign-off humano pendente via Step 0.4 do RUNBOOK
  # EVAL-05 (cutover gradual real) so completa apos Felipe executar Steps 1-4 do RUNBOOK

metrics:
  duration_minutes: 8  # tasks autonomas; checkpoint humano pendente
  tasks_completed_autonomous: 2
  tasks_total: 3
  tasks_pending_checkpoint: 1
  files_created: 5
  files_modified: 0
  commits_admin_pipeelo: 2
  commits_onboarding_flow: 1
  tests_added: 11
  tests_passing: 11
  full_suite_passing: 366
  full_suite_total: 366
  completed_date: null  # awaiting human checkpoint
---

# Phase 6 Plan 3: Cutover Producao Jarvis + Flip-Back Drill Summary (PARTIAL — awaiting checkpoint:human-action)

**One-liner:** Drill cronometrado `flip-back-drill.ts` (5-step pipeline com vercelClient injetavel, hard gate `--env=production` exige `--i-know-what-im-doing`, target <30s validado em test) + monitor `cutover-monitor.ts` (`--snapshot|--watch` agregando jarvis_runs/jarvis_tool_calls + alertas ERROR_RATE_HIGH/CROSS_TENANT_DETECTED/LATENCY_P95_HIGH) + `CUTOVER-RUNBOOK.md` 7 etapas humanas (pre-flight com drill staging+prod + flip ON + monitor 24h + expand + flip back + post-mortem) + `CUTOVER-LOG.md` scaffold para Felipe documentar drills/flips/clientes/alertas. 11 tests TDD verdes, suite full 366/366 zero regressoes (era 355; +11). Task 3 e checkpoint:human-action — Felipe executa cutover real em prod seguindo RUNBOOK.

## Performance

- **Duration:** ~8 min (tasks 1+2 autonomas TDD; checkpoint humano em aberto)
- **Started:** 2026-05-08 (continuacao da sessao Plan 06-02)
- **Completed:** codigo + runbook entregues; cutover real pendente Felipe
- **Tasks:** 3 (2 auto + 1 checkpoint:human-action)
- **Files created:** 5 | **Files modified:** 0

## Repository Context

- **Working repo (codigo):** `C:/Users/dopeb/Desktop/admin-pipeelo` (Next.js 16, App Router) — branch `main` (37 commits ahead of origin)
- **Planning repo (docs/runbook):** `C:/Users/dopeb/Desktop/pipeelo-onboarding-flow` — branch `migration/vercel`
- Cross-repo igual Plans 06-00/01/02: scripts em admin-pipeelo, runbook + log em onboarding-flow.

## Tasks Executed

### Task 1 (TDD) — flip-back-drill.ts + cutover-monitor.ts

**Status:** Completed
**Commits:** `76d131f` (RED), `0ca038b` (GREEN)

**Files created:**
- `admin-pipeelo/scripts/flip-back-drill.ts` (293 linhas)
- `admin-pipeelo/scripts/cutover-monitor.ts` (289 linhas)
- `admin-pipeelo/scripts/flip-back-drill.test.ts` (290 linhas, 11 tests)

**flip-back-drill.ts behavior:**

- `parseDrillArgs(argv)`: aceita `--env=staging|production`. `production` exige `--i-know-what-im-doing` (hard gate). Retorna `{env, confirmed}`.
- `VercelClient` interface (`setEnv`, `removeEnv`) injetavel; default `createVercelClient(token, projectId)` usa Vercel API v10 (`POST /v10/projects/{id}/env` + `GET` lookup + `DELETE`).
- `runDrill(opts)`: 5 steps cronometrados em ordem fixa:
  1. `flip-on` — `vercelClient.setEnv("JARVIS_ENABLED", "true", target)` + propagation delay
  2. `verify-jarvis-mode` — `POST /api/clients/onboarding/create` + assert `data.mode === "jarvis"`
  3. `flip-off` — `vercelClient.removeEnv("JARVIS_ENABLED", target)` + propagation delay
  4. `verify-legacy-mode` — POST + assert `data.mode === "legacy"`
  5. `smoke-processor` — `processOnboardingSession(smokeSessionId, "drill-smoke-")` + assert `success`
- Early stop em primeira falha (nao mascara root cause).
- `passedTarget` = todos 5 ok E `totalMs <= 30000`.
- `clock` injetavel (default `Date.now`) — testes simulam overrun de 30s sem timers reais.
- CLI: exit 0 se passedTarget, 1 senao. Exige `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, `ADMIN_BASE_URL`, `ONBOARDING_WEBHOOK_TOKEN`, `DRILL_SMOKE_SESSION_ID`.

**cutover-monitor.ts behavior:**

- `parseMonitorArgs(argv)`: `--watch|--snapshot`, `--window=N` (minutos, default 60), `--interval=N` (segundos, default 30).
- `computeSnapshot({runs, toolCalls, windowMinutes})` (puro): conta status (completed/failed/needs_review/in_progress), errorRate = failed/total, avgLatencyMs, p95LatencyMs (sort+ceil), lastErrors (5 ultimas), toolCalls successRate.
- `detectAlerts(snap)`: emite ate 3 alertas:
  - `ERROR_RATE_HIGH` (critical) se errorRate >5% e total >0
  - `CROSS_TENANT_DETECTED` (critical) se regex `cross[-.\s]?tenant|tenant[-.\s]?bleed|wrong[-.\s]?tenant` em qualquer error
  - `LATENCY_P95_HIGH` (warning) se p95 >300s
- `renderSnapshot(snap, alerts)`: tabela formatada para terminal.
- Watch mode: clear screen ANSI + SIGINT handler ctrl+c-friendly. Alertas criticos em stderr (visivel mesmo com pipe).
- `fetchWindow`: queries `jarvis_runs` (status, duration_ms, error, started_at; ultimo 500) + `jarvis_tool_calls` (error; ultimo 2000) com filtro `gte('started_at', since)`.

**Tests (11):**

- parseDrillArgs (4): default staging, rejeita production sem flag, aceita production com flag, rejeita env invalido
- runDrill (3): pipeline 5 steps OK + passedTarget=true; clock injetado forca overrun >30s -> passedTarget=false; verify-jarvis-mode FAIL se webhook responde mode=legacy + early stop
- computeSnapshot (1): agrega 4 runs com 3 statuses + 4 tool calls; valida total/completed/failed/needsReview/errorRate/avgLatencyMs/successRate
- detectAlerts (3): ERROR_RATE_HIGH em 50% errorRate; CROSS_TENANT_DETECTED em error com pattern; vazio quando saudavel

**Verify:** `npx vitest run scripts/flip-back-drill.test.ts` -> 11/11. `npx vitest run` (full) -> 366/366 (era 355; +11 zero regressao).

**Cobre:** EVAL-06 (codigo do flip back; sign-off humano via drill prod).

### Task 2 — CUTOVER-RUNBOOK.md + CUTOVER-LOG.md

**Status:** Completed
**Commit (onboarding-flow):** `efa6811`

**Files created:**
- `pipeelo-onboarding-flow/.planning/phases/06-evals-cutover/CUTOVER-RUNBOOK.md` (259 linhas, 7 Step headings)
- `pipeelo-onboarding-flow/.planning/phases/06-evals-cutover/CUTOVER-LOG.md` (scaffold com tabelas)

**RUNBOOK conteudo:**

- **Pre-requisitos:** sign-offs Plans 06-00/01/02, painel Phase 5, migrations Phase 3+4
- **Step 0 (Pre-flight T-1h):** drill staging + smoke processor prod read-only + janela baixa + drill prod (hard requirement EVAL-06, em janela 0 onboardings)
- **Step 1 (Flip ON T+0):** `vercel env add JARVIS_ENABLED production` + verify via curl + redeploy opcional
- **Step 2 (Aguardar T+0 a T+24h):** NAO forcar; primeira sessao nova vai para Jarvis automaticamente; iniciar `cutover-monitor --watch`
- **Step 3 (Monitor 24h):** criterios GO/NO-GO tabulados (4 GO + 5 NO-GO)
- **Step 4 (Expandir):** documentar no LOG, deixar permanente
- **Step 5 (Flip BACK <30s):** `vercel env rm` + tratamento de sessoes em curso (deixar terminar OU update needs_review)
- **Step 6 (Post-mortem T+48h):** caminho feliz (marca Phase 6 done) ou rolled back (Plan 06-04)
- **Comandos de emergencia:** tabela 5 situacoes
- **Contatos:** Felipe WhatsApp + Langfuse + Vercel + Phase 5

**LOG scaffold:**
- Tabelas pre-feitas: Drills, Flip ON, Primeiros clientes (3 templates Cliente #N), Eventos/Alertas, Flip BACK, Decisoes finais
- Felipe preenche conforme RUNBOOK avanca

**Verify:** `test -f CUTOVER-RUNBOOK.md && grep -c "^## Step" CUTOVER-RUNBOOK.md` -> 7 steps + 259 linhas (>= 80 min).

**Cobre:** estrutura humana de EVAL-05 + EVAL-06.

### Task 3 — Felipe executa CUTOVER-RUNBOOK em prod (CHECKPOINT:human-action)

**Status:** PENDING — awaiting human action
**Resume signal:** "cutover complete + link CUTOVER-LOG.md" OU "rolled back: {reason}"

Conteudo executavel entregue. Cutover real exige humano (decisao + interacao com Vercel UI/CLI prod + WhatsApp alerts + sessoes reais). NAO automatizavel — explicitamente caso de borda 1% (`checkpoint:human-action`).

## Verification Results

```
$ npx vitest run scripts/flip-back-drill.test.ts
 Test Files  1 passed (1)
      Tests  11 passed (11)

$ npx vitest run
 Test Files  57 passed (57)
      Tests  366 passed (366)

$ test -f .planning/phases/06-evals-cutover/CUTOVER-RUNBOOK.md && grep -c "^## Step" .planning/phases/06-evals-cutover/CUTOVER-RUNBOOK.md
7

$ wc -l .planning/phases/06-evals-cutover/CUTOVER-RUNBOOK.md
259
```

## Success Criteria

- [x] flip-back-drill.ts implementado com 5-step pipeline + hard gate + clock injetavel
- [x] cutover-monitor.ts implementado com snapshot/watch + 3 alertas
- [x] Tests TDD verdes (11/11) + suite full sem regressao (366/366)
- [x] CUTOVER-RUNBOOK.md com 7 etapas (>= 80 linhas requirement; entregue 259)
- [x] CUTOVER-LOG.md scaffold pronto para Felipe preencher
- [ ] **EVAL-05** Felipe executa Steps 1-4 do RUNBOOK em prod com 1 cliente novo + 24h monitor
- [ ] **EVAL-06** Felipe valida drill prod em janela 0 onboardings (Step 0.4) + flip back real <30s (caso necessario)
- [ ] CUTOVER-LOG.md preenchido com primeiro cliente Jarvis + decisao expand
- [ ] Phase 6 marcada done em ROADMAP apos sign-off

## Deviations from Plan

**None.** Plan executado exatamente como escrito para tasks autonomas.

Decisao adicional documentada (nao deviation): VercelClient como interface injetavel em vez de chamar fetch inline. Plan especificava "ou via Vercel API se token disponivel" — escolhido injecao para testabilidade. Implementacao default usa Vercel API v10 (POST/DELETE /v10/projects/{id}/env).

## Issues Encontrados

- **Pre-existente fora de escopo:** `api/jarvis/_runtime/sanitize-input.test.ts` tem 3 deletions nao staged no working tree desde antes desta plan. Aplicada Scope Boundary — nao toca, log para ciencia.
- **Multiplos PLAN.md untracked em planning repo:** Plans Phase 4 + 5 + 6 estao untracked (planning convention). Stage seletivo somente dos artefatos desta plan.

## Authentication Gates

Nenhum auth gate hit nas tasks autonomas — execucao 100% offline (mocks de Vercel + Supabase + processor).

**Pendente checkpoint humano (Task 3):**
- VERCEL_TOKEN + VERCEL_PROJECT_ID prod (Felipe ja tem acesso Vercel dashboard)
- ADMIN_BASE_URL + ONBOARDING_WEBHOOK_TOKEN prod
- DRILL_SMOKE_SESSION_ID (sessao ja completada em prod)
- WhatsApp Felipe ativo para alertas
- Janela 0 onboardings via Phase 5 dashboard (prereq Step 0.4)

## Commits

| Hash | Repo | Message |
|------|------|---------|
| `76d131f` | admin-pipeelo | test(06-03): RED — failing tests para flip-back-drill + cutover-monitor |
| `0ca038b` | admin-pipeelo | feat(06-03): implementa flip-back-drill + cutover-monitor (GREEN 11/11) |
| `efa6811` | onboarding-flow (migration/vercel) | docs(06-03): CUTOVER-RUNBOOK + CUTOVER-LOG scaffold |
| _pending_ | onboarding-flow | docs(06-03): SUMMARY parcial + state updates pos-checkpoint |

## Contracts Exported

```typescript
// scripts/flip-back-drill.ts
export interface DrillArgs { env: "staging"|"production"; confirmed: boolean; }
export function parseDrillArgs(argv: string[]): DrillArgs;

export interface VercelClient {
  setEnv: (key: string, value: string, target: string) => Promise<{ok: boolean; error?: string}>;
  removeEnv: (key: string, target: string) => Promise<{ok: boolean; error?: string}>;
}
export function createVercelClient(token: string, projectId: string): VercelClient;

export interface DrillStep { name: string; ok: boolean; durationMs: number; error?: string; details?: Record<string, unknown>; }
export interface DrillResult { env: string; startedAt: string; totalMs: number; passedTarget: boolean; targetMs: number; steps: DrillStep[]; }
export interface DrillOptions {
  env: "staging"|"production"; confirmed: boolean;
  vercelClient: VercelClient; propagationDelayMs?: number; smokeSessionId: string;
  vercelTarget?: string; clock?: () => number; log?: (msg: string) => void;
}
export async function runDrill(opts: DrillOptions): Promise<DrillResult>;

// scripts/cutover-monitor.ts
export interface JarvisRunRow { status: string; duration_ms: number|null; error: {message?: string}|null; started_at: string; }
export interface JarvisToolCallRow { error: {message?: string}|null; }
export interface MonitorSnapshot { /* generatedAt, windowMinutes, runs{...}, toolCalls{...} */ }
export interface MonitorAlert { code: "ERROR_RATE_HIGH"|"CROSS_TENANT_DETECTED"|"LATENCY_P95_HIGH"; severity: "warning"|"critical"; message: string; }
export function computeSnapshot(input: {runs: JarvisRunRow[]; toolCalls: JarvisToolCallRow[]; windowMinutes: number}): MonitorSnapshot;
export function detectAlerts(snap: MonitorSnapshot): MonitorAlert[];
export function renderSnapshot(snap: MonitorSnapshot, alerts: MonitorAlert[]): string;
export function parseMonitorArgs(argv: string[]): { mode: "snapshot"|"watch"; windowMinutes: number; intervalSeconds: number; };
```

## What's Next

**Felipe (humano — caminho do checkpoint):**

1. Executar `Step 0` do RUNBOOK (drill staging + smoke prod + drill prod em janela 0)
2. Documentar resultados em `CUTOVER-LOG.md` linhas "Drills"
3. Se drill prod `passedTarget=true`: prosseguir Step 1 (flip ON)
4. Acompanhar `cutover-monitor --watch` em terminal dedicado por 24h (Step 2-3)
5. Documentar primeiro cliente Jarvis em `CUTOVER-LOG.md` (Cliente #1)
6. Decisao expand (Step 4) ou flip back (Step 5) baseado nos criterios
7. Step 6 post-mortem + sign-off final em `CUTOVER-LOG.md`

**Pos sign-off (continuacao Claude):**
- Atualizar `ROADMAP.md` Phase 6 = done
- Marcar EVAL-05 + EVAL-06 done em `REQUIREMENTS.md`
- Atualizar `STATE.md` com decisao final + metricas Phase 6
- Final commit + Phase 6 RETROSPECTIVE entry

---

## Self-Check: PASSED (parcial — escopo autonomo)

**Files verified:**
- FOUND: C:/Users/dopeb/Desktop/admin-pipeelo/scripts/flip-back-drill.ts
- FOUND: C:/Users/dopeb/Desktop/admin-pipeelo/scripts/flip-back-drill.test.ts
- FOUND: C:/Users/dopeb/Desktop/admin-pipeelo/scripts/cutover-monitor.ts
- FOUND: C:/Users/dopeb/Desktop/pipeelo-onboarding-flow/.planning/phases/06-evals-cutover/CUTOVER-RUNBOOK.md
- FOUND: C:/Users/dopeb/Desktop/pipeelo-onboarding-flow/.planning/phases/06-evals-cutover/CUTOVER-LOG.md

**Commits verified:**
- FOUND: 76d131f (admin-pipeelo, RED tests)
- FOUND: 0ca038b (admin-pipeelo, GREEN impl)
- FOUND: efa6811 (onboarding-flow migration/vercel, RUNBOOK + LOG)

**Tests:**
- FOUND: 11/11 scripts/flip-back-drill.test.ts green
- FOUND: 366/366 full suite green (era 355; +11 zero regressao)

**Pending:**
- Task 3 checkpoint:human-action — Felipe executa cutover via RUNBOOK
- Sign-off em CUTOVER-LOG.md
- ROADMAP/REQUIREMENTS/STATE updates pos-checkpoint

---
*Phase: 06-evals-cutover*
*Codigo + runbook entregues: 2026-05-08; cutover real e sign-off pendente Felipe*
