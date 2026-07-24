/** AlimentacionRepository — lista y registro de servicios (descuenta insumos en backend). */
import type { ApiClient } from '@core/index';
import type { ServicioAlimentacion, ServicioAlimentacionRaw } from './alimentacion.types';
import { toServicioAlimentacion } from './alimentacion.mapper';

interface MutationResult { ok?: boolean; id?: number; error?: string }
interface ConsumoItem { articuloId: number; cantidad: number }
interface ConsumoResult { ok?: boolean; consumo?: ConsumoItem[]; error?: string }

export class AlimentacionRepository {
  constructor(private readonly api: ApiClient) {}

  async list(): Promise<ServicioAlimentacion[] | null> {
    const raw = await this.api.get<ServicioAlimentacionRaw[]>('/alimentacion');
    return Array.isArray(raw) ? raw.map(toServicioAlimentacion) : null;
  }

  create(payload: Record<string, unknown>): Promise<MutationResult | null> {
    return this.api.post<MutationResult>('/alimentacion', payload);
  }

  /** Consumo de insumos de un servicio ya registrado — usado para pre-llenar
   *  el formulario cuando se "copia" un servicio anterior como plantilla. */
  async consumo(id: number): Promise<ConsumoItem[] | null> {
    const res = await this.api.get<ConsumoResult>(`/alimentacion/${id}/consumo`);
    return res && res.ok && Array.isArray(res.consumo) ? res.consumo : null;
  }
}
