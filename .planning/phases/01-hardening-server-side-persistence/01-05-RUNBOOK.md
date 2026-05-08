# Runbook — Phase 1 Lock RLS Migration

**Risco:** ALTO — RLS aperta em produção. Pode quebrar fluxo onboarding se houver call site anon esquecido em qualquer página/endpoint.
**Tempo total estimado:** 30 minutos (incluindo smoke + rollback drill em staging).
**Janela recomendada:** Manhã BRT (9h-11h) — baixo tráfego de onboarding.
**Rollback target:** <5 minutos do incidente até policies restauradas.

---

## Pré-condições obrigatórias (TODAS green antes de chamar Felipe)

- [ ] `npm test -- --run` → todos os testes verdes (102+ passing, 0 failing)
- [ ] `npm run audit:no-supabase-from` → exit 0 (HARD-01 gate fechado)
- [ ] `cat .planning/phases/01-hardening-server-side-persistence/01-03-SUMMARY.md` confirma 4 pages refatoradas (Onboarding, OnboardingSession, NovoOnboarding, AdminOnboarding)
- [ ] `cat .planning/phases/01-hardening-server-side-persistence/01-04-SUMMARY.md` confirma rate-limit + Turnstile + BrasilAPI + ProgressBar /5 ativos
- [ ] Vercel preview deploy da branch atual está verde (sem erros build/runtime)
- [ ] `SUPABASE_STAGING_URL`, `SUPABASE_STAGING_ANON_KEY`, `SUPABASE_STAGING_DB_URL` configurados em `.env.local` (ver template abaixo)
- [ ] `SUPABASE_PROD_DB_URL` em variável local segura (NÃO committar) — referência para Etapa 5

### Template `.env.local` (não committar)

```bash
# Staging — apply + smoke + drill
SUPABASE_STAGING_URL=https://<staging-project>.supabase.co
SUPABASE_STAGING_ANON_KEY=eyJ...
SUPABASE_STAGING_DB_URL=postgresql://postgres.<ref>:<pass>@aws-0-...:6543/postgres

# Prod — apenas no momento da cutover
SUPABASE_PROD_DB_URL=postgresql://postgres.<ref>:<pass>@aws-0-...:6543/postgres
```

---

## Sequência de aplicação

### Etapa 1 — Smoke staging (PRE-LOCK)

Confirmar que sessão funciona ANTES de apertar. Se falhar aqui, problema não é RLS.

1. Deploy preview da branch atual no Vercel apontando para Supabase staging
2. Criar sessão em `https://<preview>.vercel.app/novo` com CNPJ teste (`11222333000181`)
3. Preencher 5 perguntas de Identificação
4. Concluir Identificação → confirmar `status_identificacao=concluido` no Supabase
5. Avançar para Financeiro → preencher 3 perguntas → fechar aba
6. Reabrir URL com `?token=<access_token>` (extrair do redirect ou DB)
7. Confirmar respostas presentes
8. **GATE:** se passar → seguir Etapa 2. Se falhar → corrigir bug, NÃO continuar com lock.

### Etapa 2 — Aplicar lock em STAGING

```bash
# No diretório do projeto:
psql "$SUPABASE_STAGING_DB_URL" -f supabase/migrations/20260508120000_lock_rls_phase1.sql

# Verificar policies pós-lock:
psql "$SUPABASE_STAGING_DB_URL" -c "SELECT tablename, policyname, permissive, roles FROM pg_policies WHERE tablename LIKE 'onboarding_%';"
```

**Esperado:** 1 policy `service_role only` por tabela, `permissive=RESTRICTIVE`, `roles={anon,authenticated}`.

### Etapa 3 — Validar lock em staging

```bash
# Test integração — anon key denied
npm test -- --run tests/rls/onboarding-sessions.test.ts
```

**Esperado:** anon SELECT retorna 0 rows OU permission denied; INSERT/UPDATE retornam erro `42501`.

Refazer smoke (Etapa 1, passos 2-7) com staging pós-lock.

**GATE:** se passar → Etapa 4. Se falhar → rollback IMEDIATO (Etapa 6).

### Etapa 4 — Rollback drill (em staging)

Confirma que rollback funciona ANTES de aplicar em prod.

```bash
# Aplicar rollback
time psql "$SUPABASE_STAGING_DB_URL" -f scripts/rollback-rls.sql

# Re-aplicar lock
time psql "$SUPABASE_STAGING_DB_URL" -f supabase/migrations/20260508120000_lock_rls_phase1.sql
```

Tempo medido (rollback): _____ segundos. **Se >5min → investigar antes de prod.**

### Etapa 5 — Aplicar em PROD

**CHECKPOINT HUMANO** — Felipe confirma:
- [ ] Janela de baixo tráfego confirmada
- [ ] Vercel logs aberto pra monitorar
- [ ] Terminal pronto com `SUPABASE_PROD_DB_URL` exportado
- [ ] `scripts/rollback-rls.sql` aberto em segunda aba (cópia de segurança)

```bash
psql "$SUPABASE_PROD_DB_URL" -f supabase/migrations/20260508120000_lock_rls_phase1.sql

# Validar imediatamente:
psql "$SUPABASE_PROD_DB_URL" -c "SELECT tablename, policyname, permissive, roles FROM pg_policies WHERE tablename LIKE 'onboarding_%';"
```

### Etapa 6 — Smoke prod + monitoramento (30 minutos)

- [ ] Criar sessão de teste em `/novo` (Felipe via celular ou colaborador)
- [ ] Preencher Identificação → status_identificacao = concluido
- [ ] Logar magic link em janela anônima → respostas carregam
- [ ] Tentar avançar para Financeiro → cards renderizam (gate UI funciona)
- [ ] Concluir Financeiro → status_financeiro = concluido
- [ ] Verificar `pg_policies` em prod confirma 'service_role only' RESTRICTIVE

**Janela de monitoramento (30 min):**
- Vercel logs: filtrar `401`, `403`, `permission_denied`, `42501`
- Supabase logs: filtrar policy violations
- Sentry/console: spike de erros pós-deploy

### Etapa 7 — Rollback prod (somente se incidente)

```bash
psql "$SUPABASE_PROD_DB_URL" -f scripts/rollback-rls.sql
```

Investigar causa raiz (qual call site? qual endpoint?). NÃO re-aplicar lock até identificar o miss.

---

## Critérios para "approved" no checkpoint

- [ ] Smoke staging PRE-LOCK passou
- [ ] Migration aplicou sem erro em staging
- [ ] `tests/rls/onboarding-sessions.test.ts` verde com env staging
- [ ] Smoke staging POST-LOCK passou
- [ ] Rollback drill <5min
- [ ] Migration aplicou sem erro em PROD
- [ ] Smoke prod passou
- [ ] 30min monitoramento sem spike anormal de erros

Se **qualquer** falhar: rollback IMEDIATO (Etapa 7), investigar antes de re-aplicar.

---

## Comunicação ao time

**Antes da cutover:** "Vou aplicar lock RLS Phase 1 em prod em ~30min. Janela manhã. Rollback testado em staging. Se vir erro 401/403 em onboarding, me avise imediatamente."

**Pós-cutover (sucesso):** "Lock RLS Phase 1 aplicado em prod. HARD-08 + HARD-09 fechados. Phase 1 done."

**Pós-rollback (incidente):** "Rollback Phase 1 aplicado às HHhMM. Causa em investigação. Sessões funcionando via policies relax (estado pré-Plan 05)."
