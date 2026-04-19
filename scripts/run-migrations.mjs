#!/usr/bin/env node
// Roda migrations no Supabase remoto via Node + pg (IPv6).
// Uso: node scripts/run-migrations.mjs <connection-string>

import { readdirSync, readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolve6 } from "node:dns/promises";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, "..", "supabase", "migrations");

const connectionString = process.argv[2] || process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Uso: node scripts/run-migrations.mjs <connection-string>");
  process.exit(1);
}

// Suporta tanto pooler IPv4 (pooler.supabase.com) quanto direct IPv6 (db.*.supabase.co)
const url = new URL(connectionString);
const hostname = url.hostname;
let clientConfig;
if (hostname.startsWith("db.") && hostname.endsWith(".supabase.co")) {
  const addrs = await resolve6(hostname);
  const ipv6 = addrs[0];
  console.log(`Resolvido ${hostname} (IPv6) -> [${ipv6}]`);
  clientConfig = {
    host: ipv6,
    port: Number(url.port) || 5432,
    database: url.pathname.replace(/^\//, ""),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    ssl: { rejectUnauthorized: false, servername: hostname },
  };
} else {
  console.log(`Usando pooler ${hostname}`);
  clientConfig = { connectionString, ssl: { rejectUnauthorized: false } };
}

const client = new pg.Client(clientConfig);

const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
console.log(`Encontradas ${files.length} migrations:`);
files.forEach((f) => console.log(`  - ${f}`));

try {
  await client.connect();
  console.log("\nConectado ao banco.\n");

  // Cria tabela de tracking se não existir
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT now()
    )
  `);

  const { rows: applied } = await client.query("SELECT version FROM public.schema_migrations");
  const appliedSet = new Set(applied.map((r) => r.version));

  for (const file of files) {
    const version = file.replace(/\.sql$/, "");
    if (appliedSet.has(version)) {
      console.log(`⏭  ${file} — já aplicada`);
      continue;
    }
    console.log(`▶  ${file} — aplicando...`);
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO public.schema_migrations (version) VALUES ($1)", [version]);
      await client.query("COMMIT");
      console.log(`✅ ${file} — OK`);
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(`❌ ${file} — FAIL:`, err.message);
      throw err;
    }
  }

  console.log("\n✅ Todas as migrations aplicadas.");
} finally {
  await client.end();
}
