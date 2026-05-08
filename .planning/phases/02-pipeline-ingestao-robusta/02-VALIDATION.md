---
phase: 2
slug: pipeline-ingestao-robusta
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-08
---

# Phase 2 — Validation Strategy

> Cross-repo Zod schema contract + outbox + reconciliation cron + state machine.
> Phase 2 spans 2 repos: pipeelo-onboarding-flow (sender) + admin-pipeelo (receiver).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Frameworks** | Vitest 2.x (onboarding-flow, established in Phase 1) + Vitest (admin-pipeelo, may need scaffolding) |
| **Quick run command** | `npm test -- --run --reporter=dot` (each repo) |
| **Full suite command** | `npm test -- --run --coverage` (each repo) |
| **Estimated runtime** | ~30s quick, ~90s full per repo |
| **CI gate** | Schema contract version sync check |

---

## Sampling Rate

- **After every task commit:** Run quick test in affected repo
- **After every plan wave:** Full suite both repos + schema contract sync verify
- **Before `/gsd:verify-work`:** Both repos green + outbox + reconciliation tested with simulated network failure

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 2-00-01 | 00 | 0 | PIPE-01 | infra | publish `pipeelo-onboarding-contracts` skeleton (workspace package or git submodule) | ⬜ pending |
| 2-01-01 | 01 | 1 | PIPE-01,08 | unit | `npm test -- contracts/onboarding.test.ts` (both repos) | ⬜ pending |
| 2-01-02 | 01 | 1 | PIPE-02 | integration | `npm test -- api/clients/onboarding/create.zod.test.ts` (admin) | ⬜ pending |
| 2-02-01 | 02 | 2 | PIPE-04,05,06 | integration | `npm test -- api/_lib/outbox.test.ts` + reconciliation cron test | ⬜ pending |
| 2-02-02 | 02 | 2 | PIPE-07 | unit | `npm test -- lib/state-machine.test.ts` (admin) | ⬜ pending |
| 2-03-01 | 03 | 3 | PIPE-03 | manual | doc rotação token + Vercel env config check | ⬜ pending |

---

## Wave 0 Requirements

- [ ] `pipeelo-onboarding-contracts` package (npm workspace OR git submodule consumido pelos 2 repos)
- [ ] Schema versioning convention (`payload_version` field + semver) documentada
- [ ] CI step que verifica que `import { OnboardingPayload } from "pipeelo-onboarding-contracts"` resolve em ambos repos

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Token rotation | PIPE-03 | Vercel env vars precisam ser rotacionadas em ambos projetos | Doc do procedimento + checklist |
| End-to-end network kill | PIPE-04 | Simular packet loss real exige humano | DevTools throttle + offline + retry sequence |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers contract package setup
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s per repo

**Approval:** pending
