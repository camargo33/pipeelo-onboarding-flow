/**
 * Loop agêntico por turno do onboarding V2.
 *
 * Padrão espelhado do prompt-optimizer/debugger do admin-pipeelo:
 * system prompt normativo estável + <session_context> fresco na 1ª user
 * message + histórico append-only persistido no banco. O modelo chama tools
 * (save_answers/record_insight/complete_department) e o executor valida
 * deterministicamente; erros de tool voltam pro modelo se corrigir.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  streamChatCompletion,
  type ORMessage,
} from './openrouter';
import { buildAgentSystemPrompt } from './system-prompt';
import { renderSessionContext, buildAnswerMap } from './blueprint';
import { AGENT_TOOLS, executeAgentTool, type AgentToolContext } from './tools';

const MAX_TOOL_ROUNDS = 8;
const MAX_HISTORY_ROWS = 160;

export interface AgentTurnEvent {
  type: 'text' | 'tool_call' | 'tool_result' | 'done' | 'error';
  [k: string]: unknown;
}

export interface RunAgentTurnInput {
  supabase: SupabaseClient;
  session: Record<string, unknown>;
  slug: string;
  userMessage: string;
  baseUrl: string;
  send: (event: AgentTurnEvent) => void;
}

function agentModel(): string {
  return process.env.ONBOARDING_AGENT_MODEL || 'deepseek/deepseek-v4-flash:nitro';
}

function agentReasoning(): 'low' | 'medium' | 'high' {
  const v = (process.env.ONBOARDING_AGENT_REASONING || 'high').toLowerCase();
  return v === 'low' || v === 'medium' ? v : 'high';
}

async function persistMessage(
  supabase: SupabaseClient,
  sessionId: string,
  role: 'user' | 'assistant' | 'tool',
  content: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase.from('onboarding_agent_messages').insert({
    session_id: sessionId,
    role,
    content,
  });
  if (error) console.error('[agent/loop] persistMessage falhou:', error.message);
}

/**
 * Carrega o histórico persistido e remonta como ORMessage[].
 * Trim: mantém as últimas MAX_HISTORY_ROWS linhas SEM órfãos de tool
 * (a janela não pode começar com role=tool nem cortar pares
 * assistant.tool_calls → tool).
 */
async function loadHistory(
  supabase: SupabaseClient,
  sessionId: string
): Promise<ORMessage[]> {
  const { data, error } = await supabase
    .from('onboarding_agent_messages')
    .select('role, content')
    .eq('session_id', sessionId)
    .order('id', { ascending: true });
  if (error) {
    console.error('[agent/loop] loadHistory falhou:', error.message);
    return [];
  }
  let rows = (data ?? []).map((r) => r.content as unknown as ORMessage);
  if (rows.length > MAX_HISTORY_ROWS) {
    rows = rows.slice(rows.length - MAX_HISTORY_ROWS);
    while (rows.length && rows[0].role === 'tool') rows.shift();
  }
  return rows;
}

export async function runAgentTurn(input: RunAgentTurnInput): Promise<void> {
  const { supabase, session, slug, userMessage, baseUrl, send } = input;
  const sessionId = session.id as string;
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    send({ type: 'error', message: 'OPENROUTER_API_KEY não configurada' });
    return;
  }

  // Estado vivo: respostas + insights → contexto fresco a cada turno
  const [{ data: respostas }, { data: insights }, history] = await Promise.all([
    supabase
      .from('onboarding_respostas')
      .select('departamento, pergunta_id, valor')
      .eq('session_id', sessionId),
    supabase
      .from('onboarding_agent_insights')
      .select('departamento, categoria, titulo, detalhe, flow_id')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true }),
    loadHistory(supabase, sessionId),
  ]);

  const contextBlock = renderSessionContext(session, respostas ?? [], insights ?? []);
  const answers = buildAnswerMap(respostas ?? [], session);
  const confirmedFlows = new Set<string>(
    (insights ?? [])
      .map((i) => (i as { flow_id?: string | null }).flow_id)
      .filter((v): v is string => Boolean(v))
  );

  const ctx: AgentToolContext = {
    supabase,
    session,
    answers,
    confirmedFlows,
    slug,
    baseUrl,
    pendingSideEffects: [],
  };

  const messages: ORMessage[] = [
    { role: 'system', content: buildAgentSystemPrompt() },
    {
      role: 'user',
      content: `${contextBlock}\n\n<system-reminder>O bloco acima é o estado ATUAL da sessão (reconstruído agora). O histórico da conversa segue abaixo; continue de onde parou.</system-reminder>`,
    },
    ...history,
    { role: 'user', content: userMessage },
  ];

  await persistMessage(supabase, sessionId, 'user', {
    role: 'user',
    content: userMessage,
  });

  const model = agentModel();
  const reasoning = agentReasoning();

  try {
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      let finalMessage: ORMessage | null = null;
      for await (const ev of streamChatCompletion({
        apiKey,
        model,
        messages,
        tools: AGENT_TOOLS,
        reasoningEffort: reasoning,
      })) {
        if (ev.type === 'text') {
          send({ type: 'text', delta: ev.delta });
        } else if (ev.type === 'finish') {
          finalMessage = ev.message;
        }
      }
      if (!finalMessage) throw new Error('stream terminou sem mensagem final');

      messages.push(finalMessage);
      await persistMessage(
        supabase,
        sessionId,
        'assistant',
        finalMessage as unknown as Record<string, unknown>
      );

      const toolCalls = finalMessage.tool_calls ?? [];
      if (!toolCalls.length) break;

      if (round === MAX_TOOL_ROUNDS) {
        // Teto de rounds: responde os pending tool calls com aviso e encerra
        for (const tc of toolCalls) {
          const toolMsg: ORMessage = {
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify({
              error: 'limite de rodadas de ferramentas neste turno; continue na próxima mensagem',
            }),
          };
          messages.push(toolMsg);
          await persistMessage(supabase, sessionId, 'tool', toolMsg as unknown as Record<string, unknown>);
        }
        break;
      }

      for (const tc of toolCalls) {
        let args: Record<string, unknown> = {};
        let result: Record<string, unknown>;
        try {
          args = JSON.parse(tc.function.arguments || '{}');
        } catch {
          result = { error: 'arguments não é JSON válido' };
          args = {};
        }
        send({
          type: 'tool_call',
          name: tc.function.name,
          args: summarizeArgs(tc.function.name, args),
        });
        result = await executeAgentTool(tc.function.name, args, ctx);
        send({
          type: 'tool_result',
          name: tc.function.name,
          ok: !result.error,
          summary: summarizeResult(tc.function.name, result),
        });

        const toolMsg: ORMessage = {
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify(result),
        };
        messages.push(toolMsg);
        await persistMessage(supabase, sessionId, 'tool', toolMsg as unknown as Record<string, unknown>);
      }
    }

    send({ type: 'done' });
  } catch (e) {
    console.error('[agent/loop] erro no turno:', e);
    send({
      type: 'error',
      message:
        'Tive um problema técnico agora. Pode reenviar a última mensagem? Nada do que você já respondeu se perdeu.',
    });
  } finally {
    // Side-effects em voo (provision/sync/email/webhook) — bounded por timeout próprio
    if (ctx.pendingSideEffects.length) {
      await Promise.allSettled(ctx.pendingSideEffects);
    }
  }
}

function summarizeArgs(name: string, args: Record<string, unknown>): unknown {
  if (name === 'save_answers') {
    const answers = args.answers as Array<{ pergunta_id: string }> | undefined;
    return { departamento: args.departamento, perguntas: answers?.map((a) => a.pergunta_id) ?? [] };
  }
  if (name === 'record_insight') {
    return { categoria: args.categoria, titulo: args.titulo };
  }
  return args;
}

function summarizeResult(name: string, result: Record<string, unknown>): unknown {
  if (result.error) return { error: result.error };
  if (name === 'save_answers') {
    return {
      salvas: (result.saved as string[])?.length ?? 0,
      pendentes: result.obrigatorias_pendentes_no_departamento,
    };
  }
  return result;
}
