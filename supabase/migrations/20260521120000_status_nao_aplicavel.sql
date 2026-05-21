-- Adiciona 'nao_aplicavel' ao check constraint dos status_* de departamentos
-- que podem ser pulados quando modo=comercial (SAC/Geral, Financeiro, Suporte).
-- Identificação e Vendas sempre são obrigatórios, então mantemos o check original.

alter table public.onboarding_sessions
  drop constraint if exists onboarding_sessions_status_sac_geral_check;

alter table public.onboarding_sessions
  add constraint onboarding_sessions_status_sac_geral_check
  check (status_sac_geral in ('pendente', 'em_andamento', 'concluido', 'nao_aplicavel'));

alter table public.onboarding_sessions
  drop constraint if exists onboarding_sessions_status_financeiro_check;

alter table public.onboarding_sessions
  add constraint onboarding_sessions_status_financeiro_check
  check (status_financeiro in ('pendente', 'em_andamento', 'concluido', 'nao_aplicavel'));

alter table public.onboarding_sessions
  drop constraint if exists onboarding_sessions_status_suporte_check;

alter table public.onboarding_sessions
  add constraint onboarding_sessions_status_suporte_check
  check (status_suporte in ('pendente', 'em_andamento', 'concluido', 'nao_aplicavel'));

-- Backfill: sessões já criadas com modo='comercial' têm os 3 deptos extras
-- marcados como nao_aplicavel (não contam na progressão).
update public.onboarding_sessions
  set status_sac_geral = 'nao_aplicavel',
      status_financeiro = 'nao_aplicavel',
      status_suporte = 'nao_aplicavel'
  where modo = 'comercial'
    and status_sac_geral = 'pendente'
    and status_financeiro = 'pendente'
    and status_suporte = 'pendente';
