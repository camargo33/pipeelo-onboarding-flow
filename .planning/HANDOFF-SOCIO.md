# HANDOFF — Setup & Cutover Pipeelo Onboarding v2

**Para:** Sócio do Felipe
**Contexto:** Toda a parte de código do upgrade v2 está pronta. Falta setar credenciais, aplicar migrations e fazer o cutover. Estimativa total: **3-4h** distribuído em ~10 passos.

**Pré-requisito:** Acesso de admin a Vercel, Cloudflare, Supabase (`llsqqbbhcdosrtpvvkml` onboarding-flow + project admin-pipeelo), Resend, Anthropic, Upstash, Langfuse, Evolution API.

---

## SEQUÊNCIA RECOMENDADA

Faça os passos em ordem. Pode pular paralelos se já tiver conta criada (passos 1-5 são setup de contas — paraleliza tranquilo).

---

## 1. Vercel — adicionar custom domain `onboarding.pipeelo.com`

1. Abrir https://vercel.com/camargomartinsltda-gmailcoms-projects/pipeelo-onboarding-flow/settings/domains
2. Em "Add Domain" → digitar: `onboarding.pipeelo.com` → Add
3. Vercel vai mostrar um **CNAME alvo** (algo como `cname.vercel-dns.com`). Copiar.
4. Ir em **Cloudflare** → DNS → Records → **Add record**:
   - Type: `CNAME`
   - Name: `onboarding`
   - Target: (cole o CNAME do Vercel)
   - Proxy status: **DNS only** (ícone CINZA — Vercel precisa controlar SSL, não pode proxiar)
   - Save
5. Voltar pro Vercel → esperar ~30s → ver ✓ verde no domain
6. Testar: `https://onboarding.pipeelo.com` deve abrir o app

---

## 2. Cloudflare Turnstile (CAPTCHA)

1. https://dash.cloudflare.com → menu lateral **Turnstile** → **Add site**
2. Preencher:
   - Site name: `Pipeelo Onboarding`
   - Domain: `onboarding.pipeelo.com`
   - Widget mode: **Managed**
3. Create → Cloudflare gera 2 chaves:
   - **Site key** (pública) — começa com `0x4AAAAAAA…`
   - **Secret key** (privada) — começa com `0x4AAAAAAA…`
4. **Anota as 2 chaves** (vamos setar no Vercel no Passo 8)

---

## 3. Upstash Redis (rate-limiting)

1. https://console.upstash.com (free tier serverless)
2. **Create Database**:
   - Name: `pipeelo-onboarding-ratelimit`
   - Type: **Regional** (não Global)
   - Region: **South America (sa-east-1) São Paulo** (fica perto do Vercel deploy)
   - TLS: ON
3. Create → na tela do DB, role pra baixo até **REST API**:
   - Copiar **UPSTASH_REDIS_REST_URL**
   - Copiar **UPSTASH_REDIS_REST_TOKEN**
4. **Anota as 2 chaves**

---

## 4. Anthropic API Key (Claude — pro Jarvis)

1. https://console.anthropic.com → **Settings** → **API Keys**
2. **Create Key** → Name: `pipeelo-jarvis-prod` → Create
3. Copia a key (começa com `sk-ant-api03-…`)
4. **Anota** — só aparece 1 vez

**IMPORTANTE:** garante que tem créditos / billing ativo na conta Anthropic. Jarvis usa `claude-opus-4-7` (Opus = mais caro). Estima ~$2-5 por sessão de onboarding com prompt caching.

---

## 5. Langfuse Cloud (observability AI)

1. https://cloud.langfuse.com/auth/sign-up → **escolha region EU** (LGPD)
2. Cria conta + organização Pipeelo
3. **New Project** → Name: `pipeelo-jarvis`
4. **Settings** → **API Keys** → **Create new API keys**:
   - Copia **Public Key** (começa com `pk-lf-…`)
   - Copia **Secret Key** (começa com `sk-lf-…`)
5. **Anota** + também anota: `LANGFUSE_HOST=https://cloud.langfuse.com`

---

## 6. Resend (emails transacionais)

1. https://resend.com → conta + criar org Pipeelo
2. **Domains** → **Add Domain**:
   - Domain: `mail.pipeelo.com`
   - Region: **us-east-1** (free tier) ou **eu-west-1** (LGPD — mais caro)
3. Resend vai mostrar 3 records DNS pra criar:
   - `MX` para `feedback-smtp.{region}.amazonses.com`
   - `TXT` SPF: `v=spf1 include:amazonses.com ~all`
   - `TXT` DKIM (3 records `_amazonses._domainkey` etc)
   - `TXT` DMARC (recomendado): `v=DMARC1; p=quarantine; rua=mailto:dmarc@pipeelo.com`
4. **Cloudflare** → DNS → adiciona TODOS esses records (proxy: **DNS only** pra todos)
5. Volta no Resend → **Verify DNS** → esperar até ✓ verde (~5min)
6. **Settings** → **API Keys** → Create → Name: `pipeelo-onboarding`
   - Permission: **Full access** (ou Send only)
   - Copia API key (começa com `re_…`)
7. **Anota a API key**
8. Testa deliverability depois: enviar email e checar em https://www.mail-tester.com (alvo ≥9/10)

---

## 7. Evolution API (WhatsApp alerta Felipe)

1. Já temos Evolution rodando (per memory `reference_projetos.md`). Conferir URL e API key:
   - URL típica: `https://evolution.pipeelo.com` ou similar
   - Pegar API key da instância existente
2. Anota:
   - `EVOLUTION_API_URL=https://...`
   - `EVOLUTION_API_KEY=...`
   - `FELIPE_WHATSAPP=5511999999999` (número internacional sem +, com DDD)

---

## 8. Vercel — setar env vars nos 2 projetos

**8.A — Projeto `pipeelo-onboarding-flow`** (https://vercel.com/camargomartinsltda-gmailcoms-projects/pipeelo-onboarding-flow/settings/environment-variables)

Adicionar (cada um em **Production** + **Preview**):

| Nome | Valor | Origem |
|------|-------|--------|
| `VITE_SUPABASE_URL` | (já existe — confirmar) | Supabase Dashboard |
| `VITE_SUPABASE_ANON_KEY` | (já existe — confirmar é JWT anon, NÃO publishable) | Supabase Dashboard |
| `SUPABASE_URL` | (já existe) | igual a VITE_SUPABASE_URL |
| `SUPABASE_SERVICE_ROLE_KEY` | (já existe — confirmar) | Supabase Dashboard → Settings → API |
| `VITE_TURNSTILE_SITE_KEY` | Site key do Passo 2 | Cloudflare Turnstile |
| `TURNSTILE_SECRET_KEY` | Secret key do Passo 2 | Cloudflare Turnstile |
| `UPSTASH_REDIS_REST_URL` | do Passo 3 | Upstash |
| `UPSTASH_REDIS_REST_TOKEN` | do Passo 3 | Upstash |
| `RESEND_API_KEY` | do Passo 6 | Resend |
| `RESEND_FROM_EMAIL` | `noreply@mail.pipeelo.com` | constante |
| `ONBOARDING_WEBHOOK_TOKEN` | gerar com `openssl rand -hex 32` (Linux/Mac) ou https://it-tools.tech/token-generator | constante (mesmo valor no admin-pipeelo) |
| `ADMIN_BASE_URL` | `https://admin.pipeelo.com` (URL do admin-pipeelo em prod) | constante |
| `CRON_SECRET` | gerar com `openssl rand -hex 32` | constante (igual no admin) |

Após salvar todas, ir em **Deployments** → último deploy → **Redeploy** (pra Vercel pegar novas envs).

**8.B — Projeto `admin-pipeelo`** (URL: https://vercel.com/{seu-scope}/admin-pipeelo/settings/environment-variables)

| Nome | Valor | Origem |
|------|-------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | (já existe — admin Supabase) | confirmar |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | (já existe) | confirmar |
| `SUPABASE_SERVICE_ROLE_KEY` | (já existe) | confirmar |
| `ANTHROPIC_API_KEY` | do Passo 4 | Anthropic |
| `LANGFUSE_PUBLIC_KEY` | do Passo 5 | Langfuse |
| `LANGFUSE_SECRET_KEY` | do Passo 5 | Langfuse |
| `LANGFUSE_HOST` | `https://cloud.langfuse.com` | constante |
| `CRON_SECRET` | mesmo valor do 8.A | constante |
| `ONBOARDING_WEBHOOK_TOKEN` | mesmo valor do 8.A | constante |
| `RESEND_API_KEY` | mesmo valor do 8.A | constante |
| `EVOLUTION_API_URL` | do Passo 7 | Evolution |
| `EVOLUTION_API_KEY` | do Passo 7 | Evolution |
| `FELIPE_WHATSAPP` | do Passo 7 | Felipe |
| `JARVIS_ENABLED` | `false` | **deixar false até cutover (Passo 13)** |

Após salvar, **Redeploy** pro admin-pipeelo.

---

## 9. Aplicar migrations no Supabase

**9.A — Supabase do `pipeelo-onboarding-flow`** (`llsqqbbhcdosrtpvvkml`)

Conectar via **Connection string pooler** (segundo memory: `aws-1-sa-east-1.pooler.supabase.com:5432`, senha `Hkg12a3z!@!` URL-encoded `Hkg12a3z%21%40%21`):

```bash
# Substituir <USER> e <DB> pelos valores reais do dashboard
export PG_URL="postgresql://postgres.llsqqbbhcdosrtpvvkml:Hkg12a3z%21%40%21@aws-1-sa-east-1.pooler.supabase.com:5432/postgres"

cd ~/Desktop/pipeelo-onboarding-flow

# 1. Migration de Phase 2 (outbox)
psql "$PG_URL" -f supabase/migrations/20260509000000_webhook_outbox.sql

# 2. Migration de Phase 5 (email_log + colunas credentials_token, etc)
psql "$PG_URL" -f supabase/migrations/20260509120000_email_log.sql

# 3. Migration de Phase 1 (lock RLS) — POR ÚLTIMO + janela 0 onboardings
# Antes, leia o RUNBOOK: .planning/phases/01-hardening-server-side-persistence/01-05-RUNBOOK.md
# Resumo: smoke pre-lock → apply → smoke post-lock → drill rollback (<5min) → apply prod → monitor 30min
psql "$PG_URL" -f supabase/migrations/20260508120000_lock_rls_phase1.sql
```

**Validar:**
```bash
psql "$PG_URL" -c "SELECT tablename, policyname, permissive, roles FROM pg_policies WHERE tablename LIKE 'onboarding_%';"
# Deve mostrar apenas policies "service_role only" (RESTRICTIVE), zero "public read/insert/update"
```

**9.B — Supabase do `admin-pipeelo`**

Pegar connection string do project admin no Supabase Dashboard → Settings → Database → Connection string (use URI mode + Session pooler).

```bash
export ADMIN_PG_URL="postgresql://...admin..."

cd ~/Desktop/admin-pipeelo

# 1. Migration de Phase 3 (jarvis audit tables)
psql "$ADMIN_PG_URL" -f supabase/migrations/20260509000000_jarvis_audit_tables.sql

# 2. Migration de Phase 4 (lease columns em onboarding_sessions)
psql "$ADMIN_PG_URL" -f supabase/migrations/20260509120000_jarvis_lease_columns.sql

# 3. Migration de Phase 4 (RPC claim_pending_sessions)
psql "$ADMIN_PG_URL" -f supabase/migrations/20260509130000_claim_pending_sessions_rpc.sql
```

**Validar:**
```bash
psql "$ADMIN_PG_URL" -c "SELECT count(*) FROM jarvis_runs; SELECT count(*) FROM jarvis_tool_calls; SELECT count(*) FROM idempotency_keys;"
# Deve retornar 0,0,0 (tabelas existem, vazias)

psql "$ADMIN_PG_URL" -c "\d onboarding_sessions" | grep -E "locked_at|attempt_count|last_error"
# Deve mostrar as 5 colunas novas

psql "$ADMIN_PG_URL" -c "SELECT routine_name FROM information_schema.routines WHERE routine_name = 'claim_pending_sessions';"
# Deve retornar 1 linha
```

---

## 10. Push do branch admin-pipeelo (depois de tudo OK)

```bash
cd ~/Desktop/admin-pipeelo
git push origin main
```

39 commits vão pro GitHub → Vercel auto-deploy do admin-pipeelo. Como `JARVIS_ENABLED=false`, o flow novo fica dormente — fluxo atual continua igual.

---

## 11. Smoke E2E em STAGING (Phase 1 RUNBOOK)

Seguir `.planning/phases/01-hardening-server-side-persistence/01-05-RUNBOOK.md` (já está no repo). Resumo:

1. Criar sessão em https://onboarding.pipeelo.com/novo
2. Preencher Identificação + 3 perguntas Financeiro
3. Fechar aba
4. Reabrir via magic link recebido por email → confirmar respostas salvas
5. Tentar com anon key fazer SELECT em `onboarding_sessions` → deve dar `permission denied`

Se passar tudo: ✓ Phase 1 cutover validado.

---

## 12. Replay 5 sessões histórica (Phase 6 — antes do cutover)

```bash
cd ~/Desktop/admin-pipeelo

# 12.A — Selecionar 5 sessões reais de prod (read-only)
export STAGING_SUPABASE_URL=...
export SUPABASE_SERVICE_ROLE_KEY=...
npx tsx scripts/select-historical-sessions.ts --env=prod --limit=5
# Output: scripts/fixtures/historical-sessions.json preenchido

# 12.B — Pra cada session_id, rodar replay
export ANTHROPIC_API_KEY=...
export CRON_SECRET=...
npx tsx scripts/replay-session.ts --env=staging --session-id=<id> --mode=jarvis
npx tsx scripts/replay-session.ts --env=staging --session-id=<id> --mode=legacy
npx tsx scripts/replay-diff.ts --session-id=<id>
# Output: .planning/phases/06-evals-cutover/diff-{sessionId}.json

# 12.C — Preencher .planning/phases/06-evals-cutover/REPLAY-RESULTS.md com sign-off
```

---

## 13. Threshold check (Phase 6)

```bash
cd ~/Desktop/admin-pipeelo
npx tsx scripts/threshold-check.ts --window=7d --env=staging
# Deve retornar GO se: ≥95% tool calls success, 0 cross-tenant, ≥7/8 DNA tom rules
```

Preencher `.planning/phases/06-evals-cutover/EVAL-RESULTS.md` com GO-LIVE ou NO-GO.

---

## 14. Cutover prod (Phase 6 RUNBOOK)

Seguir `.planning/phases/06-evals-cutover/CUTOVER-RUNBOOK.md`. Resumo:

```bash
cd ~/Desktop/admin-pipeelo

# 14.A — Drill flip-back staging
export VERCEL_TOKEN=...
export VERCEL_PROJECT_ID=<staging_id>
export ADMIN_BASE_URL="https://admin-staging.pipeelo.com"
export ONBOARDING_WEBHOOK_TOKEN=...
export DRILL_SMOKE_SESSION_ID=<sessao_completed_em_staging>
npx tsx scripts/flip-back-drill.ts --env=staging
# Aceitar: passedTarget=true + totalMs < 30000

# 14.B — Drill flip-back PROD (janela 0 onboardings, hard requirement)
export VERCEL_PROJECT_ID=<prod_id>
export ADMIN_BASE_URL="https://admin.pipeelo.com"
npx tsx scripts/flip-back-drill.ts --env=production --i-know-what-im-doing

# 14.C — FLIP ON
vercel env add JARVIS_ENABLED production   # value=true
vercel --prod  # cold-start refresh

# 14.D — Monitor 24h em terminal dedicado
export NEXT_PUBLIC_SUPABASE_URL=<prod>
export SUPABASE_SERVICE_ROLE_KEY=<prod_service_role>
npx tsx scripts/cutover-monitor.ts --watch --window=60 --interval=30

# 14.E — Documentar cliente #1 em CUTOVER-LOG.md (.planning/phases/06-evals-cutover/)
# Após 24h sem incidente → expand pra todos. Senão: rollback (vercel env rm JARVIS_ENABLED production)
```

---

## CRITÉRIOS DE GO/NO-GO PRO CUTOVER

**GO** (todas verdadeiras):
- Tenant criado com ≥4 categorias e ≥4 assistentes
- Prompts batem ≥7/8 regras DNA tom (threshold-check passou)
- Cliente recebeu email magic link
- Sem alertas WhatsApp Felipe
- `cutover-monitor` mostra error_rate <5% e zero CROSS_TENANT_DETECTED

**NO-GO** (qualquer uma → flip back imediato):
- `[CRITICAL] CROSS_TENANT_DETECTED`
- error_rate >5% sustentado 2 ticks (60s)
- Tenant faltando categoria essencial
- Alerta WhatsApp Felipe
- Cliente reclamou

Rollback de emergência: `vercel env rm JARVIS_ENABLED production` → cold restart automático → fluxo legacy volta em <30s.

---

## ROTACIONAR/REVOGAR DEPOIS

Quando o cutover estabilizar (~1 semana sem incidentes):
- Vercel API Token: revogar em https://vercel.com/account/tokens
- Cloudflare API Token (se usar): revogar em https://dash.cloudflare.com/profile/api-tokens
- Anthropic API Key: rotacionar pra key restrita (apenas Messages API + budget alert)

---

## ARQUIVOS DE REFERÊNCIA NO REPO

- `.planning/PROJECT.md` — visão geral
- `.planning/ROADMAP.md` — 6 fases com status
- `.planning/REQUIREMENTS.md` — 52 reqs e tracking
- `.planning/phases/<phase>/<plan>-SUMMARY.md` — 23 SUMMARYs com detalhes do que foi entregue
- `.planning/phases/01-hardening-server-side-persistence/01-05-RUNBOOK.md` — RLS lock cutover
- `.planning/phases/06-evals-cutover/CUTOVER-RUNBOOK.md` — Jarvis go-live
- `.planning/phases/06-evals-cutover/REPLAY-RESULTS.md` — sign-off replay
- `.planning/phases/06-evals-cutover/EVAL-RESULTS.md` — sign-off threshold
- `.planning/phases/06-evals-cutover/CUTOVER-LOG.md` — log do cutover

---

**Estimativa de tempo total:** 3-4h (sem contar 24h de monitor pós-flip).

Boa sorte! 🚀
