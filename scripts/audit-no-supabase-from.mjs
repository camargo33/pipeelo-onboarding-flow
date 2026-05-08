#!/usr/bin/env node
/**
 * Gate CI HARD-01:
 * Falha se algum arquivo em src/ (exceto src/integrations/) chamar
 * supabase.from('onboarding_sessions' | 'onboarding_respostas').
 *
 * Migrate-then-lock: enquanto Wave 1/2 não migram leitura/escrita pra
 * /api/sessions/*, este audit detecta o leak — esperado falhar pré-migração
 * e ficar green ao fim do Plan 03.
 *
 * Implementação cross-platform via fs walk (sem dependência de git/grep).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, sep, posix } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]):/, '$1:');
const SRC_DIR = join(ROOT, 'src');
const EXCLUDE_DIRS = new Set(['integrations', 'node_modules', '.git']);
const FILE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
// Casa supabase.from('onboarding_sessions') ou ("onboarding_respostas")
const PATTERN = /supabase\s*\.\s*from\s*\(\s*['"]onboarding_(sessions|respostas)['"]/g;

const matches = [];

function walk(dir, relParts = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip src/integrations/ — cliente Supabase é declarado lá, não viola HARD-01
      if (relParts.length === 0 && EXCLUDE_DIRS.has(entry.name)) continue;
      walk(full, [...relParts, entry.name]);
      continue;
    }
    if (!FILE_EXT.test(entry.name)) continue;
    let content;
    try {
      content = readFileSync(full, 'utf8');
    } catch {
      continue;
    }
    PATTERN.lastIndex = 0;
    let m;
    while ((m = PATTERN.exec(content))) {
      const lineNo = content.slice(0, m.index).split(/\r?\n/).length;
      const rel = ['src', ...relParts, entry.name].join(posix.sep);
      matches.push(`${rel}:${lineNo}: ${m[0]}`);
    }
  }
}

try {
  if (!statSync(SRC_DIR).isDirectory()) {
    console.error(`FAIL: src/ não encontrado em ${ROOT}`);
    process.exit(2);
  }
} catch {
  console.error(`FAIL: src/ não encontrado em ${ROOT}`);
  process.exit(2);
}

walk(SRC_DIR);

if (matches.length > 0) {
  console.error('FAIL: supabase.from(onboarding_*) detectado em src/ — viola HARD-01:');
  for (const line of matches) console.error('  ' + line);
  process.exit(1);
}

console.log('PASS: zero supabase.from(onboarding_*) em src/');
process.exit(0);
