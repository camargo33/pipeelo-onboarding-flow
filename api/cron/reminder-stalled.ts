import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getServiceSupabase } from '../_lib/supabase';
import { sendTransactionalEmail } from '../_lib/email-sender';

/**
 * GET /api/cron/reminder-stalled — Plan 05-02 / UI-05
 *
 * Vercel Cron diário 0 12 * * * (12h UTC = 9h BRT — Pitfall 6 timezone discipline).
 * Drena sessões status='in_progress' com last_activity_at < now() - 48h.
 * Para cada uma, envia ReminderStalled via sendTransactionalEmail.
 *
 * Idempotency key inclui data UTC do dia (yyyymmdd) — mesmo dia idempotente
 * (NÃO duplica), dia seguinte permite re-envio (escalation suave).
 *
 * Auth: Authorization Bearer ${CRON_SECRET}.
 */

const BATCH_SIZE = 100;
const STALE_HOURS = 48;

export const config = { maxDuration: 60 } as const;

function yyyymmddUtc(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

interface StaleSession {
  id: string;
  slug: string;
  access_token: string;
  ceo_email: string | null;
  ceo_nome: string | null;
  empresa_nome: string | null;
  departamento_atual: string | null;
  last_activity_at: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Auth Vercel Cron
  const expected = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : null;
  if (!expected || req.headers.authorization !== expected) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  try {
    const sb = getServiceSupabase();
    const cutoff = new Date(Date.now() - STALE_HOURS * 3600_000).toISOString();

    const { data, error } = await sb
      .from('onboarding_sessions')
      .select(
        'id, slug, access_token, ceo_email, ceo_nome, empresa_nome, departamento_atual, last_activity_at',
      )
      .eq('status', 'in_progress')
      .lt('last_activity_at', cutoff)
      .not('ceo_email', 'is', null)
      .order('last_activity_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (error) {
      console.error('[reminder-stalled] db_error', { message: error.message });
      return res.status(500).json({ error: 'db_error', message: error.message });
    }

    const rows = (data as StaleSession[]) ?? [];
    const today = yyyymmddUtc();
    const baseUrl =
      process.env.PUBLIC_APP_URL ??
      process.env.ONBOARDING_BASE_URL ??
      'https://onboarding.pipeelo.com';

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const s of rows) {
      if (!s.ceo_email) continue;
      const lastActivityMs = new Date(s.last_activity_at).getTime();
      const horasParado = Math.floor((Date.now() - lastActivityMs) / 3600_000);
      const magicLink = `${baseUrl}/?session=${s.slug}&token=${s.access_token}`;

      try {
        const r = await sendTransactionalEmail({
          template: 'ReminderStalled',
          sessionId: s.id,
          to: s.ceo_email,
          idempotencyKey: `reminder:${s.id}:${today}`,
          props: {
            ceoNome: s.ceo_nome ?? 'CEO',
            empresaNome: s.empresa_nome ?? 'sua empresa',
            departamentoAtual: s.departamento_atual ?? 'seu onboarding',
            magicLink,
            horasParado,
          },
        });
        if (r.skipped) skipped += 1;
        else sent += 1;
      } catch (err) {
        failed += 1;
        console.error('[reminder-stalled] send_failed', {
          sessionId: s.id,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return res.status(200).json({
      ok: true,
      processed: rows.length,
      sent,
      skipped_idempotent: skipped,
      failed,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[reminder-stalled] unhandled', { message });
    return res.status(500).json({ error: 'internal', message });
  }
}
