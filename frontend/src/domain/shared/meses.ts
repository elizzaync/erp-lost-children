/**
 * Abreviaturas de mes usadas por los mappers para formatear fechas cortas
 * ("15 mar"). Es la MISMA constante que js/db.js repetía en cada norm*; se
 * centraliza aquí, pero cada mapper conserva su forma exacta de construir el
 * Date (algunos parsean con 'T00:00:00', otros no) para no alterar resultados.
 */
export const MESES_ABREV = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
] as const;

/** `${d.getDate()} ${MESES_ABREV[d.getMonth()]}` sobre un Date ya construido. */
export function diaMes(d: Date): string {
  return `${d.getDate()} ${MESES_ABREV[d.getMonth()]}`;
}
