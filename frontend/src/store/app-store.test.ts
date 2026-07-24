import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AppStore } from './app-store';

/**
 * Test de orquestación: con fetch mockeado por endpoint, cargarTodo() debe
 * poblar la caché vía los repositorios/mappers y emitir los eventos de update.
 * Valida que el Facade reproduce el comportamiento de db.js.cargarTodo().
 */
describe('AppStore.cargarTodo', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn((url: string) => {
      const path = url.replace(/^https?:\/\/[^/]+/, '');
      const body: Record<string, unknown> = {
        '/personas': [{ id: 1, nombre: 'Ana Torres', tipo: 'nino' }],
        '/articulos': [{ id: 1, nombre: 'Arroz', categoria: 'Granos', stock: '2', minimo: '10', unidad: 'kg' }],
        '/gastos': [{ id: 1, fecha: '2026-03-15', categoria: 'Comida', monto: '50' }],
        '/entregas': [],
        '/asistencia/hoy': [{ id: 1, persona_id: 1, nombre: 'Ana Torres', presente: 1 }],
        '/alimentacion': [{ id: 1, fecha: '2026-03-15', total_raciones: 40 }],
        '/fondos/balance': { ok: true, balance: 500, total_ingresos: 800, total_egresos: 300, movimientos: [] },
      };
      return Promise.resolve({ json: () => Promise.resolve(body[path] ?? null) } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('puebla la caché y expone getters coherentes', async () => {
    const store = new AppStore(() => 'tok');
    await store.cargarTodo();

    expect(store.personas).toHaveLength(1);
    expect(store.personas[0].nombre).toBe('Ana Torres');
    expect(store.articulos[0].stock).toBe(2); // coacción numérica del mapper
    expect(store.fondos.balance).toBe(500);
    expect(store.getKPIs()).toMatchObject({ presentes: 1, ninos: 1, criticos: 1, almuerzosMes: 40 });
    // artículo bajo mínimo → alerta danger
    expect(store.getAlertasActivas().some((a) => a.tipo === 'danger')).toBe(true);
  });

  it('emite los eventos de update tras cargar', async () => {
    const store = new AppStore(() => 'tok');
    const spy = vi.fn();
    store.on('personas:update', spy);
    store.on('fondos:update', spy);
    await store.cargarTodo();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('el feed de actividad se cap­a en 20 ítems', async () => {
    const store = new AppStore(() => 'tok');
    for (let i = 0; i < 25; i++) {
      store.emit('actividad:add', { color: '', texto: `a${i}`, tiempo: 'ahora', lugar: '' });
    }
    expect(store.actividad).toHaveLength(20);
    // el más reciente queda primero (unshift)
    expect(store.actividad[0].texto).toBe('a24');
  });
});
