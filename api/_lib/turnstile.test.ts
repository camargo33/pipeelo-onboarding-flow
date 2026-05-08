import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { verifyTurnstileToken } from './turnstile';

describe('verifyTurnstileToken', () => {
  const original = process.env.TURNSTILE_SECRET_KEY;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.TURNSTILE_SECRET_KEY = 'secret';
  });

  afterEach(() => {
    process.env.TURNSTILE_SECRET_KEY = original;
  });

  it('true se Cloudflare retorna success:true', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );
    expect(await verifyTurnstileToken('tok', '1.2.3.4')).toBe(true);
  });

  it('false se Cloudflare retorna success:false', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ success: false, 'error-codes': ['invalid-token'] }),
        { status: 200 },
      ),
    );
    expect(await verifyTurnstileToken('tok')).toBe(false);
  });

  it('false em network error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('net'));
    expect(await verifyTurnstileToken('tok')).toBe(false);
  });

  it('false quando token é vazio', async () => {
    expect(await verifyTurnstileToken('')).toBe(false);
  });

  it('true em modo dev sem TURNSTILE_SECRET_KEY', async () => {
    delete process.env.TURNSTILE_SECRET_KEY;
    expect(await verifyTurnstileToken('any')).toBe(true);
  });

  it('envia remoteip quando ip fornecido', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );
    await verifyTurnstileToken('tok', '9.9.9.9');
    const call = fetchSpy.mock.calls[0];
    const body = (call?.[1]?.body as URLSearchParams).toString();
    expect(body).toContain('remoteip=9.9.9.9');
    expect(body).toContain('secret=secret');
    expect(body).toContain('response=tok');
  });
});
