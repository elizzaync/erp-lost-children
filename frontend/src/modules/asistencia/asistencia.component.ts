/**
 * AsistenciaComponent — módulo "Asistencia" migrado a la nueva arquitectura
 * (Fase 2, módulo 9 de 10 — el más grande y con integración directa al
 * dispositivo Timmy vía yunatt.com).
 *
 * Tres pestañas, igual que el legacy:
 *  - "hoy": lista de asistencia del día, filtros por tipo, contador y
 *    raciones. TIEMPO REAL vía patch(): al recibir 'asistencia:update' del
 *    AppStore (push del WebSocket cuando alguien marca en el Timmy) solo se
 *    repintan #asist-contador/#asist-raciones/#asist-lista — NUNCA toda la
 *    pantalla (mismo requisito que Marcado: "actualización dirigida, no
 *    re-render completo").
 *  - "marcas": historial crudo de zkteco_logs (GET /device/logs) con filtro
 *    por fecha/persona y opción de enlazar una marca sin vincular.
 *  - "timmy": estado del dispositivo, gestión de usuarios en yunatt/Timmy
 *    (enrolamiento con polling en vivo del resultado real) y la zona de
 *    riesgo (reset completo con reautenticación de contraseña).
 *
 * Decisión de alcance: el legacy también exponía UI para conexión ZK
 * DIRECTA (pingTimmyDirect, registrarTodosDirecto, abrirFormUsuarioTimmy,
 * _renderDirectStatus) — se verificó que es código muerto: ninguna de esas
 * funciones se invoca desde ningún botón del árbol de render real, y
 * /timmy/status y /timmy/users (POST) ni siquiera existen en
 * bridge/server.py (confirmado con grep). No se portó.
 *
 * Event delegation vía data-action (click) y data-action (change, para
 * selects/inputs de fecha) — sin onclick/onchange sobre globals. esc() en
 * todo dato de la base de datos o de yunatt.com.
 */
import { Component } from '@core/index';
import type { ApiClient } from '@core/index';
import type { AppStore } from '@store/app-store';
import { AsistenciaRepository } from '@domain/asistencia/asistencia.repository';
import { TimmyRepository } from '@domain/asistencia/timmy.repository';
import type { Asistencia } from '@domain/asistencia/asistencia.types';
import type { DeviceLogRaw, YunattStaffRow, DeviceStaffRow } from '@domain/asistencia/timmy.types';
import type { Persona } from '@domain/personas/personas.types';
import { esc, toast, modal, closeModal } from '@shell/ui';

type Tab = 'hoy' | 'marcas' | 'timmy';

const TIPO_LABEL: Record<string, string> = { nino: 'Niño/a', misionero: 'Misionero', voluntario: 'Voluntario', staff: 'Staff' };
const TIPO_COLOR: Record<string, { bg: string; color: string }> = {
  nino: { bg: 'var(--primary-soft)', color: 'var(--primary-d)' },
  misionero: { bg: '#E8F7F1', color: '#1D7A56' },
  voluntario: { bg: '#EDE7FD', color: '#6B4EEA' },
  staff: { bg: 'var(--line)', color: 'var(--muted)' },
};
const TIPO_COLOR_MARCAS: Record<string, { bg: string; color: string }> = {
  ...TIPO_COLOR,
  padre: { bg: '#FEF3E2', color: '#C47A0A' },
};

interface BridgeInfo {
  conectado: boolean;
  ultimo_log: string | null;
  error: string | null;
  checkeado: boolean;
  marcas_hoy: number;
  sn: string | null;
  modelo: string | null;
}

export class AsistenciaComponent extends Component {
  private tab: Tab = 'hoy';
  private filtroTipo = 'todos';

  // Pestaña "Marcas"
  private marcas: DeviceLogRaw[] = [];
  private marcasFecha = new Date().toISOString().slice(0, 10);
  private marcasCargando = false;
  private marcasPersona = 'todas';
  private marcasTimer: ReturnType<typeof setInterval> | null = null;

  private bridge: BridgeInfo = { conectado: false, ultimo_log: null, error: null, checkeado: false, marcas_hoy: 0, sn: null, modelo: null };
  private autoTimer: ReturnType<typeof setInterval> | null = null;

  // Pestaña "Timmy"
  private usuariosTimmy: YunattStaffRow[] = [];
  private deviceStaff: DeviceStaffRow[] = [];
  private cargandoTimmy = false;
  private enrolandoId: number | null = null;
  private enrollPollToken = 0;

  private bannerTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly asistRepo: AsistenciaRepository;
  private readonly timmyRepo: TimmyRepository;
  private readonly unsubs: Array<() => void> = [];
  private readonly onClick = (e: Event) => this.handleClick(e);
  private readonly onChangeEvt = (e: Event) => this.handleChange(e);

  constructor(private readonly store: AppStore, api: ApiClient) {
    super();
    this.asistRepo = new AsistenciaRepository(api);
    this.timmyRepo = new TimmyRepository(api);
  }

  protected override onMount(): void {
    document.addEventListener('click', this.onClick);
    document.addEventListener('change', this.onChangeEvt);
    this.unsubs.push(this.store.on('asistencia:update', () => this.update()));
    this.unsubs.push(this.store.on<Asistencia[]>('asistencia:nueva', (nuevos) => this.onAsistenciaNueva(nuevos)));
    void this.checkBridge();
    this.autoTimer = setInterval(() => void this.checkBridge(), 300000);
  }

  protected override onUnmount(): void {
    document.removeEventListener('click', this.onClick);
    document.removeEventListener('change', this.onChangeEvt);
    for (const unsub of this.unsubs) unsub();
    this.unsubs.length = 0;
    if (this.autoTimer) clearInterval(this.autoTimer);
    if (this.marcasTimer) clearInterval(this.marcasTimer);
    if (this.bannerTimer) clearTimeout(this.bannerTimer);
  }

  /** Actualización dirigida: SOLO en la pestaña "hoy" (mismo criterio que el
   *  legacy: _refreshHoy() solo se llamaba si _tab === 'hoy'). En las otras
   *  pestañas no hay nada que repintar — esos nodos no están en el DOM. */
  protected override patch(): boolean {
    if (this.tab !== 'hoy') return true;
    this.patchNode('asist-contador', this.contadorHtml());
    this.patchNode('asist-raciones', this.racionesHtml());
    this.patchNode('asist-lista', this.listaHtml());
    return true;
  }

  /* ---------- Delegación de eventos ---------- */
  private handleClick(e: Event): void {
    const target = (e.target as HTMLElement)?.closest<HTMLElement>('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    switch (action) {
      case 'set-tab': { const t = target.dataset.tab as Tab | undefined; if (t) this.setTab(t); break; }
      case 'set-filtro-tipo': { const t = target.dataset.tipo; if (t) this.setFiltroTipo(t); break; }
      case 'toggle-presente': { const id = Number(target.dataset.id); void this.store.toggleAsistencia(id, 'Manual'); break; }
      case 'sincronizar': void this.sincronizar(); break;
      case 'facial': toast('El módulo Marcado facial es una pantalla aparte — todavía no hay navegación directa entre módulos migrados en esta vista previa', 'info'); break;
      case 'cerrar-modal': closeModal(); break;

      case 'marcas-actualizar': void this.cargarMarcas(); break;
      case 'marcas-quitar-filtro': this.setMarcasPersona('todas'); break;
      case 'enlazar-marca': { const zk = target.dataset.zk || ''; this.abrirEnlazarMarca(zk); break; }
      case 'confirmar-enlace': { const zk = target.dataset.zk || ''; void this.confirmarEnlace(zk); break; }
      case 'asignar-persona': { const zk = target.dataset.zk || ''; const nombre = target.dataset.nombre || ''; this.abrirAsignarPersona(zk, nombre); break; }
      case 'confirmar-asignar': { const zk = target.dataset.zk || ''; void this.confirmarAsignarPersona(zk); break; }

      case 'check-bridge': void this.checkBridge(); break;
      case 'reset-completo': this.abrirResetCompleto(); break;
      case 'ejecutar-reset': void this.ejecutarResetCompleto(); break;
      case 'cargar-usuarios-timmy': void this.cargarUsuariosTimmy(); break;
      case 'enrolar-persona': { const id = Number(target.dataset.id); const nombre = target.dataset.nombre || ''; void this.enrolarPersona(id, nombre); break; }
      case 'registrar-biometrico': {
        const sid = target.dataset.sid || ''; const nombre = target.dataset.nombre || ''; const tipo = target.dataset.tipo || 'cara';
        void this.registrarBiometricoTimmy(sid, nombre, tipo);
        break;
      }
      case 'cerrar-enroll-status': { const el = document.getElementById('timmy-enroll-status'); if (el) el.innerHTML = ''; break; }
    }
  }

  private handleChange(e: Event): void {
    const target = (e.target as HTMLElement)?.closest<HTMLElement>('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    if (action === 'marcas-fecha') this.setMarcasFecha((target as HTMLInputElement).value);
    else if (action === 'marcas-persona') this.setMarcasPersona((target as HTMLSelectElement).value);
  }

  /* ---------- RENDER PRINCIPAL ---------- */
  protected render(): string {
    return `
    <div class="page-header">
      <div>
        <h1>Asistencia</h1>
        <p>Jornada de hoy · ${esc(new Date().toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' }))} · Turno mañana</p>
      </div>
      <div style="margin-left:auto;display:flex;gap:8px;">
        <button class="btn btn-outline" data-action="facial">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="11" r="3"/><path d="M5 19a7 7 0 0 1 14 0"/></svg>Facial
        </button>
        <button class="btn btn-primary" id="btn-sync" data-action="sincronizar">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 4v6h6M23 20v-6h-6"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>Actualizar
        </button>
      </div>
    </div>

    <div id="banner-registrado" style="display:none;margin-bottom:10px;"></div>
    <div id="bridge-status-bar">${this.statusBarHtml()}</div>

    <div style="display:flex;gap:4px;margin-bottom:18px;border-bottom:2px solid var(--line);padding-bottom:0;">
      ${(['hoy', 'timmy', 'marcas'] as Tab[]).map((t) => `
        <button data-action="set-tab" data-tab="${t}"
          style="padding:10px 20px;font-size:14px;font-weight:700;font-family:'Quicksand';
                 border:none;cursor:pointer;border-bottom:3px solid ${this.tab === t ? 'var(--primary)' : 'transparent'};
                 background:transparent;color:${this.tab === t ? 'var(--primary)' : 'var(--muted)'};">
          ${t === 'hoy' ? 'Asistencia de hoy' : t === 'timmy' ? 'Dispositivo Timmy' : 'Marcas del dispositivo'}
        </button>`).join('')}
    </div>

    <div id="tab-content">
      ${this.tab === 'hoy' ? this.tabHoyHtml() : this.tab === 'marcas' ? this.tabMarcasHtml() : this.tabTimmyHtml()}
    </div>`;
  }

  /* ══════════════ PESTAÑA 1 — ASISTENCIA DE HOY ══════════════ */
  private calcByTipo(): Record<string, { total: number; presentes: number }> {
    const m: Record<string, { total: number; presentes: number }> = {};
    for (const a of this.store.asistencia) {
      const t = a.tipo || 'nino';
      const d = (m[t] ??= { total: 0, presentes: 0 });
      d.total++;
      if (a.presente) d.presentes++;
    }
    return m;
  }

  private tabHoyHtml(): string {
    const byTipo = this.calcByTipo();
    const presentes = this.store.asistencia.filter((a) => a.presente).length;
    const total = this.store.asistencia.length;

    return `
    <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;align-items:center;">
      ${['todos', 'nino', 'misionero', 'voluntario', 'staff'].map((t) => {
        const activo = this.filtroTipo === t;
        const cfg = TIPO_COLOR[t] || { bg: 'var(--ink)', color: '#fff' };
        const label = t === 'todos' ? 'Todos' : (TIPO_LABEL[t] || t);
        const c = byTipo[t];
        const cnt = t === 'todos' ? `${presentes}/${total}` : c ? `${c.presentes}/${c.total}` : '0/0';
        return `<button data-action="set-filtro-tipo" data-tipo="${t}"
          style="display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:10px;
                 font-size:13px;font-weight:700;cursor:pointer;font-family:'Quicksand';
                 border:2px solid ${activo ? (t === 'todos' ? 'var(--ink)' : cfg.color) : 'var(--border)'};
                 background:${activo ? (t === 'todos' ? 'var(--ink)' : cfg.bg) : 'var(--surface)'};
                 color:${activo ? (t === 'todos' ? '#fff' : cfg.color) : 'var(--muted)'};">
          ${esc(label)}<span style="font-size:11px;opacity:.7;">${cnt}</span>
        </button>`;
      }).join('')}
      <span style="margin-left:auto;font-size:12px;color:var(--muted);">Tap para marcar · desmarcar</span>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1.7fr;gap:16px;">
      <div style="display:flex;flex-direction:column;gap:14px;">
        <div id="asist-contador" class="grad-card">${this.contadorHtml()}</div>
        <div id="asist-raciones" class="kpi-card" style="padding:16px;">${this.racionesHtml()}</div>
      </div>
      <div class="table-card">
        <div style="padding:14px 20px;border-bottom:1px solid var(--line);font-size:15px;font-weight:700;">Lista de asistencia · hoy</div>
        <div style="max-height:520px;overflow-y:auto;" id="asist-lista">${this.listaHtml()}</div>
      </div>
    </div>`;
  }

  private contadorHtml(): string {
    const presentes = this.store.asistencia.filter((a) => a.presente).length;
    const total = this.store.asistencia.length;
    const pct = total ? Math.round((presentes / total) * 100) : 0;
    return `
      <div style="font-size:13px;color:rgba(255,255,255,.6);font-weight:600;">Presentes hoy</div>
      <div style="font-family:'Quicksand';font-weight:800;font-size:46px;letter-spacing:-1.5px;line-height:1.1;margin:6px 0;">
        ${presentes} <span style="font-size:22px;color:rgba(255,255,255,.45);">/ ${total}</span>
      </div>
      <div style="height:8px;background:rgba(255,255,255,.15);border-radius:6px;margin-top:8px;">
        <div style="width:${pct}%;height:100%;background:var(--accent);border-radius:6px;transition:width .4s;"></div>
      </div>
      <div style="font-size:12.5px;color:rgba(255,255,255,.6);margin-top:10px;">
        La cocina prepara <b style="color:#fff;">${presentes} almuerzos</b> hoy.
      </div>`;
  }

  private racionesHtml(): string {
    const byTipo = this.calcByTipo();
    const GRUPOS: Array<{ label: string; tipos: string[]; color: string }> = [
      { label: 'Niños', tipos: ['nino'], color: 'var(--primary)' },
      { label: 'Misioneros', tipos: ['misionero'], color: '#1D7A56' },
      { label: 'Voluntarios', tipos: ['voluntario'], color: '#6B4EEA' },
      { label: 'Staff', tipos: ['staff'], color: 'var(--muted)' },
      { label: 'Adultos (todos)', tipos: ['misionero', 'voluntario', 'staff'], color: 'var(--accent)' },
      { label: 'TOTAL', tipos: ['nino', 'misionero', 'voluntario', 'staff'], color: 'var(--ink)' },
    ];
    const filas = GRUPOS.map((g) => {
      const presentes = g.tipos.reduce((s, t) => s + (byTipo[t]?.presentes || 0), 0);
      const total = g.tipos.reduce((s, t) => s + (byTipo[t]?.total || 0), 0);
      if (total === 0) return '';
      const esSep = g.label === 'TOTAL';
      return `
      <div style="display:flex;align-items:center;gap:10px;padding:${esSep ? '10px 0 2px' : '5px 0'};${esSep ? 'border-top:2px solid var(--line);margin-top:4px;' : ''}">
        <span style="flex:1;font-size:${esSep ? '14px' : '13px'};font-weight:${esSep ? '800' : '600'};color:${esSep ? 'var(--ink)' : 'var(--muted)'};">${esc(g.label)}</span>
        <span style="font-size:${esSep ? '22px' : '16px'};font-weight:800;color:${g.color};min-width:28px;text-align:right;">${presentes}</span>
        <span style="font-size:11.5px;color:var(--faint);min-width:32px;">/ ${total}</span>
      </div>`;
    }).join('');
    return `
      <div style="font-size:11px;font-weight:800;letter-spacing:1px;color:var(--faint);text-transform:uppercase;margin-bottom:10px;">🍽 Raciones del día</div>
      ${filas || '<div style="color:var(--faint);font-size:13px;">Sin personas registradas</div>'}`;
  }

  private avatarHtml(inicial: string, bg: string, fg: string, size = 38, square = true): string {
    const rad = square ? Math.round(size * 0.29) : size / 2;
    return `<div style="width:${size}px;height:${size}px;border-radius:${rad}px;background:${esc(bg)};color:${esc(fg)};
      display:flex;align-items:center;justify-content:center;font-weight:700;font-size:${Math.round(size * 0.37)}px;flex:none;">${esc(inicial)}</div>`;
  }

  private avatarFotoHtml(fotoUrl: string, inicial: string, bg: string, fg: string, size = 38): string {
    if (!fotoUrl) return this.avatarHtml(inicial, bg, fg, size);
    const rad = Math.round(size * 0.29);
    return `<img src="${esc(fotoUrl)}" alt="" style="width:${size}px;height:${size}px;border-radius:${rad}px;object-fit:cover;flex:none;border:1.5px solid var(--line);">`;
  }

  private listaHtml(): string {
    const lista = this.filtroTipo === 'todos'
      ? this.store.asistencia
      : this.store.asistencia.filter((a) => a.sinAsignar || (a.tipo || 'nino') === this.filtroTipo);
    if (!lista.length) return `<div style="padding:40px;text-align:center;color:var(--muted);">No hay personas de este tipo registradas hoy.</div>`;
    return lista.map((a) => {
      if (a.sinAsignar) {
        return `
        <div style="display:flex;align-items:center;gap:13px;padding:11px 20px;border-bottom:1px solid var(--line);background:#FFFBEA;">
          ${this.avatarHtml('?', '#FDF2D5', '#9A6B0A')}
          <div style="flex:1;min-width:0;">
            <div style="font-size:14px;font-weight:600;display:flex;align-items:center;gap:7px;">
              ${esc(a.nombre)}
              <span style="background:#FDF2D5;color:#9A6B0A;font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:20px;white-space:nowrap;">Sin asignar</span>
            </div>
            <div style="font-size:12px;color:var(--faint);">ID ${esc(a.zkUserId)} · ${esc(a.metodo)} · ${esc(a.hora)} · Marcó en el dispositivo pero sin persona en el ERP</div>
          </div>
          <span class="badge badge-warn">Marcó</span>
          <button class="btn btn-sm btn-primary" data-action="asignar-persona" data-zk="${esc(a.zkUserId || '')}" data-nombre="${esc(a.nombre || '')}">
            Asignar persona
          </button>
        </div>`;
      }
      const cfg = TIPO_COLOR[a.tipo] || TIPO_COLOR.staff!;
      return `
      <div style="display:flex;align-items:center;gap:13px;padding:11px 20px;border-bottom:1px solid var(--line);">
        ${this.avatarFotoHtml(a.fotoUrl, a.inicial, a.avatarBg, a.avatarFg)}
        <div style="flex:1;min-width:0;">
          <div style="font-size:14px;font-weight:600;display:flex;align-items:center;gap:7px;">
            ${esc(a.nombre)}
            <span style="background:${cfg.bg};color:${cfg.color};font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:20px;white-space:nowrap;">${esc(TIPO_LABEL[a.tipo] || a.tipo)}</span>
          </div>
          <div style="font-size:12px;color:var(--faint);">ID ${esc(a.personaId)} · ${a.presente ? esc(a.metodo) + ' · ' + esc(a.hora) : 'Sin registrar'}</div>
        </div>
        <span class="badge ${a.presente ? 'badge-success' : 'badge-muted'}">${a.presente ? 'Presente' : 'Ausente'}</span>
        ${a.presente ? '' : `<button class="btn btn-sm btn-primary" data-action="toggle-presente" data-id="${a.id}">✓ Presente</button>`}
      </div>`;
    }).join('');
  }

  /* ══════════════ PESTAÑA 2 — MARCAS DEL DISPOSITIVO ══════════════ */
  private tabMarcasHtml(): string {
    const hoy = new Date().toISOString().slice(0, 10);
    const esHoy = this.marcasFecha === hoy;
    return `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap;">
      <div style="display:flex;align-items:center;gap:8px;">
        <label style="font-size:13px;font-weight:700;color:var(--muted);">Fecha</label>
        <input type="date" value="${this.marcasFecha}" max="${hoy}" data-action="marcas-fecha"
          style="padding:7px 12px;border:1.5px solid var(--border);border-radius:9px;font-size:13px;font-family:'Quicksand';background:var(--surface);color:var(--ink);">
      </div>
      ${!esHoy ? `<button class="btn btn-sm btn-outline" data-action="marcas-fecha" data-value="${hoy}" onclick="this.dispatchEvent(new Event('change'))">Hoy</button>` : ''}
      <div style="display:flex;align-items:center;gap:8px;">
        <label style="font-size:13px;font-weight:700;color:var(--muted);">Persona</label>
        <select data-action="marcas-persona" style="padding:7px 12px;border:1.5px solid var(--border);border-radius:9px;font-size:13px;font-family:'Quicksand';background:var(--surface);color:var(--ink);max-width:220px;">
          <option value="todas" ${this.marcasPersona === 'todas' ? 'selected' : ''}>Todas</option>
          <option value="desconocidos" ${this.marcasPersona === 'desconocidos' ? 'selected' : ''}>Solo sin vincular</option>
          ${this.store.personas.filter((p) => p.estado === 'activo').map((p) =>
            `<option value="${p.id}" ${String(this.marcasPersona) === String(p.id) ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('')}
        </select>
      </div>
      ${this.marcasPersona !== 'todas' ? `<button class="btn btn-sm btn-outline" data-action="marcas-quitar-filtro">✕ Quitar filtro</button>` : ''}
      <button class="btn btn-sm btn-outline" data-action="marcas-actualizar">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M1 4v6h6M23 20v-6h-6"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>
        Actualizar
      </button>
      <span id="marcas-count" style="margin-left:auto;font-size:12px;color:var(--faint);">${this.marcasCargando ? 'Cargando…' : this.contadorMarcasTxt()}</span>
    </div>
    <div class="table-card">
      <div style="display:grid;grid-template-columns:90px 48px 1fr 1fr 120px;padding:10px 18px;border-bottom:1px solid var(--line);gap:12px;font-size:11px;font-weight:800;letter-spacing:.6px;color:var(--faint);text-transform:uppercase;">
        <span>Hora</span><span></span><span>ID dispositivo</span><span>Persona vinculada</span><span></span>
      </div>
      <div id="marcas-list" style="max-height:560px;overflow-y:auto;">${this.marcasListaHtml()}</div>
    </div>`;
  }

  private marcasFiltradas(): DeviceLogRaw[] {
    if (this.marcasPersona === 'todas') return this.marcas;
    if (this.marcasPersona === 'desconocidos') return this.marcas.filter((m) => !m.vinculado);
    return this.marcas.filter((m) => String(m.persona_id) === String(this.marcasPersona) || String(m.zk_user_id) === String(this.marcasPersona));
  }

  private contadorMarcasTxt(): string {
    const n = this.marcasFiltradas().length;
    const extra = this.marcasPersona !== 'todas' ? ` (de ${this.marcas.length})` : '';
    return `${n} marca${n !== 1 ? 's' : ''}${extra}`;
  }

  private marcasListaHtml(): string {
    if (this.marcasCargando) return `<div style="padding:40px;text-align:center;"><div class="spinner" style="margin:0 auto;"></div></div>`;
    const lista = this.marcasFiltradas();
    if (!lista.length) {
      const msg = this.marcas.length ? 'Sin marcas para este filtro en la fecha elegida.' : 'Sin marcas para esta fecha.';
      return `<div style="padding:40px;text-align:center;color:var(--muted);">${esc(msg)}</div>`;
    }
    return lista.map((m) => {
      const hora = m.timestamp ? m.timestamp.slice(11, 16) : '—';
      const esDesconocido = !m.vinculado;
      const cfg = m.persona_tipo ? TIPO_COLOR_MARCAS[m.persona_tipo] : null;
      const avatarHtml = esDesconocido
        ? `<div style="width:36px;height:36px;border-radius:50%;background:#FDF2D5;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:800;color:#9A6B0A;flex:none;">?</div>`
        : this.avatarFotoHtml(m.foto_url || '', m.inicial || '?', m.avatar_bg || 'var(--line)', m.avatar_fg || 'var(--muted)', 36);
      const nombreHtml = esDesconocido
        ? `<span style="color:var(--muted);font-style:italic;">Desconocido</span>`
        : `<span style="font-weight:700;">${esc(m.nombre || '—')}</span>${cfg ? `<span style="background:${cfg.bg};color:${cfg.color};font-size:10px;font-weight:700;padding:2px 7px;border-radius:20px;margin-left:6px;">${esc(m.persona_tipo || '')}</span>` : ''}`;
      const accionHtml = esDesconocido
        ? `<button class="btn btn-sm btn-primary" data-action="enlazar-marca" data-zk="${esc(m.zk_user_id)}">Enlazar persona</button>`
        : `<span style="display:inline-flex;align-items:center;gap:5px;font-size:11.5px;color:#1D7A56;font-weight:700;">
             <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m20 6-11 11-5-5"/></svg>Vinculado
           </span>`;
      const bg = esDesconocido ? 'background:#FFFBEA;' : '';
      return `
      <div style="display:grid;grid-template-columns:90px 48px 1fr 1fr 120px;align-items:center;padding:10px 18px;gap:12px;border-bottom:1px solid var(--line);${bg}">
        <div style="font-size:15px;font-weight:800;color:var(--ink);">${esc(hora)}</div>
        <div>${avatarHtml}</div>
        <div>
          <div style="font-size:13px;font-weight:700;">ID: ${esc(String(m.zk_user_id))}</div>
          <div style="font-size:11px;color:var(--faint);">${esc(m.metodo || 'facial')} · ${esc(m.dispositivo || 'TIMMY')}</div>
        </div>
        <div style="font-size:13px;">${nombreHtml}</div>
        <div style="display:flex;justify-content:flex-end;">${accionHtml}</div>
      </div>`;
    }).join('');
  }

  private async cargarMarcas(): Promise<void> {
    this.marcasCargando = true;
    this.patchMarcas();
    const res = await this.timmyRepo.deviceLogs(this.marcasFecha, 500);
    this.marcas = res?.registros || [];
    this.marcasCargando = false;
    this.patchMarcas();
  }

  private patchMarcas(): void {
    const el = document.getElementById('marcas-list');
    if (el) el.innerHTML = this.marcasListaHtml();
    const cnt = document.getElementById('marcas-count');
    if (cnt) cnt.textContent = this.marcasCargando ? 'Cargando…' : this.contadorMarcasTxt();
  }

  private setMarcasFecha(fecha: string): void {
    this.marcasFecha = fecha;
    const el = document.getElementById('tab-content');
    if (el) el.innerHTML = this.tabMarcasHtml();
    void this.cargarMarcas();
  }

  private setMarcasPersona(valor: string): void {
    this.marcasPersona = valor;
    const el = document.getElementById('tab-content');
    if (el) el.innerHTML = this.tabMarcasHtml();
  }

  private abrirEnlazarMarca(zkUserId: string): void {
    modal(`
      <h2 style="margin-bottom:4px;">Enlazar marca del dispositivo</h2>
      <p style="font-size:13px;color:var(--muted);margin-bottom:16px;">ID en el Timmy: <b>${esc(zkUserId)}</b> · Sin persona vinculada</p>
      <div style="background:#FDF2D5;border-radius:10px;padding:12px;font-size:13px;color:#9A6B0A;margin-bottom:16px;">
        Al enlazar, esta persona quedará marcada como <b>Presente</b> con la hora de la marca.
        Las próximas marcas de este ID se vincularán automáticamente.
      </div>
      <div class="form-group">
        <label>Persona del ERP</label>
        <select id="enlazar-persona" style="font-size:14px;">
          <option value="">— selecciona —</option>
          ${this.store.personas.filter((p) => p.estado === 'activo').map((p) => `<option value="${p.id}">${esc(p.nombre)} (${esc(p.tipo || '')})</option>`).join('')}
        </select>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" data-action="cerrar-modal">Cancelar</button>
        <button class="btn btn-primary" data-action="confirmar-enlace" data-zk="${esc(zkUserId)}">Enlazar y marcar presente</button>
      </div>`, { narrow: true });
  }

  private async confirmarEnlace(zkUserId: string): Promise<void> {
    const sel = document.getElementById('enlazar-persona') as HTMLSelectElement | null;
    const personaId = parseInt(sel?.value || '0', 10);
    if (!personaId) { toast('Selecciona una persona', 'error'); return; }
    const res = await this.asistRepo.asignarZk(zkUserId, personaId);
    if (res && res.ok) {
      closeModal();
      toast('¡Enlazado! La persona quedó marcada como presente.', 'success');
      await this.cargarMarcas();
      void this.store.recargar();
    } else {
      toast(esc((res && res.error) || 'Error al enlazar'), 'error');
    }
  }

  private abrirAsignarPersona(zkUserId: string, nombreTimmy: string): void {
    modal(`
      <h2>Asignar persona a ${esc(nombreTimmy || 'Timmy-' + zkUserId)}</h2>
      <div style="background:#FDF2D5;border-radius:10px;padding:12px;font-size:13px;color:#9A6B0A;margin-bottom:16px;">
        Este usuario marcó en el Timmy (ID: ${esc(zkUserId)}) pero no tiene una persona vinculada en el ERP. Selecciona a quién corresponde.
      </div>
      <div class="form-group">
        <label>Persona del ERP</label>
        <select id="asig-persona" style="font-size:14px;">
          <option value="">— selecciona —</option>
          ${this.store.personas.map((p) => `<option value="${p.id}">${esc(p.nombre)} (${esc(p.tipo || '')})</option>`).join('')}
        </select>
      </div>
      <div style="font-size:12.5px;color:var(--muted);">Al asignar, la persona quedará marcada como <b>Presente</b> con la hora de la marca facial.</div>
      <div class="modal-footer">
        <button class="btn btn-outline" data-action="cerrar-modal">Cancelar</button>
        <button class="btn btn-primary" data-action="confirmar-asignar" data-zk="${esc(zkUserId)}">Asignar y marcar presente</button>
      </div>`, { narrow: true });
  }

  private async confirmarAsignarPersona(zkUserId: string): Promise<void> {
    const sel = document.getElementById('asig-persona') as HTMLSelectElement | null;
    const personaId = parseInt(sel?.value || '0', 10);
    if (!personaId) { toast('Selecciona una persona', 'error'); return; }
    const res = await this.asistRepo.asignarZk(zkUserId, personaId);
    if (res && res.ok) {
      closeModal();
      await this.store.recargar();
      toast('Persona asignada y marcada como presente', 'success');
    } else {
      toast(esc((res && res.error) || 'Error al asignar'), 'error');
    }
  }

  /* ══════════════ PESTAÑA 3 — DISPOSITIVO TIMMY ══════════════ */
  private tabTimmyHtml(): string {
    const info = this.bridge;
    const ultimo = info.ultimo_log
      ? new Date(info.ultimo_log).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
      : '—';
    return `
    <div style="display:grid;grid-template-columns:340px 1fr;gap:16px;align-items:start;">
      <div>
        <div class="kpi-card" style="padding:18px;margin-bottom:14px;">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
            <div style="width:44px;height:44px;border-radius:12px;background:var(--primary-soft);display:flex;align-items:center;justify-content:center;flex:none;">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--primary-d)" stroke-width="1.8"><circle cx="12" cy="11" r="3"/><path d="M5 19a7 7 0 0 1 14 0"/></svg>
            </div>
            <div style="flex:1;min-width:0;">
              <div style="font-size:15px;font-weight:800;">${esc(info.modelo || 'Timmy AiFace')}</div>
              <div style="font-size:12px;color:var(--muted);">TM-AI03F</div>
            </div>
            ${info.conectado
              ? `<span style="display:inline-flex;align-items:center;gap:5px;background:#E8F7F1;color:#1D7A56;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;white-space:nowrap;">
                   <span style="width:6px;height:6px;border-radius:50%;background:#1D7A56;"></span>Online</span>`
              : `<span style="background:#FDE7E1;color:var(--danger);padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;white-space:nowrap;">Offline</span>`}
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12.5px;margin-bottom:12px;">
            <div style="background:var(--bg);border-radius:8px;padding:10px;">
              <div style="color:var(--faint);font-size:11px;margin-bottom:3px;">Nº serie</div>
              <div style="font-weight:700;font-size:12px;">${esc(info.sn || '—')}</div>
            </div>
            <div style="background:var(--bg);border-radius:8px;padding:10px;">
              <div style="color:var(--faint);font-size:11px;margin-bottom:3px;">Marcas hoy</div>
              <div style="font-weight:800;font-size:18px;color:var(--primary);">${info.marcas_hoy || 0}</div>
            </div>
            <div style="background:var(--bg);border-radius:8px;padding:10px;grid-column:span 2;">
              <div style="color:var(--faint);font-size:11px;margin-bottom:3px;">Última marca</div>
              <div style="font-weight:700;font-size:12px;">${esc(ultimo)}</div>
            </div>
          </div>
          <button class="btn btn-sm btn-outline" style="width:100%;" data-action="check-bridge">↺ Actualizar estado</button>
        </div>

        <div class="kpi-card" style="padding:14px;">
          <div style="font-size:13px;font-weight:700;margin-bottom:8px;color:var(--danger);">Zona de riesgo</div>
          <button class="btn btn-sm" style="background:#FDE7E1;color:var(--danger);border:none;border-radius:8px;padding:6px 12px;font-weight:700;cursor:pointer;font-family:'Quicksand';width:100%;" data-action="reset-completo">
            Borrar todos los datos del ERP
          </button>
          <div style="font-size:11.5px;color:var(--faint);margin-top:6px;">Con opción de limpiar también el Timmy y yunatt.</div>
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:14px;">
        <div class="kpi-card" style="padding:18px;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
            <div style="flex:1;">
              <div style="font-size:15px;font-weight:800;">Usuarios activos en yunatt / Timmy</div>
              <div style="font-size:12px;color:var(--muted);">El registro biométrico y la foto se hacen en el propio Timmy. La foto que toma el dispositivo se sincroniza como foto de perfil en el ERP.</div>
            </div>
            <button class="btn btn-sm btn-outline" title="Actualizar y traer fotos del Timmy" data-action="cargar-usuarios-timmy">↺</button>
          </div>
          <div style="display:flex;gap:10px;margin:10px 0 12px;flex-wrap:wrap;">
            <span style="display:inline-flex;align-items:center;gap:5px;font-size:11.5px;color:var(--muted);"><span style="width:10px;height:10px;border-radius:50%;background:#1D7A56;flex:none;"></span>Registrado en el Timmy</span>
            <span style="display:inline-flex;align-items:center;gap:5px;font-size:11.5px;color:var(--muted);"><span style="width:10px;height:10px;border-radius:50%;background:var(--primary-d);flex:none;"></span>En nube, falta registro en el Timmy</span>
            <span style="display:inline-flex;align-items:center;gap:5px;font-size:11.5px;color:var(--muted);"><span style="width:10px;height:10px;border-radius:50%;background:#E8B84B;flex:none;"></span>Sin registrar</span>
          </div>
          <div id="timmy-enroll-status"></div>
          <div id="timmy-users-list">${this.usuariosTimmyHtml()}</div>
        </div>
      </div>
    </div>`;
  }

  private badgesDevice(backupnums: number[] | undefined): string {
    const b = backupnums || [];
    const tiene = { cara: b.includes(50), huella: b.some((n) => n >= 0 && n <= 9), pin: b.includes(10), tarjeta: b.includes(11) };
    return [
      tiene.cara ? `<span style="font-size:10px;background:#E8F7F1;color:#1D7A56;padding:1px 6px;border-radius:4px;font-weight:700;">cara✓</span>` : '',
      tiene.huella ? `<span style="font-size:10px;background:#E8F0FF;color:#5A35B5;padding:1px 6px;border-radius:4px;font-weight:700;">huella✓</span>` : '',
      tiene.pin ? `<span style="font-size:10px;background:#FEF3E2;color:#C47A0A;padding:1px 6px;border-radius:4px;font-weight:700;">PIN✓</span>` : '',
      tiene.tarjeta ? `<span style="font-size:10px;background:#EDE7FD;color:#6B4EEA;padding:1px 6px;border-radius:4px;font-weight:700;">tarjeta✓</span>` : '',
    ].filter(Boolean).join(' ');
  }

  private avatarTimmyHtml(p: Persona | null, nombre: string): string {
    if (p && p.fotoUrl) return this.avatarFotoHtml(`${p.fotoUrl}?t=${Date.now()}`, p.inicial, p.avatarBg, p.avatarFg, 38);
    if (p) return this.avatarHtml(p.inicial || (p.nombre || '?')[0]!, p.avatarBg, p.avatarFg);
    return this.avatarHtml((nombre || '?')[0]!, 'var(--line)', 'var(--muted)');
  }

  private usuariosTimmyHtml(): string {
    if (this.cargandoTimmy) return `<div style="padding:30px;text-align:center;"><div class="spinner" style="margin:0 auto;"></div></div>`;

    const personas = this.store.personas.filter((p) => p.estado === 'activo');
    const yunattPorSN = new Map<string, YunattStaffRow>();
    for (const s of this.usuariosTimmy) yunattPorSN.set(String(s.staffNumber), s);
    const devicePorId = new Map<string, DeviceStaffRow>();
    for (const d of this.deviceStaff) devicePorId.set(String(d.enrollid), d);

    if (!personas.length && !this.usuariosTimmy.length) {
      return `<div style="padding:20px;text-align:center;color:var(--faint);font-size:13px;">Sin personas activas en el ERP ni usuarios en yunatt.</div>`;
    }

    const filaHtml = (p: Persona | null, yRow: YunattStaffRow | undefined, dRow: DeviceStaffRow | undefined): string => {
      const sid = p ? String(p.id) : String(yRow?.staffNumber || '?');
      const nombre = p ? p.nombre : String(yRow?.name || '');
      const enCloud = !!yRow;
      const enDevice = !!dRow;
      const cargando = !!(p && this.enrolandoId === p.id);

      const estado = enDevice
        ? `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;color:#1D7A56;background:#E8F7F1;padding:2px 8px;border-radius:20px;white-space:nowrap;"><span style="width:6px;height:6px;border-radius:50%;background:#1D7A56;"></span>En el Timmy</span>`
        : enCloud
        ? `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;color:var(--primary-d);background:var(--primary-soft);padding:2px 8px;border-radius:20px;white-space:nowrap;"><span style="width:6px;height:6px;border-radius:50%;background:var(--primary-d);"></span>En nube</span>`
        : `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;color:#C47A0A;background:#FEF3E2;padding:2px 8px;border-radius:20px;white-space:nowrap;"><span style="width:6px;height:6px;border-radius:50%;background:#E8B84B;"></span>Sin registrar</span>`;

      const badges = enDevice ? this.badgesDevice(dRow?.backupnums) : '';
      const botones = enCloud
        ? `<button class="btn btn-sm" title="El Timmy activa el registro de cara" style="background:#E8F7F1;color:#1D7A56;border:none;border-radius:7px;padding:5px 9px;font-size:12px;cursor:pointer;font-weight:700;" data-action="registrar-biometrico" data-sid="${esc(sid)}" data-nombre="${esc(nombre)}" data-tipo="cara">😊 Cara</button>
           <button class="btn btn-sm" title="El Timmy activa el registro de huella" style="background:#E8F0FF;color:#5A35B5;border:none;border-radius:7px;padding:5px 9px;font-size:12px;cursor:pointer;font-weight:700;" data-action="registrar-biometrico" data-sid="${esc(sid)}" data-nombre="${esc(nombre)}" data-tipo="huella">👆 Huella</button>`
        : `<button class="btn btn-sm btn-primary" style="font-size:12px;padding:5px 12px;white-space:nowrap;" ${cargando ? 'disabled' : ''} data-action="enrolar-persona" data-id="${p ? p.id : ''}" data-nombre="${esc(nombre)}">
             ${cargando ? 'Enviando…' : 'Enrolar'}
           </button>`;
      const soloYunatt = !p ? `<span style="font-size:10px;color:var(--faint);font-style:italic;">solo en yunatt — sin persona en el ERP</span>` : '';

      return `
      <div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--line);${!p ? 'opacity:.65;' : ''}">
        ${this.avatarTimmyHtml(p, nombre)}
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(nombre)}</div>
          <div style="font-size:11px;color:var(--faint);display:flex;gap:6px;align-items:center;flex-wrap:wrap;">ID ${esc(sid)}${p ? ' · ' + esc(p.tipo || '') : ''} ${badges} ${soloYunatt}</div>
        </div>
        ${estado}
        <div style="display:flex;gap:5px;">${botones}</div>
      </div>`;
    };

    const filasPersonas = personas.map((p) => filaHtml(p, yunattPorSN.get(String(p.id)), devicePorId.get(String(p.id)))).join('');
    const idsERP = new Set(personas.map((p) => String(p.id)));
    const filasExtra = this.usuariosTimmy.filter((s) => !idsERP.has(String(s.staffNumber))).map((s) => filaHtml(null, s, devicePorId.get(String(s.staffNumber)))).join('');
    return filasPersonas + filasExtra;
  }

  private async cargarUsuariosTimmy(): Promise<void> {
    this.cargandoTimmy = true;
    const el = document.getElementById('timmy-users-list');
    if (el) el.innerHTML = this.usuariosTimmyHtml();
    const res = await this.timmyRepo.yunattStaff();
    this.usuariosTimmy = res?.staff || [];
    this.deviceStaff = res?.device || [];
    this.cargandoTimmy = false;
    const el2 = document.getElementById('timmy-users-list');
    if (el2) el2.innerHTML = this.usuariosTimmyHtml();

    // Trae al ERP las fotos que el Timmy haya capturado (en segundo plano)
    const fotos = await this.timmyRepo.yunattSyncFotos();
    if (fotos?.ok && fotos.actualizadas?.length) {
      await this.store.recargar();
      const el3 = document.getElementById('timmy-users-list');
      if (el3) el3.innerHTML = this.usuariosTimmyHtml();
    }
  }

  private async enrolarPersona(personaId: number, nombre: string): Promise<void> {
    this.enrolandoId = personaId;
    const el = document.getElementById('timmy-users-list');
    if (el) el.innerHTML = this.usuariosTimmyHtml();
    try {
      const d = await this.timmyRepo.yunattEnrolar(personaId, 'cara');
      if (d?.ok) {
        toast(d.remote_ok ? `📡 ${esc(nombre)} — el Timmy muestra la pantalla de registro; debe acercarse ahora` : `${esc(nombre)} guardado en yunatt. ${esc(d.aviso || '')}`, d.remote_ok ? 'success' : 'warn');
        if (d.remote_ok) void this.esperarRegistro(String(personaId), nombre, 'cara');
      } else {
        toast(esc((d && d.error) || 'Error al enrolar'), 'error');
        this.setEnrollStatus(this.bannerEnroll('fallo', `No se pudo enrolar a <b>${esc(nombre)}</b>: ${esc((d && d.error) || 'error desconocido')}`, true));
      }
    } finally {
      this.enrolandoId = null;
      await this.cargarUsuariosTimmy();
    }
  }

  private setEnrollStatus(html: string): void {
    const el = document.getElementById('timmy-enroll-status');
    if (el) el.innerHTML = html || '';
  }

  private bannerEnroll(tipo: 'espera' | 'ok' | 'fallo', texto: string, conCerrar: boolean): string {
    const cfg = {
      espera: { bg: '#FFF8E7', borde: '#e8c96a', color: '#9A6B0A', icono: `<div class="spinner" style="width:16px;height:16px;border-width:2px;flex:none;"></div>` },
      ok: { bg: '#E8F7F1', borde: '#b2dfcc', color: '#1D7A56', icono: '<span style="font-size:16px;">✓</span>' },
      fallo: { bg: '#FDE7E1', borde: '#f0b5a8', color: 'var(--danger)', icono: '<span style="font-size:15px;">⚠</span>' },
    }[tipo];
    return `
    <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;margin-bottom:12px;background:${cfg.bg};border:1px solid ${cfg.borde};border-radius:10px;">
      ${cfg.icono}
      <div style="flex:1;font-size:13px;font-weight:600;color:${cfg.color};">${texto}</div>
      ${conCerrar ? `<button class="btn-ghost" style="font-size:12px;color:var(--muted);" data-action="cerrar-enroll-status">✕</button>` : ''}
    </div>`;
  }

  private async esperarRegistro(sid: string, nombre: string, tipo: string): Promise<void> {
    const token = ++this.enrollPollToken;
    const label = tipo === 'huella' ? 'huella' : 'cara';
    const base = await this.timmyRepo.yunattEnrollStatus(sid);
    const baseKey = base ? JSON.stringify([base.backupnums, base.foto]) : null;

    this.setEnrollStatus(this.bannerEnroll('espera', `El Timmy está esperando a <b>${esc(nombre)}</b> para registrar su ${label}… <span style="font-weight:400;opacity:.8;">(este aviso se actualiza solo)</span>`, false));

    const inicio = Date.now();
    while (Date.now() - inicio < 120000) {
      await new Promise((res) => setTimeout(res, 5000));
      if (token !== this.enrollPollToken) return;
      if (!document.getElementById('timmy-enroll-status')) return;

      const st = await this.timmyRepo.yunattEnrollStatus(sid);
      if (!st) continue;
      const tieneBio = tipo === 'huella' ? st.tiene_huella : st.tiene_cara;
      const cambio = baseKey === null ? !!(st.en_dispositivo && tieneBio) : JSON.stringify([st.backupnums, st.foto]) !== baseKey && !!tieneBio;

      if (st.en_dispositivo && cambio) {
        this.setEnrollStatus(this.bannerEnroll('ok', `<b>${esc(nombre)}</b> registró su ${label} en el Timmy correctamente.`, true));
        this.playTono('registrado');
        toast(`✓ ${esc(nombre)} — ${label} registrada en el Timmy`, 'success');
        await this.cargarUsuariosTimmy();
        setTimeout(() => { if (token === this.enrollPollToken) this.setEnrollStatus(''); }, 10000);
        return;
      }
    }
    if (token !== this.enrollPollToken) return;
    this.setEnrollStatus(this.bannerEnroll('fallo', `<b>${esc(nombre)}</b> no completó el registro de ${label} — se canceló en el Timmy o se agotó el tiempo. Puedes reenviar el comando cuando quieras.`, true));
    toast(`Registro de ${esc(nombre)} no completado`, 'warn');
  }

  private async registrarBiometricoTimmy(staffNumber: string, nombre: string, tipo: string): Promise<void> {
    const backup = tipo === 'huella' ? '0' : '50';
    const label = tipo === 'cara' ? 'cara facial' : 'huella digital';
    toast(`Enviando comando de ${label} al Timmy…`, 'info');
    const d = await this.timmyRepo.yunattRemoteAddUserSn(staffNumber, nombre, backup);
    if (d?.ok) {
      toast(`✓ Comando enviado — ${esc(nombre)} debe acercarse al Timmy ahora`, 'success');
      void this.esperarRegistro(staffNumber, nombre, tipo);
    } else {
      toast(esc((d && d.error) || 'Error al enviar comando'), 'error');
      this.setEnrollStatus(this.bannerEnroll('fallo', `No se pudo enviar el comando de ${tipo} para <b>${esc(nombre)}</b>: ${esc((d && d.error) || 'error desconocido')}`, true));
    }
  }

  /* ══════════════ STATUS BAR + SYNC ══════════════ */
  private statusBarHtml(): string {
    if (!this.bridge.checkeado) {
      return `<div style="padding:9px 14px;background:var(--bg);border:1px solid var(--border);border-radius:10px;margin-bottom:14px;font-size:13px;color:var(--faint);">Verificando conexión con Timmy AiFace…</div>`;
    }
    if (this.bridge.conectado) {
      const t = this.bridge.ultimo_log ? new Date(this.bridge.ultimo_log).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) : 'sin marcas';
      return `
      <div style="padding:9px 16px;background:#E8F7F1;border:1px solid #b2dfcc;border-radius:10px;margin-bottom:14px;display:flex;align-items:center;gap:12px;">
        <span style="width:8px;height:8px;border-radius:50%;background:var(--success);flex:none;animation:lc-pulse 2s infinite;"></span>
        <div style="flex:1;font-size:13px;"><b style="color:#1D7A56;">Timmy AiFace en línea</b> <span style="color:var(--muted);">· ${esc(this.bridge.sn || 'ZXQH20002783')} · cloud yunatt.com · Últ. sync: ${esc(t)}</span></div>
        <button class="btn-ghost" style="font-size:12px;color:var(--muted);" data-action="sincronizar">↺ Sync</button>
      </div>`;
    }
    return `
    <div style="padding:9px 16px;background:#FDF2D5;border:1px solid #e8c96a;border-radius:10px;margin-bottom:14px;display:flex;align-items:center;gap:12px;">
      <span style="font-size:16px;">⚠</span>
      <div style="flex:1;font-size:13px;"><b style="color:#9A6B0A;">Timmy AiFace sin conexión</b> <span style="color:var(--muted);">— ${esc(this.bridge.error || 'Verifica que el bridge esté corriendo')}</span></div>
      <button class="btn btn-sm btn-outline" data-action="check-bridge">Reintentar</button>
    </div>`;
  }

  /** Estado del bridge — simplificado respecto al legacy: se quitó el sondeo
   *  previo a /timmy/status (WebSocket directo) porque esa ruta no existe en
   *  el backend (confirmado con grep) y siempre fallaba en silencio antes de
   *  caer a /yunatt/status; acá se llama a yunatt/status directamente, mismo
   *  resultado observable. */
  private async checkBridge(): Promise<void> {
    const d = await this.timmyRepo.yunattStatus();
    if (d) {
      this.bridge = {
        checkeado: true,
        conectado: d.ok === true || d.sesion_activa === true,
        ultimo_log: (d.ultimo_sync as string) || null,
        marcas_hoy: this.store.asistencia.filter((a) => a.presente).length,
        error: d.error || null,
        sn: 'ZXQH20002783',
        modelo: 'TM-AI03F',
      };
    } else {
      this.bridge = { conectado: false, error: 'Sin conexión al dispositivo', checkeado: true, ultimo_log: null, marcas_hoy: 0, sn: null, modelo: null };
    }
    const el = document.getElementById('bridge-status-bar');
    if (el) el.innerHTML = this.statusBarHtml();
    if (this.tab === 'timmy') {
      const tc = document.getElementById('tab-content');
      if (tc) tc.innerHTML = this.tabTimmyHtml();
    }
  }

  /** Sincroniza contra yunatt.com y refresca asistencia — a diferencia del
   *  legacy (que leía /attendance y aplicaba coincidencias manualmente con
   *  DB.toggleAsistencia una por una), acá se reutiliza
   *  AppStore.refrescarAsistencia(), que ya hace exactamente eso (trae
   *  /asistencia/hoy y emite 'asistencia:nueva' para los que pasaron a
   *  presentes) — mismo resultado observable, sin duplicar la lógica de
   *  matching contra un endpoint distinto. */
  private async sincronizar(): Promise<void> {
    const btn = document.getElementById('btn-sync') as HTMLButtonElement | null;
    if (btn) { btn.disabled = true; btn.textContent = 'Actualizando…'; }
    try {
      await this.timmyRepo.yunattSync();
      await this.store.refrescarAsistencia();
      toast('Asistencia actualizada');
    } catch {
      toast('No se pudo actualizar asistencia', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Actualizar'; }
      await this.checkBridge();
    }
  }

  private onAsistenciaNueva(nuevos: Asistencia[] | undefined): void {
    if (!nuevos || !nuevos.length) return;
    this.playTono('registrado');
    this.mostrarBannerRegistrado(nuevos.map((n) => n.nombre));
    if (this.tab === 'marcas') void this.cargarMarcas();
  }

  private mostrarBannerRegistrado(nombres: string[]): void {
    const el = document.getElementById('banner-registrado');
    if (!el) return;
    el.innerHTML = nombres.map((n) => `
      <div style="display:flex;align-items:center;gap:10px;padding:11px 18px;background:linear-gradient(135deg,#1C6678,#2BA876);border-radius:12px;color:#fff;font-size:14px;font-weight:700;margin-bottom:6px;">
        <span style="font-size:20px;">✓</span><span>¡REGISTRADO! &nbsp;${esc(n)}</span>
        <span style="margin-left:auto;font-size:12px;opacity:.7;">${esc(new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }))}</span>
      </div>`).join('');
    el.style.display = 'block';
    if (this.bannerTimer) clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => { el.style.display = 'none'; el.innerHTML = ''; }, 6000);
  }

  /** Tono corto con Web Audio API — sin archivos externos, idéntico al legacy. */
  private playTono(tipo: string): void {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const beep = (freq: number, t0: number, t1: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.35, ctx.currentTime + t0);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t1);
        osc.start(ctx.currentTime + t0);
        osc.stop(ctx.currentTime + t1);
      };
      if (tipo === 'registrado') { beep(523, 0, 0.12); beep(784, 0.13, 0.38); }
      else beep(660, 0, 0.3);
    } catch { /* audio no disponible — no bloquea el flujo */ }
  }

  /* ══════════════ RESET COMPLETO ══════════════
     Sin guardia de rol en el cliente — igual que el legacy, que tampoco la
     tenía: la protección real es server-side (_require_admin() + reautenticación
     de contraseña en POST /db/reset), no un check de UI que solo se puede saltar. */
  private abrirResetCompleto(): void {
    modal(`
      <h2 style="color:var(--danger);">⚠ Reset completo</h2>
      <div style="background:#FDE7E1;border-radius:10px;padding:14px;margin-bottom:14px;font-size:13.5px;color:var(--danger);">
        <b>Esta acción es irreversible.</b><br>Se borrarán permanentemente:
        <ul style="margin:8px 0 0 16px;line-height:1.8;">
          <li>Todas las personas del ERP (los logins del sistema se conservan)</li>
          <li>Historial de asistencia, gastos, entregas, almacén</li>
          <li>Logs de asistencia del Timmy en la base de datos</li>
          <li>Fotos de perfil sincronizadas</li>
        </ul>
      </div>
      <label style="display:flex;align-items:flex-start;gap:10px;padding:12px;border-radius:10px;border:2px solid var(--danger);cursor:pointer;margin-bottom:14px;background:#FFF5F3;">
        <input type="checkbox" id="reset-timmy" checked style="margin-top:3px;width:16px;height:16px;">
        <div>
          <div style="font-size:13px;font-weight:700;color:var(--danger);">Borrar también del Timmy y de yunatt</div>
          <div style="font-size:11.5px;color:var(--muted);margin-top:2px;">Elimina los usuarios (caras, huellas) del dispositivo con comando remoto y el staff de yunatt.com. La cuenta admin de yunatt se conserva. Si lo desmarcas, el Timmy queda intacto.</div>
        </div>
      </label>
      <div class="form-group"><label>Escribe <b>CONFIRMAR</b> para continuar</label><input type="text" id="reset-confirm" placeholder="CONFIRMAR" style="font-size:15px;"></div>
      <div class="form-group"><label>Tu contraseña (reautenticación obligatoria)</label><input type="password" id="reset-password" placeholder="Contraseña de tu cuenta" style="font-size:15px;" autocomplete="current-password"></div>
      <div class="modal-footer">
        <button class="btn btn-outline" data-action="cerrar-modal">Cancelar</button>
        <button class="btn" id="btn-reset-ejecutar" style="background:var(--danger);color:#fff;" data-action="ejecutar-reset">Borrar todo y empezar desde cero</button>
      </div>`, { narrow: true });
  }

  private async ejecutarResetCompleto(): Promise<void> {
    const val = (document.getElementById('reset-confirm') as HTMLInputElement | null)?.value?.trim();
    if (val !== 'CONFIRMAR') { toast('Escribe CONFIRMAR para continuar', 'error'); return; }
    const password = (document.getElementById('reset-password') as HTMLInputElement | null)?.value || '';
    if (!password) { toast('Ingresa tu contraseña para confirmar', 'error'); return; }
    const limpiarTimmy = (document.getElementById('reset-timmy') as HTMLInputElement | null)?.checked === true;
    const btn = document.getElementById('btn-reset-ejecutar') as HTMLButtonElement | null;
    if (btn) { btn.disabled = true; btn.textContent = limpiarTimmy ? 'Limpiando ERP + Timmy…' : 'Limpiando ERP…'; }
    toast(limpiarTimmy ? 'Limpiando ERP, Timmy y yunatt…' : 'Limpiando base de datos…', 'info');
    const d = await this.timmyRepo.dbReset(password, limpiarTimmy);
    if (d?.ok) {
      closeModal();
      const t = d.timmy;
      if (limpiarTimmy && t) {
        if (t.ok) toast(`✓ ERP limpio + ${t.cloud ?? 0} usuario${(t.cloud || 0) !== 1 ? 's' : ''} borrado${(t.cloud || 0) !== 1 ? 's' : ''} del Timmy/yunatt.`, 'success');
        else toast(`ERP limpio, pero hubo un problema con el Timmy/yunatt: ${esc((t.errores || [t.error]).filter(Boolean).join('; ') || 'error desconocido')}`, 'warn');
      } else {
        toast('Base de datos limpiada. ERP listo para comenzar.', 'success');
      }
      await this.store.recargar();
    } else {
      toast(`Error al limpiar: ${esc((d && d.error) || 'error desconocido')}`, 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Borrar todo y empezar desde cero'; }
    }
  }

  /* ══════════════ CAMBIO DE PESTAÑA / FILTRO ══════════════ */
  private setTab(t: Tab): void {
    this.tab = t;
    if (t !== 'marcas' && this.marcasTimer) { clearInterval(this.marcasTimer); this.marcasTimer = null; }

    const el = document.getElementById('tab-content');
    if (el) el.innerHTML = t === 'hoy' ? this.tabHoyHtml() : t === 'marcas' ? this.tabMarcasHtml() : this.tabTimmyHtml();

    if (t === 'timmy') void this.cargarUsuariosTimmy();
    if (t === 'marcas') {
      void this.cargarMarcas();
      if (!this.marcasTimer) this.marcasTimer = setInterval(() => { if (this.tab === 'marcas') void this.cargarMarcas(); }, 60000);
    }

    document.querySelectorAll<HTMLElement>('[data-action="set-tab"]').forEach((b) => {
      const activo = b.dataset.tab === t;
      b.style.borderBottom = `3px solid ${activo ? 'var(--primary)' : 'transparent'}`;
      b.style.color = activo ? 'var(--primary)' : 'var(--muted)';
    });
  }

  private setFiltroTipo(t: string): void {
    this.filtroTipo = t;
    const el = document.getElementById('tab-content');
    if (el) el.innerHTML = this.tabHoyHtml();
  }
}
