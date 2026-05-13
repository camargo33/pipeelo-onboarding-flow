-- Alinha gateway_pagamento com o padrão de `modo`: enum validado no DB.
-- O Zod já valida no endpoint mas isso protege contra escrita direta via
-- service_role / SQL manual / admin panel do Supabase.

alter table public.onboarding_sessions
  drop constraint if exists onboarding_sessions_gateway_pagamento_check;

alter table public.onboarding_sessions
  add constraint onboarding_sessions_gateway_pagamento_check
  check (gateway_pagamento is null or gateway_pagamento in ('7AZ (Bemobi)', 'Outros'));
