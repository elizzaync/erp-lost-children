/**
 * MarcadoComponent — "Kiosko de marcado facial" migrado a la nueva
 * arquitectura (Fase 2, módulo 3).
 *
 * Diferencias clave vs modules/marcado.js legacy:
 *  - Component (mount/update/unmount) en vez de `App.register` + string HTML.
 *  - Interactividad por EVENT DELEGATION (data-action) en vez de
 *    onclick="MarcadoModule.x()" sobre un global window.
 *  - Implementa patch(): al recibir 'asistencia:update' del AppStore (marcas
 *    del Timmy en tiempo real vía WebSocket, o marcado manual/simulado local)
 *    actualiza SOLO los contadores y el historial — nunca vuelve a montar
 *    toda la pantalla (la cámara/status quedarían destruidos a media
 *    animación). Es el mismo patrón _refreshContadores() del legacy, ahora
 *    estandarizado por la clase base en vez de manipular el DOM a mano desde
 *    el listener.
 *  - esc() en todo dato de persona (disciplina anti-XSS).
 *
 * "Ver lista completa" (navegar a Asistencia) queda como aviso: el módulo
 * Asistencia todavía no está migrado a esta arquitectura (es el módulo 7 del
 * orden de la Fase 2), así que por ahora no hay a dónde navegar dentro de
 * esta app en paralelo.
 */
import { Component } from '@core/index';
import type { AppStore } from '@store/app-store';
import type { Asistencia } from '@domain/asistencia/asistencia.types';
import { esc, toast, modal, closeModal } from '@shell/ui';

type StatusTipo = 'success' | 'warn' | '';

export class MarcadoComponent extends Component {
  private scanning = false;
  private idx = 0;
  private unsubAsistencia: (() => void) | null = null;
  private statusTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly onClick = (e: Event) => this.handleClick(e);

  constructor(private readonly store: AppStore) {
    super();
  }

  protected override onMount(): void {
    document.addEventListener('click', this.onClick);
    this.unsubAsistencia = this.store.on('asistencia:update', () => this.update());
  }

  protected override onUnmount(): void {
    document.removeEventListener('click', this.onClick);
    this.unsubAsistencia?.();
    this.unsubAsistencia = null;
    if (this.statusTimer) clearTimeout(this.statusTimer);
  }

  /** Actualización dirigida: SOLO contadores + historial, nunca re-render completo
   *  (la cámara/status en animación no deben destruirse). */
  protected override patch(): boolean {
    this.patchNode('kiosk-contadores', this.contadoresHtml());
    this.patchNode('kiosk-historial', this.historialHtml());
    return true;
  }

  /* ---------- Delegación de eventos ---------- */
  private handleClick(e: Event): void {
    const target = (e.target as HTMLElement)?.closest<HTMLElement>('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    switch (action) {
      case 'simular': this.simular(); break;
      case 'marcar-manual': this.marcarManual(); break;
      case 'ver-asistencia': toast('El módulo Asistencia todavía no está migrado a esta vista previa', 'info'); break;
      case 'cerrar-modal': closeModal(); break;
      case 'confirmar-manual': void this.confirmarManual(); break;
    }
  }

  /* ---------- RENDER ---------- */
  protected render(): string {
    return `
    <div class="page-header" style="flex-direction:column;align-items:center;text-align:center;margin-bottom:14px;">
      <h1>Kiosko de marcado facial</h1>
      <p>El niño se coloca frente a la cámara · el sistema identifica y registra la asistencia</p>
    </div>

    <div class="kiosk-wrap">

      <div class="kiosk-cam" id="kiosk-cam">
        <svg style="position:absolute;inset:0;width:100%;height:100%;" viewBox="0 0 280 280" fill="none">
          <rect x="60" y="50" width="60" height="4" rx="2" fill="rgba(42,135,156,.6)"/>
          <rect x="60" y="50" width="4" height="60" rx="2" fill="rgba(42,135,156,.6)"/>
          <rect x="160" y="50" width="60" height="4" rx="2" fill="rgba(42,135,156,.6)"/>
          <rect x="216" y="50" width="4" height="60" rx="2" fill="rgba(42,135,156,.6)"/>
          <rect x="60" y="172" width="60" height="4" rx="2" fill="rgba(42,135,156,.6)"/>
          <rect x="60" y="172" width="4" height="58" rx="2" fill="rgba(42,135,156,.6)"/>
          <rect x="160" y="172" width="60" height="4" rx="2" fill="rgba(42,135,156,.6)"/>
          <rect x="216" y="172" width="4" height="58" rx="2" fill="rgba(42,135,156,.6)"/>
          <ellipse cx="140" cy="118" rx="52" ry="62" stroke="rgba(42,135,156,.25)" stroke-width="2" fill="rgba(42,135,156,.06)"/>
        </svg>
        <div class="kiosk-scan-line" style="top:60px;"></div>
        <div style="position:absolute;bottom:16px;left:0;right:0;text-align:center;font-size:12px;color:rgba(255,255,255,.5);">
          Coloca tu rostro en el recuadro
        </div>
      </div>

      <div id="kiosk-status" style="text-align:center;min-height:52px;">
        <div style="font-family:'Quicksand';font-weight:800;font-size:18px;">Esperando…</div>
        <div style="font-size:13px;color:var(--muted);margin-top:4px;">Sistema listo para reconocer</div>
      </div>

      <div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center;">
        <button class="btn btn-primary" id="btn-simular" data-action="simular">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="11" r="3"/><path d="M5 19a7 7 0 0 1 14 0"/></svg>Simular reconocimiento
        </button>
        <button class="btn btn-outline" data-action="marcar-manual">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h10"/></svg>Marcar manual
        </button>
        <button class="btn btn-outline" data-action="ver-asistencia">Ver lista completa</button>
      </div>

      <div id="kiosk-contadores" style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;width:100%;max-width:460px;">
        ${this.contadoresHtml()}
      </div>

      <div style="width:100%;max-width:560px;">
        <div style="font-weight:700;font-size:14px;margin-bottom:10px;color:var(--muted);">Últimas marcas de hoy</div>
        <div id="kiosk-historial" style="display:flex;flex-direction:column;gap:8px;">
          ${this.historialHtml()}
        </div>
      </div>

    </div>`;
  }

  private avatarHtml(inicial: string, bg: string, fg: string, size = 34): string {
    const rad = Math.round(size * 0.29);
    return `<div style="width:${size}px;height:${size}px;border-radius:${rad}px;background:${esc(bg)};color:${esc(fg)};
      display:flex;align-items:center;justify-content:center;font-weight:700;font-size:${Math.round(size * 0.37)}px;flex:none;">${esc(inicial)}</div>`;
  }

  private contadoresHtml(): string {
    const presentes = this.store.asistencia.filter((a) => a.presente).length;
    const facial = this.store.asistencia.filter((a) => a.presente && a.metodo.includes('facial')).length;
    const ausentes = this.store.asistencia.filter((a) => !a.presente).length;
    return `
      <div class="kpi-card" style="text-align:center;padding:14px;">
        <div style="font-family:'Quicksand';font-weight:800;font-size:22px;color:var(--primary);">${facial}</div>
        <div style="font-size:12px;color:var(--muted);">Por facial</div>
      </div>
      <div class="kpi-card" style="text-align:center;padding:14px;">
        <div style="font-family:'Quicksand';font-weight:800;font-size:22px;color:var(--success);">${presentes}</div>
        <div style="font-size:12px;color:var(--muted);">Presentes</div>
      </div>
      <div class="kpi-card" style="text-align:center;padding:14px;">
        <div style="font-family:'Quicksand';font-weight:800;font-size:22px;color:var(--danger);">${ausentes}</div>
        <div style="font-size:12px;color:var(--muted);">Ausentes</div>
      </div>`;
  }

  private historialHtml(): string {
    const marcados = this.store.asistencia.filter((a) => a.presente && a.hora).slice(0, 5);
    if (!marcados.length) return `<div style="font-size:13px;color:var(--faint);text-align:center;">Sin marcas aún</div>`;
    return marcados.map((a) => `
      <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:var(--surface);border:1px solid var(--border);border-radius:12px;">
        ${this.avatarHtml(a.inicial, a.avatarBg, a.avatarFg)}
        <div style="flex:1;"><div style="font-weight:600;font-size:14px;">${esc(a.nombre)}</div><div style="font-size:12px;color:var(--faint);">${esc(a.metodo)}</div></div>
        <span style="font-size:13px;font-weight:700;color:var(--success);">${esc(a.hora)}</span>
      </div>`).join('');
  }

  /* ---------- Simulación de reconocimiento (estado transitorio, fuera de render/patch) ---------- */
  private simular(): void {
    if (this.scanning) return;
    this.scanning = true;

    const btn = document.getElementById('btn-simular') as HTMLButtonElement | null;
    if (btn) { btn.disabled = true; btn.textContent = 'Escaneando…'; }

    const ausentes = this.store.asistencia.filter((a) => !a.presente);
    if (!ausentes.length) {
      this.setStatus('✓ Todos presentes', 'Todos los niños ya fueron marcados hoy', 'success');
      this.scanning = false;
      if (btn) { btn.disabled = false; btn.textContent = 'Simular reconocimiento'; }
      return;
    }
    const target = ausentes[this.idx % ausentes.length]!;
    this.idx++;

    this.setStatus('', 'Analizando rostro…', '');

    if (this.statusTimer) clearTimeout(this.statusTimer);
    this.statusTimer = setTimeout(() => {
      void (async () => {
        const personaId = target.personaId ?? target.id;
        const a: Asistencia | null = personaId != null ? await this.store.marcarFacial(personaId) : null;
        if (a) {
          this.setStatus(`¡Reconocido! → ${esc(a.nombre)}`, `Asistencia registrada · ${esc(a.hora)}`, 'success');
        } else {
          this.setStatus('No reconocido', 'Intenta de nuevo o usa el modo manual', 'warn');
        }
        this.scanning = false;
        const btn2 = document.getElementById('btn-simular') as HTMLButtonElement | null;
        if (btn2) { btn2.disabled = false; btn2.textContent = 'Simular reconocimiento'; }
        this.statusTimer = setTimeout(() => {
          this.setStatus('Esperando…', 'Sistema listo para reconocer', '');
        }, 3000);
      })();
    }, 1400);
  }

  private setStatus(titulo: string, sub: string, tipo: StatusTipo): void {
    const el = document.getElementById('kiosk-status');
    if (!el) return;
    const colors: Record<StatusTipo, string> = { success: 'var(--success)', warn: 'var(--warn)', '': 'var(--ink)' };
    el.innerHTML = `
      <div style="font-family:'Quicksand';font-weight:800;font-size:18px;color:${colors[tipo]};">${esc(titulo)}</div>
      <div style="font-size:13px;color:var(--muted);margin-top:4px;">${esc(sub)}</div>`;
  }

  /* ---------- Marcado manual ---------- */
  private marcarManual(): void {
    const ausentes = this.store.asistencia.filter((a) => !a.presente);
    if (!ausentes.length) { toast('Todos los niños ya están marcados', 'info'); return; }
    modal(`
      <h2>Marcado manual</h2>
      <div class="form-group"><label>Selecciona la persona *</label>
        <select id="manual-persona">
          ${ausentes.map((a) => `<option value="${a.id ?? ''}">${esc(a.nombre)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label>Motivo</label>
        <select id="manual-motivo">
          <option>QR dañado</option><option>Sin rostro registrado</option><option>Falla de cámara</option><option>Otro</option>
        </select>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" data-action="cerrar-modal">Cancelar</button>
        <button class="btn btn-primary" data-action="confirmar-manual">Marcar presente</button>
      </div>`, { narrow: true });
  }

  private async confirmarManual(): Promise<void> {
    const select = document.getElementById('manual-persona') as HTMLSelectElement | null;
    const id = select ? parseInt(select.value, 10) : NaN;
    if (Number.isNaN(id)) { closeModal(); return; }
    await this.store.toggleAsistencia(id, 'Manual');
    closeModal();
    toast('Marcado manual registrado');
  }
}
