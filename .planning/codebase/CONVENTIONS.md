# Coding Conventions

**Analysis Date:** 2026-05-08

## Naming Patterns

**Files:**
- React components / pages: `PascalCase.tsx` — examples: `src/pages/Onboarding.tsx`, `src/components/PipeeloLogo.tsx`, `src/components/onboarding/QuestionRenderer.tsx`
- Hooks: `useCamelCase.ts` (or `.tsx` when JSX is used) — examples: `src/hooks/useOnboarding.ts`, `src/hooks/use-toast.ts`, `src/hooks/use-mobile.tsx` (note: shadcn-imported hooks use kebab-case; project hooks use camelCase)
- Shadcn UI primitives: `kebab-case.tsx` — `src/components/ui/alert-dialog.tsx`, `src/components/ui/clock-time-picker.tsx` (do NOT rename — keep shadcn defaults)
- API/Vercel functions: `kebab-case.ts` — `api/create-session.ts`, `api/complete-onboarding.ts`, `api/sync-department.ts`
- Helper modules in `api/_lib/`: `kebab-case.ts` — `api/_lib/supabase.ts`, `api/_lib/admin-pipeelo.ts`
- Scripts: `kebab-case.mjs` — `scripts/run-migrations.mjs`
- Type definitions: lowercase singular — `src/types/onboarding.ts`

**Functions:**
- `camelCase` for regular functions and React hooks: `evaluateConditional`, `expandHorarioSemanal`, `requireSupabase`
- `PascalCase` for React components and component-returning functions: `Onboarding`, `QuestionRenderer`, `PipeeloLogo`
- Vercel handlers always exported as `default async function handler(req, res)`

**Variables:**
- `camelCase` for locals, props, state: `sessionId`, `currentSection`, `respostasPorDepartamento`
- Business-domain names in pt-BR: `empresaNome`, `departamento`, `respostas`, `responsavelNome`, `obrigatoria`, `pergunta`, `condicional`, `secoes`
- Technical/framework names in English: `state`, `props`, `handler`, `payload`, `headers`

**Types/Interfaces:**
- `PascalCase` — `OnboardingState`, `Question`, `QuestionType`, `DepartmentId`, `HorarioSemanal`, `CheckboxMultipleValue`
- `interface` for object shapes (props, state, value-objects)
- `type` for unions, aliases, and discriminated unions: `type QuestionType = 'text' | 'textarea' | ...`
- Component prop interfaces named `<ComponentName>Props` — e.g., `QuestionRendererProps`

**Constants:**
- Local lookup objects use `camelCase`: `departmentIcons`, `departmentColors`, `defaultHorario`
- No UPPER_SNAKE_CASE module constants currently in use; if introducing module-level constants, prefer `UPPER_SNAKE_CASE` per Pipeelo global rule

## Code Style

**Formatting:**
- No Prettier config file present (no `.prettierrc*`, no `prettier.config.*`) — relying on editor defaults
- Observed conventions from source:
  - 2-space indentation
  - Single quotes in `src/**` (e.g., `import ... from 'react'`)
  - Double quotes in `api/**` (e.g., `import ... from "@vercel/node"`)
  - Semicolons required
  - Trailing commas in multi-line objects/arrays

**Linting:**
- Tool: ESLint v9 (flat config) — `eslint.config.js`
- Run: `npm run lint` (alias `eslint .`)
- Extends: `js.configs.recommended`, `tseslint.configs.recommended`
- Plugins: `react-hooks` (recommended rules), `react-refresh`
- Notable rule overrides:
  - `@typescript-eslint/no-unused-vars`: **off** (do not rely on lint to catch unused — clean up manually)
  - `react-refresh/only-export-components`: warn, with `allowConstantExport: true`
- Ignored: `dist`

**TypeScript Config:**
- Root `tsconfig.json` is intentionally permissive: `strict: false` is implied, `noImplicitAny: false`, `strictNullChecks: false`, `noUnusedLocals: false`
- App config (`tsconfig.app.json`): `moduleResolution: bundler`, `jsx: react-jsx`, `target: ES2020`, path alias `@/* → ./src/*`
- Node config (`tsconfig.node.json`): for `vite.config.ts` only, `strict: true`
- **Vercel Functions in `api/`** are bundled by Vercel's `@vercel/node` runtime. Relative imports inside `api/` must use `.js` extension (Node ESM resolution): see `api/complete-onboarding.ts` line 2 — `import { requireSupabase } from "./_lib/supabase.js";`

## Import Organization

**Order observed:**
1. External packages (React, framer-motion, lucide-react, etc.)
2. Internal aliased imports (`@/components/...`, `@/hooks/...`, `@/lib/...`, `@/types/...`, `@/integrations/supabase/client`)
3. Relative imports (rare in `src/`; common in `api/_lib/`)

**Path Aliases:**
- `@/*` → `./src/*` (configured in both `tsconfig.json` and `tsconfig.app.json`, plus `vite.config.ts`)
- Use the alias for everything inside `src/`. Avoid relative imports across feature boundaries.

**Type-only imports:**
- Use `import type { ... }` for types from external packages — `import type { VercelRequest, VercelResponse } from "@vercel/node";`
- Use `import { ..., type SupabaseClient }` for inline type imports — `api/_lib/supabase.ts`

## Error Handling

**Vercel API handlers (`api/*.ts`):**
- Wrap entire handler body in `try/catch`
- Coerce caught error: `const message = err instanceof Error ? err.message : String(err);`
- Log with `console.error("<handler-name> error:", message)`
- Return `res.status(500).json({ error: message })`
- Method guards at the top: `OPTIONS → 204`, non-`POST` → `405`
- Validate inputs early and return `400` with descriptive pt-BR message (`"empresa_nome é obrigatório"`)
- Webhook/external calls: log status + body on failure, return `500` with `{ error, status, details }`

**React components / hooks:**
- Local `error` state via `useState<string>('')`
- User-facing errors surfaced via `useToast` (Sonner-based) — `src/hooks/use-toast.ts`
- Defensive evaluators (e.g., `evaluateConditional`) wrap logic in `try/catch` and `console.warn` on failure with safe fallback (`return true`)

**Supabase queries:**
- Always destructure `{ data, error }` and check `error` before using `data`
- For `.single()` calls, guard both `error` and `!data`

## Logging

**Framework:** native `console` only (no logger library)

**Patterns:**
- `console.error("<context>:", error)` for failures in API handlers
- `console.warn("<context>:", input, error)` for recoverable issues in client code
- No `console.log` in production paths; remove debug logs before commit

## Comments

**When to Comment:**
- Comments are sparse and used for non-obvious logic only
- pt-BR comments for business rules: `// Migrar valor antigo (array) para novo formato (objeto)` (`QuestionRenderer.tsx`)
- English comments for technical notes: `// Handle "&&" pattern first (needs to be checked before other patterns)` (`useOnboarding.ts`)
- Section headers in long files: `// Load session data from slug`

**JSDoc/TSDoc:**
- Not used. Rely on TypeScript types for API documentation.

## Function Design

**Size:**
- React components frequently 200+ lines (page components like `Onboarding.tsx`); acceptable for cohesive flows but extract sub-components when JSX exceeds ~3 nesting levels
- Helper functions short and pure (e.g., `cn` in `src/lib/utils.ts`, `expandHorarioSemanal` in `api/complete-onboarding.ts`)

**Parameters:**
- Components: single `props` object destructured in signature — `function QuestionRenderer({ question, value, onChange, onSubmit, error }: QuestionRendererProps)`
- Hooks: positional primitive args or none; return rich object of state + setters
- API handlers: `(req: VercelRequest, res: VercelResponse)` — non-negotiable

**Return Values:**
- Hooks return a single object literal at the bottom (not multiple returns)
- Pure helpers return primitives or new objects — never mutate inputs
- API handlers always `return res.status(...).json(...)` (never leave response open)

## Module Design

**Exports:**
- Pages: `export default function PageName()` (required for React Router lazy compatibility)
- Components: named `export function ComponentName()` — e.g., `export function QuestionRenderer(...)`, `export function PipeeloLogo(...)`
- Hooks: named export — `export function useOnboarding()`
- Utilities: named export — `export function cn(...)`, `export function requireSupabase()`
- Vercel API handlers: `export default async function handler(...)` — required by `@vercel/node`

**Barrel Files:**
- Not used. Import directly from the source file.

## React / Component Patterns

**State management:**
- Local UI state: `useState`
- Cross-component flow state: custom hook (`useOnboarding`) returning consolidated state + setters wrapped in `useCallback`
- Server data: `@tanstack/react-query` is installed but **most pages currently use direct `supabase` calls inside `useEffect`** — when adding new server reads, prefer React Query hooks for cache + retry behavior
- Forms: `react-hook-form` + `zod` resolvers (installed; use for any non-trivial form)

**Memoization:**
- `useMemo` for derived collections (`sections`, `visibleQuestions`, `allQuestions`, `answeredQuestions`)
- `useCallback` for setters returned from custom hooks

**Styling:**
- Tailwind utility classes via `cn()` helper from `src/lib/utils.ts`
- Brand colors via custom Tailwind tokens: `bg-pipeelo-purple`, `bg-pipeelo-green`, `bg-pipeelo-blue` (defined in `tailwind.config.ts`)
- shadcn/ui primitives in `src/components/ui/` — extend, don't fork

**Animation:**
- `framer-motion` (`motion`, `AnimatePresence`) for page/section transitions

## Internationalization

- All user-facing strings in **pt-BR** (labels, toasts, error messages, button text)
- All business-domain identifiers and DB columns in pt-BR snake_case: `empresa_nome`, `ceo_email`, `respostas`, `responsavel_sac_geral`, `concluido_financeiro_at`, `pergunta_id`, `tipo`, `obrigatoria`
- Department keys: `identificacao`, `sac_geral`, `financeiro`, `suporte`, `vendas`
- Question type tokens stay lowercase pt-BR or technical English (mixed): `text`, `textarea`, `horario_semanal`, `checkbox_multiple`, `cnpj`, `cpf`

## Multi-tenancy & Security

- Supabase client in `api/_lib/supabase.ts` uses **service-role key** — only safe in serverless functions, never import from `src/`
- Browser-side Supabase client lives in `src/integrations/supabase/client.ts` and uses anon key
- Auth headers for admin webhooks: `Authorization: Bearer ${PIPEELO_ADMIN_API_TOKEN}` (env var, never inline)
- CORS preflight: handlers respond `204` to `OPTIONS`

## Commits

- Messages in **pt-BR** (per global rule)
- Always `git fetch && git merge` (or pull) before committing
- Commit before deploying (Vercel auto-deploys on push to `main`)

---

*Convention analysis: 2026-05-08*
