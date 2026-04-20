import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireSupabase } from "./_lib/supabase";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") return res.status(204).end();
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
    console.error("create-session exception:", message);
    return res.status(500).json({ error: message });
  }
}
