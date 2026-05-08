import type { VercelRequest, VercelResponse } from '@vercel/node';
import { vi } from 'vitest';

export type HandlerInput = {
  method?: string;
  query?: Record<string, string>;
  body?: unknown;
  headers?: Record<string, string>;
};

export async function invokeHandler(
  handler: (req: VercelRequest, res: VercelResponse) => unknown,
  input: HandlerInput = {}
) {
  const req = {
    method: input.method ?? 'GET',
    query: input.query ?? {},
    body: input.body,
    headers: input.headers ?? {},
  } as unknown as VercelRequest;

  let statusCode = 200;
  let jsonBody: unknown = null;
  const setHeader = vi.fn();
  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(b: unknown) {
      jsonBody = b;
      return this;
    },
    send(b: unknown) {
      jsonBody = b;
      return this;
    },
    setHeader,
    end() {
      return this;
    },
  } as unknown as VercelResponse;

  await handler(req, res);
  return { statusCode, body: jsonBody, setHeader };
}
