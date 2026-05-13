import type { VercelRequest, VercelResponse } from '@vercel/node';
import { assertAdminUser, AdminAuthError } from '../_lib/admin-auth';
import { getServiceSupabase } from '../_lib/supabase';
import {
  findGroupByName,
  sendText,
  EvolutionConfigError,
  EvolutionApiError,
} from '../_lib/evolution';

const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const CODE_LEN = 6;

function generateCode(len = CODE_LEN): string {
  let out = '';
  for (let i = 0; i < len; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

const WELCOME_TEMPLATE = (link: string) => `🎉 *Parabéns pela decisão!*

Seja muito bem-vindo(a) à Pipeelo! A partir de agora você dá um grande passo na *automatização do seu provedor* — e a gente vai trilhar esse caminho junto com você.

O *primeiro passo* dessa jornada é o preenchimento do formulário de onboarding. É com base nessas informações que a sua inteligência artificial vai ser treinada e personalizada pro seu provedor.

🔗 *Link do formulário:* ${link}

Você pode preencher tudo de uma vez ou no seu ritmo — as informações ficam salvas automaticamente.

Logo após a finalização, você receberá as informações sobre os próximos passos. 🚀`;

/**
 * POST /api/admin/whatsapp-send-welcome
 *   Auth: Bearer <supabase-jwt>
 *   Body: { session_id: string, modo: 'completo' | 'comercial' }
 *   200:  { ok: true, group: { id, name }, short_url, message_preview }
 *   400 invalid_input
 *   404 group_not_found  (grupo com nome = empresa_nome não existe)
 *   401 unauthorized
 *   502 evolution_error  | 503 evolution_unconfigured
 *
 * Fluxo:
 *  1. Hidrata sessão pra pegar empresa_nome + access_token + slug.
 *  2. Resolve/cria shortlink (tabela short_links) pro modo escolhido.
 *  3. Busca grupo no Evolution (`group.subject` == empresa_nome).
 *  4. Manda mensagem de boas-vindas com link curto.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  try {
    await assertAdminUser(req);

    const { session_id, modo } = req.body ?? {};
    if (typeof session_id !== 'string' || (modo !== 'completo' && modo !== 'comercial')) {
      return res.status(400).json({ error: 'invalid_input' });
    }

    const supabase = getServiceSupabase();

    // 1. Hidratar sessão
    const { data: session, error: sessErr } = await supabase
      .from('onboarding_sessions')
      .select('id, slug, empresa_nome, access_token')
      .eq('id', session_id)
      .maybeSingle();
    if (sessErr || !session) {
      return res.status(404).json({ error: 'session_not_found' });
    }

    // Atualiza modo da sessão (último link enviado define qual mensagem
    // de conclusão será disparada quando o cliente terminar).
    await supabase
      .from('onboarding_sessions')
      .update({ modo })
      .eq('id', session_id);

    const accessToken = (session as { access_token?: string }).access_token;
    const path = modo === 'comercial' ? `comercial/${session.slug}` : session.slug;
    const targetUrl = accessToken
      ? `https://onboarding.pipeelo.com/${path}?token=${accessToken}`
      : `https://onboarding.pipeelo.com/${path}`;

    // 2. Resolver/criar shortlink
    const host = req.headers.host ?? 'onboarding.pipeelo.com';
    const proto = (req.headers['x-forwarded-proto'] as string) ?? 'https';

    let code: string | null = null;
    const { data: existing } = await supabase
      .from('short_links')
      .select('code, target_url')
      .eq('session_id', session_id)
      .eq('modo', modo)
      .maybeSingle();

    if (existing) {
      if (existing.target_url !== targetUrl) {
        await supabase.from('short_links').update({ target_url: targetUrl }).eq('code', existing.code);
      }
      code = existing.code;
    } else {
      for (let i = 0; i < 5; i++) {
        const candidate = generateCode();
        const { error: insErr } = await supabase.from('short_links').insert({
          code: candidate,
          target_url: targetUrl,
          session_id,
          modo,
        });
        if (!insErr) {
          code = candidate;
          break;
        }
        if ((insErr as { code?: string }).code !== '23505') {
          throw insErr;
        }
      }
    }

    if (!code) {
      return res.status(500).json({ error: 'shortlink_generation_failed' });
    }

    const shortUrl = `${proto}://${host}/s/${code}`;

    // 3. Buscar grupo WhatsApp pelo nome da empresa
    const group = await findGroupByName(session.empresa_nome);
    if (!group) {
      return res.status(404).json({
        error: 'group_not_found',
        message: `Nenhum grupo WhatsApp encontrado pra "${session.empresa_nome}". Esperado padrão "Pipeelo & ${session.empresa_nome}" (ou variantes "e", "-", "+"). Confira o nome do grupo na instância Avisos.`,
      });
    }

    // 4. Mandar mensagem
    const messageText = WELCOME_TEMPLATE(shortUrl);
    await sendText(group.id, messageText);

    return res.status(200).json({
      ok: true,
      group: { id: group.id, name: group.subject, size: group.size },
      short_url: shortUrl,
      message_preview: messageText,
    });
  } catch (e: unknown) {
    if (e instanceof AdminAuthError) return res.status(e.status).json({ error: e.message });
    if (e instanceof EvolutionConfigError) {
      console.error('[whatsapp-send-welcome] config:', e.message);
      return res.status(503).json({ error: 'evolution_unconfigured', message: e.message });
    }
    if (e instanceof EvolutionApiError) {
      console.error('[whatsapp-send-welcome] evolution:', e.status, e.message);
      return res.status(502).json({ error: 'evolution_error', status: e.status, detail: e.message });
    }
    console.error('[whatsapp-send-welcome]', e);
    return res.status(500).json({ error: 'internal' });
  }
}
