/** Tipos del dominio Alimentación (servicios). */

export interface ServicioAlimentacionRaw {
  id: number;
  fecha: string;
  menu?: string | null;
  total_raciones?: number | null;
  ninos?: number | null;
  misioneros?: number | null;
  voluntarios?: number | null;
  padres?: number | null;
  staff?: number | null;
  insumos_desc?: string | null;
  costo_total?: number | string | null;
  costo_por_plato?: number | string | null;
  descontado?: boolean | number | null;
}

export interface ServicioAlimentacion {
  id: number;
  fecha: string;
  menu: string;
  total: number;
  ninos: number;
  misioneros: number;
  voluntarios: number;
  padres: number;
  staff: number;
  insumos: string;
  costo: number;
  costoPlato: number;
  descontado: boolean;
}
