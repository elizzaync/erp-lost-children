/** Tipos del dominio Almacén (artículos). */

export interface ArticuloRaw {
  id: number;
  nombre: string;
  categoria: string;
  stock: number | string;
  minimo: number | string;
  unidad: string;
  vence?: string | null;
  precio?: number | string | null;
  descripcion?: string | null;
  proveedor?: string | null;
  codigo?: string | null;
  ubicacion?: string | null;
  imagen?: string | null;
}

export interface Articulo {
  id: number;
  nombre: string;
  categoria: string;
  stock: number;
  minimo: number;
  unidad: string;
  vence: string;
  precio: number;
  descripcion: string;
  proveedor: string;
  codigo: string;
  ubicacion: string;
  imagen: string;
}
