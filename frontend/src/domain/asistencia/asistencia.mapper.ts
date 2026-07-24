/** Mapper de Asistencia — réplica tipada de normAsistencia() de js/db.js. */
import type { Asistencia, AsistenciaRaw } from './asistencia.types';

function inicialDeNombre(nombre: string): string {
  return nombre
    ? nombre.split(' ').map((n) => n[0] || '').join('').slice(0, 2).toUpperCase()
    : '?';
}

export function toAsistencia(a: AsistenciaRaw): Asistencia {
  return {
    id: a.id || null,
    personaId: a.persona_id || null,
    zkUserId: a.zk_user_id || null,
    nombre: a.nombre || '',
    tipo: a.tipo || 'nino',
    metodo: a.metodo || '—',
    presente: Boolean(a.presente),
    hora: a.hora ? String(a.hora).substring(0, 5) : '',
    inicial: a.inicial || inicialDeNombre(a.nombre || ''),
    avatarBg: a.avatar_bg || '#DDEDF1',
    avatarFg: a.avatar_fg || '#1C6678',
    fotoUrl: a.foto_url || '',
    sinAsignar: Boolean(a.sin_asignar),
  };
}
