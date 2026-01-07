import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Copy, Plus, Building2, ExternalLink, Check, Clock, RefreshCw, Trash2, Loader2 } from 'lucide-react';
import { PipeeloLogo } from '@/components/PipeeloLogo';
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

interface OnboardingSession {
  id: string;
  empresa_nome: string;
  slug: string;
  ceo_email: string | null;
  created_at: string;
  updated_at: string;
  status_sac_geral: string | null;
  status_financeiro: string | null;
  status_suporte: string | null;
  status_vendas: string | null;
  concluido_sac_geral_at: string | null;
  concluido_financeiro_at: string | null;
  concluido_suporte_at: string | null;
  concluido_vendas_at: string | null;
}

const AdminOnboarding = () => {
  const [empresaNome, setEmpresaNome] = useState('');
  const [ceoEmail, setCeoEmail] = useState('');
  const [sessions, setSessions] = useState<OnboardingSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchSessions = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    
    const { data, error } = await supabase
      .from('onboarding_sessions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erro ao buscar sessões:', error);
      toast.error('Erro ao carregar sessões');
    } else {
      setSessions(data || []);
    }
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const createSession = async () => {
    if (!empresaNome.trim()) {
      toast.error('Digite o nome da empresa');
      return;
    }

    setCreating(true);
    
    const { data, error } = await supabase
      .from('onboarding_sessions')
      .insert({
        empresa_nome: empresaNome.trim(),
        ceo_email: ceoEmail.trim() || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Erro ao criar sessão:', error);
      toast.error('Erro ao criar link');
    } else {
      toast.success('Link criado com sucesso!');
      setEmpresaNome('');
      setCeoEmail('');
      fetchSessions();
    }
    setCreating(false);
  };

  const deleteSession = async (sessionId: string) => {
    setDeleting(sessionId);
    
    // First delete related responses
    const { error: respostasError } = await supabase
      .from('onboarding_respostas')
      .delete()
      .eq('session_id', sessionId);

    if (respostasError) {
      console.error('Erro ao deletar respostas:', respostasError);
      toast.error('Erro ao apagar sessão');
      setDeleting(null);
      return;
    }

    // Then delete the session
    const { error } = await supabase
      .from('onboarding_sessions')
      .delete()
      .eq('id', sessionId);

    if (error) {
      console.error('Erro ao deletar sessão:', error);
      toast.error('Erro ao apagar sessão');
    } else {
      toast.success('Sessão apagada com sucesso!');
      setSessions(sessions.filter(s => s.id !== sessionId));
    }
    setDeleting(null);
  };

  const getOnboardingUrl = (slug: string) => {
    const baseUrl = window.location.origin;
    return `${baseUrl}/${slug}`;
  };

  const copyLink = (slug: string) => {
    navigator.clipboard.writeText(getOnboardingUrl(slug));
    toast.success('Link copiado!');
  };

  const getStatusBadge = (status: string | null) => {
    if (status === 'concluido') {
      return <Badge className="bg-green-500/20 text-green-400 border-green-500/30"><Check className="w-3 h-3 mr-1" /> Completo</Badge>;
    }
    return <Badge variant="outline" className="text-muted-foreground"><Clock className="w-3 h-3 mr-1" /> Pendente</Badge>;
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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/40 bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <PipeeloLogo className="h-8" />
          <h1 className="text-lg font-semibold text-foreground">Gerador de Links</h1>
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
                          {getStatusBadge(session.status_sac_geral)}
                          {getStatusBadge(session.status_financeiro)}
                          {getStatusBadge(session.status_suporte)}
                          {getStatusBadge(session.status_vendas)}
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span>Criado em {formatDate(session.created_at)}</span>
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
                          onClick={() => copyLink(session.slug)}
                        >
                          <Copy className="w-4 h-4 mr-2" />
                          Copiar Link
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => window.open(getOnboardingUrl(session.slug), '_blank')}
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
      </main>
    </div>
  );
};

export default AdminOnboarding;
