import { readFile } from 'node:fs/promises';
import pg from 'pg';

const url = 'postgresql://postgres.nhnzphwkwoasqktfbaty:Hkg12a3z%21%40%21@aws-1-sa-east-1.pooler.supabase.com:6543/postgres';
const sql = await readFile(new URL('../supabase/migrations/20260710120000_session_dados_comerciais.sql', import.meta.url), 'utf8');

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query('BEGIN');
  await client.query(sql);
  await client.query('COMMIT');
  console.log('migration applied');
  const r = await client.query(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='onboarding_sessions' AND column_name IN ('valor_sessao','qtd_sessoes','valor_mensal','dia_vencimento','observacoes') ORDER BY column_name;"
  );
  console.log(JSON.stringify(r.rows, null, 2));
} catch (e) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('failed:', e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
