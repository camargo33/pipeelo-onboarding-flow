import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { invokeHandler } from "../../tests/_helpers/handler";

vi.mock("../_lib/supabase", () => ({
  requireSupabase: vi.fn(),
  getServiceSupabase: vi.fn(),
}));

vi.mock("../_lib/outbox", () => ({
  deliverOutbox: vi.fn(),
  markDelivered: vi.fn(),
  markFailedAttempt: vi.fn(),
  markInFlight: vi.fn(),
}));

import { getServiceSupabase } from "../_lib/supabase";
import {
  deliverOutbox,
  markDelivered,
  markFailedAttempt,
  markInFlight,
} from "../_lib/outbox";
import handler from "./reconcile-webhooks";

function setupSupabaseDrain(rows: unknown[], dbError: unknown = null) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.lte = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.limit = vi.fn(async () => ({ data: rows, error: dbError }));

  const sb = {
    from: vi.fn(() => chain),
  };
  (getServiceSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
    sb,
  );
  return { sb, chain };
}

const baseRow = {
  id: "out_1",
  session_id: "sess_x",
  target_url: "https://admin.test/api/clients/onboarding/create",
  payload: { payload_version: "v1" },
  status: "pending",
  attempt_count: 0,
  max_attempts: 6,
  last_error: null,
  next_retry_at: "2026-05-08T11:00:00Z",
  delivered_at: null,
};

describe("GET /api/cron/reconcile-webhooks (Plan 02-02)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("401 quando CRON_SECRET ausente no header", async () => {
    vi.stubEnv("CRON_SECRET", "secret-cron");
    const r = await invokeHandler(handler as never, {
      method: "GET",
      headers: {},
    });
    expect(r.statusCode).toBe(401);
    expect((r.body as { error: string }).error).toBe("unauthorized");
  });

  it("401 quando CRON_SECRET errado", async () => {
    vi.stubEnv("CRON_SECRET", "secret-cron");
    const r = await invokeHandler(handler as never, {
      method: "GET",
      headers: { authorization: "Bearer wrong-secret" },
    });
    expect(r.statusCode).toBe(401);
  });

  it("401 quando CRON_SECRET env não setado (fail-secure)", async () => {
    // Sem env, mesmo com Bearer correto não passa
    const r = await invokeHandler(handler as never, {
      method: "GET",
      headers: { authorization: "Bearer anything" },
    });
    expect(r.statusCode).toBe(401);
  });

  it("200 + processed=0 quando outbox vazio", async () => {
    vi.stubEnv("CRON_SECRET", "secret-cron");
    setupSupabaseDrain([]);

    const r = await invokeHandler(handler as never, {
      method: "GET",
      headers: { authorization: "Bearer secret-cron" },
    });

    expect(r.statusCode).toBe(200);
    expect((r.body as { processed: number }).processed).toBe(0);
    expect(deliverOutbox).not.toHaveBeenCalled();
  });

  it("drena 1 pending → markInFlight + deliverOutbox + markDelivered", async () => {
    vi.stubEnv("CRON_SECRET", "secret-cron");
    setupSupabaseDrain([baseRow]);

    (markInFlight as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (deliverOutbox as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
    });
    (markDelivered as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const r = await invokeHandler(handler as never, {
      method: "GET",
      headers: { authorization: "Bearer secret-cron" },
    });

    expect(r.statusCode).toBe(200);
    expect((r.body as { processed: number }).processed).toBe(1);
    expect((r.body as { summary: Record<string, number> }).summary.delivered).toBe(1);
    expect(markInFlight).toHaveBeenCalledWith("out_1");
    expect(markDelivered).toHaveBeenCalledWith("out_1");
    expect(markFailedAttempt).not.toHaveBeenCalled();
  });

  it("drena 1 pending com fetch falhando → markFailedAttempt", async () => {
    vi.stubEnv("CRON_SECRET", "secret-cron");
    setupSupabaseDrain([baseRow]);

    (markInFlight as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (deliverOutbox as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
      body: "internal",
    });
    (markFailedAttempt as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const r = await invokeHandler(handler as never, {
      method: "GET",
      headers: { authorization: "Bearer secret-cron" },
    });

    expect(r.statusCode).toBe(200);
    expect((r.body as { summary: Record<string, number> }).summary.retry_scheduled).toBe(1);
    expect(markFailedAttempt).toHaveBeenCalledTimes(1);
    expect(markDelivered).not.toHaveBeenCalled();
    const callArgs = (markFailedAttempt as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[0]).toBe("out_1");
    expect(callArgs[1]).toContain("500");
  });

  it("processa múltiplas rows em paralelo", async () => {
    vi.stubEnv("CRON_SECRET", "secret-cron");
    const rows = [
      { ...baseRow, id: "out_1", session_id: "sess_1" },
      { ...baseRow, id: "out_2", session_id: "sess_2" },
      { ...baseRow, id: "out_3", session_id: "sess_3" },
    ];
    setupSupabaseDrain(rows);

    (markInFlight as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (deliverOutbox as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async (row: { id: string }) => {
        if (row.id === "out_2") return { ok: false, status: 500, body: "x" };
        return { ok: true, status: 200 };
      },
    );
    (markDelivered as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (markFailedAttempt as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const r = await invokeHandler(handler as never, {
      method: "GET",
      headers: { authorization: "Bearer secret-cron" },
    });

    expect(r.statusCode).toBe(200);
    const summary = (r.body as { summary: Record<string, number> }).summary;
    expect(summary.delivered).toBe(2);
    expect(summary.retry_scheduled).toBe(1);
  });

  it("query usa filtros: status=pending + next_retry_at <= now + ordered", async () => {
    vi.stubEnv("CRON_SECRET", "secret-cron");
    const { chain } = setupSupabaseDrain([]);

    await invokeHandler(handler as never, {
      method: "GET",
      headers: { authorization: "Bearer secret-cron" },
    });

    expect(chain.eq).toHaveBeenCalledWith("status", "pending");
    expect(chain.lte).toHaveBeenCalledWith(
      "next_retry_at",
      expect.any(String),
    );
    expect(chain.order).toHaveBeenCalledWith("next_retry_at", { ascending: true });
    expect(chain.limit).toHaveBeenCalledWith(25);
  });

  it("500 quando supabase retorna erro", async () => {
    vi.stubEnv("CRON_SECRET", "secret-cron");
    setupSupabaseDrain([], { message: "db down" });

    const r = await invokeHandler(handler as never, {
      method: "GET",
      headers: { authorization: "Bearer secret-cron" },
    });

    expect(r.statusCode).toBe(500);
    expect((r.body as { error: string }).error).toBe("db_error");
  });
});
