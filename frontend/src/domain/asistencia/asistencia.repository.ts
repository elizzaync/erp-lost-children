/** AsistenciaRepository — asistencia de hoy y actualización de marca. */
import type { ApiClient } from '@core/index';
import type { Asistencia, AsistenciaRaw } from './asistencia.types';
import { toAsistencia } from './asistencia.mapper';

interface MutationResult { ok?: boolean; error?: string }

export interface MarcaPayload {
  presente: boolean;
  metodo: string;
  hora: string;
}

export class AsistenciaRepository {
  constructor(private readonly api: ApiClient) {}

  async hoy(): Promise<Asistencia[] | null> {
    const raw = await this.api.get<AsistenciaRaw[]>('/asistencia/hoy');
    return Array.isArray(raw) ? raw.map(toAsistencia) : null;
  }

  actualizarMarca(id: number, payload: MarcaPayload): Promise<MutationResult | null> {
    return this.api.put<MutationResult>(`/asistencia/${id}`, payload);
  }

  /** Vincula un ID del dispositivo (zk_user_id) a una persona del ERP y la
   *  marca presente — usado tanto al "enlazar" una marca en la pestaña
   *  Marcas como al "asignar persona" a una fila sin vincular en Hoy. */
  asignarZk(zkUserId: string, personaId: number): Promise<MutationResult | null> {
    return this.api.post<MutationResult>('/asistencia/asignar-zk', { zk_user_id: zkUserId, persona_id: personaId });
  }
}
