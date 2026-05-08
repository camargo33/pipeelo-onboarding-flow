# Phase 1: Hardening + Server-Side Persistence — Research

**Researched:** 2026-05-08
**Domain:** Server-side hardening (RLS lockdown + service-role API), autosave/resume UX, identification gate, anti-abuse (rate limit + Turnstile + BrasilAPI), IDV 2026
**Confidence:** HIGH (todos os padrões críticos verificados em docs oficiais Vercel/Supabase/Cloudflare/Upstash + STACK.md/PITFALLS.md já consolidados na pesquisa cross-phase)

## Summary

Phase 1 fecha um leak ATIVO de PII em produção: `onboarding_sessions` e `onboarding_respostas` estão com RLS afrouxado pra `anon` (migration `20260419120000_relax_rls_for_testing.sql`), expondo CNPJ + financeiro + planos comerciais de TODAS as ISPs via anon key publicada no bundle JS. O caminho seguro é uma sequência rígida **migrate-then-lock**: criar todos os endpoints `/api/sessions/*` com service-role, migrar todos os call sites do front, validar em staging com sessão real, e SÓ ENTÃO rodar a migration de aperto. Em paralelo (não-bloqueante) se entrega autosave debounced 500ms, magic link `?session=slug&token=access_token` (token opaco já existe no schema, basta usar), identification gate enforced no servidor, BrasilAPI pra validar CNPJ, rate limit Upstash + Cloudflare Turnstile em `/api/create-session`, e IDV 2026 (paleta Forest Floor `#000D0A` + accent `#01d5ac`, Inter, logo correto).

Schema atual já tem o que precisamos: `onboarding_sessions.access_token` (opaco, gerado server-side), `cnpj` UNIQUE, `tenant_id`, status por departamento. A policy correta `service_role only AS RESTRICTIVE` já existe — basta reverter a hotfix de relax.

**Primary recommendation:** Sequência inegociável **(1) endpoints → (2) front migrado → (3) audit `grep supabase.from src/` = 0 → (4) deploy staging + smoke test sessão real → (5) RLS lock migration**. Sem essa ordem, sessões em andamento quebram silenciosamente. Magic link via **token opaco custom** (já no schema, `access_token`) — NÃO Supabase Auth `signInWithOtp` (TTL máx 24h, conflita com nossos 30 dias e adiciona complexidade Auth desnecessária pra fluxo público sem login).

---

## User Constraints

> CONTEXT.md não foi gerado para esta phase (fluxo `/gsd:plan-phase` direto, sem `/gsd:discuss-phase`). Constraints derivam dos requirements e da ROADMAP.md.

### Locked Decisions (do ROADMAP + STATE)
- **Manter Vite + React** — sem migração para Next.js (custo não justifica)
- **Vercel Functions Node** (não Edge) — `@anthropic-ai/sdk` e libs Node-nativas
- **Supabase próprio** (não Lovable Cloud) — já migrado
- **Magic link com TTL 30 dias** (HARD-03) — diferente do TTL 72h dos emails de credenciais (Phase 5)
- **IDV 2026:** Forest Floor `#000D0A` + accent `#01d5ac`, Inter, dark-first
- **5 departamentos** (Identificação como dept 1) — bug atual `4/4` no progress é parte do escopo
- **Cloudflare Turnstile** (não hCaptcha/reCAPTCHA) — STACK.md prescritivo
- **BrasilAPI** primeiro, ReceitaWS como fallback (Pitfall 9)
- **Upstash Redis + @upstash/ratelimit** — único caminho rate-limit em Vercel Functions (sem TCP persistente)

### Claude's Discretion
- Estrutura interna de `/api/sessions/*` (1 file por verb vs router único) — recomendação abaixo
- Nome do helper compartilhado (`api/_lib/sessions.ts` vs `api/_lib/persistence.ts`)
- Estratégia de autosave (`useDebouncedCallback` custom vs `useDebounce` lib) — recomendação abaixo
- Como expor erro de validação CNPJ pro UI (toast vs inline) — recomendação inline (HARD-05)
- Gerador de `access_token` (`crypto.randomUUID()` vs `nanoid` 32 chars) — `nanoid(32)` URL-safe

### Deferred Ideas (OUT OF SCOPE)
- OTP WhatsApp como gate (REQUIREMENTS Out of Scope)
- Multi-tab conflict resolution (v2 — MULTI-03)
- Real-time presence (v2 — MULTI-02)
- Mobile polish específico (v2 — MOBI-01..02)

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| HARD-01 | Zero `supabase.from()` em `src/` — server-side em `/api/sessions/*` | Padrão "service-role only" — `api/_lib/supabase.ts` com `getServiceSupabase()`, browser usa `fetch('/api/sessions/...')`. Audit script `grep` no CI. |
| HARD-02 | Per-question autosave debounced 500ms | `useDebouncedCallback(saveResposta, 500)`; PUT idempotente em `/api/sessions/save-resposta` com `version` por depto (Pitfall 8 optimistic lock). |
| HARD-03 | Magic link resume (slug + access_token, TTL 30 dias) | Token opaco `nanoid(32)` já no schema — gerar em `create-session`, expirar via `created_at + 30d` validado server-side. NÃO Supabase Auth (TTL máx 24h hard cap). |
| HARD-04 | Identification gate (CNPJ + email + WhatsApp validados) | Server-side enforced: `/api/sessions/start-department` rejeita 403 se `status_identificacao != 'concluido'`. UI replica feedback. |
| HARD-05 | Validações inline (CNPJ BrasilAPI, email RFC 5322, WhatsApp E.164 BR) | Zod schemas em `api/_lib/schemas/identificacao.ts`. CNPJ via `https://brasilapi.com.br/api/cnpj/v1/{cnpj}` com cache 24h (Pitfall 9). |
| HARD-06 | Progress bar `X/5` (Identificação como dept 1) | `DEPARTMENT_ORDER.length` em `OnboardingSession.tsx`. Bug atual: hardcoded `/4`. |
| HARD-07 | Rate limit 5/IP/min em `/api/create-session` + Turnstile | `@upstash/ratelimit slidingWindow(5, '1 m')` + verify token via `https://challenges.cloudflare.com/turnstile/v0/siteverify`. |
| HARD-08 | RLS restrita reaplicada (reverte relax) | Migration nova `<ts>_lock_rls_after_migration.sql` recria policy `service_role only AS RESTRICTIVE` (já existia em `20260419000000`). |
| HARD-09 | Anon key não pode ler/escrever em `onboarding_sessions` | Teste integração: cliente anon → `select` retorna 0 / `insert` retorna `permission denied`. |
| HARD-10 | IDV 2026 oficial | Tokens Tailwind `forest-floor: #000D0A`, `lime-accent: #01d5ac`, fonte Inter via `@fontsource/inter`, logo SVG. Independente de HARD-01..09 (paralelizável). |

---

## Standard Stack

### Core (ADD obrigatório nesta phase)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@upstash/redis` | `^1.x` | Cliente Redis HTTP serverless | Único caminho viável em Vercel Functions Node (sem TCP persistente). STACK.md prescritivo. |
| `@upstash/ratelimit` | `^2.0.8` | Rate limiting `slidingWindow` | Lib oficial Upstash, suporta `Ratelimit.slidingWindow(5, '1 m')` exatamente como pedido em HARD-07. |
| `nanoid` | `^5.x` | Token opaco URL-safe (`access_token`, idempotency keys) | Mais curto que UUID, alfabeto URL-safe por padrão. |
| `@fontsource/inter` | latest | Self-host Inter (IDV 2026) | Evita FOUT de Google Fonts + alinha com privacy-first Pipeelo. |
| `escape-html` | `^1.x` | Escape de `empresa_nome` em emails (CONCERNS) | Bug XSS já flagged em `send-email.ts:209`. |

### Supporting (já no projeto, usar mais agressivamente)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zod` | `3.25.x` (já) | Validação payloads `/api/sessions/*` | Schema único em `api/_lib/schemas/` (CNPJ, email, WhatsApp E.164). |
| `@supabase/supabase-js` | `2.90.x` (já) | Service-role server-side | `getServiceSupabase()` cacheado em `api/_lib/supabase.ts`. |
| `@tanstack/react-query` | `5.83.x` (já, mas subutilizado) | Cliente HTTP no browser | Substituir `supabase.from()` direto por `useQuery`/`useMutation` chamando `/api/sessions/*`. |
| `react-hook-form` + `zod` resolver | já | Validação inline de CNPJ/email/WhatsApp | HARD-05 — feedback inline. |

### NOT to add (anti-pattern para esta phase)
| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `supabase.auth.signInWithOtp` p/ magic link | TTL máx 24h hard cap (Supabase docs); conflita com HARD-03 (30 dias). Adiciona complexidade Auth pra fluxo sem login. | Token opaco `access_token` custom (já no schema) + validação server-side TTL. |
| `next-rate-limit` | Next-only | `@upstash/ratelimit` |
| Rate limit em memória | Vercel cada instância tem memória própria | `@upstash/ratelimit` (Redis HTTP) |
| `crypto.randomUUID()` p/ access_token | OK funcionalmente mas inclui `-` (URL-safe sim, legibilidade pior) | `nanoid(32)` |
| ReceitaWS como primary | Rate limit 3 req/min sem auth, instável | BrasilAPI primary, ReceitaWS fallback |
| hCaptcha / reCAPTCHA | Custo + UX pior em mobile | Cloudflare Turnstile |
| `localStorage` p/ rascunho de respostas | UX dual com servidor; conflitos multi-tab | Server is source of truth, autosave debounced |

### Installation
```bash
npm install @upstash/redis @upstash/ratelimit nanoid @fontsource/inter escape-html
npm install -D @types/escape-html vitest @vitest/ui @testing-library/react @testing-library/jest-dom jsdom supertest
```

Env vars novas (Vercel + `.env.local`):
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- `TURNSTILE_SITE_KEY` (público — vai no front via `VITE_TURNSTILE_SITE_KEY`)
- `TURNSTILE_SECRET_KEY` (server-only)

---

## Architecture Patterns

### Recommended Project Structure (deltas Phase 1)
```
api/
├── _lib/
│   ├── supabase.ts                   # já existe — service-role cacheado
│   ├── ratelimit.ts                  # NOVO — Ratelimit.slidingWindow + Redis.fromEnv()
│   ├── turnstile.ts                  # NOVO — verifyTurnstileToken(token, ip)
│   ├── brasilapi.ts                  # NOVO — fetchCnpj(cnpj) com cache (Redis 24h)
│   ├── auth-session.ts               # NOVO — assertSessionAccess(slug, token) → SessionRow | 401
│   └── schemas/
│       ├── identificacao.ts          # NOVO — Zod (cnpj, email, whatsapp E.164)
│       ├── resposta.ts               # NOVO — Zod (pergunta_id, valor, version)
│       └── session.ts                # NOVO — slug+token request shape
├── sessions/
│   ├── create.ts                     # POST /api/sessions/create — Turnstile + ratelimit + nanoid token
│   ├── get.ts                        # GET  /api/sessions/get?slug=&token= — auth + return state
│   ├── save-resposta.ts              # PUT  /api/sessions/save-resposta — debounced autosave
│   ├── complete-department.ts        # POST /api/sessions/complete-department — gate enforce
│   ├── send-magic-link.ts            # POST /api/sessions/send-magic-link — Resend com slug+token
│   └── validate-cnpj.ts              # POST /api/sessions/validate-cnpj — proxy BrasilAPI
└── (legacy — manter durante migração)
    ├── create-session.ts             # DEPRECATE após cutover (espelhar para new path)
    ├── provision-tenant.ts           # mantido — Phase 1 não toca
    ├── sync-department.ts            # mantido
    ├── complete-onboarding.ts        # mantido
    └── send-email.ts                 # FIX XSS (escape-html)

src/
├── lib/
│   ├── api-client.ts                 # NOVO — fetch wrappers tipados pra /api/sessions/*
│   └── debounced-save.ts             # NOVO — useDebouncedAutosave hook
├── hooks/
│   └── useOnboarding.ts              # REFATORAR — remover supabase.from(), usar api-client
├── pages/
│   ├── Onboarding.tsx                # REFATORAR — autosave per-question + remove fire-and-forget
│   ├── OnboardingSession.tsx         # REFATORAR — gate enforce + progress 5/5
│   └── NovoOnboarding.tsx            # REFATORAR — Turnstile widget + validação inline
├── components/
│   ├── TurnstileWidget.tsx           # NOVO
│   └── onboarding/
│       └── ProgressBar.tsx           # FIX /4 → /5
├── styles/
│   └── theme.ts                      # NOVO — tokens IDV 2026 centralizados
└── assets/
    └── pipeelo-logo-2026.svg         # NOVO — substitui PNG legado

supabase/migrations/
└── <YYYYMMDDHHmmss>_lock_rls_phase1.sql   # NOVO — reverte relax + recria service_role only
```

### Pattern 1: Migrate-Then-Lock (Pitfall 4 — INEGOCIÁVEL)

**What:** Sequência rígida que evita quebrar sessões em andamento ao reapertar RLS.

**When to use:** Sempre que migrar de "anon RLS aberto" para "service-role only" em prod com tráfego ativo.

**Steps (gate de validação entre cada um):**

1. **Implementar TODOS os endpoints `/api/sessions/*` em paralelo** (anon RLS ainda aberto — endpoints funcionam pq service-role ignora RLS).
2. **Migrar TODOS os call sites do front** — substituir `supabase.from('onboarding_sessions')` / `onboarding_respostas` por `fetch('/api/sessions/...')`.
3. **Audit gate:** `grep -r "supabase.from(['\"]onboarding" src/` → DEVE retornar 0. CI bloqueia merge se != 0.
4. **Deploy staging + smoke test:** sessão completa real (criar → preencher 3 deptos → fechar aba → magic link → finalizar). Se passar → seguir.
5. **Aplicar migration de lock** (`<ts>_lock_rls_phase1.sql`):
   ```sql
   DROP POLICY IF EXISTS "public read sessions"   ON public.onboarding_sessions;
   DROP POLICY IF EXISTS "public insert sessions" ON public.onboarding_sessions;
   DROP POLICY IF EXISTS "public update sessions" ON public.onboarding_sessions;
   DROP POLICY IF EXISTS "public read respostas"   ON public.onboarding_respostas;
   DROP POLICY IF EXISTS "public insert respostas" ON public.onboarding_respostas;
   DROP POLICY IF EXISTS "public update respostas" ON public.onboarding_respostas;

   CREATE POLICY "service_role only" ON public.onboarding_sessions
     AS RESTRICTIVE FOR ALL TO anon, authenticated
     USING (false) WITH CHECK (false);

   CREATE POLICY "service_role only" ON public.onboarding_respostas
     AS RESTRICTIVE FOR ALL TO anon, authenticated
     USING (false) WITH CHECK (false);
   ```
6. **Rollback ready:** SQL reverso pronto em script `scripts/rollback-rls.sql` (recreate "public *" policies). Aplicável em <5min.
7. **Pós-lock smoke test:** rodar mesma sessão de teste de novo. Se falhar → rollback imediato + investigar grep miss.

**Code:**
```typescript
// scripts/audit-no-supabase-from.ts (CI gate)
import { execSync } from 'node:child_process';
const out = execSync('grep -rE "supabase\\.from\\([\\\"\\']onboarding" src/ || true').toString();
if (out.trim().length > 0) {
  console.error('FAIL: supabase.from() em src/ — Phase 1 HARD-01 violado:\n' + out);
  process.exit(1);
}
console.log('PASS: zero supabase.from(onboarding*) em src/');
```

### Pattern 2: Magic Link Custom Token (HARD-03)

**What:** Token opaco `access_token` (já existe no schema!) + validação server-side com TTL 30 dias.

**Why custom (não Supabase Auth):** Supabase `signInWithOtp` tem TTL máx 24h hard cap (`docs/auth-email-passwordless`). Para 30 dias precisamos token próprio.

**Schema (já existe, validar):**
```sql
-- onboarding_sessions já tem:
--   slug TEXT (URL part)
--   access_token TEXT (opaque)
--   created_at TIMESTAMPTZ
-- Phase 1 ADD nada de schema, só usa.
```

**Server-side validation:**
```typescript
// api/_lib/auth-session.ts
import { getServiceSupabase } from './supabase';

const TTL_DAYS = 30;

export async function assertSessionAccess(slug: string, token: string) {
  const supabase = getServiceSupabase();
  const { data: session, error } = await supabase
    .from('onboarding_sessions')
    .select('*')
    .eq('slug', slug)
    .eq('access_token', token)
    .single();

  if (error || !session) {
    throw new HttpError(401, 'invalid_session');
  }
  const ageDays = (Date.now() - new Date(session.created_at).getTime()) / 86_400_000;
  if (ageDays > TTL_DAYS) {
    throw new HttpError(410, 'session_expired'); // 410 Gone
  }
  return session;
}
```

**Magic link email body (Phase 5 implementa, Phase 1 expõe endpoint):**
```
https://onboarding.pipeelo.com/<slug>?token=<access_token>
```

### Pattern 3: Per-Question Autosave Debounced (HARD-02)

**What:** Cada keystroke/change agenda PUT `/api/sessions/save-resposta` em 500ms. Cancela e re-agenda se houver novo input antes do timer.

**Hook (recomendação):**
```typescript
// src/lib/debounced-save.ts
import { useEffect, useRef } from 'react';

export function useDebouncedAutosave<T>(
  value: T,
  saver: (v: T) => Promise<void>,
  delayMs = 500
) {
  const lastSavedRef = useRef<T | undefined>(undefined);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (Object.is(value, lastSavedRef.current)) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        await saver(value);
        lastSavedRef.current = value;
      } catch (e) {
        console.error('[autosave] failed', e);
        // toast retry — não perdemos input pq value ainda está em state
      }
    }, delayMs);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [value, saver, delayMs]);
}
```

**Endpoint upsert idempotente (já é o pattern em uso):**
```typescript
// api/sessions/save-resposta.ts
const Schema = z.object({
  slug: z.string(),
  token: z.string(),
  departamento: z.enum(['identificacao','sac_geral','financeiro','suporte','vendas']),
  pergunta_id: z.string(),
  valor: z.unknown(),
  client_updated_at: z.string().datetime(), // optimistic concurrency hint
});

export default async function handler(req, res) {
  const body = Schema.parse(req.body);
  const session = await assertSessionAccess(body.slug, body.token);
  const supabase = getServiceSupabase();
  const { error } = await supabase
    .from('onboarding_respostas')
    .upsert({
      session_id: session.id,
      departamento: body.departamento,
      pergunta_id: body.pergunta_id,
      valor: body.valor,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'session_id,departamento,pergunta_id' });
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ ok: true, saved_at: new Date().toISOString() });
}
```

**Race condition note:** Magic link reload + autosave em flight → reload busca da fonte de verdade (servidor) DEPOIS de cancelar timers pendentes. Implementar `flushAutosaves()` no `beforeunload`.

### Pattern 4: Identification Gate Server-Enforced (HARD-04)

**What:** Front bloqueia visualmente, mas servidor é a única autoridade.

```typescript
// api/sessions/complete-department.ts
const Schema = z.object({ slug: z.string(), token: z.string(), departamento: z.string() });
const GATED = ['sac_geral','financeiro','suporte','vendas'] as const;

export default async function handler(req, res) {
  const { slug, token, departamento } = Schema.parse(req.body);
  const session = await assertSessionAccess(slug, token);
  if (GATED.includes(departamento as any) && session.status_identificacao !== 'concluido') {
    return res.status(403).json({ error: 'identification_gate', message: 'Complete Identificação primeiro' });
  }
  // ... mark concluido
}
```

UI: `OnboardingSession.tsx` lê `session.status_identificacao` do `/api/sessions/get` e desabilita botões. Mas servidor RECUSA mesmo se UI for bypassada.

### Pattern 5: Cloudflare Turnstile + Upstash Rate Limit (HARD-07)

**Both layers, in order:**

```typescript
// api/_lib/ratelimit.ts
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
export const createSessionLimiter = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(5, '1 m'),
  analytics: true,
  prefix: 'rl:create-session',
});
```

```typescript
// api/_lib/turnstile.ts
export async function verifyTurnstileToken(token: string, ip?: string) {
  const body = new URLSearchParams({
    secret: process.env.TURNSTILE_SECRET_KEY!,
    response: token,
  });
  if (ip) body.set('remoteip', ip);
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = await r.json() as { success: boolean; 'error-codes'?: string[] };
  return json.success === true;
}
```

```typescript
// api/sessions/create.ts (handler)
export default async function handler(req, res) {
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? 'unknown';
  // 1) Rate limit antes de gastar Turnstile call
  const { success: rlOk, remaining } = await createSessionLimiter.limit(ip);
  res.setHeader('X-RateLimit-Remaining', remaining);
  if (!rlOk) return res.status(429).json({ error: 'rate_limit' });

  // 2) Turnstile
  const turnstileOk = await verifyTurnstileToken(req.body.turnstileToken, ip);
  if (!turnstileOk) return res.status(403).json({ error: 'captcha_failed' });

  // 3) Criar sessão com slug + access_token (nanoid)
  const supabase = getServiceSupabase();
  const slug = nanoid(12);
  const access_token = nanoid(32);
  // ... insert
}
```

**Front (`NovoOnboarding.tsx`):**
```tsx
import { Turnstile } from '@marsidev/react-turnstile'; // wrapper React oficial-ish
<Turnstile siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY} onSuccess={setTurnstileToken} />
```

### Pattern 6: BrasilAPI CNPJ com Cache + Fallback (HARD-05)

**Cache 24h em Upstash Redis pra reduzir round-trips:**

```typescript
// api/_lib/brasilapi.ts
import { Redis } from '@upstash/redis';
const redis = Redis.fromEnv();
const TTL = 86400; // 24h

export async function fetchCnpj(cnpj: string) {
  const clean = cnpj.replace(/\D/g, '');
  if (clean.length !== 14) throw new HttpError(400, 'cnpj_invalid_length');

  const cacheKey = `cnpj:${clean}`;
  const cached = await redis.get<any>(cacheKey);
  if (cached) return cached;

  // Primary: BrasilAPI
  try {
    const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${clean}`, { signal: AbortSignal.timeout(5000) });
    if (r.status === 404) throw new HttpError(404, 'cnpj_not_found');
    if (!r.ok) throw new Error(`brasilapi_${r.status}`);
    const data = await r.json();
    await redis.set(cacheKey, data, { ex: TTL });
    return data;
  } catch (e) {
    // Fallback: ReceitaWS (rate-limited mas livre)
    const r = await fetch(`https://www.receitaws.com.br/v1/cnpj/${clean}`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) throw new HttpError(503, 'cnpj_lookup_unavailable');
    const data = await r.json();
    if (data.status === 'ERROR') throw new HttpError(404, 'cnpj_not_found');
    await redis.set(cacheKey, data, { ex: TTL });
    return data;
  }
}
```

**BrasilAPI rate limits:** API pública sem auth, sem rate limit oficial documentado em 2026 (HIGH risk de mudança). Recomendação: cache 24h + circuit breaker (3 falhas em 1min → degradar pra checksum-only por 5min). Confidence: MEDIUM — verificar com [BrasilAPI docs](https://brasilapi.com.br/docs) periodicamente.

### Anti-Patterns to Avoid

- **`fire-and-forget` sem `keepalive: true`** — bug atual em `Onboarding.tsx:251-303`. Adicionar `keepalive: true` ou `await` com toast progress.
- **`empresa_nome` interpolado em template literal de email** — XSS. Usar `escape-html` (já no install list).
- **Manter rotas legacy `/api/create-session.ts` e novas `/api/sessions/create.ts` divergentes** — durante migração, fazer legacy redirect interno (re-export do novo handler) ou apagar logo após cutover.
- **`access_token` na URL exposto em logs/proxies** — aceitar risco baixo (TTL 30d, rotacionar via "reenviar link"); evitar logar URL completa em Vercel logs.
- **Logo PNG legado** (`pipeelo-logo.png` 19/Apr) — substituir por SVG do brandbook 2026 (CONCERNS Tech Debt).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Rate limiting distribuído | In-memory counter, custom Redis Lua | `@upstash/ratelimit` | Cada Vercel Function instance tem memória própria; algoritmos slidingWindow corretos são não-triviais |
| Captcha | Honeypot caseiro | Cloudflare Turnstile | Honeypot é bypassed por bots de 2026; Turnstile tem privacy + UX |
| Validação CNPJ | Só checksum local | BrasilAPI + checksum como fallback | Checksum aceita CNPJs inativos / inexistentes (Pitfall 9) |
| Validação email | regex caseira | Zod `z.string().email()` (RFC 5322) | Regras RFC 5322 têm corner cases; Zod já é o padrão do projeto |
| Validação WhatsApp E.164 BR | regex caseira | `libphonenumber-js` ou Zod refinement com pattern `^\+55\d{10,11}$` | E.164 BR tem variações (DDD 2 dígitos, 9º dígito, fixo vs móvel) |
| Magic link auth próprio | JWT custom + signing | `nanoid(32)` opaco no DB com TTL check | Token opaco em tabela é mais simples e revogável |
| Debounce hook | `setTimeout` solto | Hook custom controlado (acima) ou `use-debounce` lib | Cleanup em unmount + race entre value mudando antes do timer |
| Server-side fetch wrapper | `fetch` cru | Wrapper com `signal: AbortSignal.timeout(5000)` + retry com `p-retry` (já no STACK.md) | Timeouts default Vercel = morte silenciosa |
| HTML escape em email | `replace(/</g, '&lt;')` | `escape-html` | Lista completa de entities |

**Key insight:** Tudo nesta phase tem solução pronta com track record em produção. Hand-rolling auth/captcha/rate-limit é o caminho mais rápido pro próximo incidente.

---

## Common Pitfalls

### Pitfall 1: RLS reaperto silencioso quebra prod (PITFALLS Pitfall 4)
**What goes wrong:** Aperta RLS antes de migrar todos os `supabase.from()` → 401/403 em massa, sessões em andamento perdem capacidade de salvar.
**Why it happens:** RLS aperto e front migration são tecnicamente independentes mas operacionalmente acoplados.
**How to avoid:** Sequência migrate-then-lock (Pattern 1) com audit script no CI como gate.
**Warning signs:** Spike de 401/403 nos logs, suporte recebendo "minhas respostas sumiram".

### Pitfall 2: Multi-tab sobrescreve respostas (PITFALLS Pitfall 8)
**What goes wrong:** Aba A salva pergunta 30; Aba B (stale) salva pergunta 15 e sobrescreve.
**Why it happens:** Last-write-wins sem optimistic concurrency.
**How to avoid:** Save por `pergunta_id` (não por departamento blob) — já é o pattern em `onboarding_respostas` (`upsert onConflict: session_id,departamento,pergunta_id`). Em retomada, server é fonte de verdade — re-hidratar form do `/api/sessions/get`.
**Warning signs:** Logs com 2 saves do mesmo session_id em <500ms vindo de IPs diferentes.

### Pitfall 3: Token vazado em URL/logs (PITFALLS Pitfall 9)
**What goes wrong:** `access_token` aparece em logs Vercel, proxies de empresa, browser history.
**Why it happens:** Token na URL é convenção (necessária pra magic link).
**How to avoid:** TTL curto (30d aceitável); permitir "reenviar link" que rotaciona token (gera novo `nanoid(32)` e invalida o velho). Mascarar `access_token` em logs custom (`...token=***`).
**Warning signs:** Acessos a sessão de IPs geograficamente impossíveis.

### Pitfall 4: BrasilAPI down trava `/api/sessions/create` (PITFALLS Integration Gotchas)
**What goes wrong:** BrasilAPI 503 → endpoint trava 30s e cliente não consegue criar sessão.
**Why it happens:** Hardcoded em flow critico sem fallback.
**How to avoid:** Cache 24h + circuit breaker + ReceitaWS fallback + degrade para checksum-only se ambos down (Pattern 6). Validação dura (rejeitar CNPJ inativo) só roda em validação inline do front; criação de sessão aceita CNPJ checksum-OK mesmo se API down.
**Warning signs:** Latência p99 de `/api/sessions/create` > 3s, alertas de timeout.

### Pitfall 5: Turnstile token expirado em form lento
**What goes wrong:** Cliente abre `/novo`, deixa aberto 10min, submita → token expirou (TTL 5min).
**Why it happens:** Turnstile token tem `idle_expiration` configurável.
**How to avoid:** `refresh-expired="auto"` no widget, e backend devolve 403 `captcha_expired` específico que UI captura e re-desafia sem perder dados do form.

### Pitfall 6: Autosave race com magic link reload
**What goes wrong:** Cliente edita pergunta, fecha aba antes do debounce 500ms disparar → resposta perdida.
**Why it happens:** `setTimeout` é cancelado em unload.
**How to avoid:** No `beforeunload`, usar `navigator.sendBeacon` com payload pendente (fallback pro autosave). Ou `flushAutosaves()` síncrono em `pagehide`. Backend trata POST com `keepalive: true` igual.
**Warning signs:** Reclamação "preenchi e sumiu".

### Pitfall 7: IDV 2026 inconsistente entre logo PNG e tokens CSS
**What goes wrong:** CSS aplica paleta nova, mas `pipeelo-logo.png` ainda é o legado roxo.
**Why it happens:** Commit `ea79204` aplicou tokens mas não trocou asset (CONCERNS).
**How to avoid:** Substituir por SVG inline (`PipeeloLogo.tsx` retorna `<svg>` direto) — sem PNG dependente de asset versionado.

---

## Code Examples

### Endpoint server-side com auth + Zod + service-role
```typescript
// api/sessions/get.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { assertSessionAccess } from '../_lib/auth-session';
import { getServiceSupabase } from '../_lib/supabase';

const Query = z.object({ slug: z.string().min(1), token: z.string().min(16) });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  try {
    const { slug, token } = Query.parse(req.query);
    const session = await assertSessionAccess(slug, token);
    const supabase = getServiceSupabase();
    const { data: respostas, error } = await supabase
      .from('onboarding_respostas')
      .select('departamento, pergunta_id, valor, updated_at')
      .eq('session_id', session.id);
    if (error) throw error;
    return res.status(200).json({
      session: {
        id: session.id, slug: session.slug,
        empresa_nome: session.empresa_nome,
        status_identificacao: session.status_identificacao,
        status_sac_geral: session.status_sac_geral,
        status_financeiro: session.status_financeiro,
        status_suporte: session.status_suporte,
        status_vendas: session.status_vendas,
        // NÃO retornar access_token de volta nem dados do tenant linkado
      },
      respostas,
    });
  } catch (e: any) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    console.error('[get-session]', e);
    return res.status(500).json({ error: 'internal' });
  }
}
```

### Front API client (substitui supabase.from no front)
```typescript
// src/lib/api-client.ts
class ApiError extends Error { constructor(public status: number, message: string, public code?: string) { super(message); } }

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    keepalive: true, // CRÍTICO pra autosave + tab close
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new ApiError(r.status, body.error ?? r.statusText, body.code);
  }
  return r.json();
}

export const sessionApi = {
  get: (slug: string, token: string) =>
    api<{ session: SessionDTO; respostas: RespostaDTO[] }>(`/api/sessions/get?slug=${encodeURIComponent(slug)}&token=${encodeURIComponent(token)}`),
  saveResposta: (input: SaveRespostaInput) =>
    api<{ ok: true; saved_at: string }>(`/api/sessions/save-resposta`, { method: 'PUT', body: JSON.stringify(input) }),
  completeDepartment: (input: CompleteInput) =>
    api<{ ok: true }>(`/api/sessions/complete-department`, { method: 'POST', body: JSON.stringify(input) }),
};
```

### Tailwind tokens IDV 2026
```typescript
// tailwind.config.ts (extend.colors)
colors: {
  'forest-floor': { DEFAULT: '#000D0A', 50: '#0A1A16', 100: '#0F2520' /* etc */ },
  'lime-accent':  { DEFAULT: '#01d5ac', hover: '#01b894', muted: '#3eedc5' },
  // mantém pipeelo-* legacy temporariamente até auditar todas as referências
}
// tipografia
fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] }
```

```typescript
// src/main.tsx
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
```

---

## State of the Art

| Old Approach | Current Approach (2026) | When Changed | Impact |
|--------------|--------------------------|--------------|--------|
| `supabase.from()` direto no browser com anon | Service-role em `/api/*` + RLS restritiva | Padrão Supabase desde 2024, reforçado em todo material LGPD | Sem isso, anon key = leak total |
| reCAPTCHA v3 | Cloudflare Turnstile | 2023+ (privacy + UX) | Free tier generoso, sem invasão Google |
| `signInWithOtp` p/ qualquer "magic link" | Token opaco custom quando TTL > 24h | Sempre — `signInWithOtp` é p/ login Auth real | Confundir os dois adiciona Auth indevido |
| `useEffect` + `setTimeout` p/ debounce | Hook controlado com cleanup | Padrão React desde Hooks GA | Sem cleanup = memory leak + race |
| Senha plain text por email | Magic link com TTL | LGPD + best practice | Phase 5 cobre — Phase 1 prepara |
| Helicone observability | Langfuse | 03/2026 (Helicone em manutenção) | REQUIREMENTS Out of Scope confirma |

**Deprecated/outdated:**
- `crypto.randomBytes(16).toString('hex')` p/ tokens — usar `nanoid(32)` (mais legível, URL-safe nativo)
- `react-google-recaptcha` — substituir por wrapper Turnstile

---

## Open Questions

1. **BrasilAPI rate limit oficial 2026**
   - What we know: API pública sem auth, comunidade-mantida. Sem doc explícito de limite.
   - What's unclear: Threshold real antes de 429.
   - Recommendation: Implementar cache 24h agressivo + monitorar 429 em logs. Se aparecer, adicionar API key de provider pago (apicnpj.com.br) como Tier 2 fallback.

2. **Turnstile site key vs preview environments Vercel**
   - What we know: Turnstile permite múltiplos hostnames por widget.
   - What's unclear: Se preview deploys (`*.vercel.app`) precisam widget separado.
   - Recommendation: Configurar 1 widget com `*.vercel.app` + domain prod no Cloudflare dashboard. Validar em primeiro preview.

3. **Cron de cleanup de sessões abandonadas (90 dias)**
   - What we know: Phase 1 não inclui cron, mas Pitfall 9 sugere TTL.
   - What's unclear: Adicionar agora ou empurrar pra Phase 2.
   - Recommendation: **Empurrar pra Phase 2** (Pipeline Ingestão Robusta — naturalmente tem cron). Phase 1 só recria policy `service_role only` sem TTL automático.

4. **Path canônico do webhook admin-pipeelo (`/api/clients/onboarding/create` vs `/api/v1/onboarding/ingest`)**
   - Phase 1 não toca webhook, mas STATE.md cita inconsistência.
   - Recommendation: **Resolver em Phase 2.** Phase 1 mantém `complete-onboarding.ts` intacto.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | **Vitest** ^2.x (a instalar — projeto tem zero testes hoje) |
| Config file | `vitest.config.ts` (a criar — Wave 0) |
| Quick run command | `npx vitest run --reporter=basic` |
| Full suite command | `npx vitest run --coverage` |
| Compatibilidade | Vite 5.4 nativo, mesmo bundler/transformer |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| HARD-01 | Zero `supabase.from(onboarding*)` em `src/` | static-audit | `node scripts/audit-no-supabase-from.mjs` | ❌ Wave 0 |
| HARD-01 | `/api/sessions/get` retorna estado quando slug+token válidos | integration | `npx vitest run api/sessions/get.test.ts` | ❌ Wave 0 |
| HARD-01 | `/api/sessions/save-resposta` upsert idempotente | integration | `npx vitest run api/sessions/save-resposta.test.ts` | ❌ Wave 0 |
| HARD-02 | `useDebouncedAutosave` agenda em 500ms, cancela em re-input | unit | `npx vitest run src/lib/debounced-save.test.ts` | ❌ Wave 0 |
| HARD-02 | Autosave não duplica saves para mesmo valor | unit | `npx vitest run src/lib/debounced-save.test.ts` | ❌ Wave 0 |
| HARD-03 | `assertSessionAccess` aceita slug+token válidos | unit | `npx vitest run api/_lib/auth-session.test.ts` | ❌ Wave 0 |
| HARD-03 | `assertSessionAccess` rejeita 410 quando >30 dias | unit | `npx vitest run api/_lib/auth-session.test.ts` | ❌ Wave 0 |
| HARD-03 | Magic link end-to-end (criar → fechar → reabrir → estado igual) | smoke / manual-only | manual: criar sessão staging, salvar pergunta, abrir link em janela anônima | ❌ Manual gate (justificativa: requer email Resend real + browser real) |
| HARD-04 | Endpoint `complete-department` retorna 403 se identificação não concluída | integration | `npx vitest run api/sessions/complete-department.test.ts` | ❌ Wave 0 |
| HARD-04 | UI desabilita cards de deptos gated antes de Identificação | unit (RTL) | `npx vitest run src/pages/OnboardingSession.test.tsx` | ❌ Wave 0 |
| HARD-05 | Schema Zod aceita CNPJ válido + rejeita inválido | unit | `npx vitest run api/_lib/schemas/identificacao.test.ts` | ❌ Wave 0 |
| HARD-05 | `fetchCnpj` cacheia em Redis 24h + fallback ReceitaWS | unit (mocks) | `npx vitest run api/_lib/brasilapi.test.ts` | ❌ Wave 0 |
| HARD-05 | Schema rejeita WhatsApp não-E.164-BR | unit | `npx vitest run api/_lib/schemas/identificacao.test.ts` | ❌ Wave 0 |
| HARD-06 | `getCompletedCount` denominador = 5 | unit | `npx vitest run src/pages/OnboardingSession.test.tsx` | ❌ Wave 0 |
| HARD-07 | Rate limit retorna 429 após 5 req/min mesmo IP | integration | `npx vitest run api/sessions/create.ratelimit.test.ts` | ❌ Wave 0 |
| HARD-07 | `verifyTurnstileToken` rejeita token inválido | unit (mock fetch) | `npx vitest run api/_lib/turnstile.test.ts` | ❌ Wave 0 |
| HARD-08 | Migration `<ts>_lock_rls_phase1.sql` aplica e reverte sem erro | sql-test (manual em staging) | `psql -f supabase/migrations/<ts>_lock_rls_phase1.sql` em staging branch DB | ❌ Manual gate (justificativa: requer DB staging real) |
| HARD-09 | Cliente anon não consegue SELECT/INSERT/UPDATE em `onboarding_sessions` pós-lock | integration | `npx vitest run tests/integration/rls-anon-denied.test.ts` | ❌ Wave 0 |
| HARD-10 | Tokens Tailwind `forest-floor` + `lime-accent` resolvem | snapshot | `npx vitest run src/styles/theme.test.ts` | ❌ Wave 0 |
| HARD-10 | Logo SVG renderiza com fill correto IDV 2026 | unit (RTL) | `npx vitest run src/components/PipeeloLogo.test.tsx` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=basic --changed origin/main` (apenas afetados)
- **Per wave merge:** `npx vitest run` (suite completa) + `node scripts/audit-no-supabase-from.mjs`
- **Phase gate (antes de `/gsd:verify-work`):**
  1. Suite completa green: `npx vitest run`
  2. Audit script green: `node scripts/audit-no-supabase-from.mjs`
  3. Smoke manual: criar sessão staging end-to-end com magic link (HARD-03 manual gate)
  4. Migration staging aplicada + rollback testado (HARD-08 manual gate)
  5. Anon RLS test green: `npx vitest run tests/integration/rls-anon-denied.test.ts`

### Wave 0 Gaps (a criar antes de qualquer task de feature)
- [ ] `vitest.config.ts` — config base (jsdom, alias `@/`, setup file)
- [ ] `tests/setup.ts` — `@testing-library/jest-dom` + global mocks
- [ ] `tests/integration/_helpers/supabase-test-client.ts` — cliente anon + service-role pra testes
- [ ] `tests/integration/_helpers/test-server.ts` — wrapper p/ invocar handlers Vercel sem `vercel dev`
- [ ] `scripts/audit-no-supabase-from.mjs` — gate CI para HARD-01
- [ ] `api/_lib/test-utils.ts` — fixtures de session/respostas
- [ ] `package.json` script `"test": "vitest run"`, `"test:watch": "vitest"`, `"test:audit": "node scripts/audit-no-supabase-from.mjs"`
- [ ] CI step Vercel/GH Actions: `npm test && npm run test:audit`
- [ ] Framework install: `npm install -D vitest @vitest/ui @testing-library/react @testing-library/jest-dom jsdom supertest @types/supertest`
- [ ] DB de staging dedicado (project Supabase separado ou branch DB) p/ testes integração com RLS real

---

## Sources

### Primary (HIGH confidence)
- `.planning/research/STACK.md` — stack ADD prescritivo verificado em docs oficiais
- `.planning/research/PITFALLS.md` — pitfalls 4, 8, 9 mapeados explicitamente para Phase 1
- `.planning/codebase/STRUCTURE.md` + `ARCHITECTURE.md` + `CONCERNS.md` — auditoria atual
- `supabase/migrations/20260419000000_identificacao_and_tenant_link.sql` — policy `service_role only` original (a recriar)
- `supabase/migrations/20260419120000_relax_rls_for_testing.sql` — exatamente o que reverter
- [Cloudflare Turnstile siteverify docs](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/) — endpoint, params, error codes
- [Supabase passwordless docs](https://supabase.com/docs/guides/auth/auth-email-passwordless) — confirma TTL hard cap 24h em `signInWithOtp`
- [@upstash/ratelimit npm](https://www.npmjs.com/package/@upstash/ratelimit) — `slidingWindow(5, '1 m')` exato do HARD-07
- [Upstash ratelimit-js GitHub](https://github.com/upstash/ratelimit-js) — exemplos serverless

### Secondary (MEDIUM confidence)
- [BrasilAPI docs](https://brasilapi.com.br/docs) — endpoints CNPJ; rate limit oficial não documentado (LOW item)
- [Supabase RLS guide](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Vercel functions configuring](https://vercel.com/docs/functions/configuring-functions/duration)

### Tertiary (LOW confidence — flagged)
- BrasilAPI rate limit real em prod — sem doc oficial, validar via observação. Mitigação: cache 24h + fallback ReceitaWS.
- `@marsidev/react-turnstile` wrapper — alternativa: usar Turnstile direto via `<script>` inline (Cloudflare oficial). Decidir no plan.

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — todas verificadas em docs oficiais 2026
- Architecture: HIGH — patterns derivados de PITFALLS.md já consolidado + STACK.md
- Migrate-then-lock sequence: HIGH — sequência já mapeada em PITFALLS Pitfall 4 + reforçada por schema atual permitir rollback simples
- Magic link 30 dias custom: HIGH — Supabase docs confirmam hard cap 24h em Auth nativo
- BrasilAPI rate limit: MEDIUM — sem doc oficial, mitigado por cache + fallback
- Turnstile preview deploys: MEDIUM — funciona em theory, validar em primeiro deploy

**Research date:** 2026-05-08
**Valid until:** 2026-06-07 (30 dias — stack estável; revalidar BrasilAPI antes de Phase 2)
