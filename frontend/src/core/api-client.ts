/**
 * ApiClient — único punto del frontend que habla HTTP con el backend Flask.
 *
 * Reemplaza `apiFetch()` de js/db.js, conservando su contrato exacto:
 *   - agrega `Authorization: Bearer <token>` cuando hay sesión;
 *   - agrega `Content-Type: application/json`;
 *   - ante error de red devuelve `null` en vez de lanzar (los repositorios
 *     deciden qué hacer con el null), igual que hoy.
 *
 * El token NO se lee de una global: se inyecta un `getToken()` en el
 * constructor (inversión de dependencia), para no acoplar `core/` con la capa
 * de autenticación y poder testear con un token falso.
 */

export type TokenProvider = () => string;

/** Base URL: en file:// apunta al bridge local; si no, al mismo origen que sirvió la página. */
export function resolveApiBase(): string {
  if (typeof window === 'undefined') return 'http://localhost:7793';
  return window.location.protocol === 'file:'
    ? 'http://localhost:7793'
    : window.location.origin;
}

export class ApiClient {
  constructor(
    private readonly getToken: TokenProvider,
    private readonly baseUrl: string = resolveApiBase(),
  ) {}

  /** Base URL efectiva (útil para derivar la URL del WebSocket). */
  get base(): string {
    return this.baseUrl;
  }

  private headers(): Record<string, string> {
    const token = this.getToken();
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  /**
   * Petición genérica. Devuelve el JSON parseado, o `null` si la red falla
   * o la respuesta no es JSON — mismo comportamiento tolerante que apiFetch().
   */
  private async request<T>(path: string, init: RequestInit = {}): Promise<T | null> {
    try {
      const res = await fetch(this.baseUrl + path, {
        ...init,
        headers: { ...this.headers(), ...(init.headers ?? {}) },
      });
      return (await res.json()) as T;
    } catch {
      return null;
    }
  }

  get<T>(path: string): Promise<T | null> {
    return this.request<T>(path, { method: 'GET' });
  }

  post<T>(path: string, body?: unknown): Promise<T | null> {
    return this.request<T>(path, {
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  put<T>(path: string, body?: unknown): Promise<T | null> {
    return this.request<T>(path, {
      method: 'PUT',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  delete<T>(path: string): Promise<T | null> {
    return this.request<T>(path, { method: 'DELETE' });
  }
}
