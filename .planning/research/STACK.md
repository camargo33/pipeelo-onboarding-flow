# Stack Research — v2 Upgrade ADD/HARDEN Areas

**Domain:** SaaS multi-tenant onboarding flow (Vite SPA + Vercel Functions Node + Supabase) com pipeline cron disparando Claude API server-side para provisionamento autônomo de tenant
**Researched:** 2026-05-08
**Confidence:** HIGH (todos os recursos críticos verificados em docs oficiais da Vercel, Resend, Anthropic, Upstash e Supabase em 2026-05)

> Escopo deste documento: **apenas o que vamos ADICIONAR ou ENDURECER** no v2. A stack base (Vite 5.4, React 18.3, Tailwind 3.4, Shadcn, Radix, RHF+Zod, React Query 5.83, `@vercel/node` 3.2, `@supabase/supabase-js` 2.90) já está inventariada em `.planning/codebase/STACK.md` e permanece. Nenhuma migração para Next.js está em escopo.

---

## Recommended Stack — ADD/HARDEN

### Core Technologies (novas dependências de runtime)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `resend` | ^4.0.x (já instalado, manter) | SDK de e-mail transacional | Já em uso (`api/send-email.ts`); SDK oficial, suporte nativo a `react` templates, idempotency keys, batch send. Confiança HIGH (docs oficiais Resend Node SDK). |
| `react-email` (meta-package) | ^4.x (estável atual; v6 lançou abr/2026 unificando pacotes — adotar v6 se disponível) | Templates JSX para e-mail responsivo | Padrão de mercado em 2026 (2M downloads/semana). Resolve dor de HTML inline manual em `send-email.ts`. Componentes `<Html>`, `<Button>`, `<Tailwind>`, dark-mode out-of-the-box. Confiança HIGH. |
| `@react-email/components` | ^0.x → unificado em `react-email` v6 | Componentes prontos (Html, Head, Tailwind, Button, Section) | Acompanha `react-email`. Dependência única em v6. |
| `@anthropic-ai/sdk` | ^0.95.x (latest 2026-05) | Cliente Claude API server-side (Jarvis cron) | SDK oficial TypeScript Anthropic. Suporta `system` prompt, `tools`, **prompt caching** (`cache_control: ephemeral`, TTL 5m/1h) crítico para Jarvis (KB do tenant cacheado). Modelos disponíveis: `claude-opus-4-7`, `claude-sonnet-4-6`, `claude-haiku-4-5`. Confiança HIGH (verificado em platform.claude.com/docs). |
| `@upstash/redis` | ^1.x (latest) | Cliente Redis serverless (HTTP, não TCP) | Runtime Vercel Functions Node não suporta conexões TCP persistentes. Upstash usa HTTP/REST → 1 req = 1 round-trip, sem cold-connection issues. Necessário para rate limit + idempotency store + queue de retries. |
| `@upstash/ratelimit` | ^2.x (latest) | Rate limiting em Vercel Functions | Lib oficial Upstash construída para serverless/edge. Suporta `slidingWindow`, `tokenBucket`, `fixedWindow`. Cache hot-function reduz round-trips. Compatível 100% com `@vercel/node` runtime. Confiança HIGH. |
| `svix` (opcional) | ^1.x | Assinatura/verificação de webhooks (HMAC) | Considerar para webhook **outgoing** (admin-pipeelo) e **incoming** se houver consumers terceiros. Para o caso atual (1 webhook → admin-pipeelo via shared token) é **OPCIONAL** — token Bearer já basta. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `p-retry` | ^6.x | Retry com backoff exponencial + jitter | Wrapper para chamadas frágeis: `pipeeloApi`, `adminApi`, Claude API. Configurar `retries: 5, factor: 2, minTimeout: 1000, maxTimeout: 30000, randomize: true`. |
| `nanoid` | ^5.x | IDs idempotency-safe curtos | Geração de `idempotency_key` para Resend, webhook outgoing, jobs de retry. URL-safe e mais curto que UUID v4. |
| `zod` | já 3.25.x | Validação de payloads server-side | Já instalado. Estender para validar **todo** body de Vercel Function (input público) antes de tocar Supabase. Schema único no `api/_lib/schemas/` reusado em frontend + backend. |
| `@react-email/render` | acompanha `react-email` | Renderiza JSX → HTML inline | Chamado em `api/send-email.ts` para converter template em string HTML antes de mandar pro Resend. Em v6: `import { render } from 'react-email'`. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `react-email` CLI | Preview local de e-mails | `npx email dev` levanta servidor em `localhost:3000` com hot-reload de templates. Roda fora do Vite (não conflita). |
| `vitest` | Testes unitários (NOVO) | Project hoje tem **zero testes**. Adicionar para `evaluateConditional`, `expandHorarioSemanal`, contratos Zod, builders de prompt do Jarvis. Compatível 100% com Vite (mesmo bundler). Versão atual ^2.x. |
| `@vitest/ui` | UI de testes opcional | Boa para debug local. |
| Vercel CLI (`vercel`) | Dev local + deploy + logs | Já implícito; `vercel dev` para testar Vercel Functions localmente (Vite dev não roda `api/`). |

---

## Installation

```bash
# Core ADD
npm install @anthropic-ai/sdk @upstash/redis @upstash/ratelimit p-retry nanoid

# E-mail (atualizar Resend + adicionar React Email)
npm install resend@latest react-email @react-email/components

# Dev (testes — primeira suíte do projeto)
npm install -D vitest @vitest/ui @testing-library/react @testing-library/jest-dom jsdom
```

> **Não instalar:** `next`, `next-auth`, `bullmq` (requer Redis com TCP persistente — incompatível Vercel Functions Node serverless), `node-cron` (Vercel Cron já resolve), `nodemailer` (Resend é a escolha).

---

## Padrões de Uso (prescritivo, por área de ADD)

### 1. Resend + React Email — Transacionais

**Templates em `src/emails/`** (JSX, mesmo TS do projeto):
- `WelcomeCEO.tsx` — link do questionário pro CEO
- `ReminderStalled.tsx` — sessão parada >48h
- `CredentialsReady.tsx` — Jarvis terminou, credenciais + tutorial
- `JarvisFailedAlert.tsx` — interno, alerta Felipe

**Em `api/send-email.ts`:**
```ts
import { Resend } from 'resend';
import { render } from 'react-email';
import { WelcomeCEO } from '@/emails/WelcomeCEO';

const resend = new Resend(process.env.RESEND_API_KEY);
const html = await render(<WelcomeCEO empresa={…} link={…} />);

await resend.emails.send({
  from: 'Pipeelo <onboarding@pipeelo.com>',
  to: ceoEmail,
  subject: 'Bem-vindo à Pipeelo — comece seu onboarding',
  html,
  headers: { 'Idempotency-Key': nanoid() }, // evita duplo-envio em retry
  tags: [{ name: 'tipo', value: 'welcome' }],
});
```

**Não fazer:** continuar montando HTML como template literal (atual `api/send-email.ts`). Não escala, não tem dark mode, frágil em clientes Outlook.

### 2. Vercel Cron — Disparo do Jarvis

**Em `vercel.json`:**
```json
{
  "crons": [
    { "path": "/api/cron/jarvis-process-pending", "schedule": "0 9,15 * * *" }
  ],
  "functions": {
    "api/cron/jarvis-process-pending.ts": { "maxDuration": 300 }
  }
}
```

**Auth da função cron** (Vercel envia user-agent `vercel-cron/1.0` mas isso **não é segurança**):
```ts
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  // ... processar sessões pending em batch
}
```

**Limites confirmados:**
- Default duration: 10s (Hobby 5s) → estender com `maxDuration` até 900s (15min) no Pro
- Timezone: UTC (lembrar: 9h UTC ≠ 6h BRT)
- Quem dispara: HTTP GET → mas usar POST/Authorization via header é OK
- Não há suporte a `MON/TUE/JAN` — só números

**Estratégia de execução:** o cron **não processa tudo síncrono**. Ele:
1. Busca N sessões `pending` (batch de 5).
2. Marca cada uma como `processing` com `processing_started_at` (evita re-pick).
3. Para cada sessão, chama Claude API (Jarvis) com timeout de 60s.
4. Em sucesso → escreve `completed` + log de `jarvis_actions`.
5. Em falha → `failed` com erro + dispara `JarvisFailedAlert` via Resend.
6. Se batch demora >250s, cron sai e próximo cron pega o resto.

### 3. Claude API Server-Side — Jarvis como Skill

**Padrão "skill como prompt template":** skills do Claude Code são instruções markdown. Para reusar Jarvis server-side, materializamos a skill em arquivos `src/jarvis/` (ou `api/_lib/jarvis/`) — **não chamamos Claude Code CLI server-side** (sem ambiente, sem MCP, frágil).

```ts
// api/_lib/jarvis/run.ts
import Anthropic from '@anthropic-ai/sdk';
import { JARVIS_SYSTEM, JARVIS_TOOLS } from './prompt';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function runJarvisForSession(session: OnboardingSession) {
  const response = await anthropic.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 8192,
    system: [
      { type: 'text', text: JARVIS_SYSTEM, cache_control: { type: 'ephemeral', ttl: '1h' } },
      { type: 'text', text: buildTenantContext(session) }, // KB do tenant
    ],
    tools: JARVIS_TOOLS, // create_category, create_kb, create_assistant, link_function_calling
    messages: [{ role: 'user', content: `Processe a sessão ${session.id} e provisione o tenant.` }],
  });

  // Loop de tool_use → execução real (chama api.pipeelo.com) → tool_result → continua até stop
}
```

**Prompt caching** (`cache_control: ephemeral`) é crítico: o `JARVIS_SYSTEM` (~10k tokens com regras DNA tom + templates) é cacheado por 1h, custando 90% menos no segundo+ tenant processado no batch.

**Modelos:**
- `claude-opus-4-7` para Jarvis (raciocínio complexo, multi-step)
- `claude-haiku-4-5` para validações pontuais (sanity check de email, classificação)
- **NÃO usar** `claude-mythos-preview` (preview, sem SLA estável)

### 4. Server-Side Supabase — Hardening RLS

**Dois clientes distintos** (já parcialmente implementado):
- `src/integrations/supabase/client.ts` — anon key, **somente** auth e leituras públicas via RLS estrita.
- `api/_lib/supabase.ts` — service role key, bypass RLS, autoridade total. **Único caminho** para `INSERT/UPDATE/DELETE` em `onboarding_sessions` e `onboarding_respostas`.

**Regra inegociável:** após reverter `relax_rls_for_testing.sql`, qualquer chamada `supabase.from(...)` no browser que não seja leitura pública deve ser substituída por `fetch('/api/...')` que internamente usa o cliente service-role. Isso é o coração do Pilar 1.

**Pattern de cliente:**
```ts
// api/_lib/supabase.ts (hardening: garantir persistSession:false e fetch override)
import { createClient } from '@supabase/supabase-js';
let cached: SupabaseClient | null = null;
export function getServiceSupabase() {
  if (cached) return cached;
  cached = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (url, opts) => fetch(url, { ...opts, keepalive: true }) },
  });
  return cached;
}
```

### 5. Rate Limiting — Endpoints Públicos

**Setup:**
```ts
// api/_lib/ratelimit.ts
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

export const createSessionLimiter = new Ratelimit({
  redis: Redis.fromEnv(), // UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
  limiter: Ratelimit.slidingWindow(5, '1 m'),  // 5 sessões / min / IP
  analytics: true,
  prefix: 'rl:create-session',
});
```

**Aplicação por endpoint:**
| Endpoint | Limit | Justificativa |
|----------|-------|---------------|
| `POST /api/create-session` | 5/min/IP | Anti-spam de sessões |
| `POST /api/provision-tenant` | 3/min/IP | Operação cara, idempotente por CNPJ |
| `POST /api/sync-department` | 30/min/sessionId | Pode ter retries legítimos |
| `POST /api/complete-onboarding` | 2/min/sessionId | Webhook final |
| `POST /api/send-email` | 10/min/IP | Anti-abuse Resend |

**No handler:**
```ts
const ip = req.headers['x-forwarded-for'] ?? 'unknown';
const { success, limit, remaining, reset } = await createSessionLimiter.limit(String(ip));
res.setHeader('X-RateLimit-Limit', limit);
res.setHeader('X-RateLimit-Remaining', remaining);
if (!success) return res.status(429).json({ error: 'rate_limit' });
```

### 6. Webhook Reliability — Outgoing para admin-pipeelo

**Camadas em ordem:**
1. **Idempotency key** (`session_id` + sufixo de tentativa) no body. Admin-pipeelo já dedupe por `session_id` único — manter.
2. **`p-retry`** com `retries: 5, factor: 2, minTimeout: 30000, maxTimeout: 8h, randomize: true` — match com best practice Svix.
3. **`fetch` com `keepalive: true`** + `signal: AbortSignal.timeout(15000)`.
4. **Persistir tentativas** em tabela `webhook_deliveries` (id, session_id, target_url, status, attempt, last_error, next_retry_at). Cron auxiliar (5min) drena fila de `next_retry_at <= now()`.
5. **HMAC opcional**: por enquanto Bearer token é suficiente (admin interno). Se admin-pipeelo expor a terceiros, migrar para `svix` ou HMAC manual.

**NÃO usar** `BullMQ` / `node-cron` / `Bee-Queue`: todos requerem worker process longo. Não cabem em Vercel Functions.

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Vercel Cron + Vercel Functions Node | Inngest, Trigger.dev, QStash | Quando passar de ~50 jobs/dia ou precisar de step functions/workflows duráveis com replay. Para o MVP (1-3 sessões/dia) Vercel Cron é suficiente e zero-deps. |
| Resend + React Email | Postmark, SendGrid, AWS SES | SES se chegar em 100k emails/mês (custo). Postmark se exigirem SLA enterprise de inboxing. Resend é o padrão DX 2026. |
| `@anthropic-ai/sdk` direto | Vercel AI SDK (`@ai-sdk/anthropic`) | AI SDK tem ergonomia melhor para streaming UI. Para Jarvis (server cron, sem UI streaming, com tool-use complexo) o SDK oficial dá controle fino sobre `cache_control` e tool loop. |
| `@upstash/ratelimit` | `next-rate-limit`, in-memory | In-memory não funciona em Vercel (cada invocação pode ser instância diferente). `next-rate-limit` é Next-only. |
| Vercel Cron | GitHub Actions schedule, EasyCron | GitHub Actions tem 10min de delay típico e não é pago por compute consumido — bom só pra jobs >15min. Aqui não cabe. |
| `react-email` | `mjml`, HTML inline manual | MJML não tem componentes React. HTML manual é o que temos hoje e queremos sair. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **Next.js migration** | Out of scope. Migração recente de Lovable→Vite ainda assentando. Custo enorme, ganho marginal. | Manter Vite + Vercel Functions (`api/*.ts`). |
| **`node-cron` / `cron` package** | Requer processo Node permanente. Vercel Functions são stateless e morrem após resposta. | Vercel Cron (declarativo em `vercel.json`). |
| **`bullmq`** | Requer Redis com **conexão TCP persistente**. Vercel Functions Node não mantêm conexões. Worker fora do Vercel adiciona infra. | `@upstash/redis` (HTTP) + cron de drain a cada 5min. |
| **`nodemailer` / SMTP direto** | Sem painel de bounces, sem analytics, deliverability ruim em domínio novo. | Resend (já em uso). |
| **Edge Runtime (`runtime: 'edge'`)** | `@anthropic-ai/sdk` e `pg` (scripts) querem APIs Node. Edge tem timeouts diferentes e limita libs. | Manter Node runtime serverless (default). |
| **Anon key em `INSERT/UPDATE/DELETE`** | RLS relaxada hoje é exatamente o que estamos consertando. | Service role via `/api/*` Vercel Functions. |
| **Claude Code CLI server-side** | Skills rodam em ambiente interativo do Felipe. Não há binário/sessão Claude Code dentro de Vercel Function. | Materializar Jarvis como prompt + tools em `api/_lib/jarvis/` chamando `@anthropic-ai/sdk` direto. |
| **`nodemailer` com SMTP do Resend** | Possível mas redundante. Perde tags, idempotency-key, webhooks de bounce. | SDK `resend` direto. |
| **In-memory rate limiting** | Vercel Functions não compartilham memória entre instâncias. Limite vira "por instância", inútil. | `@upstash/ratelimit`. |
| **`crypto.randomUUID()` para idempotency-key cross-retry** | Muda a cada retry, quebra idempotência. | `nanoid()` gerado **uma vez** e persistido por job. |

---

## Stack Patterns by Variant

**Se volume cron passar de 50 sessões/dia:**
- Migrar de Vercel Cron simples para **Inngest** (free tier 50k steps/mês, durabilidade, replay).
- Por que: orquestração multi-step do Jarvis se beneficia de step functions com retry granular.

**Se Jarvis começar a falhar >10% e exigir review humano frequente:**
- Adicionar **fila de approval** com Slack/Trello [IA] (já existe no skill Jarvis original) antes de tool-use destrutivo.
- Por que: caminho feliz continua auto, casos ambíguos vão pra humano sem bloquear o resto.

**Se chegar a 100k+ e-mails/mês:**
- Considerar **AWS SES** ou plano enterprise Resend.
- Por que: custo. Resend free tier é 100/dia, paid 50k/mês.

**Se admin-pipeelo virar consumer público de webhook (terceiros):**
- Adotar **`svix`** para assinatura HMAC + portal de webhooks.
- Por que: HMAC manual escala mal; portal Svix dá replay/visibility de graça.

---

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `@vercel/node@3.2` | `@anthropic-ai/sdk@0.95` | Node 18+ runtime, ambos usam `fetch` global. OK. |
| `@upstash/ratelimit@2` | `@upstash/redis@1` | Mesmo vendor, sempre alinhar major. |
| `react-email@6` | React 18.3 | OK. v6 unificou pacotes — se alguma dep ainda exportar de `@react-email/components`, ficar em 5.x até consolidar. Issue #3414 do repo confirma quirks de TS em 6.0.0 — verificar antes de adotar major. |
| `resend@4` | `react-email@6` | Resend aceita prop `react: <Template/>` direto, mas em Vercel Functions Node o `render()` explícito é mais estável (evita issues de transformação JSX no bundle). |
| `vitest@2` | Vite 5.4 | Match perfeito. Mesma config Vite. |
| `@anthropic-ai/sdk@0.95` | TS 5.8 | OK. SDK com strict types, requer `tsconfig` com `lib: ["DOM", "ES2022"]` (já temos). |
| Node 18+ | Vercel Functions default | Confirmado. Vercel deprecated Node 16 em 2024. |

---

## Sources

- [Vercel Cron Jobs docs](https://vercel.com/docs/cron-jobs) — schedule format, UTC timezone, GET trigger, user-agent — HIGH
- [Vercel maxDuration docs](https://vercel.com/docs/functions/configuring-functions/duration) — 900s max em Pro, 10s default — HIGH
- [Resend Node SDK](https://resend.com/docs/send-with-nodejs) — install, API surface, idempotency headers — HIGH
- [React Email 6.0 announcement](https://resend.com/blog/react-email-6) — abr/2026, pacote unificado, 2M downloads/sem — HIGH
- [Anthropic Messages API](https://platform.claude.com/docs/en/api/messages) — modelos disponíveis, prompt caching, tool use — HIGH
- [@anthropic-ai/sdk npm](https://www.npmjs.com/package/@anthropic-ai/sdk) — versão 0.95.x atual — HIGH
- [@upstash/ratelimit overview](https://upstash.com/docs/redis/sdks/ratelimit-ts/overview) — algoritmos, hot-cache, edge support — HIGH
- [Upstash edge rate limiting blog](https://upstash.com/blog/edge-rate-limiting) — patterns para Vercel — MEDIUM
- [Svix webhook retry best practices](https://www.svix.com/resources/webhook-best-practices/retries/) — backoff, jitter, idempotency — HIGH
- [Hookdeck outbound webhook retry guide](https://hookdeck.com/outpost/guides/outbound-webhook-retry-best-practices) — exponential 30s→8h, 6-8 attempts — MEDIUM
- [Supabase service role docs](https://supabase.com/docs/guides/api/api-keys) — bypass RLS, never browser — HIGH
- [Supabase RLS guide](https://supabase.com/docs/guides/database/postgres/row-level-security) — política estrita pós-relax — HIGH

---
*Stack research for: Pipeelo Onboarding Flow v2 (ADD/HARDEN scope only)*
*Researched: 2026-05-08*
