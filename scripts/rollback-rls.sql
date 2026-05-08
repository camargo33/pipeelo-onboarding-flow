-- ROLLBACK Phase 1 lock: recreate public policies (rede de segurança)
--
-- USO:
--   psql "$SUPABASE_DB_URL" -f scripts/rollback-rls.sql
--
-- IMPORTANTE: aplicar SOMENTE se monitoramento mostrar 401/403/permission_denied
-- em massa pós-lock (Vercel logs / Supabase logs / Sentry).
--
-- Após rollback: investigar causa raiz (qual call site ainda usa anon key?),
-- NÃO redeployar lock até descobrir o miss.
--
-- Tempo médio de aplicação: <30s. SLA: <5min do incidente até policies restauradas.

BEGIN;

-- 1. Drop policy de lock (se aplicada)
DROP POLICY IF EXISTS "service_role only" ON public.onboarding_sessions;
DROP POLICY IF EXISTS "service_role only" ON public.onboarding_respostas;

-- 2. Recreate policies de relax (mesma forma de 20260419120000_relax_rls_for_testing.sql).
--    DELETE continua restrito (só service_role) — não recriamos policy de DELETE.
CREATE POLICY "public read sessions" ON public.onboarding_sessions
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public insert sessions" ON public.onboarding_sessions
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "public update sessions" ON public.onboarding_sessions
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "public read respostas" ON public.onboarding_respostas
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public insert respostas" ON public.onboarding_respostas
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "public update respostas" ON public.onboarding_respostas
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- 3. RLS continua habilitado — policies permissive abrem leitura/escrita anon mas RLS está ON.
ALTER TABLE public.onboarding_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_respostas ENABLE ROW LEVEL SECURITY;

COMMIT;

-- Verificação pós-rollback:
--   SELECT tablename, policyname, permissive, roles
--   FROM pg_policies
--   WHERE tablename IN ('onboarding_sessions','onboarding_respostas');
-- Esperado: 6 policies "public {read|insert|update} {sessions|respostas}", permissive='PERMISSIVE'.
