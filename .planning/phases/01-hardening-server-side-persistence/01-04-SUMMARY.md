---
phase: 01-hardening-server-side-persistence
plan: 04
subsystem: anti-abuse-validations-progressbar
tags: [hard-04, hard-05, hard-06, hard-07, wave-3, ratelimit, turnstile, brasilapi, cnpj-validation, ci-gate-hard]
requires:
  - api-sessions-create
  - api-sessions-get
  - vitest-config
  - test-helpers
  - audit-script-hard-01
provides:
  - upstash-redis-ratelimit
  - turnstile-server-verify
  - brasilapi-cnpj-lookup-with-cache
  - api-sessions-validate-cnpj
  - identificacao-zod-schemas
  - cnpj-client-util
  - progressbar-test-coverage
  - ci-audit-hard-gate
affects:
  - api/sessions/create.ts
  - api/_lib/schemas/session.ts
  - src/pages/NovoOnboarding.tsx
  - src/pages/OnboardingSession.tsx
  - .github/workflows/ci.yml
tech_stack:
  added:
    - "@upstash/redis@^1.38.0 (HTTP Redis client serverless)"
    - "@upstash/ratelimit@^2.0.8 (slidingWindow algorithm)"
  patterns:
    - "Singleton Redis client cacheado por process (ratelimit + brasilapi compartilham)"
    - "Pipeline endurecido em create.ts: ratelimit → parse+checksum → Turnstile → insert"
    - "BrasilAPI primary + ReceitaWS fallback + cache 24h Upstash + degraded mode 503"
    - "CnpjSchema com transform + checksum (ANTES de Turnstile/DB) — não bloqueia em provider down"
    - "Inline validation pattern: onBlur valida + onChange só valida se já tocou"
    - "vi.mock antes de import (vitest hoisting) para mockar @upstash/* globalmente"
  removed:
    - "continue-on-error: true do CI audit step (HARD-01 enforced como bloqueante de PR)"
key_files:
  created:
    - api/_lib/ratelimit.ts
    - api/_lib/ratelimit.test.ts
    - api/_lib/turnstile.ts
    - api/_lib/turnstile.test.ts
    - api/_lib/brasilapi.ts
    - api/_lib/brasilapi.test.ts
    - api/_lib/schemas/identificacao.ts
    - api/_lib/schemas/identificacao.test.ts
    - api/sessions/validate-cnpj.ts
    - api/sessions/create.ratelimit.test.ts
    - src/lib/cnpj.ts
    - src/lib/cnpj.test.ts
    - src/components/onboarding/ProgressBar.test.tsx
  modified:
    - api/sessions/create.ts
    - api/sessions/create.test.ts
    - api/_lib/schemas/session.ts
    - src/pages/NovoOnboarding.tsx
    - src/pages/OnboardingSession.tsx
    - src/lib/__stubs__.test.ts
    - .github/workflows/ci.yml
    - package.json
    - package-lock.json
decisions:
  - "Schema CreateSessionSchema agora usa CnpjSchema (checksum strict) — quebra qualquer chamada legacy com CNPJ inválido. Test fixtures atualizadas para 11222333000181 (válido)."
  - "turnstileToken default('') no schema — modo dev sem TURNSTILE_SECRET_KEY mantém aceitação. Em prod com secret setado, token vazio falha siteverify automaticamente."
  - "Ordem do pipeline: ratelimit ANTES de tudo (poupa Turnstile call em ataque), parse ANTES de Turnstile (poupa siteverify em payload bagunçado), Turnstile ANTES de DB. Confirmado por teste 'ordem importa'."
  - "ProgressBar component (current/total/percentage) ficou intacto — é genérico para perguntas. HARD-06 fix vive em OnboardingSession.tsx (denominador = DEPARTMENT_ORDER.length = 5)."
  - "src/lib/cnpj.ts: util client-side duplica isValidCnpjChecksum do server. Aceito (Phase 1 minimal) — Phase 2+ pode extrair pra @pipeelo/onboarding-shared se justificar."
  - "Mock @upstash/redis + @upstash/ratelimit em testes via vi.mock antes do import (hoisting). __resetLimiterCache() exposto pra reset entre cenários."
  - "tolera erro Redis silenciosamente em brasilapi cache (.catch(() => null)) — cache é otimização, não bloqueio. Em ratelimit, erro de Redis é fail-fast (Redis.fromEnv() pode lançar)."
  - "validate-cnpj endpoint não exige auth (chamado de NovoOnboarding pré-sessão). Rate-limit dele NÃO foi adicionado neste plan — nice-to-have para Plan 05/Phase 2 se vazar abuse."
  - "CI gate HARD-01 endurecido AGORA (audit verde desde Plan 03). PRs futuros que reintroduzirem supabase.from(onboarding_*) em src/ falham build."
metrics:
  duration_minutes: 6
  tasks_completed: 3
  files_created: 13
  files_modified: 9
  commits: 3
  completed_date: 2026-05-08
  tests_added: 41
  tests_passing_total: 102
  tests_todo: 8
---

# Phase 01 Plan 04: Anti-Abuse + Inline Validation + ProgressBar Summary

Endureceu `/api/sessions/create` com rate-limit Upstash (5/IP/min) + Turnstile siteverify + checksum CNPJ; adicionou endpoint proxy `/api/sessions/validate-cnpj` com BrasilAPI cache 24h + ReceitaWS fallback; aplicou validação inline de CNPJ em NovoOnboarding; corrigiu denominador do progress de `/4` para `/5` (HARD-06); fechou o gate CI HARD-01 como bloqueante de PR. Cobre HARD-04 (gate base) + HARD-05 (validações + lookup) + HARD-06 (progress fix) + HARD-07 (rate-limit + Turnstile server).

## Objective Recap

Wave 3 fecha o ciclo de defesa server-side. Plan 03 (Wave 2) migrou o front para `/api/sessions/*` e wired o TurnstileWidget; Plan 04 entrega o que faltava no servidor: limites de abuso, validação dura de CNPJ (com fallback gracioso) e o último bug visual do progresso. Após este plan, Wave 4 (Plan 05) pode aplicar a migration de RLS lock sem deixar buracos.

## What Was Built

### 1. Utils server (Task 1, commit `f29b803`)

- `api/_lib/ratelimit.ts`:
  - `createSessionLimiter()` — singleton `Ratelimit.slidingWindow(5, '1 m')` com prefix `rl:create-session`, analytics on
  - `__resetLimiterCache()` exposto p/ testes
- `api/_lib/turnstile.ts`:
  - `verifyTurnstileToken(token, ip?)` — POST `https://challenges.cloudflare.com/turnstile/v0/siteverify` com `AbortSignal.timeout(5000)`
  - Fail-closed em network error / token vazio
  - Modo dev permissivo se `TURNSTILE_SECRET_KEY` ausente (warn no console)
- `api/_lib/schemas/identificacao.ts`:
  - `isValidCnpjChecksum(cnpj)` — algoritmo oficial 5,4,3,2,9,...,2 + reject repetições
  - `CnpjSchema` (transform → 14 dígitos + checksum), `EmailSchema` (RFC 5322 + lowercase + trim), `WhatsappBrSchema` (E.164 BR móvel/fixo)
  - `IdentificacaoSchema` agrega os 3
- 25 testes Vitest (2 ratelimit + 6 turnstile + 17 identificacao incluindo isValidCnpjChecksum + IdentificacaoSchema agregado)

### 2. BrasilAPI util + validate-cnpj endpoint + harden create.ts (Task 2, commit `f715ce0`)

- `api/_lib/brasilapi.ts`:
  - `fetchCnpj(cnpj)`:
    1. cache hit Redis → retorna direto
    2. BrasilAPI 200 → cacheia 24h + retorna
    3. BrasilAPI 404 → throw `HttpError(404, 'cnpj_not_found')`
    4. BrasilAPI 5xx/timeout → fallback ReceitaWS:
       - status='ERROR' → `HttpError(404, 'cnpj_not_found')`
       - 5xx/timeout → `HttpError(503, 'cnpj_lookup_unavailable')`
       - OK → cacheia + retorna
  - Toleração silenciosa de falhas Redis no get/set (cache é otimização)
- `api/sessions/validate-cnpj.ts`:
  - `POST /api/sessions/validate-cnpj` body `{ cnpj }`
  - 200 `{ data }` | 400 `invalid_payload` | 404 `cnpj_not_found` | 503 `cnpj_lookup_unavailable` | 405
- `api/sessions/create.ts` (refatorado):
  - 1. `createSessionLimiter().limit(ip)` → 429 `rate_limit` + header `X-RateLimit-Remaining`
  - 2. `CreateSessionSchema.parse(body)` (CNPJ com checksum) → 400
  - 3. `verifyTurnstileToken(token, ip)` → 403 `captcha_failed`
  - 4. Insert `onboarding_sessions`
  - 23505 → 409 `cnpj_already_exists` (mantido)
- `api/_lib/schemas/session.ts`: `CreateSessionSchema.cnpj` agora usa `CnpjSchema` (checksum); `turnstileToken` default `''` para dev mode
- 18 testes (8 brasilapi cobrindo 4xx/5xx/cache hit/Redis down/fallback ReceitaWS + 5 ratelimit/turnstile + 5 create existentes)

### 3. ProgressBar /5 + CNPJ inline + CI gate (Task 3, commit `00e2fba`)

- `src/pages/OnboardingSession.tsx`:
  - `totalDepartments = DEPARTMENT_ORDER.length` (= 5) substitui `/4` hardcoded
  - `progressPct` calcula com denominador correto
  - `allCompleted = completedCount === 5`
- `src/pages/NovoOnboarding.tsx`:
  - `cleanCnpj` + `formatCnpj` (auto máscara) + `validateCnpj` (mensagens pt-BR)
  - State novo: `cnpjError` + `cnpjTouched`
  - `onChange` valida só se já tocou; `onBlur` força validação + mensagem field-level
  - `aria-invalid` + `aria-describedby="cnpj-error"` + `role="alert"` na mensagem
  - `canSubmit` exige `cnpjValid` (checksum) — botão fica disabled até CNPJ legítimo
- `src/lib/cnpj.ts`: `cleanCnpj`, `isValidCnpjChecksum`, `validateCnpj` (retorna mensagem pt-BR ou null), `formatCnpj` (progressivo)
- `src/components/onboarding/ProgressBar.test.tsx`: 4 testes (X/Y, 0/N, 5/5 baseline DEPARTMENT_ORDER.length, sectionName)
- `src/lib/cnpj.test.ts`: 12 testes
- `.github/workflows/ci.yml`: **removido `continue-on-error: true`** do step audit — HARD-01 agora bloqueia merges
- Atualizado `__stubs__.test.ts` removendo o todo de ProgressBar (substituído por test real)

## Verification Results

| Check | Expected | Actual | Status |
|-------|----------|--------|--------|
| `npx vitest run api/_lib/ratelimit.test.ts api/_lib/turnstile.test.ts api/_lib/schemas/identificacao.test.ts` | green | 25 passed (3 files) | PASS |
| `npx vitest run api/_lib/brasilapi.test.ts api/sessions/create.ratelimit.test.ts api/sessions/create.test.ts` | green | 18 passed | PASS |
| `npx vitest run` (full) | green | 102 passed + 8 todo (19 files + 2 skipped) | PASS |
| `npm run audit:no-supabase-from` | exit 0 | exit 0 — "PASS: zero supabase.from(onboarding_*) em src/" | PASS |
| `npm run build` | exit 0 | exit 0 (3.52s, 749kb / gzip 226kb) | PASS |
| CI workflow `continue-on-error` removido | yes | yes (audit step agora bloqueia PR) | PASS |
| Pipeline create.ts ordem: ratelimit → parse → Turnstile | enforced | test "429 não chama Turnstile" passa | PASS |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocker] Tests existentes em `api/sessions/create.test.ts` quebraram com CnpjSchema strict**

- **Found during:** Task 2 ao rodar suite
- **Issue:** `create.test.ts` (do Plan 01-01) usava CNPJ dummy `12345678901234` que falha o checksum agora ativo. 4 testes quebraram (409 conflict + colunas pendente). Sem mock de ratelimit/turnstile, todos retornavam 500 antes de chegar no insert mockado.
- **Fix:** Atualizei `create.test.ts` para:
  - Mockar `../_lib/ratelimit` + `../_lib/turnstile` no mesmo padrão de `create.ratelimit.test.ts`
  - Substituir CNPJ dummy por `11222333000181` (checksum válido conhecido) em toda a suite
- **Files modified:** `api/sessions/create.test.ts`
- **Commit:** `f715ce0` (mesmo de Task 2)

### Minor Adjustments

**2. ProgressBar component genérico mantido — HARD-06 vive em OnboardingSession**

O plan trazia exemplo de ProgressBar com prop `completedCount` + denominador hardcoded `DEPARTMENT_ORDER.length` no próprio componente. Mas o ProgressBar atual é usado em `Onboarding.tsx` para perguntas dentro de um departamento (current/total/percentage genérico) — mudar a API quebraria essa página. Adotei a alternativa pragmática mencionada no plan: fix em `OnboardingSession.tsx` onde o `/4` está hardcoded, mantendo o componente genérico. Test do ProgressBar inclui caso `5/5` baseline para garantir que ele suporta DEPARTMENT_ORDER.length.

**3. CNPJ formatCnpj com máscara progressiva (não estava no plan)**

UX win: input agora formata enquanto digita (`11222` → `11.222`). Sem custo, melhora muito a leitura. Função idempotente (só dígitos contam).

**4. Email + WhatsApp validação inline NÃO entra nesta plan**

Plan dizia também email RFC 5322 + WhatsApp E.164 BR inline. Mas `NovoOnboarding.tsx` só tem campos `empresa_nome` + `cnpj` hoje — email e whatsapp aparecem dentro do questionário do dept Identificação (`Onboarding.tsx`), não na criação de sessão. O schema `IdentificacaoSchema` e os Zod refinements (EmailSchema/WhatsappBrSchema) já estão prontos para serem usados quando a tela da pergunta de Identificação chamar `/api/sessions/save-resposta` com validação inline. Documentado para Plan 05 ou Phase 2.

**5. Endpoint validate-cnpj NÃO está sendo chamado pelo front ainda**

Está pronto e testado, mas `NovoOnboarding.tsx` ainda só faz validação local (checksum). Plan 05 ou Phase 2 pode adicionar botão "Validar com Receita" que chama `sessionApi.validateCnpj` (a adicionar ao api-client). Decisão consciente: mantém UX rápida e evita rate-limit do BrasilAPI em digitação.

**6. Não foi feita rate-limit em `/api/sessions/validate-cnpj`**

Endpoint público sem auth pode ser abusado se for chamado em loop. Risk baixo enquanto front não chama (item 5). Adicionar `validateCnpjLimiter` no Plan 05 quando ativarmos o lookup público. Documentado em TODOs.

## Auth Gates

Nenhum encontrado. Toda a Wave 3 roda local: vitest + audit + build verdes. Verificação real (chamar Cloudflare Turnstile + Upstash + BrasilAPI) será no smoke staging do Plan 05.

## Env Vars Novas (precisam ser configuradas em Vercel + .env.local)

| Variable | Scope | Source | Notas |
|----------|-------|--------|-------|
| `UPSTASH_REDIS_REST_URL` | server | Upstash console — Redis DB → REST API | Requerida para ratelimit + brasilapi cache |
| `UPSTASH_REDIS_REST_TOKEN` | server | Upstash console (mesmo lugar) | Token READ_WRITE |
| `TURNSTILE_SECRET_KEY` | server | Cloudflare Turnstile dashboard → site secret | Sem ele, modo dev permissivo (verifyTurnstileToken retorna true) |
| `VITE_TURNSTILE_SITE_KEY` | client (build) | Cloudflare Turnstile dashboard → site key | Já consumida pelo TurnstileWidget (Plan 03) |

**NÃO commitar valores reais** — usar placeholders em `.env.example` se for criar.

## Exemplos de validação manual (curl)

```bash
# 1) Rate limit — 6ª requisição deve retornar 429
for i in 1 2 3 4 5 6; do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST http://localhost:3000/api/sessions/create \
    -H "Content-Type: application/json" \
    -H "x-forwarded-for: 1.2.3.4" \
    -d '{"empresa_nome":"Acme","cnpj":"11222333000181","turnstileToken":"x"}'
done
# Esperado: 201 201 201 201 201 429

# 2) Turnstile token inválido (com TURNSTILE_SECRET_KEY setado em prod)
curl -s -X POST http://localhost:3000/api/sessions/create \
  -H "Content-Type: application/json" \
  -d '{"empresa_nome":"Acme","cnpj":"11222333000181","turnstileToken":"invalid"}'
# Esperado: {"error":"captcha_failed"} status 403

# 3) CNPJ checksum inválido
curl -s -X POST http://localhost:3000/api/sessions/create \
  -H "Content-Type: application/json" \
  -d '{"empresa_nome":"Acme","cnpj":"11222333000180","turnstileToken":"x"}'
# Esperado: {"error":"invalid_payload","details":...} status 400

# 4) Validate-cnpj — lookup BrasilAPI (CNPJ inexistente)
curl -s -X POST http://localhost:3000/api/sessions/validate-cnpj \
  -H "Content-Type: application/json" \
  -d '{"cnpj":"00000000000000"}'
# Esperado: {"error":"invalid_payload"} (checksum) ou {"error":"cnpj_not_found"} (BrasilAPI)
```

## Commits

| # | Hash | Message |
|---|------|---------|
| 1 | `f29b803` | feat(01-04): utils ratelimit + turnstile + schemas identificacao (HARD-05/HARD-07) |
| 2 | `f715ce0` | feat(01-04): brasilapi util + validate-cnpj endpoint + harden create.ts (HARD-04/05/07) |
| 3 | `00e2fba` | feat(01-04): ProgressBar /5 + CNPJ inline validation + CI gate hard (HARD-05/HARD-06) |

## TODOs deixados para Plan 05 (Wave 4)

- **Aplicar migration RLS lock**: `supabase/migrations/<ts>_lock_rls_phase1.sql` reverte relax e recria policy `service_role only AS RESTRICTIVE` (HARD-08 + HARD-09)
- **Smoke staging end-to-end**: criar sessão real → preencher 3 deptos → fechar aba → magic link → finalizar (HARD-03 manual gate)
- **Email coluna em onboarding_sessions** + plug em `send-magic-link` real (`to: [...]`) — depende de migration adicional
- **Front: chamar `validate-cnpj` endpoint** com debounce em NovoOnboarding (botão "Validar com Receita") — UX win pra rejeitar CNPJ inativo cedo
- **Rate-limit em `/api/sessions/validate-cnpj`** quando ele entrar no fluxo público
- **WhatsApp + email inline validation** nas perguntas do dept Identificação (Onboarding.tsx) usando IdentificacaoSchema já pronto

## Self-Check: PASSED

- api/_lib/ratelimit.ts: FOUND
- api/_lib/ratelimit.test.ts: FOUND
- api/_lib/turnstile.ts: FOUND
- api/_lib/turnstile.test.ts: FOUND
- api/_lib/brasilapi.ts: FOUND
- api/_lib/brasilapi.test.ts: FOUND
- api/_lib/schemas/identificacao.ts: FOUND
- api/_lib/schemas/identificacao.test.ts: FOUND
- api/sessions/validate-cnpj.ts: FOUND
- api/sessions/create.ts: MODIFIED (ratelimit + turnstile + checksum)
- api/sessions/create.test.ts: MODIFIED (mocks + valid CNPJ)
- api/sessions/create.ratelimit.test.ts: FOUND
- api/_lib/schemas/session.ts: MODIFIED (CnpjSchema + turnstileToken default '')
- src/lib/cnpj.ts: FOUND
- src/lib/cnpj.test.ts: FOUND
- src/components/onboarding/ProgressBar.test.tsx: FOUND
- src/pages/OnboardingSession.tsx: MODIFIED (denominador 5 + progressPct)
- src/pages/NovoOnboarding.tsx: MODIFIED (validateCnpj inline + formatCnpj máscara)
- .github/workflows/ci.yml: MODIFIED (continue-on-error removido)
- Commit f29b803: FOUND
- Commit f715ce0: FOUND
- Commit 00e2fba: FOUND
- Vitest suite: 102 passed + 8 todo (110 total) ✅
- Audit script HARD-01: PASS exit 0 ✅
- npm run build: PASS exit 0 ✅
- @upstash/redis: INSTALLED (^1.38.0)
- @upstash/ratelimit: INSTALLED (^2.0.8)
