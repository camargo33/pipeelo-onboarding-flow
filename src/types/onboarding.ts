// Onboarding Types
export type QuestionType = 
  | 'text' 
  | 'textarea' 
  | 'number' 
  | 'currency' 
  | 'url' 
  | 'time' 
  | 'select' 
  | 'checkbox_multiple' 
  | 'info' 
  | 'info_link';

export interface QuestionOption {
  value: string;
  label: string;
}

export interface Question {
  id: string;
  pergunta: string;
  tipo: QuestionType;
  obrigatoria: boolean;
  opcoes?: QuestionOption[];
  validacao?: string;
  placeholder?: string;
  hint?: string;
  link?: string;
  texto?: string;
  condicional?: string;
}

export interface Section {
  titulo: string;
  icone: string;
  descricao?: string;
  perguntas: Question[];
}

export interface Departamento {
  nome: string;
  slug: string;
  responsavel_sugerido: string;
  tempo_estimado: string;
  descricao: string;
  ordem_execucao: number;
  secoes: Record<string, Section>;
}

export interface OnboardingStructure {
  total_departamentos: number;
  ordem_sugerida: string[];
  tempo_total_estimado: string;
  descricao: string;
}

export interface OnboardingData {
  onboarding_structure: OnboardingStructure;
  departamentos: Record<string, Departamento>;
}

export interface OnboardingSession {
  id: string;
  empresa_id: string;
  empresa_nome: string;
  ceo_email: string;
  status: 'em_andamento' | 'completo';
  created_at: string;
  completed_at: string | null;
  
  sac_geral_completo: boolean;
  sac_geral_respondido_por: string | null;
  sac_geral_respondido_em: string | null;
  
  financeiro_completo: boolean;
  financeiro_respondido_por: string | null;
  financeiro_respondido_em: string | null;
  
  suporte_completo: boolean;
  suporte_respondido_por: string | null;
  suporte_respondido_em: string | null;
  
  vendas_completo: boolean;
  vendas_respondido_por: string | null;
  vendas_respondido_em: string | null;
}

export interface OnboardingResposta {
  id: string;
  session_id: string;
  departamento: string;
  secao: string;
  pergunta_id: string;
  pergunta_texto: string;
  resposta: any;
  respondido_em: string;
  tipo_pergunta: string;
  obrigatoria: boolean;
}

export type DepartmentId = 'sac_geral' | 'financeiro' | 'suporte' | 'vendas';

export const DEPARTMENT_COLORS: Record<DepartmentId, string> = {
  sac_geral: 'pipeelo-purple',
  financeiro: 'pipeelo-green',
  suporte: 'pipeelo-blue',
  vendas: 'amber-500'
};

export const DEPARTMENT_ICONS: Record<DepartmentId, string> = {
  sac_geral: 'Building2',
  financeiro: 'DollarSign',
  suporte: 'Wrench',
  vendas: 'TrendingUp'
};
