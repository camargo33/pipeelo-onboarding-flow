import type { VercelRequest, VercelResponse } from "@vercel/node";

// Endpoint diagnóstico temporário — remover após debug.
// NÃO expõe chaves; só host, presença de envs e resultado de ping.
export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const hasServiceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const hasAnon = Boolean(process.env.VITE_SUPABASE_ANON_KEY);

  let host: string | null = null;
  let urlLen = url.length;
  try {
    host = url ? new URL(url).host : null;
  } catch (e) {
    host = `INVALID_URL:${e instanceof Error ? e.message : String(e)}`;
  }

  let pingResult: Record<string, unknown> = {};
  if (host) {
    try {
      const start = Date.now();
      const r = await fetch(`${url.replace(/\/+$/, "")}/rest/v1/`, {
        method: "GET",
        headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY || "" },
      });
      pingResult = {
        ok: true,
        status: r.status,
        ms: Date.now() - start,
      };
    } catch (e) {
      pingResult = {
        ok: false,
        error: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
        cause: e instanceof Error && (e as any).cause ? String((e as any).cause) : null,
      };
    }
  }

  return res.status(200).json({
    urlLen,
    host,
    hasServiceRole,
    hasAnon,
    nodeVersion: process.version,
    region: process.env.VERCEL_REGION || null,
    ping: pingResult,
  });
}
