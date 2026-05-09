# CUTOVER LOG — Jarvis em Producao

**Plan:** 06-03 — Wave 3
**Owner:** Felipe
**Status:** awaiting_first_cutover

> Felipe documenta cada cliente promovido + metricas pos-flip nesta tabela.
> Templates abaixo, preencher conforme `CUTOVER-RUNBOOK.md` for executado.

---

## Drills

| Data | Ambiente | totalMs | passedTarget | Notas |
|------|----------|---------|--------------|-------|
| _pending_ | staging | _ | _ | Pre-flight 0.1 |
| _pending_ | production | _ | _ | Pre-flight 0.4 (janela 0 onboardings) |

---

## Flip ON

| # | Timestamp ISO | Operador | Comando usado | Verify mode response |
|---|---------------|----------|---------------|----------------------|
| 1 | _pending_ | Felipe | `vercel env add JARVIS_ENABLED production` | _pending_ |

---

## Primeiros clientes Jarvis

### Cliente #1

- **Timestamp criacao session:** _pending_
- **session_id:** _pending_
- **empresa_nome:** _pending_
- **tenant_id (api.pipeelo.com):** _pending_
- **Categorias criadas (count + nomes):** _pending_
- **Assistentes criados (count + nomes):** _pending_
- **Prompts amostra (paste 2):**
  ```
  _prompt 1 aqui_
  ```
  ```
  _prompt 2 aqui_
  ```
- **Threshold check resultado:**
  - tool_calls success_rate: _pending_
  - cross_tenant_errors: _pending_
  - dna_tom passing rate: _pending_
- **Email magic link enviado:** _pending_ (sim/nao)
- **Decisao:** [ ] expand  [ ] flip back  [ ] manual review

### Cliente #2

_(seguir mesmo template)_

### Cliente #3

_(seguir mesmo template)_

---

## Eventos / Alertas

| Timestamp | Tipo | Codigo | Severidade | Mensagem | Acao tomada |
|-----------|------|--------|------------|----------|-------------|
| _pending_ | alert | _ | _ | _ | _ |

---

## Flip BACK (se ocorrer)

| Timestamp | Causa raiz | Sessoes em curso (count) | Tratamento sessoes | Plan gap-closure |
|-----------|-----------|--------------------------|---------------------|------------------|
| _pending_ | _ | _ | _ | _ |

---

## Decisoes finais

- [ ] Cutover aprovado em definitivo (Step 4 — expand permanente)
- [ ] Phase 6 marcado done em ROADMAP.md
- [ ] EVAL-05 marcado completed em REQUIREMENTS.md
- [ ] EVAL-06 marcado completed em REQUIREMENTS.md

**Sign-off:** _Felipe — pending_

---

*Plan: 06-03*
*Atualizar conforme cutover progride.*
