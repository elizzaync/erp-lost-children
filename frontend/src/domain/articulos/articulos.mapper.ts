/** Mapper de Artículos — réplica tipada de normArticulo() de js/db.js. */
import type { Articulo, ArticuloRaw } from './articulos.types';

export function toArticulo(a: ArticuloRaw): Articulo {
  return {
    id: a.id,
    nombre: a.nombre,
    categoria: a.categoria,
    stock: Number(a.stock),
    minimo: Number(a.minimo),
    unidad: a.unidad,
    vence: a.vence || '—',
    precio: Number(a.precio || 0),
    descripcion: a.descripcion || '',
    proveedor: a.proveedor || '',
    codigo: a.codigo || '',
    ubicacion: a.ubicacion || '',
    imagen: a.imagen || '',
  };
}

/** Payload snake_case para POST/PUT (réplica del body de db.js). */
export function toArticuloPayload(a: Partial<Articulo>): Record<string, unknown> {
  return {
    nombre: a.nombre,
    categoria: a.categoria,
    stock: a.stock,
    minimo: a.minimo,
    unidad: a.unidad,
    vence: a.vence && a.vence !== '—' ? a.vence : null,
    precio: a.precio,
    descripcion: a.descripcion,
    proveedor: a.proveedor,
    codigo: a.codigo,
    ubicacion: a.ubicacion,
  };
}
