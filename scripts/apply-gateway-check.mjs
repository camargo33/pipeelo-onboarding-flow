import { readFile } from 'node:fs/promises';
import pg from 'pg';

const url = 'postgresql://postgres.nhnzphwkwoasqktfbaty:Hkg12a3z%21%40%21@aws-1-sa-east-1.pooler.supabase.com:6543/postgres';
const sql = await readFile(new URL('../supabase/migrations/20260513150000_gateway_pagamento_check.sql', import.meta.url), 'utf8');

const c = new pg.Client({ connectionString: url });
await c.connect();
try {
  await c.query('BEGIN');
  await c.query(sql);
  await c.query('COMMIT');
  const r = await c.query(`
    SELECT con.conname, pg_get_constraintdef(con.oid) AS def
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'onboarding_sessions' AND con.conname LIKE '%gateway%';
  `);
  console.log('Constraint aplicada:');
  console.table(r.rows);
} catch (e) {
  await c.query('ROLLBACK').catch(()=>{});
  console.error('failed:', e.message);
  process.exitCode = 1;
} finally {
  await c.end();
}
