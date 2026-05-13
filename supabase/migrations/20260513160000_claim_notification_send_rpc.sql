-- RPC atômica pra reservar o envio de notificação de conclusão do onboarding.
-- Resolve o race: dois calls simultâneos do complete-department em deptos
-- próximos podem disparar dupla notificação WhatsApp. Esta função usa
-- UPDATE atômico com WHERE = null e retorna se ESTE caller ganhou.
--
-- Uso no helper whatsapp-notify.ts (substitui o UPDATE + check manual):
--   const { data: claimed } = await supabase.rpc('claim_notification_send', { p_session_id: sessionId });
--   if (!claimed) return { skipped: true, reason: 'already_sent_or_claimed' };
--
-- Se o caller PRECISAR reverter (grupo não encontrado, Evolution sem env),
-- existe release_notification_claim que zera o marker SE foi este caller
-- que ganhou recentemente — mas só vale por uma janela curta pra evitar
-- abrir janela de retry pra mensagens já entregues.

create or replace function public.claim_notification_send(p_session_id uuid)
returns boolean
language plpgsql
security definer
as $$
declare
  v_now timestamptz := now();
  v_updated_count int;
begin
  update public.onboarding_sessions
  set notificacao_conclusao_enviada_at = v_now
  where id = p_session_id
    and notificacao_conclusao_enviada_at is null;
  get diagnostics v_updated_count = row_count;
  return v_updated_count = 1;
end;
$$;

comment on function public.claim_notification_send(uuid) is
  'Reserva atômica do envio de notificação WhatsApp. Retorna true se ESTE caller ganhou a corrida (deve enviar), false se já estava marcado.';

-- Release: usado APENAS pelo helper quando o envio não vai acontecer
-- (grupo não encontrado, Evolution sem env). Permite retry mais tarde.
-- NÃO é seguro chamar após sendText OK porque Evolution às vezes responde
-- 5xx com mensagem entregue. O helper só chama isso quando tem certeza
-- absoluta que NÃO mandou.
create or replace function public.release_notification_claim(p_session_id uuid)
returns void
language sql
security definer
as $$
  update public.onboarding_sessions
  set notificacao_conclusao_enviada_at = null
  where id = p_session_id;
$$;

comment on function public.release_notification_claim(uuid) is
  'Libera o claim de notificação WhatsApp. Chamar APENAS quando o envio não aconteceu (grupo não encontrado / config faltando). NUNCA após sendText.';
