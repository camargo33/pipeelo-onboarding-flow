/**
 * Notificação WhatsApp de conclusão do onboarding.
 *
 * Chamada fire-and-forget pelo complete-department logo após marcar um
 * departamento como concluído. Decide com base no `modo` da sessão se
 * deve disparar a mensagem agora.
 *
 * Idempotente via coluna `notificacao_conclusao_enviada_at`.
 */

import { findGroupByName, sendText, EvolutionConfigError } from './evolution';
import { getServiceSupabase } from './supabase';

const TEMPLATE_COMPLETO = (empresa: string) => `✅ *Onboarding concluído!*

${empresa}, recebemos todas as informações do seu provedor. Nosso time de implantação já está com o material e vai iniciar a configuração da sua *IA Pipeelo* nos próximos passos.

Em breve te chamamos com o cronograma de ativação. 🚀`;

const TEMPLATE_COMERCIAL = (empresa: string) => `✅ *CRM Pipeelo configurado!*

${empresa}, recebemos as configurações comerciais. Nosso time vai ativar o seu *CRM Pipeelo* e te chamar com os próximos passos da implantação. 🚀`;

type SessionRow = {
  id: string;
  empresa_nome: string;
  modo: 'completo' | 'comercial' | null;
  notificacao_conclusao_enviada_at: string | null;
  status_identificacao: string | null;
  status_sac_geral: string | null;
  status_financeiro: string | null;
  status_suporte: string | null;
  status_vendas: string | null;
};

function isOnboardingFinished(s: SessionRow): boolean {
  const modo = s.modo ?? 'completo';
  if (modo === 'comercial') {
    // Comercial: exige Identificação (dados da empresa) + Vendas (CRM).
    return s.status_identificacao === 'concluido' && s.status_vendas === 'concluido';
  }
  return (
    s.status_identificacao === 'concluido' &&
    s.status_sac_geral === 'concluido' &&
    s.status_financeiro === 'concluido' &&
    s.status_suporte === 'concluido' &&
    s.status_vendas === 'concluido'
  );
}

/**
 * Verifica se a sessão acabou de fechar e dispara mensagem no grupo do
 * cliente. Roda em background (chamado sem await pelo handler).
 *
 * Retorna `{ skipped, reason }` se decidiu não disparar; `{ sent: true, group }`
 * se mandou.
 */
export async function maybeNotifyOnboardingComplete(
  sessionId: string
): Promise<
  | { sent: true; group: { id: string; name: string } }
  | { skipped: true; reason: string }
> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from('onboarding_sessions')
    .select(
      'id, empresa_nome, modo, notificacao_conclusao_enviada_at, ' +
        'status_identificacao, status_sac_geral, status_financeiro, status_suporte, status_vendas'
    )
    .eq('id', sessionId)
    .maybeSingle<SessionRow>();

  if (error || !data) {
    return { skipped: true, reason: 'session_not_found' };
  }

  if (data.notificacao_conclusao_enviada_at) {
    return { skipped: true, reason: 'already_sent' };
  }

  if (!isOnboardingFinished(data)) {
    return { skipped: true, reason: 'not_finished_yet' };
  }

  // Marca ANTES de mandar pra evitar dupla notificação em race condition.
  // Se o envio falhar, ficaremos sem notificação (preferível a duplicar).
  const { error: markErr } = await supabase
    .from('onboarding_sessions')
    .update({ notificacao_conclusao_enviada_at: new Date().toISOString() })
    .eq('id', sessionId)
    .is('notificacao_conclusao_enviada_at', null);

  if (markErr) {
    return { skipped: true, reason: `mark_failed: ${markErr.message}` };
  }

  try {
    const group = await findGroupByName(data.empresa_nome);
    if (!group) {
      // Reverte o marker pra permitir retry futuro
      await supabase
        .from('onboarding_sessions')
        .update({ notificacao_conclusao_enviada_at: null })
        .eq('id', sessionId);
      return { skipped: true, reason: 'group_not_found' };
    }

    const text =
      (data.modo ?? 'completo') === 'comercial'
        ? TEMPLATE_COMERCIAL(data.empresa_nome)
        : TEMPLATE_COMPLETO(data.empresa_nome);

    await sendText(group.id, text);
    return { sent: true, group: { id: group.id, name: group.subject } };
  } catch (e) {
    if (e instanceof EvolutionConfigError) {
      // Sem config: rollback do marker pra permitir retry quando configurar
      await supabase
        .from('onboarding_sessions')
        .update({ notificacao_conclusao_enviada_at: null })
        .eq('id', sessionId);
      return { skipped: true, reason: 'evolution_unconfigured' };
    }
    console.error('[whatsapp-notify] sendText falhou:', e);
    return { skipped: true, reason: 'send_failed' };
  }
}
