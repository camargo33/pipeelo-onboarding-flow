-- HOTFIX: afrouxar RLS pra permitir testing do frontend direto via anon key.
-- Migração futura moverá tudo pra /api/* (service_role) e reapertará.

ALTER POLICY "service_role only" ON public.onboarding_sessions
  RENAME TO "anon read-write (legacy from lovable)";

ALTER POLICY "service_role only" ON public.onboarding_respostas
  RENAME TO "anon read-write (legacy from lovable)";

DROP POLICY IF EXISTS "anon read-write (legacy from lovable)" ON public.onboarding_sessions;
DROP POLICY IF EXISTS "anon read-write (legacy from lovable)" ON public.onboarding_respostas;

-- Permissive: anon/authenticated podem SELECT/INSERT/UPDATE.
-- DELETE continua restrito (só service_role).
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
