---
phase: 02
plan: 00
slug: contracts-package-vitest-scaffold
subsystem: cross-repo-contracts
tags: [contracts, zod, vitest, workspace, cross-repo]
status: complete
created: 2026-05-08
completed: 2026-05-08

dependency_graph:
  requires: []
  provides:
    - "pipeelo-onboarding-contracts@0.1.0 npm package (workspace local)"
    - "PAYLOAD_VERSION='v1' constante versionável"
    - "OnboardingPayloadSkeletonSchema (passthrough até Plan 02-01)"
    - "Vitest scaffold consumindo contracts em admin-pipeelo"
  affects:
    - "pipeelo-onboarding-flow root: workspaces declarado"
    - "admin-pipeelo: nova dep file: + tests/contracts/"

tech_stack:
  added:
    - "pipeelo-onboarding-contracts (interno, workspace)"
  patterns:
    - "npm workspace + file: dep para cross-repo type sharing"
    - "vitest.config.ts isolado por subpacote (evita herdar setupFiles do parent SPA)"

key_files:
  created:
    - "C:/Users/dopeb/Desktop/pipeelo-onboarding-flow/contracts/package.json"
    - "C:/Users/dopeb/Desktop/pipeelo-onboarding-flow/contracts/tsconfig.json"
    - "C:/Users/dopeb/Desktop/pipeelo-onboarding-flow/contracts/vitest.config.ts"
    - "C:/Users/dopeb/Desktop/pipeelo-onboarding-flow/contracts/README.md"
    - "C:/Users/dopeb/Desktop/pipeelo-onboarding-flow/contracts/src/index.ts"
    - "C:/Users/dopeb/Desktop/pipeelo-onboarding-flow/contracts/src/onboarding-payload.ts"
    - "C:/Users/dopeb/Desktop/pipeelo-onboarding-flow/contracts/src/onboarding-payload.test.ts"
    - "C:/Users/dopeb/Desktop/admin-pipeelo/tests/contracts/sanity.test.ts"
  modified:
    - "C:/Users/dopeb/Desktop/pipeelo-onboarding-flow/package.json (workspaces: ['contracts'])"
    - "C:/Users/dopeb/Desktop/admin-pipeelo/package.json (file: dep)"

decisions:
  - "vitest.config.ts isolado em contracts/: necessário porque o root config carrega vitest.setup.ts que não existe dentro do workspace. Sem isso, vitest do contracts herda config do parent e quebra."
  - "Reutilizar vitest.config.ts e tests/setup.ts já existentes em admin-pipeelo (Phase 3): plan declarava criação, mas arquivos já presentes. Não duplicado — sanity test wires no include pattern existente (tests/**/*.test.ts)."
  - "Schema skeleton com .passthrough() na session: Plan 02-01 vai endurecer com fields concretos (empresa_nome, ceo_email, etc). Wave 0 só garante sanity guard de session.id."

metrics:
  duration_minutes: 7
  tasks_completed: 2
  tests_added: 6
  files_created: 8
  files_modified: 2
  commits: 2

commits:
  - hash: "246f193"
    repo: "pipeelo-onboarding-flow"
    message: "feat(02-00): cria pacote pipeelo-onboarding-contracts skeleton"
  - hash: "3d5a1a9"
    repo: "admin-pipeelo"
    message: "feat(02-00): linka pipeelo-onboarding-contracts via file: dep + sanity test"
---

# Phase 2 Plan 00: Contracts Package + Vitest Scaffold Summary

**One-liner:** Pacote local `pipeelo-onboarding-contracts` com Zod skeleton + `PAYLOAD_VERSION='v1'`, consumido por onboarding-flow via npm workspace e por admin-pipeelo via `file:` dep — Vitest verde nos dois lados.

## Objetivo Atingido

Wave 0 entrega a infraestrutura de contratos compartilhados que Plans 02-01 e 02-02 vão consumir:

- Pacote npm `pipeelo-onboarding-contracts@0.1.0` com build TS funcional (`dist/index.js` + `.d.ts`).
- onboarding-flow consome via `workspaces: ["contracts"]`.
- admin-pipeelo consome via `"pipeelo-onboarding-contracts": "file:../pipeelo-onboarding-flow/contracts"`.
- Vitest scaffold em admin-pipeelo já existia (criado em Phase 3); 1 sanity test confirma resolução do pacote.

## Tasks Executadas

### Task 1 — Criar pacote contracts skeleton (commit `246f193`)

Criado `contracts/` workspace em onboarding-flow:
- `package.json` declarando `name: pipeelo-onboarding-contracts`, scripts `build`/`test`, deps `zod@^3.25.0` + dev `typescript@^5.8` + `vitest@^4.1`.
- `tsconfig.json` com `outDir: ./dist`, `rootDir: ./src`, declaration maps habilitados.
- `vitest.config.ts` isolado (deviation Rule 3 — necessário porque o root vitest aponta pra `vitest.setup.ts` inexistente no subpacote).
- `src/onboarding-payload.ts` com `PAYLOAD_VERSION = 'v1'` + `OnboardingPayloadSkeletonSchema` (passthrough na session, exige `session.id`).
- `src/index.ts` re-exporta tudo.
- `src/onboarding-payload.test.ts` com 4 testes (PAYLOAD_VERSION, payload mínimo aceito, rejeita sem session.id, default version v1).
- `README.md` com 1 parágrafo de uso.
- Root `package.json` ganhou `"workspaces": ["contracts"]`.

**Resultado:**
- `contracts/dist/` populado (6 arquivos: index + onboarding-payload com .js/.d.ts/.d.ts.map cada).
- 4 tests verdes em `contracts/`.
- Suite Phase 1 do onboarding-flow: **107 passed | 5 skipped | 7 todo (119 total)** — zero regressão.

### Task 2 — Linkar contracts no admin-pipeelo + sanity test (commit `3d5a1a9`)

- Adicionada dep `"pipeelo-onboarding-contracts": "file:../pipeelo-onboarding-flow/contracts"` em `admin-pipeelo/package.json`.
- `npm install` populou `node_modules/pipeelo-onboarding-contracts/dist/` (link via file:).
- Criado `tests/contracts/sanity.test.ts` (2 testes: PAYLOAD_VERSION resolve, schema aceita payload mínimo).
- Reusou `vitest.config.ts` e `tests/setup.ts` pré-existentes (criados em Phase 3 — não duplicados).

**Resultado:**
- 2 tests sanity verdes.
- Full suite admin-pipeelo: **176 passed (42 files)** — zero regressão.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Vitest contracts herdava setupFiles do root**
- **Found during:** Task 1, primeira run de `npx vitest`.
- **Issue:** `Cannot find module '/@id/.../contracts/vitest.setup.ts'` — root `vitest.config.ts` referencia `vitest.setup.ts` que não existe no subpacote.
- **Fix:** Adicionado `contracts/vitest.config.ts` isolado (env: node, include: src/**/*.test.ts, sem setupFiles).
- **Files modified:** Criado `contracts/vitest.config.ts`.
- **Commit:** `246f193` (mesmo commit do Task 1).

**2. [Rule 3 - Blocking inverso] vitest.config.ts e tests/setup.ts já existiam em admin-pipeelo**
- **Found during:** Task 2 setup (verificação prévia).
- **Issue:** Plan declarava criação, mas arquivos existem desde Phase 3 (Plan 03-01) com config compatível.
- **Fix:** Não recriar. Sanity test usa pattern `tests/**/*.test.ts` já no `include`.
- **Files modified:** Nenhum (skip).

## Auth Gates

Nenhum.

## Deferred Issues

Nenhum.

## Hand-off para Plan 02-01

- Schema real (com `empresa_nome`, `ceo_email`, `respostas` por departamento, `horario_semanal`, etc.) deve substituir o skeleton em `contracts/src/onboarding-payload.ts`.
- Rebuild obrigatório (`cd contracts && npm run build`) antes do commit que muda schema — `dist/` é o que admin-pipeelo consome.
- Ambos repos já têm Vitest pronto pra novos testes de contrato.
- Endpoint admin-pipeelo de ingestão (`/api/clients/onboarding/create/route.ts`) tem `interface OnboardingPayload` inline na linha 17-20 — substituir por `OnboardingPayloadSchema.parse()` do pacote.

## Self-Check

- [x] `contracts/package.json` existe → FOUND
- [x] `contracts/dist/index.js` + `index.d.ts` existem → FOUND (após build)
- [x] `contracts/src/onboarding-payload.ts` exporta `PAYLOAD_VERSION` + schema → FOUND
- [x] onboarding-flow root tem `workspaces: ["contracts"]` → FOUND
- [x] admin-pipeelo `node_modules/pipeelo-onboarding-contracts/dist/` populado → FOUND
- [x] Commit `246f193` (onboarding-flow) → FOUND
- [x] Commit `3d5a1a9` (admin-pipeelo) → FOUND
- [x] 4 contract tests + 2 sanity tests verdes → CONFIRMED

## Self-Check: PASSED
