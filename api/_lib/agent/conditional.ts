/**
 * Avaliador de condicionais do questions.json — port server-side de
 * `src/hooks/useOnboarding.ts` (mesma semântica; manter em sincronia).
 * Suporta `==`, `!=`, `includes`/`contains`, `&&`, `||` e parênteses.
 */

export function evaluateConditional(
  condicional: string,
  respostas: Record<string, unknown>
): boolean {
  try {
    let trimmed = condicional.trim();
    while (
      trimmed.startsWith('(') &&
      trimmed.endsWith(')') &&
      isBalancedAtBoundary(trimmed)
    ) {
      trimmed = trimmed.slice(1, -1).trim();
    }

    const orParts = splitTopLevel(trimmed, ' || ');
    if (orParts.length > 1) {
      return orParts.some((p) => evaluateConditional(p, respostas));
    }

    const andParts = splitTopLevel(trimmed, ' && ');
    if (andParts.length > 1) {
      return andParts.every((p) => evaluateConditional(p, respostas));
    }

    condicional = trimmed;

    const membershipOp = condicional.includes(' includes ')
      ? ' includes '
      : condicional.includes(' contains ')
        ? ' contains '
        : null;
    if (membershipOp) {
      const [campo, valorRaw] = condicional.split(membershipOp);
      const valor = valorRaw.replace(/'/g, '').trim();
      const resposta = respostas[campo.trim()] as
        | { selected?: unknown[] }
        | unknown[]
        | undefined;

      if (resposta && typeof resposta === 'object' && 'selected' in resposta) {
        const sel = (resposta as { selected?: unknown[] }).selected;
        return Array.isArray(sel) && sel.includes(valor);
      }
      if (Array.isArray(resposta)) {
        return resposta.includes(valor);
      }
      return false;
    }

    if (condicional.includes(' == ')) {
      const [campo, valorRaw] = condicional.split(' == ');
      const valor = valorRaw.replace(/'/g, '').trim();
      const resposta = respostas[campo.trim()];
      if (resposta && typeof resposta === 'object' && 'selected' in (resposta as object)) {
        const selected = (resposta as { selected?: unknown[] }).selected;
        const sel = Array.isArray(selected) ? selected : [];
        return sel.length === 1 && sel[0] === valor;
      }
      if (Array.isArray(resposta)) {
        return resposta.length === 1 && resposta[0] === valor;
      }
      return resposta === valor;
    }

    if (condicional.includes(' != ')) {
      const [campo, valorRaw] = condicional.split(' != ');
      const valor = valorRaw.replace(/'/g, '').trim();
      const resposta = respostas[campo.trim()];
      if (resposta && typeof resposta === 'object' && 'selected' in (resposta as object)) {
        const selected = (resposta as { selected?: unknown[] }).selected;
        const sel = Array.isArray(selected) ? selected : [];
        return sel.some((v) => v !== valor);
      }
      if (Array.isArray(resposta)) {
        return resposta.some((v) => v !== valor);
      }
      return resposta !== valor;
    }

    return true;
  } catch (error) {
    console.warn('[agent/conditional] erro avaliando:', condicional, error);
    return true;
  }
}

function splitTopLevel(s: string, op: string): string[] {
  const parts: string[] = [];
  let current = '';
  let parenDepth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '(') parenDepth++;
    if (ch === ')') parenDepth--;
    if (parenDepth === 0 && s.slice(i, i + op.length) === op) {
      parts.push(current.trim());
      current = '';
      i += op.length - 1;
    } else {
      current += ch;
    }
  }
  parts.push(current.trim());
  return parts;
}

function isBalancedAtBoundary(s: string): boolean {
  if (!s.startsWith('(') || !s.endsWith(')')) return false;
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')') {
      depth--;
      if (depth === 0 && i < s.length - 1) return false;
    }
  }
  return depth === 0;
}
