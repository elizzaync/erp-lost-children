import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiClient } from './api-client';

describe('ApiClient', () => {
  const base = 'http://localhost:7793';
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  function okJson(value: unknown) {
    return Promise.resolve({ json: () => Promise.resolve(value) } as Response);
  }

  it('agrega el header Authorization cuando hay token', async () => {
    fetchMock.mockReturnValue(okJson({ ok: true }));
    const client = new ApiClient(() => 'tok123', base);
    await client.get('/personas');
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer tok123');
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  it('omite Authorization cuando no hay token', async () => {
    fetchMock.mockReturnValue(okJson([]));
    const client = new ApiClient(() => '', base);
    await client.get('/personas');
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBeUndefined();
  });

  it('serializa el body en POST/PUT', async () => {
    fetchMock.mockReturnValue(okJson({ ok: true, id: 5 }));
    const client = new ApiClient(() => 't', base);
    await client.post('/personas', { nombre: 'Ana' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(base + '/personas');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ nombre: 'Ana' }));
  });

  it('devuelve null si la red falla (no lanza)', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    const client = new ApiClient(() => 't', base);
    const res = await client.get('/personas');
    expect(res).toBeNull();
  });
});
