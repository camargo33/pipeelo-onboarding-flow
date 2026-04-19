-- Fase A/C: adicionar colunas para vincular sessão ao tenant Pipeelo criado via admin-pipeelo
-- e novo departamento "identificacao" (primeiro bloqueante)

ALTER TABLE public.onboarding_sessions
  ADD COLUMN IF NOT EXISTS tenant_id TEXT,
  ADD COLUMN IF NOT EXISTS pipeelo_token TEXT,
  ADD COLUMN IF NOT EXISTS cnpj TEXT,
  ADD COLUMN IF NOT EXISTS razao_social TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_business TEXT,
  ADD COLUMN IF NOT EXISTS admin_email TEXT,
  ADD COLUMN IF NOT EXISTS tipo_empresa TEXT,
  ADD COLUMN IF NOT EXISTS status_identificacao TEXT DEFAULT 'pendente'
    CHECK (status_identificacao IN ('pendente', 'em_andamento', 'concluido')),
  ADD COLUMN IF NOT EXISTS responsavel_identificacao TEXT,
  ADD COLUMN IF NOT EXISTS concluido_identificacao_at TIMESTAMP WITH TIME ZONE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_onboarding_sessions_cnpj
  ON public.onboarding_sessions(cnpj)
  WHERE cnpj IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_tenant_id
  ON public.onboarding_sessions(tenant_id)
  WHERE tenant_id IS NOT NULL;

-- Endurecer RLS: trocar policies públicas por service_role only
-- O app acessa via API Routes Vercel (server-side) com service_role, nunca do browser

DROP POLICY IF EXISTS "Allow public select onboarding_sessions" ON public.onboarding_sessions;
DROP POLICY IF EXISTS "Allow public insert onboarding_sessions" ON public.onboarding_sessions;
DROP POLICY IF EXISTS "Allow public update onboarding_sessions" ON public.onboarding_sessions;
DROP POLICY IF EXISTS "Allow public delete onboarding_sessions" ON public.onboarding_sessions;

DROP POLICY IF EXISTS "Allow public select onboarding_respostas" ON public.onboarding_respostas;
DROP POLICY IF EXISTS "Allow public insert onboarding_respostas" ON public.onboarding_respostas;
DROP POLICY IF EXISTS "Allow public update onboarding_respostas" ON public.onboarding_respostas;
DROP POLICY IF EXISTS "Allow public delete onboarding_respostas" ON public.onboarding_respostas;

-- service_role bypassa RLS por padrão; criamos policy restritiva pra garantir que anon/authenticated não vejam nada
CREATE POLICY "service_role only" ON public.onboarding_sessions
  AS RESTRICTIVE FOR ALL
  TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY "service_role only" ON public.onboarding_respostas
  AS RESTRICTIVE FOR ALL
  TO anon, authenticated
  USING (false) WITH CHECK (false);
