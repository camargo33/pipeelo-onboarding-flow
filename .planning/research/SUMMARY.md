# Project Research Summary

**Project:** Pipeelo Onboarding Flow — v2 Upgrade
**Domain:** B2B SaaS multi-tenant self-service onboarding (ISP vertical, BR) com auto-provisionamento via agente LLM (Jarvis) sobre Vite SPA + Vercel Functions Node + Supabase
**Researched:** 2026-05-08
**Confidence:** HIGH

## Executive Summary

A v2 transforma um onboarding já em produção (v3.2.0, 128 perguntas em 5 departamentos) num pipeline auditável e seguro de provisionamento autônomo de tenant. O domínio mais próximo não é "first-run tour estilo Linear/Notion" — é **Stripe Connect KYC + Pylon workspace bootstrap**: fluxo longo (45–90min), multi-stakeholder (CEO/CFO/COO), com auto-provisionamento ao final. A diferença Pipeelo é que o "provisionamento" inclui geração de prompts de IA, KBs e function-calling — moat real, sem competidor BR no espaço ISP fazendo isso.

A abordagem recomendada é **híbrida por design**: agente LLM (Jarvis) faz o **raciocínio** (composição de prompts, escolha de tools por assistente, síntese de KB); código determinístico faz a **ação** (HTTP idempotente, criação de tenant, dispatch de tools). Arquitetura: "Durable Queue (Postgres) + Stateless Agent Worker (Vercel Function) + Tool-Calling API (Anthropic Messages + Zod schemas) + Audit Sink (Langfuse + jarvis_tool_calls)". Stack ADD: `@anthropic-ai/sdk`, `@upstash/ratelimit`, `react-email`, `p-retry`, `vitest`. Sem migração para Next.js, sem BullMQ — Vercel Cron + Postgres `SKIP LOCKED`.

Os três riscos dominantes: **(1)** RLS afrouxado em produção expõe CNPJ/financeiro de todos os tenants — bloqueador absoluto; **(2)** sem idempotency + circuit breaker, agente em cron pode duplicar tenants ou corromper estado cross-tenant; **(3)** prompt injection via 30+ campos texto livre pode escalar privilégios. Mitigação: server-side persistence com service-role atrás de `/api/*` antes de reapertar RLS (sequência "migrate then lock"), tool whitelist + `<user_input>` delimitado + lease pattern com `SKIP LOCKED`, human-in-the-loop visível no painel.

## Key Findings

### Recommended Stack

Stack base permanece (Vite 5.4, React 18.3, Tailwind, shadcn, RHF+Zod, React Query, `@vercel/node`, `@supabase/supabase-js`). Adições justificadas por Pilar.

**Core technologies (ADD):**
- `@anthropic-ai/sdk` ^0.95 — Claude server-side com prompt caching `cache_control: ephemeral` (~80% corte de custo)
- `@upstash/redis` + `@upstash/ratelimit` ^2 — rate limiting serverless (HTTP, Vercel não suporta TCP persistente)
- `react-email` ^6 + `resend` ^4 — templates JSX para transacionais
- `p-retry` ^6 + `nanoid` ^5 — retry exponencial + idempotency keys
- `vitest` ^2 — primeira suíte de testes (zero coverage hoje)
- Vercel Cron declarativo com `maxDuration: 300` + `CRON_SECRET`

### Expected Features

**Must have (table stakes):**
- Server-side persistence (`/api/sessions/*` com service-role) — keystone que destrava 70% do backlog
- Per-question autosave (debounced) — 45-90min sem isso = 30%+ abandono
- Resume-by-link com magic link (slug + access_token) — coluna existe, não usada
- Identification gate enforced server-side — bug atual aceita sessão sem `tenant_id`
- Progress bar `/5` (bug atual `/4`)
- Rate limit + Cloudflare Turnstile em `/api/create-session`
- Inline validation (CNPJ via BrasilAPI, email, WhatsApp E.164)
- Status state machine: `pending → in_progress → completed → processing → live | failed | needs_review`

**Should have (diferenciadores):**
- Auto-provisioning via Jarvis (Pilar 3) — moat técnico
- Auditable prompt preview antes de go-live — trust > velocidade
- Behavioral email triggers (event-based, +40% completion vs drips)
- Multi-stakeholder per-depto invite
- Conditional DSL com testes (já implementado, falta cobertura)
- Admin panel com drill-down + manual Jarvis trigger fallback

**Defer (v3+):** real-time presence, live co-edit, multi-tenant em uma sessão, gamificação, AI question generator adaptativo.

### Architecture Approach

Padrão 2026: **"Durable Queue + Stateless Agent Worker + Tool-Calling + Audit Sink"**. Agente é decisor não-determinístico embrulhado em infra determinística e idempotente.

**Major components:**
1. **Ingress webhook (`api/webhook/ingest.ts`)** — Zod validate + idempotent insert, retorna <3s
2. **Session queue (Postgres FSM)** — `status, attempt_count, locked_at, locked_by, last_error, last_run_id`
3. **Scheduler (Vercel Cron)** — claim com `SKIP LOCKED`, fire-and-forget worker
4. **Agent worker (`api/jarvis/run.ts`)** — loop com `MAX_ITER` guard
5. **Tool dispatcher (`api/jarvis/_runtime/tools/`)** — uma função tipada por tool com Zod + `withIdempotency()`
6. **Audit sink** — Langfuse + `jarvis_runs` + `jarvis_tool_calls`
7. **Admin Dashboard** — observability + manual retry + fallback determinístico

**Princípio inegociável:** agente nunca chama `fetch` direto. Tools são única saída.

### Critical Pitfalls

1. **RLS reaperto silencioso quebra prod** — sequência: criar todos `/api/sessions/*` → `grep "supabase.from(" src/` = 0 → deploy + valida → migration RLS. Rollback pronto.
2. **Jarvis loop / context blow-up / tenants duplicados** — `MAX_ITER=25`, idempotency key obrigatória, hash dos últimos 3 tool calls como detector de loop.
3. **Prompt injection via campos texto livre** — `<user_input>` delimitado, tool whitelist fechada, `tenant_id` sempre parâmetro fixo (nunca decidido pelo LLM).
4. **Cross-tenant state bleed** — lease no banco, zero globals, uma sessão por invocação.
5. **Webhook fire-and-forget = tenants perdidos** — outbox ANTES de mostrar sucesso, reconciliation cron, idempotency por `session_id`.
6. **Resend deliverability + double-send** — DNS perfeito, subdomínio dedicado `mail.pipeelo.com`, **magic link com TTL 72h** em vez de senha plain text.

## Implications for Roadmap

### Phase 1: Hardening + Server-Side Persistence (Pilar 1)
**Rationale:** Pré-requisito de tudo. RLS expõe PII ativo.
**Delivers:** `/api/sessions/*` service-role, autosave optimistic locking, magic link, identification gate, rate limit, progress `/5`, RLS reapertada.
**Avoids:** Pitfalls 4, 8, 9.
**Stack:** `@upstash/ratelimit`, Turnstile, BrasilAPI.

### Phase 2: Pipeline de Ingestão Robusta (Pilar 2)
**Rationale:** Webhook entre repos precisa ser confiável antes de qualquer agente.
**Delivers:** Zod schema compartilhado (`pipeelo-onboarding-contracts`), `payload_version`, outbox pattern, reconciliation cron, `ONBOARDING_WEBHOOK_TOKEN` dedicado, status state machine.
**Avoids:** Pitfalls 5, 10.

### Phase 3: Tool Layer + Audit (sem agente)
**Rationale:** Tool-first design força clean boundaries. Audit + Langfuse desde dia 1.
**Delivers:** Migração `adminApi`/`pipeeloApi` para `tools/_shared/http.ts`, tools tipadas (create_tenant, create_category, create_assistant, link_function, setup_elevenlabs), `idempotency_keys`, `jarvis_runs` + `jarvis_tool_calls`, Langfuse, JarvisDashboard read-only.

### Phase 4: Jarvis Cron Pipeline (Pilar 3 — agente)
**Rationale:** Tools determinísticos prontos, agente entra como camada de raciocínio.
**Delivers:** `system-prompt.ts` (Jarvis skill + DNA tom), tools registry com `zodToJsonSchema`, `agent-loop.ts` com MAX_ITER + token budget + loop detector, `claim-session.ts`, `/api/cron/jarvis-tick`, prompt caching ephemeral 1h.
**Avoids:** Pitfalls 1, 2, 3, 6.
**Stack:** `@anthropic-ai/sdk` com `claude-opus-4-7`.

### Phase 5: Painel + Notificações + Email Polish (Pilar 4)
**Rationale:** Sem human-in-the-loop, falhas ficam invisíveis. Senha plain text é phishing-prone.
**Delivers:** Painel `/onboarding-sessions` revisado com filtros + drill-down + "Process now" + fallback, alerta WhatsApp, templates `react-email` (WelcomeCEO/ReminderStalled/CredentialsReady/JarvisFailedAlert), magic link TTL 72h, behavioral email triggers, DNS SPF/DKIM/DMARC + `mail.pipeelo.com`.
**Avoids:** Pitfalls 7, 11.

### Phase 6: Evals + Cutover
**Rationale:** Sem big-bang. Replay histórico antes de cortar.
**Delivers:** Replay de 5 sessões via Jarvis, Langfuse evaluations com DNA tom 8 regras como scorer, feature flag `JARVIS_ENABLED`, fallback `lib/onboarding-processor.ts` mantido.

### Phase Ordering Rationale

- Phase 1 antes de tudo: RLS afrouxado é leak ativo, bloqueia reaperto sem `/api/*` primeiro.
- Phase 2 antes de Phase 3+: schema contract entre repos é boundary crítico.
- Phase 3 (tools) antes de Phase 4 (agente): regra inegociável — agent-first leva a `fetch` direto + perda de auditoria.
- Phase 5 antes do cutover: sem painel + alertas + fallback, cutover não tem rede de segurança.
- Phase 6 último: evals só fazem sentido com pipeline + observability + fallback completos.

### Research Flags

**Needs research (`/gsd:research-phase`):**
- **Phase 4:** materialização da skill Jarvis em prompt + tools server-side é greenfield. Precisa: (a) tool boundary correto vs admin-pipeelo, (b) granularidade do system prompt vs cache hit rate, (c) limites práticos de `max_tool_iterations` para 5 assistentes + ElevenLabs.
- **Phase 6:** Langfuse evaluations com DNA tom 8 regras como scorer não é padrão documentado — definir rubrica + thresholds.

**Standard patterns (skip research):** Phase 1 (Vercel Functions + service-role + Upstash), Phase 2 (outbox + Zod + Cron), Phase 3 (idempotency + SKIP LOCKED + Langfuse SDK), Phase 5 (react-email + Resend + Cloudflare DNS).

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Libs verificadas em docs oficiais 2026-05. Versões alinhadas. |
| Features | MEDIUM-HIGH | Patterns Stripe/Tally/Userlist verificados oficialmente. Decisões Pipeelo-specific inferidas de PROJECT.md. |
| Architecture | MEDIUM-HIGH | Validado contra Anthropic managed-agents beta + buildmvpfast/Composio/Convex. |
| Pitfalls | HIGH | Sintetiza incidentes públicos + concerns mapeados (CONCERNS.md) + experiência operacional. |

**Overall confidence:** HIGH

### Gaps to Address

- **Volume real esperado:** roadmap dimensiona 0-50 sessões/dia. Validar com Felipe — se 50-500 nos próximos 6 meses, Phase 4 pode precisar Inngest/Trigger.dev em vez de Vercel Cron simples.
- **Custo Claude API per session:** sem baseline. Phase 4 deveria começar com 1-2 sessões teste em `claude-opus-4-7` para medir tokens.
- **Skill Jarvis serialization:** decidir qual subset entra em `system-prompt.ts` (prompt-optimizer? Trello [IA]? ElevenLabs?). Resolver no kickoff de Phase 4.
- **Schema admin-pipeelo `OnboardingRespostas`:** confirmar shape exato antes de Phase 2. Snapshot do payload em CI dos dois lados.
- **Multi-stakeholder per-depto invite:** P2 ou P3? Decidir após Phase 1+5 medirem completion rate por depto.

## Sources

### Primary (HIGH)
- Vercel Cron + maxDuration docs
- Anthropic Messages API + `@anthropic-ai/sdk` 0.95
- Resend Node SDK + React Email 6.0
- `@upstash/ratelimit`
- Supabase service role + RLS guides
- Stripe Connect Embedded Onboarding
- buildmvpfast "Idempotent AI Agents 2026"
- roborhythms "Five Boring AI Agent Patterns"
- AWS Saga orchestration patterns
- Postgres FOR UPDATE SKIP LOCKED docs
- OWASP LLM Top 10

### Secondary (MEDIUM)
- Svix + Hookdeck webhook retry guides
- NetPartners 2026 onboarding automation
- Userpilot SaaS onboarding emails
- WorkOS B2B onboarding
- agentmodeai observability landscape (Helicone maintenance flag)

### Internal (HIGH)
- `.planning/PROJECT.md` — escopo dos 4 pilares
- `.planning/codebase/CONCERNS.md` — concerns mapeados
- Memory `feedback_dna_tom_8_regras.md`, `feedback_rls_mutations.md`, `reference_supabase_db_acesso.md`, `project_pipeelo_onboarding_flow.md`

---
*Research completed: 2026-05-08 — Ready for roadmap: yes*
