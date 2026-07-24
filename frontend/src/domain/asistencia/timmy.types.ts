/**
 * Tipos de la integración con el dispositivo Timmy TM-AI03F vía yunatt.com
 * (bridge/yunatt_sync.py, bridge/yunatt_staff_sync.py). No son un CRUD
 * clásico — son respuestas de endpoints de control del dispositivo/nube,
 * por eso viven en tipos sueltos en vez de un Raw/mapeado como el resto del
 * dominio. Todo opcional por naturaleza: son respuestas de un servicio de
 * terceros (yunatt.com) que el backend solo intermedia.
 */

/** GET /device/logs — fila cruda de zkteco_logs con el join a personas. */
export interface DeviceLogRaw {
  id: number;
  zk_user_id: string;
  timestamp: string;
  tipo?: string | null;
  metodo?: string | null;
  dispositivo?: string | null;
  procesado?: boolean | number | null;
  persona_id?: number | null;
  nombre?: string | null;
  inicial?: string | null;
  avatar_bg?: string | null;
  avatar_fg?: string | null;
  foto_url?: string | null;
  persona_tipo?: string | null;
  vinculado?: boolean | number | null;
}

export interface DeviceLogsResponse {
  total?: number;
  registros?: DeviceLogRaw[];
}

/** GET /yunatt/status */
export interface YunattStatus {
  ok?: boolean;
  sesion_activa?: boolean;
  ultimo_sync?: string | null;
  error?: string | null;
  [k: string]: unknown;
}

/** GET /yunatt/staff — staff en la nube yunatt + usuarios reales del Timmy. */
export interface YunattStaffRow {
  staffNumber?: number | string;
  name?: string;
  photo?: string;
  [k: string]: unknown;
}

export interface DeviceStaffRow {
  enrollid?: number | string;
  backupnums?: number[];
  [k: string]: unknown;
}

export interface YunattStaffResponse {
  ok?: boolean;
  total?: number;
  staff?: YunattStaffRow[];
  device?: DeviceStaffRow[];
}

/** GET /yunatt/enroll-status/<id> — estado real del enrolamiento en el dispositivo. */
export interface EnrollStatus {
  ok?: boolean;
  en_dispositivo?: boolean;
  tiene_cara?: boolean;
  tiene_huella?: boolean;
  backupnums?: number[];
  foto?: string | null;
}

/** POST /yunatt/enrolar */
export interface EnrolarResult {
  ok?: boolean;
  remote_ok?: boolean;
  aviso?: string;
  error?: string;
}

/** POST /yunatt/remoteadduser-sn */
export interface RemoteAddUserResult {
  ok?: boolean;
  error?: string;
  aviso?: string;
}

/** POST /yunatt/sync-fotos */
export interface SyncFotosResult {
  ok?: boolean;
  actualizadas?: Array<{ persona_id: number; foto_url: string }>;
  errores?: Array<{ persona_id: string; error: string }>;
}

/** GET /attendance — marcas de hoy agrupadas, usado por el sync manual. */
export interface AttendanceRow {
  user_id: string;
  hora: string | null;
  metodo?: string | null;
  dispositivo?: string | null;
}

/** POST /db/reset */
export interface DbResetResult {
  ok?: boolean;
  mensaje?: string;
  error?: string;
  timmy?: { ok?: boolean; cloud?: number; errores?: string[]; error?: string } | null;
}
