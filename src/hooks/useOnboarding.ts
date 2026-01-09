import { useState, useCallback, useMemo } from 'react';
import { Question, DepartmentId } from '@/types/onboarding';
import onboardingData from '@/lib/questions.json';

export interface OnboardingState {
  empresaNome: string;
  departamento: DepartmentId | null;
  currentSectionIndex: number;
  currentQuestionIndex: number;
  respostas: Record<string, any>;
  responsavelNome: string;
}

export function useOnboarding() {
  const [state, setState] = useState<OnboardingState>({
    empresaNome: '',
    departamento: null,
    currentSectionIndex: 0,
    currentQuestionIndex: 0,
    respostas: {},
    responsavelNome: ''
  });

  const departamentoData = useMemo(() => {
    if (!state.departamento) return null;
    return onboardingData.departamentos[state.departamento];
  }, [state.departamento]);

  const sections = useMemo(() => {
    if (!departamentoData) return [];
    return Object.entries(departamentoData.secoes).map(([key, section]) => ({
      id: key,
      ...section
    }));
  }, [departamentoData]);

  const currentSection = sections[state.currentSectionIndex];

  const visibleQuestions = useMemo(() => {
    if (!currentSection) return [];
    return currentSection.perguntas.filter((q: Question) => {
      if (!q.condicional) return true;
      return evaluateConditional(q.condicional, state.respostas);
    });
  }, [currentSection, state.respostas]);

  const currentQuestion = visibleQuestions[state.currentQuestionIndex];

  const allQuestions = useMemo(() => {
    return sections.flatMap(section => 
      section.perguntas.filter((q: Question) => {
        if (!q.condicional) return true;
        return evaluateConditional(q.condicional, state.respostas);
      })
    );
  }, [sections, state.respostas]);

  const totalQuestions = allQuestions.length;
  
  const answeredQuestions = useMemo(() => {
    return allQuestions.filter(q => {
      const resposta = state.respostas[q.id];
      if (q.tipo === 'info' || q.tipo === 'info_link') return true;
      return resposta !== undefined && resposta !== '' && resposta !== null;
    }).length;
  }, [allQuestions, state.respostas]);

  const progress = totalQuestions > 0 ? (answeredQuestions / totalQuestions) * 100 : 0;

  const setEmpresaNome = useCallback((nome: string) => {
    setState(prev => ({ ...prev, empresaNome: nome }));
  }, []);

  const setDepartamento = useCallback((dept: DepartmentId) => {
    setState(prev => ({ 
      ...prev, 
      departamento: dept,
      currentSectionIndex: 0,
      currentQuestionIndex: 0
    }));
  }, []);

  const setResposta = useCallback((questionId: string, value: any) => {
    setState(prev => ({
      ...prev,
      respostas: { ...prev.respostas, [questionId]: value }
    }));
  }, []);

  const nextQuestion = useCallback(() => {
    setState(prev => {
      if (prev.currentQuestionIndex < visibleQuestions.length - 1) {
        return { ...prev, currentQuestionIndex: prev.currentQuestionIndex + 1 };
      } else if (prev.currentSectionIndex < sections.length - 1) {
        return { 
          ...prev, 
          currentSectionIndex: prev.currentSectionIndex + 1,
          currentQuestionIndex: 0
        };
      }
      return prev;
    });
  }, [visibleQuestions.length, sections.length]);

  const previousQuestion = useCallback(() => {
    setState(prev => {
      if (prev.currentQuestionIndex > 0) {
        return { ...prev, currentQuestionIndex: prev.currentQuestionIndex - 1 };
      } else if (prev.currentSectionIndex > 0) {
        const prevSectionQuestions = sections[prev.currentSectionIndex - 1].perguntas.filter(
          (q: Question) => !q.condicional || evaluateConditional(q.condicional, prev.respostas)
        );
        return { 
          ...prev, 
          currentSectionIndex: prev.currentSectionIndex - 1,
          currentQuestionIndex: prevSectionQuestions.length - 1
        };
      }
      return prev;
    });
  }, [sections]);

  const isFirstQuestion = state.currentSectionIndex === 0 && state.currentQuestionIndex === 0;
  
  const isLastQuestion = state.currentSectionIndex === sections.length - 1 && 
    state.currentQuestionIndex === visibleQuestions.length - 1;

  const setResponsavelNome = useCallback((nome: string) => {
    setState(prev => ({ ...prev, responsavelNome: nome }));
  }, []);

  const resetOnboarding = useCallback(() => {
    setState({
      empresaNome: '',
      departamento: null,
      currentSectionIndex: 0,
      currentQuestionIndex: 0,
      respostas: {},
      responsavelNome: ''
    });
  }, []);

  return {
    state,
    departamentoData,
    sections,
    currentSection,
    currentQuestion,
    visibleQuestions,
    totalQuestions,
    answeredQuestions,
    progress,
    isFirstQuestion,
    isLastQuestion,
    setEmpresaNome,
    setDepartamento,
    setResposta,
    nextQuestion,
    previousQuestion,
    setResponsavelNome,
    resetOnboarding
  };
}

function evaluateConditional(condicional: string, respostas: Record<string, any>): boolean {
  try {
    // Handle "includes" pattern: "departamentos_lista includes 'outro'"
    if (condicional.includes(' includes ')) {
      const [campo, valorRaw] = condicional.split(' includes ');
      const valor = valorRaw.replace(/'/g, '').trim();
      const resposta = respostas[campo.trim()];
      
      // Handle checkbox_multiple that stores { selected: [], outroTexto: '' }
      if (resposta && typeof resposta === 'object' && 'selected' in resposta) {
        return Array.isArray(resposta.selected) && resposta.selected.includes(valor);
      }
      
      if (Array.isArray(resposta)) {
        return resposta.includes(valor);
      }
      return false;
    }

    // Handle "||" pattern: "taxa_instalacao == 'sim' || taxa_instalacao == 'promocional'"
    if (condicional.includes(' || ')) {
      const conditions = condicional.split(' || ');
      return conditions.some(cond => evaluateConditional(cond.trim(), respostas));
    }

    // Handle "==" pattern: "tem_plantao == 'sim'"
    if (condicional.includes(' == ')) {
      const [campo, valorRaw] = condicional.split(' == ');
      const valor = valorRaw.replace(/'/g, '').trim();
      const resposta = respostas[campo.trim()];
      return resposta === valor;
    }

    // Handle "!=" pattern
    if (condicional.includes(' != ')) {
      const [campo, valorRaw] = condicional.split(' != ');
      const valor = valorRaw.replace(/'/g, '').trim();
      const resposta = respostas[campo.trim()];
      return resposta !== valor;
    }

    return true;
  } catch (error) {
    console.warn('Error evaluating conditional:', condicional, error);
    return true;
  }
}
