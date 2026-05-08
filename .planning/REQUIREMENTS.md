# Requirements: Pipeelo Onboarding Flow — v2 Upgrade

**Defined:** 2026-05-08
**Core Value:** Cliente termina o questionário → tenant fica vivo na Pipeelo automaticamente em até 24h, com prompts de qualidade auditável.

## v1 Requirements

### Hardening (HARD)

- [x] **HARD-01**: Todas as leituras/escritas de `onboarding_sessions` passam por `/api/sessions/*` server-side com service-role (zero `supabase.from()` no `src/`) — completo Plan 01-03 (audit script exit 0, 4 pages migradas + 3 endpoints admin novos)
- [x] **HARD-02**: Per-question autosave (debounced 500ms) salva resposta individual sem esperar conclusão de departamento — completo Plan 01-03 (`useDebouncedAutosave` em Onboarding.tsx + flush em pagehide)
- [~] **HARD-03**: Cliente pode retomar sessão via magic link (`?session=slug&token=access_token`) com TTL 30 dias — `assertSessionAccess` (TTL 30d) + `send-magic-link` prontos Plan 01-01; smoke E2E em Plan 01-05
- [x] **HARD-04**: Identificação é gate de entrada — sem CNPJ + email + WhatsApp validados, demais departamentos ficam bloqueados — server-side enforced Plan 01-01 (`/api/sessions/complete-department` 403 identification_gate)
- [x] **HARD-05**: Validações inline aplicadas: CNPJ via BrasilAPI, email RFC 5322, WhatsApp E.164 com DDD BR — completo Plan 01-04 (CnpjSchema/EmailSchema/WhatsappBrSchema + endpoint validate-cnpj com BrasilAPI+ReceitaWS+cache 24h + validateCnpj inline em NovoOnboarding). Email/WhatsApp inline ficam para tela de pergunta Identificação (schemas prontos)
- [x] **HARD-06**: Progress bar mostra `X/5 departamentos` (Identificação conta como departamento 1) — completo Plan 01-04 (denominador = DEPARTMENT_ORDER.length em OnboardingSession.tsx)
- [x] **HARD-07**: Rate limit em `/api/create-session` (5 req/IP/min) + Cloudflare Turnstile — completo Plan 01-04 (Upstash slidingWindow + verifyTurnstileToken siteverify + TurnstileWidget client). CI gate HARD-01 também endurecido nesta plan (continue-on-error removido)
- [ ] **HARD-08**: RLS restrita e re-aplicada em produção, revertendo `relax_rls_for_testing.sql`
- [ ] **HARD-09**: Anon key do Supabase não pode ler/escrever em `onboarding_sessions` (validado por teste de integração)
- [x] **HARD-10**: IDV 2026 oficial aplicada — logo Pipeelo correto, paleta Forest Floor `#000D0A` + accent `#01d5ac`, tipografia Inter, dark-first consistente

### Pipeline Ingestão (PIPE)

- [ ] **PIPE-01**: Schema Zod compartilhado (`pipeelo-onboarding-contracts`) versionado, importado por onboarding-flow E admin-pipeelo
- [ ] **PIPE-02**: Webhook `POST /api/clients/onboarding/create` valida payload com Zod e rejeita 400 se identificação incompleta
- [ ] **PIPE-03**: Token `ONBOARDING_WEBHOOK_TOKEN` configurado em ambos repos com rotação documentada
- [ ] **PIPE-04**: Outbox pattern: estado `webhook_delivered` salvo no Supabase ANTES de mostrar tela de sucesso ao cliente
- [ ] **PIPE-05**: Reconciliation cron (5min) drena `webhook_deliveries` com `status='pending'` e retry com p-retry (backoff 30s→8h + jitter)
- [ ] **PIPE-06**: Idempotency garantida via `session_id` unique constraint (já existe — validado por teste)
- [ ] **PIPE-07**: Status state machine implementada: `pending → in_progress → completed → processing → live | failed | needs_review`
- [ ] **PIPE-08**: `payload_version` no envelope permite evolução do schema sem quebrar admin-pipeelo

### Tool Layer (TOOL)

- [ ] **TOOL-01**: Módulo `api/jarvis/_runtime/tools/` no admin-pipeelo com uma função tipada por tool (Zod input/output)
- [ ] **TOOL-02**: Tools mínimas implementadas e testáveis sem agente: `create_tenant`, `create_user`, `create_category`, `create_assistant`, `link_function`, `create_kb`, `setup_elevenlabs`
- [ ] **TOOL-03**: Wrapper `withIdempotency()` que persiste em `idempotency_keys (session_id, tool, hash)` antes da chamada externa
- [x] **TOOL-04**: Tabelas `jarvis_runs` + `jarvis_tool_calls` registram cada execução (input, output, duration_ms, error) — DDL pronto em Plan 03-00 (apply manual pendente)
- [ ] **TOOL-05**: Cliente HTTP central `tools/_shared/http.ts` com retry, logging, headers de idempotência
- [ ] **TOOL-06**: Suite Vitest cobre tools puras (mocks de API Pipeelo) com >80% cobertura nas paths críticas
- [ ] **TOOL-07**: Langfuse SDK integrado registrando spans de tool calls com tenant_id como tag

### Jarvis Cron Pipeline (JARV)

- [ ] **JARV-01**: `system-prompt.ts` materializa skill Jarvis (subset operacional) + DNA tom 8 regras como prompt cacheável
- [ ] **JARV-02**: Tools registry expõe schemas via `zodToJsonSchema` para Anthropic Messages API
- [ ] **JARV-03**: `agent-loop.ts` itera com `MAX_ITER=25`, token budget máximo por sessão, loop detector (hash dos últimos 3 tool calls)
- [ ] **JARV-04**: Lease pattern com `SELECT FOR UPDATE SKIP LOCKED` — uma sessão processada por exatamente um worker por vez
- [ ] **JARV-05**: Stuck-lock recovery: lock expira após 10min, sessão volta a `pending` com `attempt_count++`
- [ ] **JARV-06**: Vercel Cron `/api/cron/jarvis-tick` roda a cada 15min em horário UTC (mapeado pra BRT comercial), com `CRON_SECRET` Bearer
- [ ] **JARV-07**: Cron é fire-and-forget: claim a sessão e dispara `/api/jarvis/run` async, sem aguardar
- [ ] **JARV-08**: Prompt caching ephemeral 1h aplicado no system prompt (cache hit rate medido em Langfuse)
- [ ] **JARV-09**: Após `attempt_count >= 3`, sessão vai para `needs_review` e dispara alerta WhatsApp
- [ ] **JARV-10**: Jarvis NUNCA chama `fetch` direto — todas saídas são via tools registradas (validado por lint custom ou code review checklist)
- [ ] **JARV-11**: `tenant_id` é parâmetro fixo no escopo da run, nunca decidido pelo LLM (evita cross-tenant bleed)
- [ ] **JARV-12**: Inputs do questionário escapados com `<user_input>` delimitado no prompt (mitigação prompt injection)

### Painel + Notificações (UI)

- [ ] **UI-01**: Painel `/onboarding-sessions` no admin com filtros (status, departamento, data) + drill-down em respostas + log de tool calls
- [ ] **UI-02**: Botão "Process now" no painel dispara Jarvis manualmente (fallback humano)
- [ ] **UI-03**: Botão "Use deterministic processor" preserva o `lib/onboarding-processor.ts` antigo como rede de segurança
- [ ] **UI-04**: Email Resend de boas-vindas (CEO recebe link com token quando sessão criada)
- [ ] **UI-05**: Email Resend de lembrete enviado se sessão fica `in_progress` >48h sem atividade
- [ ] **UI-06**: Email Resend final (com magic link de credenciais TTL 72h, NÃO senha plain text) ao Jarvis terminar com sucesso
- [ ] **UI-07**: Email + WhatsApp Felipe disparados ao Jarvis falhar definitivamente
- [ ] **UI-08**: DNS `mail.pipeelo.com` configurado com SPF + DKIM + DMARC corretos no Resend
- [ ] **UI-09**: Templates React Email (`WelcomeCEO`, `ReminderStalled`, `CredentialsReady`, `JarvisFailedAlert`) versionados em `emails/`

### Evals + Cutover (EVAL)

- [ ] **EVAL-01**: Replay de 5 sessões históricas processadas pelo `onboarding-processor.ts` agora rodadas via Jarvis em ambiente de staging
- [ ] **EVAL-02**: Diff entre output determinístico vs Jarvis revisado manualmente — Jarvis não pode ter regressão funcional
- [ ] **EVAL-03**: Langfuse evaluations definidas com DNA tom 8 regras como rubrica scorer (LLM-as-judge)
- [ ] **EVAL-04**: Threshold mínimo: 95% das tool calls bem-sucedidas, 0 cross-tenant errors, prompts gerados passando ≥7/8 regras DNA tom
- [ ] **EVAL-05**: Feature flag `JARVIS_ENABLED` controla cutover (default `false` em prod até evals OK)
- [ ] **EVAL-06**: `lib/onboarding-processor.ts` mantido como fallback funcional; switch via flag instantâneo

## v2 Requirements

Deferred — fora do escopo desta milestone, mas trackeado.

### Multi-Stakeholder
- **MULTI-01**: Cliente atribui departamento a outro responsável (CFO recebe Financeiro, COO recebe Suporte) com email de convite
- **MULTI-02**: Real-time presence ("CFO está editando Financeiro agora")
- **MULTI-03**: Conflict resolution se 2 abas editam mesma pergunta

### Adaptive Questionnaire
- **ADAPT-01**: AI sugere perguntas extras baseadas no perfil do tenant (volume, ERP, região)
- **ADAPT-02**: Skip de departamentos que não se aplicam (ex: cliente sem TV → pular suporte_tv)

### Mobile Polish
- **MOBI-01**: Auditoria mobile com Playwright em viewports reais
- **MOBI-02**: Otimização para preenchimento via celular (CFO mobile-only)

### Volume Scale
- **SCALE-01**: Migrar Vercel Cron para Inngest/Trigger.dev se >50 sessões/dia
- **SCALE-02**: Sharding de `jarvis_tool_calls` se tabela ultrapassar 10M linhas

## Out of Scope

| Feature | Reason |
|---------|--------|
| Mudanças nas 128 perguntas | Felipe confirmou: questionário atual é suficiente. Add/remove vira PR pontual, não pilar. |
| Voltar para Lovable Cloud | Migração já feita pra Vercel + Supabase próprio. Não revertemos. |
| Multi-tenant em uma sessão (1 sessão = N tenants) | Escopo é 1:1. Caso de uso não validado. |
| Onboarding pra verticais não-ISP (LT1 IMOB, etc) | Fluxo é específico ISP. Outras verticais terão flow próprio. |
| Substituir totalmente `onboarding-processor.ts` | Mantido como fallback determinístico. Não removemos enquanto Jarvis não tiver maturidade. |
| Provisionar infraestrutura física do tenant | Tenant compartilha banco/edge — só metadata. Sem deploy de infra dedicada. |
| Pagamento / cobrança no onboarding | Onboarding é gratuito até go-live. Cobrança via contratos manuais. |
| Substituir Vite por Next.js | Custo de migração não justifica. Vite + Vercel Functions resolve. |
| Suporte a OTP WhatsApp como gate de identificação | Avaliado mas adia para v2. Email + Turnstile suficiente pra MVP. |
| Helicone como observability | Em modo de manutenção desde 03/2026. Langfuse é a escolha. |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| HARD-01 | Phase 1 | Done (Plan 01-03) |
| HARD-02 | Phase 1 | Done (Plan 01-03) |
| HARD-03 | Phase 1 | Pending |
| HARD-04 | Phase 1 | Pending |
| HARD-05 | Phase 1 | Pending |
| HARD-06 | Phase 1 | Pending |
| HARD-07 | Phase 1 | Partial (client done Plan 01-03, server in Plan 01-04) |
| HARD-08 | Phase 1 | Pending |
| HARD-09 | Phase 1 | Pending |
| HARD-10 | Phase 1 | Complete |
| PIPE-01 | Phase 2 | Pending |
| PIPE-02 | Phase 2 | Pending |
| PIPE-03 | Phase 2 | Pending |
| PIPE-04 | Phase 2 | Pending |
| PIPE-05 | Phase 2 | Pending |
| PIPE-06 | Phase 2 | Pending |
| PIPE-07 | Phase 2 | Pending |
| PIPE-08 | Phase 2 | Pending |
| TOOL-01 | Phase 3 | Pending |
| TOOL-02 | Phase 3 | Pending |
| TOOL-03 | Phase 3 | Pending |
| TOOL-04 | Phase 3 | DDL ready (Plan 03-00) |
| TOOL-05 | Phase 3 | Pending |
| TOOL-06 | Phase 3 | Pending |
| TOOL-07 | Phase 3 | Pending |
| JARV-01 | Phase 4 | Pending |
| JARV-02 | Phase 4 | Pending |
| JARV-03 | Phase 4 | Pending |
| JARV-04 | Phase 4 | Pending |
| JARV-05 | Phase 4 | Pending |
| JARV-06 | Phase 4 | Pending |
| JARV-07 | Phase 4 | Pending |
| JARV-08 | Phase 4 | Pending |
| JARV-09 | Phase 4 | Pending |
| JARV-10 | Phase 4 | Pending |
| JARV-11 | Phase 4 | Pending |
| JARV-12 | Phase 4 | Pending |
| UI-01 | Phase 5 | Pending |
| UI-02 | Phase 5 | Pending |
| UI-03 | Phase 5 | Pending |
| UI-04 | Phase 5 | Pending |
| UI-05 | Phase 5 | Pending |
| UI-06 | Phase 5 | Pending |
| UI-07 | Phase 5 | Pending |
| UI-08 | Phase 5 | Pending |
| UI-09 | Phase 5 | Pending |
| EVAL-01 | Phase 6 | Pending |
| EVAL-02 | Phase 6 | Pending |
| EVAL-03 | Phase 6 | Pending |
| EVAL-04 | Phase 6 | Pending |
| EVAL-05 | Phase 6 | Pending |
| EVAL-06 | Phase 6 | Pending |

**Coverage:**
- v1 requirements: 52 total
- Mapped to phases: 52 (100%)
- Unmapped: 0
- Duplicates: 0

---
*Requirements defined: 2026-05-08*
*Last updated: 2026-05-08 after roadmap creation*
