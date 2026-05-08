import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getServiceSupabase } from "../_lib/supabase.js";
import {
  deliverOutbox,
  markDelivered,
  markFailedAttempt,
  markInFlight,
  type OutboxRow,
} from "../_lib/outbox.js";

/**
 * Plan 02-02: Reconciliation cron.
 *
 * Drena `webhook_outbox` com status='pending' AND next_retry_at <= now().
 * Roda a cada 5 minutos via Vercel Cron (vercel.json).
 *
 * Auth: Authorization Bearer CRON_SECRET (Vercel injeta automaticamente em
 * crons configurados via vercel.json + env CRON_SECRET).
 *
 * Concorrência: supabase-js não suporta SELECT FOR UPDATE SKIP LOCKED. O
 * mitigador é o markInFlight com guard `status='pending'` — se 2 cron runs
 * pegarem a mesma row simultaneamente, só uma consegue marcar in_flight, a
 * outra faz no-op no UPDATE. Combinado com backoff aleatório, double-deliver
 * é raro e tolerado pelo receiver (idempotente via session_id UNIQUE).
 *
 * Locking forte fica para o lease pattern do Phase 4 (Jarvis).
 */

const BATCH_SIZE = 25;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Auth
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  const got = req.headers.authorization;
  if (!process.env.CRON_SECRET || got !== expected) {
    return res.status(401).json({ error: "unauthorized" });
  }

  try {
    const sb = getServiceSupabase();
    const { data: pending, error } = await sb
      .from("webhook_outbox")
      .select("*")
      .eq("status", "pending")
      .lte("next_retry_at", new Date().toISOString())
      .order("next_retry_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (error) {
      console.error("[reconcile-webhooks] db_error", { message: error.message });
      return res.status(500).json({ error: "db_error", message: error.message });
    }

    const rows = (pending as OutboxRow[]) ?? [];

    const results = await Promise.allSettled(
      rows.map(async (row) => {
        await markInFlight(row.id);
        const r = await deliverOutbox(row);
        if (r.ok) {
          await markDelivered(row.id);
          return { id: row.id, status: "delivered" as const };
        }
        await markFailedAttempt(
          row.id,
          `${r.status ?? "net"}: ${r.body ?? ""}`,
          row.attempt_count,
          row.max_attempts,
        );
        return { id: row.id, status: "retry_scheduled" as const };
      }),
    );

    const summary: Record<string, number> = {};
    for (const r of results) {
      if (r.status === "fulfilled") {
        summary[r.value.status] = (summary[r.value.status] ?? 0) + 1;
      } else {
        summary.errored = (summary.errored ?? 0) + 1;
        console.error("[reconcile-webhooks] worker error", {
          reason: String(r.reason).slice(0, 200),
        });
      }
    }

    return res.status(200).json({
      ok: true,
      processed: rows.length,
      summary,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[reconcile-webhooks] unhandled", { message });
    return res.status(500).json({ error: "internal", message });
  }
}
