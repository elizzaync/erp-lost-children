/** Mapper de Alimentación — réplica tipada del mapeo inline de servicios
 *  alimentación en cargarTodo() de js/db.js. */
import type { ServicioAlimentacion, ServicioAlimentacionRaw } from './alimentacion.types';

export function toServicioAlimentacion(s: ServicioAlimentacionRaw): ServicioAlimentacion {
  return {
    id: s.id,
    fecha: s.fecha,
    menu: s.menu || '',
    total: s.total_raciones || 0,
    ninos: s.ninos || 0,
    misioneros: s.misioneros || 0,
    voluntarios: s.voluntarios || 0,
    padres: s.padres || 0,
    staff: s.staff || 0,
    insumos: s.insumos_desc || '',
    costo: Number(s.costo_total || 0),
    costoPlato: Number(s.costo_por_plato || 0),
    descontado: Boolean(s.descontado),
  };
}
