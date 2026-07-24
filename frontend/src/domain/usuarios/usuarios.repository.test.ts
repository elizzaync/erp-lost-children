import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiClient } from '@core/index';
import { UsuariosRepository } from './usuarios.repository';

describe('UsuariosRepository', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const api = new ApiClient(() => 'tok', 'http://localhost:7793');
  const repo = new UsuariosRepository(api);

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const ok = (v: unknown) => Promise.resolve({ json: () => Promise.resolve(v) } as Response);

  it('list() devuelve el arreglo cuando el backend responde una lista', async () => {
    fetchMock.mockReturnValue(ok([{ id: 1, nombre: 'Admin', username: 'admin', rol: 'admin', activo: true }]));
    const res = await repo.list();
    expect(res).toHaveLength(1);
    expect(res?.[0].username).toBe('admin');
  });

  it('list() devuelve null si el backend responde un error (no-array)', async () => {
    fetchMock.mockReturnValue(ok({ error: 'no autorizado' }));
    expect(await repo.list()).toBeNull();
  });

  it('crear() hace POST a /auth/usuarios con el payload', async () => {
    fetchMock.mockReturnValue(ok({ ok: true, id: 9 }));
    const res = await repo.crear({ nombre: 'Ana', username: 'ana', password: 'x', rol: 'voluntario' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:7793/auth/usuarios');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toMatchObject({ username: 'ana', rol: 'voluntario' });
    expect(res).toMatchObject({ ok: true, id: 9 });
  });

  it('editar() hace PUT a /auth/usuarios/:id', async () => {
    fetchMock.mockReturnValue(ok({ ok: true }));
    await repo.editar(3, { nombre: 'Ana', rol: 'coordinador', activo: false });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:7793/auth/usuarios/3');
    expect(init.method).toBe('PUT');
  });

  it('eliminar() hace DELETE a /auth/usuarios/:id', async () => {
    fetchMock.mockReturnValue(ok({ ok: true }));
    await repo.eliminar(3);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:7793/auth/usuarios/3');
    expect(init.method).toBe('DELETE');
  });
});
