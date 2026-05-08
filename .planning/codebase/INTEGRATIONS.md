# External Integrations

**Analysis Date:** 2026-05-08

## APIs & External Services

**Supabase (DB + Auth + Edge Functions):**
- Project ID atual: `llsqqbbhcdosrtpvvkml` (branch `migration/vercel`)
- Project ID antigo (Lovable Cloud): `huaukjryiokrgpouzjvz` — ainda referenciado em `supabase/config.toml` (legado, não em uso)
- SDK frontend: `@supabase/supabase-js` ^2.90.0 em `src/integrations/supabase/client.ts`
  - Auth com `localStorage` + `persistSession: true` + `autoRefreshToken: true`
- SDK backend: mesmo SDK em `api/_lib/supabase.ts` com `service_role_key` e `persistSession: false` (cliente cacheado)
- Auth (env vars):
  - Frontend: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (fallback `VITE_SUPABASE_ANON_KEY`)
  - Backend: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

**admin-pipeelo (API interna Pipeelo):**
- Base URL: `PIPEELO_ADMIN_API_URL` (default `https://admin.pipeelo.com`)
- Cliente: `api/_lib/admin-pipeelo.ts` → função `adminApi<T>(path, opts)`
- Auth (estratégias suportadas, em ordem):
  1. `PIPEELO_ADMIN_API_TOKEN` → header `Authorization: Bearer <token>`
  2. Fallback `PIPEELO_ADMIN_EMAIL` + `PIPEELO_ADMIN_PASSWORD` → Basic auth
- Endpoints consumidos:
  - `GET /api/v1/tenants?search=<cnpj>` — busca tenant existente por CNPJ (`api/provision-tenant.ts:57`)
  - `POST /api/v1/tenants` — cria tenant ISP (`api/provision-tenant.ts:84`), payload com `name`, `legal_name`, `document` (CNPJ), `responsible_name`, `responsible_document`, `admin_email`, `whatsapp_number`, `company_type: "isp"`, `subscriber_range`
  - `POST /api/clients/onboarding/create` — webhook final (entrega payload completo de respostas em `api/complete-onboarding.ts:97`)
- **Pendência conhecida** (memory): falta endpoint `POST /api/v1/onboarding/ingest` no admin-pipeelo para criação de prompts via Jarvis

**api.pipeelo.com (API tenant-scoped):**
- Base URL hardcoded `https://api.pipeelo.com`
- Cliente: `api/_lib/admin-pipeelo.ts` → função `pipeeloApi<T>(pipeeloToken, path, opts)`
- Auth: `Authorization: Bearer <pipeelo_token>` (token retornado pelo admin-pipeelo na criação do tenant e armazenado em `onboarding_sessions.pipeelo_token`)
- Endpoints consumidos (`api/sync-department.ts`):
  - `POST /v1/categories` — cria categoria de atendimento (Geral/Financeiro/Suporte/Vendas) com cor e `distribution_type: "least-busy"`
  - `POST /v1/categories/:id/office-hours` — define horário de atendimento por dia da semana (mapeia `horario_semanal` do onboarding)

**Resend (e-mail transacional):**
- SDK: `resend` ^4.0.1 instanciado em `api/send-email.ts`
- Auth: `RESEND_API_KEY`
- Remetente: `Pipeelo Onboarding <noreply@pipeelo.com>`
- Destinatário fixo: `onboarding@pipeelo.com`
- Conteúdo: HTML formatado por departamento (sac_geral / financeiro / suporte / vendas) com tabela completa de respostas

## Data Storage

**Databases:**
- PostgreSQL via Supabase (project `llsqqbbhcdosrtpvvkml`)
  - Connection (scripts): `DATABASE_URL` consumida por `scripts/run-migrations.mjs`
    - Suporta pooler IPv4 (`pooler.supabase.com`) e direct IPv6 (`db.*.supabase.co` resolvido via `dns/promises.resolve6`)
  - Cliente runtime: `@supabase/supabase-js`
- Tabelas principais (inferidas):
  - `onboarding_sessions` — sessões de onboarding com `id`, `slug`, `access_token`, `empresa_nome`, `ceo_email`, `tenant_id`, `pipeelo_token`, status por departamento (`status_sac_geral`, `status_financeiro`, `status_suporte`, `status_vendas`, `status_identificacao`), datas de conclusão e responsáveis
  - `onboarding_respostas` — respostas por (`session_id`, `departamento`, `pergunta_id`, `resposta` JSON)
  - `schema_migrations` — tracking de migrations aplicadas (criada por `run-migrations.mjs`)
- Migrations: `supabase/migrations/*.sql` (7 arquivos, mais recentes `20260419000000_identificacao_and_tenant_link.sql` e `20260419120000_relax_rls_for_testing.sql`)

**File Storage:**
- Não utilizado no fluxo atual (somente respostas estruturadas em JSON)

**Caching:**
- React Query (client-side, cache em memória)
- Cliente Supabase backend cacheado em escopo de módulo (`api/_lib/supabase.ts`)

## Authentication & Identity

**Frontend:**
- Supabase Auth com `localStorage` + auto-refresh (`src/integrations/supabase/client.ts`)
- Acesso a sessões via `access_token` na URL slug-based (rota `/:slug` e `/:slug/:departamento`)
- Página `/admin` (`AdminOnboarding.tsx`) — possivelmente protegida por env/role (não auditado em detalhe)

**Backend (Vercel Functions):**
- Sem auth do usuário final — endpoints são chamados pelo frontend usando `sessionId` como chave; autoridade vem do `service_role_key` no servidor
- RLS está "relaxado para testes" (migration `20260419120000_relax_rls_for_testing.sql`) — **risco** em produção

**admin-pipeelo:**
- Bearer token (`PIPEELO_ADMIN_API_TOKEN`) ou Basic (email/senha)

## Monitoring & Observability

**Error Tracking:**
- Não configurado (sem Sentry/Datadog/etc)
- Logs via `console.error`/`console.warn`/`console.log` nas Functions — capturados pelo Vercel Logs

**Logs:**
- Vercel Logs (stdout/stderr das Functions Node em `api/`)

## CI/CD & Deployment

**Hosting:**
- Vercel — frontend SPA + Functions Node em uma única deploy
- Build command: `npm run build` (configurado em `vercel.json`)
- Output directory: `dist/`
- Rewrites SPA: tudo exceto `/api/*`, `/assets/*`, `*.ext`, `favicon.ico` cai em `/index.html`

**CI Pipeline:**
- Não detectado (sem `.github/workflows`, `vercel.yaml` CI etc) — deploy é direto via push do Git/Vercel

## Environment Configuration

**Required env vars (Vercel):**
- Frontend (build-time, embed no bundle):
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_PUBLISHABLE_KEY` (ou `VITE_SUPABASE_ANON_KEY`)
- Backend Functions (server-only):
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `PIPEELO_ADMIN_API_URL` (opcional — default `https://admin.pipeelo.com`)
  - `PIPEELO_ADMIN_API_TOKEN` **ou** par `PIPEELO_ADMIN_EMAIL` + `PIPEELO_ADMIN_PASSWORD`
  - `RESEND_API_KEY`
- Scripts (local/CI):
  - `DATABASE_URL` (Postgres connection string)

**Secrets location:**
- Vercel Environment Variables (production / preview)
- Para scripts locais (`run-migrations.mjs`, `validate-schema.mjs`, `probe-region.mjs`): variável de ambiente local ou argumento de linha de comando
- **Não há `.env*` versionado** no repositório

## Webhooks & Callbacks

**Outgoing (chamados por este projeto):**
- `POST {PIPEELO_ADMIN_API_URL}/api/clients/onboarding/create` — disparado por `api/complete-onboarding.ts` quando todos os 4 departamentos estão `concluido`. Payload contém `session` (com `tenant_id`, `pipeelo_token`, responsáveis, datas) + `respostas` agrupadas por departamento, com `horario_semanal` expandido em dias individuais (`segunda_feira` … `domingo`/`feriado`)
- `POST {PIPEELO_ADMIN_API_URL}/api/v1/tenants` — provisionamento de tenant ISP (`api/provision-tenant.ts`)
- `POST https://api.pipeelo.com/v1/categories` e `POST .../v1/categories/:id/office-hours` — sincronização por departamento (`api/sync-department.ts`)
- `POST` arbitrário via `testWebhookUrl` (override em modo teste, sem auth) em `api/complete-onboarding.ts:91`

**Incoming (recebidos por este projeto):**
- Endpoints HTTP em `api/` chamados pelo frontend deste mesmo projeto:
  - `POST /api/create-session` — cria `onboarding_sessions` (recebe `empresa_nome`, `ceo_email`)
  - `POST /api/provision-tenant` — cria/encontra tenant no admin-pipeelo (recebe dados completos da empresa)
  - `POST /api/sync-department` — sincroniza departamento concluído com `api.pipeelo.com`
  - `POST /api/send-email` — envia notificação Resend
  - `POST /api/complete-onboarding` — dispara webhook final
- CORS: handlers tratam `OPTIONS` retornando 204 (sem headers `Access-Control-Allow-*` explícitos — confiando no roteamento same-origin Vercel)

## Endpoints legados (não em uso)

- `supabase/functions/send-onboarding-email/index.ts` — Edge Function Deno (substituída por `api/send-email.ts`)
- `supabase/functions/send-webhook-complete/index.ts` — Edge Function Deno (substituída por `api/complete-onboarding.ts`)
- `supabase/config.toml` declara `verify_jwt = false` para essas duas funções — relevante apenas se a infra Supabase legada for reativada

---

*Integration audit: 2026-05-08*
