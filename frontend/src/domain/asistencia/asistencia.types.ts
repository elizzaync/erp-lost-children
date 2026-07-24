/** Tipos del dominio Asistencia. */

export interface AsistenciaRaw {
  id?: number | null;
  persona_id?: number | null;
  zk_user_id?: string | null;
  nombre?: string | null;
  tipo?: string | null;
  metodo?: string | null;
  presente?: boolean | number | null;
  hora?: string | number | null;
  inicial?: string | null;
  avatar_bg?: string | null;
  avatar_fg?: string | null;
  foto_url?: string | null;
  sin_asignar?: boolean | number | null;
}

export interface Asistencia {
  id: number | null;
  personaId: number | null;
  zkUserId: string | null;
  nombre: string;
  tipo: string;
  metodo: string;
  presente: boolean;
  hora: string;
  inicial: string;
  avatarBg: string;
  avatarFg: string;
  fotoUrl: string;
  sinAsignar: boolean;
}
