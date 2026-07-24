/**
 * UsuariosRepository — CRUD de cuentas de acceso contra /auth/usuarios.
 *
 * Es el dominio más simple (no toca la caché del AppStore ni el WebSocket), por
 * eso es el piloto de la migración. Réplica de las llamadas de modules/usuarios.js.
 */
import type { ApiClient } from '@core/index';
import type { EditarUsuario, NuevoUsuario, Usuario } from './usuarios.types';

interface MutationResult { ok?: boolean; id?: number; error?: string }

export class UsuariosRepository {
  constructor(private readonly api: ApiClient) {}

  /** Devuelve la lista, o null si el backend respondió error/no-array. */
  async list(): Promise<Usuario[] | null> {
    const data = await this.api.get<Usuario[]>('/auth/usuarios');
    return Array.isArray(data) ? data : null;
  }

  crear(u: NuevoUsuario): Promise<MutationResult | null> {
    return this.api.post<MutationResult>('/auth/usuarios', u);
  }

  editar(id: number, u: EditarUsuario): Promise<MutationResult | null> {
    return this.api.put<MutationResult>(`/auth/usuarios/${id}`, u);
  }

  eliminar(id: number): Promise<MutationResult | null> {
    return this.api.delete<MutationResult>(`/auth/usuarios/${id}`);
  }
}
