/**
 * Integration test — HARD-09: anon key denied em onboarding_sessions/respostas
 * pós-aplicação de supabase/migrations/20260508120000_lock_rls_phase1.sql.
 *
 * Skipa se SUPABASE_STAGING_URL + SUPABASE_STAGING_ANON_KEY ausentes (CI sem secrets).
 * Roda manualmente após apply em staging (RUNBOOK Etapa 3).
 */
import { describe, it, expect } from 'vitest';
import { isStagingConfigured, makeStagingAnonClient } from '../_helpers/db-staging';

const skip = !isStagingConfigured();
const d = skip ? describe.skip : describe;

d('RLS lock — anon key denied em onboarding_sessions/respostas (HARD-09)', () => {
  const anon = isStagingConfigured() ? makeStagingAnonClient() : null;

  it('SELECT * onboarding_sessions retorna 0 rows OU permission_denied (42501)', async () => {
    const { data, error } = await anon!.from('onboarding_sessions').select('*').limit(1);
    // RESTRICTIVE com USING (false) pode resultar em data=[] OU PostgrestError 42501
    if (error) {
      expect(error.code).toBe('42501');
    } else {
      expect(data).toEqual([]);
    }
  });

  it('INSERT onboarding_sessions retorna 42501 permission_denied', async () => {
    const { error } = await anon!.from('onboarding_sessions').insert({
      slug: 'test-rls-' + Date.now(),
      access_token: 'x'.repeat(32),
      empresa_nome: 'RLS Test',
      cnpj: '11222333000181',
    });
    expect(error).not.toBeNull();
    expect(error!.code).toBe('42501');
  });

  it('UPDATE onboarding_sessions retorna 42501 ou affecta 0 rows', async () => {
    const { error, count } = await anon!
      .from('onboarding_sessions')
      .update({ empresa_nome: 'hacked' })
      .eq('slug', 'nonexistent-slug')
      .select('*', { count: 'exact', head: true });
    if (error) {
      expect(error.code).toBe('42501');
    } else {
      expect(count ?? 0).toBe(0);
    }
  });

  it('SELECT * onboarding_respostas retorna 0 rows OU permission_denied (42501)', async () => {
    const { data, error } = await anon!.from('onboarding_respostas').select('*').limit(1);
    if (error) {
      expect(error.code).toBe('42501');
    } else {
      expect(data).toEqual([]);
    }
  });

  it('INSERT onboarding_respostas retorna 42501', async () => {
    const { error } = await anon!.from('onboarding_respostas').insert({
      session_id: '00000000-0000-0000-0000-000000000000',
      departamento: 'identificacao',
      pergunta_id: 'q-rls-test',
      valor: 'rls-test-value',
    });
    expect(error).not.toBeNull();
    expect(error!.code).toBe('42501');
  });
});
