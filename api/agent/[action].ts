import type { VercelRequest, VercelResponse } from '@vercel/node';
import chat from './_chat';
import history from './_history';

/**
 * Router /api/agent/[action] — onboarding V2 conversacional.
 * 1 serverless function (limite de 12 do plano Hobby), URLs:
 * POST /api/agent/chat (SSE) e GET /api/agent/history.
 */
const HANDLERS: Record<string, (req: VercelRequest, res: VercelResponse) => unknown> = {
  chat,
  history,
};

export default function handler(req: VercelRequest, res: VercelResponse) {
  const action = Array.isArray(req.query.action) ? req.query.action[0] : req.query.action;
  const h = HANDLERS[action ?? ''];
  if (!h) return res.status(404).json({ error: 'not_found' });
  return h(req, res);
}
