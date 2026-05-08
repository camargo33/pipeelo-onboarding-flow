-- Phase 1 HARD-08/HARD-09: revert relax_rls_for_testing.sql
-- Lock RLS to service_role only on onboarding_sessions + onboarding_respostas
--
-- Pré-condições (validar antes de aplicar):
--   1. Audit script HARD-01 verde: zero supabase.from(onboarding_*) em src/
--      ($ npm run audit:no-supabase-from → exit 0)
--   2. Smoke staging completou sessão end-to-end via /api/sessions/*
--   3. Equipe sabe do scripts/rollback-rls.sql (rede de segurança em <5min)
--
-- Refs:
--   - 20260419000000_identificacao_and_tenant_link.sql (policy original)
--   - 20260419120000_relax_rls_for_testing.sql (a reverter)
--   - .planning/phases/01-hardening-server-side-persistence/01-05-RUNBOOK.md

BEGIN;

-- 1. Drop public policies criadas em 20260419120000_relax_rls_for_testing.sql
DROP POLICY IF EXISTS "public read sessions"   ON public.onboarding_sessions;
DROP POLICY IF EXISTS "public insert sessions" ON public.onboarding_sessions;
DROP POLICY IF EXISTS "public update sessions" ON public.onboarding_sessions;

DROP POLICY IF EXISTS "public read respostas"   ON public.onboarding_respostas;
DROP POLICY IF EXISTS "public insert respostas" ON public.onboarding_respostas;
DROP POLICY IF EXISTS "public update respostas" ON public.onboarding_respostas;

-- 2. Drop service_role policies anteriores se existirem (idempotente)
DROP POLICY IF EXISTS "service_role only" ON public.onboarding_sessions;
DROP POLICY IF EXISTS "service_role only" ON public.onboarding_respostas;

-- 3. Recreate service_role only AS RESTRICTIVE
--    USING (false) + WITH CHECK (false) bloqueia anon/authenticated 100%.
--    service_role bypass RLS por design — endpoints /api/sessions/* continuam funcionando.
CREATE POLICY "service_role only" ON public.onboarding_sessions
  AS RESTRICTIVE FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY "service_role only" ON public.onboarding_respostas
  AS RESTRICTIVE FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- 4. Garante RLS habilitado (não-op se já estava — defesa em profundidade)
ALTER TABLE public.onboarding_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_respostas ENABLE ROW LEVEL SECURITY;

COMMIT;

-- Verificação manual (rodar separado após apply):
--   SELECT tablename, policyname, permissive, roles, qual, with_check
--   FROM pg_policies
--   WHERE tablename IN ('onboarding_sessions','onboarding_respostas');
-- Esperado: única policy 'service_role only' por tabela,
--   permissive='RESTRICTIVE', roles={anon,authenticated}, qual='false', with_check='false'.
