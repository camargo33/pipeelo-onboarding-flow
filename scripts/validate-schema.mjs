import pg from "pg";

const url = process.argv[2];
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

const tables = await client.query(`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema='public' ORDER BY table_name
`);
console.log("Tabelas:", tables.rows.map((r) => r.table_name).join(", "));

const cols = await client.query(`
  SELECT column_name, data_type FROM information_schema.columns
  WHERE table_name='onboarding_sessions' AND table_schema='public'
  ORDER BY ordinal_position
`);
console.log("\nColunas de onboarding_sessions:");
cols.rows.forEach((r) => console.log(`  - ${r.column_name} (${r.data_type})`));

const policies = await client.query(`
  SELECT tablename, policyname, cmd, permissive, roles::text, qual
  FROM pg_policies WHERE schemaname='public' ORDER BY tablename, policyname
`);
console.log("\nRLS Policies:");
policies.rows.forEach((r) =>
  console.log(`  ${r.tablename}: ${r.policyname} [${r.permissive}][${r.cmd}] roles=${r.roles}`)
);

await client.end();
