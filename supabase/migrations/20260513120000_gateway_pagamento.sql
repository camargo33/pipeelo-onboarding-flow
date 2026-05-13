-- Adiciona coluna `gateway_pagamento` em onboarding_sessions.
-- Captura o gateway que o cliente usa (ex: 7AZ/Bemobi). A partir disso, o
-- onboarding pergunta as credenciais específicas no departamento Identificação
-- (seção Acessos das Integrações).

alter table public.onboarding_sessions
  add column if not exists gateway_pagamento text;

comment on column public.onboarding_sessions.gateway_pagamento is
  'Gateway de pagamentos usado pelo cliente (7AZ/Bemobi, Outros, etc). Define quais credenciais pedir na Identificação.';
