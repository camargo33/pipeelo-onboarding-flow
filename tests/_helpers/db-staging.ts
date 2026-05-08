/**
 * Helper para testes de RLS reais em staging (Wave 4).
 *
 * Variáveis de env esperadas (em .env.local NÃO commitado):
 *   - SUPABASE_STAGING_URL       — Project URL (https://<ref>.supabase.co)
 *   - SUPABASE_STAGING_ANON_KEY  — anon public key
 *   - SUPABASE_STAGING_DB_URL    — connection string Postgres (psql migrations)
 *
 * Uso:
 *   import { isStagingConfigured, makeStagingAnonClient } from './_helpers/db-staging';
 *   const skip = !isStagingConfigured();
 *   const d = skip ? describe.skip : describe;
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const STAGING_URL = process.env.SUPABASE_STAGING_URL ?? '';
export const STAGING_ANON_KEY = process.env.SUPABASE_STAGING_ANON_KEY ?? '';
export const STAGING_DB_URL = process.env.SUPABASE_STAGING_DB_URL ?? '';

export function isStagingConfigured(): boolean {
  return STAGING_URL.length > 0 && STAGING_ANON_KEY.length > 0;
}

export function makeStagingAnonClient(): SupabaseClient {
  if (!isStagingConfigured()) {
    throw new Error('staging_not_configured');
  }
  return createClient(STAGING_URL, STAGING_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
