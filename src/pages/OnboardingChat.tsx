import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Loader2,
  Save,
  Send,
  Sparkles,
  Flag,
} from 'lucide-react';
import { PipeeloLogo } from '@/components/PipeeloLogo';
import { DEPARTMENT_ORDER, DepartmentId } from '@/types/onboarding';
import { sessionApi, ApiError, type SessionDTO } from '@/lib/api-client';

type ChatEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool_call'; name: string; args?: unknown }
  | { type: 'tool_result'; name: string; ok: boolean; summary?: unknown }
  | { type: 'done' }
  | { type: 'error'; message: string };

type Activity = { kind: 'saved' | 'insight' | 'completed' | 'flow'; label: string };

type ChatItem =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text: string; activities: Activity[] };

const DEPT_LABEL: Record<DepartmentId, string> = {
  identificacao: 'Identificação',
  sac_geral: 'SAC / Geral',
  financeiro: 'Financeiro',
  suporte: 'Suporte',
  vendas: 'Vendas',
};

function activityFromEvent(ev: Extract<ChatEvent, { type: 'tool_result' }>): Activity | null {
  if (!ev.ok) return null;
  if (ev.name === 'save_answers') {
    const n = (ev.summary as { salvas?: number })?.salvas ?? 0;
    if (!n) return null;
    return { kind: 'saved', label: `${n} resposta${n > 1 ? 's' : ''} salva${n > 1 ? 's' : ''}` };
  }
  if (ev.name === 'record_insight') {
    return { kind: 'insight', label: 'Detalhe do seu negócio registrado' };
  }
  if (ev.name === 'confirm_flow') {
    return { kind: 'flow', label: 'Fluxo de atendimento confirmado' };
  }
  if (ev.name === 'complete_department') {
    const dep = (ev.summary as { departamento_concluido?: string })?.departamento_concluido;
    const label = dep && DEPT_LABEL[dep as DepartmentId] ? DEPT_LABEL[dep as DepartmentId] : 'Etapa';
    return { kind: 'completed', label: `${label} concluída` };
  }
  return null;
}

const ACTIVITY_ICON = {
  saved: Save,
  insight: Sparkles,
  completed: Flag,
  flow: Check,
} as const;

const OnboardingChat = () => {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const navigate = useNavigate();

  const [session, setSession] = useState<SessionDTO | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ChatItem[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const refreshSession = useCallback(async () => {
    if (!slug || !token) return;
    try {
      const { session: dto } = await sessionApi.get(slug, token);
      setSession(dto);
    } catch {
      /* mantém o estado atual */
    }
  }, [slug, token]);

  useEffect(() => {
    const load = async () => {
      if (!slug || !token) {
        setLoadError('Link inválido — use o link enviado por email/WhatsApp.');
        setLoading(false);
        return;
      }
      try {
        const [{ session: dto }, historyRes] = await Promise.all([
          sessionApi.get(slug, token),
          fetch(
            `/api/agent/history?slug=${encodeURIComponent(slug)}&token=${encodeURIComponent(token)}`
          ).then((r) => (r.ok ? r.json() : { messages: [] })),
        ]);
        setSession(dto);
        const restored: ChatItem[] = (historyRes.messages ?? []).map(
          (m: { role: 'user' | 'assistant'; text: string }) =>
            m.role === 'user'
              ? { role: 'user' as const, text: m.text }
              : { role: 'assistant' as const, text: m.text, activities: [] }
        );
        setItems(restored);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) setLoadError('Link inválido ou token incorreto');
        else if (e instanceof ApiError && e.status === 410) setLoadError('Sessão expirou (>30 dias). Solicite um novo link.');
        else setLoadError('Erro ao carregar a sessão');
      }
      setLoading(false);
    };
    load();
  }, [slug, token]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [items, streaming]);

  const sendMessage = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || streaming || !slug || !token) return;
      setInput('');
      setStreaming(true);
      setItems((prev) => [
        ...prev,
        { role: 'user', text: message },
        { role: 'assistant', text: '', activities: [] },
      ]);

      const patchLast = (fn: (m: Extract<ChatItem, { role: 'assistant' }>) => void) => {
        setItems((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === 'assistant') {
            const copy = { ...last, activities: [...last.activities] };
            fn(copy);
            next[next.length - 1] = copy;
          }
          return next;
        });
      };

      let sawDepartmentComplete = false;
      try {
        const res = await fetch('/api/agent/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug, token, message }),
        });
        if (!res.ok || !res.body) {
          throw new Error(`HTTP ${res.status}`);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        // Novo balão de assistant a cada rodada de texto após tools
        let textOpen = true;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let idx: number;
          while ((idx = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, idx).trim();
            buffer = buffer.slice(idx + 1);
            if (!line.startsWith('data: ')) continue;
            let ev: ChatEvent;
            try {
              ev = JSON.parse(line.slice(6));
            } catch {
              continue;
            }
            if (ev.type === 'text') {
              if (!textOpen) {
                setItems((prev) => [...prev, { role: 'assistant', text: '', activities: [] }]);
                textOpen = true;
              }
              patchLast((m) => {
                m.text += (ev as { delta: string }).delta;
              });
            } else if (ev.type === 'tool_result') {
              const activity = activityFromEvent(ev);
              if (activity) {
                patchLast((m) => {
                  m.activities.push(activity);
                });
              }
              if (ev.name === 'complete_department' && ev.ok) sawDepartmentComplete = true;
              textOpen = false;
            } else if (ev.type === 'error') {
              patchLast((m) => {
                m.text += (m.text ? '\n\n' : '') + (ev as { message: string }).message;
              });
            }
          }
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('chat stream error:', e);
        patchLast((m) => {
          if (!m.text)
            m.text =
              'Não consegui responder agora por um problema técnico. Tente reenviar a mensagem.';
        });
      } finally {
        setStreaming(false);
        if (sawDepartmentComplete) void refreshSession();
        inputRef.current?.focus();
      }
    },
    [slug, token, streaming, refreshSession]
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  if (loadError || !session) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md mx-4">
          <CardContent className="p-8 text-center">
            <AlertCircle className="w-16 h-16 mx-auto text-destructive mb-4" />
            <h1 className="text-xl font-semibold text-foreground mb-2">Link Inválido</h1>
            <p className="text-muted-foreground">{loadError || 'Este link não existe ou expirou.'}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const statusOf = (dep: DepartmentId) =>
    (session[`status_${dep}`] as string | null) === 'concluido';

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border/40 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 max-w-3xl flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0"
              onClick={() =>
                navigate(`/${slug}${token ? `?token=${encodeURIComponent(token)}` : ''}`)
              }
              aria-label="Voltar"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <PipeeloLogo size="sm" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">
                Onboarding com a IA
              </p>
              <p className="text-xs text-muted-foreground truncate">{session.empresa_nome}</p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-1.5">
            {DEPARTMENT_ORDER.map((dep) => (
              <span
                key={dep}
                title={DEPT_LABEL[dep]}
                className={`px-2 py-0.5 rounded-full text-[11px] font-medium border ${
                  statusOf(dep)
                    ? 'bg-accent/15 text-accent border-accent/30'
                    : 'bg-muted text-muted-foreground border-transparent'
                }`}
              >
                {statusOf(dep) ? '✓ ' : ''}
                {DEPT_LABEL[dep]}
              </span>
            ))}
          </div>
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 container mx-auto px-4 max-w-3xl w-full py-6 space-y-4">
        {items.length === 0 && (
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="p-5 space-y-3">
              <p className="text-sm text-foreground">
                Olá! Eu sou a <strong>Arquiteta da Pipeelo</strong> 👋 — vou configurar o
                atendimento inteligente da <strong>{session.empresa_nome}</strong> com você,
                conversando. Sem formulário: você me conta como a empresa funciona, eu pergunto o
                que precisar e configuro tudo por aqui, etapa por etapa.
              </p>
              <p className="text-sm text-muted-foreground">
                Pode parar quando quiser e voltar pelo mesmo link — a conversa continua de onde
                parou.
              </p>
              <Button size="sm" onClick={() => sendMessage('Vamos começar!')}>
                Vamos começar
              </Button>
            </CardContent>
          </Card>
        )}

        {items.map((item, i) =>
          item.role === 'user' ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-accent text-accent-foreground px-4 py-2.5 text-sm whitespace-pre-wrap">
                {item.text}
              </div>
            </div>
          ) : (
            <div key={i} className="flex flex-col items-start gap-1.5">
              {item.text && (
                <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-card border border-border px-4 py-2.5 text-sm text-foreground whitespace-pre-wrap">
                  {item.text}
                  {streaming && i === items.length - 1 && (
                    <Loader2 className="inline w-3.5 h-3.5 ml-1.5 animate-spin text-muted-foreground" />
                  )}
                </div>
              )}
              {!item.text && streaming && i === items.length - 1 && (
                <div className="rounded-2xl rounded-bl-sm bg-card border border-border px-4 py-2.5">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                </div>
              )}
              {item.activities.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {item.activities.map((a, j) => {
                    const Icon = ACTIVITY_ICON[a.kind];
                    return (
                      <span
                        key={j}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                          a.kind === 'completed'
                            ? 'bg-accent/15 text-accent'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {a.kind === 'completed' ? (
                          <Check className="w-3 h-3" />
                        ) : (
                          <Icon className="w-3 h-3" />
                        )}
                        {a.label}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          )
        )}
        <div ref={bottomRef} />
      </main>

      {/* Input */}
      <div className="sticky bottom-0 border-t border-border/40 bg-background/95 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-3 max-w-3xl">
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage(input);
            }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage(input);
                }
              }}
              rows={1}
              placeholder={streaming ? 'A Arquiteta está respondendo...' : 'Escreva sua mensagem'}
              disabled={streaming}
              className="flex-1 resize-none rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-60 max-h-40"
            />
            <Button type="submit" size="icon" disabled={streaming || !input.trim()} aria-label="Enviar">
              {streaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default OnboardingChat;
