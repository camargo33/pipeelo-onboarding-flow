---
phase: 05-painel-notificacoes
plan: 02
subsystem: email-triggers
tags: [resend, cron, magic-link, idempotency, pitfall-7, pitfall-9]
status: complete
completed_date: 2026-05-08
requirements: [UI-04, UI-05, UI-06, UI-08]

dependency_graph:
  requires:
    - "Plan 05-01 templates (WelcomeCEO, ReminderStalled, CredentialsReady, JarvisFailedAlert)"
    - "Phase 1 onboarding_sessions schema (id, slug, access_token, ceo_email, ceo_nome, empresa_nome, status, last_activity_at)"
    - "nanoid ^5.1.11 (já no package.json)"
    - "resend ^4.0.1 (já no package.json)"
    - "@react-email/render ^2.0.8 (já no package.json)"
    - "DNS Resend mail.pipeelo.com — humano (Plan 05-00, ainda pendente)"
  provides:
    - "api/_lib/email-sender.ts (sendTransactionalEmail wrapper idempotente)"
    - "api/_lib/magic-link.ts (createCredentialsMagicLink + verifyCredentialsToken TTL 72h)"
    - "api/email/send-welcome.ts (POST endpoint Bearer auth, dispara WelcomeCEO)"
    - "api/email/send-credentials.ts (POST endpoint Bearer auth, dispara CredentialsReady com magic link 72h)"
    - "api/cron/reminder-stalled.ts (GET endpoint Vercel Cron diário 9h BRT, drena stale >48h)"
    - "supabase/migrations/20260509120000_email_log.sql (tabela + 3 cols em onboarding_sessions)"
    - "vercel.json crons schedule '0 12 * * *' para reminder-stalled"
  affects:
    - "api/admin/sessions-create.ts (passou a disparar WelcomeCEO async se ceo_email presente)"
    - "Plan 05-03 painel admin (vai consumir email_log pra mostrar histórico + botão reenvio)"
    - "admin-pipeelo Plan 03+04 (vai chamar /api/email/send-credentials quando Jarvis terminar)"

tech_stack:
  added:
    - "node:crypto createHash('sha256') para deriveIdempotencyKey (nativo, sem dep nova)"
    - "Resend SDK v4: emails.send com headers.Idempotency-Key + tags + replyTo opcional"
  patterns:
    - "Idempotency em 2 camadas: app (email_log lookup ANTES de mandar) + Resend SDK header (proteção em retry HTTP)"
    - "Cron escalation diária via key sufixada com yyyymmdd UTC — mesmo dia idem, dia seguinte renova"
    - "void + .catch para fire-and-forget no admin/sessions-create (UX não bloqueia em Resend)"
    - "Subject builder centralizado em SUBJECTS map dentro de email-sender.ts (preparação A/B testing)"
    - "Service role Supabase via getServiceSupabase (alias de Phase 1) — RLS bypass justificável (cron + endpoint server-side)"

key_files:
  created:
    - path: "api/_lib/email-sender.ts"
      role: "Wrapper único sobre Resend com idempotency via email_log"
    - path: "api/_lib/magic-link.ts"
      role: "Magic link 72h opaco (nanoid 32) + verify com TTL check"
    - path: "api/_lib/__tests__/email-sender.test.ts"
      role: "5 tests: idempotency hit/miss, failure persist+throw, magic link 72h, verify expirado/válido"
    - path: "api/email/send-welcome.ts"
      role: "Endpoint POST /api/email/send-welcome (Bearer ONBOARDING_WEBHOOK_TOKEN)"
    - path: "api/email/send-credentials.ts"
      role: "Endpoint POST /api/email/send-credentials (Bearer + gera magic link + marca email_sent_at)"
    - path: "api/email/__tests__/send-welcome.test.ts"
      role: "3 tests: 401, 200 com template+to+magicLink corretos, 400 ceo_email_missing"
    - path: "api/email/__tests__/send-credentials.test.ts"
      role: "2 tests: 401 e fluxo full (magic link + send + update)"
    - path: "api/cron/reminder-stalled.ts"
      role: "Cron GET /api/cron/reminder-stalled (Bearer CRON_SECRET, schedule 0 12 * * *)"
    - path: "api/cron/__tests__/reminder-stalled.test.ts"
      role: "4 tests: 401, batch 3 sessões, idempotency yyyymmdd, 500 db error"
    - path: "supabase/migrations/20260509120000_email_log.sql"
      role: "Migration: tabela email_log + 3 cols em onboarding_sessions"
  modified:
    - path: "api/admin/sessions-create.ts"
      role: "Wire WelcomeCEO async após INSERT se ceo_email presente"
    - path: "vercel.json"
      role: "Adicionado cron schedule '0 12 * * *' para reminder-stalled"

decisions:
  - "Idempotency key default = sha256(template+':'+sessionId).slice(0,40). Determinística e curta o suficiente pra index UNIQUE eficiente. Custom override usado pelo cron (yyyymmdd no sufixo) pra permitir escalation diária sem duplicar no mesmo dia."
  - "Cron schedule '0 12 * * *' = 12h UTC = 9h BRT (UTC-3). Justificativa Pitfall 6: tudo em UTC no Postgres+Vercel; BRT só no template visível ao CEO. 9h BRT = horário comercial = chance maior de leitura."
  - "Magic link 72h opaco (nanoid 32 URL-safe) persistido em onboarding_sessions.credentials_token. Verificação faz lookup por (slug, token) + checa expires_at. NÃO usei JWT — chave única rotacionável é simpler e revogável (pode set token=NULL)."
  - "WelcomeCEO wire em api/admin/sessions-create.ts (não em api/sessions/create.ts ou legacy api/create-session.ts) porque o entry point real com ceo_email é o admin variant — clientes finais entram via link Felipe gera no painel. Self-service create.ts é CNPJ-only, ceo_email não persistido em prod hoje."
  - "Wrapper sendTransactionalEmail throw em failure (não retorna error code) pra forçar caller a decidir (cron loga + segue, endpoints HTTP retornam 500). Alternativa swallow seria silenciosa demais."
  - "Migration NÃO aplicada via task — só commitada. Felipe roda via supabase db push em staging → smoke email → prod. Risco de aplicar prematuro: email_log table criada antes do código deployed = nada quebra mas é desperdício."
  - "Subjects centralizados em SUBJECTS map dentro de email-sender.ts (não nos templates). Templates são puro JSX visual, subjects são copy operacional — desacoplados pra A/B testing futuro sem rebuild de template."

metrics:
  duration_minutes: 7
  tasks_completed: 3
  files_created: 10
  files_modified: 2
  tests_added: 12
  full_suite: "172 passed | 5 skipped | 7 todo (184 total) — 0 regression"

env_vars_required:
  - name: RESEND_API_KEY
    purpose: Resend SDK auth
    status: já em produção (existing)
  - name: RESEND_FROM_EMAIL
    purpose: From address (default 'noreply@mail.pipeelo.com')
    status: precisa ajustar pra mail.pipeelo.com após DNS Resend (Plan 05-00 humano)
  - name: RESEND_REPLY_TO
    purpose: Reply-to opcional
    status: opcional
  - name: ONBOARDING_WEBHOOK_TOKEN
    purpose: Bearer auth dos endpoints /api/email/*
    status: precisa criar + adicionar em admin-pipeelo .env (Phase 4 webhook)
  - name: CRON_SECRET
    purpose: Bearer auth do cron Vercel
    status: já em produção (Phase 2 reconcile-webhooks)
  - name: PUBLIC_APP_URL
    purpose: Base URL pra magic links (default 'https://onboarding.pipeelo.com')
    status: opcional (fallback para ONBOARDING_BASE_URL existente)
---

# Phase 5 Plan 02: Email Triggers Resend + Magic Link Summary

**One-liner:** Wrapper email-sender idempotente sobre Resend (email_log + Idempotency-Key header), magic link 72h opaco persistido em onboarding_sessions, 2 endpoints Bearer auth (welcome + credentials) e cron diário 9h BRT que drena sessões stale >48h com escalation por yyyymmdd.

## Schema (DDL completo)

```sql
CREATE TABLE IF NOT EXISTS public.email_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID REFERENCES public.onboarding_sessions(id) ON DELETE CASCADE,
  template        TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  recipient       TEXT NOT NULL,
  resend_id       TEXT,
  status          TEXT NOT NULL CHECK (status IN ('sent','failed','skipped_idempotent')),
  error           TEXT,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_email_log_session  ON public.email_log(session_id);
CREATE INDEX idx_email_log_template ON public.email_log(template);

ALTER TABLE public.email_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY email_log_service_only ON public.email_log
  AS RESTRICTIVE FOR ALL TO public USING (false);

ALTER TABLE public.onboarding_sessions
  ADD COLUMN IF NOT EXISTS credentials_token             TEXT,
  ADD COLUMN IF NOT EXISTS credentials_token_expires_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS credentials_email_sent_at     TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_sessions_credentials_token
  ON public.onboarding_sessions(credentials_token)
  WHERE credentials_token IS NOT NULL;
```

## Endpoints + Auth Pattern

| Endpoint                           | Method | Auth                        | Trigger                          |
| ---------------------------------- | ------ | --------------------------- | -------------------------------- |
| `/api/email/send-welcome`          | POST   | Bearer ONBOARDING_WEBHOOK_TOKEN | Manual (painel) ou wire em admin/sessions-create |
| `/api/email/send-credentials`      | POST   | Bearer ONBOARDING_WEBHOOK_TOKEN | admin-pipeelo após Jarvis status='completed' |
| `/api/cron/reminder-stalled`       | GET    | Bearer CRON_SECRET (Vercel) | Diário 0 12 * * * (12h UTC = 9h BRT) |

**Padrão Bearer assertWebhookToken:**

```ts
function assertWebhookToken(req: VercelRequest): boolean {
  const expected = process.env.ONBOARDING_WEBHOOK_TOKEN;
  if (!expected) return false;
  return req.headers.authorization === `Bearer ${expected}`;
}
```

## Cron Schedule Justification

`0 12 * * *` (12h UTC = 9h BRT, UTC-3):

- Postgres + Vercel: tudo em UTC sempre (Pitfall 6 timezone discipline).
- 9h BRT = início do horário comercial brasileiro = janela com maior chance de leitura.
- Não roda noite (22h-7h BRT) pra evitar push notification spam de email no mobile do CEO.
- Idempotency yyyymmdd: se cron roda 2x no mesmo dia (deploy + reagendar Vercel), 2ª call vê email_log existente e skip. Dia seguinte permite re-envio (escalation suave de 48h, 72h, 96h, ... até CEO concluir ou Felipe marcar abandoned).

## Idempotency Strategy (Pitfall 7)

**2 camadas:**

1. **App layer** (email_log): antes de mandar, lookup por idempotency_key. Se status='sent', skip e retorna o resend_id antigo.
2. **Resend SDK** (Idempotency-Key header): se app crash entre send() e INSERT log, retry vai reusar o mesmo Resend ID (Resend dedup interno).

**Key derivation:**

| Caller                          | idempotencyKey                                    | Razão |
| ------------------------------- | ------------------------------------------------- | ----- |
| send-welcome (default)          | `sha256('WelcomeCEO:'+sessionId).slice(0,40)`     | 1 welcome por sessão FOREVER |
| send-credentials (default)      | `sha256('CredentialsReady:'+sessionId).slice(0,40)` | 1 credentials por sessão FOREVER |
| cron reminder-stalled (custom)  | `'reminder:'+sessionId+':'+yyyymmdd`              | 1 reminder por sessão POR DIA |

## Migration Aplicar (humano)

```bash
# Staging primeiro
cd ~/Desktop/pipeelo-onboarding-flow
supabase db push --linked --debug
# OU se sem CLI:
psql "$STAGING_DB_URL" -f supabase/migrations/20260509120000_email_log.sql

# Smoke: criar 1 session admin, conferir log no console quando enviar welcome
# Conferir email_log via:
psql -c "SELECT template, status, recipient, sent_at FROM public.email_log ORDER BY sent_at DESC LIMIT 10"

# Prod (depois de smoke OK):
# Mesmos comandos contra DB de produção
```

## Tests

```
✓ sendTransactionalEmail — idempotency
  ✓ 1ª chamada envia, 2ª chamada com mesmo (template, sessionId) NÃO envia
  ✓ em erro de Resend: persiste status=failed e propaga throw
✓ createCredentialsMagicLink
  ✓ gera token opaco persistido em onboarding_sessions com expires_at = now + 72h
✓ verifyCredentialsToken
  ✓ retorna null para token expirado
  ✓ retorna sessão para token válido
✓ POST /api/email/send-welcome
  ✓ 401 sem Bearer válido
  ✓ 200 + chama sendTransactionalEmail com template=WelcomeCEO
  ✓ 400 quando ceo_email ausente na sessão
✓ POST /api/email/send-credentials
  ✓ 401 sem Bearer
  ✓ 200 + gera magic link 72h + chama send + marca credentials_email_sent_at
✓ GET /api/cron/reminder-stalled
  ✓ 401 sem Bearer CRON_SECRET
  ✓ processa N sessões stale, 1 sendTransactionalEmail por sessão com keys distintas
  ✓ idempotency key inclui yyyymmdd para permitir escalation diária
  ✓ responde 500 quando query falha

12 tests novos | Suite total: 172 passed | 5 skipped | 7 todo (184 total)
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Missing context] Wire WelcomeCEO foi para api/admin/sessions-create.ts (não api/create-session.ts)**

- **Found during:** Task 2
- **Issue:** Plan apontou `api/create-session.ts` como wire point, mas o canonical (Phase 1+) é `api/sessions/create.ts` — e esse é CNPJ-only, sem ceo_email. O entry point com ceo_email é `api/admin/sessions-create.ts` (variante admin onde Felipe cria sessão pro cliente).
- **Fix:** Wire feita em `api/admin/sessions-create.ts` (5 linhas: import + bloco void+catch após INSERT). Legacy `api/create-session.ts` ficou intocada (não tem schema novo, é legacy não-recomendado).
- **Files modified:** `api/admin/sessions-create.ts`
- **Commit:** `0a2eca9`

**2. [Rule 1 - Test bug] makeSupabaseMock não tinha .lt/.not/.order**

- **Found during:** Task 3 verify
- **Issue:** Cron query usa `.lt('last_activity_at', cutoff).not('ceo_email', 'is', null).order('last_activity_at').limit(100)`. O helper `makeSupabaseMock` só tem eq/in/select/insert/update/single/maybeSingle. `.lt is not a function` quebrou o chain.
- **Fix:** Adicionei `m._chain.lt = vi.fn(() => m._chain)` (e `.not`, `.order`) explicitamente em cada `it()` que precisa. Não modifiquei o helper compartilhado (escopo Plan 05-02).
- **Files modified:** `api/cron/__tests__/reminder-stalled.test.ts`
- **Commit:** `7b82880`

**3. [Rule 1 - Mock bug] vi.mock('resend') hoisting + sendMock referência**

- **Found during:** Task 1 verify
- **Issue:** `vi.mock('resend', () => ({ Resend: vi.fn(() => ({ emails: { send: sendMock } })) }))` falhava com "Resend is not a constructor" — vi.fn não é callable como `new Resend()`. Adicionalmente, `sendMock` declarado fora estava undefined no tempo da factory hoisted.
- **Fix:** Usei `vi.hoisted(() => ({ sendMock: vi.fn(...) }))` pra compartilhar a referência + classe `Resend { emails = { send: sendMock } }` em vez de vi.fn.
- **Files modified:** `api/_lib/__tests__/email-sender.test.ts`
- **Commit:** `4db5fce` (incluído no commit inicial Task 1)

### Auth Gates / Architectural Changes

Nenhum. DNS Resend (Plan 05-00) continua humano e fora deste plan — código está pronto pra DNS verified e roda em modo "logado mas sem entrega real" se RESEND_API_KEY ausente (lança Missing env var, mas só ao primeiro send).

## Próximos Passos

- **Plan 05-03 (Wave 3)**: Painel admin `/onboarding-sessions` em admin-pipeelo. Vai consumir `email_log` pra mostrar histórico de envios + botão "Reenviar magic link" (deleta email_log do template + chama endpoint = força novo envio). Vai cobrir UI-01, UI-02, UI-03 + UI-07 (alerta WhatsApp Felipe quando Jarvis falha definitivo).
- **admin-pipeelo Phase 4 wire**: Quando `closeJarvisRun(success)` no admin-pipeelo, chamar `POST $ONBOARDING_API/api/email/send-credentials` com Bearer ONBOARDING_WEBHOOK_TOKEN. Adicionar var em admin-pipeelo `.env`.
- **DNS Resend** (Plan 05-00 humano): Felipe configura `mail.pipeelo.com` no Cloudflare + Resend domain verify. Após verified, ajustar RESEND_FROM_EMAIL pra `noreply@mail.pipeelo.com` em prod env.

## Commits

| Task | Hash      | Message                                                                  |
| ---- | --------- | ------------------------------------------------------------------------ |
| 1    | `4db5fce` | feat(05-02): email-sender idempotente + magic link 72h + email_log migration |
| 2    | `0a2eca9` | feat(05-02): endpoints send-welcome + send-credentials + wire admin/sessions-create |
| 3    | `7b82880` | feat(05-02): cron reminder-stalled diário 9h BRT + vercel.json schedule  |

## Self-Check: PASSED

- api/_lib/email-sender.ts FOUND
- api/_lib/magic-link.ts FOUND
- api/_lib/__tests__/email-sender.test.ts FOUND
- api/email/send-welcome.ts FOUND
- api/email/send-credentials.ts FOUND
- api/email/__tests__/send-welcome.test.ts FOUND
- api/email/__tests__/send-credentials.test.ts FOUND
- api/cron/reminder-stalled.ts FOUND
- api/cron/__tests__/reminder-stalled.test.ts FOUND
- supabase/migrations/20260509120000_email_log.sql FOUND
- .planning/phases/05-painel-notificacoes/05-02-SUMMARY.md FOUND
- Commit 4db5fce FOUND
- Commit 0a2eca9 FOUND
- Commit 7b82880 FOUND
- 12/12 novos tests passing
- Suite total 172 passed | 5 skipped | 7 todo (0 regression)
