import { describe, it, expect, vi, afterEach } from 'vitest';
import { Auth } from './auth';

/** Stub mínimo de sessionStorage para node. */
function stubSession(user: unknown) {
  const store: Record<string, string> = {
    erp_user: JSON.stringify(user),
    erp_token: 'tok',
  };
  vi.stubGlobal('sessionStorage', {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('Auth — permisos por rol (paridad con auth.js)', () => {
  it('admin accede a usuarios y escribe en todo', () => {
    stubSession({ rol: 'admin' });
    expect(Auth.canAccess('usuarios')).toBe(true);
    expect(Auth.canAccess('dashboard')).toBe(true);
    expect(Auth.canWrite('gastos')).toBe(true);
    expect(Auth.rolLabel()).toBe('Administrador');
  });

  it('coordinador NO accede a usuarios pero sí al resto', () => {
    stubSession({ rol: 'coordinador' });
    expect(Auth.canAccess('usuarios')).toBe(false);
    expect(Auth.canAccess('reportes')).toBe(true);
    expect(Auth.canWrite('personas')).toBe(true);
  });

  it('voluntario solo accede a asistencia y almacén, y solo escribe asistencia', () => {
    stubSession({ rol: 'voluntario' });
    expect(Auth.canAccess('asistencia')).toBe(true);
    expect(Auth.canAccess('almacen')).toBe(true);
    expect(Auth.canAccess('dashboard')).toBe(false);
    expect(Auth.canAccess('usuarios')).toBe(false);
    expect(Auth.canWrite('asistencia')).toBe(true);
    expect(Auth.canWrite('almacen')).toBe(false);
  });

  it('sin rol conocido cae a voluntario', () => {
    stubSession({});
    expect(Auth.rol()).toBe('voluntario');
    expect(Auth.canAccess('dashboard')).toBe(false);
  });
});
