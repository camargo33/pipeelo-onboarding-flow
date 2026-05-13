import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Copy, Plus, Building2, ExternalLink, Check, Clock, RefreshCw, Trash2, Loader2, LogOut, Layers, X, ChevronDown } from 'lucide-react';
import { PipeeloLogo } from '@/components/PipeeloLogo';
import { AdminLogin } from '@/components/AdminLogin';
import {
  adminSessionApi,
  ApiError,
  ERP_OPTIONS,
  MAPAS_OPTIONS,
  REDE_OPTIONS,
  type SessionDTO,
} from '@/lib/api-client';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type OnboardingTipo = 'completo' | 'comercial';

const TIPO_LABEL: Record<OnboardingTipo, string> = {
  completo: 'Onboarding Completo',
  comercial: 'Apenas CRM (Vendas)',
};

type OnboardingSession = SessionDTO;

type StackPatch = {
  erp?: string | null;
  mapas?: string | null;
  gerenciamento_rede?: string | null;
};

const STACK_FIELDS: Array<{
  key: 'erp' | 'mapas' | 'gerenciamento_rede';
  label: string;
  chip: string;
  options: readonly string[];
}> = [
  { key: 'erp', label: 'ERP', chip: 'ERP', options: ERP_OPTIONS },
  { key: 'mapas', label: 'Mapas', chip: 'Mapas', options: MAPAS_OPTIONS },
  { key: 'gerenciamento_rede', label: 'Gerenciamento de Rede', chip: 'Rede', options: REDE_OPTIONS },
];

function StackEditor({
  session,
  onSave,
}: {
  session: OnboardingSession;
  onSave: (sessionId: string, patch: StackPatch) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [erp, setErp] = useState<string>(session.erp ?? '');
  const [mapas, setMapas] = useState<string>(session.mapas ?? '');
  const [rede, setRede] = useState<string>(session.gerenciamento_rede ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setErp(session.erp ?? '');
      setMapas(session.mapas ?? '');
      setRede(session.gerenciamento_rede ?? '');
    }
  }, [open, session.erp, session.mapas, session.gerenciamento_rede]);

  const hasStack = Boolean(session.erp || session.mapas || session.gerenciamento_rede);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(session.id, {
        erp: erp || null,
        mapas: mapas || null,
        gerenciamento_rede: rede || null,
      });
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const chips = [
    session.erp ? { label: 'ERP', value: session.erp } : null,
    session.mapas ? { label: 'Mapas', value: session.mapas } : null,
    session.gerenciamento_rede ? { label: 'Rede', value: session.gerenciamento_rede } : null,
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {hasStack ? (
          <button
            type="button"
            className="group flex flex-wrap gap-1.5 mt-2 cursor-pointer"
            aria-label="Editar stack"
          >
            {chips.map((c) => (
              <span
                key={c.label}
                className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-muted/50 text-muted-foreground border border-border/40 group-hover:border-primary/40 group-hover:text-foreground transition-colors"
              >
                <span className="text-muted-foreground/60 mr-1">{c.label}</span>
                {c.value}
              </span>
            ))}
          </button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 mt-2 -ml-2 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <Layers className="w-3 h-3 mr-1" />
            Adicionar stack
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-80 p-4 space-y-3" align="start">
        <div className="flex items-center justify-between">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
            Stack Tecnológica
          </p>
          {(erp || mapas || rede) && (
            <button
              type="button"
              onClick={() => {
                setErp('');
                setMapas('');
                setRede('');
              }}
              className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <X className="w-3 h-3" /> Limpar
            </button>
          )}
        </div>
        {STACK_FIELDS.map((f) => {
          const value =
            f.key === 'erp' ? erp : f.key === 'mapas' ? mapas : rede;
          const setValue =
            f.key === 'erp' ? setErp : f.key === 'mapas' ? setMapas : setRede;
          return (
            <div key={f.key} className="space-y-1">
              <label className="text-xs text-muted-foreground">{f.label}</label>
              <div className="flex items-center gap-1">
                <Select value={value} onValueChange={setValue}>
                  <SelectTrigger className="h-9 flex-1">
                    <SelectValue placeholder={`Selecionar ${f.label.toLowerCase()}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {f.options.map((o) => (
                      <SelectItem key={o} value={o}>
                        {o}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {value && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 p-0 text-muted-foreground hover:text-foreground"
                    onClick={() => setValue('')}
                    aria-label={`Limpar ${f.label}`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
        <div className="flex justify-end gap-2 pt-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setOpen(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Salvar'}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

const AdminOnboarding = () => {
  const [empresaNome, setEmpresaNome] = useState('');
  const [ceoEmail, setCeoEmail] = useState('');
  const [erp, setErp] = useState<string>('');
  const [mapas, setMapas] = useState<string>('');
  const [rede, setRede] = useState<string>('');
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
        erp: erp || undefined,
        mapas: mapas || undefined,
        gerenciamento_rede: rede || undefined,
      });
      toast.success('Link criado com sucesso!');
      setEmpresaNome('');
      setCeoEmail('');
      setErp('');
      setMapas('');
      setRede('');
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

  const updateSessionStack = async (
    sessionId: string,
    patch: { erp?: string | null; mapas?: string | null; gerenciamento_rede?: string | null }
  ) => {
    const token = await getAuthToken();
    if (!token) {
      toast.error('Sessão expirada — faça login novamente');
      setIsAuthenticated(false);
      return;
    }
    try {
      const { session } = await adminSessionApi.update(token, sessionId, patch);
      setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, ...session } : s)));
      toast.success('Stack atualizada');
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Erro ao atualizar stack';
      toast.error(msg);
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

  // Cache local de shortlinks já gerados pra evitar chamada repetida
  const [shortLinkCache, setShortLinkCache] = useState<Record<string, string>>({});

  const getOnboardingUrl = (session: OnboardingSession, tipo: OnboardingTipo = 'completo') => {
    const accessToken = (session as { access_token?: string }).access_token;
    const path = tipo === 'comercial' ? `comercial/${session.slug}` : session.slug;
    const base = `https://onboarding.pipeelo.com/${path}`;
    return accessToken ? `${base}?token=${accessToken}` : base;
  };

  const resolveShortLink = async (
    session: OnboardingSession,
    tipo: OnboardingTipo
  ): Promise<string> => {
    const cacheKey = `${session.id}:${tipo}`;
    if (shortLinkCache[cacheKey]) return shortLinkCache[cacheKey];

    const targetUrl = getOnboardingUrl(session, tipo);
    try {
      const authToken = await getAuthToken();
      if (!authToken) {
        toast.error('Sessão expirada — faça login novamente');
        setIsAuthenticated(false);
        return targetUrl;
      }
      const { short_url } = await adminSessionApi.createShortLink(authToken, {
        session_id: session.id,
        modo: tipo,
        target_url: targetUrl,
      });
      setShortLinkCache((prev) => ({ ...prev, [cacheKey]: short_url }));
      return short_url;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Erro ao gerar shortlink, caindo no link completo:', e);
      return targetUrl;
    }
  };

  const copyLink = async (session: OnboardingSession, tipo: OnboardingTipo = 'completo') => {
    const url = await resolveShortLink(session, tipo);
    await navigator.clipboard.writeText(url);
    toast.success(`Link copiado — ${TIPO_LABEL[tipo]}`);
  };

  const openLink = async (session: OnboardingSession, tipo: OnboardingTipo = 'completo') => {
    const url = await resolveShortLink(session, tipo);
    window.open(url, '_blank');
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
            <div className="space-y-2 pt-1">
              <div className="flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-muted-foreground/70" />
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground/70 font-medium">
                  Stack Tecnológica
                  <span className="ml-1 normal-case tracking-normal text-muted-foreground/50">
                    · opcional
                  </span>
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Select value={erp} onValueChange={setErp}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="ERP" />
                  </SelectTrigger>
                  <SelectContent>
                    {ERP_OPTIONS.map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={mapas} onValueChange={setMapas}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Mapas" />
                  </SelectTrigger>
                  <SelectContent>
                    {MAPAS_OPTIONS.map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={rede} onValueChange={setRede}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Gerenciamento de Rede" />
                  </SelectTrigger>
                  <SelectContent>
                    {REDE_OPTIONS.map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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

                        <StackEditor session={session} onSave={updateSessionStack} />
                      </div>

                      <div className="flex items-center gap-2">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm">
                              <Copy className="w-4 h-4 mr-2" />
                              Copiar Link
                              <ChevronDown className="w-3.5 h-3.5 ml-1.5 opacity-70" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuLabel className="text-xs">Tipo de onboarding</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => copyLink(session, 'completo')}>
                              <div className="flex flex-col">
                                <span className="text-sm">Completo</span>
                                <span className="text-[11px] text-muted-foreground">Todos departamentos (IA + CRM)</span>
                              </div>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => copyLink(session, 'comercial')}>
                              <div className="flex flex-col">
                                <span className="text-sm">Apenas CRM</span>
                                <span className="text-[11px] text-muted-foreground">Só departamento de Vendas</span>
                              </div>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" aria-label="Abrir link">
                              <ExternalLink className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuLabel className="text-xs">Abrir como</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => openLink(session, 'completo')}>
                              Onboarding Completo
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openLink(session, 'comercial')}>
                              Apenas CRM
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
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
