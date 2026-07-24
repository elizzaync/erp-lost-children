/** Utilidades puras del store — réplica de los helpers de js/db.js. */
import { MESES_ABREV } from '@domain/shared/meses';

/** Siguiente id incremental sobre un arreglo con campo `id`.
 *  Acepta ids `null` (p. ej. filas de asistencia recién creadas): `Number(null)`
 *  → 0, misma coerción que hacía el JS original de db.js. */
export function nextId(arr: ReadonlyArray<{ id: number | null }>): number {
  return arr.length ? Math.max(...arr.map((x) => Number(x.id))) + 1 : 1;
}

/** Fecha corta de hoy, ej. "15 mar". */
export function hoy(now: Date = new Date()): string {
  return `${now.getDate()} ${MESES_ABREV[now.getMonth()]}`;
}

/** Hora actual "HH:MM" en formato es-PE. */
export function ahora(now: Date = new Date()): string {
  return now.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}
