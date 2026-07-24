/** GastosRepository — CRUD de gastos (el backend crea el egreso de fondos). */
import type { ApiClient } from '@core/index';
import type { Gasto, GastoRaw } from './gastos.types';
import { toGasto } from './gastos.mapper';

interface MutationResult { ok?: boolean; id?: number; error?: string }
interface ComprobanteResult { ok?: boolean; url?: string; error?: string }

export class GastosRepository {
  constructor(private readonly api: ApiClient) {}

  async list(): Promise<Gasto[] | null> {
    const raw = await this.api.get<GastoRaw[]>('/gastos');
    return Array.isArray(raw) ? raw.map(toGasto) : null;
  }

  create(payload: Record<string, unknown>): Promise<MutationResult | null> {
    return this.api.post<MutationResult>('/gastos', payload);
  }

  update(id: number, payload: Record<string, unknown>): Promise<MutationResult | null> {
    return this.api.put<MutationResult>(`/gastos/${id}`, payload);
  }

  remove(id: number): Promise<MutationResult | null> {
    return this.api.delete<MutationResult>(`/gastos/${id}`);
  }

  /** Sube el comprobante de un gasto (POST /gastos/<id>/comprobante, multipart).
   *  El legacy hacía este fetch sin Authorization (401 contra este backend);
   *  api.postForm() ya agrega el header correcto. */
  subirComprobante(id: number, file: File): Promise<ComprobanteResult | null> {
    const fd = new FormData();
    fd.append('comprobante', file);
    return this.api.postForm<ComprobanteResult>(`/gastos/${id}/comprobante`, fd);
  }
}
