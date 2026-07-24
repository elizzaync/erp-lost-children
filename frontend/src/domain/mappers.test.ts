import { describe, it, expect } from 'vitest';
import { toArticulo, toArticuloPayload } from './articulos/articulos.mapper';
import { toGasto } from './gastos/gastos.mapper';
import { toEntrega } from './entregas/entregas.mapper';
import { toFondoMov, toFondos } from './fondos/fondos.mapper';
import { toAsistencia } from './asistencia/asistencia.mapper';
import { toServicioAlimentacion } from './alimentacion/alimentacion.mapper';

describe('toArticulo', () => {
  it('coacciona stock/minimo/precio a número y aplica defaults', () => {
    const a = toArticulo({
      id: 1, nombre: 'Arroz', categoria: 'Granos',
      stock: '25', minimo: '10', unidad: 'kg',
    });
    expect(a.stock).toBe(25);
    expect(a.minimo).toBe(10);
    expect(a.precio).toBe(0);
    expect(a.vence).toBe('—');
    expect(a.proveedor).toBe('');
  });

  it('conserva vence cuando viene informado', () => {
    expect(toArticulo({ id: 1, nombre: 'x', categoria: 'c', stock: 1, minimo: 0, unidad: 'u', vence: '2026-12-01' }).vence).toBe('2026-12-01');
  });

  it('payload convierte vence "—" a null', () => {
    expect(toArticuloPayload({ vence: '—' }).vence).toBeNull();
    expect(toArticuloPayload({ vence: '2026-01-01' }).vence).toBe('2026-01-01');
  });
});

describe('toGasto', () => {
  it('formatea fecha corta, guarda fechaISO y aplica fondo por defecto', () => {
    const g = toGasto({ id: 1, fecha: '2026-03-15', categoria: 'Comida', monto: '120.50' });
    expect(g.fechaISO).toBe('2026-03-15');
    expect(g.fecha).toBe('15 mar');
    expect(g.monto).toBe(120.5);
    expect(g.fondo).toBe('Fondo General');
  });
});

describe('toEntrega', () => {
  it('mapea persona/articulo y coacciona cantidad', () => {
    const e = toEntrega({ id: 1, fecha: '2026-03-15', persona_id: 7, articulo_id: 3, cantidad: '2' });
    expect(e.personaId).toBe(7);
    expect(e.articuloId).toBe(3);
    expect(e.cantidad).toBe(2);
    expect(e.campana).toBe('General');
    expect(e.personaTipo).toBe('nino');
  });
});

describe('toFondos / toFondoMov', () => {
  it('normaliza balance y movimientos', () => {
    const f = toFondos({
      ok: true, balance: 500, total_ingresos: 800, total_egresos: 300,
      movimientos: [{ id: 1, tipo: 'ingreso', monto: '800', fecha: '2026-03-10' }],
    });
    expect(f.balance).toBe(500);
    expect(f.ingresos).toBe(800);
    expect(f.egresos).toBe(300);
    expect(f.movimientos[0].monto).toBe(800);
    expect(f.movimientos[0].fecha).toBe('10 mar');
  });

  it('movimiento sin fecha deja fecha vacía', () => {
    expect(toFondoMov({ id: 1, tipo: 'egreso', monto: 10 }).fecha).toBe('');
  });
});

describe('toAsistencia', () => {
  it('deriva inicial de iniciales de palabras del nombre', () => {
    expect(toAsistencia({ nombre: 'Ana Perez' }).inicial).toBe('AP');
  });
  it('sin nombre ni inicial usa "?"', () => {
    expect(toAsistencia({}).inicial).toBe('?');
  });
  it('presente y sinAsignar se fuerzan a booleano; hora se recorta a HH:MM', () => {
    const a = toAsistencia({ presente: 1, sin_asignar: 0, hora: '08:30:45' });
    expect(a.presente).toBe(true);
    expect(a.sinAsignar).toBe(false);
    expect(a.hora).toBe('08:30');
  });
});

describe('toServicioAlimentacion', () => {
  it('mapea raciones/costos con defaults', () => {
    const s = toServicioAlimentacion({ id: 1, fecha: '2026-03-15', total_raciones: 40, costo_total: '120', descontado: 1 });
    expect(s.total).toBe(40);
    expect(s.costo).toBe(120);
    expect(s.descontado).toBe(true);
    expect(s.voluntarios).toBe(0);
  });
});
