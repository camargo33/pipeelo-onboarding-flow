---
phase: 03-tool-layer-audit
plan: 02
subsystem: jarvis-runtime-deterministic-tools
tags: [tool-01, tool-02, tool-06, wave-2, zod-schemas, wrap-tool-factory, idempotency, jarvis-runtime]
requires:
  - jarvis-http-client-callExternal
  - jarvis-idempotency-wrapper
  - jarvis-audit-recorders
  - jarvis-shared-types
provides:
  - jarvis-tool-registry
  - jarvis-tool-create-tenant
  - jarvis-tool-create-user
  - jarvis-tool-create-category
  - jarvis-tool-create-assistant
  - jarvis-tool-link-function
  - jarvis-tool-create-kb
  - jarvis-tool-setup-elevenlabs
  - jarvis-wrap-tool-factory
  - jarvis-zod-schemas-7-tools
affects:
  - C:/Users/dopeb/Desktop/admin-pipeelo/api/jarvis/_runtime/tools/schemas.ts
  - C:/Users/dopeb/Desktop/admin-pipeelo/api/jarvis/_runtime/tools/_shared/wrap-tool.ts
  - C:/Users/dopeb/Desktop/admin-pipeelo/api/jarvis/_runtime/tools/index.ts
tech_stack:
  added: []
  patterns:
    - "Zod schemas .strict() em TODOS os inputs — bloqueia tenant_id em args (Pitfall 2)"
    - "wrapTool factory: Zod input parse → withIdempotency → handler+output Zod parse → recordToolCall → timing"
    - "invoke() NUNCA throws — sempre { ok, data | error, idempotentHit, durationMs } uniforme"
    - "Idempotency-Key header padrão: ${sessionId}:${toolName}[:${unique_arg}] (estável por args canônicos)"
    - "ctx.tenantId é a única fonte de tenant_id — handler valida e throw HttpError 4xx se ausente"
    - "ToolDefinition.inputSchema/outputSchema tipadas como z.ZodTypeAny p/ aceitar ZodObject .strict()/.default()/.optional()"
    - "Tests com vi.stubGlobal('fetch') + vi.mock('./_shared/supabase') p/ isolamento total — sem network"
key_files:
  created:
    - C:/Users/dopeb/Desktop/admin-pipeelo/api/jarvis/_runtime/tools/schemas.ts
    - C:/Users/dopeb/Desktop/admin-pipeelo/api/jarvis/_runtime/tools/_shared/wrap-tool.ts
    - C:/Users/dopeb/Desktop/admin-pipeelo/api/jarvis/_runtime/tools/_shared/wrap-tool.test.ts
    - C:/Users/dopeb/Desktop/admin-pipeelo/api/jarvis/_runtime/tools/create_tenant.ts
    - C:/Users/dopeb/Desktop/admin-pipeelo/api/jarvis/_runtime/tools/create_tenant.test.ts
    - C:/Users/dopeb/Desktop/admin-pipeelo/api/jarvis/_runtime/tools/create_user.ts
    - C:/Users/dopeb/Desktop/admin-pipeelo/api/jarvis/_runtime/tools/create_user.test.ts
    - C:/Users/dopeb/Desktop/admin-pipeelo/api/jarvis/_runtime/tools/create_category.ts
    - C:/Users/dopeb/Desktop/admin-pipeelo/api/jarvis/_runtime/tools/create_category.test.ts
    - C:/Users/dopeb/Desktop/admin-pipeelo/api/jarvis/_runtime/tools/create_assistant.ts
    - C:/Users/dopeb/Desktop/admin-pipeelo/api/jarvis/_runtime/tools/create_assistant.test.ts
    - C:/Users/dopeb/Desktop/admin-pipeelo/api/jarvis/_runtime/tools/link_function.ts
    - C:/Users/dopeb/Desktop/admin-pipeelo/api/jarvis/_runtime/tools/link_function.test.ts
    - C:/Users/dopeb/Desktop/admin-pipeelo/api/jarvis/_runtime/tools/create_kb.ts
    - C:/Users/dopeb/Desktop/admin-pipeelo/api/jarvis/_runtime/tools/create_kb.test.ts
    - C:/Users/dopeb/Desktop/admin-pipeelo/api/jarvis/_runtime/tools/setup_elevenlabs.ts
    - C:/Users/dopeb/Desktop/admin-pipeelo/api/jarvis/_runtime/tools/setup_elevenlabs.test.ts
    - C:/Users/dopeb/Desktop/admin-pipeelo/api/jarvis/_runtime/tools/index.ts
    - C:/Users/dopeb/Desktop/admin-pipeelo/api/jarvis/_runtime/tools/index.test.ts
  modified: []
decisions:
  - "Zod .strict() em todos os 7 inputs: rejeita keys extras incluindo tenant_id/tenantId (defesa contra prompt injection — Pitfall 2). noTenantId helper redundante removido — .strict() já cobre."
  - "Idempotency-Key header padrão: ${sessionId}:${toolName}[:${unique_arg}]. unique_arg só quando faz sentido distinguir múltiplas chamadas válidas no mesmo run (e.g. create_user usa email; create_assistant usa category_id+nome)."
  - "ctx.tenantId é a única fonte de tenant_id em URL paths — handler valida e throw HttpError 4xx (não-retriable) se ausente. create_tenant é exceção (cria o próprio tenant, não precisa de tenantId)."
  - "ToolDefinition.inputSchema/outputSchema tipadas como z.ZodTypeAny: necessário pq z.ZodType<I> é invariante e rejeita ZodObject com .strict()/.default()/.optional(). Tipagem de I/O segue intacta via inferência local nas tools concretas (CreateTenantInput, etc)."
  - "invoke() NUNCA throws — captura HttpError, output validation, e qualquer Error; transforma em { ok: false, error }. Agent loop trata uniformemente sem try/catch por chamada."
  - "invalid_output marcado como retriable=false: handler retornou shape errado é bug determinístico, retentar não vai mudar resultado. Diferente de http_5xx (retriable=true)."
  - "URL templates usam o contrato do plan (`/v1/tenants/{tenantId}/...`), NÃO os endpoints heterogêneos do `lib/onboarding-processor.ts` (`/v1/prompt`, `/v1/assistant`, `/v1/function`). Tools são camada de abstração nova com contrato estável; reconciliação com endpoints reais fica para Phase 4 (smoke real) ou ajuste fino quando agent loop integrar."
  - "PIPEELO_API_BASE_URL env-driven (default `https://api.pipeelo.com/v1`): permite ponto staging em dev sem rebuild."
  - "Tests usam vi.stubGlobal('fetch') ao invés de vi.mock global p/ isolamento per-test e cleanup automático em afterEach."
metrics:
  duration_minutes: 8
  tasks_completed: 2
  files_created: 19
  files_modified: 0
  commits: 2
  tests_added: 33
  tests_passing: 33
  tools_total: 63   # 7 + 13 tests files = 13 files; 63 tests local em tools/
  coverage_lines_tools: 91.83
  coverage_statements_tools: 90.95
  coverage_functions_tools: 100
  coverage_branches_tools: 80.12
  completed_date: "2026-05-08"
---

# Phase 3 Plan 02: Jarvis Deterministic Tools Summary

7 tools determinísticas tipadas com Zod input/output `.strict()` entregues no admin-pipeelo: `create_tenant`, `create_user`, `create_category`, `create_assistant`, `link_function`, `create_kb`, `setup_elevenlabs`. Cada tool é unidade independente testável, embrulhada por `wrapTool` factory que combina Zod parse + `withIdempotency` + `recordToolCall` + timing. 63 tests verdes, coverage 91.83% lines / 100% functions em `api/jarvis/_runtime/tools/`. Pitfall 2 mitigado: `.strict()` rejeita `tenant_id` em args; `ctx.tenantId` é a única fonte de tenant_id em URL paths.

## Repository Context

**Working repo:** `C:/Users/dopeb/Desktop/admin-pipeelo` (Next.js 15)
**Planning artifacts:** `C:/Users/dopeb/Desktop/pipeelo-onboarding-flow/.planning/`
**Cross-repo by design:** plan/state vivem no onboarding-flow; código vive no admin-pipeelo (mesmo padrão das Waves 0 e 1).

## What Was Built

### Task 1 — schemas.ts + wrapTool factory

**Commit:** `5125118`

- **`schemas.ts`** — 14 Zod schemas exportados (7 input + 7 output). Todos os inputs com `.strict()`, defaults e enum constraints conforme plan.
- **`_shared/wrap-tool.ts`** — `wrapTool(spec)` factory. Pipeline: input Zod parse → withIdempotency → handler() → output Zod parse → recordToolCall → timing. Retorna `ToolDefinition<I,O>` com `invoke(ctx, rawArgs)` uniforme que NUNCA throws.
- **`_shared/wrap-tool.test.ts`** — 7 tests cobrindo: invalid_input, handler runs after parse, idempotency hit cached, recordToolCall com duration_ms, HttpError 4xx vs 5xx retriable, `.strict()` rejeita tenant_id, output não-conforme → invalid_output.

### Task 2 — 7 tools + index.ts

**Commit:** `d059830`

| Tool | Method | URL Template | Idempotency-Key |
|------|--------|--------------|-----------------|
| `create_tenant` | POST | `/v1/tenants` | `${sessionId}:create_tenant` |
| `create_user` | POST | `/v1/tenants/{tenantId}/users` | `${sessionId}:create_user:${args.email}` |
| `create_category` | POST | `/v1/tenants/{tenantId}/categories` | `${sessionId}:create_category:${args.tipo}:${args.nome}` |
| `create_assistant` | POST | `/v1/tenants/{tenantId}/assistants` | `${sessionId}:create_assistant:${args.category_id}:${args.nome}` |
| `link_function` | PATCH | `/v1/tenants/{tenantId}/assistants/{assistant_id}/functions` | `${sessionId}:link_function:${assistant_id}:${function_name}` |
| `create_kb` | POST | `/v1/tenants/{tenantId}/knowledge-bases` | `${sessionId}:create_kb:${category_id}:${sha256(titulo|conteudo)[0..16]}` |
| `setup_elevenlabs` | POST | `/v1/tenants/{tenantId}/elevenlabs/voices` | `${sessionId}:setup_elevenlabs:${assistant_id}:${voice_id}` |

- **`index.ts`** — `tools: ToolDefinition[]` (7 itens) + `toolByName: Record<string, ToolDefinition>` lookup. Re-exporta cada tool individualmente.
- **6 test files (3 tests cada)** + **`index.test.ts` (3 tests)** + **`create_tenant.test.ts` (3 tests)** = 24 tests novos no Task 2 (somando wrap-tool: 7 + create_tenant: 3 + 6×3 + index: 3 = 31 testes em `api/jarvis/_runtime/tools/`; combinado com `_shared/` Wave 1: 63 tests no path tool layer).

## Decisions Made

Ver frontmatter `decisions:`. Highlights:

- **`.strict()` em todos schemas:** defesa contra Pitfall 2 (tenant_id via prompt injection).
- **`ctx.tenantId` é a única fonte:** handler valida e throw HttpError 4xx não-retriable. `create_tenant` é exceção (auto-cria).
- **invoke() NUNCA throws:** captura tudo e converte em `{ ok, data | error }`. Agent loop trata uniformemente.
- **URL templates do plan vs `lib/onboarding-processor.ts`:** plan usa `/v1/tenants/{tenantId}/...`; processor usa endpoints heterogêneos (`/v1/prompt`, `/v1/assistant`, `/v1/function`). Tools são camada de abstração com contrato estável — reconciliação fica para Phase 4 (smoke real). Documentado abaixo em "Endpoint Reconciliation Required".
- **`ToolDefinition.inputSchema/outputSchema: z.ZodTypeAny`:** TS issue conhecida — `z.ZodType<I>` é invariante e rejeita ZodObject `.strict()/.default()/.optional()`. Tipagem `I/O` permanece intacta via inferência local nas tools concretas.

## Verification Evidence

```
$ npx vitest run api/jarvis/_runtime/tools/ --reporter=dot
 Test Files  13 passed (13)
      Tests  63 passed (63)

$ npx vitest run api/jarvis/_runtime/tools/ --coverage --coverage.include='api/jarvis/_runtime/tools/**'
File               | % Stmts | % Branch | % Funcs | % Lines
All files          |   90.95 |    80.12 |     100 |   91.83
 tools             |   84.81 |    66.07 |     100 |   84.81
  create_assistant |   77.77 |     62.5 |     100 |   77.77
  create_category  |   77.77 |     62.5 |     100 |   77.77
  create_kb        |      80 |     62.5 |     100 |      80
  create_tenant    |   85.71 |    66.66 |     100 |   85.71
  create_user      |   88.88 |       75 |     100 |   88.88
  link_function    |   77.77 |       70 |     100 |   77.77
  setup_elevenlabs |   77.77 |     62.5 |     100 |   77.77
 tools/_shared     |   94.65 |    87.61 |     100 |   96.58
  wrap-tool.ts     |     100 |    83.33 |     100 |     100

$ npx vitest run --reporter=dot   # full suite
 Test Files  39 passed (39)
      Tests  152 passed (152)

$ npx tsc --noEmit | grep "api/jarvis"
# (zero erros TS)

$ grep -rn "fetch(" api/jarvis/_runtime/tools/
api/jarvis/_runtime/tools/_shared/http.ts:37:  const res = await fetch(req.url, {
# (1 ocorrência — TOOL-05 audit gate clean)
```

**Coverage gate >80% em `api/jarvis/_runtime/tools/`:** ✅ 91.83% lines (target 80%). Statements 90.95%, Branches 80.12%, Functions 100%.

Uncovered branches em tools concretas: paths `if (!ctx.tenantId) throw` e `if (!token) throw` — env validation que só dispara em produção sem token (não testado aqui pq tests stubam env).

## Endpoint Reconciliation Required (não-bloqueante)

`lib/onboarding-processor.ts` real chama:
- `POST /v1/prompt` (cria prompt — equivalente a create_assistant prompt template ou create_kb)
- `POST /v1/assistant` (sem tenant em path — auth-token-scoped)
- `POST /v1/function` (sem tenant em path)

Tools nesta wave usam contrato `/v1/tenants/{tenantId}/...` mais explícito (RESTful, idempotente, multi-tenant safe). Phase 4 vai precisar uma destas:
1. Atualizar API Pipeelo para honrar o novo contrato (preferred — RESTful);
2. Ajustar URL templates das tools para casar com endpoints reais (legacy compat);
3. Adicionar adapter no `_shared/http.ts` que mapeia contrato novo → endpoints legacy.

**Decisão fica no Phase 4.** Para Wave 2/3 esta divergência não bloqueia: tests usam mocks completos, contrato é estável, schemas/wrapper estão prontos.

## Deviations from Plan

**Adições não-disruptivas (todas dentro do espírito do plan):**

1. **`index.test.ts` adicionado** (não solicitado explicitamente) — sobe coverage do registry de 0% para 100% e valida invariantes (`tools.length === 7`, `toolByName` resolve cada nome).
2. **`ToolDefinition.inputSchema/outputSchema: z.ZodTypeAny`** (plan dizia `z.ZodType<I>`) — necessário para TS aceitar ZodObject com `.strict()/.default()/.optional()`. Pitfall 2 segue intacto via `.strict()` no schema concreto. Documentado em decisions.
3. **`create_kb` Idempotency-Key usa SHA-256 do `titulo|conteudo`** ao invés de só `titulo` ou `category_id` — KBs múltiplas no mesmo category_id são caso real (plano premium + plano básico no mesmo "vendas"); hash discrimina sem inflar URL.
4. **Cada tool concreta valida env `PIPEELO_API_TOKEN`** antes de chamar (throw HttpError 4xx) — defesa contra deploy incompleto. Plan não mencionava, mas é Rule 2 (missing critical functionality).

**Pre-existing TS errors em `lib/storage.ts`, `lib/tags-database.ts`, `lib/thread-processor.ts`** (Wave 0/1 já existiam): out of scope per scope_boundary — logged here as awareness.

## Authentication Gates

Nenhum.

## Smoke Instructions (manual, Felipe)

Para invocar tools localmente sem agente após migration aplicada:

```typescript
// scripts/smoke-jarvis-tools.ts
import { create_tenant, create_user, toolByName } from "@/api/jarvis/_runtime/tools";
import { createRun, finalizeRun } from "@/api/jarvis/_runtime/tools/_shared/audit";

process.env.PIPEELO_API_TOKEN = "your_real_token_here";
process.env.SUPABASE_URL = "https://xxx.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_...";

const sessionId = "smoke_" + Date.now();
const runId = await createRun({ sessionId });

// 1. Cria tenant
const r1 = await create_tenant.invoke({ sessionId, runId }, {
  cnpj: "11222333000181",
  razao_social: "ISP Smoke",
  email_admin: "ceo@smoke.test",
  whatsapp: "5511999998888",
});
if (!r1.ok) throw new Error(JSON.stringify(r1.error));
const tenantId = r1.data.tenant_id;

// 2. Cria user (já com tenantId)
const r2 = await create_user.invoke({ sessionId, runId, tenantId }, {
  email: "admin@smoke.test",
  nome: "Admin Smoke",
});

// 3. Replay (idempotency demo): mesma chamada → idempotentHit=true, sem POST
const r3 = await create_user.invoke({ sessionId, runId, tenantId }, {
  email: "admin@smoke.test",
  nome: "Admin Smoke",
});
console.log("idempotent:", r3.ok && r3.idempotentHit); // true

await finalizeRun({ runId, status: "completed" });
```

Verificação: linhas em `jarvis_runs` (1) + `jarvis_tool_calls` (3, sendo 1 com `idempotent_hit=true`) + `idempotency_keys` (2 entries — uma por tool) — supondo migration Wave 0 aplicada.

## Pitfalls Endereçados

- **Pitfall 1 (Loop / context blow-up):** mesmos args = mesmo args_hash = cache hit = 0 chamadas externas. Já endereçado em Wave 1 (`withIdempotency`); wrapTool herda gratuito.
- **Pitfall 2 (Prompt injection — tenant_id):** `.strict()` em TODOS os schemas + `ctx.tenantId` é a única fonte em URL paths + handler throw 4xx se ausente. Triple defense.
- **Pitfall 3 (Cross-tenant leak):** `ctx.tenantId` ditado pelo backend (não-LLM) é a única fonte em path templates.
- **Pitfall 6 (Idempotency mistakes):** wrapTool sempre passa por `withIdempotency` + `Idempotency-Key` header propagado para a API Pipeelo (defense-in-depth: dedupe local + dedupe upstream).

## Contracts Exported (consumed by Plan 03-03 / Phase 4)

```typescript
// schemas.ts
export const CreateTenantInput, CreateTenantOutput;
export const CreateUserInput, CreateUserOutput;
export const CreateCategoryInput, CreateCategoryOutput;
export const CreateAssistantInput, CreateAssistantOutput;
export const LinkFunctionInput, LinkFunctionOutput;
export const CreateKbInput, CreateKbOutput;
export const SetupElevenlabsInput, SetupElevenlabsOutput;
export type CreateTenantInput, ... (7 input/output types inferred);

// _shared/wrap-tool.ts
export function wrapTool<I,O>(spec): ToolDefinition<I,O>;
export type ToolDefinition<I,O>, ToolHandler<I,O>, ToolInvokeResult<O>, WrapToolSpec<I,O>;

// index.ts
export const tools: ToolDefinition[];                  // 7 itens
export const toolByName: Record<string, ToolDefinition>;
export { create_tenant, create_user, create_category, create_assistant,
         link_function, create_kb, setup_elevenlabs };
```

## What's Next

- **Plan 03-03 (Wave 3):** Langfuse SDK init + spans em `api/jarvis/_runtime/observability/`. Wraptool já reserva `langfuseSpanId` em `recordToolCall` payload — Wave 3 vai popular.
- **Manual gate antes de Plan 03-03 funcional end-to-end:** Felipe aplica `20260509000000_jarvis_audit_tables.sql` em staging + smoke + drill rollback + apply prod. Sem isso, smoke instructions acima não persistem (apenas logam best-effort warnings).
- **Phase 4 reconciliação de endpoints:** decidir entre atualizar API Pipeelo, ajustar URL templates aqui, ou adicionar adapter (ver "Endpoint Reconciliation Required").

## Self-Check: PASSED

Verificações executadas:
- `api/jarvis/_runtime/tools/schemas.ts` existe: FOUND
- `api/jarvis/_runtime/tools/_shared/wrap-tool.ts` existe: FOUND
- `api/jarvis/_runtime/tools/_shared/wrap-tool.test.ts` existe: FOUND
- 7 tool .ts files existem: FOUND (create_tenant, create_user, create_category, create_assistant, link_function, create_kb, setup_elevenlabs)
- 7 .test.ts files existem: FOUND
- `api/jarvis/_runtime/tools/index.ts` existe: FOUND
- `api/jarvis/_runtime/tools/index.test.ts` existe: FOUND
- Commit `5125118` (Task 1) presente em git log: FOUND
- Commit `d059830` (Task 2) presente em git log: FOUND
- 63 tests passing em `api/jarvis/_runtime/tools/`: confirmado via vitest output
- Coverage lines 91.83% (>= 80% gate): confirmado
- TOOL-05 gate (1 fetch em _shared/http.ts only): confirmado via grep
- Zero erros TS em `api/jarvis/`: confirmado via tsc --noEmit
- Full suite (152 tests / 39 files) verde: confirmado
