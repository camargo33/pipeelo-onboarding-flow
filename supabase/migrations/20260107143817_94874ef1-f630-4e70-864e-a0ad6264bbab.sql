-- Tabela para sessões de onboarding (uma por empresa)
CREATE TABLE public.onboarding_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_nome TEXT NOT NULL,
  ceo_email TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Status por departamento
  status_sac_geral TEXT DEFAULT 'pendente' CHECK (status_sac_geral IN ('pendente', 'em_andamento', 'concluido')),
  status_financeiro TEXT DEFAULT 'pendente' CHECK (status_financeiro IN ('pendente', 'em_andamento', 'concluido')),
  status_suporte TEXT DEFAULT 'pendente' CHECK (status_suporte IN ('pendente', 'em_andamento', 'concluido')),
  status_vendas TEXT DEFAULT 'pendente' CHECK (status_vendas IN ('pendente', 'em_andamento', 'concluido')),
  
  -- Responsáveis que preencheram cada departamento
  responsavel_sac_geral TEXT,
  responsavel_financeiro TEXT,
  responsavel_suporte TEXT,
  responsavel_vendas TEXT,
  
  -- Datas de conclusão
  concluido_sac_geral_at TIMESTAMP WITH TIME ZONE,
  concluido_financeiro_at TIMESTAMP WITH TIME ZONE,
  concluido_suporte_at TIMESTAMP WITH TIME ZONE,
  concluido_vendas_at TIMESTAMP WITH TIME ZONE
);

-- Tabela para respostas individuais
CREATE TABLE public.onboarding_respostas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.onboarding_sessions(id) ON DELETE CASCADE,
  departamento TEXT NOT NULL,
  pergunta_id TEXT NOT NULL,
  resposta JSONB,
  tipo_pergunta TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  UNIQUE(session_id, departamento, pergunta_id)
);

-- Enable RLS
ALTER TABLE public.onboarding_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_respostas ENABLE ROW LEVEL SECURITY;

-- Políticas públicas (onboarding não requer autenticação)
CREATE POLICY "Allow public read onboarding_sessions" 
ON public.onboarding_sessions FOR SELECT USING (true);

CREATE POLICY "Allow public insert onboarding_sessions" 
ON public.onboarding_sessions FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update onboarding_sessions" 
ON public.onboarding_sessions FOR UPDATE USING (true);

CREATE POLICY "Allow public read onboarding_respostas" 
ON public.onboarding_respostas FOR SELECT USING (true);

CREATE POLICY "Allow public insert onboarding_respostas" 
ON public.onboarding_respostas FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update onboarding_respostas" 
ON public.onboarding_respostas FOR UPDATE USING (true);

-- Índices para performance
CREATE INDEX idx_onboarding_respostas_session ON public.onboarding_respostas(session_id);
CREATE INDEX idx_onboarding_respostas_departamento ON public.onboarding_respostas(departamento);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_onboarding_sessions_updated_at
BEFORE UPDATE ON public.onboarding_sessions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();