import pg from "pg";

const hosts = [];
for (const r of [
  "ap-northeast-1", "ap-northeast-2", "ap-south-1", "ap-southeast-1", "ap-southeast-2",
  "ca-central-1", "eu-central-1", "eu-central-2", "eu-north-1", "eu-west-1", "eu-west-2", "eu-west-3",
  "sa-east-1", "us-east-1", "us-east-2", "us-west-1", "us-west-2",
]) {
  hosts.push(`aws-0-${r}.pooler.supabase.com`);
  hosts.push(`aws-1-${r}.pooler.supabase.com`);
}

async function tryHost(host) {
  const client = new pg.Client({
    host,
    port: 5432,
    database: "postgres",
    user: "postgres.llsqqbbhcdosrtpvvkml",
    password: "Hkg12a3z!@!",
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 6000,
  });
  try {
    await client.connect();
    const { rows } = await client.query("SELECT current_user");
    await client.end();
    return { host, ok: true, info: rows[0] };
  } catch (err) {
    return { host, ok: false, err: err.message.slice(0, 80) };
  }
}

const results = await Promise.all(hosts.map(tryHost));
const found = results.filter((r) => r.ok);
if (found.length) {
  console.log("✅ ENCONTRADO:");
  found.forEach((r) => console.log(`  ${r.host} → ${JSON.stringify(r.info)}`));
} else {
  console.log("❌ Tenant não encontrado em nenhum host testado");
  const errs = new Set(results.map((r) => r.err));
  console.log("Erros únicos:", [...errs].slice(0, 5));
}
