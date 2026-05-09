import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireSupabase } from "./_lib/supabase.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") return res.status(204).end();

  // GET → modo diagnóstico temporário (remover após debug do "fetch failed")
  if (req.method === "GET") {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
    const hasSrv = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
    const hasAnon = Boolean(process.env.VITE_SUPABASE_ANON_KEY);
    let host: string | null = null;
    try {
      host = url ? new URL(url).host : null;
    } catch (e) {
      host = `INVALID:${e instanceof Error ? e.message : String(e)}`;
    }
    let ping: Record<string, unknown> = {};
    if (host) {
      try {
        const t0 = Date.now();
        const r = await fetch(`${url.replace(/\/+$/, "")}/rest/v1/`, {
          headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY || "" },
        });
        ping = { ok: true, status: r.status, ms: Date.now() - t0 };
      } catch (e) {
        ping = {
          ok: false,
          name: e instanceof Error ? e.name : "?",
          msg: e instanceof Error ? e.message : String(e),
          cause: e instanceof Error && (e as any).cause ? String((e as any).cause) : null,
        };
      }
    }
    return res.status(200).json({
      diag: true,
      host,
      urlLen: url.length,
      hasSrv,
      hasAnon,
      node: process.version,
      region: process.env.VERCEL_REGION || null,
      ping,
    });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { empresa_nome, ceo_email } = (req.body || {}) as {
      empresa_nome?: string;
      ceo_email?: string;
    };

    if (!empresa_nome || empresa_nome.trim().length < 2) {
      return res.status(400).json({ error: "empresa_nome é obrigatório" });
    }

    const supabase = requireSupabase();
    const { data, error } = await supabase
      .from("onboarding_sessions")
      .insert({
        empresa_nome: empresa_nome.trim(),
        ceo_email: ceo_email?.trim() || null,
      })
      .select("id, slug, empresa_nome, access_token")
      .single();

    if (error) {
      console.error("create-session error:", error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ success: true, session: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const cause = err instanceof Error && (err as any).cause ? String((err as any).cause) : null;
    console.error("create-session exception:", message, cause);
    return res.status(500).json({ error: message, cause });
  }
}
