/**
 * Tipos del dominio Personas.
 *
 * `PersonaRaw` = forma que devuelve MySQL vía server.py (snake_case, campos que
 * pueden faltar). `Persona` = forma que consume el frontend (camelCase, con
 * defaults aplicados). El Mapper traduce de la primera a la segunda.
 */

export type PersonaTipo = 'nino' | 'padre' | 'misionero' | 'voluntario' | 'staff';
export type PersonaEstado = 'activo' | 'alerta' | 'inactivo';

/** Forma cruda tal como llega del backend. Todo opcional: el backend omite nulos. */
export interface PersonaRaw {
  id: number;
  nombre: string;
  tutor?: string | null;
  tipo: PersonaTipo;
  edad?: number | string | null;
  genero?: string | null;
  ingreso?: string | null;
  estado?: PersonaEstado | null;
  inicial?: string | null;
  avatar_bg?: string | null;
  avatar_fg?: string | null;
  cargo?: string | null;
  dni?: string | null;
  fecha_nacimiento?: string | null;
  nacionalidad?: string | null;
  telefono?: string | null;
  email?: string | null;
  direccion?: string | null;
  barrio?: string | null;
  parentesco_tutor?: string | null;
  telefono_tutor?: string | null;
  situacion_familiar?: string | null;
  grupo_sanguineo?: string | null;
  alergias?: string | null;
  condicion_medica?: string | null;
  escolaridad?: string | null;
  colegio?: string | null;
  procedencia?: string | null;
  motivo_ingreso?: string | null;
  prioridad?: string | null;
  observaciones?: string | null;
  ocupacion?: string | null;
  organizacion?: string | null;
  pais_origen?: string | null;
  area_servicio?: string | null;
  tipo_vinculo?: string | null;
  fecha_fin?: string | null;
  ingreso_familiar?: string | null;
  num_hijos_programa?: number | null;
  zk_user_id?: string | null;
  foto_url?: string | null;
}

/** Forma normalizada que usan los módulos del frontend. */
export interface Persona {
  id: number;
  nombre: string;
  tutor: string;
  tipo: PersonaTipo;
  edad: string;
  genero: string;
  ingreso: string;
  estado: PersonaEstado;
  inicial: string;
  avatarBg: string;
  avatarFg: string;
  cargo: string;
  dni: string;
  fechaNacimiento: string;
  nacionalidad: string;
  telefono: string;
  email: string;
  direccion: string;
  barrio: string;
  parentescoTutor: string;
  telefonoTutor: string;
  situacionFamiliar: string;
  grupoSanguineo: string;
  alergias: string;
  condicionMedica: string;
  escolaridad: string;
  colegio: string;
  procedencia: string;
  motivoIngreso: string;
  prioridad: string;
  observaciones: string;
  ocupacion: string;
  organizacion: string;
  paisOrigen: string;
  areaServicio: string;
  tipoVinculo: string;
  fechaFin: string;
  ingresoFamiliar: string;
  numHijosPrograma: number;
  zkUserId: string;
  fotoUrl: string;
}
