/** EntregasRepository — lista y registro de entregas (descuenta stock en backend). */
import type { ApiClient } from '@core/index';
import type { Entrega, EntregaRaw } from './entregas.types';
import { toEntrega } from './entregas.mapper';

interface MutationResult { ok?: boolean; id?: number; error?: string }

export interface EntregaPayload {
  persona_id: number;
  articulo_id: number;
  cantidad: number;
  campana: string;
  notas?: string;
}

export class EntregasRepository {
  constructor(private readonly api: ApiClient) {}

  async list(): Promise<Entrega[] | null> {
    const raw = await this.api.get<EntregaRaw[]>('/entregas');
    return Array.isArray(raw) ? raw.map(toEntrega) : null;
  }

  create(payload: EntregaPayload): Promise<MutationResult | null> {
    return this.api.post<MutationResult>('/entregas', payload);
  }
}
