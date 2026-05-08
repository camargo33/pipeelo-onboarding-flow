---
phase: 01-hardening-server-side-persistence
plan: 03
subsystem: front-migration-api-client
tags: [hard-01, hard-02, hard-03, hard-07, wave-2, migrate-then-lock, autosave, turnstile, magic-link]
requires:
  - api-sessions-create
  - api-sessions-get
  - api-sessions-save-resposta
  - api-sessions-complete-department
  - vitest-config
  - audit-script-hard-01
provides:
  - api-client-sessionApi
  - api-client-adminSessionApi
  - useDebouncedAutosave-hook
  - turnstile-widget-component
  - admin-auth-helper
  - admin-endpoints-list-create-delete
  - audit-hard-01-green
affects:
  - src/pages/NovoOnboarding.tsx
  - src/pages/Onboarding.tsx
  - src/pages/OnboardingSession.tsx
  - src/pages/AdminOnboarding.tsx
  - api/_lib/supabase.ts
tech_stack:
  added:
    - "@marsidev/react-turnstile@^1.x (wrapper React Cloudflare Turnstile)"
  patterns:
    - "API client tipado em src/lib/api-client.ts com sessionApi (público) + adminSessionApi (Bearer JWT)"
    - "Per-question autosave debounced 500ms via hook controlado (cleanup + pagehide flush)"
    - "Magic link honored via useSearchParams('token') em todas as pages que tocam sessão"
    - "TurnstileWidget como render conditional baseado em VITE_TURNSTILE_SITE_KEY (modo dev permissivo sem siteKey)"
    - "Admin auth gate: Bearer JWT Supabase Auth validado via assertAdminUser (zero supabase.from no front)"
    - "vi.stubEnv para mockar import.meta.env em testes (Vitest 4 — não dá para mutar em runtime)"
key_files:
  created:
    - src/lib/api-client.ts
    - src/lib/api-client.test.ts
    - src/lib/debounced-save.ts
    - src/lib/debounced-save.test.ts
    - src/components/TurnstileWidget.tsx
    - src/components/TurnstileWidget.test.tsx
    - api/_lib/admin-auth.ts
    - api/admin/sessions-list.ts
    - api/admin/sessions-create.ts
    - api/admin/sessions-delete.ts
  modified:
    - src/pages/NovoOnboarding.tsx
    - src/pages/Onboarding.tsx
    - src/pages/OnboardingSession.tsx
    - src/pages/AdminOnboarding.tsx
    - src/lib/__stubs__.test.ts
    - package.json
    - package-lock.json
decisions:
  - "Migrar AdminOnboarding.tsx no escopo deste plan (Rule 3 — sem isso, audit script gate HARD-01 não fecha). Foram adicionados 3 endpoints admin minimais + helper de auth."
  - "Admin auth via JWT Supabase Auth Bearer token (ainda não há RBAC role-check — Phase 5 adiciona). Pre-Phase-1 também era 'qualquer usuário logado' via anon RLS, então não regride."
  - "Token pertinente em URL (?token=...): cookie HttpOnly seria ideal, mas requer mudança em todo flow magic link. Aceito como trade-off conhecido (Pitfall 3) com TTL 30d."
  - "Autosave verifica `v !== '' && v !== null` antes de chamar saveResposta — evita salvar respostas vazias toda vez que QuestionRenderer reseta state."
  - "Side-effects legacy (provision-tenant/sync-department/complete-onboarding/send-email) mantidos com keepalive:true. Phase 2 reescreve com outbox pattern."
  - "Cálculo de allDeptsCompleted no client pós-completeDepartment usa estado local atualizado em vez de re-fetch — evita round trip extra (consistência eventual aceita: tela de sucesso roda primeiro, side-effects depois)."
  - "Plan dizia para usar `src/hooks/useAutosave.ts`; o nome canônico do RESEARCH é `src/lib/debounced-save.ts` — escolhi RESEARCH (artifacts já apontavam para src/lib/debounced-save.ts no plan)."
  - "ProgressBar /4→/5 fix mantido para Plan 01-04 (HARD-06) conforme escopo explícito."
metrics:
  duration_minutes: 8
  tasks_completed: 3
  files_created: 10
  files_modified: 7
  commits: 3
  completed_date: 2026-05-08
  tests_added: 12
  tests_passing: 47
---

# Phase 01 Plan 03: Front Migration sessionApi + Autosave + Turnstile Summary

Migrou todas as 4 páginas que tocavam `supabase.from('onboarding_sessions'|'onboarding_respostas')` para consumir os endpoints `/api/sessions/*` (público) e novos `/api/admin/*` (Bearer JWT). Audit script HARD-01 fechou: exit 0. Plan habilita Wave 4 (Plan 05) RLS lockdown sem quebrar prod.

## Objective Recap

Wave 2 é o ponto crítico do migrate-then-lock (Pitfall 4). Sem migrar TODOS os call sites antes de apertar RLS, sessões em andamento quebram silenciosamente. Plan 03 entrega: api-client tipado, autosave debounced (HARD-02), TurnstileWidget client-side (HARD-07), magic link via `?token=` (HARD-03), e gate de audit (HARD-01) verde.

## What Was Built

### 1. Utilities (Task 1, commit `8ae540d`)

- `src/lib/api-client.ts`:
  - `sessionApi.{create,get,saveResposta,completeDepartment,sendMagicLink}` — fetch wrappers tipados com `keepalive:true` (crítico p/ autosave + tab close)
  - `adminSessionApi.{list,create,delete}` — variante autenticada com Bearer JWT
  - `ApiError` com status + code preservados do body
- `src/lib/debounced-save.ts`:
  - `useDebouncedAutosave(value, saver, delayMs=500, enabled)` — agenda saver, cancela em re-input, não duplica para mesmo valor (Object.is), flush em `pagehide`
- `src/components/TurnstileWidget.tsx`:
  - Wrapper de `@marsidev/react-turnstile` com `refreshExpired:'auto'` (Pitfall 5)
  - Sem `VITE_TURNSTILE_SITE_KEY` → render null + warn (modo dev permissivo)
- 12 testes Vitest cobrindo: 6 do api-client (querystring encoding, ApiError mapping, PUT body, code preservation), 4 do debounced-save (delay, cancel, dedupe, enabled=false), 2 do TurnstileWidget (null sem siteKey, render com siteKey)

### 2. NovoOnboarding + OnboardingSession (Task 2, commit `c534257`)

- `NovoOnboarding.tsx`:
  - Substitui POST `/api/create-session` legacy por `sessionApi.create`
  - Adiciona campo CNPJ obrigatório (14 dígitos) — UI mínima até Plan 04 (HARD-05) plugar BrasilAPI inline
  - Renderiza TurnstileWidget se siteKey presente; sem siteKey envia `turnstileToken=''` e o create.ts (Plan 04 fará verify) ainda aceita
  - Após sucesso navega para `/<slug>?token=<access_token>` (HARD-03 magic link)
  - Mapeia 409/403/429 para mensagens de toast específicas
- `OnboardingSession.tsx`:
  - Substitui `supabase.from('onboarding_sessions').select()` por `sessionApi.get(slug, token)`
  - `useSearchParams().get('token')` para honrar magic link
  - 401 → "Link inválido"; 410 → "Sessão expirou (>30 dias)"
  - Propaga `?token=` ao navegar para deptos internos
  - Audit progress: 9 → 8 ocorrências

### 3. Onboarding.tsx + AdminOnboarding.tsx (Task 3, commit `c1adc98`)

`Onboarding.tsx` (a refatoração mais complexa):

- `useSearchParams().get('token')` para auth de hidratação
- `sessionApi.get` substitui 2 supabase.from selects (session + respostas)
- Hidrata respostas locais via `setResposta(pergunta_id, valor)` no mount
- `useDebouncedAutosave(currentValue, saver, 500)` per-question — saver chama `sessionApi.saveResposta`
- Skips empty values (`v !== '' && v !== null`) para não spammar saves vazios
- `handleSubmit` substitui upsert direto + update por `sessionApi.completeDepartment`
- Calcula `allDeptsCompleted` a partir do estado local pós-conclusão (sem re-fetch)
- Side-effects legacy mantidos com `keepalive:true`
- 401/410 → toast erro; 403 (identification_gate) → toast + redirect para overview

`AdminOnboarding.tsx` (Rule 3 — necessário para fechar gate HARD-01):

- 3 endpoints novos: `/api/admin/sessions-list`, `/sessions-create`, `/sessions-delete`
- `api/_lib/admin-auth.ts` `assertAdminUser` — valida Bearer JWT do Supabase Auth via `auth.getUser(token)`
- `adminSessionApi.{list,create,delete}` envia `Authorization: Bearer <jwt>` automaticamente
- AdminOnboarding obtém JWT via `supabase.auth.getSession()` (auth client only — não toca onboarding_*)
- Mantém UX/AlertDialog/copyLink intactos; copyLink agora inclui `?token=` quando access_token presente

## Verification Results

| Check | Expected | Actual | Status |
|-------|----------|--------|--------|
| `node scripts/audit-no-supabase-from.mjs` | exit 0 | exit 0 ("PASS: zero supabase.from(onboarding_*) em src/") | **PASS — HARD-01 GATE FECHADO** |
| `npx vitest run src/lib/api-client.test.ts src/lib/debounced-save.test.ts src/components/TurnstileWidget.test.tsx` | 12 passed | 12 passed | PASS |
| `npm test -- --run` (full suite) | green | 47 passed + 9 todo + 3 skipped (14 files) | PASS |
| `npm run build` | exit 0 | exit 0 (3.59s, 745kb gzip 226kb) | PASS |
| Audit count Wave 2 | 9 → 0 | 9 → 8 (Task 2) → 4 (Task 3a) → 0 (Task 3b) | PASS |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocker] AdminOnboarding.tsx fora do escopo declarado mas bloqueia gate HARD-01**

- **Found during:** Task 2 verificação inicial
- **Issue:** Plan 01-03 lista apenas Onboarding/OnboardingSession/NovoOnboarding nos `files_modified`, mas `scripts/audit-no-supabase-from.mjs` reporta 4 ocorrências em `AdminOnboarding.tsx`. Sem migrar AdminOnboarding, o success criterion explícito do plan (`audit script HARD-01 retorna exit 0`) não passa. Wave 4 (Plan 05) RLS lock quebraria a tela admin.
- **Fix:**
  - Criados 3 endpoints `/api/admin/sessions-{list,create,delete}` com helper `assertAdminUser` validando Bearer JWT do Supabase Auth
  - `adminSessionApi` adicionado ao `src/lib/api-client.ts`
  - `AdminOnboarding.tsx` migrado para usar `adminSessionApi` + `supabase.auth.getSession()` apenas para extrair JWT
- **Files modified:** `api/_lib/admin-auth.ts` (novo), `api/admin/sessions-list.ts` (novo), `api/admin/sessions-create.ts` (novo), `api/admin/sessions-delete.ts` (novo), `src/lib/api-client.ts`, `src/pages/AdminOnboarding.tsx`
- **Commit:** `c1adc98`

**2. [Rule 3 - Test Infra] `vi.stubEnv` em vez de mutar `import.meta.env` direto**

- **Found during:** Task 1 RED phase
- **Issue:** Vite com SWC plugin resolve `import.meta.env.VITE_TURNSTILE_SITE_KEY` para string literal em build time quando ausente, ignorando mutações runtime de `import.meta.env`. Teste falhava com "Unable to find element by data-testid".
- **Fix:** Trocado o pattern `(import.meta as ...).env.X = 'val'` por `vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'val')` + `vi.unstubAllEnvs()` em `afterEach`. Funciona com Vitest 4 e respeita o modo build.
- **Files modified:** `src/components/TurnstileWidget.test.tsx`
- **Commit:** `8ae540d`

### Minor Adjustments

**3. CNPJ adicionado em NovoOnboarding antes de Plan 04**

- O endpoint `/api/sessions/create` já exige CNPJ via `CreateSessionSchema` (14 dígitos). UI sem o campo causaria 400 invalid_payload em runtime. Adicionei input simples (sem máscara nem validação BrasilAPI) — Plan 04 (HARD-05) plugará feedback inline + lookup BrasilAPI.

**4. ProgressBar `/4` → `/5` adiado para Plan 04 conforme escopo**

- O `<objective>` do plan dizia "progress 5/5 (preview, fix completo no Plan 04)". Mantive o cálculo `/4` em OnboardingSession.tsx — fix é HARD-06 (Plan 01-04). Plan 03 não introduz regressão visual.

**5. Onboarding.tsx hidrata respostas via `setResposta` em loop**

- `useOnboarding` hook não expõe um helper para hidratar bulk. O loop com `setResposta` por resposta dispara N re-renders no mount (impacto baixo: max ~50 perguntas/depto). Otimização possível: adicionar `hydrateRespostas(map)` ao hook em Plan 04. Não bloqueia.

**6. Token na querystring em vez de header**

- `sessionApi.get` envia token no querystring (espelhando o contrato server-side `Query.parse({ slug, token })`). Token em URL é o trade-off conhecido do magic link (Pitfall 3) — TTL 30d + flow de "reenviar link" mitigam.

## Auth Gates

Nenhum encontrado. Plan rodou inteiramente local: vitest verde, build verde, audit verde. Verificação visual ficará em Plan 05 staging smoke.

## Commits

| # | Hash | Message |
|---|------|---------|
| 1 | `8ae540d` | feat(01-03): api-client + useDebouncedAutosave + TurnstileWidget utils |
| 2 | `c534257` | feat(01-03): NovoOnboarding + OnboardingSession via sessionApi (HARD-01) |
| 3 | `c1adc98` | feat(01-03): Onboarding + AdminOnboarding via sessionApi (HARD-01 closed) |

## TODOs deixados para Plan 04 (Wave 3)

- **HARD-05 inline CNPJ**: `NovoOnboarding.tsx` aceita CNPJ raw; Plan 04 adiciona máscara + lookup BrasilAPI + validação Zod com feedback inline (toast → field-level)
- **HARD-07 server-side**: `api/sessions/create.ts` ainda tem `// TODO Wave 3: rate-limit + verifyTurnstileToken` — implementar Upstash slidingWindow + Cloudflare siteverify
- **HARD-04 sync UI gate**: hoje gate só vive em `OnboardingSession.startDepartment`; Plan 04 deve replicar o feedback "Identificação primeiro" como banner/badge global e cobrir 403 do servidor com mensagem alinhada
- **HARD-06 ProgressBar `/4`→`/5`**: `OnboardingSession.tsx` ainda calcula `completedCount/4`; Plan 04 corrige denominador
- **email coluna sessions**: necessária para `send-magic-link` real (`to:[]` placeholder hoje)
- **CI gate hard**: `.github/workflows/ci.yml` ainda tem `continue-on-error: true` no audit step. Agora que está verde, remover em Plan 04 ou Plan 05 para travar HARD-01 como gate de PR.

## Self-Check: PASSED

- src/lib/api-client.ts: FOUND
- src/lib/api-client.test.ts: FOUND
- src/lib/debounced-save.ts: FOUND
- src/lib/debounced-save.test.ts: FOUND
- src/components/TurnstileWidget.tsx: FOUND
- src/components/TurnstileWidget.test.tsx: FOUND
- api/_lib/admin-auth.ts: FOUND
- api/admin/sessions-list.ts: FOUND
- api/admin/sessions-create.ts: FOUND
- api/admin/sessions-delete.ts: FOUND
- src/pages/NovoOnboarding.tsx: MODIFIED (sessionApi + Turnstile + CNPJ + ?token= redirect)
- src/pages/OnboardingSession.tsx: MODIFIED (sessionApi.get + ?token= read)
- src/pages/Onboarding.tsx: MODIFIED (autosave + sessionApi.completeDepartment + keepalive)
- src/pages/AdminOnboarding.tsx: MODIFIED (adminSessionApi + Bearer JWT)
- Commit 8ae540d: FOUND
- Commit c534257: FOUND
- Commit c1adc98: FOUND
- Audit script HARD-01: PASS exit 0
- Vitest suite: 47 passed + 9 todo
- npm run build: PASS exit 0
