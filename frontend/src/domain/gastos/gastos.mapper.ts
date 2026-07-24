/** Mapper de Gastos — réplica tipada de normGasto() de js/db.js. */
import { diaMes } from '@domain/shared/meses';
import type { Gasto, GastoRaw } from './gastos.types';

export function toGasto(g: GastoRaw): Gasto {
  const d = new Date(g.fecha + 'T00:00:00');
  return {
    id: g.id,
    fecha: diaMes(d),
    fechaISO: g.fecha,
    categoria: g.categoria,
    monto: Number(g.monto),
    proveedor: g.proveedor || '',
    fondo: g.fondo || 'Fondo General',
    observacion: g.observacion || '',
    comprobante: g.comprobante_url || '',
    fuenteAuto: g.fuente_auto || '',
    catBg: g.cat_bg || '#DDEDF1',
    catFg: g.cat_fg || '#1C6678',
  };
}
