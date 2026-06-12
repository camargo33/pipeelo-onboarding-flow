import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Resend } from "resend";
import { render } from "@react-email/render";
import * as React from "react";
import { JarvisFailedAlert } from "../../src/emails/JarvisFailedAlert";
import { getServiceSupabase } from "../_lib/supabase";

/**
 * POST /api/email/send-failure-alert
 *
 * Endpoint cross-repo chamado pelo admin-pipeelo (`lib/jarvis-failure-alert.ts`)
 * quando uma sessão Jarvis atinge attempt_count >= 3 e vai pra `needs_review` ou
 * `failed`.
 *
 * Plan 05-03 / Wave 3 — UI-07 (canal email do alerta dual).
 *
 * Auth: Bearer ONBOARDING_WEBHOOK_TOKEN (mesmo segredo do webhook
 * /api/clients/onboarding/create no admin-pipeelo).
 *
 * Idempotency: insert em `email_log` com chave UNIQUE
 *   `failure:{sessionId}:{attemptCount}`
 * Re-disparo no mesmo attemptCount → ON CONFLICT → resposta 200 com
 * status='skipped_idempotent', email NÃO sai 2ª vez.
 *
 * Best-effort em falha do Resend: persiste row com status='failed'
 * pra auditoria, retorna 502 mas nunca throws (caller usa Promise.allSettled).
 *
 * Body:
 *   {
 *     sessionId: string,           // UUID da sessão
 *     empresaNome: string,
 *     attemptCount: number,        // tentativa que estourou (≥3)
 *     lastError: string,           // último erro (truncado em 500 char)
 *     painelUrl: string,           // link drill-down admin-pipeelo
 *     runId?: string,              // jarvis_runs.id (opcional)
 *     traceUrl?: string            // langfuse trace url (opcional)
 *   }
 *
 * Response 200 (sent):
 *   { ok: true, status: 'sent', resend_id: '...' }
 * Response 200 (idempotent):
 *   { ok: true, status: 'skipped_idempotent' }
 * Response 4xx: { ok: false, error: '...' }
 * Response 502 (resend_failed): { ok: false, error: 'resend_send_failed', detail: '...' }
 */

interface FailureAlertBody {
  sessionId?: string;
  empresaNome?: string;
  attemptCount?: number;
  lastError?: string;
  painelUrl?: string;
  runId?: string;
  traceUrl?: string;
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

function assertWebhookToken(req: VercelRequest): boolean {
  const expected = process.env.ONBOARDING_WEBHOOK_TOKEN;
  if (!expected) return false;
  const auth = req.headers.authorization;
  const headerVal = Array.isArray(auth) ? auth[0] : auth;
  if (!headerVal?.startsWith("Bearer ")) return false;
  return headerVal.slice(7).trim() === expected;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST")
    return res.status(405).json({ ok: false, error: "method_not_allowed" });

  if (!assertWebhookToken(req)) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  const body = (req.body ?? {}) as FailureAlertBody;
  const { sessionId, empresaNome, attemptCount, lastError, painelUrl, runId, traceUrl } = body;

  if (
    typeof sessionId !== "string" ||
    !isUuid(sessionId) ||
    typeof empresaNome !== "string" ||
    typeof attemptCount !== "number" ||
    typeof lastError !== "string" ||
    typeof painelUrl !== "string"
  ) {
    return res.status(400).json({ ok: false, error: "invalid_body" });
  }

  const recipient = process.env.ALERT_FELIPE_EMAIL ?? process.env.ALERT_OPS_EMAIL;
  const resendKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? "Pipeelo Ops <ops@mail.pipeelo.com>";

  if (!recipient || !resendKey) {
    return res
      .status(500)
      .json({ ok: false, error: "alert_misconfigured", missing: { recipient: !recipient, resendKey: !resendKey } });
  }

  const idempotencyKey = `failure:${sessionId}:${attemptCount}`;
  const supabase = getServiceSupabase();

  // 1) Tenta inserir log com idempotency_key UNIQUE → se já existe, retorna skipped.
  const { data: existing, error: existingErr } = await supabase
    .from("email_log")
    .select("id, status, resend_id")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (existingErr && existingErr.code !== "PGRST116") {
    // Não trava no erro — log e segue tentando enviar (best-effort)
    console.error("[failure-alert] email_log lookup error", existingErr);
  }

  if (existing && existing.status === "sent") {
    return res.status(200).json({
      ok: true,
      status: "skipped_idempotent",
      resend_id: existing.resend_id,
      idempotency_key: idempotencyKey,
    });
  }

  // 2) Render React Email template
  let html: string;
  try {
    html = await render(
      React.createElement(JarvisFailedAlert, {
        sessionId,
        empresaNome,
        attemptCount,
        lastError,
        painelUrl,
        traceUrl,
      }),
    );
  } catch (err) {
    console.error("[failure-alert] template_render_failed", err);
    return res.status(500).json({ ok: false, error: "template_render_failed", detail: (err as Error).message });
  }

  // 3) Send via Resend
  const resend = new Resend(resendKey);
  const subject = `[PIPEELO] Jarvis falhou — ${empresaNome} (sessão ${sessionId.slice(0, 8)})`;

  let resendId: string | undefined;
  let sendErr: string | undefined;
  try {
    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: [recipient],
      subject,
      html,
    });
    if (error) {
      sendErr = `${error.name}: ${error.message}`;
    } else {
      resendId = data?.id;
    }
  } catch (err) {
    sendErr = (err as Error).message;
  }

  // 4) Persistir log (status='sent' ou 'failed')
  const status = sendErr ? "failed" : "sent";
  const logRow = {
    session_id: sessionId,
    template: "JarvisFailedAlert",
    idempotency_key: idempotencyKey,
    recipient,
    resend_id: resendId ?? null,
    status,
    error: sendErr ?? null,
  };

  // ON CONFLICT (idempotency_key) DO NOTHING via upsert
  const { error: insertErr } = await supabase
    .from("email_log")
    .upsert(logRow, { onConflict: "idempotency_key", ignoreDuplicates: true });

  if (insertErr) {
    console.error("[failure-alert] email_log insert error", insertErr);
    // Continua — log opcional, email já foi (ou já foi tentado).
  }

  if (sendErr) {
    return res.status(502).json({ ok: false, error: "resend_send_failed", detail: sendErr, idempotency_key: idempotencyKey, run_id: runId });
  }

  return res.status(200).json({
    ok: true,
    status: "sent",
    resend_id: resendId,
    idempotency_key: idempotencyKey,
    run_id: runId,
  });
}
