import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Copy, Plus, Building2, ExternalLink, Check, Clock, RefreshCw, Trash2, Loader2, LogOut } from 'lucide-react';
import { PipeeloLogo } from '@/components/PipeeloLogo';
import { AdminLogin } from '@/components/AdminLogin';
import { adminSessionApi, ApiError, type SessionDTO } from '@/lib/api-client';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type OnboardingSession = SessionDTO;

const AdminOnboarding = () => {
  const [empresaNome, setEmpresaNome] = useState('');
  const [ceoEmail, setCeoEmail] = useState('');
  const [sessions, setSessions] = useState<OnboardingSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  /**
   * Recupera o JWT atual do Supabase Auth para enviar nas requests `/api/admin/*`.
   * Continua usando supabase-js (auth client only — não toca onboarding_*).
   */
  const getAuthToken = useCallback(async (): Promise<string | null> => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, []);

  const fetchSessions = useCallback(
    async (showRefresh = false) => {
      if (showRefresh) setRefreshing(true);
      try {
        const token = await getAuthToken();
        if (!token) {
          toast.error('Sessão expirada — faça login novamente');
          setIsAuthenticated(false);
          return;
        }
        const { sessions: rows } = await adminSessionApi.list(token);
        setSessions(rows);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          toast.error('Sessão expirada — faça login novamente');
          setIsAuthenticated(false);
        } else {
          // eslint-disable-next-line no-console
          console.error('Erro ao buscar sessões:', e);
          toast.error('Erro ao carregar sessões');
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [getAuthToken]
  );

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session);
      if (session) {
        fetchSessions();
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthenticated(!!session);
      if (session) {
        fetchSessions();
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchSessions]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setIsAuthenticated(false);
    toast.success('Logout realizado');
  };

  const createSession = async () => {
    if (!empresaNome.trim()) {
      toast.error('Digite o nome da empresa');
      return;
    }

    setCreating(true);
    try {
      const token = await getAuthToken();
      if (!token) {
        toast.error('Sessão expirada — faça login novamente');
        setIsAuthenticated(false);
        return;
      }
      await adminSessionApi.create(token, {
        empresa_nome: empresaNome.trim(),
        ceo_email: ceoEmail.trim() || undefined,
      });
      toast.success('Link criado com sucesso!');
      setEmpresaNome('');
      setCeoEmail('');
      fetchSessions();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Erro ao criar sessão:', e);
      const msg = e instanceof ApiError ? e.message : 'Erro ao criar link';
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  };

  const deleteSession = async (sessionId: string) => {
    setDeleting(sessionId);
    try {
      const token = await getAuthToken();
      if (!token) {
        toast.error('Sessão expirada — faça login novamente');
        setIsAuthenticated(false);
        return;
      }
      await adminSessionApi.delete(token, sessionId);
      toast.success('Sessão apagada com sucesso!');
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Erro ao deletar sessão:', e);
      const msg = e instanceof ApiError ? e.message : 'Erro ao apagar sessão';
      toast.error(msg);
    } finally {
      setDeleting(null);
    }
  };

  const getOnboardingUrl = (session: OnboardingSession) => {
    const accessToken = (session as { access_token?: string }).access_token;
    const base = `https://onboarding.pipeelo.com/${session.slug}`;
    return accessToken ? `${base}?token=${accessToken}` : base;
  };

  const copyLink = (session: OnboardingSession) => {
    navigator.clipboard.writeText(getOnboardingUrl(session));
    toast.success('Link copiado!');
  };

  const getStatusBadge = (status: string | null, label: string) => {
    if (status === 'concluido') {
      return <Badge className="bg-green-500/20 text-green-500 border-green-500/30"><Check className="w-3 h-3 mr-1" />{label}</Badge>;
    }
    return <Badge className="bg-red-500/20 text-red-500 border-red-500/30"><Clock className="w-3 h-3 mr-1" />{label}</Badge>;
  };

  const getCompletedCount = (session: OnboardingSession) => {
    let count = 0;
    if (session.status_sac_geral === 'concluido') count++;
    if (session.status_financeiro === 'concluido') count++;
    if (session.status_suporte === 'concluido') count++;
    if (session.status_vendas === 'concluido') count++;
    return count;
  };

  const getLastCompletedDate = (session: OnboardingSession): string | null => {
    const dates = [
      session.concluido_sac_geral_at,
      session.concluido_financeiro_at,
      session.concluido_suporte_at,
      session.concluido_vendas_at,
    ].filter(Boolean) as string[];

    if (dates.length === 0) return null;

    const sorted = dates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    return sorted[0];
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const isAllCompleted = (session: OnboardingSession) => {
    return getCompletedCount(session) === 4;
  };

  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AdminLogin onSuccess={() => setIsAuthenticated(true)} />;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/40 bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <PipeeloLogo className="h-8" />
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-semibold text-foreground">Gerador de Links</h1>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-2" />
              Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8 max-w-4xl">
        {/* Create new session */}
        <Card className="mb-8 border-primary/20 bg-card/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5 text-primary" />
              Criar Novo Link de Onboarding
            </CardTitle>
            <CardDescription>
              Gere um link único para uma empresa iniciar o onboarding
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  Nome da Empresa *
                </label>
                <Input
                  placeholder="Ex: Empresa XYZ"
                  value={empresaNome}
                  onChange={(e) => setEmpresaNome(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && createSession()}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  E-mail do CEO (opcional)
                </label>
                <Input
                  type="email"
                  placeholder="ceo@empresa.com"
                  value={ceoEmail}
                  onChange={(e) => setCeoEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && createSession()}
                />
              </div>
            </div>
            <Button
              onClick={createSession}
              disabled={creating || !empresaNome.trim()}
              className="w-full sm:w-auto"
            >
              {creating ? 'Criando...' : 'Gerar Link'}
            </Button>
          </CardContent>
        </Card>

        {/* Sessions list */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-foreground">Links Criados</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchSessions(true)}
            disabled={refreshing}
          >
            {refreshing ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Atualizar
          </Button>
        </div>

        {loading ? (
          <div className="text-center py-12 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
            Carregando...
          </div>
        ) : sessions.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <Building2 className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">Nenhum link criado ainda</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {sessions.map((session) => {
              const lastCompleted = getLastCompletedDate(session);
              const allCompleted = isAllCompleted(session);

              return (
                <Card key={session.id} className="bg-card/50 hover:bg-card/80 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Building2 className="w-4 h-4 text-primary" />
                          <span className="font-semibold text-foreground">{session.empresa_nome}</span>
                          <Badge variant="outline" className="text-xs">
                            {getCompletedCount(session)}/4
                          </Badge>
                        </div>

                        <div className="flex flex-wrap gap-2 mb-3">
                          {getStatusBadge(session.status_sac_geral, 'SAC/Geral')}
                          {getStatusBadge(session.status_financeiro, 'Financeiro')}
                          {getStatusBadge(session.status_suporte, 'Suporte')}
                          {getStatusBadge(session.status_vendas, 'Vendas')}
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          {session.created_at && (
                            <span>Criado em {formatDate(session.created_at)}</span>
                          )}
                          {allCompleted && lastCompleted && (
                            <>
                              <span>•</span>
                              <span className="text-green-400">Concluído em {formatDate(lastCompleted)}</span>
                            </>
                          )}
                          {session.ceo_email && (
                            <>
                              <span>•</span>
                              <span>{session.ceo_email}</span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyLink(session)}
                        >
                          <Copy className="w-4 h-4 mr-2" />
                          Copiar Link
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => window.open(getOnboardingUrl(session), '_blank')}
                        >
                          <ExternalLink className="w-4 h-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              disabled={deleting === session.id}
                            >
                              {deleting === session.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Trash2 className="w-4 h-4" />
                              )}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Apagar sessão?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Tem certeza que deseja apagar a sessão de <strong>{session.empresa_nome}</strong>?
                                Esta ação não pode ser desfeita e todas as respostas serão perdidas.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteSession(session.id)}
                                className="bg-destructive hover:bg-destructive/90"
                              >
                                Apagar
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Footer with WhatsApp contact */}
        <div className="mt-12 text-center text-sm text-muted-foreground">
          <p>
            Dúvidas? Entre em contato através do{' '}
            <span className="text-primary font-medium">grupo do WhatsApp da Pipeelo</span>
          </p>
        </div>
      </main>
    </div>
  );
};

export default AdminOnboarding;
