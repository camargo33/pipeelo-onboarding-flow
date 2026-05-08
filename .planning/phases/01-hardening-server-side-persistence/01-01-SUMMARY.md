---
phase: 01-hardening-server-side-persistence
plan: 01
subsystem: api-sessions-server-side
tags: [hard-01, hard-02, hard-03, hard-04, wave-1, service-role, magic-link, identification-gate]
requires:
  - vitest-config
  - test-helpers
provides:
  - api-sessions-create
  - api-sessions-get
  - api-sessions-save-resposta
  - api-sessions-complete-department
  - api-sessions-send-magic-link
  - auth-session-helper
  - zod-schemas-session-resposta
affects:
  - api/_lib/supabase.ts
  - package.json
tech_stack:
  added:
    - "nanoid@^5.x (slug 12 + access_token 32 URL-safe)"
  patterns:
    - "Service-role only em /api/sessions/* (bypass RLS, base do migrate-then-lock)"
    - "Magic link via token opaco custom (TTL 30d) — NÃO Supabase signInWithOtp (24h hard cap)"
    - "Upsert idempotente onConflict(session_id,departamento,pergunta_id) para autosave"
    - "Identification gate enforced server-side com 403 identification_gate"
    - "HttpError 401/410/500 + ZodError 400 + 405 method-not-allowed coerentes em todos endpoints"
    - "TDD RED→GREEN por handler: testes referenciam contratos antes da implementação"
key_files:
  created:
    - api/_lib/auth-session.ts
    - api/_lib/auth-session.test.ts
    - api/_lib/schemas/session.ts
    - api/_lib/schemas/resposta.ts
    - api/sessions/create.ts
    - api/sessions/create.test.ts
    - api/sessions/get.ts
    - api/sessions/get.test.ts
    - api/sessions/save-resposta.ts
    - api/sessions/save-resposta.test.ts
    - api/sessions/save-resposta.idempotency.test.ts
    - api/sessions/complete-department.ts
    - api/sessions/complete-department.test.ts
    - api/sessions/send-magic-link.ts
  modified:
    - api/_lib/supabase.ts
    - package.json
    - package-lock.json
decisions:
  - "Alias getServiceSupabase = requireSupabase em api/_lib/supabase.ts (evita rename de endpoints legacy)"
  - "send-magic-link expõe to:[] como placeholder + link_preview em dev/preview até Plan 04 adicionar coluna email"
  - "Turnstile + rate-limit em create.ts ficam como TODO Wave 3 (Plan 04) — schema CreateSessionSchema já aceita turnstileToken"
  - "Endpoints legacy (api/create-session.ts) intactos — coexistem durante migração Wave 2 (Plan 03)"
  - "Idempotency contractual validada via spy em mock.calls do upsert (mesmo onConflict + payload em chamadas 2x)"
metrics:
  duration_minutes: 4
  tasks_completed: 3
  files_created: 14
  files_modified: 3
  commits: 3
  completed_date: 2026-05-08
  tests_added: 28
  tests_passing: 28
---

# Phase 01 Plan 01: Endpoints /api/sessions/* + Auth Helper Summary

Construiu 5 endpoints `/api/sessions/*` com service-role + helper `assertSessionAccess` (TTL 30d) + 3 schemas Zod, cobrindo HARD-01 (server-side I/O), HARD-02 (autosave endpoint), HARD-03 (magic link via token opaco) e HARD-04 (identification gate enforced).

## Objective Recap

Wave 1 backend: pré-condição inegociável da migração de front (Wave 2 — Plan 03). Sem endpoints funcionais, qualquer ordem de operações no migrate-then-lock (Pitfall 4) quebra prod. Plan estabelece os contratos que `src/lib/api-client.ts` consumirá em Wave 2.

## What Was Built

### 1. Auth Helper + HttpError (Task 1, commit `74573b4`)
- `api/_lib/auth-session.ts`:
  - `assertSessionAccess(slug, token)` — 401 invalid_session / 410 session_expired / 500 db / retorna SessionRow
  - `HttpError` extends Error com `status` numérico
  - `TTL_DAYS = 30` exportado
- `api/_lib/schemas/session.ts`: `SlugTokenSchema` (`token >= 16 chars`), `CreateSessionSchema` (CNPJ regex 14 dígitos)
- `api/_lib/schemas/resposta.ts`: `DEPARTAMENTOS` const, `SaveRespostaSchema`, `CompleteDepartmentSchema`
- 6 testes Vitest (TTL boundary, 401, 410, HttpError contract)

### 2. create + get + save-resposta (Task 2, commit `5d1a974`)
- `api/sessions/create.ts`: nanoid(12) slug + nanoid(32) token, insert com 5 status_*=pendente, 23505 → 409
- `api/sessions/get.ts`: `assertSessionAccess` + select respostas + **strip access_token** do response
- `api/sessions/save-resposta.ts`: upsert com `onConflict: 'session_id,departamento,pergunta_id'`, retorna `{ ok, saved_at }`
- 16 testes (happy/sad paths + idempotency contractual)

### 3. complete-department (gate) + send-magic-link (Task 3, commit `1b07d90`)
- `api/sessions/complete-department.ts`:
  - `GATED = ['sac_geral','financeiro','suporte','vendas']`
  - 403 `identification_gate` se `dept ∈ GATED && status_identificacao !== 'concluido'`
  - update dinâmico `status_<dept>='concluido' + responsavel_<dept> + concluido_<dept>_at`
- `api/sessions/send-magic-link.ts`:
  - busca session por slug → 404 se não existe
  - URL `${ONBOARDING_BASE}/${slug}?token=${access_token}`
  - dispara Resend se `RESEND_API_KEY` presente; `to:[]` por ora (email no Plan 04)
  - retorna `link_preview` em não-prod (debug)
- 6 testes cobrindo 3 cenários do gate + 400/405 + payload do update

## Verification Results

| Check | Expected | Actual | Status |
|-------|----------|--------|--------|
| `npx vitest run api/_lib/auth-session.test.ts` | green | 6 passed | PASS |
| `npx vitest run api/sessions/create|get|save-resposta(.idempotency)?.test.ts` | green | 16 passed | PASS |
| `npx vitest run api/sessions/complete-department.test.ts` | green | 6 passed | PASS |
| `npx vitest run` (full suite) | green | 35 passed + 13 todo + 3 skipped | PASS |
| `ls api/sessions/*.ts` | 5 endpoints + 4 testes + stub | 5 endpoints + 5 test files | PASS |
| `cat package.json | grep nanoid` | presente | `"nanoid"` em dependencies | PASS |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocker] `getServiceSupabase` não existia em `api/_lib/supabase.ts`**
- **Found during:** Task 1
- **Issue:** Helper `api/_lib/supabase.ts` exportava apenas `requireSupabase`, mas todo o plan 01-01 referencia `getServiceSupabase` (nome canônico da pesquisa). Renomear a função quebraria endpoints legacy (`api/complete-onboarding.ts`, etc).
- **Fix:** Adicionei alias `export const getServiceSupabase = requireSupabase` no fim de `api/_lib/supabase.ts`. Mantém zero impacto em legacy + dá nome canônico para Wave 1+.
- **Files modified:** `api/_lib/supabase.ts`
- **Commit:** `74573b4`

### Minor Adjustments

**2. Mock import inclui `requireSupabase` além de `getServiceSupabase`**
- Em todos os `vi.mock('../_lib/supabase', ...)` declarei ambos os exports para evitar Vitest reclamar de "named export not found" caso algum import indireto puxe `requireSupabase`. Custo zero, apenas defensivo.

**3. Tests com `as never` em vez de `as any`**
- Vitest 4 + TS strict torcem o nariz pra `as any`. Substituí por `as never` no segundo argumento do `invokeHandler` (cast legítimo pq o handler real espera `VercelRequest/Response`, mas aqui passamos mock fluente).
- Funcionalmente idêntico, só passa lint mais limpo.

## Auth Gates

Nenhum encontrado. Todo o Wave 1 é local (mock Supabase, sem Resend real, sem DB real).

## Commits

| # | Hash | Message |
|---|------|---------|
| 1 | `74573b4` | feat(01-01): auth helper assertSessionAccess + Zod schemas (TTL 30d) |
| 2 | `5d1a974` | feat(01-01): endpoints create + get + save-resposta com service-role |
| 3 | `1b07d90` | feat(01-01): complete-department gate + send-magic-link endpoints |

## Contracts (para Wave 2 consumir em src/lib/api-client.ts)

```typescript
// POST /api/sessions/create
//   body: { empresa_nome: string, cnpj: string(14d), turnstileToken: string }
//   201: { slug: string, access_token: string }
//   400 invalid_payload | 409 cnpj_already_exists | 405

// GET /api/sessions/get?slug=&token=
//   200: { session: SessionPublic (sem access_token), respostas: [{departamento, pergunta_id, valor, updated_at}] }
//   400 invalid_payload | 401 invalid_session | 410 session_expired | 405

// PUT /api/sessions/save-resposta
//   body: { slug, token, departamento ∈ DEPARTAMENTOS, pergunta_id, valor: unknown }
//   200: { ok: true, saved_at: ISOString }
//   400 | 401 | 410 | 405 | 500

// POST /api/sessions/complete-department
//   body: { slug, token, departamento, responsavel_nome }
//   200: { ok: true }
//   403: { error: 'identification_gate' } se dept ∈ {sac_geral,financeiro,suporte,vendas} e status_identificacao !== 'concluido'
//   400 | 401 | 410 | 405 | 500

// POST /api/sessions/send-magic-link
//   body: { slug }
//   200: { ok: true, link_preview?: string (apenas dev/preview) }
//   404 session_not_found | 400 | 405
```

## Next Steps

- **Plan 01-02 (Wave 1, paralelo):** IDV 2026 (tokens Tailwind + Inter + logo SVG)
- **Plan 01-03 (Wave 2, depende deste + 01-02):** Migrar `Onboarding.tsx`, `OnboardingSession.tsx`, `NovoOnboarding.tsx` para usar `sessionApi` em vez de `supabase.from(onboarding_*)`. Audit script deve retornar exit 0 ao final.
- **Plan 01-04 (Wave 3):** Adicionar rate-limit Upstash + Cloudflare Turnstile verify em `create.ts` (TODO marcado inline). Adicionar email no schema Identificação para destravar `to: [...]` real em send-magic-link.
- **Plan 01-05 (Wave 4):** RLS lock migration + smoke staging. Após audit green: remover `continue-on-error: true` do CI.

## Self-Check: PASSED

- api/_lib/auth-session.ts: FOUND
- api/_lib/auth-session.test.ts: FOUND
- api/_lib/schemas/session.ts: FOUND
- api/_lib/schemas/resposta.ts: FOUND
- api/sessions/create.ts: FOUND
- api/sessions/create.test.ts: FOUND
- api/sessions/get.ts: FOUND
- api/sessions/get.test.ts: FOUND
- api/sessions/save-resposta.ts: FOUND
- api/sessions/save-resposta.test.ts: FOUND
- api/sessions/save-resposta.idempotency.test.ts: FOUND
- api/sessions/complete-department.ts: FOUND
- api/sessions/complete-department.test.ts: FOUND
- api/sessions/send-magic-link.ts: FOUND
- Commit 74573b4: FOUND
- Commit 5d1a974: FOUND
- Commit 1b07d90: FOUND
