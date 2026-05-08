# Codebase Structure

**Analysis Date:** 2026-05-08

## Directory Layout

```
pipeelo-onboarding-flow/
├── api/                          # Vercel Functions (Node 18, @vercel/node)
│   ├── _lib/
│   │   ├── admin-pipeelo.ts      # Wrappers fetch p/ admin.pipeelo.com (adminApi, pipeeloApi)
│   │   └── supabase.ts           # Cliente Supabase com service-role (cacheado)
│   ├── create-session.ts         # POST cria onboarding_sessions
│   ├── provision-tenant.ts       # POST provisiona tenant pós-Identificação
│   ├── sync-department.ts        # POST sync parcial (categorias, office-hours)
│   ├── complete-onboarding.ts    # POST webhook final agregando respostas
│   └── send-email.ts             # POST notificação Resend
├── public/                       # Assets estáticos servidos como-são
│   ├── favicon.ico
│   ├── placeholder.svg
│   └── robots.txt
├── scripts/                      # Scripts utilitários (deploy/migration helpers)
├── src/
│   ├── App.tsx                   # Router + providers globais
│   ├── App.css
│   ├── main.tsx                  # Bootstrap React
│   ├── index.css                 # Tailwind base + design tokens
│   ├── vite-env.d.ts
│   ├── assets/                   # Logos PNG da Pipeelo
│   ├── components/
│   │   ├── ui/                   # shadcn/ui primitives (~50 arquivos)
│   │   ├── onboarding/           # Componentes específicos do fluxo
│   │   │   ├── DepartmentSelector.tsx
│   │   │   ├── ProgressBar.tsx
│   │   │   └── QuestionRenderer.tsx
│   │   ├── AdminLogin.tsx
│   │   ├── NavLink.tsx
│   │   └── PipeeloLogo.tsx
│   ├── hooks/
│   │   ├── useOnboarding.ts      # Hook central do fluxo (state + condicionais)
│   │   ├── use-mobile.tsx
│   │   └── use-toast.ts
│   ├── integrations/
│   │   └── supabase/
│   │       ├── client.ts         # createClient com VITE_SUPABASE_* (anon key)
│   │       └── types.ts          # Tipos auto-gerados (Database)
│   ├── lib/
│   │   ├── utils.ts              # cn() helper para Tailwind
│   │   ├── questions.json        # 128 perguntas em 5 departamentos (v3.2.0)
│   │   └── prompt-templates/
│   │       ├── index.ts          # PROMPT_TEMPLATES + renderTemplate()
│   │       ├── main.md
│   │       ├── vendas.md
│   │       ├── suporte.md
│   │       ├── financeiro.md
│   │       └── closer.md
│   ├── pages/
│   │   ├── Index.tsx             # Landing /
│   │   ├── NovoOnboarding.tsx    # /novo (criar sessão self-service?)
│   │   ├── OnboardingSession.tsx # /:slug — dashboard de 5 deptos
│   │   ├── Onboarding.tsx        # /:slug/:departamento — preenchimento
│   │   ├── AdminOnboarding.tsx   # /admin — listagem + criação
│   │   └── NotFound.tsx          # *
│   └── types/
│       └── onboarding.ts         # Question, Section, Departamento, DepartmentId, etc.
├── supabase/
│   ├── config.toml
│   ├── functions/
│   └── migrations/               # 7 migrations (jan/2026 → abr/2026)
├── components.json               # config shadcn/ui
├── eslint.config.js              # ESLint flat config v9
├── index.html                    # Vite entry HTML
├── package.json                  # v3.0.0 (release tag); v3.2.0 = conteúdo das perguntas
├── postcss.config.js
├── tailwind.config.ts            # design tokens pipeelo (purple, green, blue)
├── tsconfig.json + tsconfig.app.json + tsconfig.node.json
├── vercel.json                   # config rotas/funcs Vercel
└── vite.config.ts                # alias @/ → ./src
```

## Directory Purposes

**`api/`:**
- Purpose: Endpoints serverless da Vercel; um arquivo = uma rota POST `/api/<filename>`
- Contains: Handlers `default async function handler(req, res)` com tipo `VercelRequest/VercelResponse`
- Key files: `create-session.ts`, `provision-tenant.ts`, `complete-onboarding.ts`, `sync-department.ts`, `send-email.ts`
- Não importam código de `src/` (build separado da Vercel)

**`api/_lib/`:**
- Purpose: Código compartilhado entre Functions (prefixo `_` para Vercel não tratar como rota)
- Contains: cliente Supabase service-role + wrappers admin-pipeelo

**`src/pages/`:**
- Purpose: Componentes top-level montados pelo React Router
- Contains: 1 arquivo por rota; nomes em PascalCase casando com a entrada em `App.tsx`

**`src/components/ui/`:**
- Purpose: Primitives shadcn/ui (Radix wrappers); não editar diretamente sem motivo
- Contains: button, dialog, form, input, select, etc.
- Generated: Sim (via shadcn CLI, config em `components.json`)
- Committed: Sim

**`src/components/onboarding/`:**
- Purpose: Componentes de domínio (ligados ao fluxo de onboarding)
- Key files: `QuestionRenderer.tsx` (switch por `tipo`), `ProgressBar.tsx`, `DepartmentSelector.tsx`

**`src/hooks/`:**
- Purpose: Hooks React reutilizáveis
- Key files: `useOnboarding.ts` (lógica do fluxo, ~240 linhas), `use-toast.ts`, `use-mobile.tsx`

**`src/integrations/supabase/`:**
- Purpose: Cliente browser-side (anon key) + tipos do banco
- Generated: `types.ts` é gerado via supabase CLI, NÃO editar à mão
- Pattern: `import { supabase } from '@/integrations/supabase/client'`

**`src/lib/`:**
- Purpose: Utilitários puros e dados estáticos
- Contains: `utils.ts` (cn), `questions.json` (fonte da verdade do conteúdo), `prompt-templates/` (markdown raw + renderer)

**`src/types/`:**
- Purpose: Tipos compartilhados de domínio
- Contains: `onboarding.ts` (todos os tipos do fluxo + constantes `DEPARTMENT_ORDER`, `DEPARTMENT_COLORS`, `DEPARTMENT_ICONS`)

**`supabase/migrations/`:**
- Purpose: SQL versionado das migrations Postgres
- Pattern de nome: `<YYYYMMDDHHmmss>_<slug>.sql`
- Última: `20260419120000_relax_rls_for_testing.sql` (RLS afrouxado para teste)

## Key File Locations

**Entry Points:**
- `src/main.tsx`: Bootstrap React DOM
- `src/App.tsx`: Definição de rotas (6 rotas) e providers globais
- `index.html`: HTML root da Vite (script tag para `/src/main.tsx`)

**Configuration:**
- `vite.config.ts`: Alias `@/` → `./src`, plugin `@vitejs/plugin-react-swc`
- `tailwind.config.ts`: design tokens da Pipeelo, paleta `pipeelo-purple/green/blue/orange`
- `tsconfig.app.json`: paths e includes do bundle do navegador
- `components.json`: config shadcn (style, css var, alias)
- `vercel.json`: rotas/funcs (verificar p/ rewrites SPA)
- `eslint.config.js`: ESLint v9 flat config
- `.env.local` (não commitado): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PIPEELO_ADMIN_API_URL`, `PIPEELO_ADMIN_API_TOKEN`, `RESEND_API_KEY`

**Core Logic:**
- `src/hooks/useOnboarding.ts`: state machine do preenchimento + parser de condicionais
- `src/lib/questions.json`: 128 perguntas em 5 departamentos
- `src/components/onboarding/QuestionRenderer.tsx`: switch por tipo de pergunta
- `src/pages/Onboarding.tsx`: orquestra UI + submit + integrações pós-save
- `src/pages/OnboardingSession.tsx`: dashboard de departamentos com gate de Identificação

**Integrações:**
- `api/_lib/supabase.ts`: client service-role para Functions
- `api/_lib/admin-pipeelo.ts`: helpers HTTP para admin-pipeelo
- `src/integrations/supabase/client.ts`: client anon para browser

**Testing:**
- Não detectado (sem `vitest.config.ts`, sem `*.test.*` ou `*.spec.*` no projeto)
- Stack global menciona Vitest + Testing Library + Playwright, mas este repo ainda não tem suite

## Naming Conventions

**Files:**
- Componentes React: PascalCase + `.tsx` — ex.: `OnboardingSession.tsx`, `QuestionRenderer.tsx`, `PipeeloLogo.tsx`
- Hooks: `use` prefix em camelCase + `.ts/.tsx` — ex.: `useOnboarding.ts`, `use-toast.ts`, `use-mobile.tsx` (mistura: hooks novos seguem `useCamelCase.ts`, hooks vindos do shadcn usam `use-kebab.ts`)
- Vercel Functions: kebab-case + `.ts` — ex.: `create-session.ts`, `provision-tenant.ts`, `complete-onboarding.ts`
- shadcn/ui primitives: kebab-case + `.tsx` — ex.: `alert-dialog.tsx`, `dropdown-menu.tsx`
- Markdown templates: kebab/lower + `.md` — ex.: `main.md`, `vendas.md`
- Migrations SQL: `<timestamp>_<slug>.sql`

**Directories:**
- kebab-case ou single-word lowercase: `prompt-templates`, `onboarding`, `ui`, `integrations`

**Identifiers (em código):**
- Componentes/Tipos: PascalCase (`Question`, `Section`, `OnboardingState`)
- Funções/variáveis: camelCase (`evaluateConditional`, `setResposta`, `currentQuestion`)
- Constantes globais: UPPER_SNAKE (`DEPARTMENT_ORDER`, `PROMPT_TEMPLATES`, `DEPARTMENT_COLORS`)
- DB columns / pergunta IDs: snake_case em pt-BR (`empresa_nome`, `responsavel_financeiro`, `taxa_instalacao`, `horario_semanal`)
- Departamento IDs: snake_case (`identificacao`, `sac_geral`, `financeiro`, `suporte`, `vendas`)

**Path Alias:**
- `@/*` → `src/*` (definido em `vite.config.ts` e `tsconfig.app.json`)
- Sempre usar `@/components/...`, `@/hooks/...`, `@/lib/...`, `@/types/...`, `@/integrations/supabase/client`

## Where to Add New Code

**Nova pergunta no onboarding:**
- Editar `src/lib/questions.json` no departamento alvo, dentro da `secao` correspondente
- Se for tipo novo: adicionar ao union `QuestionType` em `src/types/onboarding.ts` E adicionar branch em `src/components/onboarding/QuestionRenderer.tsx`
- Se condicional: usar DSL suportada pelo parser em `src/hooks/useOnboarding.ts:165` (`==`, `!=`, `&&`, `||`, `includes`)

**Nova página/rota:**
- Criar `src/pages/<NomePagina>.tsx` em PascalCase
- Adicionar `<Route>` em `src/App.tsx` mantendo a ordem (rotas dinâmicas após estáticas)

**Novo componente de UI específico de domínio:**
- `src/components/onboarding/<Nome>.tsx` se ligado ao fluxo
- `src/components/<Nome>.tsx` se transversal (ex.: `PipeeloLogo`)
- NÃO criar em `src/components/ui/` (reservado para shadcn/Radix)

**Nova primitive shadcn:**
- `npx shadcn@latest add <component>` — gera em `src/components/ui/`

**Novo hook:**
- `src/hooks/useAlgo.ts` (camelCase com prefixo `use`)

**Novo endpoint serverless:**
- Criar `api/<kebab-name>.ts` exportando `default async function handler(req, res)`
- Helpers em `api/_lib/` (prefixo `_` evita virar rota)
- Ler segredos via `process.env.<VAR>` — nunca importar `import.meta.env`

**Novo template de prompt:**
- Adicionar `src/lib/prompt-templates/<nome>.md`
- Importar via `?raw` em `src/lib/prompt-templates/index.ts` e adicionar ao `PROMPT_TEMPLATES`

**Nova migration Supabase:**
- `supabase/migrations/<YYYYMMDDHHmmss>_<slug>.sql`
- Após aplicar, regenerar `src/integrations/supabase/types.ts` via `supabase gen types`

**Utilitário puro:**
- `src/lib/<nome>.ts`

## Special Directories

**`src/components/ui/`:**
- Purpose: shadcn/ui primitives wrappando Radix
- Generated: Sim (via shadcn CLI)
- Committed: Sim
- Não editar diretamente; preferir composição em `src/components/onboarding/`

**`src/integrations/supabase/types.ts`:**
- Purpose: Tipos do schema Postgres
- Generated: Sim (`supabase gen types typescript`)
- Committed: Sim
- Não editar à mão

**`api/_lib/`:**
- Purpose: utils compartilhados entre functions; o prefixo `_` faz a Vercel ignorar como rota
- Generated: Não
- Committed: Sim

**`node_modules/`, `dist/`:**
- Generated: Sim
- Committed: Não (gitignored)

---

*Structure analysis: 2026-05-08*
