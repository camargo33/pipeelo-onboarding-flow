import type { OnboardingPayload } from "pipeelo-onboarding-contracts";
import { getServiceSupabase } from "./supabase.js";

/**
 * Plan 02-02: Outbox pattern para webhook complete-onboarding.
 *
 * Por que existe: pitfall 5 (webhook fire-and-forget). Sem outbox, primeira
 * queda de rede no POST = sessão completada do lado do cliente mas zero
 * registro no admin-pipeelo.
 *
 * Fluxo:
 *   1. enqueueOutbox(args)             → upsert row pending (idempotent por session_id)
 *   2. markInFlight(id)                → otimisticamente marca em entrega (não sobrescreve)
 *   3. deliverOutbox(row)              → POST com Idempotency-Key + timeout 15s
 *   4. markDelivered(id) on 2xx        → sucesso terminal
 *   5. markFailedAttempt(id, ...) else → backoff exponencial 30s→8h ou status='failed' se max attempts
 */

export type OutboxStatus = "pending" | "in_flight" | "delivered" | "failed";

export interface OutboxRow {
  id: string;
  session_id: string;
  target_url: string;
  payload: OnboardingPayload;
  status: OutboxStatus;
  attempt_count: number;
  max_attempts: number;
  last_error: string | null;
  next_retry_at: string;
  delivered_at: string | null;
}

export interface DeliverResult {
  ok: boolean;
  status?: number;
  body?: string;
}

/**
 * Idempotent insert. Se já existe row para session_id, o upsert mantém os
 * campos existentes (NÃO regride status para 'pending' se já delivered).
 *
 * IMPORTANTE: usa onConflict='session_id' com ignoreDuplicates=true para que
 * row já delivered NÃO seja sobrescrita. Após o upsert, fazemos SELECT para
 * obter o estado atual (delivered ou pending).
 */
export async function enqueueOutbox(args: {
  sessionId: string;
  targetUrl: string;
  payload: OnboardingPayload;
}): Promise<OutboxRow> {
  const sb = getServiceSupabase();

  // Tenta insert. Se já existe (UNIQUE constraint), ignoreDuplicates evita erro.
  const { error: upsertError } = await sb.from("webhook_outbox").upsert(
    {
      session_id: args.sessionId,
      target_url: args.targetUrl,
      payload: args.payload as unknown as Record<string, unknown>,
      status: "pending",
      next_retry_at: new Date().toISOString(),
    },
    { onConflict: "session_id", ignoreDuplicates: true },
  );
  if (upsertError) {
    throw new Error(`enqueueOutbox upsert failed: ${upsertError.message}`);
  }

  // SELECT separado pega a row real (existente ou recém-criada) para retornar
  // status correto sem regredir delivered → pending.
  const { data, error: selectError } = await sb
    .from("webhook_outbox")
    .select("*")
    .eq("session_id", args.sessionId)
    .single();
  if (selectError || !data) {
    throw new Error(
      `enqueueOutbox select failed: ${selectError?.message ?? "no data"}`,
    );
  }
  return data as OutboxRow;
}

export async function markInFlight(id: string): Promise<void> {
  const sb = getServiceSupabase();
  // Optimistic: só atualiza se ainda pending. Outro worker que já marcou
  // in_flight não é sobrescrito.
  await sb
    .from("webhook_outbox")
    .update({ status: "in_flight" })
    .eq("id", id)
    .eq("status", "pending");
}

export async function markDelivered(id: string): Promise<void> {
  const sb = getServiceSupabase();
  await sb
    .from("webhook_outbox")
    .update({
      status: "delivered",
      delivered_at: new Date().toISOString(),
    })
    .eq("id", id);
}

/**
 * Marca tentativa falha com backoff exponencial.
 * Se attempt_count+1 >= max_attempts → status='failed' (terminal).
 * Senão → status='pending' com next_retry_at = now + 30s * 2^attempt + jitter (cap 8h).
 */
export async function markFailedAttempt(
  id: string,
  errorMsg: string,
  currentAttempts: number,
  maxAttempts: number,
): Promise<void> {
  const sb = getServiceSupabase();
  const nextAttempt = currentAttempts + 1;
  const truncated = errorMsg.slice(0, 500);

  if (nextAttempt >= maxAttempts) {
    await sb
      .from("webhook_outbox")
      .update({
        status: "failed",
        attempt_count: nextAttempt,
        last_error: truncated,
      })
      .eq("id", id);
    return;
  }

  // Backoff exponencial: 30s * 2^nextAttempt, com 30% jitter, cap em 8h.
  const baseMs = 30_000 * Math.pow(2, nextAttempt);
  const jitter = Math.random() * 0.3 * baseMs;
  const delayMs = Math.min(baseMs + jitter, 8 * 60 * 60 * 1000);
  const nextRetryAt = new Date(Date.now() + delayMs).toISOString();

  await sb
    .from("webhook_outbox")
    .update({
      status: "pending",
      attempt_count: nextAttempt,
      last_error: truncated,
      next_retry_at: nextRetryAt,
    })
    .eq("id", id);
}

/**
 * Tenta entregar payload via fetch.
 * - timeout 15s (AbortSignal.timeout)
 * - keepalive: true (sobrevive ao desligar do tab/serverless)
 * - Idempotency-Key: session_id (receiver pode dedupe)
 * - Authorization: Bearer ONBOARDING_WEBHOOK_TOKEN (mesmo token que receiver valida)
 *
 * NÃO lança — sempre retorna { ok, status?, body? }.
 */
export async function deliverOutbox(row: OutboxRow): Promise<DeliverResult> {
  try {
    const resp = await fetch(row.target_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.ONBOARDING_WEBHOOK_TOKEN ?? ""}`,
        "Idempotency-Key": row.session_id,
      },
      body: JSON.stringify(row.payload),
      keepalive: true,
      signal: AbortSignal.timeout(15_000),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      return { ok: false, status: resp.status, body: body.slice(0, 500) };
    }
    return { ok: true, status: resp.status };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, body: message.slice(0, 500) };
  }
}
