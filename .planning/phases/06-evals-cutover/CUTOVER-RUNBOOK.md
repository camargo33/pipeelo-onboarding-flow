# CUTOVER RUNBOOK — Jarvis em Producao

**Plan:** 06-03 — Wave 3
**Cobre:** EVAL-05 (cutover gradual) + EVAL-06 (flip back <30s)
**Owner:** Felipe (operacional) + Claude (suporte tecnico)
**Repositorio operacional:** `C:/Users/dopeb/Desktop/admin-pipeelo`
**Repositorio de planejamento:** `C:/Users/dopeb/Desktop/pipeelo-onboarding-flow`

> Procedimento humano executavel sequencial. NAO pular etapas.
> Se qualquer item falhar -> Step 5 (Flip back) imediatamente.

---

## Pre-requisitos (sign-offs ja obtidos antes de iniciar)

- [ ] Plan 06-00 GREEN (`JARVIS_ENABLED` runtime-read, ambos modos funcionais — `c8d353f`)
- [ ] Plan 06-01 sign-off em `REPLAY-RESULTS.md` (5 replays sem regressao funcional)
- [ ] Plan 06-02 sign-off em `EVAL-RESULTS.md` ("GO-LIVE APPROVED" + 3 thresholds atingidos em staging)
- [ ] Phase 5 painel + alertas WhatsApp Felipe ativos (Plan 05-XX)
- [ ] Migrations Phase 3+4 aplicadas em prod (`jarvis_runs`, `jarvis_tool_calls`, lease columns)

---

## Step 0 — Pre-flight (T-1h)

**Objetivo:** garantir que rede de seguranca funciona ANTES de tocar prod.

### 0.1. Drill em STAGING

```bash
# admin-pipeelo, terminal 1
cd C:/Users/dopeb/Desktop/admin-pipeelo

# env vars staging (ajustar conforme .env.staging local)
$env:VERCEL_TOKEN="<vercel_token>"
$env:VERCEL_PROJECT_ID="<staging_project_id>"
$env:ADMIN_BASE_URL="https://admin-staging.pipeelo.com"
$env:ONBOARDING_WEBHOOK_TOKEN="<staging_token>"
$env:DRILL_SMOKE_SESSION_ID="<sessao_completed_em_staging>"

npx tsx scripts/flip-back-drill.ts --env=staging
```

**Aceitar:** `TOTAL FLIP-BACK TIME: <30000ms (target 30000ms) OK` + `passedTarget: true`.
**Rejeitar:** qualquer step com `ok=false` -> investigar antes de prosseguir para prod.

Anotar `totalMs` em `CUTOVER-LOG.md` (linha "Drill staging").

### 0.2. Verificar `lib/onboarding-processor.ts` smoke OK em prod

```bash
# admin-pipeelo, terminal 2 — apenas leitura, NAO altera prod
$env:NEXT_PUBLIC_SUPABASE_URL="<prod_url>"
$env:SUPABASE_SERVICE_ROLE_KEY="<prod_service_role>"

# rodar threshold-check em prod-readonly mode (rejeita --env=prod por hard gate;
# usar --env=staging com env vars apontando para prod e ANTHROPIC_API_KEY de teste)
# OU: amostragem manual: SELECT * FROM jarvis_runs WHERE status='completed' LIMIT 5
```

**Aceitar:** ultimas 5 sessoes completed em legacy nas ultimas 24h. Phase 5 dashboard verde.

### 0.3. Janela de baixo trafego

- [ ] Confirmar madrugada BRT (00:00-06:00) ou janela validada via Phase 5 metrics
- [ ] WhatsApp Felipe disponivel para alertas
- [ ] Terminal dedicado pronto para `cutover-monitor --watch`

### 0.4. Drill em PRODUCAO (UMA vez, em janela 0 onboardings)

> **Hard requirement EVAL-06:** validar que flip back funciona em prod, nao so staging.

```bash
# admin-pipeelo
$env:VERCEL_TOKEN="<vercel_token>"
$env:VERCEL_PROJECT_ID="<prod_project_id>"
$env:ADMIN_BASE_URL="https://admin.pipeelo.com"
$env:ONBOARDING_WEBHOOK_TOKEN="<prod_token>"
$env:DRILL_SMOKE_SESSION_ID="<sessao_completed_em_prod>"

# Confirmar via Phase 5 dashboard que NAO ha onboardings ativos agora
npx tsx scripts/flip-back-drill.ts --env=production --i-know-what-im-doing
```

**Aceitar:** `passedTarget: true` + tempo registrado em `CUTOVER-LOG.md` (linha "Drill prod").
**Rejeitar:** abrir gap-closure plan (Plan 06-04). NAO prosseguir para Step 1.

---

## Step 1 — Flip ON em prod (T+0)

```bash
# Vercel CLI (alternativa: UI dashboard.vercel.com -> Settings -> Env Variables)
vercel env add JARVIS_ENABLED production
# Quando perguntar value: digite `true`

# Forcar propagacao instantanea (flag e runtime-read, mas redeploy garante warm starts)
vercel --prod
```

OU via UI:
1. Acessar https://vercel.com/<org>/admin-pipeelo/settings/environment-variables
2. Adicionar `JARVIS_ENABLED` = `true` em scope `Production`
3. Aguardar ~30s para serverless cold starts pegarem o novo valor

### Verificar branch ativo

```bash
$env:ADMIN_BASE_URL="https://admin.pipeelo.com"
$env:ONBOARDING_WEBHOOK_TOKEN="<prod_token>"

# Ping com payload sample (NAO causa side-effect — fixture session_id)
curl -X POST "$env:ADMIN_BASE_URL/api/clients/onboarding/create" `
  -H "Content-Type: application/json" `
  -H "Authorization: Bearer $env:ONBOARDING_WEBHOOK_TOKEN" `
  -d (Get-Content scripts/fixtures/sample-webhook-payload.json -Raw)
```

**Aceitar:** response JSON contem `data.mode = "jarvis"`.
**Rejeitar:** ainda em legacy -> aguardar mais 30s e re-tentar; persistindo, Step 5.

Anotar timestamp do flip on em `CUTOVER-LOG.md`.

---

## Step 2 — Aguardar 1 cliente novo (T+0 a T+24h)

> **NAO forcar.** Onboardings em andamento continuam path antigo (idempotency garantida pelo state machine — `lib/onboarding-state-machine.ts`).
> Primeira sessao NOVA usa Jarvis automaticamente.

### Acionar monitor

```bash
# admin-pipeelo, terminal dedicado
$env:NEXT_PUBLIC_SUPABASE_URL="<prod_url>"
$env:SUPABASE_SERVICE_ROLE_KEY="<prod_service_role>"

npx tsx scripts/cutover-monitor.ts --watch --window=60 --interval=30
```

Deixar rodando em terminal visivel. Stderr emite alertas criticos.

---

## Step 3 — Monitor 24h (T+0 a T+24h)

Acompanhar continuamente. Criterios go/no-go:

### GO (continua expandindo)

- Primeiro cliente Jarvis: tenant criado em api.pipeelo.com com `>=4 categorias` e `>=4 assistentes`
- Prompts gerados batem `>=7/8` regras DNA tom (rodar `threshold-check --window=24h --env=staging` apontando supabase prod read-only)
- Cliente recebeu email com magic link (Phase 5 UI-06)
- WhatsApp Felipe SEM alertas de falha
- `cutover-monitor` mostra `error_rate <5%` e zero `CROSS_TENANT_DETECTED`

### NO-GO (flip back imediato)

- Qualquer alerta `[CRITICAL] CROSS_TENANT_DETECTED`
- `error_rate >5%` sustentado por 2 ticks consecutivos
- Tenant criado faltando categoria essencial (financeiro/comercial/sac/tecnico)
- Felipe recebeu alerta WhatsApp
- Cliente reclamou via WhatsApp/email

-> ir para **Step 5 (Flip back)** imediatamente.

---

## Step 4 — Expandir (T+24h em diante)

Se Step 3 GO:

- [ ] Deixar `JARVIS_ENABLED=true` permanente
- [ ] Documentar cliente promovido em `CUTOVER-LOG.md`:
  - timestamp flip on
  - `session_id` do primeiro cliente
  - tenant_id final em api.pipeelo.com
  - count(categorias), count(assistentes)
  - 2 prompts paste para review
  - resultado threshold-check
  - decisao "expand"
- [ ] Proximos 5 clientes: monitor passivo via Phase 5 dashboard. Manter `cutover-monitor` rodando primeiras 72h.
- [ ] Notificar time pelo canal interno

---

## Step 5 — Flip BACK (se necessario, T+? a T+30s)

> Drill ja validou que isso roda em <30s. Confiar no procedimento.

```bash
# Opcao A — CLI rapida
vercel env rm JARVIS_ENABLED production
# Confirmar com `y`

# Opcao B — UI Vercel
# Settings -> Environment Variables -> JARVIS_ENABLED -> Delete
```

Mudanca propaga em <30s (validado no drill). Proximas requests usam `lib/onboarding-processor.ts` (legacy).

### Sessoes Jarvis em curso

- Deixar terminar OU
- ```sql
  UPDATE onboarding_sessions
  SET status='needs_review', last_error='cutover_rolled_back'
  WHERE status IN ('pending','running')
    AND created_at > '<flip_on_timestamp>';
  ```

### Documentar

- [ ] Causa raiz em `CUTOVER-LOG.md` ("Flip back")
- [ ] Abrir Plan 06-04 gap-closure: `/gsd:plan-phase 6 --gaps`
- [ ] Notificar time

---

## Step 6 — Post-mortem (T+48h)

### Caminho feliz (cutover OK)

- [ ] Marcar Phase 6 done em `ROADMAP.md`
- [ ] Marcar EVAL-05 + EVAL-06 done em `REQUIREMENTS.md`
- [ ] Atualizar `STATE.md` com decisao + metricas finais
- [ ] Manter `cutover-monitor` rodando primeira semana (sanity check)

### Caminho rolled back

- [ ] Documentar licoes aprendidas em `CUTOVER-LOG.md` -> Retrospective
- [ ] Plan 06-04 gap-closure aprovado e iniciado
- [ ] Phase 6 status = `gap_closure` em `STATE.md`

---

## Comandos de emergencia

| Situacao | Comando |
|----------|---------|
| Flip back urgente | `vercel env rm JARVIS_ENABLED production` |
| Forcar redeploy | `vercel --prod --force` |
| Pausar webhook (extremo) | bloquear ONBOARDING_WEBHOOK_TOKEN no Vercel env (rotacionar) |
| Inspecionar runs ultima 1h | `npx tsx scripts/cutover-monitor.ts --snapshot --window=60` |
| Threshold sob demanda | `npx tsx scripts/threshold-check.ts --window=24h --env=staging` (com env vars prod read-only) |

---

## Contatos

- **Felipe** — WhatsApp privado (gestor decisao)
- **Langfuse dashboard** — https://cloud.langfuse.com/project/<id>
- **Vercel project** — https://vercel.com/<org>/admin-pipeelo
- **Phase 5 painel** — https://admin.pipeelo.com/painel-onboarding (ou rota equivalente)

---

*Plan: 06-03*
*Versao: 1.0 (2026-05-08)*
