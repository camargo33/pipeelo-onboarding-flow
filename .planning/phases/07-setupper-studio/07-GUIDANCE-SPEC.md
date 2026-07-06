# 07-GUIDANCE-SPEC — Condução, qualidade de resposta e montagem ponta-a-ponta

**Status:** normativo (par da 07-HARNESS-SPEC: aquela cuida da MECÂNICA do loop; esta cuida do que o loop CONDUZ — a qualidade da conversa e a completude do resultado). Implementada pelo 07-07-PLAN. Em conflito com um PLAN, esta spec vence.

**Tese:** num onboarding de 250 perguntas + 13 fluxos + estilo + fluxos custom, o modelo NÃO consegue se auto-conduzir com qualidade lendo uma lista gigante de pendências — ele vira interrogador, repete pergunta, despeja formulário ou divaga. Estado da arte (Claude Code TODO/plan mode, Codex plano-first, curriculum learning) é o HARNESS possuir o plano e servir ao modelo, a cada turno, **uma missão de cada vez com o contexto exato dela** — e verificar o resultado com invariantes determinísticos, como o blueprint do admin faz com tenants prontos.

---

## 1. Agenda Engine — o harness possui o plano de voo

### 1.1 Missões
`computeAgenda(state): Agenda` — função pura que deriva do estado canônico uma sequência ORDENADA de missões por departamento:

```ts
type Mission =
  | { kind: 'abertura_dept'; dept: string }                          // 1 por dept: explicar o que se configura ali
  | { kind: 'montar_fluxo'; dept: string; flowId: string;            // estilo_comunicacao é a 1ª de sac_geral
      questionIds: string[] }                                        // perguntas do questionário LIGADAS ao tema (§1.2)
  | { kind: 'perguntas_tema'; dept: string; temaId: string;
      titulo: string; questionIds: string[] }                        // grupos temáticos sem fluxo (ex.: credenciais ERP)
  | { kind: 'recap_conclusao'; dept: string }                        // resumo + complete_department
  | { kind: 'mapa_final' }                                           // §5 — só quando resta 1 departamento
interface Agenda {
  atual: Mission;                    // a PRIMEIRA incompleta
  proximas: Mission[];               // só títulos (cap 4 no render)
  concluidas: number; total: number; // progresso honesto
}
```

Completude de missão (determinística): `montar_fluxo` = fluxo confirmado E questionIds obrigatórios visíveis respondidos; `perguntas_tema` = obrigatórias do grupo respondidas; `recap_conclusao` = status do dept concluído.

### 1.2 Topic map — pergunta ↔ fluxo (o roteiro de entrevista)
Tabela estática `TOPIC_MAP` em `agenda.ts` amarrando perguntas do questionário ao fluxo/tema do MESMO assunto — para o agente intercalar naturalmente (a regra "não pergunte duas vezes" do prompt vira ESTRUTURA):

| Missão | questionIds (exemplos canônicos — completar lendo questions.json) |
|---|---|
| montar_fluxo `segunda_via_cobranca` | `gateway_pagamento`, `gateway_outro`, `vencimentos_disponiveis`, política de juros/desbloqueio do financeiro |
| montar_fluxo `fora_horario_transferencia` | `horario_atendimento`/`horario_semanal`, plantão |
| montar_fluxo `apresentacao_planos` | `servicos_oferecidos`, `planos_internet_residencial` (repeater), fidelidade, taxa de instalação |
| montar_fluxo `diagnostico_suporte` | `erp_utilizado`, `olt_sistema`, reinício remoto disponível |
| montar_fluxo `qualificacao_pre_cadastro` | campos de pré-cadastro, `destino_pos_pre_cadastro` |
| perguntas_tema `credenciais_erp` (suporte) | `erp_*` (grupo sensível — melhor num bloco só, com a explicação do porquê) |

Critério para o executor completar o mapa: pergunta entra na missão cujo fluxo a CITARIA num passo; pergunta sem tema vira `perguntas_tema` do agrupamento da própria seção do questions.json (as `secoes` já agrupam). NENHUMA pergunta pode ficar fora da agenda (teste de cobertura: união dos questionIds da agenda == todas as perguntas do modo da sessão).

### 1.3 Curadoria do contexto (attention budgeting)
O `<session_context>` PARA de listar todas as perguntas pendentes do departamento. Passa a renderizar:

```
## Progresso        [múltiplas linhas: X/Y missões; departamentos com status]
## MISSÃO ATUAL     [a missão inteira: fluxo padrão + decisões pendentes/da conversa
                     + perguntas ligadas COM id, texto, tipo, opções e formato]
## Próximas missões [até 4 títulos de 1 linha]
## Já configurado   [compacto: fluxos confirmados (id+título), respostas por
                     seção como contagem ("financeiro: 12/32"), estilo efetivo em 1 linha]
## Resumo da conversa até aqui [rodante, §6 da HARNESS-SPEC]
```

- Alvo: `<session_context>` ≤ ~2.500 tokens em regime (hoje pode passar de 8k listando tudo) — menos ruído = melhor obediência às instruções, e é ISSO que sustenta a conversa longa.
- O estado completo continua no banco; o que sai do contexto fica acessível via tool (§1.4).

### 1.4 Tool nova: `search_questions`
O cliente adianta informação fora da missão ("ah, usamos Asaas") e o modelo precisa do `pergunta_id` exato sem ter a lista inteira no contexto:
`search_questions({ texto }) → { matches: [{pergunta_id, pergunta, tipo, opcoes?, departamento, respondida, valor_atual?}] }` — busca keyword/substring normalizada sobre questions.json + respostas (cap 8 matches). Read-only, sem side-effect. O system prompt instrui: informação voluntária → `search_questions` → `save_answers` → volta à missão (nunca abandonar a missão pela tangente).

## 2. Máquina de fases conversacional (o arco por departamento)

`abertura → [estilo (só sac_geral, primeira)] → fluxos+temas (missões) → recap → concluído`

- A fase atual é derivada da agenda e nomeada no contexto ("Fase: montando fluxos — 2 de 4").
- **Recap verificável:** `complete_department` ganha arg obrigatório `recap: string` (≥200 chars) — o resumo que o modelo APRESENTOU ao cliente antes de concluir; persistido como insight `recap_etapa` (auditável; o webhook/email já carrega). Gate: recap ausente/curto → erro instrutivo "apresente o resumo ao cliente e passe-o em recap". Isso torna o passo 7 do system prompt ("resuma antes de concluir") MECÂNICO em vez de esperança.

## 3. Linter de saída — qualidade da resposta como verificação, não como fé

`lintAssistantText(texto, state): Violation[]` — determinístico, roda no fim do turno sobre o texto FINAL do assistant; violações viram reminder corretivo no turno seguinte (o texto já foi streamado — corrigir a POSTURA, não reescrever o passado). Cap 1 reminder de lint por turno; lint NUNCA bloqueia.

| id | Detecção (determinística) | Reminder injetado |
|---|---|---|
| V1 `interrogatorio` | >3 `?` na mesma mensagem | «Sua última mensagem fez N perguntas. Máximo 2-3 relacionadas por vez — retome com UMA pergunta, a mais importante da missão atual.» |
| V2 `parede_de_texto` | >1.100 chars OU >14 linhas | «Mensagem longa demais para chat. Quebre: 1 ideia por mensagem, listas curtas.» |
| V3 `pergunta_repetida` | overlap ≥0,6 de keywords (>4 chars, sem stopwords) entre uma frase interrogativa do texto e o enunciado de pergunta JÁ RESPONDIDA | «Você reperguntou "<pergunta>" — já respondida: <valor>. Confirme se precisar, nunca re-pergunte do zero.» |
| V4 `vazamento_interno` | menção literal a `save_answers`/`confirm_flow`/`record_insight`/`complete_department`/`search_questions`/`JSON`/`session_context`/`system-reminder` | «Você citou mecânica interna. Fale a língua do dono do provedor — nunca mencione ferramentas ou termos técnicos internos.» |
| V5 `lista_formulario` | ≥5 linhas consecutivas terminando em `?` ou numeradas-interrogativas | «Isso é um formulário disfarçado. Converse: contexto + no máximo 2 perguntas.» |

Racional: são exatamente os patterns de reports que o time já paga caro (naturalize P2/P8/P9/P16, `vazamento_arquitetura_interna` do Debugger) — aplicados ao PRÓPRIO setupper. O detector é barato (regex/keywords) e o modelo corrige relendo (filosofia optimizer).

## 4. Invariantes de sessão — typechecker da config emergente

Análogo por-sessão dos `blueprint/invariants.ts` do admin (Fronteira #2): a config que o cliente monta precisa ser CONSISTENTE entre fluxos. `computeSessionInvariants(state): Violation[]` em `session-invariants.ts`; rodam em `confirm_flow` (warnings no result — o modelo resolve na conversa) e `complete_department` (INV3 bloqueia):

| id | Verificação | Severidade |
|---|---|---|
| INV1 `menu_sem_rota` | item do menu (decisão `itens_menu`) sem destino correspondente nas decisões de `roteamento_intencoes` (keywords normalizadas) | warning no confirm de qualquer um dos dois fluxos |
| INV2 `rota_para_setor_inexistente` | destino citado em decisões de roteamento/cancelamento ∉ setores declarados (`mapa_setores`) | warning |
| INV3 `horario_faltante` | `fora_horario_transferencia` confirmado E `horario_atendimento` não respondido | **bloqueia** complete_department(sac_geral) com erro instrutivo |
| INV4 `planos_ausentes` | `apresentacao_planos` confirmado mostrando planos E repeater de planos vazio | warning |
| INV5 `fluxo_custom_orfao` | insight `fluxo_personalizado` sem `confirm_flow custom_*` correspondente ao concluir o dept | warning no complete (não bloqueia; cita o insight) |

Formato do warning no tool result: `warnings: ['[INV1] O menu tem "Cobertura" mas o roteamento não define destino para esse assunto. Pergunte ao cliente pra onde vai.']` — acionável na conversa, mesma UX dos erros de gate.

## 5. Montagem ponta-a-ponta — o Mapa Final

O fechamento que garante "o agente montado de ponta a ponta", não uma coleção de respostas:

1. **Renderer determinístico** `renderFinalMap(state): string` — markdown com o AGENTE COMPLETO do cliente: identidade+estilo (decisões efetivas), agentes por departamento com seus fluxos confirmados (título + passos + decisões-chave), roteamento (menu→destinos), horários por setor, integrações (ERP/gateway declarados), planos, e os insights de personalização relevantes (categoria ≠ fluxo_confirmado). É a "planta do atendimento" em linguagem de dono.
2. **Gate final**: `complete_department` do ÚLTIMO departamento exigido pelo modo exige `confirmacao_final: true`. Sem ela → erro devolvendo `{ final_review_required: true, mapa: renderFinalMap(state), pendencias_invariantes: [...] }` — o harness ENTREGA o mapa pronto; o modelo apresenta ao cliente (formatando à vontade, conteúdo do mapa), colhe o "sim", e re-chama com `confirmacao_final: true` + `recap`.
3. **O mapa viaja**: persistido como insight `mapa_final` e anexado ao payload do webhook (`final_map: string` — campo aditivo no contrato do 07-05). O time de implantação (e o gerador de prompts) recebe o contrato legível do que foi combinado; o eval do 07-06 verifica a presença.

Efeito: NENHUM onboarding fecha sem o cliente ter visto e aprovado o sistema inteiro — a versão conversacional do "review and deploy".

## 6. System prompt v2 (a parte de condução)

Mudanças cirúrgicas (mantendo estabilidade/cacheabilidade):
- **Seção "Como conduzir" reescrita em torno da MISSÃO**: siga a MISSÃO ATUAL do `<session_context>`; dentro dela, intercale as perguntas ligadas com a montagem do fluxo; informação voluntária fora da missão → `search_questions` + salvar + voltar; nunca abrir missão nova com a atual incompleta.
- **Exemplar few-shot compacto (~25 linhas)**: UMA troca exemplar de mostrar→escolher (fluxo de cancelamento: rascunho da mensagem como o cliente final veria + apresentação de 1 decisão com recomendação + reação a ajuste do dono) — formato de resposta ideal ancorado por demonstração, não só por regra. Estável (cacheável).
- **Contrato de ritmo explícito**: 2-3 perguntas/mensagem; mensagens ≤ ~10 linhas; a cada resposta do cliente, PRIMEIRO reconheça o que ele disse (1 frase), depois avance; rascunhos de mensagem do cliente final SEMPRE em bloco citado.
- **Recap e mapa final**: instruções dos §2 e §5 (o modelo sabe que o harness vai exigir `recap` e `confirmacao_final`).

## 7. Integração com o resto da fase

- **Reminders (07-04 R2)**: `deriva_sem_progresso` passa a citar a MISSÃO ATUAL (não listas cruas). Lint (§3) entra como fonte adicional no `computeReminders` (prioridade: R1 manifest > lint > R2), cap global 2/turno mantido.
- **Preview (07-02)**: `state_changed` continua o gatilho; o smartphone ganha auto-follow da MISSÃO (activeFlowId = fluxo da missão atual quando for montar_fluxo).
- **Evals (07-06)**: cenários novos obrigatórios — re-pergunta (V3), foco de agenda (≤3 `?` por mensagem no cenário inteiro), mapa final (último complete_department só com confirmacao_final + mapa apresentado), invariante INV3 (fora_horario sem horário → conclusão bloqueada até responder).
- **Contrato (07-05)**: payload ganha `final_map?: string` (aditivo).

## 8. Critérios falsificáveis desta spec

1. `<session_context>` em regime ≤ 2.500 tokens numa sessão com 100+ respostas (medível no log de usage).
2. Cobertura da agenda: 100% das perguntas do modo pertencem a exatamente 1 missão (teste unitário).
3. Nos evals: zero re-pergunta de campo respondido; zero vazamento de nome de tool; toda sessão completa termina com mapa final apresentado e aprovado.
4. Falsifica a abordagem: se nos pilotos o cliente ABANDONAR a missão sistematicamente e o agente não conseguir acompanhá-lo (agenda rígida demais), a agenda vira sugestão em vez de trilho — decisão a tomar com evidência de piloto, não antes.
