import { readFile } from 'node:fs/promises';
import pg from 'pg';

const url = 'postgresql://postgres.nhnzphwkwoasqktfbaty:Hkg12a3z%21%40%21@aws-1-sa-east-1.pooler.supabase.com:6543/postgres';
const sql = await readFile(new URL('../supabase/migrations/20260513160000_claim_notification_send_rpc.sql', import.meta.url), 'utf8');

const c = new pg.Client({ connectionString: url });
await c.connect();
try {
  await c.query('BEGIN');
  await c.query(sql);
  await c.query('COMMIT');
  const r = await c.query(`
    SELECT proname FROM pg_proc WHERE proname IN ('claim_notification_send', 'release_notification_claim');
  `);
  console.log('RPCs criadas:');
  console.table(r.rows);
} catch (e) {
  await c.query('ROLLBACK').catch(()=>{});
  console.error('failed:', e.message);
  process.exitCode = 1;
} finally {
  await c.end();
}
