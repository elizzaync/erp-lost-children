/** Barrel de la capa de dominio: tipos, mappers y repositorios por entidad. */

// Personas
export type { Persona, PersonaRaw, PersonaTipo, PersonaEstado } from './personas/personas.types';
export { toPersona, toPersonaPayload } from './personas/personas.mapper';
export { PersonasRepository } from './personas/personas.repository';

// Artículos
export type { Articulo, ArticuloRaw } from './articulos/articulos.types';
export { toArticulo, toArticuloPayload } from './articulos/articulos.mapper';
export { ArticulosRepository } from './articulos/articulos.repository';
export type { MovimientoPayload } from './articulos/articulos.repository';

// Gastos
export type { Gasto, GastoRaw } from './gastos/gastos.types';
export { toGasto } from './gastos/gastos.mapper';
export { GastosRepository } from './gastos/gastos.repository';

// Entregas
export type { Entrega, EntregaRaw } from './entregas/entregas.types';
export { toEntrega } from './entregas/entregas.mapper';
export { EntregasRepository } from './entregas/entregas.repository';
export type { EntregaPayload } from './entregas/entregas.repository';

// Fondos
export type { Fondos, FondoMov, FondoMovRaw, FondosBalanceRaw } from './fondos/fondos.types';
export { toFondos, toFondoMov } from './fondos/fondos.mapper';
export { FondosRepository } from './fondos/fondos.repository';

// Asistencia
export type { Asistencia, AsistenciaRaw } from './asistencia/asistencia.types';
export { toAsistencia } from './asistencia/asistencia.mapper';
export { AsistenciaRepository } from './asistencia/asistencia.repository';
export type { MarcaPayload } from './asistencia/asistencia.repository';

// Alimentación
export type { ServicioAlimentacion, ServicioAlimentacionRaw } from './alimentacion/alimentacion.types';
export { toServicioAlimentacion } from './alimentacion/alimentacion.mapper';
export { AlimentacionRepository } from './alimentacion/alimentacion.repository';
