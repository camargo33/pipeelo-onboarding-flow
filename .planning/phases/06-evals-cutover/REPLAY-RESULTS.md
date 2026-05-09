# Replay Results — Plan 06-01

> Auto-approved by GSD executor in auto mode. Scaffold pronto para Felipe preencher
> apos rodar os 5 replays em staging (ver "How to fill" abaixo).

**Status:** ⏳ awaiting staging execution
**Plan:** 06-01
**Generated:** 2026-05-09 (scaffold)
**Sign-off:** ⬜ pending (Felipe)

---

## Pre-requisitos staging

- [ ] Migration `20260509130000_claim_pending_sessions_rpc.sql` aplicada (Phase 4-03)
- [ ] Env vars setadas no admin-pipeelo staging:
  - `CRON_SECRET`
  - `ANTHROPIC_API_KEY`
  - `STAGING_SUPABASE_URL` + `STAGING_SUPABASE_SERVICE_ROLE_KEY` (para o script)
  - `ADMIN_BASE_URL=https://admin-staging.pipeelo.com`
- [ ] `JARVIS_ENABLED=true` no env do worker (mas NAO no webhook — replay invoca /api/jarvis/run direto)
- [ ] Substituir os 5 placeholders `REPLACE-ME-*` em `admin-pipeelo/scripts/fixtures/historical-sessions.json` por session_ids reais (rodar `tsx scripts/select-historical-sessions.ts --env=prod` com env vars de prod read-only)

---

## How to fill

Para cada session_id na fixture:

```bash
cd admin-pipeelo

# 1. Roda em legacy (cria tenant replay-{id}-legacy-*)
tsx scripts/replay-session.ts --session-id=$ID --mode=legacy --env=staging | tee legacy-$ID.json

# 2. Roda em jarvis (cria tenant replay-{id}-jarvis-*)
tsx scripts/replay-session.ts --session-id=$ID --mode=jarvis --env=staging | tee jarvis-$ID.json

# 3. Compara (gera diff-$ID.json e tabela markdown)
tsx scripts/replay-diff.ts --session-id=$ID --env=staging > diff-$ID.md
```

Depois preenche a tabela abaixo, anexa diffs, e da sign-off explicito.

---

## Resultado por sessao

| # | session_id | bucket | mode legacy | mode jarvis | diff status | blocker? | notas |
|---|------------|--------|-------------|-------------|-------------|----------|-------|
| 1 | REPLACE-ME-small-isp-uuid | small | ⬜ | ⬜ | ⬜ | ⬜ | — |
| 2 | REPLACE-ME-medium-isp-uuid | medium | ⬜ | ⬜ | ⬜ | ⬜ | — |
| 3 | REPLACE-ME-large-isp-uuid | large | ⬜ | ⬜ | ⬜ | ⬜ | — |
| 4 | REPLACE-ME-voice-isp-uuid | medium (voice) | ⬜ | ⬜ | ⬜ | ⬜ | — |
| 5 | REPLACE-ME-edge-case-uuid | medium (edge) | ⬜ | ⬜ | ⬜ | ⬜ | — |

---

## Criterios de regressao

| Sintoma | Severidade |
|---------|------------|
| Tenant nao criado em modo Jarvis | BLOCKER |
| Categoria/assistente faltando em Jarvis vs Legacy | BLOCKER |
| Function nao linkada em Jarvis (vendas sem `gera_lead`) | BLOCKER |
| KB content diferente | EXPECTED (Jarvis sintetiza) |
| Prompts com phrasing diferente | EXPECTED (vai pra Plan 06-02 rubric) |
| Jarvis cria assistente extra (ex: Closer) | WARN (review caso a caso) |

---

## Sign-off

**Sign-off:** ⬜ Replay aprovado pra Plan 06-02 — _Felipe ___/___ /____ ___:___

OU

**Blockers encontrados:**
- _(listar)_

---

## Cleanup pos-analise

```bash
# Listar tenants replay-* em staging
psql $STAGING_DB_URL -c "SELECT id, name FROM tenants WHERE name LIKE 'replay-%';"

# Deletar (cuidado: cascata vai dropar related rows)
psql $STAGING_DB_URL -c "DELETE FROM tenants WHERE name LIKE 'replay-%';"
```
