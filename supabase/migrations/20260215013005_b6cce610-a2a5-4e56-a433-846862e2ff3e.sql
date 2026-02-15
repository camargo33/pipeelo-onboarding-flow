
DROP POLICY IF EXISTS "Allow public delete onboarding_sessions" ON public.onboarding_sessions;
DROP POLICY IF EXISTS "Allow public insert onboarding_sessions" ON public.onboarding_sessions;
DROP POLICY IF EXISTS "Allow public read onboarding_sessions" ON public.onboarding_sessions;
DROP POLICY IF EXISTS "Allow public update onboarding_sessions" ON public.onboarding_sessions;

DROP POLICY IF EXISTS "Allow public delete onboarding_respostas" ON public.onboarding_respostas;
DROP POLICY IF EXISTS "Allow public insert onboarding_respostas" ON public.onboarding_respostas;
DROP POLICY IF EXISTS "Allow public read onboarding_respostas" ON public.onboarding_respostas;
DROP POLICY IF EXISTS "Allow public update onboarding_respostas" ON public.onboarding_respostas;

CREATE POLICY "Allow public select onboarding_sessions" ON public.onboarding_sessions AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "Allow public insert onboarding_sessions" ON public.onboarding_sessions AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Allow public update onboarding_sessions" ON public.onboarding_sessions AS PERMISSIVE FOR UPDATE TO public USING (true);
CREATE POLICY "Allow public delete onboarding_sessions" ON public.onboarding_sessions AS PERMISSIVE FOR DELETE TO public USING (true);

CREATE POLICY "Allow public select onboarding_respostas" ON public.onboarding_respostas AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "Allow public insert onboarding_respostas" ON public.onboarding_respostas AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Allow public update onboarding_respostas" ON public.onboarding_respostas AS PERMISSIVE FOR UPDATE TO public USING (true);
CREATE POLICY "Allow public delete onboarding_respostas" ON public.onboarding_respostas AS PERMISSIVE FOR DELETE TO public USING (true);
