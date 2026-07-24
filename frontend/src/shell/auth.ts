/**
 * Auth — autenticación y permisos por rol.
 *
 * Port tipado de js/auth.js. Guarda el token en sessionStorage (se limpia al
 * cerrar el tab). Es la fuente del token para ApiClient/AppStore. La pantalla
 * de login (HTML) vive aparte en login-screen.ts; aquí está solo la lógica.
 */
import { resolveApiBase } from '@core/index';
import type { Rol } from '@domain/usuarios/usuarios.types';

const TOKEN_KEY = 'erp_token';
const USER_KEY = 'erp_user';
const API = resolveApiBase();

export interface SessionUser {
  nombre?: string;
  rol?: Rol | string;
  username?: string;
}

interface LoginResponse {
  ok: boolean;
  token?: string;
  nombre?: string;
  rol?: string;
  error?: string;
}

/** Permisos por rol — réplica exacta de _PERMISOS de auth.js. */
const PERMISOS: Record<string, { screens: string[]; write: '*' | string[] }> = {
  admin: {
    screens: ['dashboard', 'personas', 'asistencia', 'almacen', 'alimentacion', 'entregas', 'gastos', 'reportes', 'marcado', 'usuarios'],
    write: '*',
  },
  coordinador: {
    screens: ['dashboard', 'personas', 'asistencia', 'almacen', 'alimentacion', 'entregas', 'gastos', 'reportes', 'marcado'],
    write: '*',
  },
  voluntario: {
    screens: ['asistencia', 'almacen'],
    write: ['asistencia'],
  },
};

const ROL_LABELS: Record<string, string> = {
  admin: 'Administrador',
  coordinador: 'Coordinador/a',
  voluntario: 'Voluntario/a',
};

export const Auth = {
  getToken(): string {
    return sessionStorage.getItem(TOKEN_KEY) || '';
  },

  getUser(): SessionUser {
    try {
      return JSON.parse(sessionStorage.getItem(USER_KEY) || '{}') as SessionUser;
    } catch {
      return {};
    }
  },

  rol(): string {
    return this.getUser().rol || 'voluntario';
  },

  rolLabel(): string {
    return ROL_LABELS[this.rol()] || this.rol();
  },

  canAccess(screen: string): boolean {
    const p = PERMISOS[this.rol()];
    if (!p) return false;
    return p.screens.includes(screen);
  },

  canWrite(screen: string): boolean {
    const p = PERMISOS[this.rol()];
    if (!p) return false;
    return p.write === '*' || p.write.includes(screen);
  },

  /** POST /auth/login. Guarda token+user en sessionStorage si es correcto. */
  async login(username: string, password: string): Promise<LoginResponse> {
    const res = await fetch(API + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = (await res.json()) as LoginResponse;
    if (data.ok && data.token) {
      sessionStorage.setItem(TOKEN_KEY, data.token);
      sessionStorage.setItem(USER_KEY, JSON.stringify({
        nombre: data.nombre,
        rol: data.rol,
        username,
      }));
    }
    return data;
  },

  async logout(): Promise<void> {
    const token = this.getToken();
    if (token) {
      fetch(API + '/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    window.location.reload();
  },

  /** Verifica que el token siga válido contra /auth/me. */
  async validarSesion(): Promise<boolean> {
    const token = this.getToken();
    if (!token) return false;
    try {
      const res = await fetch(API + '/auth/me', { headers: { Authorization: `Bearer ${token}` } });
      const data = (await res.json()) as { ok?: boolean };
      if (data.ok) return true;
      sessionStorage.clear();
      return false;
    } catch {
      sessionStorage.clear();
      return false;
    }
  },
};
