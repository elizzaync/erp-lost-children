/** AlimentacionRepository — lista y registro de servicios (descuenta insumos en backend). */
import type { ApiClient } from '@core/index';
import type { ServicioAlimentacion, ServicioAlimentacionRaw } from './alimentacion.types';
import { toServicioAlimentacion } from './alimentacion.mapper';

interface MutationResult { ok?: boolean; id?: number; error?: string }

export class AlimentacionRepository {
  constructor(private readonly api: ApiClient) {}

  async list(): Promise<ServicioAlimentacion[] | null> {
    const raw = await this.api.get<ServicioAlimentacionRaw[]>('/alimentacion');
    return Array.isArray(raw) ? raw.map(toServicioAlimentacion) : null;
  }

  create(payload: Record<string, unknown>): Promise<MutationResult | null> {
    return this.api.post<MutationResult>('/alimentacion', payload);
  }
}
