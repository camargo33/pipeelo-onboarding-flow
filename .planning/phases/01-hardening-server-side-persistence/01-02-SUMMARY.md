---
phase: 01-hardening-server-side-persistence
plan: 02
subsystem: identidade-visual-2026
tags: [idv-2026, tailwind, fontsource, svg-logo, hard-10, wave-1]
requires:
  - vitest-config
provides:
  - tokens-idv-2026
  - inter-self-hosted
  - pipeelo-logo-svg-inline
affects:
  - tailwind.config.ts
  - src/index.css
  - src/main.tsx
  - src/components/PipeeloLogo.tsx
tech_stack:
  added:
    - "@fontsource/inter@^5.x"
  patterns:
    - "Single source of truth para tokens visuais em src/styles/theme.ts (importado pelo Tailwind + tests)"
    - "Inter self-hosted via @fontsource (sem Google Fonts CDN — privacy + sem FOUT)"
    - "Logo como componente React retornando <svg> inline (sem dependencia de PNG versionado)"
    - "TDD RED -> GREEN para componente visual com snapshot test"
key_files:
  created:
    - src/styles/theme.ts
    - src/styles/idv-2026.test.tsx
    - src/components/PipeeloLogo.test.tsx
    - src/components/__snapshots__/PipeeloLogo.test.tsx.snap
  modified:
    - tailwind.config.ts
    - src/index.css
    - src/main.tsx
    - src/components/PipeeloLogo.tsx
    - package.json
    - package-lock.json
decisions:
  - "Honra HARD-10 (#01d5ac) sobre Felipe memory abr/2026 (#7ACC42) — REQUIREMENTS sao a fonte canonica travada. Reabrir como gap closure pos-Phase 1 se Felipe quiser revisar."
  - "Manter src/assets/pipeelo-logo.png durante deploy preview como rollback safety. Apagar em Phase 5 quando IDV 2026 estiver validada visualmente."
  - "PipeeloLogo retorna SVG tipografico (Inter font) como placeholder ate o brandbook 2026 entregar paths oficiais. API estavel — substituir conteudo do <svg> sem quebrar consumers."
  - "Tokens forest-floor + lime-accent coexistem com pipeelo-* legacy em tailwind.config.ts durante transicao. Auditar referencias e remover legacy em phase futura."
  - "Snapshot test cobre regressao do SVG mesmo apos troca de paths."
metrics:
  duration_minutes: 4
  tasks_completed: 3
  files_created: 4
  files_modified: 6
  commits: 3
  completed_date: 2026-05-08
---

# Phase 01 Plan 02: IDV 2026 (Forest Floor + Lime Accent + Inter + Logo SVG) Summary

Aplicou IDV 2026 oficial: paleta Forest Floor `#000D0A` + accent `#01d5ac`, Inter self-hosted via `@fontsource/inter`, logo SVG inline. Resolveu inconsistencia visual entre tokens CSS aplicados em `ea79204` e logo PNG legado.

## Objective Recap

HARD-10 fecha o gap visual da Phase 1 (paralelizado com HARD-01..09): tokens Tailwind canonicos, fonte sem dependencia de Google Fonts, logo como componente React sem asset versionado.

## What Was Built

### 1. Tokens IDV 2026 — `src/styles/theme.ts`
- `FOREST_FLOOR = '#000D0A'`, `LIME_ACCENT = '#01d5ac'`, variantes `hover` (#01b894) e `muted` (#3eedc5)
- `COLORS` object com escala forest-floor 50/100/200/300 para uso em surfaces
- Importado em `tailwind.config.ts` via `import { COLORS } from "./src/styles/theme"`

### 2. Tailwind Config
- `extend.colors` agora inclui `forest-floor` e `lime-accent` como utility classes (`bg-forest-floor`, `text-lime-accent`, `bg-lime-accent-hover`)
- `fontFamily.sans` ja apontava para Inter — mantido
- Tokens `pipeelo-*` legacy preservados (coexistencia durante transicao)

### 3. Inter Self-Hosted
- `npm install @fontsource/inter` (1 package, 678 audited)
- `src/main.tsx` importa `@fontsource/inter/{400,500,600,700}.css` antes de App
- `src/index.css` remove `@import url('https://fonts.googleapis.com/...')` legado
- Build agora gera 32 chunks woff/woff2 do Inter (latin/latin-ext/cyrillic/greek)

### 4. PipeeloLogo SVG Inline
- Substitui `<img src=PNG>` por `<svg>` inline com text Inter weight 700
- Props compativeis com versao anterior: `className`, `size` (sm/md/lg), `iconOnly`
- Nova prop `fill` (default `LIME_ACCENT`) para casos de tema invertido
- aria-label="Pipeelo" + role="img" para acessibilidade
- Placeholder tipografico ate brandbook 2026 entregar paths oficiais

### 5. Test Coverage (TDD RED -> GREEN)
- `src/components/PipeeloLogo.test.tsx` — 4 testes:
  - renderiza SVG inline (nao img)
  - usa fill LIME_ACCENT por default
  - aceita className prop
  - snapshot estavel
- `src/styles/idv-2026.test.tsx` — 3 testes:
  - FOREST_FLOOR === '#000D0A'
  - LIME_ACCENT === '#01d5ac'
  - lime-accent tem variantes hover + muted
- Snapshot file gerado em `src/components/__snapshots__/PipeeloLogo.test.tsx.snap`

## Verification Results

| Check | Expected | Actual | Status |
|-------|----------|--------|--------|
| `npm run build` | exit 0 com chunks Inter | exit 0, 32 woff/woff2 chunks | PASS |
| `npx vitest run src/components/PipeeloLogo.test.tsx src/styles/idv-2026.test.tsx` | 7 passed | 7 passed | PASS |
| `tailwind.config.ts` resolve `forest-floor` + `lime-accent` | yes | yes | PASS |
| `@fontsource/inter` em node_modules | yes | yes | PASS |
| Logo SVG inline (zero `<img>` em PipeeloLogo.tsx) | yes | yes | PASS |
| Snapshot file gerado | yes | yes | PASS |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocker] Snapshot inicial gerado durante RED foi removido antes do commit RED**
- **Found during:** Task 2 fase RED
- **Issue:** Vitest gera snapshot mesmo no run que falha; commit RED nao deve carregar snapshot do componente PNG-based
- **Fix:** `rm -rf src/components/__snapshots__` antes do commit RED; snapshot real e gerado e commitado junto com Task 2 GREEN
- **Files modified:** `src/components/__snapshots__/PipeeloLogo.test.tsx.snap` (apagado e regerado)
- **Commit:** Limpeza pre-commit `e699058`; snapshot final em `388d47f`

### Minor Adjustments

**2. Teste de fill LIME_ACCENT busca por hex no `outerHTML` em vez de `<text>` direto**
- Plan dizia `expect(text?.getAttribute('fill')).toBe(LIME_ACCENT)`. Implementacao usa `expect(html.toLowerCase()).toContain(LIME_ACCENT.toLowerCase())`.
- **Why:** Mais resiliente a mudancas no SVG (paths vs text vs grupos com fill no parent). Se brandbook 2026 entregar paths, teste continua valido.
- Sem impacto funcional.

**3. Auto-approve do checkpoint:human-verify (Task 3)**
- `config.json` tem `workflow.auto_advance: true` e `workflow._auto_chain_active: true`. Per `execute-plan.md` checkpoint protocol auto-mode: visual verification e auto-aprovada.
- Verificacao visual humana fica como follow-up opcional pos-deploy preview.

## Decision Locked: `#01d5ac` (HARD-10) sobre `#7ACC42` (Felipe memory)

REQUIREMENTS.md HARD-10 trava `#01d5ac`. Memory `feedback_identidade_visual_2026.md` cita `#7ACC42`. Conflito resolvido honrando REQUIREMENTS — sao a fonte canonica versionada do projeto. Se Felipe quiser migrar para `#7ACC42`, abrir como gap closure pos-Phase 1 (impacto: trocar 2 hex em `theme.ts` + regerar snapshot).

## Auth Gates

Nenhum — puro tooling visual local.

## Commits

| # | Hash | Message |
|---|------|---------|
| 1 | `25bb4b9` | feat(01-02): tokens IDV 2026 + Inter self-hosted via @fontsource |
| 2 | `e699058` | test(01-02): testes RED para PipeeloLogo SVG inline + tokens IDV 2026 |
| 3 | `388d47f` | feat(01-02): PipeeloLogo SVG inline com fill IDV 2026 |

## Next Steps

- Wave 2 (Plan 03): consumer pages (`Onboarding.tsx`, `OnboardingSession.tsx`, `NovoOnboarding.tsx`) podem usar `bg-forest-floor` + `text-lime-accent` diretamente
- Phase 5: substituir SVG placeholder pelos paths oficiais do brandbook 2026 (manter snapshot atualizado)
- Phase 5: apagar `src/assets/pipeelo-logo.png` + `pipeelo-icon.png` apos validacao visual em prod
- Felipe (opcional): visual verification em deploy preview confirmando body=#000D0A, accent=#01d5ac, font-family=Inter

## SVG Paths para Wave 2 Reutilizar

Atual placeholder usa `<text>` Inter weight 700. Quando brandbook 2026 entregar SVG oficial:
1. Substituir conteudo de `<svg viewBox="0 0 200 60">` em `src/components/PipeeloLogo.tsx`
2. Manter atributos `className`, `aria-label`, `role`, `xmlns`
3. Garantir que pelo menos um `fill` resolve para `{fill}` (prop) — snapshot test pega regressao
4. Rodar `npx vitest run src/components/PipeeloLogo.test.tsx -u` para regenerar snapshot

## Self-Check: PASSED

- src/styles/theme.ts: FOUND
- src/styles/idv-2026.test.tsx: FOUND
- src/components/PipeeloLogo.tsx: FOUND (modified)
- src/components/PipeeloLogo.test.tsx: FOUND
- src/components/__snapshots__/PipeeloLogo.test.tsx.snap: FOUND
- tailwind.config.ts: MODIFIED (COLORS imported + spread)
- src/main.tsx: MODIFIED (@fontsource imports)
- src/index.css: MODIFIED (Google Fonts removed)
- package.json: MODIFIED (@fontsource/inter dependency)
- Commit 25bb4b9: FOUND
- Commit e699058: FOUND
- Commit 388d47f: FOUND
