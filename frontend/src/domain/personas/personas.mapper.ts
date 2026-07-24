/**
 * Mapper de Personas (patrón Strategy).
 *
 * Réplica tipada EXACTA de `normPersona()` de js/db.js. Cualquier cambio de
 * comportamiento aquí debe ser deliberado — el test de paridad
 * (personas.mapper.test.ts) compara contra la lógica original campo por campo.
 */
import type { Persona, PersonaRaw } from './personas.types';

export function toPersona(p: PersonaRaw): Persona {
  return {
    id: p.id,
    nombre: p.nombre,
    tutor: p.tutor || '',
    tipo: p.tipo,
    edad: String(p.edad || ''),
    genero: p.genero || 'M',
    ingreso: p.ingreso ? p.ingreso.substring(0, 7) : '',
    estado: p.estado || 'activo',
    inicial: p.inicial || p.nombre.substring(0, 2).toUpperCase(),
    avatarBg: p.avatar_bg || '#DDEDF1',
    avatarFg: p.avatar_fg || '#1C6678',
    cargo: p.cargo || '',
    dni: p.dni || '',
    fechaNacimiento: p.fecha_nacimiento ? p.fecha_nacimiento.substring(0, 10) : '',
    nacionalidad: p.nacionalidad || '',
    telefono: p.telefono || '',
    email: p.email || '',
    direccion: p.direccion || '',
    barrio: p.barrio || '',
    parentescoTutor: p.parentesco_tutor || '',
    telefonoTutor: p.telefono_tutor || '',
    situacionFamiliar: p.situacion_familiar || '',
    grupoSanguineo: p.grupo_sanguineo || '',
    alergias: p.alergias || '',
    condicionMedica: p.condicion_medica || '',
    escolaridad: p.escolaridad || '',
    colegio: p.colegio || '',
    procedencia: p.procedencia || '',
    motivoIngreso: p.motivo_ingreso || '',
    prioridad: p.prioridad || 'media',
    observaciones: p.observaciones || '',
    ocupacion: p.ocupacion || '',
    organizacion: p.organizacion || '',
    paisOrigen: p.pais_origen || '',
    areaServicio: p.area_servicio || '',
    tipoVinculo: p.tipo_vinculo || '',
    fechaFin: p.fecha_fin ? p.fecha_fin.substring(0, 10) : '',
    ingresoFamiliar: p.ingreso_familiar || '',
    numHijosPrograma: p.num_hijos_programa || 0,
    zkUserId: p.zk_user_id || '',
    fotoUrl: p.foto_url || '',
  };
}

/**
 * Traduce Persona (frontend) → payload snake_case para POST/PUT al backend.
 * Réplica del body que arma agregarPersona()/actualizarPersona() en db.js.
 */
export function toPersonaPayload(p: Partial<Persona>): Record<string, unknown> {
  return {
    nombre: p.nombre,
    tipo: p.tipo,
    estado: p.estado || 'activo',
    edad: p.edad,
    genero: p.genero,
    tutor: p.tutor,
    ingreso: p.ingreso,
    inicial: p.inicial,
    avatar_bg: p.avatarBg,
    avatar_fg: p.avatarFg,
    cargo: p.cargo,
    dni: p.dni,
    fecha_nacimiento: p.fechaNacimiento,
    nacionalidad: p.nacionalidad,
    telefono: p.telefono,
    email: p.email,
    direccion: p.direccion,
    barrio: p.barrio,
    parentesco_tutor: p.parentescoTutor,
    telefono_tutor: p.telefonoTutor,
    situacion_familiar: p.situacionFamiliar,
    grupo_sanguineo: p.grupoSanguineo,
    alergias: p.alergias,
    condicion_medica: p.condicionMedica,
    escolaridad: p.escolaridad,
    colegio: p.colegio,
    procedencia: p.procedencia,
    motivo_ingreso: p.motivoIngreso,
    prioridad: p.prioridad,
    observaciones: p.observaciones,
    ocupacion: p.ocupacion,
    organizacion: p.organizacion,
    pais_origen: p.paisOrigen,
    area_servicio: p.areaServicio,
    tipo_vinculo: p.tipoVinculo,
    fecha_fin: p.fechaFin,
    ingreso_familiar: p.ingresoFamiliar,
    num_hijos_programa: p.numHijosPrograma,
  };
}
