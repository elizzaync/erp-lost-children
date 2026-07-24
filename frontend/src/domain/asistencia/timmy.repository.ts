/**
 * TimmyRepository — integración con el dispositivo Timmy TM-AI03F vía
 * yunatt.com (estado, marcas del dispositivo, enrolamiento, reset). Separado
 * de AsistenciaRepository porque no es CRUD de la entidad Asistencia: son
 * llamadas de control al bridge/yunatt_sync.py y bridge/yunatt_staff_sync.py.
 *
 * NOTA: el legacy (modules/asistencia.js) también exponía UI para conexión
 * ZK directa (pingTimmyDirect, registrarTodosDirecto, abrirFormUsuarioTimmy)
 * — se confirmó que es código muerto: ninguna de esas funciones se invoca
 * desde ningún botón del render tree, y /timmy/status y /timmy/users (POST)
 * ni siquiera existen en bridge/server.py. No se portó — ver commit.
 */
import type { ApiClient } from '@core/index';
import type {
  DeviceLogsResponse, YunattStatus, YunattStaffResponse, EnrollStatus,
  EnrolarResult, RemoteAddUserResult, SyncFotosResult, DbResetResult,
} from './timmy.types';

interface MutationResult { ok?: boolean; error?: string }

export class TimmyRepository {
  constructor(private readonly api: ApiClient) {}

  deviceLogs(fecha: string, limit = 500): Promise<DeviceLogsResponse | null> {
    return this.api.get<DeviceLogsResponse>(`/device/logs?fecha=${encodeURIComponent(fecha)}&limit=${limit}`);
  }

  yunattStatus(): Promise<YunattStatus | null> {
    return this.api.get<YunattStatus>('/yunatt/status');
  }

  yunattSync(): Promise<MutationResult | null> {
    return this.api.post<MutationResult>('/yunatt/sync');
  }

  yunattStaff(): Promise<YunattStaffResponse | null> {
    return this.api.get<YunattStaffResponse>('/yunatt/staff');
  }

  yunattEnrolar(personaId: number, metodo: string): Promise<EnrolarResult | null> {
    return this.api.post<EnrolarResult>('/yunatt/enrolar', { persona_id: personaId, metodo });
  }

  yunattEnrollStatus(sid: string): Promise<EnrollStatus | null> {
    return this.api.get<EnrollStatus>(`/yunatt/enroll-status/${encodeURIComponent(sid)}`);
  }

  yunattRemoteAddUserSn(staffNumber: string, nombre: string, backup: string): Promise<RemoteAddUserResult | null> {
    return this.api.post<RemoteAddUserResult>('/yunatt/remoteadduser-sn', { staff_number: staffNumber, nombre, backup });
  }

  yunattSyncFotos(): Promise<SyncFotosResult | null> {
    return this.api.post<SyncFotosResult>('/yunatt/sync-fotos');
  }

  dbReset(password: string, limpiarTimmy: boolean): Promise<DbResetResult | null> {
    return this.api.post<DbResetResult>('/db/reset', { confirmar: 'BORRAR_TODO', limpiar_timmy: limpiarTimmy, password });
  }
}
