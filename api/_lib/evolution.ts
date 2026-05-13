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

/**
 * Busca todos os grupos da instância e filtra por nome (case-insensitive).
 * Estratégia: primeiro tenta match exato, depois startsWith, depois includes.
 * Retorna o primeiro match ou null.
 */
export async function findGroupByName(name: string): Promise<EvolutionGroup | null> {
  const { baseUrl, instance, apiKey } = getConfig();
  const url = `${baseUrl}/group/fetchAllGroups/${encodeURIComponent(instance)}?getParticipants=false`;
  const r = await fetch(url, { headers: { apikey: apiKey } });
  if (!r.ok) {
    throw new EvolutionApiError(r.status, await r.text());
  }
  const groups = (await r.json()) as Array<{ id: string; subject?: string; size?: number }>;
  const normalized = name.trim().toLowerCase();
  if (!normalized) return null;

  const exact = groups.find((g) => (g.subject ?? '').trim().toLowerCase() === normalized);
  if (exact) return { id: exact.id, subject: exact.subject ?? '', size: exact.size };

  const starts = groups.find((g) => (g.subject ?? '').trim().toLowerCase().startsWith(normalized));
  if (starts) return { id: starts.id, subject: starts.subject ?? '', size: starts.size };

  const incl = groups.find((g) => (g.subject ?? '').trim().toLowerCase().includes(normalized));
  if (incl) return { id: incl.id, subject: incl.subject ?? '', size: incl.size };

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
