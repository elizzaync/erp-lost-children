import { describe, it, expect } from 'vitest';
import { toPersona } from './personas.mapper';
import type { PersonaRaw } from './personas.types';

/**
 * Referencia: copia literal de normPersona() de js/db.js (commit a00bfa0).
 * El test verifica que toPersona() produce EXACTAMENTE el mismo objeto, para
 * garantizar cero cambio de comportamiento en la migración.
 */
function normPersonaLegacy(p: any) {
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

const casos: PersonaRaw[] = [
  // Mínimo: solo campos requeridos → todos los defaults se aplican
  { id: 1, nombre: 'Ana Torres', tipo: 'nino' },
  // Completo con fechas largas que se recortan (ingreso→7, fecha_nac→10)
  {
    id: 2,
    nombre: 'Luis',
    tipo: 'padre',
    edad: 34,
    ingreso: '2026-03-15',
    fecha_nacimiento: '1992-06-01T00:00:00',
    fecha_fin: '2027-01-01T12:00:00',
    avatar_bg: '#000',
    avatar_fg: '#fff',
    estado: 'alerta',
    prioridad: 'alta',
    num_hijos_programa: 3,
    zk_user_id: 'ZK99',
  },
  // inicial ausente → se deriva de nombre.substring(0,2).toUpperCase()
  { id: 3, nombre: 'bo', tipo: 'staff', edad: 0 },
];

describe('toPersona (paridad con normPersona legacy)', () => {
  for (const raw of casos) {
    it(`persona id=${raw.id} coincide con la lógica original`, () => {
      expect(toPersona(raw)).toEqual(normPersonaLegacy(raw));
    });
  }

  it('deriva inicial de las 2 primeras letras del nombre en mayúscula', () => {
    expect(toPersona({ id: 9, nombre: 'zoe', tipo: 'nino' }).inicial).toBe('ZO');
  });

  it('recorta ingreso a YYYY-MM y fechaNacimiento a YYYY-MM-DD', () => {
    const p = toPersona({
      id: 9, nombre: 'x', tipo: 'nino',
      ingreso: '2026-03-15', fecha_nacimiento: '1990-12-31T09:00:00',
    });
    expect(p.ingreso).toBe('2026-03');
    expect(p.fechaNacimiento).toBe('1990-12-31');
  });
});
