/**
 * main.ts — bootstrap del frontend TypeScript.
 *
 * FASE 0: por ahora solo verifica que la tubería Vite→TS→build funciona y que
 * la capa núcleo carga. El wiring real (AppStore + shell + módulos) se conecta
 * en las fases siguientes, cuando cada pieza esté migrada y probada. Mientras
 * tanto, el sistema en producción sigue usando el index.html raíz + js/ legacy;
 * este proyecto convive sin interferir.
 */
import { EventBus } from '@core/index';

// Smoke check mínimo: instanciar la infraestructura base no debe fallar.
const bus = new EventBus();
bus.emit('boot');

// eslint-disable-next-line no-console
console.info('[erp-frontend] core cargado (Fase 0). Migración en progreso.');
