---
phase: 06-evals-cutover
plan: 00
subsystem: infra
tags: [feature-flag, cutover, jarvis, webhook, vitest, env-vars]

# Dependency graph
requires:
  - phase: 03-tool-layer-audit
    provides: jarvis_runs/tool_calls audit tables (consumidos pelo cron Phase 4 que esta flag ativa)
  - phase: 04-jarvis-cron-pipeline
    provides: cron `/api/cron/jarvis-tick` + lease pattern (consumidor downstream do branch jarvis)
provides:
  - Feature flag JARVIS_ENABLED runtime-evaluated em admin-pipeelo
  - Webhook handler com branch determinístico (legacy vs jarvis)
  - Default seguro `JARVIS_ENABLED=false` preserva path determinístico em prod
  - Helper `isJarvisEnabled()` reusável (mas atualmente isolado no webhook por design)
affects: [06-01-replay, 06-02-langfuse-evals, 06-03-cutover, 04-jarvis-cron]

# Tech tracking
tech-stack:
  added: []  # zero deps novas — implementação intencionalmente trivial
  patterns:
    - "Feature flag runtime-read (não cacheada em const top-level) → flip <30s sem redeploy"
    - "vi.hoisted() para mocks com dependências circulares no factory"

key-files:
  created:
    - admin-pipeelo/lib/feature-flags.ts
    - admin-pipeelo/lib/feature-flags.test.ts
    - admin-pipeelo/app/api/clients/onboarding/create/route.test.ts
    - admin-pipeelo/.env.example
  modified:
    - admin-pipeelo/app/api/clients/onboarding/create/route.ts

key-decisions:
  - "Flag runtime-read via process.env.X a cada chamada (não const module-level): único jeito de honrar EVAL-06 flip back <30s sem redeploy Vercel"
  - "Webhook persiste status='pending' em ambos os modos — diferença é só o consumidor downstream (cron Phase 4 vs /api/clients/onboarding/process legacy). Mantém idempotency + zero-blocking no webhook"
  - "Campo response.data.mode='jarvis'|'legacy' adicionado pra observabilidade do cutover (logs + smoke tests podem assertar qual branch rodou)"
  - "WEBHOOK_TOKEN também migrado pra runtime-read (Rule 3 deviation): leitura cacheada em module-load quebrava testes com vi.stubEnv e seguia anti-pattern oposto ao do JARVIS_ENABLED"
  - ".env.example force-added (-f) já que .gitignore tem `.env*` blanket — convenção comum em Next.js projects"

patterns-established:
  - "Feature flag pattern: helper function lê env runtime; aceita 'true'/'1' case-insensitive trimmed; default false"
  - "Test pattern para flags: vi.stubEnv + vi.unstubAllEnvs em afterEach (já em tests/setup.ts global)"
  - "Mock pattern para route handlers: vi.hoisted() pra spies; mock antes de import do POST"

requirements-completed:
  - EVAL-05
  - EVAL-06

# Metrics
duration: 5min
completed: 2026-05-08
---

# Phase 6 Plan 00: Feature Flag JARVIS_ENABLED Summary

**Feature flag `JARVIS_ENABLED` runtime-evaluated com branch dual no webhook handler (legacy/jarvis), preservando fallback determinístico via `onboarding-processor.ts` e habilitando flip <30s sem redeploy.**

## Performance

- **Duration:** ~5 min (autonomous, TDD red→green em ambas tasks)
- **Started:** 2026-05-08T22:58:13Z
- **Completed:** 2026-05-08T23:03:00Z
- **Tasks:** 2 (ambas TDD)
- **Files created:** 4 | **Files modified:** 1

## Accomplishments

- Helper `isJarvisEnabled()` lê `process.env.JARVIS_ENABLED` em runtime — flip instantâneo via Vercel env vars sem redeploy (gate inegociável EVAL-06)
- Webhook `/api/clients/onboarding/create` ramifica `mode='jarvis'|'legacy'` após validação de auth + payload; ambos paths persistem `status='pending'` (idempotency preservada)
- `.env.example` documenta JARVIS_ENABLED + demais envs (Supabase, webhook tokens, Langfuse)
- 20 testes novos, 100% verdes (15 feature-flags + 5 route); suite full 181/181 (era 159, +22 incluindo regressão zero)
- Path legacy via `lib/onboarding-processor.ts` intacto e referenciado — fallback determinístico funcional para EVAL-05

## Task Commits

Cada task TDD gerou commits atômicos red→green:

1. **Task 1 RED — Failing tests for feature-flags** — `bb9ed44` (test)
2. **Task 1 GREEN — isJarvisEnabled() + .env.example** — `e9bb79a` (feat)
3. **Task 2 RED — Failing tests for handler branch** — `484e8b8` (test)
4. **Task 2 GREEN — Handler branched + WEBHOOK_TOKEN runtime-read** — `c8d353f` (feat)

_Plan metadata commit pendente após state updates._

## Files Created/Modified

- `admin-pipeelo/lib/feature-flags.ts` (novo) — Helper `isJarvisEnabled()`. Reads `process.env.JARVIS_ENABLED` em cada chamada. Aceita `'true'`/`'1'` case-insensitive trimmed.
- `admin-pipeelo/lib/feature-flags.test.ts` (novo) — 15 testes via `it.each` cobrindo default false, valores falsy, truthy, runtime flip.
- `admin-pipeelo/.env.example` (novo, force-added) — Documenta env vars do projeto, com bloco de cutover JARVIS_ENABLED explicando os 2 modos.
- `admin-pipeelo/app/api/clients/onboarding/create/route.ts` (modificado) — Importa `isJarvisEnabled`; resolve `mode` em runtime; adiciona campo `data.mode` no response (created + updated paths); log `[webhook] mode=%s session=%s action=%s`; `WEBHOOK_TOKEN` migrado pra runtime-read.
- `admin-pipeelo/app/api/clients/onboarding/create/route.test.ts` (novo) — 5 testes: legacy mode, jarvis mode, runtime flip, auth 401, validation 400. Pattern `vi.hoisted()` pros mocks de supabase + onboarding-processor.

## Decisions Made

- **Flag runtime-read (`process.env.X` a cada call):** sem isso, EVAL-06 (flip back <30s) é impossível em Vercel — env update via UI não força rebuild, e Next.js só inlines `process.env.X` em build se for `NEXT_PUBLIC_*` ou referenciado em config statically. Server-side route handlers reavaliam por request por padrão; só precisamos não cachear no nosso código.
- **Webhook só enfileira em ambos modos:** o branch `jarvis=true` poderia chamar `processOnboarding(payload)` sincrono no path legacy, mas o handler atual já não faz isso (apenas insert+201). Manter idempotência uniforme + zero-blocking. Diferença real está em qual cron/processor consome o `status='pending'` downstream.
- **Campo `mode` no response:** custo zero, ganho grande para observability — logs + smoke tests + Langfuse traces podem assertar qual branch rodou em cada session, crítico no cutover gradual da Plan 06-03.
- **WEBHOOK_TOKEN migrado pra runtime read:** consequência lógica do mesmo pattern. Antes era const top-level, o que quebrava testes (vi.stubEnv não retroage em const já avaliada). Agora alinhado com flag pattern.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] WEBHOOK_TOKEN era const module-level — incompatível com testes vi.stubEnv**

- **Found during:** Task 2 (RED → GREEN)
- **Issue:** `const WEBHOOK_TOKEN = process.env.ONBOARDING_WEBHOOK_TOKEN` no top do route.ts era avaliado no module-load. Testes que usam `vi.stubEnv("ONBOARDING_WEBHOOK_TOKEN", "test-webhook-token")` no `beforeEach` não conseguiam impactar a const já capturada → handler retornava 500 ("Configuração de autenticação inválida") em todos cenários
- **Fix:** Mover leitura `const WEBHOOK_TOKEN = process.env.ONBOARDING_WEBHOOK_TOKEN` pra dentro do POST handler (mesmo pattern do JARVIS_ENABLED)
- **Files modified:** `admin-pipeelo/app/api/clients/onboarding/create/route.ts`
- **Verification:** Testes 401/400 invariants verdes (5/5 route)
- **Committed in:** `c8d353f` (Task 2 GREEN)

**2. [Rule 3 - Blocking] vi.mock factory referenciando const top-level via TDZ**

- **Found during:** Task 2 RED
- **Issue:** Primeira tentativa do route.test.ts declarava `const supabaseSpy = { from: vi.fn() }` antes do `vi.mock`. Vitest hoists `vi.mock` pro topo do arquivo, mas const fica no scope original → ReferenceError "Cannot access 'supabaseSpy' before initialization"
- **Fix:** Usar `vi.hoisted(() => ({ supabaseSpy, processOnboardingMock }))` para que as variáveis sejam içadas junto com os mocks
- **Files modified:** `admin-pipeelo/app/api/clients/onboarding/create/route.test.ts`
- **Verification:** Tests carregam corretamente, 5/5 verdes
- **Committed in:** Antes do RED commit `484e8b8` (correção pre-RED, sem commit separado pq mudança era no próprio arquivo de teste)

---

**Total deviations:** 2 auto-fixed (ambas Rule 3 — blocking)
**Impact on plan:** Auto-fixes estritamente necessários pra testes funcionarem; nenhum scope creep. WEBHOOK_TOKEN runtime-read é melhoria de qualidade alinhada com o próprio pattern que o plan exige (flag runtime-read).

## Issues Encountered

- **`.env.example` em .gitignore:** projeto tem `.env*` blanket no `.gitignore`. Resolvido com `git add -f .env.example` (convenção comum em Next.js — exemplos vão pro repo, secrets reais não).

## User Setup Required

Nenhuma config externa para esta plan. Ações pendentes (futuras, não bloqueiam Plan 06-01):

- Antes do cutover gradual em Plan 06-03: setar `JARVIS_ENABLED=true` na Vercel UI (staging primeiro, prod depois) para o tenant alvo
- Smoke test pós-flip: 1 sessão de onboarding nova → verificar log `[webhook] mode=jarvis` + sessão na tabela com status pending → confirmar cron Phase 4 picks up

## Next Phase Readiness

- **Plan 06-01 (replay) destravado:** com fallback testado e flag funcional, replay scripts podem rodar com confiança em `JARVIS_ENABLED=true` em ambiente isolado sem afetar prod
- **Plan 06-03 (cutover) destravado:** rede de segurança (`JARVIS_ENABLED=false` instantâneo) implementada e verificada via test 3 do Task 2 (runtime flip)
- **Phase 4 (cron) compatível:** pattern de leitura `status='pending'` em `onboarding_sessions` mantido; cron Phase 4 lê o mesmo schema produzido pelo webhook em ambos os modos. Quando ativado, `lib/onboarding-processor.ts` legacy fica "ocioso" mas funcional — pode ser invocado manualmente em fallback drill

---

## Self-Check: PASSED

**Files:**
- FOUND: admin-pipeelo/lib/feature-flags.ts
- FOUND: admin-pipeelo/lib/feature-flags.test.ts
- FOUND: admin-pipeelo/app/api/clients/onboarding/create/route.test.ts
- FOUND: admin-pipeelo/.env.example
- FOUND: admin-pipeelo/app/api/clients/onboarding/create/route.ts (modified)

**Commits:**
- FOUND: bb9ed44 (Task 1 RED)
- FOUND: e9bb79a (Task 1 GREEN)
- FOUND: 484e8b8 (Task 2 RED)
- FOUND: c8d353f (Task 2 GREEN)

**Tests:**
- FOUND: 15/15 lib/feature-flags.test.ts green
- FOUND: 5/5 app/api/clients/onboarding/create/route.test.ts green
- FOUND: 181/181 full suite green (zero regressões; era 159 antes desta plan)

**Scope boundary:**
- FOUND: `isJarvisEnabled` referenciada apenas em route.ts + feature-flags.ts (+ tests). Zero leak pra processor/jarvis/admin.

---
*Phase: 06-evals-cutover*
*Completed: 2026-05-08*
