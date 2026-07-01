/**
 * Cliente mínimo de chat-completions streaming do OpenRouter (fetch nativo,
 * sem dependência nova). Suporta tools (function calling), reasoning effort
 * e usage no chunk final.
 */

export interface ORToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export type ORMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ORToolCall[];
  tool_call_id?: string;
};

export interface ORToolDef {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export type ORStreamEvent =
  | { type: 'text'; delta: string }
  | { type: 'reasoning'; delta: string }
  | {
      type: 'finish';
      message: ORMessage;
      finishReason: string | null;
      usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null;
    };

export interface StreamChatOptions {
  apiKey: string;
  model: string;
  messages: ORMessage[];
  tools?: ORToolDef[];
  reasoningEffort?: 'low' | 'medium' | 'high';
  temperature?: number;
  maxTokens?: number;
}

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export async function* streamChatCompletion(
  opts: StreamChatOptions
): AsyncGenerator<ORStreamEvent> {
  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
    stream: true,
    temperature: opts.temperature ?? 0.3,
    max_tokens: opts.maxTokens ?? 4096,
    usage: { include: true },
  };
  if (opts.tools?.length) {
    body.tools = opts.tools;
    body.tool_choice = 'auto';
  }
  if (opts.reasoningEffort) {
    body.reasoning = { effort: opts.reasoningEffort };
  }

  let response: Response | null = null;
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      response = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${opts.apiKey}`,
          'HTTP-Referer': 'https://onboarding.pipeelo.com',
          'X-Title': 'Pipeelo Onboarding Agent',
        },
        body: JSON.stringify(body),
      });
      if (response.ok) break;
      const status = response.status;
      const text = await response.text().catch(() => '');
      lastErr = new Error(`OpenRouter HTTP ${status}: ${text.slice(0, 500)}`);
      response = null;
      // 4xx (exceto 429) não adianta repetir
      if (status >= 400 && status < 500 && status !== 429) break;
    } catch (e) {
      lastErr = e;
      response = null;
    }
    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
  }
  if (!response || !response.body) {
    throw lastErr instanceof Error ? lastErr : new Error('OpenRouter: sem resposta');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  let content = '';
  const toolCalls: Map<number, { id: string; name: string; args: string }> = new Map();
  let finishReason: string | null = null;
  let usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newlineIdx: number;
    while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newlineIdx).trim();
      buffer = buffer.slice(newlineIdx + 1);
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6);
      if (data === '[DONE]') continue;

      let parsed: {
        choices?: Array<{
          delta?: {
            content?: string;
            reasoning?: string;
            tool_calls?: Array<{
              index: number;
              id?: string;
              function?: { name?: string; arguments?: string };
            }>;
          };
          finish_reason?: string | null;
        }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
        error?: { message?: string };
      };
      try {
        parsed = JSON.parse(data);
      } catch {
        continue;
      }
      if (parsed.error?.message) {
        throw new Error(`OpenRouter stream error: ${parsed.error.message}`);
      }
      if (parsed.usage) usage = parsed.usage;

      const choice = parsed.choices?.[0];
      if (!choice) continue;
      if (choice.finish_reason) finishReason = choice.finish_reason;

      const delta = choice.delta;
      if (!delta) continue;
      if (delta.reasoning) yield { type: 'reasoning', delta: delta.reasoning };
      if (delta.content) {
        content += delta.content;
        yield { type: 'text', delta: delta.content };
      }
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const entry = toolCalls.get(tc.index) ?? { id: '', name: '', args: '' };
          if (tc.id) entry.id = tc.id;
          if (tc.function?.name) entry.name += tc.function.name;
          if (tc.function?.arguments) entry.args += tc.function.arguments;
          toolCalls.set(tc.index, entry);
        }
      }
    }
  }

  const assembledToolCalls: ORToolCall[] = [...toolCalls.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, tc], i) => ({
      id: tc.id || `call_${i}`,
      type: 'function' as const,
      function: { name: tc.name, arguments: tc.args || '{}' },
    }));

  const message: ORMessage = {
    role: 'assistant',
    content: content || null,
    ...(assembledToolCalls.length ? { tool_calls: assembledToolCalls } : {}),
  };

  yield { type: 'finish', message, finishReason, usage };
}
