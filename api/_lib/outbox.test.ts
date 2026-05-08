import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./supabase", () => ({
  requireSupabase: vi.fn(),
  getServiceSupabase: vi.fn(),
}));

import { getServiceSupabase } from "./supabase";
import {
  enqueueOutbox,
  markInFlight,
  markDelivered,
  markFailedAttempt,
  deliverOutbox,
  type OutboxRow,
} from "./outbox";

const VALID_PAYLOAD = {
  payload_version: "v1" as const,
  session: {
    id: "sess_x",
    empresa_nome: "ISP Teste",
    ceo_email: "ceo@isp.com",
    cnpj: "11222333000181",
    created_at: "2026-05-08T12:00:00Z",
  },
  respostas: {},
};

function setupSupabase(opts: {
  selectData?: Partial<OutboxRow>;
  upsertError?: { message: string } | null;
  selectError?: { message: string } | null;
}) {
  const updateChain = {
    update: vi.fn(() => updateChain),
    eq: vi.fn(() => updateChain),
    then: undefined,
  };
  // Make `.eq().eq()` resolvable as a promise
  let eqCalls = 0;
  updateChain.eq = vi.fn(() => {
    eqCalls++;
    return updateChain;
  });

  const selectChain = {
    select: vi.fn(() => selectChain),
    eq: vi.fn(() => selectChain),
    single: vi.fn(async () => ({
      data: opts.selectData ?? null,
      error: opts.selectError ?? null,
    })),
  };

  const upsertChain = {
    upsert: vi.fn(async () => ({ error: opts.upsertError ?? null })),
  };

  const sb = {
    from: vi.fn((_table: string) => {
      // Each `.from(...)` call returns a chain that supports upsert/select/update
      return {
        upsert: upsertChain.upsert,
        select: selectChain.select,
        update: updateChain.update,
        eq: updateChain.eq,
        single: selectChain.single,
      };
    }),
  };
  (getServiceSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
    sb,
  );
  return { sb, upsertChain, selectChain, updateChain };
}

/**
 * Mais robusto: captura cada `.from(...)` call para inspecionar o que foi chamado.
 */
function setupSupabaseChainable() {
  const upserts: unknown[] = [];
  const updates: Array<{ patch: Record<string, unknown>; eqs: unknown[][] }> = [];
  const selects: unknown[] = [];

  let nextSelectResult: { data: unknown; error: unknown } = {
    data: null,
    error: null,
  };

  const sb = {
    from: vi.fn((_table: string) => {
      const chain: Record<string, unknown> = {};
      const upsertResult = { error: null as unknown };
      chain.upsert = vi.fn(async (data: unknown, opts?: unknown) => {
        upserts.push({ data, opts });
        return upsertResult;
      });
      chain.select = vi.fn(() => {
        selects.push("select");
        return chain;
      });
      const eqs: unknown[][] = [];
      chain.eq = vi.fn((col: string, val: unknown) => {
        eqs.push([col, val]);
        return chain;
      });
      chain.single = vi.fn(async () => nextSelectResult);
      let pendingPatch: Record<string, unknown> | null = null;
      chain.update = vi.fn((patch: Record<string, unknown>) => {
        pendingPatch = patch;
        // After update, .eq() chain awaits — make it thenable
        const updateEqChain: Record<string, unknown> = {};
        const patchEqs: unknown[][] = [];
        const finishUpdate = () => {
          updates.push({ patch: pendingPatch!, eqs: patchEqs });
          return Promise.resolve({ data: null, error: null });
        };
        updateEqChain.eq = vi.fn((col: string, val: unknown) => {
          patchEqs.push([col, val]);
          return updateEqChain;
        });
        // thenable: lets `await sb.from(...).update(...).eq(...)` resolve
        (updateEqChain as { then: unknown }).then = (
          resolve: (v: unknown) => void,
        ) => resolve(finishUpdate());
        return updateEqChain;
      });
      return chain;
    }),
  };

  (getServiceSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
    sb,
  );

  return {
    sb,
    upserts,
    updates,
    setSelectResult: (r: { data: unknown; error: unknown }) => {
      nextSelectResult = r;
    },
  };
}

describe("outbox helpers (Plan 02-02)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("enqueueOutbox: upsert pending + select retorna row", async () => {
    const fixture: OutboxRow = {
      id: "out_1",
      session_id: "sess_x",
      target_url: "https://admin.test/api/clients/onboarding/create",
      payload: VALID_PAYLOAD,
      status: "pending",
      attempt_count: 0,
      max_attempts: 6,
      last_error: null,
      next_retry_at: "2026-05-08T12:00:00Z",
      delivered_at: null,
    };
    const ctx = setupSupabaseChainable();
    ctx.setSelectResult({ data: fixture, error: null });

    const row = await enqueueOutbox({
      sessionId: "sess_x",
      targetUrl: fixture.target_url,
      payload: VALID_PAYLOAD,
    });

    expect(row.id).toBe("out_1");
    expect(row.status).toBe("pending");
    expect(ctx.upserts).toHaveLength(1);
    const upsertCall = ctx.upserts[0] as { data: Record<string, unknown>; opts: { onConflict: string; ignoreDuplicates: boolean } };
    expect(upsertCall.data.session_id).toBe("sess_x");
    expect(upsertCall.data.status).toBe("pending");
    expect(upsertCall.opts.onConflict).toBe("session_id");
    expect(upsertCall.opts.ignoreDuplicates).toBe(true);
  });

  it("enqueueOutbox: idempotent — row já delivered NÃO regride pra pending (ignoreDuplicates respeita existente)", async () => {
    const existing: OutboxRow = {
      id: "out_1",
      session_id: "sess_x",
      target_url: "https://admin.test/api/clients/onboarding/create",
      payload: VALID_PAYLOAD,
      status: "delivered",
      attempt_count: 1,
      max_attempts: 6,
      last_error: null,
      next_retry_at: "2026-05-08T12:00:00Z",
      delivered_at: "2026-05-08T12:01:00Z",
    };
    const ctx = setupSupabaseChainable();
    ctx.setSelectResult({ data: existing, error: null });

    const row = await enqueueOutbox({
      sessionId: "sess_x",
      targetUrl: existing.target_url,
      payload: VALID_PAYLOAD,
    });

    expect(row.status).toBe("delivered");
    expect(row.delivered_at).toBe("2026-05-08T12:01:00Z");
  });

  it("enqueueOutbox: erro no upsert → throw", async () => {
    const sb = {
      from: vi.fn(() => ({
        upsert: vi.fn(async () => ({ error: { message: "constraint X" } })),
      })),
    };
    (getServiceSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      sb,
    );

    await expect(
      enqueueOutbox({
        sessionId: "sess_x",
        targetUrl: "https://x",
        payload: VALID_PAYLOAD,
      }),
    ).rejects.toThrow(/enqueueOutbox upsert failed/);
  });

  it("markDelivered: status='delivered' + delivered_at populated", async () => {
    const ctx = setupSupabaseChainable();
    await markDelivered("out_1");
    expect(ctx.updates).toHaveLength(1);
    expect(ctx.updates[0].patch.status).toBe("delivered");
    expect(typeof ctx.updates[0].patch.delivered_at).toBe("string");
    expect(ctx.updates[0].eqs).toEqual([["id", "out_1"]]);
  });

  it("markInFlight: update guarded por status='pending'", async () => {
    const ctx = setupSupabaseChainable();
    await markInFlight("out_1");
    expect(ctx.updates).toHaveLength(1);
    expect(ctx.updates[0].patch.status).toBe("in_flight");
    expect(ctx.updates[0].eqs).toEqual([
      ["id", "out_1"],
      ["status", "pending"],
    ]);
  });

  it("markFailedAttempt: attempt < max → status='pending' + next_retry_at futuro", async () => {
    const ctx = setupSupabaseChainable();
    const before = Date.now();
    await markFailedAttempt("out_1", "fetch failed", 0, 6);
    expect(ctx.updates).toHaveLength(1);
    const patch = ctx.updates[0].patch;
    expect(patch.status).toBe("pending");
    expect(patch.attempt_count).toBe(1);
    expect(patch.last_error).toBe("fetch failed");
    const nextAt = new Date(patch.next_retry_at as string).getTime();
    expect(nextAt).toBeGreaterThan(before);
    // Esperado: ~ 30s * 2^1 = 60s + jitter; mas pelo menos > 30s
    expect(nextAt - before).toBeGreaterThan(30_000);
  });

  it("markFailedAttempt: attempt+1 >= max → status='failed' terminal", async () => {
    const ctx = setupSupabaseChainable();
    await markFailedAttempt("out_1", "final error", 5, 6);
    expect(ctx.updates).toHaveLength(1);
    const patch = ctx.updates[0].patch;
    expect(patch.status).toBe("failed");
    expect(patch.attempt_count).toBe(6);
    expect(patch.last_error).toBe("final error");
    expect(patch.next_retry_at).toBeUndefined();
  });

  it("markFailedAttempt: trunca last_error a 500 chars", async () => {
    const ctx = setupSupabaseChainable();
    const longErr = "x".repeat(2000);
    await markFailedAttempt("out_1", longErr, 0, 6);
    const patch = ctx.updates[0].patch;
    expect((patch.last_error as string).length).toBe(500);
  });

  it("deliverOutbox: 2xx → ok=true + status", async () => {
    const fetchMock = vi.fn(
      async () => new Response('{"ok":true}', { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await deliverOutbox({
      id: "out_1",
      session_id: "sess_x",
      target_url: "https://admin.test/api/clients/onboarding/create",
      payload: VALID_PAYLOAD,
      status: "pending",
      attempt_count: 0,
      max_attempts: 6,
      last_error: null,
      next_retry_at: "2026-05-08T12:00:00Z",
      delivered_at: null,
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://admin.test/api/clients/onboarding/create");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBe("sess_x");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("deliverOutbox: 500 → ok=false + status=500 + body truncado", async () => {
    const fetchMock = vi.fn(
      async () => new Response("internal error msg", { status: 500 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await deliverOutbox({
      id: "out_1",
      session_id: "sess_x",
      target_url: "https://admin.test",
      payload: VALID_PAYLOAD,
      status: "pending",
      attempt_count: 0,
      max_attempts: 6,
      last_error: null,
      next_retry_at: "2026-05-08T12:00:00Z",
      delivered_at: null,
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(500);
    expect(result.body).toContain("internal error");
  });

  it("deliverOutbox: network error → ok=false + body com message", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await deliverOutbox({
      id: "out_1",
      session_id: "sess_x",
      target_url: "https://admin.test",
      payload: VALID_PAYLOAD,
      status: "pending",
      attempt_count: 0,
      max_attempts: 6,
      last_error: null,
      next_retry_at: "2026-05-08T12:00:00Z",
      delivered_at: null,
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBeUndefined();
    expect(result.body).toContain("ECONNREFUSED");
  });

  it("deliverOutbox: envia Idempotency-Key + Authorization Bearer", async () => {
    vi.stubEnv("ONBOARDING_WEBHOOK_TOKEN", "secret-token");
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await deliverOutbox({
      id: "out_1",
      session_id: "sess_unique",
      target_url: "https://admin.test",
      payload: VALID_PAYLOAD,
      status: "pending",
      attempt_count: 0,
      max_attempts: 6,
      last_error: null,
      next_retry_at: "2026-05-08T12:00:00Z",
      delivered_at: null,
    });

    const [, init] = fetchMock.mock.calls[0];
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBe("sess_unique");
    expect(headers["Authorization"]).toBe("Bearer secret-token");

    vi.unstubAllEnvs();
  });
});
