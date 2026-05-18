import { readFile } from 'node:fs/promises';
import pg from 'pg';

const url = 'postgresql://postgres.nhnzphwkwoasqktfbaty:Hkg12a3z%21%40%21@aws-1-sa-east-1.pooler.supabase.com:6543/postgres';
const sql = await readFile(new URL('../supabase/migrations/20260518120000_card_created_at.sql', import.meta.url), 'utf8');

const c = new pg.Client({ connectionString: url });
await c.connect();
try {
  await c.query('BEGIN');
  await c.query(sql);
  await c.query('COMMIT');
  const r = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='onboarding_sessions' AND column_name='card_created_at';`);
  console.log('applied:', JSON.stringify(r.rows));
} catch (e) {
  await c.query('ROLLBACK').catch(()=>{});
  console.error('failed:', e.message);
  process.exitCode = 1;
} finally {
  await c.end();
}
