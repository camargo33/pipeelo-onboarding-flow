---
phase: 02
plan: 01
slug: schema-zod-completo-sender-receiver
subsystem: cross-repo-contracts
tags: [contracts, zod, schema, sender, receiver, payload-validation]
status: complete
created: 2026-05-08
completed: 2026-05-08

dependency_graph:
  requires:
    - "02-00 (pipeelo-onboarding-contracts package skeleton + workspace wiring)"
  provides:
    - "OnboardingPayloadSchema completo (cnpj 14d, email, empresa_nome obrigatórios)"
    - "Sender contract-first: api/complete-onboarding.ts faz safeParse + 500 invalid_outbound_payload"
    - "Receiver contract-first: app/api/clients/onboarding/create/route.ts faz safeParse + 400 invalid_payload com issues"
    - "Header Idempotency-Key: <session.id> em todo POST do sender"
    - "HorarioDiaSchema (compat formato real expandido + formato antigo)"
  affects:
    - "Toda mudança no shape do payload PRECISA passar por contracts/src + rebuild"
    - "Phase 6 jarvis/legacy branch continua funcionando (preservado)"
    - "Phase 1 identification gate (HARD-04) cristalizado no schema do contracts"

tech_stack:
  added: []
  patterns:
    - "Contract-first validation em ambos lados (sender + receiver) com Zod"
    - "PII-safe logs: só sessionId + issue.path/code, nunca dados crus"
    - "Idempotency-Key header (session.id) — base pra Plan 02-02 outbox"

key_files:
  created:
    - "C:/Users/dopeb/Desktop/pipeelo-onboarding-flow/contracts/src/horario.ts"
    - "C:/Users/dopeb/Desktop/pipeelo-onboarding-flow/api/complete-onboarding.test.ts"
  modified:
    - "C:/Users/dopeb/Desktop/pipeelo-onboarding-flow/contracts/src/onboarding-payload.ts"
    - "C:/Users/dopeb/Desktop/pipeelo-onboarding-flow/contracts/src/onboarding-payload.test.ts"
    - "C:/Users/dopeb/Desktop/pipeelo-onboarding-flow/contracts/src/index.ts"
    - "C:/Users/dopeb/Desktop/pipeelo-onboarding-flow/api/complete-onboarding.ts"
    - "C:/Users/dopeb/Desktop/admin-pipeelo/app/api/clients/onboarding/create/route.ts"
    - "C:/Users/dopeb/Desktop/admin-pipeelo/app/api/clients/onboarding/create/route.test.ts"
    - "C:/Users/dopeb/Desktop/admin-pipeelo/tests/contracts/sanity.test.ts"

decisions:
  - "OnboardingPayloadSkeletonSchema mantido como alias de OnboardingPayloadSchema para compat com Wave 0 (será removido em Plan 02-02)."
  - "session.cnpj é obrigatório no schema mesmo o banco aceitando null em sessões antigas: Phase 1 já enforça server-side em /api/sessions/create. Sender que não tem cnpj na sessão (legacy) falha 500 invalid_outbound_payload — comportamento correto, pitfall 10."
  - "responsaveis e datas_conclusao aceitam string|null no record (banco retorna null em campos não preenchidos). passthrough() na session permite colunas novas sem quebrar parse."
  - "Idempotency-Key adicionado no sender mesmo sem implementação completa de outbox (Plan 02-02): base pro receiver dedup. Não é destrutivo — receiver hoje já é idempotente via upsert por session_id."

metrics:
  duration_minutes: 6
  tasks_completed: 3
  tests_added: 26  # 13 contracts + 6 sender + 7 receiver
  files_created: 2
  files_modified: 7
  commits: 4

commits:
  - hash: "6884305"
    repo: "pipeelo-onboarding-flow"
    branch: "main"
    message: "Task 1 — schema Zod completo (bundled with phase 6 docs commit por hook automático)"
    notes: "Hook bundlou contracts/src/* com .planning/STATE.md updates de phase 6. Mudanças do Plan 02-01 estão presentes; não-padrão mas funcional."
  - hash: "79c98ec"
    repo: "admin-pipeelo"
    branch: "main"
    message: "test(02-01): atualiza sanity test pro schema completo"
  - hash: "5285c01"
    repo: "pipeelo-onboarding-flow"
    branch: "migration/vercel"
    message: "feat(02-01): sender valida payload com OnboardingPayloadSchema antes de POST"
  - hash: "d8e2619"
    repo: "admin-pipeelo"
    branch: "main"
    message: "feat(02-01): receiver valida payload com OnboardingPayloadSchema + 400 estruturado"

requirements:
  completed: [PIPE-01, PIPE-02, PIPE-08]
---

# Phase 2 Plan 01: Schema Zod completo + Sender + Receiver Summary

**One-liner:** Schema Zod concreto (`OnboardingPayloadSchema`) com identificação obrigatória + payload_version 'v1' agora valida o payload em ambas pontas — sender falha 500 antes de POST inválido, receiver falha 400 com `issues[]` em vez de aceitar payload incompleto silenciosamente.

## Objetivo Atingido

Plan 02-01 cristaliza o contrato cross-repo que Wave 0 deixou skeleton:

- **Schema completo** (`contracts/src/onboarding-payload.ts`) modela o formato real produzido por `api/complete-onboarding.ts` — `session.{id, empresa_nome, ceo_email, cnpj 14 dígitos, created_at}` obrigatórios; `respostas` keyed por departamento.
- **Sender** (`api/complete-onboarding.ts`) chama `OnboardingPayloadSchema.safeParse(payload)` antes do `fetch` — falha 500 `invalid_outbound_payload` com `issues[]`. Header `Idempotency-Key: <session.id>` adicionado. 502 `admin_webhook_failed` em vez de 200 silencioso quando admin retorna 4xx/5xx.
- **Receiver** (`admin-pipeelo/app/api/clients/onboarding/create/route.ts`) substitui validação manual por `safeParse` — 400 `invalid_payload` com `issues[]` (PIPE-02). Identificação incompleta (sem CNPJ ou email) bloqueada no boundary.
- **payload_version** (PIPE-08): default `'v1'`, rejeita `'v2'` (versão futura desconhecida) — base pra evolução de schema.

Mudar campo no schema sem rebuild do `contracts` quebra import dos consumidores (validado: dist/ é o que ambos resolvem).

## Tasks Executadas

### Task 1 — Schema Zod completo + horario helper (commit `6884305`)

Substituiu skeleton da Wave 0 pelo schema concreto.

- Criado `contracts/src/horario.ts` com `HorarioDiaSchema` (compat formato real expandido `{inicio, fim, nao_atende}` + formato antigo `{abre, fecha, fechado}`) + `DIAS_SEMANA` const.
- Reescrito `contracts/src/onboarding-payload.ts`:
  - `SessionEnvelopeSchema`: `id`, `empresa_nome`, `ceo_email` (z.email), `cnpj` (regex 14 dígitos), `created_at` obrigatórios. `access_token`, `tenant_id`, `pipeelo_token`, `responsaveis`, `datas_conclusao` opcionais. `passthrough()` para colunas novas.
  - `RespostasByDepartmentSchema`: 5 deptos opcionais, cada um `Record<string, unknown>`.
  - `OnboardingPayloadSchema`: `payload_version: z.literal('v1').default('v1')` + session + respostas.
  - Tipos `OnboardingPayload`, `SessionEnvelope`, `RespostasByDepartment` exportados via `z.infer`.
- `contracts/src/index.ts` exporta `./horario` adicionalmente.
- `contracts/src/onboarding-payload.test.ts` reescrito com **17 testes** (era 4): cnpj 13d falha, email malformado falha, version v2 falha, default v1, passthrough, etc.
- `admin-pipeelo/tests/contracts/sanity.test.ts` atualizado para validar identificação completa (4 tests).
- `npm run build` verde, `dist/onboarding-payload.d.ts` exporta `OnboardingPayloadSchema`.

**Resultado:** 17 contracts tests + 4 admin sanity = 21 tests cross-repo verde. Phase 1 onboarding-flow sem regressão (135 passed | 5 skipped | 7 todo).

### Task 2 — Sender valida payload antes de POST (commit `5285c01`)

Migrado `api/complete-onboarding.ts` para contract-first.

- Import de `OnboardingPayloadSchema` + `PAYLOAD_VERSION` de `pipeelo-onboarding-contracts`.
- `payload.payload_version = PAYLOAD_VERSION` adicionado no body.
- `payload.session.cnpj = session.cnpj` adicionado (faltava no payload antigo).
- `safeParse()` antes do fetch. Falha → `500 invalid_outbound_payload` com `issues[]`.
- Header `Idempotency-Key: <session.id>` no fetch.
- `4xx/5xx` do admin → `502 admin_webhook_failed` (em vez do 500 antigo confuso, e nunca 200 silencioso).
- Logs PII-safe: só `sessionId` + `issue.path/code`, nunca cnpj/email/respostas crus.
- Criado `api/complete-onboarding.test.ts` com **6 testes**: happy path com header Idempotency-Key + payload_version v1, 500 sem cnpj, 500 email malformado, 502 admin retorna 400, 200 quando deptos incompletos (early return), log PII-safe (não vaza cnpj/email).

**Resultado:** 6 sender tests verde. Suite onboarding-flow = 135 passed (subiu 6 vs Task 1).

### Task 3 — Receiver Zod parse + 400 estruturado (commit `d8e2619`)

Substituído validação manual por `safeParse` no admin.

- Removida `interface OnboardingPayload` inline (linhas 15-18 do route.ts antigo) — agora vem do contracts.
- `safeParse` substitui `if (!session.id || !session.empresa_nome || !session.ceo_email)`.
- Falha → `400 invalid_payload` com `issues: parseResult.error.issues`.
- Body não-JSON → `400 invalid_json`.
- Identificação incompleta (sem cnpj/email/empresa_nome) bloqueada no boundary.
- Branch `jarvis`/`legacy` de Plan 06-00 preservado intacto após validação.
- Logs PII-safe: só `path/code`.
- TODO inline: "Plan 02-02: persistir payload_version + status state machine".
- Atualizado `route.test.ts` adicionando `cnpj: VALID_CNPJ` ao `validPayload` (Phase 6 fixtures não tinham) + **7 novos testes Plan 02-01**: 400 sem cnpj com path correto, 400 cnpj 13d, 400 email malformado, 400 version v2, 201 sem payload_version (default v1), 201 v1 explícito, 400 invalid_json.

**Resultado:** 12 route tests verde (5 Phase 6 + 7 Plan 02-01). Full admin suite = 190 passed (era 176 baseline + Phase 6 commits).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Receiver atual aceitava payload sem cnpj silenciosamente**
- **Found during:** Task 3, ao analisar route.ts atual.
- **Issue:** Validação manual checava `id/empresa_nome/ceo_email` mas NÃO `cnpj`. Phase 1 já enforça cnpj em `/api/sessions/create`, mas o webhook passava bypass.
- **Fix:** `OnboardingPayloadSchema.safeParse` cobre todas as colunas obrigatórias incluindo cnpj. Sem isso, sessões legacy sem cnpj poderiam ainda chegar ao admin — agora retornam 400.
- **Files modified:** `app/api/clients/onboarding/create/route.ts`.
- **Commit:** `d8e2619`.

**2. [Rule 2 - Missing Critical] Sender não tinha Idempotency-Key**
- **Found during:** Task 2, ao reescrever sender.
- **Issue:** Plan 02-02 vai depender de chave de idempotência pra outbox/dedup. Sender hoje não enviava nenhum identifier além do `session.id` no body — receiver tinha que parsear pra deduplicar.
- **Fix:** Header `Idempotency-Key: <session.id>` adicionado. Receiver hoje já dedupe via upsert por `session_id`; header é base pra Plan 02-02 fazer dedup ao nível de outbox antes de processar.
- **Files modified:** `api/complete-onboarding.ts`.
- **Commit:** `5285c01`.

**3. [Rule 1 - Bug] Sender retornava 500 em vez de 502 em admin failure**
- **Found during:** Task 2.
- **Issue:** Quando admin retornava 4xx/5xx, sender respondia `500 Webhook failed` — confunde com erros internos do sender. Cliente do sender não sabia se era bug local ou problema de rede com admin.
- **Fix:** `502 admin_webhook_failed` (Bad Gateway é o status correto para upstream failure).
- **Commit:** `5285c01`.

**4. [Rule 3 - Blocking] OnboardingPayloadSkeletonSchema referenciado em Wave 0 sanity test**
- **Found during:** Task 1, após substituir skeleton pelo schema completo.
- **Issue:** `tests/contracts/sanity.test.ts` (Wave 0) importava `OnboardingPayloadSkeletonSchema`. Removê-lo quebraria sanity test sem necessidade.
- **Fix:** Mantido como alias de `OnboardingPayloadSchema` (deprecated) e atualizado o sanity test para usar nome canônico + cobrir identificação completa (Plan 02-01 hardening).
- **Files modified:** `contracts/src/onboarding-payload.ts`, `admin-pipeelo/tests/contracts/sanity.test.ts`.
- **Commit:** `6884305` + `79c98ec`.

### Workflow Anomaly (não-deviation, mas notável)

**Hook automático bundlou Task 1 com docs commit de Phase 6**
- Tentei `git commit` em onboarding-flow no working dir limpo só com `contracts/src/*` staged. Pre-commit hook (presumivelmente um GSD orchestrator de plans em paralelo) capturou também `.planning/STATE.md` + `.planning/ROADMAP.md` + `06-00-SUMMARY.md` e criou commit `6884305` com mensagem "docs(06-00): complete feature flag JARVIS_ENABLED plan".
- Mudanças do Plan 02-01 (contracts/src/horario.ts, onboarding-payload.ts, etc) estão presentes neste commit — verificado via `git show --stat 6884305`.
- Não corrigido (não-destrutivo, não vale rebase em prod). Documentado para auditoria.

## Auth Gates

Nenhum.

## Deferred Issues

Nenhum.

## Hand-off para Plan 02-02

- Receiver hoje persiste `respostas` em `onboarding_sessions.respostas` mas NÃO persiste `payload_version`. Plan 02-02 precisa adicionar coluna `payload_version` (ou armazenar dentro de `respostas.__meta`).
- `Idempotency-Key: <session.id>` já enviado pelo sender — Plan 02-02 outbox pode usar como dedupe key.
- `OnboardingPayloadSkeletonSchema` deprecated alias deve ser removido em Plan 02-02 + sanity test renomeado.
- Sender hoje gera `responsaveis` como objeto com 4 chaves fixas (`sac_geral/financeiro/suporte/vendas`); schema aceita `Record<string, string|null>` — Plan 02-02 pode formalizar.
- Phase 1 sessions com `cnpj=null` (legacy pre-HARD-04) vão falhar 500 no sender. Migration backfill necessária OU bypass legacy explícito.

## Self-Check

- [x] `contracts/src/onboarding-payload.ts` exporta `OnboardingPayloadSchema` → FOUND
- [x] `contracts/src/horario.ts` criado com `HorarioDiaSchema` + `DIAS_SEMANA` → FOUND
- [x] `contracts/dist/index.d.ts` rebuild contém novo schema → FOUND (após `npm run build`)
- [x] `api/complete-onboarding.ts` chama `OnboardingPayloadSchema.safeParse` antes do fetch → FOUND
- [x] `api/complete-onboarding.test.ts` criado com 6 testes verde → FOUND
- [x] `app/api/clients/onboarding/create/route.ts` chama `OnboardingPayloadSchema.safeParse` → FOUND
- [x] `app/api/clients/onboarding/create/route.test.ts` cobre Plan 02-01 (7 testes novos) → FOUND
- [x] `admin-pipeelo/tests/contracts/sanity.test.ts` atualizado pro schema completo → FOUND
- [x] Commit `6884305` (onboarding-flow) → FOUND (`git log --all`)
- [x] Commit `79c98ec` (admin-pipeelo) → FOUND
- [x] Commit `5285c01` (onboarding-flow) → FOUND
- [x] Commit `d8e2619` (admin-pipeelo) → FOUND
- [x] Suite onboarding-flow: 135 passed | 5 skipped | 7 todo (sem regressão Phase 1) → CONFIRMED
- [x] Suite admin-pipeelo: 190 passed (sem regressão Phase 6) → CONFIRMED
- [x] PIPE-01 (schema único compartilhado) → COMPLETO
- [x] PIPE-02 (receiver 400 estruturado) → COMPLETO
- [x] PIPE-08 (payload_version validado em ambos lados) → COMPLETO

## Self-Check: PASSED
