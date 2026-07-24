/**
 * PersonasRepository (patrón Repository).
 *
 * Única responsabilidad: CRUD de personas contra el backend + traducción vía
 * el Mapper. No conoce el EventBus, la caché ni las reglas de negocio (eso vive
 * en AppStore). Devuelve tipos del dominio, no crudos de la API.
 */
import type { ApiClient } from '@core/index';
import type { Persona, PersonaRaw } from './personas.types';
import { toPersona, toPersonaPayload } from './personas.mapper';

interface MutationResult {
  ok?: boolean;
  id?: number;
  error?: string;
}

export class PersonasRepository {
  constructor(private readonly api: ApiClient) {}

  async list(): Promise<Persona[] | null> {
    const raw = await this.api.get<PersonaRaw[]>('/personas');
    return Array.isArray(raw) ? raw.map(toPersona) : null;
  }

  create(persona: Partial<Persona>): Promise<MutationResult | null> {
    return this.api.post<MutationResult>('/personas', toPersonaPayload(persona));
  }

  update(id: number, persona: Partial<Persona>): Promise<MutationResult | null> {
    return this.api.put<MutationResult>(`/personas/${id}`, toPersonaPayload(persona));
  }

  remove(id: number): Promise<MutationResult | null> {
    return this.api.delete<MutationResult>(`/personas/${id}`);
  }
}
