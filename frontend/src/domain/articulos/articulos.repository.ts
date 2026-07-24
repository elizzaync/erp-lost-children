/** ArticulosRepository — CRUD de almacén + movimientos de stock. */
import type { ApiClient } from '@core/index';
import type { Articulo, ArticuloRaw } from './articulos.types';
import { toArticulo, toArticuloPayload } from './articulos.mapper';

interface MutationResult { ok?: boolean; id?: number; error?: string }
interface ImagenResult { ok?: boolean; url?: string; error?: string }

export interface MovimientoPayload {
  tipo: 'entrada' | 'salida';
  cantidad: number;
  origen?: string;
  costo_total?: number;
  proveedor_donante?: string;
  motivo?: string;
}

export class ArticulosRepository {
  constructor(private readonly api: ApiClient) {}

  async list(): Promise<Articulo[] | null> {
    const raw = await this.api.get<ArticuloRaw[]>('/articulos');
    return Array.isArray(raw) ? raw.map(toArticulo) : null;
  }

  create(a: Partial<Articulo>): Promise<MutationResult | null> {
    return this.api.post<MutationResult>('/articulos', toArticuloPayload(a));
  }

  update(id: number, a: Partial<Articulo>): Promise<MutationResult | null> {
    return this.api.put<MutationResult>(`/articulos/${id}`, toArticuloPayload(a));
  }

  remove(id: number): Promise<MutationResult | null> {
    return this.api.delete<MutationResult>(`/articulos/${id}`);
  }

  movimiento(id: number, payload: MovimientoPayload): Promise<MutationResult | null> {
    return this.api.post<MutationResult>(`/articulos/${id}/movimiento`, payload);
  }

  /** Sube la imagen de un artículo (POST /articulos/<id>/imagen, multipart). */
  subirImagen(id: number, file: File): Promise<ImagenResult | null> {
    const fd = new FormData();
    fd.append('imagen', file);
    return this.api.postForm<ImagenResult>(`/articulos/${id}/imagen`, fd);
  }
}
