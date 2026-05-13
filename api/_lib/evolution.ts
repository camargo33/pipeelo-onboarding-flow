/**
 * Cliente mínimo da Evolution API (WhatsApp) usado pelo onboarding.
 *
 * Env vars (config no EasyPanel):
 *   EVOLUTION_API_BASE_URL  ex: https://pipeelo-evolution-api.zhh0vo.easypanel.host
 *   EVOLUTION_API_INSTANCE  ex: Avisos
 *   EVOLUTION_API_KEY       header `apikey`
 */

export class EvolutionConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EvolutionConfigError';
  }
}

export class EvolutionApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'EvolutionApiError';
  }
}

function getConfig() {
  const baseUrl = process.env.EVOLUTION_API_BASE_URL;
  const instance = process.env.EVOLUTION_API_INSTANCE;
  const apiKey = process.env.EVOLUTION_API_KEY;
  if (!baseUrl || !instance || !apiKey) {
    throw new EvolutionConfigError(
      'Faltam env vars: EVOLUTION_API_BASE_URL, EVOLUTION_API_INSTANCE, EVOLUTION_API_KEY'
    );
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ''), instance, apiKey };
}

export type EvolutionGroup = {
  id: string;
  subject: string;
  size?: number;
};

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '') // remove TODOS os combining marks (Unicode-aware)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Busca grupo WhatsApp pelo nome da empresa.
 *
 * Convenção dos grupos Pipeelo: o nome do grupo SEMPRE segue o padrão
 * "Pipeelo & {empresa}" (ou variantes "Pipeelo e {empresa}",
 * "Pipeelo - {empresa}"). O matcher tenta nessa ordem:
 *
 *   1. Match exato com "Pipeelo & {empresa}"
 *   2. Match exato com variantes ("e", "-", "&", "+")
 *   3. startsWith "pipeelo & {empresa}"
 *   4. includes "{empresa}" como palavra (regex word boundary)
 *   5. includes "{empresa}" simples (último recurso)
 *
 * Retorna o primeiro match ou null. Comparações são case-insensitive
 * e ignoram acentos.
 */
export async function findGroupByName(name: string): Promise<EvolutionGroup | null> {
  const { baseUrl, instance, apiKey } = getConfig();
  const url = `${baseUrl}/group/fetchAllGroups/${encodeURIComponent(instance)}?getParticipants=false`;
  const r = await fetch(url, { headers: { apikey: apiKey } });
  if (!r.ok) {
    throw new EvolutionApiError(r.status, await r.text());
  }
  const groups = (await r.json()) as Array<{ id: string; subject?: string; size?: number }>;
  const empresa = normalize(name);
  if (!empresa) return null;

  type G = { id: string; subject: string; norm: string };
  const list: G[] = groups.map((g) => ({
    id: g.id,
    subject: g.subject ?? '',
    norm: normalize(g.subject ?? ''),
  }));

  const candidates = [
    `pipeelo & ${empresa}`,
    `pipeelo e ${empresa}`,
    `pipeelo - ${empresa}`,
    `pipeelo + ${empresa}`,
    empresa,
  ];

  // 1. exact match em qualquer candidato
  for (const c of candidates) {
    const hit = list.find((g) => g.norm === c);
    if (hit) return { id: hit.id, subject: hit.subject };
  }

  // 2. startsWith em qualquer candidato
  for (const c of candidates) {
    const hit = list.find((g) => g.norm.startsWith(c));
    if (hit) return { id: hit.id, subject: hit.subject };
  }

  // 3. word-boundary includes do nome da empresa
  const wordRe = new RegExp(`\\b${empresa.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
  const wordHit = list.find((g) => wordRe.test(g.norm));
  if (wordHit) return { id: wordHit.id, subject: wordHit.subject };

  // 4. includes simples (último recurso)
  const incl = list.find((g) => g.norm.includes(empresa));
  if (incl) return { id: incl.id, subject: incl.subject };

  return null;
}

export async function sendText(jid: string, text: string): Promise<{ ok: true }> {
  const { baseUrl, instance, apiKey } = getConfig();
  const url = `${baseUrl}/message/sendText/${encodeURIComponent(instance)}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      number: jid,
      text,
      delay: 1000,
      linkPreview: false,
    }),
  });
  if (!r.ok) {
    throw new EvolutionApiError(r.status, await r.text());
  }
  return { ok: true };
}
