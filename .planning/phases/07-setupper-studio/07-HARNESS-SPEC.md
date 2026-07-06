# 07-HARNESS-SPEC — Especificação normativa do harness do Setupper

**Status:** normativo. Os PLANs 07-01..07-06 implementam ESTA spec; em conflito entre um PLAN e esta spec, a spec vence e o PLAN deve ser corrigido.
**Escopo:** o agent loop de `ONB/api/_lib/agent/` (loop.ts, tools.ts, blueprint.ts, openrouter.ts, reminders.ts, summary.ts) rodando como Vercel Function com resposta SSE.
**Base:** o loop atual (commits `2457048`/`3b823ec`) já implementa ~60% disto. A spec define o alvo completo; o delta é implementado no 07-04 (revisado).

---

## 0. Filosofia (de onde vem cada padrão)

O harness segue a mesma família dos agentes que comprovadamente funcionam neste ecossistema, com a proveniência explícita de cada padrão:

| Padrão | Fonte (estado da arte) | Aplicação aqui |
|---|---|---|
| System prompt NORMATIVO e ESTÁVEL; estado NUNCA no system | Codex CLI / prompt-optimizer do admin | `system-prompt.ts` — só regras e metodologia; byte-idêntico entre turnos (cacheável) |
| Estado vivo reconstruído do banco a cada turno (nunca confiar na memória do modelo) | Codex (re-lê o repo) / optimizer (`<tenant_context>`) | `<session_context>` derivado de respostas+insights+fluxos+summary |
| Histórico APPEND-ONLY; injeções efêmeras nunca persistidas | Claude Code (system-reminders) / agent-harness do admin | `onboarding_agent_messages` guarda só o conteúdo REAL; contexto/reminders são anexados na MONTAGEM |
| Estado fresco na CAUDA do contexto, prefixo estável | Claude Code (reminders no fim) / prompt caching (Anthropic/OpenRouter/DeepSeek) | `<session_context>` acompanha a ÚLTIMA user message — ver §2 |
| Erro de tool ensina o modelo (validação determinística inline, sem fixup pós-hoc) | Codex (apply_patch falha com instrução) / tools.ts atual | gates de `confirm_flow`/`save_answers` retornam erro instrutivo; NUNCA salvar no chute |
| Reminders determinísticos em turno de user (motor detecta, modelo corrige) | prompt-optimizer reminder engine | `reminders.ts` (R1/R2) — §5 |
| Budget/nudge de progresso | agent-harness core (budget 50/80%, empty-turn nudge) | §4.3, §4.4 |
| Compaction sem mutar histórico | Claude Code (compaction) ≠ microcompact mutável | resumo rodante incremental persistido (§6) — o histórico NUNCA é editado |
| Event-stream tipado, UI reconstrói de eventos | OpenCode / Codex (event model) | SSE `text|tool_call|tool_result|state_changed|done|error` — §7 |

**O que deliberadamente NÃO portamos do agent-harness do admin (e por quê):**
- **Headroom/SmartCrusher** — tool results aqui são minúsculos (confirmações + listas de ids); compressão seria complexidade sem ganho.
- **Subagentes** — agente único; a tarefa é conversacional-sequencial, sem fan-out.
- **Termination tool global** — a sessão não "termina" num submit; termina por estado (todos os departamentos concluídos), e `complete_department` já é o marco por etapa.
- **Truncation policy de tool result** — cap fixo simples (§4.5) basta.

---

## 1. Ciclo de vida do turno (pipeline normativo)

Cada `POST /api/agent/chat` executa EXATAMENTE esta sequência:

```
1. AUTH        assertSessionAccess(slug, token)                       → 401/410
2. LOAD        em paralelo: session, respostas, insights(+flows),
               history (janela §6), summary                          → estado canônico
3. REMIND      computeReminders(estado, cauda do histórico)          → 0..2 strings
4. ASSEMBLE    montar messages conforme layout §2
5. STREAM-LOOP até MAX_TOOL_ROUNDS(8) ou deadline §4.4:
     a. chamada ao modelo (streaming)
     b. deltas de texto → SSE `text` (imediato)
     c. tool_calls → executar SEQUENCIALMENTE via executeAgentTool
        - persistir assistant msg (com tool_calls) → SSE `tool_call`
        - persistir tool result → SSE `tool_result`
        - resultado (inclui erro) volta ao modelo na rodada seguinte
     d. resposta sem texto E sem tool_call → nudge §4.3
6. PERSIST     assistant final (texto) — persistência SEMPRE antes do
               SSE correspondente (§7, invariante de replay)
7. FINALIZE    await pendingSideEffects; fire maybeUpdateSummary;
               SSE `done` {usage}
```

Invariantes:
- **I1**: nenhuma mensagem vai ao SSE antes de estar persistida (F5 no meio do stream → `GET history` reconstrói tudo que o usuário viu).
- **I2**: a user message persistida é o texto ORIGINAL do usuário — sem `<session_context>`, sem reminders (são recomputados a cada montagem).
- **I3**: tool result persistido é o objeto REAL retornado (inclusive `error`) — o histórico é fiel ao que o modelo viu.
- **I4**: side-effects (provision/sync/email/webhook) NUNCA bloqueiam o stream; são aguardados após o `done` lógico do modelo, dentro do prazo da function (§4.4).

## 2. Layout do contexto (disciplina de cache)

**Problema no loop atual:** `<session_context>` entra na PRIMEIRA user message (`loop.ts:127-135`). Como o contexto muda a cada turno, TODO o histórico depois dele é cache-miss em cada request — pagamos o corpus inteiro sempre.

**Layout normativo (prefixo estável, estado na cauda):**

```
messages = [
  { system:  buildAgentSystemPrompt() },            // estável byte-a-byte
  ...history,                                        // append-only, verbatim do banco
  { user:    [ <session_context> fresco ]           // estado na CAUDA (recência+cache)
             [ <system-reminder> × 0..2 ]
             [ mensagem real do usuário ] },
]
```

- O prefixo `system + history` é idêntico entre turnos exceto pelo append → provedores com prefix caching (OpenRouter/DeepSeek/OpenAI) aproveitam.
- Estado na cauda = máxima atenção do modelo ao estado ATUAL (mitiga lost-in-the-middle em conversa longa).
- Formato do bloco final da user message (ordem fixa):
  ```
  <session_context>
  ...renderSessionContext() (inclui resumo rodante §6 quando existir)...
  </session_context>

  <system-reminder>
  ...reminder 1...
  </system-reminder>

  <mensagem>
  ...texto original do usuário...
  </mensagem>
  ```
  A tag `<mensagem>` delimita o que é fala real (o modelo é instruído no system prompt de que os blocos context/reminder são da PLATAFORMA, não do cliente).
- **Consequência para I2**: persiste-se APENAS o conteúdo de `<mensagem>`. Na remontagem, turnos user históricos entram crus (nenhum snapshot velho/contraditório no histórico — só existe UM estado no contexto, o atual).

## 3. Estado canônico (o que o modelo pode saber)

Fonte de verdade por turno (nunca do histórico): `onboarding_respostas` (respostas), `onboarding_agent_insights` (insights + fluxos confirmados com payload), `onboarding_sessions` (status por depto, summary), catálogo (`flows.ts`) e questionário (`questions.json` via blueprint).
- `renderSessionContext` é a ÚNICA função que serializa estado pro modelo (proibido serializar estado em outro lugar — evita duas verdades).
- Perguntas condicionais avaliadas server-side (`conditional.ts`) — o modelo só vê perguntas VISÍVEIS.
- Dados sensíveis (`SENSITIVE_PREFIXES`) aparecem no contexto apenas como "RESPONDIDA" (nunca o valor) depois de salvos.

## 4. Disciplina do loop interno

### 4.1 Tools
- Execução SEQUENCIAL na ordem emitida (determinismo > latência; as tools são rápidas). Paralelizar é otimização futura explícita, não default.
- Toda tool retorna objeto JSON; `{ error: string }` é resposta VÁLIDA que instrui a correção (nunca lançar exceção pro loop — `executeAgentTool` já captura, `tools.ts:294-297`).
- Campo `_system_reminder` no result é canal da PLATAFORMA para o modelo (budget §4.3); a UI ignora campos com prefixo `_`.

### 4.2 Rounds
`MAX_TOOL_ROUNDS = 8` por turno. Ao atingir, responder pendentes com aviso e encerrar o turno com texto honesto (comportamento atual `loop.ts:174-188` mantido).

### 4.3 Budget e nudges
- Round `MAX-2`: anexar `_system_reminder: "Restam 2 rodadas de ferramenta neste turno. Consolide: salve o que falta e responda ao cliente."` ao próximo tool result.
- **Empty-turn nudge** (do agent-harness core): resposta sem texto E sem tool_call → reenviar com user message efêmera `"(continue — responda ao cliente ou chame uma ferramenta)"`, máx **2** nudges por turno (serverless não tem orçamento pros 10 do admin); persistir nada do nudge.

### 4.4 Deadline (wall-clock)
Vercel Function tem timeout (Hobby ~10s–60s conforme config; verificar `vercel.json`/plan — se `maxDuration` configurável, fixar 60s). O harness mantém `deadline = t0 + (maxDuration − 8s)`:
- Estourou durante rounds → parar de emitir tool calls novas, forçar mensagem de fechamento: "vou salvando por aqui — continue que eu retomo".
- Side-effects que não couberem no prazo já são resilientes (webhook é outbox-first com cron de reconciliação; provision/sync têm AbortController 25s).

### 4.5 Caps de tamanho
- Tool result serializado > 4.000 chars → truncar arrays com `"...(+N itens)"` antes de entrar no histórico (não deve ocorrer com as tools atuais; guarda de futuro).
- User message > 8.000 chars → aceitar, mas o `<session_context>` daquele turno omite a lista de perguntas já RESPONDIDAS (só pendentes) para compensar.

## 5. Reminder engine (anti-divagação)

Regras determinísticas (07-04), injetadas conforme §2, cap 2/turno, prioridade R1>R2:
- **R1 promessa_fora_manifest**: `scanUnsupportedMentions(último texto do assistant)` → cobra correção honesta + `record_insight(integracao)`.
- **R2 deriva_sem_progresso**: ≥4 user messages nas últimas 8 linhas sem NENHUM role=tool → reancora na etapa/fluxo/obrigatórias pendentes.
- Kill-switch `ONBOARDING_REMINDERS=off`.
- Extensão futura (não-v1): R-fluxo-mostrado-não-confirmado exige detectar "mostrei o fluxo" no texto — heurística frágil; só entra com evidência de necessidade (padrão da casa: regra nova precisa de caso real).

## 6. Memória de longo prazo (janela + resumo)

- Janela: `MAX_HISTORY_ROWS = 160` linhas, sem cortar pares assistant→tool (atual, mantido).
- **Resumo rodante** (07-04): >120 linhas → resumo incremental persistido (`agent_summary`, marca d'água `agent_summary_upto`), atualizado fire-and-forget no FINALIZE, injetado dentro do `<session_context>`. Conteúdo restrito a: promessas feitas, decisões ditas e não salvas, contexto de relacionamento, pendências combinadas. Kill-switch `ONBOARDING_SUMMARY=off`.
- O que é ESTRUTURAL (respostas/fluxos/insights) NUNCA depende do resumo — vive no banco e volta pelo `<session_context>` inteiro.

## 7. Contrato de eventos (SSE)

Eventos tipados, nesta ordem possível por turno:
```
text          { delta }                       — chunk de texto do assistant
tool_call     { name, args_preview }          — após persistir a assistant msg
tool_result   { name, result_public }         — após persistir o result (campos _* removidos)
state_changed { reason: 'answers'|'flow'|'department' }  — NOVO: emitido após tool_result de
              save_answers/confirm_flow/complete_department; a UI usa para refetch do
              /api/agent/state (preview) sem parsear resultados de tool
done          { usage: {prompt_tokens, completion_tokens, cost?}, rounds }
error         { message }                     — sempre último quando ocorre
```
- `state_changed` substitui o acoplamento atual da UI ao nome da tool (07-02 Task 4 deve usá-lo).
- `done.usage` agregado do turno (OpenRouter `usage.include` já ligado) — base da observabilidade §8.

## 8. Observabilidade

- Log estruturado por turno (console, padrão Vercel): `{session, turno_ms, rounds, tools: [names], usage, reminders: [ids], nudges}`.
- `usage` também persiste na assistant message final (coluna JSONB `usage` — migration no 07-04) → custo por sessão consultável via SQL.
- Transcript = o próprio `onboarding_agent_messages` (append-only, fiel — I1/I2/I3). Auditoria pós-mortem não precisa de artefato extra.

## 9. Modelo e provider

- Default: `ONBOARDING_AGENT_MODEL` = `deepseek/deepseek-v4-flash:nitro`, reasoning `high` (atual). Test-drive: `openai/gpt-5-mini` low (classe-produção — ADR-1).
- OpenRouter como camada agnóstica; function calling com JSON Schema estrito; `temperature 0.3`, `max_tokens 4096` (atual).
- Retries: 3 com backoff no client (atual). **Fallback de modelo** (novo, opcional): `ONBOARDING_AGENT_MODEL_FALLBACK` — usado apenas quando os 3 retries esgotam com 429/5xx; se ausente, propaga o erro (SSE `error` com mensagem amigável "instabilidade, tente de novo").
- Troca de modelo NÃO exige mudança de código em nenhum ponto do harness (proibido hardcode de model id fora dos defaults de env).

## 10. Concorrência e idempotência

- Duas abas na mesma sessão: sem lock global v1. Segurança estrutural: history é append-only; respostas são upsert idempotente; fluxos são replace-por-flow_id. Mitigação de UX: a UI desabilita o input durante o stream. Corrida residual (2 turnos simultâneos) produz no pior caso mensagens intercaladas no histórico — aceitável e documentado.
- `complete_department` é idempotente por natureza (update de status + side-effects já-idempotentes no admin: find-or-create por CNPJ etc.).

---

## Delta vs implementação atual (o que o 07-04 revisado executa)

| # | Item | Hoje | Spec |
|---|------|------|------|
| D1 | Posição do `<session_context>` | 1ª user message (cache-miss total) | cauda, com tag `<mensagem>` (§2) |
| D2 | Reminders R1/R2 | não existem | §5 |
| D3 | Resumo rodante | não existe | §6 |
| D4 | Budget round MAX-2 | não existe | §4.3 |
| D5 | Empty-turn nudge | não existe | §4.3 |
| D6 | Deadline wall-clock | não existe | §4.4 |
| D7 | Evento `state_changed` | não existe (UI acopla ao nome da tool) | §7 |
| D8 | Usage persistido + log estruturado | usage só no client OpenRouter | §8 |
| D9 | Fallback de modelo | não existe | §9 (opcional, env) |
| D10 | Caps de tamanho | não existem | §4.5 |
