-- Reverte 20260612210000: categoria "Sistema de OS / Campo" descartada
-- (LTSoft é caso único da INNON, tratado manualmente — decisão Felipe 12/jun).
ALTER TABLE public.onboarding_sessions
  DROP COLUMN IF EXISTS sistema_os;
