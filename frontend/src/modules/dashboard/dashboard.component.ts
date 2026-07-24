/**
 * DashboardComponent — "Panel de impacto" migrado a la nueva arquitectura
 * (Fase 2, módulo 10 de 10 — el último y más complejo, tal como marca el
 * plan de migración).
 *
 * Requisito explícito del usuario para este módulo: "que se sume
 * automáticamente sin recargar las tarjetas" — implementado con patch() por
 * tarjeta. Cada una de las 13 tarjetas vive en su propio nodo con id fijo;
 * al llegar un evento del AppStore, patch() recalcula y reemplaza SOLO las
 * tarjetas que dependen de esa fuente de datos, nunca la página completa.
 * Es la misma técnica de Marcado/Asistencia, aplicada aquí a bastantes más
 * nodos porque el dashboard combina las ~8 fuentes del store en una sola
 * pantalla.
 *
 * Mapa evento del store -> tarjetas que dependen de él (ver onMount):
 *   personas      -> Personas, Alertas (persona en alerta / sin enrolar)
 *   asistencia    -> Asistencia hoy (KPI), Asistencia por tipo
 *   alimentacion  -> Raciones servidas (KPI), Raciones por servicio (gráfico)
 *   entregas      -> Entregas realizadas (KPI), Últimas entregas
 *   almacen       -> Almacén, Alertas (artículos críticos)
 *   gastos        -> Egresos por categoría
 *   fondos        -> Balance fondos (KPI), Fondos (ingresos/egresos + últimos)
 *   actividad     -> Actividad reciente
 *
 * Event delegation vía data-action (click) — sin onclick sobre globals.
 * esc() en todo dato que viene de la base de datos.
 */
import { Component } from '@core/index';
import type { AppStore } from '@store/app-store';
import type { Alerta } from '@store/store-types';
import { esc } from '@shell/ui';

type Change = 'personas' | 'asistencia' | 'alimentacion' | 'entregas' | 'almacen' | 'gastos' | 'fondos' | 'actividad';

const TIPO_LABEL: Record<string, string> = { nino: 'Niños', padre: 'Padres', misionero: 'Misioneros', voluntario: 'Voluntarios', staff: 'Staff' };
const TIPO_COL: Record<string, string> = { nino: '#1a7a9e', padre: '#6B4EEA', misionero: '#1D7A56', voluntario: '#C24A30', staff: '#9A6B0A' };
const CAT_COLS = ['#1a7a9e', '#6B4EEA', '#1D7A56', '#9A6B0A', '#C24A30'];
const MESES = ['', 'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Mapa evento del store -> ids de tarjeta que dependen de esa fuente. */
const AFECTA: Record<Change, string[]> = {
  personas: ['dash-personas', 'dash-alertas'],
  asistencia: ['dash-asistencia-kpi', 'dash-asistencia-tipo'],
  alimentacion: ['dash-raciones-kpi', 'dash-raciones-chart'],
  entregas: ['dash-entregas-kpi', 'dash-entregas-recientes'],
  almacen: ['dash-almacen', 'dash-alertas'],
  gastos: ['dash-gastos-cat'],
  fondos: ['dash-balance-kpi', 'dash-fondos'],
  actividad: ['dash-actividad'],
};

export class DashboardComponent extends Component<Change> {
  private readonly unsubs: Array<() => void> = [];
  private readonly onClick = (e: Event) => this.handleClick(e);
  private refrescando = false;

  constructor(
    private readonly store: AppStore,
    private readonly navigateTo: (name: string) => void,
  ) {
    super();
  }

  protected override onMount(): void {
    document.addEventListener('click', this.onClick);
    this.unsubs.push(this.store.on('personas:update', () => this.update('personas')));
    this.unsubs.push(this.store.on('asistencia:update', () => this.update('asistencia')));
    this.unsubs.push(this.store.on('alimentacion:update', () => this.update('alimentacion')));
    this.unsubs.push(this.store.on('entregas:update', () => this.update('entregas')));
    this.unsubs.push(this.store.on('almacen:update', () => this.update('almacen')));
    this.unsubs.push(this.store.on('gastos:update', () => this.update('gastos')));
    this.unsubs.push(this.store.on('fondos:update', () => this.update('fondos')));
    // El bus interno del store re-emite 'actividad:add' como 'actividad:update'
    // (ver AppStore constructor) — es ese el evento al que hay que suscribirse.
    this.unsubs.push(this.store.on('actividad:update', () => this.update('actividad')));

    if (!this.refrescando) {
      this.refrescando = true;
      void this.store.recargar().finally(() => { this.refrescando = false; });
    }
  }

  protected override onUnmount(): void {
    document.removeEventListener('click', this.onClick);
    for (const unsub of this.unsubs) unsub();
    this.unsubs.length = 0;
  }

  /** Actualización dirigida: solo las tarjetas que dependen de las fuentes
   *  que cambiaron en esta ráfaga — nunca la página completa. */
  protected override patch(changed: ReadonlySet<Change>): boolean {
    const ids = new Set<string>();
    for (const c of changed) for (const id of AFECTA[c]) ids.add(id);
    for (const id of ids) {
      const html = this.cardHtml(id);
      if (html !== null) this.patchNode(id, html);
    }
    return true;
  }

  private cardHtml(id: string): string | null {
    switch (id) {
      case 'dash-personas': return this.personasCardInner();
      case 'dash-asistencia-kpi': return this.asistenciaKpiInner();
      case 'dash-raciones-kpi': return this.racionesKpiInner();
      case 'dash-entregas-kpi': return this.entregasKpiInner();
      case 'dash-balance-kpi': return this.balanceKpiInner();
      case 'dash-raciones-chart': return this.racionesChartInner();
      case 'dash-asistencia-tipo': return this.asistenciaTipoInner();
      case 'dash-gastos-cat': return this.gastosCatInner();
      case 'dash-almacen': return this.almacenInner();
      case 'dash-fondos': return this.fondosInner();
      case 'dash-entregas-recientes': return this.entregasRecientesInner();
      case 'dash-alertas': return this.alertasInner();
      case 'dash-actividad': return this.actividadInner();
      default: return null;
    }
  }

  /* ---------- Delegación de eventos ---------- */
  private handleClick(e: Event): void {
    const target = (e.target as HTMLElement)?.closest<HTMLElement>('[data-action]');
    if (!target) return;
    if (target.dataset.action === 'nav') {
      const to = target.dataset.to;
      if (to) this.navigateTo(to);
    }
  }

  /* ---------- helpers visuales ---------- */
  private bar(pct: number, color: string, h = 8): string {
    const p = Math.min(100, Math.max(0, pct || 0));
    return `<div style="height:${h}px;background:var(--line);border-radius:99px;overflow:hidden;"><div style="height:100%;width:${p}%;background:${color};border-radius:99px;"></div></div>`;
  }

  private s(n: number): string {
    return Number(n || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  private si(n: number): string {
    return Number(n || 0).toLocaleString('es-PE');
  }

  private navBtn(mod: string, label: string): string {
    return `<button class="btn-ghost" style="font-size:11.5px;padding:4px 0;color:var(--primary);font-weight:700;" data-action="nav" data-to="${mod}">${esc(label)} →</button>`;
  }

  /* ---------- RENDER PRINCIPAL ---------- */
  protected render(): string {
    let hoyStr = new Date().toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });
    hoyStr = hoyStr.charAt(0).toUpperCase() + hoyStr.slice(1);

    return `
    <div class="page-header">
      <div><h1>Panel de impacto</h1><p style="color:var(--muted);">${esc(hoyStr)} · datos conectados en tiempo real</p></div>
      <div style="margin-left:auto;display:flex;gap:8px;">
        <button class="btn btn-outline" data-action="nav" data-to="reportes">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> Reportes
        </button>
      </div>
    </div>

    <div class="dash-r5">
      <div class="kpi-card" style="cursor:pointer;" data-action="nav" data-to="personas" id="dash-personas">${this.personasCardInner()}</div>
      <div class="kpi-card" style="cursor:pointer;" data-action="nav" data-to="asistencia" id="dash-asistencia-kpi">${this.asistenciaKpiInner()}</div>
      <div class="kpi-card" style="cursor:pointer;" data-action="nav" data-to="alimentacion" id="dash-raciones-kpi">${this.racionesKpiInner()}</div>
      <div class="kpi-card" style="cursor:pointer;" data-action="nav" data-to="entregas" id="dash-entregas-kpi">${this.entregasKpiInner()}</div>
      <div class="kpi-card" style="cursor:pointer;" data-action="nav" data-to="gastos" id="dash-balance-kpi">${this.balanceKpiInner()}</div>
    </div>

    <div class="dash-r2l">
      <div class="kpi-card" id="dash-raciones-chart">${this.racionesChartInner()}</div>
      <div class="kpi-card" id="dash-asistencia-tipo">${this.asistenciaTipoInner()}</div>
    </div>

    <div class="dash-r3">
      <div class="kpi-card" id="dash-gastos-cat">${this.gastosCatInner()}</div>
      <div class="kpi-card" id="dash-almacen">${this.almacenInner()}</div>
      <div class="kpi-card" id="dash-fondos">${this.fondosInner()}</div>
    </div>

    <div class="dash-r3">
      <div class="kpi-card" id="dash-entregas-recientes">${this.entregasRecientesInner()}</div>
      <div class="kpi-card" id="dash-alertas">${this.alertasInner()}</div>
      <div class="kpi-card" id="dash-actividad">${this.actividadInner()}</div>
    </div>`;
  }

  /* ---------- Tarjeta: Personas ---------- */
  private personasCardInner(): string {
    const personas = this.store.personas;
    const pTipos: Record<string, number> = { nino: 0, padre: 0, misionero: 0, voluntario: 0, staff: 0 };
    for (const p of personas) if (pTipos[p.tipo] !== undefined) pTipos[p.tipo]++;
    return `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <span class="label">Personas</span>
        <div style="width:32px;height:32px;background:#E0F0FF;border-radius:9px;display:flex;align-items:center;justify-content:center;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#015a9e" stroke-width="2"><circle cx="9" cy="7" r="3"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/><circle cx="19" cy="7" r="2"/><path d="M23 21v-1a3 3 0 0 0-2-2.8"/></svg>
        </div>
      </div>
      <div class="value" style="font-size:34px;">${personas.length}</div>
      <div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:4px;">
        ${Object.entries(pTipos).filter(([, n]) => n > 0).map(([t, n]) =>
          `<span style="font-size:10.5px;background:${TIPO_COL[t]}18;color:${TIPO_COL[t]};border-radius:20px;padding:2px 7px;font-weight:700;">${n} ${esc(TIPO_LABEL[t] || t)}</span>`).join('')}
      </div>`;
  }

  /* ---------- Tarjeta: Asistencia hoy (KPI) ---------- */
  private asistenciaKpiInner(): string {
    const asist = this.store.asistencia;
    const presentes = asist.filter((a) => a.presente).length;
    const total = asist.length;
    const pct = total ? Math.round((presentes / total) * 100) : 0;
    const color = pct >= 75 ? '#1D7A56' : pct >= 50 ? '#9A6B0A' : '#C24A30';
    return `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <span class="label">Asistencia hoy</span>
        <span style="font-size:11px;font-weight:800;background:${pct >= 75 ? '#E8F7F1' : pct >= 50 ? '#FDF2D5' : '#FDE7E1'};color:${color};border-radius:20px;padding:3px 9px;">${pct}%</span>
      </div>
      <div class="value" style="font-size:34px;color:${color};">${presentes}<span style="font-size:16px;font-weight:400;color:var(--muted);"> / ${total}</span></div>
      ${this.bar(pct, color, 6)}
      <div class="sub" style="margin-top:6px;color:var(--muted);">${total - presentes} ausentes</div>`;
  }

  /* ---------- Tarjeta: Raciones servidas (KPI) ---------- */
  private racionesKpiInner(): string {
    const svcs = this.store.serviciosAlimentacion;
    const totalRaciones = svcs.reduce((s, x) => s + (x.total || 0), 0);
    const costos = svcs.filter((s) => s.costoPlato > 0);
    const avgCosto = costos.length ? costos.reduce((s, x) => s + x.costoPlato, 0) / costos.length : 0;
    return `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <span class="label">Raciones servidas</span>
        <div style="width:32px;height:32px;background:#FDF2D5;border-radius:9px;display:flex;align-items:center;justify-content:center;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9A6B0A" stroke-width="2"><path d="M5 3v7a2.5 2.5 0 0 0 5 0V3M7.5 10v11M17 3c-1.7 0-3 2.2-3 5s1.3 4 3 4v9"/></svg>
        </div>
      </div>
      <div class="value" style="font-size:34px;">${this.si(totalRaciones)}</div>
      <div class="sub" style="color:var(--muted);">${svcs.length} servicios · ${avgCosto > 0 ? `S/ ${avgCosto.toFixed(2)}/plato` : 'sin costo registrado'}</div>`;
  }

  /* ---------- Tarjeta: Entregas realizadas (KPI) ---------- */
  private entregasKpiInner(): string {
    const entregas = this.store.entregas;
    const entPorTipo: Record<string, number> = {};
    for (const e of entregas) { const t = e.personaTipo || 'nino'; entPorTipo[t] = (entPorTipo[t] || 0) + 1; }
    return `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <span class="label">Entregas realizadas</span>
        <div style="width:32px;height:32px;background:#EDE7FD;border-radius:9px;display:flex;align-items:center;justify-content:center;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6B4EEA" stroke-width="2"><path d="M20 12v8H4v-8M2.5 7h19v5h-19zM12 22V7"/></svg>
        </div>
      </div>
      <div class="value" style="font-size:34px;">${entregas.length}</div>
      <div class="sub" style="color:var(--muted);">${Object.keys(entPorTipo).length} tipos de beneficiario</div>`;
  }

  /* ---------- Tarjeta: Balance fondos (KPI) ---------- */
  private balanceKpiInner(): string {
    const fondos = this.store.fondos;
    const balance = fondos.balance || 0;
    const balPos = balance >= 0;
    const balColor = balPos ? '#1D7A56' : '#C24A30';
    return `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <span class="label" style="color:${balColor};">Balance fondos</span>
        <span style="font-size:10px;font-weight:800;color:${balColor};opacity:.7;">${balPos ? '▲ POSITIVO' : '▼ NEGATIVO'}</span>
      </div>
      <div class="value" style="font-size:28px;color:${balColor};">S/ ${this.s(Math.abs(balance))}</div>
      <div style="display:flex;justify-content:space-between;font-size:11px;margin-top:6px;">
        <span style="color:#1D7A56;font-weight:700;">▲ S/ ${this.s(fondos.ingresos || 0)}</span>
        <span style="color:#C24A30;font-weight:700;">▼ S/ ${this.s(fondos.egresos || 0)}</span>
      </div>`;
  }

  /* ---------- Tarjeta: Raciones por servicio (gráfico) ---------- */
  private racionesChartInner(): string {
    const svcsRecientes = this.store.serviciosAlimentacion.slice(0, 8).reverse();
    const maxRac = svcsRecientes.length ? Math.max(...svcsRecientes.map((s) => s.total || 0)) : 1;
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;">
        <div style="font-weight:800;font-size:15px;">Raciones por servicio <span style="font-size:12px;font-weight:400;color:var(--muted);">últimos ${svcsRecientes.length} servicios</span></div>
        ${this.navBtn('alimentacion', 'Ver todos')}
      </div>
      ${svcsRecientes.length ? `
      <div style="display:flex;align-items:flex-end;gap:8px;height:140px;">
        ${svcsRecientes.map((s) => {
          const h = maxRac ? Math.round(((s.total || 0) / maxRac) * 120) : 4;
          const mes = (s.fecha || '').slice(5, 7);
          const dia = (s.fecha || '').slice(8, 10);
          const label = `${dia} ${MESES[parseInt(mes, 10)] || ''}`;
          return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;">
            <div style="font-size:10px;font-weight:700;color:var(--primary);">${s.total}</div>
            <div style="width:100%;height:${h || 4}px;background:var(--primary);border-radius:5px 5px 0 0;min-height:4px;opacity:.85;"></div>
            <div style="font-size:9.5px;color:var(--muted);text-align:center;line-height:1.2;">${esc(label)}</div>
          </div>`;
        }).join('')}
      </div>` : `<div style="height:140px;display:flex;align-items:center;justify-content:center;color:var(--faint);font-size:13px;">Sin servicios registrados</div>`}`;
  }

  /* ---------- Tarjeta: Asistencia por tipo ---------- */
  private asistenciaTipoInner(): string {
    const asisTipos: Record<string, { total: number; presentes: number }> = {};
    for (const a of this.store.asistencia) {
      const d = (asisTipos[a.tipo] ??= { total: 0, presentes: 0 });
      d.total++;
      if (a.presente) d.presentes++;
    }
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <div style="font-weight:800;font-size:15px;">Asistencia hoy</div>
        ${this.navBtn('asistencia', 'Ver detalle')}
      </div>
      ${Object.keys(asisTipos).length ? `
      <div style="display:flex;flex-direction:column;gap:12px;">
        ${Object.entries(asisTipos).map(([tipo, d]) => {
          const pct = Math.round((d.presentes / d.total) * 100);
          const col = TIPO_COL[tipo] || '#888';
          return `<div>
            <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:4px;">
              <span style="font-weight:700;">${esc(TIPO_LABEL[tipo] || tipo)}</span>
              <span style="color:${col};font-weight:800;">${d.presentes}/${d.total} · ${pct}%</span>
            </div>
            ${this.bar(pct, col, 8)}
          </div>`;
        }).join('')}
      </div>` : `<div style="color:var(--faint);font-size:13px;">Sin datos de asistencia hoy</div>`}`;
  }

  /* ---------- Tarjeta: Egresos por categoría ---------- */
  private gastosCatInner(): string {
    const gastos = this.store.gastos;
    const totalGasto = gastos.reduce((s, g) => s + g.monto, 0);
    const gastosCat: Record<string, number> = {};
    for (const g of gastos) gastosCat[g.categoria] = (gastosCat[g.categoria] || 0) + g.monto;
    const catEntries = Object.entries(gastosCat).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const maxCat = catEntries[0] ? catEntries[0][1] : 1;
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <div style="font-weight:800;font-size:15px;">Egresos por categoría</div>
        ${this.navBtn('gastos', 'Ver gastos')}
      </div>
      ${catEntries.length ? `
      <div style="display:flex;flex-direction:column;gap:11px;">
        ${catEntries.map(([cat, val], i) => {
          const pct = Math.round((val / maxCat) * 100);
          const c = CAT_COLS[i % CAT_COLS.length];
          return `<div>
            <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:4px;">
              <span style="font-weight:600;">${esc(cat)}</span>
              <span style="font-weight:800;color:${c};">S/ ${this.s(val)}</span>
            </div>
            ${this.bar(pct, c!, 7)}
          </div>`;
        }).join('')}
        <div style="padding-top:8px;border-top:1px solid var(--line);display:flex;justify-content:space-between;font-size:12.5px;">
          <span style="font-weight:700;color:var(--muted);">Total egresos</span>
          <span style="font-weight:800;">S/ ${this.s(totalGasto)}</span>
        </div>
      </div>` : `<div style="color:var(--faint);font-size:13px;">Sin gastos registrados</div>`}`;
  }

  /* ---------- Tarjeta: Almacén ---------- */
  private almacenInner(): string {
    const arts = this.store.articulos;
    const criticos = arts.filter((a) => a.stock < a.minimo);
    const stockVal = arts.reduce((s, a) => s + a.stock * (a.precio || 0), 0);
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
        <div style="font-weight:800;font-size:15px;">Almacén</div>
        ${this.navBtn('almacen', 'Ver inventario')}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;">
        <div style="background:var(--bg);border-radius:10px;padding:10px 12px;text-align:center;">
          <div style="font-size:22px;font-weight:800;">${arts.length}</div>
          <div style="font-size:10.5px;color:var(--muted);font-weight:700;">artículos</div>
        </div>
        <div style="background:${criticos.length ? '#FDE7E1' : '#E8F7F1'};border-radius:10px;padding:10px 12px;text-align:center;">
          <div style="font-size:22px;font-weight:800;color:${criticos.length ? '#C24A30' : '#1D7A56'};">${criticos.length}</div>
          <div style="font-size:10.5px;color:var(--muted);font-weight:700;">críticos</div>
        </div>
      </div>
      ${criticos.length ? `
        <div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:6px;">REQUIEREN REPOSICIÓN</div>
        ${criticos.slice(0, 4).map((a) => {
          const pct = Math.round((a.stock / Math.max(a.minimo, 1)) * 100);
          return `<div style="margin-bottom:8px;">
            <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px;">
              <span style="font-weight:600;">${esc(a.nombre)}</span>
              <span style="color:#C24A30;font-weight:700;">${a.stock}/${a.minimo} ${esc(a.unidad)}</span>
            </div>${this.bar(pct, '#C24A30', 5)}</div>`;
        }).join('')}
        ${criticos.length > 4 ? `<div style="font-size:11.5px;color:var(--muted);">+${criticos.length - 4} más →</div>` : ''}
      ` : `<div style="color:var(--success);font-weight:700;font-size:13px;">✓ Todo el stock en niveles normales</div>
        ${stockVal > 0 ? `<div style="font-size:12px;color:var(--muted);margin-top:8px;">Valor estimado: S/ ${this.s(stockVal)}</div>` : ''}`}`;
  }

  /* ---------- Tarjeta: Fondos ---------- */
  private fondosInner(): string {
    const fondos = this.store.fondos;
    const ingresos = fondos.ingresos || 0;
    const egresos = fondos.egresos || 0;
    const ingPct = ingresos ? Math.min(100, Math.round((ingresos / (ingresos + egresos || 1)) * 100)) : 0;
    const egPct = 100 - ingPct;
    const ultimosIngresos = (fondos.movimientos || []).filter((m) => m.tipo === 'ingreso').slice(0, 3);
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
        <div style="font-weight:800;font-size:15px;">Fondos</div>
        ${this.navBtn('gastos', 'Ver detalle')}
      </div>
      <div style="margin-bottom:14px;">
        <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:700;color:var(--muted);margin-bottom:5px;">
          <span>Ingresos vs Egresos</span>
          <span>${ingresos + egresos > 0 ? `${Math.round((egresos / (ingresos || 1)) * 100)}% ejecutado` : '—'}</span>
        </div>
        <div style="height:10px;background:var(--line);border-radius:99px;overflow:hidden;">
          <div style="height:100%;display:flex;">
            ${ingresos + egresos > 0
              ? `<div style="flex:${ingPct};background:#1D7A56;"></div><div style="flex:${egPct};background:#C24A30;"></div>`
              : `<div style="width:100%;background:var(--line);"></div>`}
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;margin-top:4px;">
          <span style="color:#1D7A56;font-weight:700;">▲ S/ ${this.s(ingresos)}</span>
          <span style="color:#C24A30;font-weight:700;">▼ S/ ${this.s(egresos)}</span>
        </div>
      </div>
      <div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:7px;">ÚLTIMOS INGRESOS</div>
      ${ultimosIngresos.length ? ultimosIngresos.map((m) => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--line);">
          <div><div style="font-size:12px;font-weight:600;">${esc(m.descripcion || m.categoria || 'Ingreso')}</div>
          <div style="font-size:11px;color:var(--muted);">${esc(m.fecha)}</div></div>
          <span style="font-size:13px;font-weight:800;color:#1D7A56;">+S/ ${this.s(m.monto)}</span>
        </div>`).join('') : `<div style="font-size:12.5px;color:var(--faint);">Sin ingresos registrados</div>`}`;
  }

  /* ---------- Tarjeta: Últimas entregas ---------- */
  private entregasRecientesInner(): string {
    const entRecientes = this.store.entregas.slice(0, 6);
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
        <div style="font-weight:800;font-size:15px;">Últimas entregas</div>
        ${this.navBtn('entregas', 'Ver todas')}
      </div>
      ${entRecientes.length ? entRecientes.map((e) => {
        const col = TIPO_COL[e.personaTipo || 'nino'] || '#1a7a9e';
        return `<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--line);">
          <div style="width:30px;height:30px;border-radius:50%;background:${col}18;display:flex;align-items:center;justify-content:center;flex:none;">
            <span style="font-size:13px;font-weight:800;color:${col};">${esc((e.nino || '').charAt(0))}</span></div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:12.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(e.nino)}</div>
            <div style="font-size:11.5px;color:var(--muted);">${esc(e.articulo)} · x${e.cantidad}</div>
          </div>
          <div style="font-size:11px;color:var(--faint);flex:none;">${esc(e.fecha)}</div>
        </div>`;
      }).join('') : `<div style="color:var(--faint);font-size:13px;">Sin entregas registradas</div>`}`;
  }

  /* ---------- Tarjeta: Alertas activas ---------- */
  private alertasInner(): string {
    const alertas: Alerta[] = this.store.getAlertasActivas();
    const bgMap: Record<string, string> = { danger: '#FDE7E1', warn: '#FDF2D5', primary: 'var(--primary-soft)' };
    const colMap: Record<string, string> = { danger: '#C24A30', warn: '#9A6B0A', primary: 'var(--primary)' };
    return `
      <div style="font-weight:800;font-size:15px;margin-bottom:14px;">Alertas activas</div>
      <div style="display:flex;flex-direction:column;gap:9px;">
        ${alertas.length ? alertas.map((a) => {
          const col = colMap[a.tipo] || '#888';
          const bg = bgMap[a.tipo] || 'var(--line)';
          return `<div style="background:${bg};border-radius:10px;padding:10px 12px;display:flex;align-items:flex-start;gap:10px;">
            <div style="width:6px;height:6px;border-radius:50%;background:${col};margin-top:5px;flex:none;"></div>
            <div style="flex:1;">
              <div style="font-size:12.5px;font-weight:700;color:${col};">${esc(a.texto)}</div>
              <div style="font-size:11.5px;color:var(--muted);margin-top:1px;">${esc(a.sub)}</div>
            </div>
            <button class="btn-ghost" style="font-size:11px;color:${col};padding:2px 0;font-weight:700;flex:none;" data-action="nav" data-to="${esc(a.link)}">Ir →</button>
          </div>`;
        }).join('') : `<div style="padding:16px;text-align:center;color:var(--faint);">
          <div style="font-size:22px;margin-bottom:6px;">✓</div>
          <div style="font-size:13px;font-weight:600;">Sin alertas activas</div>
        </div>`}
      </div>`;
  }

  /* ---------- Tarjeta: Actividad reciente ---------- */
  private actividadInner(): string {
    const actividad = this.store.actividad;
    return `
      <div style="font-weight:800;font-size:15px;margin-bottom:14px;">Actividad reciente</div>
      <div style="display:flex;flex-direction:column;gap:0;">
        ${actividad.length ? actividad.slice(0, 6).map((a, i) => `
          <div style="display:flex;gap:10px;padding:8px 0;${i < 5 ? 'border-bottom:1px solid var(--line);' : ''}align-items:flex-start;">
            <div style="width:7px;height:7px;border-radius:50%;background:${a.color};margin-top:6px;flex:none;"></div>
            <div style="flex:1;"><div style="font-size:12.5px;line-height:1.4;">${esc(a.texto)}</div>
            <div style="font-size:11px;color:var(--faint);margin-top:2px;">${esc(a.tiempo)} · ${esc(a.lugar)}</div>
            </div>
          </div>`).join('') : `<div style="color:var(--faint);font-size:13px;">Sin actividad reciente</div>`}
      </div>`;
  }
}
