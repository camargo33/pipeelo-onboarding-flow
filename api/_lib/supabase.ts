import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export function requireSupabase(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("Missing SUPABASE_URL env var");
  if (!serviceRoleKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY env var");
  cached = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  return cached;
}

