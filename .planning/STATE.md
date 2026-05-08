---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: in_progress
stopped_at: Plan 03-03 awaiting human checkpoint — Wave 3 autonomous tasks done (langfuse@3.38.20 SDK + wrapper + spans + admin panel /admin/jarvis/runs). 7 new tests; 159/159 full suite. Felipe: criar projeto Langfuse cloud + env vars + smoke run + aplicar migration jarvis_audit_tables em staging admin-pipeelo.
last_updated: "2026-05-08T22:55:00.000Z"
progress:
  total_phases: 6
  completed_phases: 0
  total_plans: 7
  completed_plans: 7
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

- **Phase:** 3 of 6 — Tool Layer + Audit (Waves 0+1+2 done; Wave 3 awaiting human checkpoint)
- **Plan:** 03-03 in_progress (Tasks 1+2 autonomous done; Task 3 checkpoint:human-verify aguardando Felipe)
- **Status:** Plan 03-03 (Wave 3 — Langfuse + admin panel) Tasks 1+2 completos 2026-05-08: `api/jarvis/_runtime/observability/langfuse.ts` (no-op safe wrapper, 7 tests verdes), `wrap-tool.ts` emitindo spans com tenant tag, `audit.createRunWithTrace` linkando trace_id, painel `/admin/jarvis/runs` + drill-down + 2 API routes Server Components. 3 commits: `46f6aa8` (RED tests), `251a800` (GREEN SDK + integração), `dee0443` (admin panel). Suite full: 159/159. Zero erros TS. **Task 3 pending human:** criar projeto Langfuse cloud EU + env vars (LANGFUSE_PUBLIC_KEY/SECRET_KEY/HOST) + aplicar migration jarvis_audit_tables em staging admin-pipeelo + smoke run com 1 sessão real → confirmar painel renderiza + trace aparece em Langfuse dashboard com tag tenant:.... Plan 01-05 ainda awaiting human cutover (RLS lock prod).
- **Progress:** [██████████] 100% (7/7 plans done; faltando: Plan 01-05 cutover + Plan 03-03 Task 3 checkpoint)

## Phase Index

| # | Phase | Status | Requirements |
|---|-------|--------|--------------|
| 1 | Hardening + Server-Side Persistence | In progress (5/6 + 01-05 prep) | HARD-01..10 |
| 2 | Pipeline de Ingestão Robusta | Not started | PIPE-01..08 |
| 3 | Tool Layer + Audit | In progress (Waves 0+1+2 done; W3 autonomous done, awaiting human checkpoint; TOOL-01..06 complete; TOOL-07 awaiting smoke) | TOOL-01..07 |
| 4 | Jarvis Cron Pipeline | Not started | JARV-01..12 |
| 5 | Painel + Notificações | Not started | UI-01..09 |
| 6 | Evals + Cutover | Not started | EVAL-01..06 |

## Performance Metrics

| Metric | Baseline | Target |
|--------|----------|--------|
| Sessões/dia | <5 (manual) | 0-50 (auto via Jarvis) |
| Tempo entre conclusão e tenant live | >24h (manual) | ≤24h (auto, com cron 15min) |
| Custo Claude API por sessão | TBD | <USD 5 (a medir em Phase 4) |
| Cache hit rate Langfuse | N/A | >70% no system prompt |
| Tool call success rate | N/A | ≥95% (gate de cutover Phase 6) |
| Cross-tenant errors | N/A | 0 (gate inegociável) |
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

### Open Todos

- Confirmar volume real esperado (0-50 vs 50-500 sessões/dia) — afeta decisão Vercel Cron vs Inngest em Phase 4
- Definir baseline de custo Claude API com 1-2 sessões teste em `claude-opus-4-7` no kickoff de Phase 4
- Decidir subset da skill Jarvis a serializar em `system-prompt.ts` (prompt-optimizer? Trello [IA]? ElevenLabs?) no kickoff de Phase 4
- Snapshot do payload `OnboardingRespostas` em CI dos dois repos (gate de Phase 2)
- Confirmar path canônico do webhook admin-pipeelo: `/api/clients/onboarding/create` (código atual) vs `/api/v1/onboarding/ingest` (memory) — resolver em Phase 2

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

**Last session:** 2026-05-08 — Executed Plan 03-03 autonomous portion (Wave 3 — Langfuse + admin panel). Task 1 (TDD) entregou `api/jarvis/_runtime/observability/langfuse.ts` no-op safe (getLangfuseClient cached, createTrace com tenant tag, withSpan best-effort, flushLangfuse) + `langfuse.test.ts` (7 tests: no-op + instance modes); integrou em `wrap-tool.ts` (spans por invoke + langfuseSpanId em recordToolCall) e `audit.ts` (novo `createRunWithTrace` que cria trace + run linked via langfuse_trace_id). Task 2 entregou painel read-only `/admin/jarvis/runs` (Server Component lista filtrada por status) + `[id]` (drill-down com tool_calls + Langfuse link) + 2 API routes (`GET /api/admin/jarvis/runs` + `GET /api/admin/jarvis/runs/[id]`). 3 commits: `46f6aa8` (RED), `251a800` (GREEN SDK + integração), `dee0443` (admin panel). Suite full: 159/159 (era 152). langfuse@3.38.20 instalado (npm latest; v4 ainda não disponível, surface API compatível). Zero erros TS. **Task 3 pending checkpoint:human-verify** — Felipe deve criar projeto Langfuse cloud EU + setar env vars + aplicar migration jarvis_audit_tables em staging + smoke run.
**Next session:** Felipe completa checkpoint Task 3 → "approved" finaliza Plan 03-03 SUMMARY (popular completed_date + tasks_pending_checkpoint=0). Depois: Phase 4 (Jarvis Cron Pipeline) pode começar — tool layer + audit + observability prontos.
**Stopped At:** Plan 03-03 awaiting human checkpoint Task 3 (Langfuse cloud setup + smoke run)

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
