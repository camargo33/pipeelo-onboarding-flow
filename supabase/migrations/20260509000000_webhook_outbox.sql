-- Phase 2 Plan 02-02: webhook outbox + reconciliation
-- PIPE-04, PIPE-05, PIPE-06: tabela transacional que garante delivery do webhook
-- complete-onboarding mesmo com falha de rede no momento do POST.
--
-- Contrato:
--   1. enqueueOutbox grava 1 row pending por session_id ANTES de qualquer fetch.
--   2. Sender tenta entrega inline (best-effort) e marca delivered ou failed_attempt.
--   3. Cron /api/cron/reconcile-webhooks (5min) drena pending com next_retry_at <= now().
--   4. Idempotency: session_id UNIQUE + receiver dedupe via upsert por session_id.

create table if not exists public.webhook_outbox (
  id uuid primary key default gen_random_uuid(),
  session_id text not null unique,
  target_url text not null,
  payload jsonb not null,
  status text not null default 'pending'
    check (status in ('pending','in_flight','delivered','failed')),
  attempt_count int not null default 0,
  max_attempts int not null default 6,
  last_error text,
  next_retry_at timestamptz not null default now(),
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Drain query do cron: WHERE status='pending' AND next_retry_at <= now() ORDER BY next_retry_at ASC
create index if not exists idx_webhook_outbox_status_next_retry
  on public.webhook_outbox(status, next_retry_at)
  where status = 'pending';

-- Lookup por session_id (idempotency check no enqueue)
create index if not exists idx_webhook_outbox_session_id
  on public.webhook_outbox(session_id);

-- RLS estrita: zero acesso anon/authenticated. Somente service_role (que bypassa RLS) opera.
alter table public.webhook_outbox enable row level security;

-- Policies restritivas — bloqueiam tudo para roles não-service.
-- service_role bypassa RLS por padrão no Supabase.
drop policy if exists "service_role_only_select" on public.webhook_outbox;
create policy "service_role_only_select" on public.webhook_outbox
  as restrictive for select to public using (false);

drop policy if exists "service_role_only_insert" on public.webhook_outbox;
create policy "service_role_only_insert" on public.webhook_outbox
  as restrictive for insert to public with check (false);

drop policy if exists "service_role_only_update" on public.webhook_outbox;
create policy "service_role_only_update" on public.webhook_outbox
  as restrictive for update to public using (false) with check (false);

drop policy if exists "service_role_only_delete" on public.webhook_outbox;
create policy "service_role_only_delete" on public.webhook_outbox
  as restrictive for delete to public using (false);

-- updated_at trigger
create or replace function public.update_webhook_outbox_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_webhook_outbox_updated_at on public.webhook_outbox;
create trigger trg_webhook_outbox_updated_at
  before update on public.webhook_outbox
  for each row execute function public.update_webhook_outbox_updated_at();

comment on table public.webhook_outbox is
  'Outbox transacional para webhook complete-onboarding (Plan 02-02). Sender grava antes de POSTar; cron reconcile drena pending. RLS estrita: somente service_role.';
