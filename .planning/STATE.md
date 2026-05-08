---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: in_progress
stopped_at: Plan 04-01 complete — Wave 1 do Jarvis Cron Pipeline em admin-pipeelo. 3 módulos estáticos entregues em api/jarvis/_runtime/: sanitize-input.ts (escape <user_input> case-insensitive), system-prompt.ts (JARVIS_SYSTEM_PROMPT >=2000 chars com skill subset + DNA tom 8 regras + JARV-11/12 declarados, buildTenantContext envelope), tools-registry.ts (JARVIS_TOOLS via zod-to-json-schema target=openApi3 + dispatchTool com whitelist + Zod pre-parse + delegate para tool.invoke). 3 commits admin-pipeelo (0e440bf sanitize, e3021f3 system-prompt, 3a1cc9c tools-registry). 32/32 tests novos passando, 100% coverage nos 3 arquivos. Suite full 260/260 (era 190; +70 tests includes 02-02 wave). Cobre JARV-01, JARV-02, JARV-10, JARV-11, JARV-12. Plan 04-02 (agent-loop) destravado.
last_updated: "2026-05-08T20:30:00.000Z"
progress:
  total_phases: 6
  completed_phases: 0
  total_plans: 10
  completed_plans: 10
  percent: 100
---

# Project State: Pipeelo Onboarding Flow — v2 Upgrade

**Last updated:** 2026-05-08

## Project Reference

**Core value:** Cliente termina o questionário → tenant fica vivo na Pipeelo automaticamente em até 24h, com prompts de qualidade auditável.

**Current focus:** Phase 1 — Hardening + Server-Side Persistence (RLS afrouxado é leak ativo em prod, bloqueia tudo)

**Repos envolvidos:**
- `~/Desktop/pipeelo-onboarding-flow` (este — Vite + Vercel Functions)
- `~/Desktop/admin-pipeelo` (Next.js 15, recebe webhook + processor determinístico)

## Current Position

- **Phase:** 4 of 6 — Jarvis Cron Pipeline (Wave 0+1 complete 2026-05-08)
- **Plan:** 04-01 complete (Wave 1 — system-prompt + tools-registry + sanitize-input). Próximo: 04-02 (agent-loop com Anthropic.messages.create + cache_control ephemeral).
- **Status:** Plan 03-03 (Wave 3 — Langfuse + admin panel) Tasks 1+2 completos 2026-05-08: `api/jarvis/_runtime/observability/langfuse.ts` (no-op safe wrapper, 7 tests verdes), `wrap-tool.ts` emitindo spans com tenant tag, `audit.createRunWithTrace` linkando trace_id, painel `/admin/jarvis/runs` + drill-down + 2 API routes Server Components. 3 commits: `46f6aa8` (RED tests), `251a800` (GREEN SDK + integração), `dee0443` (admin panel). Suite full: 159/159. Zero erros TS. **Task 3 pending human:** criar projeto Langfuse cloud EU + env vars (LANGFUSE_PUBLIC_KEY/SECRET_KEY/HOST) + aplicar migration jarvis_audit_tables em staging admin-pipeelo + smoke run com 1 sessão real → confirmar painel renderiza + trace aparece em Langfuse dashboard com tag tenant:.... Plan 01-05 ainda awaiting human cutover (RLS lock prod).
- **Progress:** [██████████] 100% (7/7 plans done; faltando: Plan 01-05 cutover + Plan 03-03 Task 3 checkpoint)

## Phase Index

| # | Phase | Status | Requirements |
|---|-------|--------|--------------|
| 1 | Hardening + Server-Side Persistence | In progress (5/6 + 01-05 prep) | HARD-01..10 |
| 2 | Pipeline de Ingestão Robusta | In progress (Wave 0 done; 02-00 SHIPPED 2026-05-08) | PIPE-01..08 |
| 3 | Tool Layer + Audit | In progress (Waves 0+1+2 done; W3 autonomous done, awaiting human checkpoint; TOOL-01..06 complete; TOOL-07 awaiting smoke) | TOOL-01..07 |
| 4 | Jarvis Cron Pipeline | In progress (Waves 0+1 done 2026-05-08) | JARV-01..12 |
| 5 | Painel + Notificações | Not started | UI-01..09 |
| 6 | Evals + Cutover | In progress (Wave 0 done; EVAL-05/06 ✅) | EVAL-01..06 |

## Performance Metrics

| Metric | Baseline | Target |
|--------|----------|--------|
| Sessões/dia | <5 (manual) | 0-50 (auto via Jarvis) |
| Tempo entre conclusão e tenant live | >24h (manual) | ≤24h (auto, com cron 15min) |
| Custo Claude API por sessão | TBD | <USD 5 (a medir em Phase 4) |
| Cache hit rate Langfuse | N/A | >70% no system prompt |
| Tool call success rate | N/A | ≥95% (gate de cutover Phase 6) |
| Cross-tenant errors | N/A | 0 (gate inegociável) |
| Phase 04-jarvis-cron-pipeline P00 | 8m | 2 tasks | 1 created / 3 modified |
| Phase 04-jarvis-cron-pipeline P01 | 25m | 3 tasks (TDD) | 6 created / 2 modified |
| Phase 06-evals-cutover P00 | 5m | 2 tasks (TDD) | 4 created / 1 modified |
| Phase 02-pipeline-ingestao-robusta P00 | 7m | 2 tasks | 8 created / 2 modified |
| Phase 03-tool-layer-audit P03 (autonomous portion) | 10m | 2/3 tasks | 6 created / 4 modified |
| Phase 03-tool-layer-audit P02 | 8m | 2 tasks | 19 created / 0 modified |
| Phase 03-tool-layer-audit P01 | 6m | 3 tasks | 9 created / 0 modified |
| Phase 03-tool-layer-audit P00 | 4m | 2 tasks | 6 created / 3 modified |
| Phase 01-hardening-server-side-persistence P05 (autonomous) | 2m | 2 tasks | 4 created / 2 modified |
| Phase 01-hardening-server-side-persistence P04 | 6m | 3 tasks | 13 created / 9 modified |
| Phase 01-hardening-server-side-persistence P03 | 8m | 3 tasks | 10 created / 7 modified |
| Phase 01-hardening-server-side-persistence P02 | 4m | 3 tasks | 10 files |
| Phase 01-hardening-server-side-persistence P01 | 4m | 3 tasks | 14 created / 3 modified |

## Accumulated Context

### Key Decisions

- **Audit script via fs walk (não git grep):** shell quoting do git grep com `\x27` e `:!` magic-pathspec quebra no Windows/PowerShell. fs walk é cross-platform e independente de git.
- **CI audit step com `continue-on-error: true` até Wave 2:** plan 01-00 instala o gate, mas `supabase.from(onboarding_*)` ainda existe em 4 páginas src/. Remove flag ao concluir Plan 03.
- **Vitest 4.x (não 2.x):** release atual instalado via npm; `--reporter=basic` removido em v4 (default reporter é equivalente).
- **Manter Vite + React (não migrar pra Next.js):** migração recente de Lovable → Vite ainda assentando. Custo de outra migração não justifica.
- **Substituir `onboarding-processor.ts` determinístico por Jarvis (mantendo fallback):** flexibilidade > determinismo, mas com rede de segurança via feature flag.
- **Trigger Jarvis via Vercel Cron (`/api/cron/jarvis-tick`) + lease pattern:** server-side full-auto adicionaria infra. Cron + Postgres SKIP LOCKED resolve até 50 sessões/dia.
- **Tool-first design (Phase 3 antes de Phase 4):** regra inegociável — agent-first leva a `fetch` direto + perda de auditoria.
- **Magic link com TTL 72h em vez de senha plain text:** anti-phishing, rotacionável, segue best practice 2026.
- **Auto-process ao finalizar onboarding (sem aprovação manual no caminho feliz):** painel admin existe para revisão posterior + fallback manual.
- **Alias `getServiceSupabase = requireSupabase` em `api/_lib/supabase.ts`:** evita rename de endpoints legacy (Plan 01-01); mantém nome canônico para Wave 1+ sem breaking changes.
- **`send-magic-link` com `to: []` placeholder até Plan 04 (Wave 3):** schema de Identificação ainda não tem coluna email; endpoint expõe `link_preview` em dev/preview e dispara Resend só se `RESEND_API_KEY` setado.
- **Idempotency contractual (não funcional) em testes:** validamos via spy `mock.calls` que upsert recebe mesmo `onConflict` em chamadas repetidas. Idempotency funcional real será verificada em Plan 01-05 (RLS lock + smoke staging).
- **AdminOnboarding.tsx migrado dentro do Plan 01-03 (Rule 3):** plan declarado cobria 3 pages, mas audit gate HARD-01 exige zero supabase.from em src/. Adicionados 3 endpoints `/api/admin/sessions-{list,create,delete}` + helper `assertAdminUser` (Bearer JWT Supabase Auth). Sem essa decisão, audit script continua exit 1 e Plan 01-05 RLS lock quebra a tela admin.
- **Auth admin via Bearer JWT Supabase Auth:** ainda não há RBAC role-check; pré-Phase-1 também era "qualquer user logado" via anon RLS. Phase 5 adiciona role-check explícito.
- **vi.stubEnv para mockar import.meta.env (Vitest 4):** Vite/SWC resolve `import.meta.env.X` para literal em build time quando ausente; mutar runtime não funciona. Pattern correto é `vi.stubEnv` + `vi.unstubAllEnvs()` em afterEach.
- **Token na querystring (sessionApi.get):** trade-off conhecido do magic link (Pitfall 3). TTL 30d + flow "reenviar link" mitigam.
- **CnpjSchema strict (checksum) ativo em CreateSessionSchema (Plan 01-04):** quebra contratos legacy que enviam CNPJ dummy — test fixtures atualizadas para CNPJ válido (`11222333000181`).
- **Pipeline create.ts fixo: ratelimit → parse → Turnstile → DB (Plan 01-04):** ordem importa pra economizar Turnstile call em ataque + economizar siteverify em payload bagunçado. Test "429 não chama Turnstile" garante ordem.
- **ProgressBar component genérico mantido (Plan 01-04):** HARD-06 fix vive em OnboardingSession.tsx (denominador = DEPARTMENT_ORDER.length). ProgressBar component (current/total/percentage) é reusável p/ perguntas.
- **CI gate HARD-01 endurecido (Plan 01-04):** removido `continue-on-error: true` do audit step. PRs futuros que reintroduzirem `supabase.from(onboarding_*)` em `src/` falham build.
- **validate-cnpj endpoint criado mas não wired no front:** decisão consciente — front mantém validação local (checksum) pra UX rápida; lookup público fica nice-to-have pra Plan 05/Phase 2 (com rate-limit próprio).
- **fetch nativo + backoff inline em callExternal (Plan 03-01):** sem axios, sem p-retry — Node 18+ tem AbortController; backoff exponencial com jitter cabe em ~10 LOC. Dep zero adicional.
- **Audit best-effort by construction (Plan 03-01):** recordToolCall + finalizeRun envoltas em try/catch top-level. Anti-pattern "audit kills run" literalmente impossível na implementação. createRun é exceção — sem run_id não há FK válida pra tool_calls.
- **Erro NÃO cacheia em withIdempotency (Plan 03-01):** retry pode passar; cache de erro permanente é veneno. fn() throw → `idempotency_keys` permanece vazio.
- **Upsert + ignoreDuplicates p/ race condition (Plan 03-01):** 2 workers no mesmo lease podem chegar simultaneamente; `onConflict='session_id,tool,args_hash'` + `ignoreDuplicates: true` torna o segundo upsert no-op silencioso.
- **vitest.config.ts isolado em contracts/ (Plan 02-00):** root vitest do onboarding-flow carrega `vitest.setup.ts` que não existe dentro do subpacote workspace. Sem config isolado, vitest no contracts herda parent e quebra. Solução: 7 LOC `defineConfig` apontando só pra `src/**/*.test.ts`.
- **Reuso de vitest.config.ts existente em admin-pipeelo (Plan 02-00):** plan declarava criação, mas Phase 3 (Plan 03-01) já tinha criado infra compatível. Não duplicar. Sanity test usa pattern `tests/**/*.test.ts` já presente no `include`.
- **Feature flag runtime-read (Plan 06-00):** `process.env.JARVIS_ENABLED` lido em cada chamada (não cacheado em const top-level). Sem isso, EVAL-06 (flip back <30s) é impossível em Vercel — exigiria redeploy. WEBHOOK_TOKEN também migrado pra runtime-read pelo mesmo motivo (Rule 3 deviation: testes vi.stubEnv quebravam com leitura cacheada em module-load).
- **Webhook persiste status='pending' em ambos modos (Plan 06-00):** branch jarvis vs legacy difere apenas no consumidor downstream (cron Phase 4 vs `/api/clients/onboarding/process`). Mantém idempotency uniforme + zero-blocking. Campo `data.mode='jarvis'|'legacy'` no response pra observability do cutover.
- **Path canônico webhook resolvido (Plan 06-00):** `/api/clients/onboarding/create` (não `/api/v1/onboarding/ingest` da memory antiga). Open todo eliminado.
- **dispatchTool delega para tool.invoke (Plan 04-01):** wrap-tool factory de Phase 3 já faz Zod+idempotency+audit+Langfuse. Registry só adiciona whitelist + envelope tool_result. Plan original sugeria handler crú; delegate é menos código + reutiliza audit infra.
- **JARVIS_TOOLS via zodToJsonSchema target=openApi3 (Plan 04-01):** Anthropic Messages API tools[] espera schema inline sem $ref ($refStrategy=none). openApi3 gera shape mais limpo que jsonSchema7 default.
- **8 regras DNA tom literais no JARVIS_SYSTEM_PROMPT (Plan 04-01):** sem @-include — system prompt precisa ser string estática para cache_control ephemeral. Memory feedback_dna_tom_8_regras.md é fonte da verdade; SEÇÃO imutável.
- **Subset skill Jarvis = provisionamento determinístico via 7 tools (Plan 04-01):** kickoff Phase 4 escolheu este subset (não prompt-optimizer/Trello/ElevenLabs orchestration). Open todo "decidir subset" eliminado.

### Open Todos

- Confirmar volume real esperado (0-50 vs 50-500 sessões/dia) — afeta decisão Vercel Cron vs Inngest em Phase 4
- Definir baseline de custo Claude API com 1-2 sessões teste em `claude-opus-4-7` no kickoff de Phase 4
- ~~Decidir subset da skill Jarvis a serializar em `system-prompt.ts`~~ ✅ resolvido em Plan 04-01: subset = provisionamento determinístico via 7 tools (create_tenant/user/category/assistant/kb + link_function + setup_elevenlabs)
- Snapshot do payload `OnboardingRespostas` em CI dos dois repos (gate de Phase 2)
- ~~Confirmar path canônico do webhook admin-pipeelo~~ ✅ resolvido em Plan 06-00: path canônico é `/api/clients/onboarding/create`

### Blockers

- Nenhum no momento. RLS afrouxado em prod é urgência ATIVA — Phase 1 endereça.

### Critical Risks (do PITFALLS.md)

1. RLS reaperto silencioso quebra prod → mitigação na Phase 1 ("migrate then lock" sequência rígida)
2. Jarvis loop / context blow-up / tenants duplicados → mitigação Phase 4 (MAX_ITER=25 + idempotency obrigatória + loop detector)
3. Prompt injection via 30+ campos texto livre → mitigação Phase 4 (`<user_input>` delimitado + tool whitelist + tenant_id fixo)
4. Cross-tenant state bleed → mitigação Phase 4 (lease no banco + zero globals)
5. Webhook fire-and-forget → mitigação Phase 2 (outbox + reconciliation)
6. Resend deliverability + double-send → mitigação Phase 5 (DNS perfeito + magic link TTL)

## Session Continuity

**Last session:** 2026-05-08 — Executed Plan 04-01 (Phase 4 Wave 1 — Jarvis static blocks). 3 módulos TDD em admin-pipeelo `api/jarvis/_runtime/`: (a) `sanitize-input.ts` com `escapeUserInput`/`wrapUserInput` (Pitfall 2 / JARV-12 — escape case-insensitive de delimitadores `<user_input>`); (b) `system-prompt.ts` com `JARVIS_SYSTEM_PROMPT` >=2000 chars (skill Jarvis subset = provisionamento via 7 tools + DNA tom 8 regras numeradas + tools-only-exit + JARV-11 literal + JARV-12 dado-vs-instrução) + `buildTenantContext(session)` envelope `<context>` com `<user_input>` escapado e SEM tenant_id; (c) `tools-registry.ts` com `JARVIS_TOOLS` (7 itens AnthropicToolSpec gerados via `zod-to-json-schema` target=openApi3) + `dispatchTool(block, ctx)` whitelist + Zod pre-parse + delegate para `ToolDefinition.invoke()`. Instalou `zod-to-json-schema@3.25.2`. 3 commits: `0e440bf` (sanitize, 9 tests), `e3021f3` (system-prompt, 13 tests), `3a1cc9c` (tools-registry, 10 tests). Suite full admin-pipeelo: **260/260** (era 190; 32 novos + 38 do Plan 02-02 paralelo). 100% coverage statements/branches/functions/lines nos 3 arquivos novos. Zero erros TS introduzidos. 5 deviations Rule 1-3 documentadas em SUMMARY (delegate to invoke, pre-parse intencional, top-level await fix, generics widening fix, @ts-expect-error cleanup). Cobre **JARV-01, JARV-02, JARV-10, JARV-11, JARV-12**. Plan 04-02 (agent-loop) destravado — pode importar `JARVIS_SYSTEM_PROMPT`, `buildTenantContext`, `JARVIS_TOOLS`, `dispatchTool` direto.

**Previous session:** 2026-05-08 — Executed Plan 04-00 (Phase 4 Wave 0 — Jarvis Cron Pipeline infrastructure). Em admin-pipeelo: instalou `@anthropic-ai/sdk@0.95.1` (SDK oficial, não Vercel AI), criou `supabase/migrations/20260509120000_jarvis_lease_columns.sql` idempotente com 5 ADD COLUMN (locked_at, locked_by, attempt_count, last_error, last_run_id) + índice parcial `idx_onboarding_sessions_claim` para SKIP LOCKED scan + 5 COMMENTs. Atualizou `.env.example` com bloco "Jarvis Cron Pipeline (Phase 4)" documentando ANTHROPIC_API_KEY + CRON_SECRET; reorganizou bloco Langfuse com nota de no-op safe mode (Rule 3 deviation: 3 das 5 chaves planejadas já existiam de Phase 3). 2 commits: `6f882f1` (chore SDK+env), `11036c9` (feat migration). Suite full admin-pipeelo: 190/190. Migration NÃO aplicada — apply staging/prod = checkpoint humano (DB credentials + janela manutenção). Wave 1 (Plans 04-01/02/03) destravada para system-prompt + tools-registry + agent-loop + lease/cron.

**Previous session:** 2026-05-08 (later) — Executed Plan 06-00 (Phase 6 Wave 0 — feature flag JARVIS_ENABLED). Task 1 (TDD) entregou `admin-pipeelo/lib/feature-flags.ts` com `isJarvisEnabled()` runtime-read + `feature-flags.test.ts` (15 cenários via `it.each`) + `.env.example` documentando flag. Task 2 (TDD) ramificou `app/api/clients/onboarding/create/route.ts` com branch `mode='jarvis'|'legacy'`, log estruturado `[webhook] mode=%s`, e migrou WEBHOOK_TOKEN pra runtime-read (Rule 3 deviation). 4 commits: `bb9ed44` (Task 1 RED), `e9bb79a` (Task 1 GREEN), `484e8b8` (Task 2 RED), `c8d353f` (Task 2 GREEN). Suite full admin-pipeelo: 181/181 (era 159, +22 tests; zero regressão). EVAL-05/06 marcados completos. `lib/onboarding-processor.ts` intacto e referenciado como fallback. Path canônico do webhook confirmado: `/api/clients/onboarding/create` — open todo eliminado.

**Earlier session:** 2026-05-08 — Executed Plan 02-00 (Phase 2 Wave 0). Criado pacote `pipeelo-onboarding-contracts@0.1.0` em `pipeelo-onboarding-flow/contracts/` (workspace local) com Zod skeleton + `PAYLOAD_VERSION='v1'` + 4 tests verdes. Linkado em admin-pipeelo via `file:../pipeelo-onboarding-flow/contracts` + sanity test 2/2. Suite full ambos repos verde (107 onboarding-flow, 176 admin-pipeelo). 2 commits: `246f193` (onboarding-flow), `3d5a1a9` (admin-pipeelo). Deviation Rule 3: contracts/vitest.config.ts isolado (root config aponta pra setup que não existe no subpacote). Reuso vitest.config.ts admin (já existia desde Phase 3). Pronto para Plan 02-01 substituir skeleton pelo schema real do payload de `api/complete-onboarding.ts`.

**Previous session:** 2026-05-08 — Executed Plan 03-03 autonomous portion (Wave 3 — Langfuse + admin panel). Task 1 (TDD) entregou `api/jarvis/_runtime/observability/langfuse.ts` no-op safe (getLangfuseClient cached, createTrace com tenant tag, withSpan best-effort, flushLangfuse) + `langfuse.test.ts` (7 tests: no-op + instance modes); integrou em `wrap-tool.ts` (spans por invoke + langfuseSpanId em recordToolCall) e `audit.ts` (novo `createRunWithTrace` que cria trace + run linked via langfuse_trace_id). Task 2 entregou painel read-only `/admin/jarvis/runs` (Server Component lista filtrada por status) + `[id]` (drill-down com tool_calls + Langfuse link) + 2 API routes (`GET /api/admin/jarvis/runs` + `GET /api/admin/jarvis/runs/[id]`). 3 commits: `46f6aa8` (RED), `251a800` (GREEN SDK + integração), `dee0443` (admin panel). Suite full: 159/159 (era 152). langfuse@3.38.20 instalado (npm latest; v4 ainda não disponível, surface API compatível). Zero erros TS. **Task 3 pending checkpoint:human-verify** — Felipe deve criar projeto Langfuse cloud EU + setar env vars + aplicar migration jarvis_audit_tables em staging + smoke run.
**Next session:** Felipe completa checkpoint Task 3 → "approved" finaliza Plan 03-03 SUMMARY (popular completed_date + tasks_pending_checkpoint=0). Depois: Phase 4 (Jarvis Cron Pipeline) pode começar — tool layer + audit + observability prontos.
**Next session:** Plan 04-02 (agent-loop) — usa JARVIS_SYSTEM_PROMPT (com cache_control: ephemeral), JARVIS_TOOLS, buildTenantContext, dispatchTool em runJarvis(sessionId, runId). Loop: anthropic.messages.create → handle tool_use blocks via dispatchTool → re-call até end_turn ou max iterations. Cobre JARV-03, JARV-08, JARV-10.
**Stopped At:** Plan 04-01 complete (Wave 1 Jarvis static blocks: system-prompt + tools-registry + sanitize-input). Pendentes paralelos: Plan 03-03 Task 3 (Langfuse cloud, Felipe), Plan 05-02 (Resend triggers), apply manual da migration `20260509120000_jarvis_lease_columns.sql` em staging admin-pipeelo. Plan 04-02 destravado.

**Files de referência viva:**
- `.planning/PROJECT.md` — escopo dos 4 pilares
- `.planning/REQUIREMENTS.md` — 52 v1 requirements + traceability
- `.planning/ROADMAP.md` — phases + success criteria
- `.planning/research/SUMMARY.md` — research findings consolidados
- `.planning/research/STACK.md` — stack ADD prescriptive
- `.planning/research/ARCHITECTURE.md` — tool-first agent pattern
- `.planning/research/PITFALLS.md` — 11 pitfalls + pitfall→phase mapping
- `.planning/codebase/STRUCTURE.md` — layout atual
- `.planning/codebase/CONCERNS.md` — debt + bugs + segurança

---
*State initialized: 2026-05-08*
