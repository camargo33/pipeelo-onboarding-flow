# Architecture Research

**Domain:** AI-orchestrated SaaS tenant provisioning (LLM agent + tool-calling + cron pipeline)
**Researched:** 2026-05-08
**Confidence:** MEDIUM-HIGH (validated against Anthropic managed-agents-2026-04-01 beta + production patterns from buildmvpfast, Composio, Convex, Temporal)

## Standard Architecture

### System Overview

The dominant 2026 pattern for AI-orchestrated provisioning is **"Durable Queue + Stateless Agent Worker + Tool-Calling API + Audit Sink"**. The agent is treated as a *non-deterministic decision engine* whose side effects are wrapped in deterministic, idempotent infrastructure.

```
┌──────────────────────────────────────────────────────────────────┐
│                    INGRESS (frontend / webhook)                   │
│  ┌──────────────┐    ┌──────────────────┐    ┌───────────────┐   │
│  │ Onboarding   │───▶│ /api/webhook/    │───▶│ session_queue │   │
│  │ Flow (Vite)  │    │   ingest         │    │  (Postgres)   │   │
│  └──────────────┘    └──────────────────┘    └───────┬───────┘   │
│                       (validate + idempotent insert)  │           │
├───────────────────────────────────────────────────────┼───────────┤
│                    SCHEDULER LAYER                    │           │
│  ┌────────────────────────────────────────────────────▼───────┐  │
│  │  Vercel Cron (or Inngest/QStash)                            │  │
│  │  every N min → SELECT pending sessions FOR UPDATE SKIP LOCKED│ │
│  └────────────────────────────┬─────────────────────────────────┘ │
├───────────────────────────────┼───────────────────────────────────┤
│                    AGENT WORKER LAYER                              │
│  ┌────────────────────────────▼─────────────────────────────────┐ │
│  │  Jarvis Worker (Vercel Function, maxDuration ~300s)          │ │
│  │   ┌──────────────────────────────────────────────────────┐   │ │
│  │   │ 1. claim session (status=processing, attempt++)      │   │ │
│  │   │ 2. build context (system prompt + session.respostas) │   │ │
│  │   │ 3. agent loop:                                       │   │ │
│  │   │    Anthropic Messages API + tool_use                 │   │ │
│  │   │    while stop_reason == "tool_use":                  │   │ │
│  │   │       dispatch tool → log call → return tool_result  │   │ │
│  │   │ 4. on success: status=completed                      │   │ │
│  │   │ 5. on failure: status=needs_review (preserve trace)  │   │ │
│  │   └──────────────────────────────────────────────────────┘   │ │
│  └─────────┬────────────────────────────────────────────────────┘ │
├────────────┼────────────────────────────────────────────────────── │
│            ▼  TOOL DISPATCHER (deterministic, idempotent)          │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ tool: create_tenant       → admin-pipeelo  (idempotency_key)│  │
│  │ tool: create_category     → api.pipeelo    (idempotency_key)│  │
│  │ tool: create_assistant    → api.pipeelo    (idempotency_key)│  │
│  │ tool: link_function       → api.pipeelo    (idempotency_key)│  │
│  │ tool: setup_elevenlabs    → ElevenLabs     (idempotency_key)│  │
│  │ tool: render_prompt       → local (template + DNA tom)      │  │
│  │ tool: store_secret        → Supabase       (upsert)         │  │
│  └─────────────────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────────────┤
│                    OBSERVABILITY + STATE                           │
│  ┌────────────────┐  ┌──────────────────┐  ┌─────────────────┐   │
│  │ Langfuse       │  │ jarvis_runs      │  │ jarvis_tool_    │   │
│  │ (traces+evals) │  │ (FSM per session)│  │ calls (audit)   │   │
│  └────────────────┘  └──────────────────┘  └─────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| **Ingress webhook** | Validate payload, idempotent insert into queue, return 200 fast (<3s) | `api/webhook/ingest.ts` Vercel Function + Zod schema + unique `session_id` constraint |
| **Session queue** | Durable list of pending work + state machine | Postgres table `onboarding_sessions` with `status` enum, `attempt_count`, `locked_at`, `locked_by` |
| **Scheduler** | Periodically wake worker; pick a batch | Vercel Cron (`vercel.json` `crons`) or Inngest/QStash for retries with backoff |
| **Claim mutex** | Prevent two workers processing same session | `UPDATE ... SET status='processing', locked_by=$id WHERE status='pending' AND id IN (SELECT ... FOR UPDATE SKIP LOCKED LIMIT N) RETURNING *` |
| **Agent loop** | Reasoning + tool_use orchestration | Anthropic Messages API with `tools` array; while `stop_reason==='tool_use'`, dispatch and append `tool_result` |
| **Tool dispatcher** | Map agent tool calls → real APIs; enforce idempotency, validation, side-effect logging | Switch in TS, each tool is a pure async function w/ Zod input schema |
| **Idempotency cache** | Dedupe repeated calls (agent retries inside loop) | Postgres table `idempotency_keys (key UNIQUE, response JSONB)` keyed by `session_id + tool + hash(args)` |
| **Trace sink** | Capture every prompt, response, tool call, tool result | Langfuse SDK (or self-hosted) + structured rows in `jarvis_tool_calls` |
| **Compensator** | Roll back / mark needs_review on failure | Manual via `/onboarding-sessions` UI; rare in this domain (tenant create rarely needs rollback, just retry) |

## Recommended Project Structure

```
pipeelo-onboarding-flow/
├── api/
│   ├── webhook/
│   │   └── ingest.ts              # public ingress (signed by ONBOARDING_WEBHOOK_TOKEN)
│   ├── cron/
│   │   └── jarvis-tick.ts         # Vercel cron handler — claim N pending sessions
│   ├── jarvis/
│   │   ├── run.ts                 # POST /api/jarvis/run — invoked by cron, runs one session
│   │   ├── retry.ts               # POST /api/jarvis/retry/:sessionId — manual retry
│   │   └── _runtime/
│   │       ├── agent-loop.ts      # tool_use while-loop wrapper
│   │       ├── system-prompt.ts   # builder: load Jarvis skill content + DNA tom
│   │       ├── tools/
│   │       │   ├── index.ts       # tools[] registry exported to Anthropic API
│   │       │   ├── create_tenant.ts
│   │       │   ├── create_category.ts
│   │       │   ├── create_assistant.ts
│   │       │   ├── link_function.ts
│   │       │   ├── setup_elevenlabs.ts
│   │       │   └── _shared/
│   │       │       ├── idempotency.ts  # idempotency_keys table helpers
│   │       │       ├── http.ts         # adminApi/pipeeloApi (moved from api/_lib)
│   │       │       └── audit.ts        # write to jarvis_tool_calls + Langfuse
│   │       ├── claim-session.ts   # SKIP LOCKED claim logic
│   │       └── state-machine.ts   # transitions + invariants
│   └── _lib/                      # legacy admin-pipeelo helpers (kept until migration done)
├── src/
│   ├── ...                         # frontend SPA (unchanged scope)
│   └── pages/
│       └── admin/
│           └── JarvisDashboard.tsx # observability UI: list runs, replay, drill-down
├── supabase/migrations/
│   └── 20260510_jarvis_pipeline.sql
└── .planning/...
```

### Structure Rationale

- **`api/jarvis/_runtime/`:** isolates the agent runtime from existing Vercel Functions so the deterministic processor (legacy fallback) can coexist during migration.
- **`tools/` per-file:** every tool is a single unit of testable code with its own Zod input schema and idempotency key derivation. Maps 1:1 to a row in the agent's `tools[]` array.
- **`cron/` separated from `jarvis/`:** the scheduler is dumb (just claims + invokes); the worker is smart. Allows swapping Vercel Cron for Inngest later without touching agent logic.
- **State machine in dedicated file:** transitions are the heart of reliability. Centralizing them means tests cover the whole FSM.

## Architectural Patterns

### Pattern 1: Tool-Use Agent Loop (vs. Prompt-Only Agent)

**What:** Use Anthropic Messages API `tools` parameter. Agent emits `tool_use` blocks; worker dispatches, returns `tool_result`. Loop until `stop_reason === "end_turn"`.

**When to use:** Whenever the agent must produce *side effects* in real systems. This is the case here — every action is an API call.

**Trade-offs:**
- Pro: Schema-validated inputs (you define JSON Schema for each tool); model can't hallucinate API shapes.
- Pro: Each step is auditable as a discrete tool call.
- Pro: Tool failures are surfaced back to agent → can self-correct (e.g., CNPJ formatted wrong → retry with cleaned value).
- Con: Forces request/response framing; long pipelines = many round-trips = more tokens.
- Con: Need explicit `max_tool_iterations` guard to prevent runaway loops.

**Example:**
```typescript
// api/jarvis/_runtime/agent-loop.ts
const tools = [
  { name: "create_tenant", description: "...", input_schema: {...zodToJsonSchema(CreateTenantInput)} },
  { name: "create_category", ... },
  // ...
];

let messages = [{ role: "user", content: buildContextPrompt(session) }];
for (let i = 0; i < MAX_ITER; i++) {
  const resp = await anthropic.messages.create({
    model: "claude-opus-4-7",
    system: SYSTEM_PROMPT,
    tools,
    messages,
    max_tokens: 4096,
  });
  await audit.recordTurn(session.id, resp);
  if (resp.stop_reason === "end_turn") return resp;
  const toolUses = resp.content.filter(c => c.type === "tool_use");
  const toolResults = await Promise.all(
    toolUses.map(tu => dispatch(tu, { sessionId: session.id }))
  );
  messages.push({ role: "assistant", content: resp.content });
  messages.push({ role: "user", content: toolResults });
}
throw new MaxIterationsError(session.id);
```

### Pattern 2: Idempotency Key Per (session, tool, args-hash)

**What:** Before executing a tool side effect, derive a deterministic key. Insert into `idempotency_keys`; on conflict, return cached response without calling external API.

**When to use:** Every external mutation. Period. Agent loops *will* call duplicate tools when retrying or when prompt nudges it.

**Trade-offs:**
- Pro: Crash-only design — restart agent from zero, replay tool calls, only new ones hit APIs.
- Pro: Eliminates duplicate tenants, duplicate categories, duplicate assistants on retry.
- Con: Extra DB write per tool call. Negligible at this scale.
- Con: Key derivation must be careful: if args have nondeterministic ordering (e.g., array of opções), normalize first.

**Example:**
```typescript
// api/jarvis/_runtime/tools/_shared/idempotency.ts
export async function withIdempotency<T>(
  sessionId: string,
  tool: string,
  args: object,
  fn: () => Promise<T>
): Promise<T> {
  const key = `${sessionId}:${tool}:${sha256(canonicalJson(args))}`;
  const cached = await db.from("idempotency_keys").select().eq("key", key).maybeSingle();
  if (cached.data) return cached.data.response as T;
  const result = await fn();
  await db.from("idempotency_keys").insert({ key, response: result });
  return result;
}
```

### Pattern 3: Claim-Lock-Release with `SKIP LOCKED`

**What:** Worker claims a session by atomically setting `status='processing'`, `locked_at=now()`, `locked_by=worker_id`. Postgres `FOR UPDATE SKIP LOCKED` ensures two workers never grab the same row.

**When to use:** Always, when scheduler may run multiple workers (Vercel cron retries, manual + cron overlap, scaled instances).

**Trade-offs:**
- Pro: No external lock service required (Redis, etc).
- Pro: Built-in stuck-lock recovery: `WHERE locked_at < now() - interval '10 min'` recovers crashed workers.
- Con: Postgres-specific syntax (fine — we're on Supabase).

**Example:**
```sql
WITH claimed AS (
  SELECT id FROM onboarding_sessions
  WHERE status = 'pending'
     OR (status = 'processing' AND locked_at < now() - interval '10 minutes')
  ORDER BY created_at
  LIMIT 5
  FOR UPDATE SKIP LOCKED
)
UPDATE onboarding_sessions s
SET status = 'processing', locked_at = now(), locked_by = $1, attempt_count = attempt_count + 1
FROM claimed WHERE s.id = claimed.id
RETURNING s.*;
```

### Pattern 4: Structured System Prompt + Frozen Tools Schema

**What:** System prompt is a *contract* — it tells the agent its identity (Jarvis), its goal (provision tenant from session.respostas), its constraints (DNA tom 8 regras, no Solintel, pt-BR), its tools, and the order of typical operations. Tools are the *only* way to act on the world.

**When to use:** Any time you'd otherwise be tempted to ask the model to "return JSON". Tools are stricter, validated, and traced.

**Trade-offs:**
- Pro: Tool schemas are the source of truth; agent can't invent fields.
- Pro: Adding a capability = adding a tool, not editing the prompt.
- Con: Prompt + tool definitions are ~5-10k tokens of overhead per turn. Worth it.

### Pattern 5: Trace-First Observability (Langfuse)

**What:** Every model call, every tool call, every tool result is recorded as a span in a single trace per session. Replay = read the trace.

**When to use:** From day 1. Agents without traces are unmaintainable.

**Trade-offs:**
- Pro: Audit trail for free. Compliance-ready.
- Pro: Prompt iteration with real production samples (Langfuse evals).
- Con: PII in prompts → use Langfuse self-hosted on Supabase or its EU region. Helicone is in maintenance since 03/2026 — do not pick it for greenfield.

## Data Flow

### Request Flow

```
[Cliente termina questionário]
         ↓
[Onboarding SPA]
         ↓ POST /api/webhook/ingest (HMAC signed)
[ingest.ts]
         ↓ Zod validate → upsert(onboarding_sessions, status='pending')
[Postgres]
         ↓                                          (every 5 min)
         ↓                              ┌───────────────────────┐
         ↓                              │ Vercel Cron           │
         ↓                              │ /api/cron/jarvis-tick │
         ↓                              └───────────┬───────────┘
         ↓                                          ↓
         ↓                                  claim 1-N sessions
         ↓                                          ↓
         ↓                              for each: invoke /api/jarvis/run
         ↓                                          ↓
         ↓                              ┌───────────────────────┐
         ↓                              │ Agent Loop            │
         ↓                              │  ↻ Anthropic API ↔    │
         ↓                              │     Tool Dispatcher   │
         ↓                              │  ↻ admin-pipeelo,     │
         ↓                              │     api.pipeelo,      │
         ↓                              │     ElevenLabs        │
         ↓                              └───────────┬───────────┘
         ↓                                          ↓
         ↓                              status=completed | needs_review | failed
         ↓                                          ↓
         ↓                              Resend email (cliente + Felipe)
```

### State Machine

Single canonical state machine for `onboarding_sessions.status`:

```
                  ┌─────────────────────────────────────────┐
                  │                                         │
   [INGEST]       ▼                                         │
   ────────▶  pending  ─────claim─────▶  processing         │
                  ▲                          │              │
                  │                          ├─success─▶ completed
                  │                          │
                  │                          ├─partial─▶ needs_review ──manual fix──┐
                  │                          │                                       │
                  │                          └─error──▶ failed (terminal)           │
                  │                                                                  │
                  └────────retry by admin (resets attempt_count)─────────────────────┘

Stuck-lock recovery:
   processing + locked_at < now() - 10min  →  reclaimed as pending in next tick
```

Invariants:
- `status='processing'` implies `locked_by IS NOT NULL` and `locked_at > now()-1h`
- `status='completed'` implies `tenant_id IS NOT NULL` and at least 1 assistant created (verified via tool_calls audit)
- `attempt_count <= MAX_ATTEMPTS` (e.g. 3) before forced `needs_review`
- Transitions are unidirectional except `needs_review → pending` (manual retry)

### Key Data Flows

1. **Ingest → Queue:** Onboarding SPA posts payload → ingress validates + idempotent inserts. Returns 200 immediately. The cron is the *only* trigger for processing — keeps concerns separated.

2. **Cron → Claim → Run:** Cron tick claims `N` sessions atomically (`SKIP LOCKED`), invokes `/api/jarvis/run?id=...` once per claimed session. Cron is fire-and-forget; if a run fails, the next tick recovers it via stuck-lock logic.

3. **Agent → Tool Dispatcher → External API:** Each tool_use block is dispatched through idempotency wrapper → real API → response shaped into `tool_result` content block returned to agent.

4. **Tool Call → Audit:** Every dispatch writes a row to `jarvis_tool_calls (run_id, session_id, tool_name, args, result, latency_ms, idempotent_hit, created_at)` *and* a Langfuse span. Two sinks for redundancy.

5. **Run → Email:** Successful completion fires `Resend` email (welcome + credentials). Failure fires alert email to Felipe with run trace URL.

## AI vs. Deterministic — When Each Wins

This is the central design question for this milestone. The honest answer: **hybrid wins, pure-AI loses**.

| Concern | Deterministic Code Wins | AI Agent Wins |
|---------|------------------------|---------------|
| **Tenant creation API call** | ✅ One endpoint, one schema, idempotent. AI adds nothing. | — |
| **Category creation from `departamentos_lista`** | ✅ Direct mapping. List → for-each → create. | — |
| **Office hours expansion** | ✅ Pure data transform (`expandHorarioSemanal`). | — |
| **Prompt generation per assistant** | ❌ Static templates can't capture nuance per ISP (size, vibe, plans). | ✅ LLM tailors prompt to *this* ISP's responses, applies DNA tom, picks examples. |
| **Choosing which functions (tools) to link per assistant** | ❌ Rules get tangled fast (vendas needs `gera_lead` *unless* tenant has no funnel; closer needs `consultar_cliente_erp` *only* if ERP integrated). | ✅ Reasoning over respostas decides. |
| **KB content composition** | ❌ Static templates produce flat dumps. | ✅ Synthesizes coherent KB sections from scattered answers. |
| **ElevenLabs voice setup** | ✅ If user opted in: deterministic API call. | — |
| **Error recovery / partial failure handling** | ✅ Saga compensators, retry policies. | ❌ Asking agent to "fix it" rarely works. |
| **Authoritative side effects (create tenant, link function)** | ✅ Deterministic dispatcher with idempotency. | ❌ Never let the agent fire HTTP directly. |

**Conclusion: agent does the *thinking* (what to create, what to write into prompts/KBs); deterministic tools do the *acting* (HTTP calls).** This matches the "Five Boring Patterns" production wisdom: durable state in Postgres, idempotency keys on every external call, agent reasoning is replaceable.

**Anti-pattern to avoid:** giving the agent raw `fetch` access. You lose schema validation, idempotency, audit, and replay.

## Suggested Build Order (Dependency Graph)

Phases can map directly to roadmap phases. Each builds on the previous; no big-bang launch.

```
Phase A: State Machine + Queue (no AI yet)
  ├─ Migration: add status enum, locked_by, locked_at, attempt_count, last_error
  ├─ /api/webhook/ingest (idempotent insert)
  ├─ claim-session.ts (SKIP LOCKED)
  └─ /api/cron/jarvis-tick (just claims + logs, doesn't run agent)
        │
        ▼
Phase B: Tool Layer (deterministic, no agent yet)
  ├─ Migrate adminApi/pipeeloApi from api/_lib → api/jarvis/_runtime/tools/_shared/http.ts
  ├─ Implement each tool as a typed function (create_tenant, create_category, ...)
  ├─ idempotency.ts wrapper + idempotency_keys table
  └─ Manual test: call tools directly with sample session.respostas → verify tenant created
        │
        ▼
Phase C: Audit + Observability
  ├─ jarvis_runs + jarvis_tool_calls tables
  ├─ Langfuse account + SDK wired (cheap insurance — even if you skip later, set up day 1)
  └─ JarvisDashboard.tsx (read-only list view of runs)
        │
        ▼
Phase D: Agent Loop (the AI)
  ├─ system-prompt.ts builder (port Jarvis skill content + 8-rule DNA)
  ├─ Tools registry (zodToJsonSchema for each tool)
  ├─ agent-loop.ts (Messages API + while loop + max iterations guard)
  ├─ /api/jarvis/run.ts (claim → loop → finalize)
  └─ Wire cron tick → invoke run
        │
        ▼
Phase E: Hardening
  ├─ Stuck-lock recovery in cron tick
  ├─ Retry policy (attempt_count → backoff → needs_review at max)
  ├─ Schema validation gate at ingest (reject incomplete identification)
  ├─ Manual retry UI in JarvisDashboard
  └─ Resend notifications (success + failure to Felipe)
        │
        ▼
Phase F: Evals + Cutover
  ├─ Replay 5 historic sessions through Jarvis (compare to deterministic output)
  ├─ Langfuse evaluations on prompt quality (DNA tom checklist as scorer)
  ├─ Feature flag: `JARVIS_ENABLED=true` per session
  └─ Switch default; keep deterministic processor as fallback
```

**Critical dependency:** Phase B (tools) MUST exist before Phase D (agent). Building the agent first leads to the anti-pattern of letting it touch HTTP directly. Tool-first design forces clean boundaries.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-50 sessions/day | Vercel Cron (every 5min) + Postgres queue. Single worker invocation per claimed session. Current architecture suffices. |
| 50-500 sessions/day | Increase cron frequency to 1min, batch claim N=5 per tick, parallelize tool dispatch within a session. Consider Inngest for retry-with-backoff. |
| 500+ sessions/day | Move to Inngest/Trigger.dev/Temporal — durable execution, native retries, fan-out. Rare for this domain. |

### Scaling Priorities

1. **First bottleneck:** Anthropic API rate limits (RPM/TPM) before Postgres or Vercel. Mitigation: token-bucket per project key, batch claim size respects rate.
2. **Second bottleneck:** Vercel Function `maxDuration` (300s on Pro). Long agent loops cross this. Mitigation: split into smaller agents (one per assistant) or move to Inngest Steps.
3. **Third bottleneck:** Pipeelo API rate limits. Mitigation: dispatcher-level concurrency cap per tool.

## Anti-Patterns

### Anti-Pattern 1: Agent Calls `fetch` Directly

**What people do:** Embed HTTP calls in the agent's system prompt as instructions; let the LLM construct URLs/bodies.
**Why it's wrong:** No schema validation, no idempotency, no audit, hallucinated endpoints, no replay.
**Do this instead:** Tools are the agent's *only* exit. Every external call is a typed tool with Zod input schema.

### Anti-Pattern 2: Status Field as Sole State

**What people do:** Single `status` column. No `attempt_count`, `locked_at`, `last_error`, `last_run_id`.
**Why it's wrong:** Stuck workers, infinite retries, no observability.
**Do this instead:** Treat session row as a small FSM record: `status, attempt_count, locked_at, locked_by, last_error, last_run_id`.

### Anti-Pattern 3: Idempotency by "Check if Exists First"

**What people do:** `if (await fetchTenantByCnpj(x)) return; await createTenant(x);`
**Why it's wrong:** Race condition between check and create on retry. Two tenants created.
**Do this instead:** Postgres-backed `idempotency_keys` table inserted *before* the external call. Use `INSERT ... ON CONFLICT` semantics.

### Anti-Pattern 4: Letting the Agent Decide Whether to Retry

**What people do:** "If you fail, try again."
**Why it's wrong:** Agents cannot reliably reason about transient vs. permanent failures. They burn tokens and may corrupt state.
**Do this instead:** Tool dispatcher returns structured error; agent gets *one* chance to self-correct (e.g., reformat input). Hard failures bubble up to retry policy in deterministic code.

### Anti-Pattern 5: Mixing Cron and Worker in One Function

**What people do:** Cron handler runs the full agent loop inline.
**Why it's wrong:** Long agent runs block the cron tick; one slow session starves the queue.
**Do this instead:** Cron claims + invokes `/api/jarvis/run?id=...` async (fire-and-forget). Cron returns in <1s.

### Anti-Pattern 6: No Replay Capability

**What people do:** Persist only the final result, not intermediate model turns.
**Why it's wrong:** Bug found in production → cannot debug without rerunning (which costs money + may produce different output).
**Do this instead:** Persist every model turn and tool call. Langfuse trace ID on every run.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Anthropic Messages API | Tool-use loop, model `claude-opus-4-7` (or `claude-sonnet-4-5` for cost), cache control on system prompt | System prompt is large (Jarvis content) — use `cache_control: ephemeral` to cut costs ~80% on repeated turns |
| admin-pipeelo | Bearer token wrapper (`adminApi`) | Add `Idempotency-Key` header if endpoint supports; otherwise key in our DB |
| api.pipeelo (tenant) | Bearer per-tenant token (`pipeeloApi`) | Tenant token obtained on tenant creation, stored in `onboarding_sessions.pipeelo_token` |
| ElevenLabs | Optional path (only if `usar_voz==='sim'`) | Idempotent voice creation; treat as separate tool |
| Resend | Outbound only (notifications) | Already integrated |
| Langfuse | SDK wraps Anthropic client + tool dispatcher | Self-host or EU region for PII compliance |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| ingest webhook ↔ queue | Postgres insert | Idempotent on `session_id` |
| cron ↔ worker | HTTP fire-and-forget (`fetch` to own `/api/jarvis/run`) | Cron returns fast; worker has its own 300s budget |
| worker ↔ agent loop | In-process function call | No network hop |
| agent loop ↔ tools | In-process dispatcher with idempotency wrapper | Pure functions, easy to unit test |
| tools ↔ external APIs | HTTPS with Bearer tokens | Rate-limited at dispatcher level |
| any ↔ audit | DB insert + Langfuse SDK | Best-effort: never fail a run because audit failed |

## Sources

- [Idempotent AI Agents: Retry-Safe Patterns for Production](https://www.buildmvpfast.com/blog/idempotent-ai-agent-retry-safe-patterns-production-workflow-2026) — crash-only agents, idempotency keys per external call (HIGH confidence, primary source)
- [Five Boring AI Agent Patterns That Survive the First Month in Production](https://www.roborhythms.com/ai-agent-production-infrastructure-patterns/) — durable state in Postgres, idempotency, validation before irreversible action (HIGH)
- [Saga orchestration patterns - AWS Prescriptive Guidance](https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-patterns/saga-orchestration-patterns.html) — saga + compensators in agentic systems (HIGH, official AWS guidance)
- [LLM Workflows: Patterns, Tools & Production Architecture (2026) | Morph](https://www.morphllm.com/llm-workflows) — orchestration layer responsibilities (MEDIUM)
- [Outgrowing Zapier, Make, and n8n for AI Agents | Composio](https://composio.dev/content/outgrowing-make-zapier-n8n-ai-agents) — production migration patterns (MEDIUM)
- [Orchestrating Multi-Step Agents: Temporal/Dagster/LangGraph | Kinde](https://www.kinde.com/learn/ai-for-software-engineering/ai-devops/orchestrating-multi-step-agents-temporal-dagster-langgraph-patterns-for-long-running-work/) — durable execution combos (MEDIUM)
- [Agent observability: Langfuse, Arize, Helicone, LangSmith](https://agentmodeai.com/agent-observability-langfuse-arize-helicone-langsmith/) — observability landscape (HIGH)
- [LLM Observability on GPU Cloud: Langfuse self-host (2026) | Spheron](https://www.spheron.network/blog/llm-observability-gpu-cloud-langfuse-arize-phoenix-helicone/) — Helicone in maintenance mode since 03/2026 — flagged (HIGH)
- [Claude Managed Agents (2026) | BuildFastWithAI](https://www.buildfastwithai.com/blogs/claude-managed-agents-dreaming-explained) — `managed-agents-2026-04-01` beta header (MEDIUM, marketing-adjacent but matches Anthropic public beta)
- [Claude AI Agents Architecture & Deployment Guide 2026 | Dextra Labs](https://dextralabs.com/blog/claude-ai-agents-architecture-deployment-guide/) — coordinator-subagent pattern (MEDIUM)
- Postgres `FOR UPDATE SKIP LOCKED` — official PostgreSQL docs (HIGH, well-known queue pattern)

---
*Architecture research for: AI-orchestrated SaaS tenant provisioning (Jarvis cron pipeline)*
*Researched: 2026-05-08*
