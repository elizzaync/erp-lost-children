/**
 * Component — clase base de todas las pantallas (patrón Template Method).
 *
 * Resuelve de raíz el bug del parpadeo. Hoy cada módulo hace
 * `content.innerHTML = render()` completo en CADA evento, destruyendo y
 * reconstruyendo todo el DOM. Aquí la clase base impone el flujo:
 *
 *   - `mount(host)`      → primera vez: pinta `render()` completo una sola vez.
 *   - `update(changed?)` → en cambios posteriores: si la subclase implementó
 *                          `patch()`, actualiza SOLO los nodos afectados; si no,
 *                          cae a un re-render completo (comportamiento legacy).
 *   - `unmount()`        → limpieza (listeners, timers, sockets del módulo).
 *
 * Además colapsa ráfagas de `update()` en un solo repintado por frame
 * (requestAnimationFrame) — la misma técnica del hotfix de `App.refresh()`,
 * pero ahora estructural: ningún módulo nuevo puede reintroducir el parpadeo.
 *
 * Las subclases SOLO implementan `render()` (obligatorio) y opcionalmente
 * `patch()`, `onMount()`, `onUnmount()`. No manipulan el ciclo de vida a mano.
 */
export abstract class Component<TChange = string> {
  protected host: HTMLElement | null = null;
  private mounted = false;
  private updateScheduled = false;
  private pendingChanges = new Set<TChange>();

  /** HTML inicial de la pantalla. Obligatorio. */
  protected abstract render(): string;

  /**
   * Actualización dirigida opcional. Recibe el conjunto de "qué cambió" y
   * actualiza solo esos nodos. Devuelve `true` si manejó el cambio; `false`
   * (o no implementarlo) fuerza el re-render completo de respaldo.
   */
  protected patch?(_changed: ReadonlySet<TChange>): boolean;

  /** Hook tras montar el HTML inicial (bind de listeners, cargar datos, etc.). */
  protected onMount?(): void;

  /** Hook antes de desmontar (liberar timers/sockets/listeners del módulo). */
  protected onUnmount?(): void;

  mount(host: HTMLElement): void {
    this.host = host;
    host.innerHTML = this.render();
    this.mounted = true;
    this.onMount?.();
  }

  /**
   * Agenda una actualización. Varias llamadas en la misma tanda síncrona
   * colapsan en un solo repintado (evita el parpadeo).
   */
  update(...changed: TChange[]): void {
    if (!this.mounted || !this.host) return;
    for (const c of changed) this.pendingChanges.add(c);
    if (this.updateScheduled) return;
    this.updateScheduled = true;
    requestAnimationFrame(() => {
      this.updateScheduled = false;
      if (!this.mounted || !this.host) return;
      const changes = this.pendingChanges;
      this.pendingChanges = new Set();
      const handled = this.patch?.(changes) ?? false;
      if (!handled) {
        // Respaldo: re-render completo (comportamiento legacy, pero una sola
        // vez por frame en vez de N veces por ráfaga de eventos).
        this.host.innerHTML = this.render();
      }
    });
  }

  unmount(): void {
    this.onUnmount?.();
    this.mounted = false;
    this.pendingChanges.clear();
    if (this.host) this.host.innerHTML = '';
    this.host = null;
  }

  /** Helper para subclases: reemplaza el innerHTML de un nodo hijo por id. */
  protected patchNode(id: string, html: string): boolean {
    const el = this.host?.querySelector<HTMLElement>(`#${id}`);
    if (!el) return false;
    el.innerHTML = html;
    return true;
  }
}
