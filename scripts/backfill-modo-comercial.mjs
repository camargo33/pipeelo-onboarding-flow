// Backfill: sessões que tiveram shortlink comercial gerado (admin enviou
// link /comercial/{slug}) mas ainda estão com modo='completo' no DB (default
// da migration 20260513000000_session_modo.sql).
//
// Critério: existe row em short_links com modo='comercial' E a sessão ainda
// está com modo='completo' E os 3 deptos não-comercial (sac_geral, financeiro,
// suporte) estão 'pendente' (sinal de que ninguém preencheu, é fluxo comercial).
//
// Idempotente: roda quantas vezes quiser, só atualiza o que ainda está pendente.

import pg from 'pg';

const DB = 'postgresql://postgres.nhnzphwkwoasqktfbaty:Hkg12a3z%21%40%21@aws-1-sa-east-1.pooler.supabase.com:6543/postgres';

const c = new pg.Client({ connectionString: DB });
await c.connect();
try {
  // Preview
  const preview = await c.query(`
    SELECT s.id, s.empresa_nome, s.modo, s.status_sac_geral, s.status_vendas
    FROM public.onboarding_sessions s
    WHERE s.id IN (
      SELECT DISTINCT sl.session_id
      FROM public.short_links sl
      WHERE sl.modo = 'comercial'
    )
      AND s.modo = 'completo'
      AND (s.status_sac_geral = 'pendente' OR s.status_sac_geral IS NULL)
      AND (s.status_financeiro = 'pendente' OR s.status_financeiro IS NULL)
      AND (s.status_suporte = 'pendente' OR s.status_suporte IS NULL)
    ORDER BY s.created_at DESC;
  `);
  console.log('Sessões a serem atualizadas pra modo=comercial:');
  console.table(preview.rows);

  if (preview.rows.length === 0) {
    console.log('Nada pra fazer.');
    process.exit(0);
  }

  const upd = await c.query(`
    UPDATE public.onboarding_sessions
    SET modo = 'comercial'
    WHERE id IN (
      SELECT DISTINCT s.id
      FROM public.onboarding_sessions s
      JOIN public.short_links sl ON sl.session_id = s.id
      WHERE sl.modo = 'comercial'
        AND s.modo = 'completo'
        AND (s.status_sac_geral = 'pendente' OR s.status_sac_geral IS NULL)
        AND (s.status_financeiro = 'pendente' OR s.status_financeiro IS NULL)
        AND (s.status_suporte = 'pendente' OR s.status_suporte IS NULL)
    )
    RETURNING id, empresa_nome, modo;
  `);
  console.log(`\nAtualizado ${upd.rowCount} sessões:`);
  console.table(upd.rows);
} finally {
  await c.end();
}
