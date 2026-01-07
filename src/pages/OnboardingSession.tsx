import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { Building2, DollarSign, Wrench, TrendingUp, Check, Clock, ArrowRight, AlertCircle, Info, Users, MessageSquare } from 'lucide-react';
import { PipeeloLogo } from '@/components/PipeeloLogo';
import { motion } from 'framer-motion';
import { DepartmentId } from '@/types/onboarding';

interface SessionData {
  id: string;
  empresa_nome: string;
  access_token: string;
  status_sac_geral: string | null;
  status_financeiro: string | null;
  status_suporte: string | null;
  status_vendas: string | null;
  responsavel_sac_geral: string | null;
  responsavel_financeiro: string | null;
  responsavel_suporte: string | null;
  responsavel_vendas: string | null;
  concluido_sac_geral_at: string | null;
  concluido_financeiro_at: string | null;
  concluido_suporte_at: string | null;
  concluido_vendas_at: string | null;
}

const departmentConfig: Record<DepartmentId, {
  icon: typeof Building2;
  label: string;
  description: string;
  suggestedPerson: string;
  estimatedTime: string;
  color: string;
  bgColor: string;
  borderColor: string;
}> = {
  sac_geral: {
    icon: Building2,
    label: 'SAC / Geral',
    description: 'Informações gerais da empresa, processos e identidade',
    suggestedPerson: 'Gestor ou Sócio',
    estimatedTime: '~15 min',
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/30',
  },
  financeiro: {
    icon: DollarSign,
    label: 'Financeiro',
    description: 'Cobrança, pagamentos e regras financeiras',
    suggestedPerson: 'Responsável Financeiro',
    estimatedTime: '~10 min',
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/30',
  },
  suporte: {
    icon: Wrench,
    label: 'Suporte Técnico',
    description: 'Diagnósticos técnicos e gestão de rede',
    suggestedPerson: 'Técnico ou NOC',
    estimatedTime: '~10 min',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
  },
  vendas: {
    icon: TrendingUp,
    label: 'Vendas',
    description: 'Planos, qualificação e processo comercial',
    suggestedPerson: 'Gerente Comercial',
    estimatedTime: '~10 min',
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
  },
};

const OnboardingSession = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSession = async () => {
      if (!token) {
        setError('Token inválido');
        setLoading(false);
        return;
      }

      const { data, error: fetchError } = await supabase
        .from('onboarding_sessions')
        .select('*')
        .eq('access_token', token)
        .maybeSingle();

      if (fetchError) {
        console.error('Erro ao buscar sessão:', fetchError);
        setError('Erro ao carregar dados');
      } else if (!data) {
        setError('Link inválido ou expirado');
      } else {
        setSession(data);
      }
      setLoading(false);
    };

    fetchSession();
  }, [token]);

  const getDepartmentStatus = (deptId: DepartmentId) => {
    if (!session) return { completed: false, responsavel: null, completedAt: null };
    
    const statusMap: Record<DepartmentId, { status: string | null; responsavel: string | null; completedAt: string | null }> = {
      sac_geral: { status: session.status_sac_geral, responsavel: session.responsavel_sac_geral, completedAt: session.concluido_sac_geral_at },
      financeiro: { status: session.status_financeiro, responsavel: session.responsavel_financeiro, completedAt: session.concluido_financeiro_at },
      suporte: { status: session.status_suporte, responsavel: session.responsavel_suporte, completedAt: session.concluido_suporte_at },
      vendas: { status: session.status_vendas, responsavel: session.responsavel_vendas, completedAt: session.concluido_vendas_at },
    };

    const info = statusMap[deptId];
    return {
      completed: info.status === 'concluido',
      responsavel: info.responsavel,
      completedAt: info.completedAt,
    };
  };

  const startDepartment = (deptId: DepartmentId) => {
    const status = getDepartmentStatus(deptId);
    if (status.completed) {
      toast.error('Este departamento já foi preenchido');
      return;
    }
    navigate(`/onboarding/${token}/${deptId}`);
  };

  const getCompletedCount = () => {
    if (!session) return 0;
    let count = 0;
    if (session.status_sac_geral === 'concluido') count++;
    if (session.status_financeiro === 'concluido') count++;
    if (session.status_suporte === 'concluido') count++;
    if (session.status_vendas === 'concluido') count++;
    return count;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md mx-4">
          <CardContent className="p-8 text-center">
            <AlertCircle className="w-16 h-16 mx-auto text-destructive mb-4" />
            <h1 className="text-xl font-semibold text-foreground mb-2">Link Inválido</h1>
            <p className="text-muted-foreground">{error || 'Este link não existe ou expirou.'}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const completedCount = getCompletedCount();
  const allCompleted = completedCount === 4;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/40 bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-6 py-4 flex items-center justify-center">
          <PipeeloLogo size="lg" />
        </div>
      </header>

      <main className="container mx-auto px-6 py-8 max-w-3xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Welcome Section */}
          <div className="text-center mb-8">
            <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-2">
              Bem-vindo ao Onboarding Pipeelo
            </h1>
            <p className="text-lg text-primary font-medium mb-1">
              {session.empresa_nome}
            </p>
            <p className="text-muted-foreground">
              {allCompleted 
                ? '🎉 Parabéns! Todos os departamentos foram preenchidos!' 
                : `Progresso: ${completedCount}/4 departamentos concluídos`}
            </p>
          </div>

          {/* Info Cards */}
          {!allCompleted && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mb-8"
            >
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="p-5">
                  <div className="flex gap-4">
                    <Info className="w-6 h-6 text-primary shrink-0 mt-0.5" />
                    <div className="space-y-3">
                      <h3 className="font-semibold text-foreground">Como funciona o onboarding?</h3>
                      <div className="space-y-2 text-sm text-muted-foreground">
                        <div className="flex items-start gap-2">
                          <Users className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                          <p><strong>Cada departamento pode ser preenchido por uma pessoa diferente.</strong> Encaminhe este link para os responsáveis de cada área.</p>
                        </div>
                        <div className="flex items-start gap-2">
                          <Clock className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                          <p><strong>Tempo total estimado: ~45 minutos</strong> (dividido entre os 4 departamentos).</p>
                        </div>
                        <div className="flex items-start gap-2">
                          <MessageSquare className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                          <p>As respostas são usadas para <strong>configurar o atendimento automatizado</strong> da sua empresa na Pipeelo.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Progress Bar */}
          <div className="mb-6">
            <div className="flex justify-between text-sm text-muted-foreground mb-2">
              <span>Progresso geral</span>
              <span>{Math.round((completedCount / 4) * 100)}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-primary rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${(completedCount / 4) * 100}%` }}
                transition={{ duration: 0.5, delay: 0.3 }}
              />
            </div>
          </div>

          {/* Department cards */}
          <div className="space-y-4">
            {(Object.keys(departmentConfig) as DepartmentId[]).map((deptId, index) => {
              const config = departmentConfig[deptId];
              const status = getDepartmentStatus(deptId);
              const Icon = config.icon;

              return (
                <motion.div
                  key={deptId}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + index * 0.1 }}
                >
                  <Card 
                    className={`${config.bgColor} ${config.borderColor} border transition-all ${
                      status.completed 
                        ? 'opacity-75' 
                        : 'hover:scale-[1.01] hover:shadow-lg cursor-pointer'
                    }`}
                    onClick={() => !status.completed && startDepartment(deptId)}
                  >
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-4">
                          <div className={`p-3 rounded-full ${config.bgColor} shrink-0`}>
                            <Icon className={`w-6 h-6 ${config.color}`} />
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-semibold text-foreground">{config.label}</h3>
                            <p className="text-sm text-muted-foreground mb-2">{config.description}</p>
                            
                            {status.completed ? (
                              <div className="text-sm text-muted-foreground">
                                <span className="text-green-400 font-medium">✓ Concluído</span>
                                {status.responsavel && (
                                  <span> por {status.responsavel}</span>
                                )}
                                {status.completedAt && (
                                  <span className="block text-xs mt-1">
                                    {new Date(status.completedAt).toLocaleDateString('pt-BR', {
                                      day: '2-digit',
                                      month: '2-digit',
                                      year: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Users className="w-3 h-3" /> {config.suggestedPerson}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" /> {config.estimatedTime}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        {status.completed ? (
                          <div className="p-2 rounded-full bg-green-500/20 shrink-0">
                            <Check className="w-5 h-5 text-green-400" />
                          </div>
                        ) : (
                          <Button variant="ghost" size="sm" className={`${config.color} shrink-0`}>
                            Preencher <ArrowRight className="w-4 h-4 ml-1" />
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>

          {allCompleted && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="mt-8 text-center"
            >
              <Card className="bg-green-500/10 border-green-500/30">
                <CardContent className="p-6">
                  <Check className="w-12 h-12 mx-auto text-green-400 mb-3" />
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    Onboarding Completo!
                  </h3>
                  <p className="text-muted-foreground">
                    Obrigado por preencher todas as informações. Nossa equipe entrará em contato em breve para finalizar a configuração do seu atendimento.
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Footer info */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
            className="mt-8 text-center text-sm text-muted-foreground"
          >
            <p>Dúvidas? Entre em contato pelo WhatsApp: <a href="https://wa.me/5511999999999" className="text-primary hover:underline">(11) 99999-9999</a></p>
          </motion.div>
        </motion.div>
      </main>
    </div>
  );
};

export default OnboardingSession;
