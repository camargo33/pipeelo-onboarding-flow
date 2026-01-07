import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { Building2, DollarSign, Wrench, TrendingUp, Check, Clock, ArrowRight, AlertCircle } from 'lucide-react';
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
  color: string;
  bgColor: string;
  borderColor: string;
}> = {
  sac_geral: {
    icon: Building2,
    label: 'SAC / Geral',
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/30',
  },
  financeiro: {
    icon: DollarSign,
    label: 'Financeiro',
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/30',
  },
  suporte: {
    icon: Wrench,
    label: 'Suporte Técnico',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
  },
  vendas: {
    icon: TrendingUp,
    label: 'Vendas',
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
          <PipeeloLogo className="h-8" />
        </div>
      </header>

      <main className="container mx-auto px-6 py-8 max-w-2xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Company header */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-foreground mb-2">
              Onboarding - {session.empresa_nome}
            </h1>
            <p className="text-muted-foreground">
              {allCompleted 
                ? '🎉 Todos os departamentos foram preenchidos!' 
                : `${completedCount}/4 departamentos concluídos`}
            </p>
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
                  transition={{ delay: index * 0.1 }}
                >
                  <Card 
                    className={`${config.bgColor} ${config.borderColor} border transition-all ${
                      status.completed 
                        ? 'opacity-80' 
                        : 'hover:scale-[1.02] cursor-pointer'
                    }`}
                    onClick={() => !status.completed && startDepartment(deptId)}
                  >
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className={`p-3 rounded-full ${config.bgColor}`}>
                            <Icon className={`w-6 h-6 ${config.color}`} />
                          </div>
                          <div>
                            <h3 className="font-semibold text-foreground">{config.label}</h3>
                            {status.completed ? (
                              <div className="text-sm text-muted-foreground">
                                <span className="text-green-400">✓ Preenchido</span>
                                {status.responsavel && (
                                  <span> por {status.responsavel}</span>
                                )}
                                {status.completedAt && (
                                  <span className="block">
                                    em {new Date(status.completedAt).toLocaleDateString('pt-BR', {
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
                              <p className="text-sm text-muted-foreground flex items-center gap-1">
                                <Clock className="w-3 h-3" /> Pendente
                              </p>
                            )}
                          </div>
                        </div>

                        {status.completed ? (
                          <div className="p-2 rounded-full bg-green-500/20">
                            <Check className="w-5 h-5 text-green-400" />
                          </div>
                        ) : (
                          <Button variant="ghost" size="sm" className={config.color}>
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
                    Obrigado por preencher todas as informações. Nossa equipe entrará em contato em breve.
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </motion.div>
      </main>
    </div>
  );
};

export default OnboardingSession;
