/** Tipos del dominio Fondos (balance + movimientos). */

export interface FondoMovRaw {
  id: number;
  tipo: string;
  monto: number | string;
  descripcion?: string | null;
  categoria?: string | null;
  fuente?: string | null;
  fecha?: string | null;
}

export interface FondoMov {
  id: number;
  tipo: string;
  monto: number;
  descripcion: string;
  categoria: string;
  fuente: string;
  fecha: string;
}

/** Respuesta cruda de GET /fondos/balance. */
export interface FondosBalanceRaw {
  ok?: boolean;
  balance?: number;
  total_ingresos?: number;
  total_egresos?: number;
  movimientos?: FondoMovRaw[];
  error?: string;
}

/** Estado de fondos normalizado que consume el frontend. */
export interface Fondos {
  balance: number;
  ingresos: number;
  egresos: number;
  movimientos: FondoMov[];
}
