-- Idempotência do "promote-to-board": registra quando o card foi criado
-- no client_board do admin-pipeelo (coluna "Novo Cliente"). Helper
-- promote-to-board.ts só dispara se essa coluna estiver NULL.

alter table public.onboarding_sessions
  add column if not exists card_created_at timestamptz;

comment on column public.onboarding_sessions.card_created_at is
  'Timestamp da criação do card no client_board do admin-pipeelo (idempotência). NULL = ainda não criado.';
