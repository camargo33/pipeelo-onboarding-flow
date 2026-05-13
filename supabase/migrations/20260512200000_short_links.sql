-- Encurtador de URLs próprio do onboarding.
-- Permite gerar links curtos como onboarding.pipeelo.com/s/aB3xK9
-- que redirecionam pro link completo (com slug + token + modo).

create table if not exists public.short_links (
  code         text primary key,
  target_url   text not null,
  session_id   uuid references public.onboarding_sessions(id) on delete cascade,
  modo         text check (modo in ('completo', 'comercial')),
  click_count  int  not null default 0,
  created_at   timestamptz not null default now(),
  last_click_at timestamptz
);

create index if not exists short_links_session_idx on public.short_links(session_id);

alter table public.short_links enable row level security;

-- Sem policies pra anon/authenticated — só service_role (server-side) lê/escreve.
-- O handler /s/:code roda com service role e o admin endpoint exige Bearer JWT admin.

comment on table public.short_links is
  'Encurtador interno. Gerado pelo /admin, resolvido pelo handler GET /s/:code.';

-- RPC pra incrementar click_count + last_click_at de forma atômica (evita race
-- entre múltiplos cliques simultâneos).
create or replace function public.short_link_register_click(p_code text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.short_links
     set click_count = click_count + 1,
         last_click_at = now()
   where code = p_code;
$$;

revoke all on function public.short_link_register_click(text) from public;
grant execute on function public.short_link_register_click(text) to service_role;
