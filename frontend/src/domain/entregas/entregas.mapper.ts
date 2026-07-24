/** Mapper de Entregas — réplica tipada de normEntrega() de js/db.js.
 *  Nota: el original construye el Date SIN 'T00:00:00' (new Date(e.fecha)). */
import { diaMes } from '@domain/shared/meses';
import type { Entrega, EntregaRaw } from './entregas.types';

export function toEntrega(e: EntregaRaw): Entrega {
  const d = new Date(e.fecha);
  return {
    id: e.id,
    fecha: diaMes(d),
    personaId: e.persona_id,
    nino: e.nino || '',
    personaTipo: e.persona_tipo || 'nino',
    articulo: e.articulo || '',
    articuloCategoria: e.articulo_categoria || '',
    unidad: e.unidad || '',
    articuloId: e.articulo_id,
    cantidad: Number(e.cantidad),
    campana: e.campana || 'General',
    notas: e.notas || '',
    inicial: e.inicial || '',
    avatarBg: e.avatar_bg || '#DDEDF1',
    avatarFg: e.avatar_fg || '#1C6678',
    campBg: e.bg_color || '#EDE7FD',
    campFg: e.fg_color || '#6B4EEA',
  };
}
