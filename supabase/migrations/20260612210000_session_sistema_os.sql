-- Sistema de OS / Campo (LTSoft/Phoenix etc.) na stack tecnológica da sessão.
-- Necessário pros agentes de pós-instalação e pós-suporte (gatilho = fechamento de OS).
ALTER TABLE public.onboarding_sessions
  ADD COLUMN IF NOT EXISTS sistema_os text;

COMMENT ON COLUMN public.onboarding_sessions.sistema_os IS
  'Sistema de ordens de serviço/campo do ISP (LTSoft (Phoenix), Módulo do próprio ERP, Outros)';
