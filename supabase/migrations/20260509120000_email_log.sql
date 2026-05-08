-- =====================================================================
-- Plan 05-02 — email_log table + onboarding_sessions credentials cols
-- =====================================================================
-- Idempotência de envio transacional (Pitfall 7) + magic link 72h TTL
-- (Pitfall 7+9: nunca persistir senha plain).
--
-- email_log:
--   - idempotency_key UNIQUE: chave derivada de (template, sessionId)
--     OU custom (ex: 'reminder:'+sessionId+':'+yyyymmdd para escalation
--     diária do cron reminder-stalled).
--   - status check: 'sent' | 'failed' | 'skipped_idempotent'
--   - RLS bloqueia tudo via policy RESTRICTIVE — só service_role pula.
--
-- onboarding_sessions cols:
--   - credentials_token: opaco (nanoid 32) — não derivado de senha.
--   - credentials_token_expires_at: TTL 72h.
--   - credentials_email_sent_at: marca dispatch único do CredentialsReady.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.email_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID REFERENCES public.onboarding_sessions(id) ON DELETE CASCADE,
  template        TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  recipient       TEXT NOT NULL,
  resend_id       TEXT,
  status          TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'skipped_idempotent')),
  error           TEXT,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_log_session  ON public.email_log(session_id);
CREATE INDEX IF NOT EXISTS idx_email_log_template ON public.email_log(template);

-- RLS: service_role only (consistent com lock Phase 1)
ALTER TABLE public.email_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS email_log_service_only ON public.email_log;
CREATE POLICY email_log_service_only
  ON public.email_log
  AS RESTRICTIVE
  FOR ALL
  TO public
  USING (false);

-- ---------------------------------------------------------------------
-- Magic link 72h cols em onboarding_sessions
-- ---------------------------------------------------------------------
ALTER TABLE public.onboarding_sessions
  ADD COLUMN IF NOT EXISTS credentials_token             TEXT,
  ADD COLUMN IF NOT EXISTS credentials_token_expires_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS credentials_email_sent_at     TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_sessions_credentials_token
  ON public.onboarding_sessions(credentials_token)
  WHERE credentials_token IS NOT NULL;

COMMENT ON TABLE  public.email_log IS 'Log idempotente de envios transacionais (Plan 05-02). idempotency_key UNIQUE evita double-send em retries.';
COMMENT ON COLUMN public.onboarding_sessions.credentials_token IS 'Magic link token opaco (nanoid 32). NUNCA derivado de senha (Pitfall 7+9).';
