const ADMIN_API_URL = process.env.PIPEELO_ADMIN_API_URL || "https://admin.pipeelo.com";
const ADMIN_API_TOKEN = process.env.PIPEELO_ADMIN_API_TOKEN;

function authHeader(): string {
  if (ADMIN_API_TOKEN) return `Bearer ${ADMIN_API_TOKEN}`;
  const email = process.env.PIPEELO_ADMIN_EMAIL;
  const password = process.env.PIPEELO_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error("Missing PIPEELO_ADMIN_API_TOKEN or PIPEELO_ADMIN_EMAIL/PASSWORD");
  }
  return `Basic ${Buffer.from(`${email}:${password}`).toString("base64")}`;
}

type FetchOpts = { method?: string; body?: unknown; query?: Record<string, string> };

export async function adminApi<T = unknown>(path: string, opts: FetchOpts = {}): Promise<T> {
  const url = new URL(path.startsWith("/") ? path : `/${path}`, ADMIN_API_URL);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), {
    method: opts.method || "GET",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const err = new Error(`admin-pipeelo ${res.status}: ${text}`) as Error & { status?: number; data?: unknown };
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data as T;
}

export async function pipeeloApi<T = unknown>(
  pipeeloToken: string,
  path: string,
  opts: FetchOpts = {}
): Promise<T> {
  const url = new URL(path.startsWith("/") ? path : `/${path}`, "https://api.pipeelo.com");
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), {
    method: opts.method || "GET",
    headers: {
      Authorization: `Bearer ${pipeeloToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const err = new Error(`pipeelo ${res.status}: ${text}`) as Error & { status?: number; data?: unknown };
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data as T;
}
