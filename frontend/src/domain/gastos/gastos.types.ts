/** Tipos del dominio Gastos. */

export interface GastoRaw {
  id: number;
  fecha: string;
  categoria: string;
  monto: number | string;
  proveedor?: string | null;
  fondo?: string | null;
  observacion?: string | null;
  comprobante_url?: string | null;
  fuente_auto?: string | null;
  cat_bg?: string | null;
  cat_fg?: string | null;
}

export interface Gasto {
  id: number;
  fecha: string;
  fechaISO: string;
  categoria: string;
  monto: number;
  proveedor: string;
  fondo: string;
  observacion: string;
  comprobante: string;
  fuenteAuto: string;
  catBg: string;
  catFg: string;
}
