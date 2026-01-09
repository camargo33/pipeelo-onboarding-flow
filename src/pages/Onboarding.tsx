import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check, Building2, DollarSign, Wrench, TrendingUp, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PipeeloLogo } from '@/components/PipeeloLogo';
import { ProgressBar } from '@/components/onboarding/ProgressBar';
import { QuestionRenderer } from '@/components/onboarding/QuestionRenderer';
import { useOnboarding } from '@/hooks/useOnboarding';
import { DepartmentId } from '@/types/onboarding';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

type Step = 'perguntas' | 'resumo' | 'sucesso';

const departmentIcons = {
  sac_geral: Building2,
  financeiro: DollarSign,
  suporte: Wrench,
  vendas: TrendingUp
};

const departmentColors = {
  sac_geral: 'bg-pipeelo-purple',
  financeiro: 'bg-pipeelo-green',
  suporte: 'bg-pipeelo-blue',
  vendas: 'bg-amber-500'
};

export default function Onboarding() {
  const { slug, departamento: urlDepartamento } = useParams<{ slug: string; departamento: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState<Step>('perguntas');
  const [error, setError] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [empresaNome, setEmpresaNomeState] = useState<string>('');
  const [loading, setLoading] = useState(true);
  
  const {
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
  } = useOnboarding();

  // Load session data from slug
  useEffect(() => {
    const loadSession = async () => {
      if (!slug || !urlDepartamento) {
        navigate('/');
        return;
      }

      // Validate department
      const validDepts: DepartmentId[] = ['sac_geral', 'financeiro', 'suporte', 'vendas'];
      if (!validDepts.includes(urlDepartamento as DepartmentId)) {
        navigate('/');
        return;
      }

      const { data: session, error: sessionError } = await supabase
        .from('onboarding_sessions')
        .select('*')
        .eq('slug', slug)
        .maybeSingle();

      if (sessionError || !session) {
        toast({
          title: 'Link inválido',
          description: 'Este link não existe ou expirou.',
          variant: 'destructive',
        });
        navigate('/');
        return;
      }

      // Check if department already completed - allow editing if not all departments are complete
      const statusField = `status_${urlDepartamento}` as keyof typeof session;
      const allComplete = 
        session.status_sac_geral === 'concluido' &&
        session.status_financeiro === 'concluido' &&
        session.status_suporte === 'concluido' &&
        session.status_vendas === 'concluido';
      
      if (session[statusField] === 'concluido' && allComplete) {
        toast({
          title: 'Onboarding finalizado',
          description: 'Não é possível editar após todos os departamentos serem finalizados.',
          variant: 'destructive',
        });
        navigate(`/${slug}`);
        return;
      }

      setSessionId(session.id);
      setEmpresaNomeState(session.empresa_nome);
      setEmpresaNome(session.empresa_nome);
      setDepartamento(urlDepartamento as DepartmentId);

      // Load existing responses if editing
      if (session[statusField] === 'concluido') {
        const { data: existingResponses } = await supabase
          .from('onboarding_respostas')
          .select('pergunta_id, resposta')
          .eq('session_id', session.id)
          .eq('departamento', urlDepartamento);

        if (existingResponses && existingResponses.length > 0) {
          existingResponses.forEach((resp) => {
            setResposta(resp.pergunta_id, resp.resposta);
          });
        }
      }

      setLoading(false);
    };

    loadSession();
  }, [slug, urlDepartamento, navigate, toast, setEmpresaNome, setDepartamento]);

  const validateCurrentQuestion = () => {
    if (!currentQuestion) return true;
    
    if (currentQuestion.tipo === 'info' || currentQuestion.tipo === 'info_link') {
      return true;
    }

    const resposta = state.respostas[currentQuestion.id];
    
    if (currentQuestion.obrigatoria) {
      if (resposta === undefined || resposta === '' || resposta === null) {
        setError('Este campo é obrigatório');
        return false;
      }
      
      if (currentQuestion.tipo === 'checkbox_multiple') {
        const selectedValues = resposta?.selected || (Array.isArray(resposta) ? resposta : []);
        if (selectedValues.length === 0) {
          setError('Selecione pelo menos uma opção');
          return false;
        }
      }
    }

    if (currentQuestion.tipo === 'url' && resposta) {
      try {
        new URL(resposta);
      } catch {
        setError('URL inválida');
        return false;
      }
    }

    if (currentQuestion.validacao && resposta) {
      if (currentQuestion.validacao.startsWith('min:')) {
        const min = parseInt(currentQuestion.validacao.split(':')[1]);
        if (resposta.length < min) {
          setError(`Mínimo ${min} caracteres`);
          return false;
        }
      }
    }

    setError('');
    return true;
  };

  const handleNext = () => {
    if (step === 'perguntas') {
      if (!validateCurrentQuestion()) return;
      
      if (isLastQuestion) {
        setStep('resumo');
      } else {
        nextQuestion();
      }
    } else if (step === 'resumo') {
      if (!state.responsavelNome.trim()) {
        setError('Digite seu nome');
        return;
      }
      handleSubmit();
    }
  };

  const handleBack = () => {
    setError('');
    if (step === 'perguntas') {
      if (isFirstQuestion) {
        navigate(`/${slug}`);
      } else {
        previousQuestion();
      }
    } else if (step === 'resumo') {
      setStep('perguntas');
    }
  };

  const handleSubmit = async () => {
    if (!state.departamento || !departamentoData || !sessionId) return;
    
    setIsSubmitting(true);
    
    try {
      // 1. Save all responses
      const respostasToInsert = Object.entries(state.respostas).map(([perguntaId, resposta]) => ({
        session_id: sessionId,
        departamento: state.departamento!,
        pergunta_id: perguntaId,
        resposta: resposta,
      }));
      
      const { error: respostasError } = await supabase
        .from('onboarding_respostas')
        .upsert(respostasToInsert, { 
          onConflict: 'session_id,departamento,pergunta_id' 
        });
      
      if (respostasError) throw respostasError;
      
      // 2. Update session status for this department
      const statusField = `status_${state.departamento}` as const;
      const responsavelField = `responsavel_${state.departamento}` as const;
      const concluidoField = `concluido_${state.departamento}_at` as const;
      
      const { data: updatedSession, error: updateError } = await supabase
        .from('onboarding_sessions')
        .update({
          [statusField]: 'concluido',
          [responsavelField]: state.responsavelNome,
          [concluidoField]: new Date().toISOString(),
        })
        .eq('id', sessionId)
        .select()
        .single();
      
      if (updateError) throw updateError;

      // Check if all departments are complete and send webhook
      if (
        updatedSession &&
        updatedSession.status_sac_geral === 'concluido' &&
        updatedSession.status_financeiro === 'concluido' &&
        updatedSession.status_suporte === 'concluido' &&
        updatedSession.status_vendas === 'concluido'
      ) {
        console.log('All departments complete, sending webhook...');
        const { error: webhookError } = await supabase.functions.invoke('send-webhook-complete', {
          body: { sessionId },
        });
        
        if (webhookError) {
          console.error('Error sending webhook:', webhookError);
        } else {
          console.log('Webhook sent successfully');
        }
      }
      
      // 3. Send email notification
      const { error: emailError } = await supabase.functions.invoke('send-onboarding-email', {
        body: {
          empresaNome: empresaNome,
          departamento: state.departamento,
          departamentoNome: departamentoData.nome,
          responsavelNome: state.responsavelNome,
          respostas: state.respostas,
          sessionId: sessionId,
        },
      });
      
      if (emailError) {
        console.error('Error sending email:', emailError);
      }
      
      toast({
        title: "Onboarding enviado!",
        description: `O departamento ${departamentoData.nome} foi completado com sucesso.`,
      });
      
      setStep('sucesso');
    } catch (error: any) {
      console.error('Error submitting onboarding:', error);
      toast({
        title: "Erro ao enviar",
        description: error.message || "Ocorreu um erro ao salvar as respostas. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const DeptIcon = state.departamento ? departmentIcons[state.departamento] : null;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <PipeeloLogo />
              {state.departamento && departamentoData && (
                <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
                  <span>/</span>
                  <div className={`p-1 rounded ${departmentColors[state.departamento]}`}>
                    {DeptIcon && <DeptIcon className="h-3.5 w-3.5 text-white" />}
                  </div>
                  <span>{departamentoData.nome}</span>
                </div>
              )}
            </div>
            
            {step === 'perguntas' && (
              <div className="w-48 sm:w-64">
                <ProgressBar 
                  current={answeredQuestions}
                  total={totalQuestions}
                  percentage={progress}
                />
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <AnimatePresence mode="wait">
          {/* Step: Perguntas */}
          {step === 'perguntas' && currentQuestion && (
            <motion.div
              key={`question-${currentQuestion.id}`}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>{currentSection?.icone}</span>
                  <span>{currentSection?.titulo}</span>
                </div>
                <h2 className="text-2xl font-semibold">
                  {currentQuestion.pergunta}
                </h2>
              </div>

              <QuestionRenderer
                question={currentQuestion}
                value={state.respostas[currentQuestion.id]}
                onChange={(value) => {
                  setResposta(currentQuestion.id, value);
                  setError('');
                }}
                onSubmit={handleNext}
                error={error}
              />

              <div className="flex gap-4">
                <Button 
                  variant="outline" 
                  onClick={handleBack}
                  size="lg"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Voltar
                </Button>
                <Button 
                  onClick={handleNext}
                  className="flex-1 bg-pipeelo-green hover:bg-pipeelo-green/90"
                  size="lg"
                >
                  {isLastQuestion ? 'Revisar respostas' : 'Próxima'}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </motion.div>
          )}

          {/* Step: Resumo */}
          {step === 'resumo' && (
            <motion.div
              key="resumo"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="space-y-2 text-center">
                <h1 className="text-3xl font-bold">Quase lá!</h1>
                <p className="text-muted-foreground">
                  Revise suas respostas e confirme o envio
                </p>
              </div>

              <div className="space-y-6 max-h-[400px] overflow-y-auto">
                {sections.map((section) => (
                  <div key={section.id} className="space-y-3">
                    <h3 className="font-semibold flex items-center gap-2">
                      <span>{section.icone}</span>
                      {section.titulo}
                    </h3>
                    <div className="space-y-2 pl-6">
                      {section.perguntas
                        .filter((q: any) => q.tipo !== 'info' && q.tipo !== 'info_link')
                        .map((q: any) => {
                          const resposta = state.respostas[q.id];
                          if (resposta === undefined || resposta === '') return null;
                          
                          let displayValue: string = '';
                          
                          if (q.tipo === 'checkbox_multiple') {
                            const selected = resposta?.selected || (Array.isArray(resposta) ? resposta : []);
                            const labels = selected.map((v: string) => {
                              const opt = q.opcoes?.find((o: any) => o.value === v);
                              return opt?.label || v;
                            });
                            if (resposta?.outroTexto) {
                              labels.push(resposta.outroTexto);
                            }
                            displayValue = labels.join(', ');
                          } else if (q.tipo === 'horario_semanal' && typeof resposta === 'object') {
                            const parts = [];
                            if (resposta.segunda_sexta && !resposta.segunda_sexta.nao_atende) {
                              parts.push(`Seg-Sex: ${resposta.segunda_sexta.inicio} às ${resposta.segunda_sexta.fim}`);
                            }
                            if (resposta.sabado && !resposta.sabado.nao_atende) {
                              parts.push(`Sáb: ${resposta.sabado.inicio} às ${resposta.sabado.fim}`);
                            } else if (resposta.sabado?.nao_atende) {
                              parts.push('Sáb: Não atende');
                            }
                            if (resposta.domingo_feriado && !resposta.domingo_feriado.nao_atende) {
                              parts.push(`Dom/Feriado: ${resposta.domingo_feriado.inicio} às ${resposta.domingo_feriado.fim}`);
                            } else if (resposta.domingo_feriado?.nao_atende) {
                              parts.push('Dom/Feriado: Não atende');
                            }
                            displayValue = parts.join(' | ');
                          } else if (q.tipo === 'url_optional' && resposta === 'NAO_POSSUI') {
                            displayValue = 'Não possui portal/área do cliente';
                          } else if (q.tipo === 'select') {
                            const opt = q.opcoes?.find((o: any) => o.value === resposta);
                            displayValue = opt?.label || resposta;
                          } else if (Array.isArray(resposta)) {
                            displayValue = resposta.join(', ');
                          } else if (q.tipo === 'currency') {
                            displayValue = `R$ ${resposta}`;
                          } else {
                            displayValue = String(resposta);
                          }
                          
                          return (
                            <div key={q.id} className="text-sm">
                              <span className="text-muted-foreground">{q.pergunta}</span>
                              <p className="font-medium">{displayValue}</p>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-4 pt-4 border-t">
                <div>
                  <label className="text-sm font-medium">Seu nome completo</label>
                  <Input
                    type="text"
                    value={state.responsavelNome}
                    onChange={(e) => setResponsavelNome(e.target.value)}
                    placeholder="Digite seu nome"
                    className="mt-2"
                  />
                  {error && <p className="text-sm text-destructive mt-1">{error}</p>}
                </div>
              </div>

              <div className="flex gap-4">
                <Button 
                  variant="outline" 
                  onClick={handleBack}
                  size="lg"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Voltar
                </Button>
                <Button 
                  onClick={handleNext}
                  className="flex-1 bg-pipeelo-green hover:bg-pipeelo-green/90"
                  size="lg"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Check className="mr-2 h-4 w-4" />
                      Confirmar e Enviar
                    </>
                  )}
                </Button>
              </div>
            </motion.div>
          )}

          {/* Step: Sucesso */}
          {step === 'sucesso' && (
            <motion.div
              key="sucesso"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-8 text-center"
            >
              <div className="w-20 h-20 rounded-full bg-pipeelo-green/20 flex items-center justify-center mx-auto">
                <Check className="h-10 w-10 text-pipeelo-green" />
              </div>
              
              <div className="space-y-2">
                <h1 className="text-3xl font-bold">Departamento concluído!</h1>
                <p className="text-muted-foreground">
                  O departamento <strong>{departamentoData?.nome}</strong> foi preenchido com sucesso.
                </p>
              </div>

              <div className="bg-muted/50 rounded-xl p-6 space-y-4">
                <p className="text-sm text-muted-foreground">
                  Você pode compartilhar o link do onboarding com outros responsáveis da sua empresa para que eles preencham os demais departamentos.
                </p>
              </div>

              <div className="flex flex-col gap-3">
                <Button 
                  onClick={() => navigate(`/${slug}`)}
                  className="bg-pipeelo-green hover:bg-pipeelo-green/90"
                  size="lg"
                >
                  Ver status dos departamentos
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
