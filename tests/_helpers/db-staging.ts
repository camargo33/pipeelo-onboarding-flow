/**
 * Stub minimal — completar quando DB staging dedicado existir.
 * Por ora apenas expõe connection string + helper de presença, lidos do env.
 *
 * Uso em testes RLS reais (Wave 4):
 *   import { isStagingConfigured, STAGING_DB_URL } from './_helpers/db-staging';
 *   if (!isStagingConfigured()) test.skip(...);
 */
export const STAGING_DB_URL = process.env.SUPABASE_STAGING_DB_URL ?? '';
export const STAGING_ANON_KEY = process.env.SUPABASE_STAGING_ANON_KEY ?? '';

export function isStagingConfigured() {
  return STAGING_DB_URL.length > 0 && STAGING_ANON_KEY.length > 0;
}
