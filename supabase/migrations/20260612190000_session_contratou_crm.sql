-- Sessão completa pode (ou não) incluir CRM contratado.
-- Selecionado pelo admin ao gerar o link; vai no payload final pro admin-pipeelo.
ALTER TABLE public.onboarding_sessions
  ADD COLUMN IF NOT EXISTS contratou_crm boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.onboarding_sessions.contratou_crm IS
  'Cliente contratou o CRM junto do onboarding completo (escolhido pelo admin ao criar a sessão)';
