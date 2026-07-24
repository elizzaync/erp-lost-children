/** FondosRepository — balance, registro de ingresos y borrado de movimientos. */
import type { ApiClient } from '@core/index';
import type { Fondos, FondosBalanceRaw } from './fondos.types';
import { toFondos } from './fondos.mapper';

interface MutationResult { ok?: boolean; id?: number; error?: string }

export class FondosRepository {
  constructor(private readonly api: ApiClient) {}

  /** Devuelve el balance normalizado, o null si el backend respondió error. */
  async balance(): Promise<Fondos | null> {
    const raw = await this.api.get<FondosBalanceRaw>('/fondos/balance');
    if (!raw || raw.ok === false) return null;
    return toFondos(raw);
  }

  registrarIngreso(ingreso: Record<string, unknown>): Promise<MutationResult | null> {
    return this.api.post<MutationResult>('/fondos/ingreso', ingreso);
  }

  eliminarMovimiento(id: number): Promise<MutationResult | null> {
    return this.api.delete<MutationResult>(`/fondos/${id}`);
  }
}
