/** Tipos del dominio Usuarios (cuentas de acceso al sistema). */

export type Rol = 'admin' | 'coordinador' | 'voluntario';

/** Usuario tal como lo devuelve GET /auth/usuarios. */
export interface Usuario {
  id: number;
  nombre: string;
  username: string;
  rol: Rol | string;
  activo: boolean;
  created_at?: string | null;
}

/** Payload para crear un usuario (POST). */
export interface NuevoUsuario {
  nombre: string;
  username: string;
  password: string;
  rol: string;
}

/** Payload para editar (PUT); password opcional (vacío = no cambiar). */
export interface EditarUsuario {
  nombre: string;
  rol: string;
  activo: boolean;
  password?: string;
}
