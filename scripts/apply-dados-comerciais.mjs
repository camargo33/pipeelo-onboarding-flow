// Aplica a migration via Supabase Management API (a senha do pooler foi
// rotacionada em jul/2026 — conexão pg direta não funciona mais).
// Token: ~/.supabase_pat_onboarding (PAT da conta dona do nhnzphwkwoasqktfbaty).
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PROJECT_REF = 'nhnzphwkwoasqktfbaty';
const token = (await readFile(join(homedir(), '.supabase_pat_onboarding'), 'utf8')).trim();
const sql = await readFile(new URL('../supabase/migrations/20260710120000_session_dados_comerciais.sql', import.meta.url), 'utf8');

async function query(q) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q }),
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${txt.slice(0, 500)}`);
  return txt ? JSON.parse(txt) : [];
}

try {
  await query(sql);
  console.log('migration applied');
  const rows = await query(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='onboarding_sessions' AND column_name IN ('valor_sessao','qtd_sessoes','valor_mensal','dia_vencimento','observacoes') ORDER BY column_name;"
  );
  console.log(JSON.stringify(rows, null, 2));
} catch (e) {
  console.error('failed:', e.message);
  process.exitCode = 1;
}
