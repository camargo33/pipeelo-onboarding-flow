-- Onboarding V2: fluxos de atendimento montados e confirmados na conversa.
-- Insights com flow_id são fluxos confirmados (categoria 'fluxo_confirmado') e
-- servem de gate do complete_department (não conclui etapa com fluxo pendente).

ALTER TABLE public.onboarding_agent_insights ADD COLUMN flow_id TEXT;
