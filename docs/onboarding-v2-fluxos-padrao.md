# Onboarding V2 — Fluxos padrão: base empírica (reports Netdigital)

O catálogo de fluxos em `api/_lib/agent/flows.ts` não foi inventado — deriva da análise
dos **162 reports de produção da Netdigital** (04-07/2026), tenant que passou pelo
onboarding por formulário e depois gerou meses de correções.

## Resultado da classificação

| Categoria | Qtde | % |
|---|---|---|
| **A — prevenível por onboarding profundo** | **60** | **37%** |
| B — runtime/disciplina do modelo (regra já existia ou micro-copy) | 88 | 54% |
| C — bug de plataforma/backend | 11 | 7% |
| D — sem conteúdo | 3 | 2% |

Os 60 "A" se concentram em 11 temas, que viraram os fluxos do catálogo:

| Tema (reports) | Fluxo no catálogo |
|---|---|
| Apresentação de planos/preços (10) — código do ERP exposto, preço errado, só 1 opção | `apresentacao_planos` |
| Multi-contrato/titularidade (9) — inclusive FLIP-FLOP: "endereço antes do menu" e depois o contrário | `identificacao_cliente` |
| Qualificação/pré-cadastro (7) — provedor TINHA roteiro próprio de 7 perguntas que nunca entrou no prompt | `qualificacao_pre_cadastro` |
| Encerramento/NPS (7) — link do Google pós-nota-alta, demanda nova durante NPS | `encerramento_nps` |
| Diagnóstico do suporte (7) — status proativo, quando pedir foto, bloqueio primeiro | `diagnostico_suporte` |
| Fora do horário/transferência (6) — template do dono, horário exato de retorno | `fora_horario_transferencia` |
| Roteamento de intenções (4) — slug "comercial" INEXISTENTE no tenant, PJ sem rota | `roteamento_intencoes` |
| Políticas financeiras (4) — cliente em dia pede 2ª via | `segunda_via_cobranca` |
| Saudação/menu (3) — identidade da marca, itens exatos | `saudacao_menu` |
| Cancelamento/retenção (2, alto impacto) — lentidão→suporte, upgrade só se <200 Mega; setor "retenção" citado mas inexistente | `cancelamento_retencao` |
| Viabilidade sem cobertura (1) | `viabilidade_sem_cobertura` |

## Leituras que moldaram a metodologia

1. **Flip-flop = decisão nunca tomada.** Quando reports do mesmo tenant se contradizem,
   é porque o ponto de decisão nunca foi apresentado ao dono como escolha explícita.
   Por isso o agente apresenta cada decisão como opções (a)/(b) e registra a escolha —
   inclusive quando o cliente escolhe o padrão.
2. **Rascunho antes da produção.** A maioria dos "A" é o dono corrigindo em produção um
   texto/fluxo que ele teria corrigido em 2 minutos vendo o rascunho antes. Por isso o
   agente mostra mensagens como o cliente final veria no WhatsApp.
3. **Config consistente com a realidade.** Slug/setor citado que não existe no tenant é
   padrão recorrente (comercial, retenção). O fluxo `roteamento_intencoes` força o
   mapa assunto→setor usando os setores REAIS.
4. **O que onboarding NÃO resolve (54%):** violação de regra que já existia no prompt e
   micro-copy. Isso é qualidade do template base + eval de runtime — não prometer que o
   onboarding elimina reports.

## Mecânica (mostrar → escolher → montar → confirmar)

1. Agente MOSTRA o fluxo padrão numerado (e rascunhos de mensagens).
2. APRESENTA os pontos de decisão como opções concretas.
3. MONTA o fluxo final com as decisões aplicadas e mostra ao cliente.
4. Só após confirmação explícita chama `confirm_flow` (que valida deterministicamente
   que TODOS os pontos de decisão têm escolha registrada).
5. `complete_department` é bloqueado enquanto houver fluxo pendente no departamento.

Fluxos confirmados ficam em `onboarding_agent_insights` (categoria `fluxo_confirmado`,
coluna `flow_id`) e viajam no `agent_insights` do payload final para o admin-pipeelo
usar na geração dos prompts.
