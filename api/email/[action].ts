import type { VercelRequest, VercelResponse } from '@vercel/node';
import sendCredentials from './_send-credentials';
import sendFailureAlert from './_send-failure-alert';
import sendWelcome from './_send-welcome';

/**
 * Router /api/email/[action] — consolida os endpoints de email em 1
 * serverless function (limite de 12 do plano Hobby). As URLs públicas não
 * mudam: /api/email/send-welcome continua respondendo igual.
 */
const HANDLERS: Record<string, (req: VercelRequest, res: VercelResponse) => unknown> = {
  'send-credentials': sendCredentials,
  'send-failure-alert': sendFailureAlert,
  'send-welcome': sendWelcome,
};

export default function handler(req: VercelRequest, res: VercelResponse) {
  const action = Array.isArray(req.query.action) ? req.query.action[0] : req.query.action;
  const h = HANDLERS[action ?? ''];
  if (!h) return res.status(404).json({ error: 'not_found' });
  return h(req, res);
}
