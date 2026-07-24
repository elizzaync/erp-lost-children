/** Mappers de Fondos — réplica tipada de normFondoMov() y del armado de
 *  data.fondos en js/db.js. */
import { diaMes } from '@domain/shared/meses';
import type { Fondos, FondosBalanceRaw, FondoMov, FondoMovRaw } from './fondos.types';

export function toFondoMov(m: FondoMovRaw): FondoMov {
  const d = new Date((m.fecha || '') + 'T00:00:00');
  return {
    id: m.id,
    tipo: m.tipo,
    monto: Number(m.monto),
    descripcion: m.descripcion || '',
    categoria: m.categoria || '',
    fuente: m.fuente || 'manual',
    fecha: m.fecha ? diaMes(d) : '',
  };
}

export function toFondos(f: FondosBalanceRaw): Fondos {
  return {
    balance: Number(f.balance || 0),
    ingresos: Number(f.total_ingresos || 0),
    egresos: Number(f.total_egresos || 0),
    movimientos: (f.movimientos || []).map(toFondoMov),
  };
}
