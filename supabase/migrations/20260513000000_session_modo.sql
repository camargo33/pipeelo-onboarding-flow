-- Adiciona coluna `modo` em onboarding_sessions.
-- Define se o cliente recebeu o link Completo (todos deptos) ou Comercial
-- (apenas Vendas / CRM). Usado pra decidir quando disparar notificação
-- WhatsApp de "onboarding concluído".

alter table public.onboarding_sessions
  add column if not exists modo text
    not null default 'completo'
    check (modo in ('completo', 'comercial'));

comment on column public.onboarding_sessions.modo is
  'Modo do onboarding: completo (todos departamentos) ou comercial (apenas Vendas/CRM). Setado quando admin gera o shortlink.';

-- Coluna pra evitar disparar notificação de conclusão mais de uma vez
-- por sessão (idempotência).
alter table public.onboarding_sessions
  add column if not exists notificacao_conclusao_enviada_at timestamptz;
