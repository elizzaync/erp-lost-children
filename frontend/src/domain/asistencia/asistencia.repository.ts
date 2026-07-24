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
}
