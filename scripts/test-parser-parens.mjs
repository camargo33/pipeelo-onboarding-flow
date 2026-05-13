// Verifica que evaluateConditional (parser paren-aware com precedência correta)
// lida com mistura de && e || corretamente.

function splitTopLevel(s, op) {
  const parts = [];
  let current = '';
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (depth === 0 && s.slice(i, i + op.length) === op) {
      parts.push(current.trim()); current = ''; i += op.length - 1;
    } else current += ch;
  }
  parts.push(current.trim());
  return parts;
}

function isBalancedAtBoundary(s) {
  if (!s.startsWith('(') || !s.endsWith(')')) return false;
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')') { depth--; if (depth === 0 && i < s.length - 1) return false; }
  }
  return depth === 0;
}

function evaluateConditional(cond, r) {
  try {
    let trimmed = cond.trim();
    while (trimmed.startsWith('(') && trimmed.endsWith(')') && isBalancedAtBoundary(trimmed)) {
      trimmed = trimmed.slice(1, -1).trim();
    }
    const orParts = splitTopLevel(trimmed, ' || ');
    if (orParts.length > 1) return orParts.some(p => evaluateConditional(p, r));
    const andParts = splitTopLevel(trimmed, ' && ');
    if (andParts.length > 1) return andParts.every(p => evaluateConditional(p, r));
    cond = trimmed;
    if (cond.includes(' includes ') || cond.includes(' contains ')) return false;
    if (cond.includes(' == ')) {
      const [campo, valorRaw] = cond.split(' == ');
      return r[campo.trim()] === valorRaw.replace(/'/g, '').trim();
    }
    if (cond.includes(' != ')) {
      const [campo, valorRaw] = cond.split(' != ');
      return r[campo.trim()] !== valorRaw.replace(/'/g, '').trim();
    }
    return true;
  } catch { return true; }
}

const r = { A: 'x', B: 'y', C: 'z' };

const tests = [
  { cond: "A == 'x' || B == 'y'", expected: true },
  { cond: "A == 'wrong' || B == 'y'", expected: true },
  { cond: "A == 'wrong' || B == 'wrong'", expected: false },
  { cond: "(A == 'x' && B == 'y') || C == 'wrong'", expected: true },
  { cond: "(A == 'x' && B == 'wrong') || C == 'z'", expected: true },
  { cond: "(A == 'wrong' && B == 'y') || C == 'wrong'", expected: false },
  { cond: "(A == 'x' || B == 'wrong') && C == 'z'", expected: true },
  { cond: "(A == 'wrong' || B == 'wrong') && C == 'z'", expected: false },
  { cond: "A == 'x' && B == 'y' && C == 'z'", expected: true },
  { cond: "A == 'x' && B == 'y' && C == 'wrong'", expected: false },
  { cond: "((A == 'x'))", expected: true },
  { cond: "_session_erp == 'Hubsoft' || _session_erp == 'SGP' || _session_erp == 'Outros'", respostas: { _session_erp: 'Hubsoft' }, expected: true },
  { cond: "_session_erp != '' || _session_mapas != '' || _session_gerenciamento_rede != '' || _session_gateway_pagamento != ''", respostas: { _session_erp: '', _session_mapas: '', _session_gerenciamento_rede: '', _session_gateway_pagamento: '' }, expected: false },
  { cond: "_session_erp != '' || _session_mapas != '' || _session_gerenciamento_rede != '' || _session_gateway_pagamento != ''", respostas: { _session_erp: 'IXC', _session_mapas: '', _session_gerenciamento_rede: '', _session_gateway_pagamento: '' }, expected: true },
];

let pass = 0, fail = 0;
for (const t of tests) {
  const got = evaluateConditional(t.cond, t.respostas ?? r);
  const ok = got === t.expected;
  console.log((ok ? '✓' : '✗') + ' [' + t.cond.slice(0, 70) + (t.cond.length > 70 ? '...' : '') + '] expected=' + t.expected + ' got=' + got);
  if (ok) pass++; else fail++;
}
console.log(`\n${pass} passou, ${fail} falhou`);
process.exit(fail > 0 ? 1 : 0);
