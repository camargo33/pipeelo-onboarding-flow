import type { VercelRequest, VercelResponse } from "@vercel/node";
import { adminApi } from "./_lib/admin-pipeelo";
import { requireSupabase } from "./_lib/supabase";

interface ProvisionRequest {
  sessionId: string;
  cnpj: string;
  razao_social: string;
  nome_fantasia: string;
  responsavel_nome: string;
  responsavel_cpf: string;
  admin_email: string;
  whatsapp_business: string;
  anatel?: string;
  tipo_empresa: string;
  numero_assinantes?: string;
}

interface TenantSearchResult {
  data?: Array<{ id: string; name: string; document?: string; tenant_id?: string; pipeelo_token?: string }>;
}

interface TenantCreateResult {
  id?: string;
  tenant_id?: string;
  pipeelo_token?: string;
  data?: { id?: string; tenant_id?: string; pipeelo_token?: string };
}

function normalizeCnpj(value: string): string {
  return value.replace(/\D/g, "");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const body = req.body as ProvisionRequest;
    const requiredFields: Array<keyof ProvisionRequest> = [
      "sessionId",
      "cnpj",
      "razao_social",
      "nome_fantasia",
      "responsavel_nome",
      "responsavel_cpf",
      "admin_email",
      "whatsapp_business",
      "tipo_empresa",
    ];
    for (const f of requiredFields) {
      if (!body[f]) return res.status(400).json({ error: `Missing field: ${f}` });
    }

    const cnpjDigits = normalizeCnpj(body.cnpj);
    if (cnpjDigits.length !== 14) return res.status(400).json({ error: "CNPJ inválido" });

    const supabase = requireSupabase();

    const existing = await adminApi<TenantSearchResult>("/api/v1/tenants", {
      query: { search: cnpjDigits },
    }).catch((err) => {
      console.warn("tenant search failed:", err);
      return null;
    });

    const found = existing?.data?.find((t) => normalizeCnpj(t.document || "") === cnpjDigits);

    if (found) {
      await supabase
        .from("onboarding_sessions")
        .update({
          tenant_id: found.tenant_id ?? found.id,
          pipeelo_token: found.pipeelo_token ?? null,
          status_identificacao: "concluido",
          concluido_identificacao_at: new Date().toISOString(),
        })
        .eq("id", body.sessionId);
      return res.status(200).json({
        success: true,
        existing: true,
        tenantId: found.tenant_id ?? found.id,
        message: "Tenant já existe — retomando onboarding",
      });
    }

    const created = await adminApi<TenantCreateResult>("/api/v1/tenants", {
      method: "POST",
      body: {
        name: body.nome_fantasia,
        legal_name: body.razao_social,
        document: cnpjDigits,
        responsible_name: body.responsavel_nome,
        responsible_document: normalizeCnpj(body.responsavel_cpf),
        admin_email: body.admin_email,
        whatsapp_number: body.whatsapp_business,
        anatel_license: body.anatel || null,
        company_type: body.tipo_empresa,
        subscriber_range: body.numero_assinantes || null,
      },
    });

    const tenantId = created.tenant_id ?? created.id ?? created.data?.tenant_id ?? created.data?.id;
    const pipeeloToken = created.pipeelo_token ?? created.data?.pipeelo_token ?? null;

    if (!tenantId) {
      throw new Error("admin-pipeelo não retornou tenant_id");
    }

    await supabase
      .from("onboarding_sessions")
      .update({
        tenant_id: tenantId,
        pipeelo_token: pipeeloToken,
        status_identificacao: "concluido",
        concluido_identificacao_at: new Date().toISOString(),
      })
      .eq("id", body.sessionId);

    return res.status(200).json({
      success: true,
      existing: false,
      tenantId,
      pipeeloToken: pipeeloToken ? "set" : null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("provision-tenant error:", message);
    return res.status(500).json({ error: message });
  }
}
