import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireSupabase } from "./_lib/supabase.js";

function expandHorarioSemanal(horario: Record<string, unknown> | null | undefined) {
  if (!horario || typeof horario !== "object") return horario;
  const result: Record<string, unknown> = {};
  const ss = horario.segunda_sexta as Record<string, unknown> | undefined;
  const sab = horario.sabado as Record<string, unknown> | undefined;
  const df = horario.domingo_feriado as Record<string, unknown> | undefined;
  if (ss) {
    for (const dia of ["segunda_feira", "terca_feira", "quarta_feira", "quinta_feira", "sexta_feira"]) {
      result[dia] = { inicio: ss.inicio ?? null, fim: ss.fim ?? null, nao_atende: ss.nao_atende ?? false };
    }
  }
  if (sab) result.sabado = { inicio: sab.inicio ?? null, fim: sab.fim ?? null, nao_atende: sab.nao_atende ?? false };
  if (df) {
    result.domingo = { inicio: df.inicio ?? null, fim: df.fim ?? null, nao_atende: df.nao_atende ?? false };
    result.feriado = { inicio: df.inicio ?? null, fim: df.fim ?? null, nao_atende: df.nao_atende ?? false };
  }
  return result;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { sessionId, testWebhookUrl } = req.body as { sessionId?: string; testWebhookUrl?: string };
    if (!sessionId) return res.status(400).json({ error: "sessionId is required" });

    const supabase = requireSupabase();
    const { data: session, error: sessionError } = await supabase
      .from("onboarding_sessions")
      .select("*")
      .eq("id", sessionId)
      .single();
    if (sessionError || !session) return res.status(404).json({ error: "Session not found" });

    const requiredDepts = ["status_sac_geral", "status_financeiro", "status_suporte", "status_vendas"];
    const incomplete = requiredDepts.find((k) => session[k] !== "concluido");
    if (incomplete) return res.status(200).json({ message: "Not all departments are complete" });

    const { data: respostas, error: respostasError } = await supabase
      .from("onboarding_respostas")
      .select("*")
      .eq("session_id", sessionId);
    if (respostasError) return res.status(500).json({ error: "Error fetching responses" });

    const respostasPorDepartamento: Record<string, Record<string, unknown>> = {
      identificacao: {},
      sac_geral: {},
      financeiro: {},
      suporte: {},
      vendas: {},
    };

    for (const r of respostas || []) {
      const bucket = respostasPorDepartamento[r.departamento];
      if (!bucket) continue;
      let valor = r.resposta;
      if (valor && typeof valor === "object" && (valor.segunda_sexta || valor.sabado || valor.domingo_feriado)) {
        valor = expandHorarioSemanal(valor);
      }
      bucket[r.pergunta_id] = valor;
    }

    const payload = {
      session: {
        id: session.id,
        empresa_nome: session.empresa_nome,
        ceo_email: session.ceo_email,
        access_token: session.access_token,
        tenant_id: session.tenant_id ?? null,
        created_at: session.created_at,
        responsaveis: {
          sac_geral: session.responsavel_sac_geral,
          financeiro: session.responsavel_financeiro,
          suporte: session.responsavel_suporte,
          vendas: session.responsavel_vendas,
        },
        datas_conclusao: {
          sac_geral: session.concluido_sac_geral_at,
          financeiro: session.concluido_financeiro_at,
          suporte: session.concluido_suporte_at,
          vendas: session.concluido_vendas_at,
        },
      },
      respostas: respostasPorDepartamento,
    };

    const targetUrl = testWebhookUrl || `${process.env.PIPEELO_ADMIN_API_URL || "https://admin.pipeelo.com"}/api/clients/onboarding/create`;
    const apiToken = process.env.PIPEELO_ADMIN_API_TOKEN;

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (!testWebhookUrl && apiToken) headers["Authorization"] = `Bearer ${apiToken}`;

    const webhookResponse = await fetch(targetUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    const webhookBody = await webhookResponse.text();
    if (!webhookResponse.ok) {
      console.error("Webhook failed:", webhookResponse.status, webhookBody);
      return res.status(500).json({ error: "Webhook failed", status: webhookResponse.status, details: webhookBody });
    }

    return res.status(200).json({ success: true, message: "Webhook sent successfully" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("complete-onboarding error:", message);
    return res.status(500).json({ error: message });
  }
}
