/** Barrel de la capa núcleo (infraestructura sin lógica de negocio). */
export { EventBus } from './event-bus';
export type { EventHandler } from './event-bus';
export { ApiClient, resolveApiBase } from './api-client';
export type { TokenProvider } from './api-client';
export { RealtimeClient } from './realtime-client';
export type { RealtimeEvent, RealtimeHandlers } from './realtime-client';
export { Component } from './component';
