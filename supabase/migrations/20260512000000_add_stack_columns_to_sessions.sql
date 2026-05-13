-- Adiciona colunas de stack tecnológica (preenchidas pelo admin no painel)
ALTER TABLE public.onboarding_sessions
  ADD COLUMN IF NOT EXISTS erp TEXT,
  ADD COLUMN IF NOT EXISTS mapas TEXT,
  ADD COLUMN IF NOT EXISTS gerenciamento_rede TEXT;
