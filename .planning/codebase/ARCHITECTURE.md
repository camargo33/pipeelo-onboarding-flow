# Architecture

**Analysis Date:** 2026-05-08

## Pattern Overview

**Overall:** Vite SPA (React 18 + TypeScript) com backend serverless via Vercel Functions e persistência Supabase. Arquitetura "fat client + thin functions": o navegador fala direto com o Postgres via Supabase JS (RLS afrouxado para teste), e as Functions só existem para integrações externas que exigem segredos (admin-pipeelo API, Resend, service-role key).

**Key Characteristics:**
- SPA single-bundle servida estaticamente pela Vercel; rotas client-side via React Router (`src/App.tsx`)
- Backend stateless em `api/*.ts` rodando como Vercel Functions Node 18 (`@vercel/node`)
- Persistência única em Supabase (Postgres + Auth) — não há ORM, queries via `@supabase/supabase-js`
- Onboarding orientado a dados: 5 departamentos × secoes × perguntas declarados em `src/lib/questions.json` (~128 perguntas v3.2.0)
- Estado da sessão de preenchimento totalmente local (`useState` em `useOnboarding`); persistência só ocorre no submit final do departamento
- Side-effects (provisionamento de tenant, sync, webhook, email) disparados em paralelo, sempre após o save no banco — não bloqueiam o usuário

## Layers

**UI Layer (React Components):**
- Purpose: Renderização e interação com o usuário (formulário condicional, dashboard admin, landing)
- Location: `src/pages/`, `src/components/`
- Contains: Páginas roteáveis, componente de renderização dinâmica de perguntas (`QuestionRenderer.tsx`), shadcn/ui primitives em `src/components/ui/`
- Depends on: `useOnboarding` hook, Supabase client, types em `src/types/onboarding.ts`
- Used by: React Router via `src/App.tsx`

**State / Domain Layer (Hooks):**
- Purpose: Lógica de navegação entre perguntas, avaliação de condicionais, cálculo de progresso
- Location: `src/hooks/useOnboarding.ts`
- Contains: Reducer-like state (`OnboardingState`), parser de condicionais (`evaluateConditional` suporta `==`, `!=`, `&&`, `||`, `includes`)
- Depends on: `src/lib/questions.json`, types em `src/types/onboarding.ts`
- Used by: `src/pages/Onboarding.tsx`

**Data Layer (Supabase Client):**
- Purpose: Acesso direto ao Postgres do navegador com chave anon
- Location: `src/integrations/supabase/client.ts`, types auto-gerados em `src/integrations/supabase/types.ts`
- Tables: `onboarding_sessions` (1 linha por empresa, com colunas `status_<dept>`, `responsavel_<dept>`, `concluido_<dept>_at`), `onboarding_respostas` (1 linha por pergunta respondida, conflict key `session_id,departamento,pergunta_id`)
- RLS: afrouxado em ambiente atual — ver `supabase/migrations/20260419120000_relax_rls_for_testing.sql`

**Integration Layer (Vercel Functions):**
- Purpose: Operações que exigem segredo ou comunicação com APIs externas
- Location: `api/*.ts`
- Contains:
  - `api/create-session.ts` — cria registro em `onboarding_sessions` (admin)
  - `api/provision-tenant.ts` — chama admin-pipeelo para criar tenant a partir do depto Identificação
  - `api/sync-department.ts` — sync parcial (categorias, office-hours) por depto
  - `api/complete-onboarding.ts` — webhook final agregando todas as respostas
  - `api/send-email.ts` — notificação via Resend
- Shared utils: `api/_lib/supabase.ts` (service-role client cacheado), `api/_lib/admin-pipeelo.ts` (helpers `adminApi` e `pipeeloApi` com fetch+auth)
- Depends on: env vars `SUPABASE_SERVICE_ROLE_KEY`, `PIPEELO_ADMIN_API_TOKEN`, `RESEND_API_KEY`

**Content Layer (Templates + Questions):**
- Purpose: Conteúdo estático do onboarding (perguntas e prompts gerados)
- Location: `src/lib/questions.json` (estrutura de departamentos), `src/lib/prompt-templates/*.md` (templates main, vendas, suporte, financeiro, closer)
- Pattern: Templates carregados como raw via Vite (`?raw`), substituição `{{var}}` em `renderTemplate()` (`src/lib/prompt-templates/index.ts`)

## Data Flow

**Fluxo de preenchimento de departamento:**

1. Admin cria sessão em `/admin` (`AdminOnboarding.tsx`) → `POST /api/create-session` → insert em `onboarding_sessions` retornando `slug` + `access_token`
2. CEO/responsável acessa `/<slug>` (`OnboardingSession.tsx`) → fetch direto Supabase → exibe cards de 5 departamentos com status
3. Identificação é gate: `startDepartment()` bloqueia outros deptos enquanto `status_identificacao !== 'concluido'`
4. Click em depto → navega para `/<slug>/<departamento>` (`Onboarding.tsx`)
5. `useOnboarding` carrega `questions.json[departamento]`, monta lista de seções e filtra perguntas via `evaluateConditional()`
6. Usuário preenche → `setResposta()` atualiza state local → na última pergunta passa para tela "resumo" (nome do responsável) → `handleSubmit()`
7. `handleSubmit()` (`src/pages/Onboarding.tsx:203`) executa em ordem:
   - upsert em `onboarding_respostas` (conflict `session_id,departamento,pergunta_id`)
   - update em `onboarding_sessions` setando `status_<dept>=concluido`, `responsavel_<dept>`, `concluido_<dept>_at`
   - mostra tela de sucesso ao usuário (síncrono encerra aqui)
   - dispara em paralelo (não-bloqueante): `/api/provision-tenant` (se Identificação) **ou** `/api/sync-department` (outros), `/api/send-email`, e `/api/complete-onboarding` se todos os 5 deptos concluídos

**State Management:**
- Estado de UI/onboarding: `useState` dentro do hook `useOnboarding` (não há Redux/Zustand neste projeto)
- Server state: `@tanstack/react-query` instalado e `QueryClientProvider` montado em `src/App.tsx:13`, mas as páginas atuais ainda fazem fetch ad-hoc com `supabase.from(...)` direto em `useEffect`
- Auth admin: `supabase.auth.onAuthStateChange` em `AdminOnboarding.tsx`

## Key Abstractions

**`Question` / `Section` / `Departamento`:**
- Purpose: Modelo declarativo das perguntas
- Examples: `src/types/onboarding.ts`, instâncias em `src/lib/questions.json`
- Pattern: cada `Question` tem `id`, `tipo` (16 tipos: text, textarea, currency, horario_semanal, checkbox_multiple, info, cnpj, etc.), `obrigatoria`, `condicional?`, `opcoes?`

**`evaluateConditional` (DSL inline):**
- Purpose: Mostrar/esconder perguntas baseado em respostas anteriores
- Location: `src/hooks/useOnboarding.ts:165`
- Pattern: parser manual de strings tipo `"departamentos_lista includes 'outro'"`, `"taxa_instalacao == 'sim' || taxa_instalacao == 'promocional'"`, `"tem_plantao == 'sim' && (...)"`. Suporta `&&`, `||`, `==`, `!=`, `includes`

**`QuestionRenderer`:**
- Purpose: Switch central que renderiza o input correto para cada `tipo`
- Location: `src/components/onboarding/QuestionRenderer.tsx`
- Pattern: Componente recebe `question`, `value`, `onChange` — nasceu como switch grande, sem polimorfismo

**`renderTemplate(template, vars)`:**
- Purpose: Gerar prompts finais substituindo `{{var}}` pelas respostas
- Location: `src/lib/prompt-templates/index.ts:17`
- Pattern: regex `/\{\{([a-z_0-9]+)\}\}/gi`, fallback para `[[key]]` quando valor ausente

**`adminApi` / `pipeeloApi`:**
- Purpose: Wrappers fetch para admin-pipeelo (auth Bearer ou Basic) e para tenant Pipeelo (token por tenant)
- Location: `api/_lib/admin-pipeelo.ts`
- Pattern: throw com `error.status` e `error.data` em não-2xx

## Entry Points

**SPA Entry:**
- Location: `src/main.tsx` → `src/App.tsx`
- Triggers: usuário acessa qualquer rota em produção (Vercel)
- Responsibilities: monta `QueryClientProvider`, `TooltipProvider`, `BrowserRouter` com 6 rotas: `/`, `/novo`, `/admin`, `/:slug`, `/:slug/:departamento`, `*`

**HTTP Endpoints (Vercel Functions):**
- `POST /api/create-session` — `api/create-session.ts` — invocado pelo admin
- `POST /api/provision-tenant` — `api/provision-tenant.ts` — invocado pós-Identificação
- `POST /api/sync-department` — `api/sync-department.ts` — invocado pós-conclusão de SAC/Financeiro/Suporte/Vendas
- `POST /api/complete-onboarding` — `api/complete-onboarding.ts` — invocado quando todos os 5 deptos concluídos
- `POST /api/send-email` — `api/send-email.ts` — invocado a cada conclusão de depto

## Error Handling

**Strategy:** Best-effort no client; mostra toast (`sonner`) e segue. Functions retornam `{error: string}` com status 4xx/5xx mas o client trata como não-bloqueante (`.catch(err => console.error(...))`).

**Patterns:**
- Validação de campo via `validateCurrentQuestion()` em `Onboarding.tsx:125` (obrigatória, URL, `min:N`)
- Schemas Zod disponíveis (dependência instalada) mas pouco usados nas páginas atuais
- Functions usam try/catch macro e logam com `console.error(<contexto>, err)`
- Identificação é gate de UX (toast `'Preencha primeiro o departamento "Identificação"'` em `OnboardingSession.tsx:161`), não enforced no banco

## Cross-Cutting Concerns

**Logging:** `console.error` no client e nas Functions; sem agregador externo (Sentry/Logtail)

**Validation:** parcial — campos básicos no client (`validateCurrentQuestion`); confiamos no shape de `questions.json` e nas constraints do Postgres

**Authentication:**
- `/admin` protegido por `supabase.auth` (login email/senha em `AdminLogin.tsx`)
- Sessões públicas de onboarding são protegidas só pelo `slug` UUID-like + `access_token` — não há JWT no fluxo do CEO/responsável
- Functions usam `SUPABASE_SERVICE_ROLE_KEY` (bypass RLS) e `PIPEELO_ADMIN_API_TOKEN` (Bearer) ou `PIPEELO_ADMIN_EMAIL/PASSWORD` (Basic) para falar com admin-pipeelo

**CORS:** Functions tratam `OPTIONS` retornando 204; sem allowlist explícita (Vercel default)

---

*Architecture analysis: 2026-05-08*
