import { describe, it, expect, vi, beforeEach } from 'vitest';

const redisMock = {
  get: vi.fn(),
  set: vi.fn(),
};

vi.mock('@upstash/redis', () => ({
  Redis: { fromEnv: vi.fn(() => redisMock) },
}));

import { fetchCnpj, __resetBrasilapiCache } from './brasilapi';

describe('fetchCnpj', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    redisMock.get.mockReset();
    redisMock.set.mockReset();
    __resetBrasilapiCache();
  });

  it('rejeita 400 cnpj_invalid_length se !== 14 dígitos', async () => {
    await expect(fetchCnpj('123')).rejects.toMatchObject({
      status: 400,
      message: 'cnpj_invalid_length',
    });
  });

  it('retorna cache hit sem fetch', async () => {
    redisMock.get.mockResolvedValue({ razao_social: 'cached' });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const r = await fetchCnpj('11222333000181');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(r).toMatchObject({ razao_social: 'cached' });
  });

  it('chama BrasilAPI + cacheia 24h em hit fresh', async () => {
    redisMock.get.mockResolvedValue(null);
    redisMock.set.mockResolvedValue('OK');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ razao_social: 'live' }), { status: 200 }),
    );
    const r = await fetchCnpj('11222333000181');
    expect(r).toMatchObject({ razao_social: 'live' });
    expect(redisMock.set).toHaveBeenCalledWith(
      'cnpj:11222333000181',
      { razao_social: 'live' },
      { ex: 86400 },
    );
  });

  it('throws 404 cnpj_not_found em BrasilAPI 404', async () => {
    redisMock.get.mockResolvedValue(null);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('', { status: 404 }),
    );
    await expect(fetchCnpj('11222333000181')).rejects.toMatchObject({
      status: 404,
      message: 'cnpj_not_found',
    });
  });

  it('fallback ReceitaWS quando BrasilAPI 5xx', async () => {
    redisMock.get.mockResolvedValue(null);
    redisMock.set.mockResolvedValue('OK');
    let call = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      call++;
      if (call === 1) return new Response('', { status: 503 });
      return new Response(
        JSON.stringify({ status: 'OK', razao_social: 'fallback' }),
        { status: 200 },
      );
    });
    const r = await fetchCnpj('11222333000181');
    expect(r).toMatchObject({ razao_social: 'fallback' });
  });

  it('fallback ReceitaWS retorna 404 cnpj_not_found quando status:ERROR', async () => {
    redisMock.get.mockResolvedValue(null);
    let call = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      call++;
      if (call === 1) return new Response('', { status: 503 });
      return new Response(JSON.stringify({ status: 'ERROR' }), { status: 200 });
    });
    await expect(fetchCnpj('11222333000181')).rejects.toMatchObject({
      status: 404,
      message: 'cnpj_not_found',
    });
  });

  it('throws 503 cnpj_lookup_unavailable quando ambos providers down', async () => {
    redisMock.get.mockResolvedValue(null);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('', { status: 503 }),
    );
    await expect(fetchCnpj('11222333000181')).rejects.toMatchObject({
      status: 503,
      message: 'cnpj_lookup_unavailable',
    });
  });

  it('tolera erro de rede no Redis cache get', async () => {
    redisMock.get.mockRejectedValue(new Error('redis_down'));
    redisMock.set.mockResolvedValue('OK');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ razao_social: 'live' }), { status: 200 }),
    );
    const r = await fetchCnpj('11222333000181');
    expect(r).toMatchObject({ razao_social: 'live' });
  });
});
