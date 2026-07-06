# Phase 07 — Setupper Studio: Research consolidado

**Data:** 2026-07-06
**Autor do plano:** Claude (Opus) — planejamento por destilação; execução por agente menor seguindo os PLANs desta pasta.
**Problema de negócio:** os fluxos nos prompts dos tenants são fixos. Durante os ajustes pós-liberação o cliente pede mudanças ao time Pipeelo, que precisa alterar dezenas de cenários manualmente. A causa raiz NÃO é a IA estar "crua" — é o cliente não ter a personalização à disposição NA HORA de configurar. O setupper (IA de onboarding) deve capturar essas personalizações declarativamente, mostrar NA PRÁTICA como vai ficar (preview "smartphone"), e emitir um contrato estruturado que o gerador de prompts do admin-pipeelo compila em Casos de Atendimento.

Este documento consolida a pesquisa (3 varreduras + skill `pipeelo-onboarding-zero-touch-frontier`). Tudo citável; paths relativos aos repos:
- `ONB` = `C:/Users/André/Documents/Desenvolvimento/onboarding-pipeelo` (branch `feat/onboarding-v2-agente-ia`)
- `ADM` = `C:/Users/André/Documents/Desenvolvimento/admin-pipeelo`

---

## 1. O que JÁ existe no chat V2 (a base a evoluir)

### Backend (sólido — reusar, não reescrever)
- **Loop**: `ONB/api/_lib/agent/loop.ts` — 1 turno por request, SSE (`text|tool_call|tool_result|done|error`), `MAX_TOOL_ROUNDS=8` (`loop.ts:19`), modelo `ONBOARDING_AGENT_MODEL` default `deepseek/deepseek-v4-flash:nitro`, reasoning `ONBOARDING_AGENT_REASONING` default `high` (`loop.ts:36-43`). Estado vivo recarregado A CADA turno (respostas + insights + histórico, `loop.ts:86-135`); histórico append-only em `onboarding_agent_messages` (migration `20260701120000_agent_conversation.sql`), janela `MAX_HISTORY_ROWS=160` sem cortar pares assistant→tool (`loop.ts:65-84`).
- **Cliente OpenRouter**: `ONB/api/_lib/agent/openrouter.ts` — fetch nativo, streaming, function-calling, retries. `temperature 0.3`, `max_tokens 4096` (`openrouter.ts:58-59`).
- **Tools** (4): `ONB/api/_lib/agent/tools.ts` — `save_answers` (normalização por tipo `normalizeValue` `tools.ts:165-246`, upsert `tools.ts:348-351`), `record_insight` (categorias `tools.ts:18-27`), `confirm_flow` (gate: todas as decisões do catálogo `tools.ts:411-419`; `fluxo_final ≥ 80 chars`; re-confirmação substitui `tools.ts:429-434`), `complete_department` (gates: identificação primeiro `tools.ts:467-476`, obrigatórias `tools.ts:478-485`, fluxos confirmados `tools.ts:487-497`; side-effects `tools.ts:512-561`).
- **Fluxos padrão**: `ONB/api/_lib/agent/flows.ts` — `STANDARD_FLOWS` com **12 fluxos** e pontos de decisão, minerados de 162 reports reais da Netdigital (37% dos problemas eram decisões nunca apresentadas ao dono — comentário `flows.ts:1-11`). Tipos: `FlowDecision {id, pergunta, opcoes, padrao?}` e `StandardFlow {id, departamento, titulo, objetivo, fluxoPadrao[], decisoes[]}` (`flows.ts:13-27`). Render pro contexto: `renderFlowsSection` (`flows.ts:225-246`).
- **System prompt**: `ONB/api/_lib/agent/system-prompt.ts` — "Arquiteta de implantação", NORMATIVO/estável (cacheável); metodologia central **mostrar→escolher→montar→confirmar** (`system-prompt.ts:31-45`); seção "o que a plataforma suporta" HARDCODED no prompt (`system-prompt.ts:55-64`) — vira fonte única no manifest (Plan 07-01).
- **Contexto vivo**: `ONB/api/_lib/agent/blueprint.ts` — `renderSessionContext` (`blueprint.ts:203-276`) com perguntas RESPONDIDA/PENDENTE/condicional-INATIVA + fluxos pendentes; condicionais espelhadas do frontend em `conditional.ts`. `DEPARTMENT_ORDER = identificacao → sac_geral → financeiro → suporte → vendas` (`blueprint.ts:50-56`); modo `comercial` = identificacao+vendas.
- **Rotas**: router único `ONB/api/agent/[action].ts` (limite de 12 functions do Vercel Hobby!) → `_chat.ts`, `_history.ts`. **Qualquer endpoint novo entra como `_<action>.ts` neste router.**
- **Auth**: `ONB/api/_lib/auth-session.ts:12-26` — slug+token, TTL 30 dias.

### Frontend (o elo fraco — é aqui que a Phase 07 mais mexe)
- `ONB/src/pages/OnboardingChat.tsx` (416 linhas), rota `/:slug/ia`. Header com pills de status por departamento (`:287-302`); SSE parse manual (`:167-219`); activity chips (`:40-66`). **NÃO existe preview/simulação nenhum.**
- Perguntas: `ONB/src/lib/questions.json` (2356 linhas; 250 perguntas: identificacao 79, sac_geral 49, financeiro 32, suporte 57, vendas 33; 17 tipos; condicionais).

### Integração com o admin (pronta — só estender o payload)
- `complete_department` → `/api/provision-tenant` (identificação) ou `/api/sync-department` (demais) + email (`tools.ts:512-548`).
- Tudo concluído → `/api/complete-onboarding` → outbox-first → `POST {PIPEELO_ADMIN_API_URL}/api/clients/onboarding/create`, payload validado por `ONB/contracts/src/onboarding-payload.ts` (Zod, `PAYLOAD_VERSION`), **`agent_insights` já viaja no payload** (`api/complete-onboarding.ts:62-66,113`).

---

## 2. O que o admin-pipeelo faz com isso (o alvo da compilação)

- **Unidade de fluxo = "## Caso N"** na SEÇÃO 9 dos prompts conversacionais: gatilho (título/intent) + passos numerados + sub-casos + funções por slug (`custom_*`) + roteamento (`change_ai_agent` slug / `send_to_department` slug). Regex canônica `CASE_HEADER_RE` em `ADM/lib/prompt-optimizer/agent/blueprint/conventions.ts:49`; parser `ADM/lib/prompt-optimizer/engine/section-parser.ts:388-438` (`ParsedCase`).
- **Anatomia real** (exemplo fiel): `ADM/scripts/prompt-eval/test-prompts/netdigital-suporte-FIX.txt` — SEÇÕES 1-9 (Identidade, Escopo, Contexto, Instruções, Restrições, Triagem, **Estilo de escrita**, Verificação+placeholders `[[regras-de-assistentes]]`/`[[regras-de-departamentos]]`, Casos).
- **Geração hoje = espelhar + personalizar**: subagente por prompt (`ADM/lib/onboarding/agent/prompt-generator.ts:20-35`) preserva estrutura/slugs/roteamento do tenant-espelho do MESMO ERP, troca identidade; validação determinística pós-geração (PROMPT_VERSION, placeholders literais, tamanho, slugs∈manifest — cf. `ADM/scripts/netdigital-validate-and-save.js:2-20`); `finalizer.ts` costura vínculos.
- **As respostas entram** via `respostas_slice` (`ADM/lib/onboarding/v2/respostas-slice.ts:45`) + `manifest_context` no prompt do subagente. → **É aqui que os FlowSpecs da Phase 07 entram (Plan 07-05).**
- **TenantBlueprint + invariantes** (`ADM/lib/prompt-optimizer/agent/blueprint/`): typechecker de config já existente (`computeInvariants`: `function_not_linked`, `placeholder_dangling`, `routing_slug_unknown`...). A skill de fronteira propõe usá-lo como gate do finalize (Passo 1) — o output do setupper deve nascer compatível.
- **Harness compartilhado**: `ADM/lib/agent-harness/core.ts` `runAgenticLoop` — hooks `beforeNextTurn` (reminders append-only), `onTurnEnd`, budget reminders 50%/80%, truncation policy, headroom. O loop do onboarding é uma versão simplificada disso; a Phase 07 porta os conceitos que faltam (reminders, budget, compaction) SEM importar o código (repos separados, deploy Vercel).

---

## 3. Base empírica dos pedidos de mudança (o que o setupper deve capturar)

### Taxonomias existentes
- **Report**: `ReportType` com 13 tipos (`ADM/types/reports.ts:41-70`): `WRONG_TRANSFER`, `MESSAGE_STYLE`, `INCORRECT_INFO`, `UNWANTED_RETURN`, `INCOMPLETE_COLLECTION`... + categoria `ALTERACAO` dedicada a pedido de mudança (`types/reports.ts:1-11`).
- **Debugger AI**: causa raiz em 10 categorias + **`camada`** (`ADM/lib/debugger/report-debugger.ts:50-54`): `PROMPT_AGENTE | KB_CONTEUDO | FOLLOWUP_CADENCIA | NOTIFIER | CONFIGURACAO_PLATAFORMA | FUNCAO_TOOL | PLATAFORMA_BUG` — os pedidos NÃO são só prompt.
- **Receitas conhecidas** (`ADM/lib/debugger/agent/prompts/report-analyst.md:489-500`): `tool_success_trigger_falso_fechamento`, `vazamento_arquitetura_interna`, `slug_incorreto_em_send_to_department`, `retorno_atendente_humano_sem_reconsulta`...

### Os 19 patterns de UX (minerados de >1.100 reports reais — skill naturalize)
Fonte: `~/.claude/skills/naturalize/references/patterns.md`. Os de maior peso:
P4 encerramento prematuro/NPS (45), P1 memória de curto prazo (43), P2 anti-duplicação (43), P3 handoff com contexto (25), P9 formatação mobile (25), P11 **tom/registro TENANT-ESPECÍFICO** (20), P16 um balão = uma intenção, P6 ordem das mensagens, P7 não vazar interno, P18 linguagem leiga, P8 1 pergunta por vez, P13/P19 confirmar antes de ação de efeito.

### Os 10 eixos de personalização recorrentes (consolidação dos reports)
1. **Tom/registro** (sóbrio vs caloroso, emoji, exclamação — por agente) → hoje SÓ a decisão `identidade` do fluxo `saudacao_menu` toca nisso.
2. **Saudação/identidade** (auto-declara "assistente virtual"? saudação por horário; nome do assistente).
3. **Roteamento/departamentos** → coberto por `roteamento_intencoes`.
4. **Horários/plantão** → coberto por `fora_horario_transferencia` + questionário.
5. **Mensagens fixas** (handoff, NPS, fora-de-horário) → parcialmente coberto.
6. **Coleta de dados** (o que pedir, o que já vem do cadastro).
7. **Tags/motivos de conversa**.
8. **Follow-up/cadência**.
9. **Jargão do domínio** (traduzir ONU→roteador etc.).
10. **Confirmação antes de ações de efeito**.

**Gap da Phase 07**: eixos 1, 2, 6, 9, 10 não têm fluxo/decisão dedicado no catálogo → Plan 07-01 (fluxo `estilo_comunicacao` + decisões novas em fluxos existentes).

### Separação portável × por-tenant (playbook wifi, `ADM/docs/troca-senha-wifi-multiprovedor.md`)
O FLUXO/prompt é portável entre tenants; o que varia é ERP/credenciais/requisitos locais. O setupper captura o POR-TENANT; o espelho fornece o PORTÁVEL.

---

## 4. Doutrina da casa que a Phase 07 respeita

1. **Kill-switch em tudo que é novo** (padrão `PROMPT_OPTIMIZER_EVAL_GATE`): flag → warning → bloqueante. Envs novas da fase: `ONBOARDING_PREVIEW`, `ONBOARDING_PREVIEW_MODEL`, `ONBOARDING_PREVIEW_MAX_MSGS`, `ONBOARDING_REMINDERS`, `ONBOARDING_SUMMARY`, e no admin `ONBOARDING_FLOWSPEC`.
2. **Gates determinísticos inline nas tools** (padrão prompt-optimizer): o modelo corrige lendo o erro da tool; nada salvo no chute (`tools.ts:1-5`).
3. **Reminders em turno de USER, append-only** (preserva prefix cache) — padrão optimizer/qa-checklist (`ADM/lib/prompt-optimizer/agent/reminders/`).
4. **Preview fiel ao runtime**: tenants de produção rodam **gpt-5-mini reasoning low** (`ADM/lib/onboarding/v2/finalizer.ts:252-276`). O test-drive usa a MESMA classe de modelo — "valida o prompt, não o modelo" (prática do eval).
5. **Contrato versionado no pacote `contracts/`** (Phase 02 desta casa): campos novos passam por lá, aditivos.
6. **Change-control no admin**: mudança no gerador de prompts afeta todo onboarding futuro — classificar antes (skill `pipeelo-admin-change-control`); replay de sessão real como evidência.
7. **Fronteira #1 (zero-touch)**: a saída do setupper deve nascer compatível com o blueprint/invariantes — cada personalização capturada aqui é um report a menos depois do go-live (a "cauda manual" encolhendo na FONTE).

---

## 5. Decisão de arquitetura (resumo — detalhes no 07-00-PLAN)

**Preview em 2 níveis:**
- **Nível 1 (determinístico, sempre vivo)**: cada fluxo do catálogo ganha um roteiro-exemplo (`PreviewScript`) renderizado client-side de templates com slots preenchidos por respostas+decisões+estilo. Zero LLM, instantâneo, atualiza a cada `save_answers`/`confirm_flow`.
- **Nível 2 (test-drive, LLM ao vivo)**: o usuário digita como cliente final; endpoint compila um draft-prompt do estado atual e responde com gpt-5-mini low. Atrás de kill-switch + budget por sessão.

**Anti-divagação = 3 camadas:**
- Capability manifest como fonte única (o que dá pra prometer);
- Gates determinísticos ampliados no `confirm_flow` (passos estruturados, destinos válidos);
- Reminder engine determinístico (promessa fora do manifest, deriva sem progresso, resposta não salva, fluxo mostrado e não confirmado).

**Contexto longo:** estado canônico já é reconstruído por turno (respostas/insights/fluxos — imune a janela); o que falta é resumo rodante dos compromissos CONVERSACIONAIS antigos (fora de tools) → summary incremental persistido.

**Saída:** `FlowSpec[]` + `StyleSpec` no payload do webhook; admin compila FlowSpec→Caso no prompt-generator, com validação determinística de presença e gate blueprint (soft).
