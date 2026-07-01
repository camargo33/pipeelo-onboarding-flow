import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { assertSessionAccess, HttpError } from '../_lib/auth-session';
import { getServiceSupabase } from '../_lib/supabase';
import { runAgentTurn } from '../_lib/agent/loop';

const ChatBodySchema = z.object({
  slug: z.string().min(1),
  token: z.string().min(1),
  message: z.string().min(1).max(6000),
});

/**
 * POST /api/agent/chat — um turno da conversa de onboarding V2.
 * Responde em SSE: {type:'text',delta} | {type:'tool_call'|'tool_result',...}
 * | {type:'done'} | {type:'error',message}.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'method_not_allowed' });

  let body: z.infer<typeof ChatBodySchema>;
  try {
    body = ChatBodySchema.parse(req.body);
  } catch {
    return res.status(400).json({ error: 'invalid_payload' });
  }

  let session: Record<string, unknown>;
  try {
    session = (await assertSessionAccess(body.slug, body.token)) as Record<string, unknown>;
  } catch (e) {
    if (e instanceof HttpError)
      return res.status(e.status).json({ error: e.message });
    console.error('[agent/chat] auth error:', e);
    return res.status(500).json({ error: 'internal' });
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  const flushable = res as unknown as { flushHeaders?: () => void };
  flushable.flushHeaders?.();

  const send = (event: Record<string, unknown>) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  const proto = (req.headers['x-forwarded-proto'] as string) || 'https';
  const host = req.headers.host || 'onboarding.pipeelo.com';
  const baseUrl = `${proto}://${host}`;

  try {
    await runAgentTurn({
      supabase: getServiceSupabase(),
      session,
      slug: body.slug,
      userMessage: body.message,
      baseUrl,
      send,
    });
  } catch (e) {
    console.error('[agent/chat] erro inesperado:', e);
    send({ type: 'error', message: 'erro interno' });
  }
  res.end();
}
