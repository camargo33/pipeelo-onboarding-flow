---
phase: 3
slug: tool-layer-audit
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-08
---

# Phase 3 — Validation Strategy

> Tool layer + audit infrastructure no admin-pipeelo. Tools determinísticas com idempotency + jarvis_runs/tool_calls + Langfuse.
> Esta phase roda 100% no `~/Desktop/admin-pipeelo` repo.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.x (admin-pipeelo) — instalado em Phase 2 Wave 0 OU instalar aqui |
| **Quick run command** | `npm test -- --run --reporter=dot` (admin-pipeelo) |
| **Full suite command** | `npm test -- --run --coverage` |
| **Estimated runtime** | ~30s quick |
| **CI gate** | Lint + tests passando antes de merge |

---

## Sampling Rate

- **After every task commit:** Run quick test
- **After every plan wave:** Full suite + langfuse SDK init smoke test
- **Before `/gsd:verify-work`:** Tools puras 80%+ coverage + idempotency double-call test green

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 3-00-01 | 00 | 0 | infra | install | `npm i -D vitest @vitest/coverage-v8` (admin) | ⬜ pending |
| 3-00-02 | 00 | 0 | TOOL-04 | migration | `supabase migration new jarvis_audit_tables` (jarvis_runs + jarvis_tool_calls + idempotency_keys) | ⬜ pending |
| 3-01-01 | 01 | 1 | TOOL-05 | unit | `npm test -- api/jarvis/_runtime/tools/_shared/http.test.ts` | ⬜ pending |
| 3-01-02 | 01 | 1 | TOOL-03 | unit | `npm test -- api/jarvis/_runtime/idempotency.test.ts` | ⬜ pending |
| 3-02-01 | 02 | 2 | TOOL-01,02 | unit | `npm test -- api/jarvis/_runtime/tools/create_tenant.test.ts` (+ 6 outras) | ⬜ pending |
| 3-02-02 | 02 | 2 | TOOL-06 | coverage | coverage report >80% em `api/jarvis/_runtime/tools/` | ⬜ pending |
| 3-03-01 | 03 | 3 | TOOL-07 | integration | `npm test -- api/jarvis/_runtime/observability/langfuse.test.ts` | ⬜ pending |
| 3-03-02 | 03 | 3 | TOOL-04,07 | integration | Tool call gera linha em jarvis_tool_calls + span Langfuse | ⬜ pending |

---

## Wave 0 Requirements

- [ ] Vitest scaffolded em admin-pipeelo (se Phase 2 Wave 0 não fez)
- [ ] Migration `jarvis_audit_tables` cria: `jarvis_runs (id, session_id, started_at, finished_at, status, tokens_used)`, `jarvis_tool_calls (id, run_id, tool_name, input_jsonb, output_jsonb, duration_ms, error)`, `idempotency_keys (session_id, tool, hash, result_jsonb, created_at, PK(session_id, tool, hash))`
- [ ] Estrutura de pastas: `api/jarvis/_runtime/tools/_shared/`, `api/jarvis/_runtime/tools/`, `api/jarvis/_runtime/observability/`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Provisionamento end-to-end via tools (sem agente) | TOOL-02 | Validar que humanos podem chamar tools manualmente | Script local: invoca tools sequencialmente com sample respostas, valida tenant configurado no Pipeelo Admin |
| Langfuse spans visíveis em dashboard | TOOL-07 | UI Langfuse exige humano | Trigger 1 run, abrir Langfuse, ver trace + spans |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers DB migrations + folder structure
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s

**Approval:** pending
