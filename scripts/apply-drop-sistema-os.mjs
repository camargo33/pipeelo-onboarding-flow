import { readFile } from 'node:fs/promises';
import pg from 'pg';

const url = 'postgresql://postgres.nhnzphwkwoasqktfbaty:Hkg12a3z%21%40%21@aws-1-sa-east-1.pooler.supabase.com:6543/postgres';
const sql = await readFile(new URL('../supabase/migrations/20260612230000_drop_sistema_os.sql', import.meta.url), 'utf8');

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query(sql);
  const r = await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='onboarding_sessions' AND column_name='sistema_os';");
  console.log(r.rows.length === 0 ? 'coluna sistema_os REMOVIDA' : 'ainda existe!');
} catch (e) {
  console.error('failed:', e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
