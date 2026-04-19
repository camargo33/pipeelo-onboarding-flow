import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url) throw new Error("Missing SUPABASE_URL");

export const supabaseAdmin = serviceRoleKey
  ? createClient(url, serviceRoleKey, { auth: { persistSession: false } })
  : null;

export function requireSupabase() {
  if (!supabaseAdmin) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY - server-side client unavailable");
  }
  return supabaseAdmin;
}
