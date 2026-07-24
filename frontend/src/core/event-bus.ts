/**
 * EventBus — patrón Observer / PubSub.
 *
 * Formaliza el `on/off/emit` que hoy vive incrustado dentro de `js/db.js` como
 * una clase reusable e independiente de los datos. Es la pieza de infraestructura
 * más básica: no sabe nada de personas, gastos ni de la API.
 *
 * Los nombres de evento replican EXACTAMENTE los que emite el sistema actual
 * (`personas:update`, `asistencia:nueva`, `actividad:add`, etc.), para que el
 * AppStore Facade pueda exponer la misma semántica que `window.DB` sin que los
 * módulos legacy noten diferencia.
 */

export type EventHandler<T = unknown> = (payload?: T) => void;

export class EventBus {
  private readonly listeners = new Map<string, Set<EventHandler>>();

  /** Suscribe `handler` al evento. Devuelve una función para desuscribir. */
  on<T = unknown>(event: string, handler: EventHandler<T>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler as EventHandler);
    return () => this.off(event, handler);
  }

  /** Desuscribe un handler concreto de un evento. */
  off<T = unknown>(event: string, handler: EventHandler<T>): void {
    this.listeners.get(event)?.delete(handler as EventHandler);
  }

  /**
   * Emite un evento a todos sus suscriptores. Un error en un handler no debe
   * impedir que los demás reciban el evento (mismo espíritu tolerante que el
   * forEach de emit() en db.js, pero además aislando fallos).
   */
  emit<T = unknown>(event: string, payload?: T): void {
    const set = this.listeners.get(event);
    if (!set) return;
    // Copia defensiva: un handler puede des/suscribir durante la emisión.
    for (const handler of [...set]) {
      try {
        handler(payload);
      } catch (err) {
        console.error(`[EventBus] handler de "${event}" lanzó:`, err);
      }
    }
  }

  /** Cuántos handlers hay para un evento (útil en tests). */
  count(event: string): number {
    return this.listeners.get(event)?.size ?? 0;
  }
}
