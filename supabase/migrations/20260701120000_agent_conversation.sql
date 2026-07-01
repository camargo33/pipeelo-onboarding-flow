-- Onboarding V2 conversacional (agente de IA)
-- Histórico da conversa com a Arquiteta + insights de fluxo que vão além do
-- questionário (ex.: "não oferecemos TV", fluxo de cancelamento próprio).
-- Acesso apenas via service_role (mesmo padrão pós lock_rls_phase1).

CREATE TABLE public.onboarding_agent_messages (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.onboarding_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  -- Mensagem no formato OpenAI chat-completions (content, tool_calls, tool_call_id...)
  content JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_messages_session ON public.onboarding_agent_messages (session_id, id);

CREATE TABLE public.onboarding_agent_insights (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.onboarding_sessions(id) ON DELETE CASCADE,
  departamento TEXT,
  categoria TEXT NOT NULL,
  titulo TEXT NOT NULL,
  detalhe TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_insights_session ON public.onboarding_agent_insights (session_id);

ALTER TABLE public.onboarding_agent_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_agent_insights ENABLE ROW LEVEL SECURITY;
-- Sem policies: somente service_role acessa (Vercel Functions).
