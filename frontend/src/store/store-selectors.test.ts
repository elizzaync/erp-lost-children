import { describe, it, expect } from 'vitest';
import { getKPIs, getAlertasActivas } from './store-selectors';
import type { StoreData } from './store-types';

function emptyData(): StoreData {
  return {
    personas: [], asistencia: [], articulos: [], gastos: [], entregas: [],
    serviciosAlimentacion: [], actividad: [], presupuestoMes: 2400,
    fondos: { balance: 0, ingresos: 0, egresos: 0, movimientos: [] },
  };
}

describe('getKPIs', () => {
  it('cuenta presentes, críticos y niños; suma gastos y raciones', () => {
    const d = emptyData();
    d.asistencia = [{ presente: true } as any, { presente: false } as any];
    d.gastos = [{ monto: 100 } as any, { monto: 50 } as any];
    d.serviciosAlimentacion = [{ total: 40 } as any, { total: 10 } as any];
    d.entregas = [{} as any];
    d.articulos = [{ stock: 2, minimo: 5 } as any, { stock: 9, minimo: 5 } as any];
    d.personas = [{ tipo: 'nino' } as any, { tipo: 'padre' } as any, { tipo: 'nino' } as any];
    expect(getKPIs(d)).toEqual({
      presentes: 1, gastoMes: 150, almuerzosMes: 50, entregasMes: 1, criticos: 1, ninos: 2,
    });
  });
});

describe('getAlertasActivas', () => {
  it('sin problemas → sin alertas', () => {
    expect(getAlertasActivas(emptyData())).toEqual([]);
  });

  it('artículo bajo mínimo genera alerta danger con link a almacen', () => {
    const d = emptyData();
    d.articulos = [{ nombre: 'Arroz', stock: 1, minimo: 10 } as any];
    const a = getAlertasActivas(d);
    expect(a[0]).toMatchObject({ tipo: 'danger', link: 'almacen' });
    expect(a[0].texto).toContain('Arroz');
  });

  it('persona en estado alerta y personas sin zkUserId generan alertas', () => {
    const d = emptyData();
    d.personas = [
      { nombre: 'Ana', estado: 'alerta', tipo: 'nino', zkUserId: 'ZK1' } as any,
      { nombre: 'Beto', estado: 'activo', tipo: 'nino', zkUserId: '' } as any,
    ];
    const alertas = getAlertasActivas(d);
    expect(alertas.some((x) => x.tipo === 'warn' && x.link === 'personas')).toBe(true);
    expect(alertas.some((x) => x.tipo === 'primary' && x.link === 'marcado')).toBe(true);
  });
});
