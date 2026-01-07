import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check, Building2, DollarSign, Wrench, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PipeeloLogo } from '@/components/PipeeloLogo';
import { ProgressBar } from '@/components/onboarding/ProgressBar';
import { QuestionRenderer } from '@/components/onboarding/QuestionRenderer';
import { DepartmentSelector } from '@/components/onboarding/DepartmentSelector';
import { useOnboarding } from '@/hooks/useOnboarding';
import { DepartmentId } from '@/types/onboarding';
import { useToast } from '@/hooks/use-toast';

type Step = 'empresa' | 'departamento' | 'perguntas' | 'resumo' | 'sucesso';

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
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState<Step>('empresa');
  const [error, setError] = useState<string>('');
  
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
    if (step === 'empresa') {
      if (!state.empresaNome.trim()) {
        setError('Digite o nome da empresa');
        return;
      }
      setError('');
      setStep('departamento');
    } else if (step === 'departamento') {
      if (!state.departamento) {
        setError('Selecione um departamento');
        return;
      }
      setError('');
      setStep('perguntas');
    } else if (step === 'perguntas') {
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
    if (step === 'departamento') {
      setStep('empresa');
    } else if (step === 'perguntas') {
      if (isFirstQuestion) {
        setStep('departamento');
      } else {
        previousQuestion();
      }
    } else if (step === 'resumo') {
      setStep('perguntas');
    }
  };

  const handleSubmit = () => {
    // TODO: Save to database
    toast({
      title: "Onboarding enviado!",
      description: `O departamento ${departamentoData?.nome} foi completado com sucesso.`,
    });
    setStep('sucesso');
  };

  const DeptIcon = state.departamento ? departmentIcons[state.departamento] : null;

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
          {/* Step: Empresa */}
          {step === 'empresa' && (
            <motion.div
              key="empresa"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="space-y-2 text-center">
                <h1 className="text-3xl font-bold">Vamos começar!</h1>
                <p className="text-muted-foreground">
                  Primeiro, qual o nome da sua empresa?
                </p>
              </div>

              <div className="space-y-4">
                <Input
                  type="text"
                  value={state.empresaNome}
                  onChange={(e) => setEmpresaNome(e.target.value)}
                  placeholder="Ex: Proxxima Telecom"
                  className="text-lg py-6"
                  autoFocus
                  onKeyPress={(e) => e.key === 'Enter' && handleNext()}
                />
                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>

              <Button 
                onClick={handleNext}
                className="w-full bg-pipeelo-green hover:bg-pipeelo-green/90"
                size="lg"
              >
                Continuar
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </motion.div>
          )}

          {/* Step: Departamento */}
          {step === 'departamento' && (
            <motion.div
              key="departamento"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="space-y-2 text-center">
                <h1 className="text-3xl font-bold">Escolha o departamento</h1>
                <p className="text-muted-foreground">
                  Qual área você vai responder?
                </p>
              </div>

              <DepartmentSelector 
                onSelect={setDepartamento}
                selected={state.departamento}
              />
              
              {error && <p className="text-sm text-destructive text-center">{error}</p>}

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
                  disabled={!state.departamento}
                >
                  Continuar
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </motion.div>
          )}

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
                >
                  <Check className="mr-2 h-4 w-4" />
                  Confirmar e Enviar
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
                  onClick={() => {
                    resetOnboarding();
                    setStep('departamento');
                  }}
                  className="bg-pipeelo-green hover:bg-pipeelo-green/90"
                  size="lg"
                >
                  Preencher outro departamento
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => navigate('/')}
                  size="lg"
                >
                  Voltar ao início
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
