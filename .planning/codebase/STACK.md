# Technology Stack

**Analysis Date:** 2026-05-08

## Languages

**Primary:**
- TypeScript ~5.8.3 — frontend (`src/`), Vercel Functions (`api/`), build scripts
- TSX/JSX — React components (`src/components/`, `src/pages/`)

**Secondary:**
- SQL — Supabase migrations em `supabase/migrations/*.sql`
- JavaScript (ESM `.mjs`) — scripts utilitários em `scripts/`
- TypeScript via Deno — Edge Functions legadas em `supabase/functions/` (não utilizadas em produção pós-migração)

## Runtime

**Environment:**
- Browser (Vite SPA) — runtime de produção do frontend
- Node.js (Vercel Functions, runtime serverless padrão — não Edge) — endpoints em `api/`
  - Tipagem via `@vercel/node` 3.2.x (`VercelRequest`/`VercelResponse`)
- Node.js >=18 implícito (uso de `fetch` global, ESM, `URL`, `Buffer`)

**Package Manager:**
- npm + bun (ambos lockfiles presentes)
  - `package-lock.json` — npm (usado pelo `vercel-build`)
  - `bun.lock` / `bun.lockb` — bun
- Lockfile: presente

## Frameworks

**Core:**
- React 18.3.1 + ReactDOM 18.3.1 — UI
- React Router DOM 6.30.1 — routing client-side (`src/App.tsx`)
- Vite 5.4.19 + `@vitejs/plugin-react-swc` 3.11 — bundler/dev server (porta 8080)
- Tailwind CSS 3.4.17 + `tailwindcss-animate` + `@tailwindcss/typography` — estilos
- Shadcn/ui (Radix UI primitives, ver lista em "Key Dependencies") — sistema de componentes

**Testing:**
- Não detectado (sem Vitest/Jest/Playwright instalado neste projeto)

**Build/Dev:**
- Vite 5.4 — build (`npm run build`, `vercel-build`)
- ESLint 9 + `typescript-eslint` 8.38 + `eslint-plugin-react-hooks` + `eslint-plugin-react-refresh` — lint (`npm run lint`)
- PostCSS 8.5 + Autoprefixer 10.4 — pipeline CSS
- SWC (via `plugin-react-swc`) — transformação de JSX/TS

## Key Dependencies

**Critical:**
- `@supabase/supabase-js` ^2.90.0 — cliente Postgres/Auth (`src/integrations/supabase/client.ts`, `api/_lib/supabase.ts`)
- `@tanstack/react-query` ^5.83.0 — cache de dados servidor-side (provider em `src/App.tsx`)
- `@vercel/node` ^3.2.24 — tipagem das Functions Node em `api/`
- `resend` ^4.0.1 — envio transacional de e-mails (`api/send-email.ts`)
- `react-hook-form` ^7.61.1 + `@hookform/resolvers` ^3.10 + `zod` ^3.25.76 — formulários do onboarding com validação
- `react-router-dom` ^6.30.1 — rotas (`/`, `/novo`, `/admin`, `/:slug`, `/:slug/:departamento`)

**UI/UX:**
- Radix UI suite (~25 pacotes `@radix-ui/react-*`) — primitives de Accordion, Dialog, Dropdown, Select, Tabs, Toast, Tooltip etc.
- `lucide-react` 0.462 — icones
- `framer-motion` 12.23 — animações
- `embla-carousel-react`, `react-day-picker`, `react-resizable-panels`, `vaul`, `cmdk`, `input-otp`, `sonner`, `recharts`, `next-themes` — componentes auxiliares
- `class-variance-authority`, `clsx`, `tailwind-merge` — utilities de classes
- `date-fns` 3.6 — formatação de datas

**Infrastructure (scripts):**
- `pg` — driver Postgres usado em `scripts/run-migrations.mjs` (suporta IPv4 pooler e IPv6 direct)

## Configuration

**Environment:**
- Variáveis de frontend (Vite, expostas no bundle):
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_PUBLISHABLE_KEY` (fallback `VITE_SUPABASE_ANON_KEY`)
- Variáveis de backend (Vercel Functions, server-only):
  - `SUPABASE_URL` (ou fallback `VITE_SUPABASE_URL`)
  - `SUPABASE_SERVICE_ROLE_KEY` — exigido em `api/_lib/supabase.ts`
  - `PIPEELO_ADMIN_API_URL` (default `https://admin.pipeelo.com`)
  - `PIPEELO_ADMIN_API_TOKEN` (Bearer) **ou** `PIPEELO_ADMIN_EMAIL` + `PIPEELO_ADMIN_PASSWORD` (Basic auth fallback)
  - `RESEND_API_KEY`
- Variáveis de scripts:
  - `DATABASE_URL` (Postgres connection string usada por `scripts/run-migrations.mjs`)
- Nenhum arquivo `.env*` versionado (gitignored). Configuração efetiva é definida via Vercel Environment Variables.

**Build:**
- `vite.config.ts` — alias `@/* → src/*`, dev server em `0.0.0.0:8080`
- `vercel.json` — framework `vite`, output `dist/`, SPA rewrites (tudo que não for `api|assets|favicon|*.ext` cai em `index.html`), headers de segurança (`X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`) e cache imutável para `/assets/*`
- `tsconfig.json` — modo permissivo (`noImplicitAny: false`, `strictNullChecks: false`, `noUnusedLocals: false`), referencia `tsconfig.app.json` e `tsconfig.node.json`
- `tailwind.config.ts` — content em `pages|components|app|src`, dark mode `class`, paleta Pipeelo (verde/roxo/azul) via CSS vars HSL, fonte Inter
- `components.json` — config Shadcn/ui
- `eslint.config.js` — flat config

## Platform Requirements

**Development:**
- Node.js 18+ (recomendado 20)
- npm ou bun
- `npm run dev` levanta Vite em `http://[::]:8080`

**Production:**
- Vercel — deploy automático
  - Frontend: SPA estática em `dist/`
  - Backend: Vercel Functions (Node serverless) em `api/*.ts`
- Banco de dados: Supabase próprio (project `llsqqbbhcdosrtpvvkml`, branch ativa `migration/vercel`) — substitui o ambiente Lovable Cloud anterior
- E-mail transacional: Resend (domínio `pipeelo.com`)

## Histórico de Migração

Projeto migrou de **Lovable Cloud → Vercel + Supabase próprio**:
- Edge Functions Deno em `supabase/functions/{send-onboarding-email,send-webhook-complete}` ainda existem no repo mas foram **substituídas** pelas Vercel Functions equivalentes em `api/` (mesma lógica reescrita em Node + `@vercel/node`)
- `supabase/config.toml` ainda referencia o `project_id` antigo (`huaukjryiokrgpouzjvz`) — não reflete o projeto novo (`llsqqbbhcdosrtpvvkml`)
- Migrations canônicas ficam em `supabase/migrations/*.sql`, aplicadas via `scripts/run-migrations.mjs`

---

*Stack analysis: 2026-05-08*
