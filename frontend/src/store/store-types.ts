/** Forma de la caché en memoria del store y de sus salidas derivadas. */
import type { Persona } from '@domain/personas/personas.types';
import type { Articulo } from '@domain/articulos/articulos.types';
import type { Gasto } from '@domain/gastos/gastos.types';
import type { Entrega } from '@domain/entregas/entregas.types';
import type { Asistencia } from '@domain/asistencia/asistencia.types';
import type { ServicioAlimentacion } from '@domain/alimentacion/alimentacion.types';
import type { Fondos } from '@domain/fondos/fondos.types';

/** Ítem del feed de actividad reciente (mismo shape que emite db.js). */
export interface ActividadItem {
  color: string;
  texto: string;
  tiempo: string;
  lugar: string;
}

/** Caché en memoria — equivalente al objeto `data` de js/db.js. */
export interface StoreData {
  personas: Persona[];
  asistencia: Asistencia[];
  articulos: Articulo[];
  gastos: Gasto[];
  entregas: Entrega[];
  serviciosAlimentacion: ServicioAlimentacion[];
  actividad: ActividadItem[];
  presupuestoMes: number;
  fondos: Fondos;
}

export interface KPIs {
  presentes: number;
  gastoMes: number;
  almuerzosMes: number;
  entregasMes: number;
  criticos: number;
  ninos: number;
}

export interface Alerta {
  tipo: 'danger' | 'warn' | 'primary';
  texto: string;
  sub: string;
  link: string;
}
