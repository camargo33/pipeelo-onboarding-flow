-- Dados comerciais do deal, preenchidos pelo admin na criação do link.
-- Todos opcionais; entram no payload final como session.comercial.
ALTER TABLE public.onboarding_sessions
  ADD COLUMN IF NOT EXISTS valor_sessao numeric(10,2),
  ADD COLUMN IF NOT EXISTS qtd_sessoes integer,
  ADD COLUMN IF NOT EXISTS valor_mensal numeric(12,2),
  ADD COLUMN IF NOT EXISTS dia_vencimento smallint,
  ADD COLUMN IF NOT EXISTS observacoes text;

ALTER TABLE public.onboarding_sessions
  DROP CONSTRAINT IF EXISTS onboarding_sessions_dia_vencimento_check;
ALTER TABLE public.onboarding_sessions
  ADD CONSTRAINT onboarding_sessions_dia_vencimento_check
  CHECK (dia_vencimento IS NULL OR (dia_vencimento BETWEEN 1 AND 31));
