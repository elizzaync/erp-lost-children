/**
 * ReportesComponent — módulo "Reportes y Transparencia" migrado a la nueva
 * arquitectura (Fase 2, módulo 2).
 *
 * Solo lectura: agrega datos que ya viven en el AppStore (personas,
 * asistencia, articulos, gastos, entregas, serviciosAlimentacion, fondos).
 * No define su propio repositorio ni abre otro WebSocket — consume
 * exactamente la misma caché y los mismos eventos que el resto de la app.
 *
 * Diferencias clave vs modules/reportes.js legacy:
 *  - Component (mount/update/unmount) en vez de `App.register` + string HTML.
 *  - Interactividad por EVENT DELEGATION (data-action) en vez de
 *    onclick="ReportesModule.x()" sobre un global window.
 *  - Se suscribe a los eventos del AppStore (personas:update, asistencia:update,
 *    almacen:update, gastos:update, entregas:update, alimentacion:update,
 *    fondos:update) para reflejar cambios en tiempo real, igual que el legacy.
 *  - esc() en todo dato que viene de la base de datos (disciplina anti-XSS) —
 *    incluida la exportación CSV/PDF, donde el legacy tuvo un XSS real
 *    (celdas sin escapar insertadas vía document.write) corregido después.
 */
import { Component } from '@core/index';
import type { AppStore } from '@store/app-store';
import { esc, toast } from '@shell/ui';

type Tab = 'resumen' | 'asistencia' | 'alimentacion' | 'almacen' | 'entregas' | 'gastos';

interface TabDef {
  key: Tab;
  label: string;
}

const TABS: TabDef[] = [
  { key: 'resumen', label: 'Resumen general' },
  { key: 'asistencia', label: 'Asistencia' },
  { key: 'alimentacion', label: 'Alimentación' },
  { key: 'almacen', label: 'Almacén' },
  { key: 'entregas', label: 'Entregas' },
  { key: 'gastos', label: 'Gastos e Ingresos' },
];

type Celda = string | number;

interface DatosReporte {
  cols: string[];
  filas: Celda[][];
  resumen: Array<[string, Celda]>;
}

interface Meta {
  titulo: string;
  color: string;
  icon: string;
}

/** Solo las 5 pestañas exportables (resumen incluido, igual que el legacy). */
const META: Record<Tab, Meta> = {
  resumen: { titulo: 'Reporte de Impacto', color: '#0d4f6e', icon: '🎯' },
  asistencia: { titulo: 'Reporte de Asistencia', color: '#1a7a9e', icon: '👥' },
  almacen: { titulo: 'Inventario General', color: '#6B4EEA', icon: '📦' },
  entregas: { titulo: 'Historial de Entregas', color: '#1D7A56', icon: '🎁' },
  alimentacion: { titulo: 'Informe de Alimentación', color: '#9A6B0A', icon: '🍽' },
  gastos: { titulo: 'Gastos e Ingresos', color: '#C24A30', icon: '💰' },
};

const TIPO_LABEL: Record<string, string> = {
  nino: 'Niños', padre: 'Padres', misionero: 'Misioneros', staff: 'Staff', voluntario: 'Voluntarios',
};
const TIPO_COL: Record<string, string> = {
  nino: '#1a7a9e', padre: '#6B4EEA', misionero: '#1D7A56', staff: '#9A6B0A', voluntario: '#C24A30',
};
const STORE_EVENTOS = [
  'personas:update', 'asistencia:update', 'almacen:update',
  'gastos:update', 'entregas:update', 'alimentacion:update', 'fondos:update',
] as const;

export class ReportesComponent extends Component {
  private tab: Tab = 'resumen';
  private readonly unsubs: Array<() => void> = [];
  private readonly onClick = (e: Event) => this.handleClick(e);

  constructor(private readonly store: AppStore) {
    super();
  }

  protected override onMount(): void {
    document.addEventListener('click', this.onClick);
    for (const evento of STORE_EVENTOS) {
      this.unsubs.push(this.store.on(evento, () => this.update()));
    }
  }

  protected override onUnmount(): void {
    document.removeEventListener('click', this.onClick);
    for (const unsub of this.unsubs) unsub();
    this.unsubs.length = 0;
  }

  /* ---------- Delegación de eventos ---------- */
  private handleClick(e: Event): void {
    const target = (e.target as HTMLElement)?.closest<HTMLElement>('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    switch (action) {
      case 'set-tab': {
        const t = target.dataset.tab as Tab | undefined;
        if (t) { this.tab = t; this.update(); }
        break;
      }
      case 'export-csv': {
        const k = target.dataset.key as Tab | undefined;
        if (k) this.exportCSV(k);
        break;
      }
      case 'export-pdf': {
        const k = target.dataset.key as Tab | undefined;
        if (k) this.exportPDF(k);
        break;
      }
    }
  }

  /* ---------- Helpers visuales ---------- */
  private bar(pct: number, color = 'var(--primary)', h = 8): string {
    const p = Math.min(100, Math.max(0, pct));
    return `<div style="height:${h}px;background:var(--line);border-radius:99px;overflow:hidden;">
      <div style="height:100%;width:${p}%;background:${color};border-radius:99px;transition:width .4s;"></div>
    </div>`;
  }

  private badge(txt: string, bg: string, fg: string): string {
    return `<span style="background:${bg};color:${fg};border-radius:20px;padding:3px 10px;font-size:11.5px;font-weight:700;">${esc(txt)}</span>`;
  }

  private kpiCard(label: string, value: Celda, sub = '', col = 'var(--ink)'): string {
    return `<div class="kpi-card">
      <div class="label">${esc(label)}</div>
      <div class="value" style="font-size:30px;color:${col};">${esc(value)}</div>
      ${sub ? `<div class="sub" style="color:var(--muted);">${esc(sub)}</div>` : ''}
    </div>`;
  }

  private seccion(titulo: string, contenido: string, exportKey?: Tab): string {
    return `
    <div class="kpi-card" style="margin-bottom:16px;padding:20px 22px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <div style="font-weight:800;font-size:15px;">${esc(titulo)}</div>
        ${exportKey ? `<div style="display:flex;gap:6px;">
          <button class="btn btn-sm btn-outline" data-action="export-csv" data-key="${exportKey}">CSV</button>
          <button class="btn btn-sm btn-outline" data-action="export-pdf" data-key="${exportKey}">PDF</button>
        </div>` : ''}
      </div>
      ${contenido}
    </div>`;
  }

  /* ---------- RENDER ---------- */
  protected render(): string {
    const tab = TABS.find((t) => t.key === this.tab) ? this.tab : TABS[0]!.key;
    return `
    <div class="page-header">
      <div>
        <h1>Reportes y Transparencia</h1>
        <p>Datos en tiempo real · Exportables en CSV y PDF</p>
      </div>
    </div>

    <div style="display:flex;gap:0;margin-bottom:20px;border-bottom:2px solid var(--line);overflow-x:auto;">
      ${TABS.map((t) => `
        <button data-action="set-tab" data-tab="${t.key}"
          style="padding:10px 18px;border:none;background:none;font-size:13.5px;font-weight:700;cursor:pointer;white-space:nowrap;
            border-bottom:3px solid ${tab === t.key ? 'var(--primary)' : 'transparent'};
            color:${tab === t.key ? 'var(--primary)' : 'var(--muted)'};margin-bottom:-2px;">
          ${esc(t.label)}
        </button>`).join('')}
    </div>

    ${tab === 'resumen' ? this.tabResumen()
      : tab === 'asistencia' ? this.tabAsistencia()
      : tab === 'alimentacion' ? this.tabAlimentacion()
      : tab === 'almacen' ? this.tabAlmacen()
      : tab === 'entregas' ? this.tabEntregas()
      : this.tabGastos()}`;
  }

  /* ---------- TAB: RESUMEN GENERAL ---------- */
  private tabResumen(): string {
    const kpi = this.store.getKPIs();
    const fondos = this.store.fondos;
    const criticos = this.store.articulos.filter((a) => a.stock < a.minimo);
    const totalP = this.store.personas.length;
    const ninos = this.store.personas.filter((p) => p.tipo === 'nino').length;
    const padres = this.store.personas.filter((p) => p.tipo === 'padre').length;
    const misioneros = this.store.personas.filter((p) => p.tipo === 'misionero').length;
    const asistPct = totalP ? Math.round((kpi.presentes / totalP) * 100) : 0;
    const hoy = new Date().toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' });

    const gastosCat: Record<string, number> = {};
    for (const g of this.store.gastos) gastosCat[g.categoria] = (gastosCat[g.categoria] || 0) + g.monto;
    const totalGasto = this.store.gastos.reduce((s, g) => s + g.monto, 0);
    const catEntries = Object.entries(gastosCat).sort((a, b) => b[1] - a[1]);
    const CAT_COLS = ['#1a7a9e', '#6B4EEA', '#1D7A56', '#C24A30', '#9A6B0A', '#2A5FA0', '#555', '#6E7872'];

    return `
    <div style="background:linear-gradient(130deg,#0d4f6e,#1a7a9e);border-radius:18px;padding:24px 28px;color:#fff;margin-bottom:18px;">
      <div style="font-size:11px;letter-spacing:.8px;font-weight:700;opacity:.7;text-transform:uppercase;margin-bottom:6px;">Reporte de impacto · ${esc(hoy)}</div>
      <div style="font-size:21px;font-weight:800;margin-bottom:4px;">Lost Children — ¿en qué estamos usando los fondos?</div>
      <p style="margin:0;font-size:13.5px;opacity:.8;">Cada número conectado a un comprobante y a un resultado medible.</p>
    </div>

    <div class="kpi-grid cols-4" style="margin-bottom:16px;">
      ${this.kpiCard('Personas registradas', totalP, `${ninos} niños · ${padres} padres · ${misioneros} misioneros`)}
      ${this.kpiCard('Presentes hoy', kpi.presentes, `${asistPct}% de asistencia`, asistPct >= 75 ? 'var(--success)' : 'var(--accent)')}
      ${this.kpiCard('Raciones servidas', kpi.almuerzosMes.toLocaleString(), 'acumulado registrado')}
      ${this.kpiCard('Entregas realizadas', kpi.entregasMes, 'bienes entregados a beneficiarios')}
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
      ${this.seccion('Balance financiero', `
        <div class="rep-3col" style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:14px;">
          <div style="background:var(--bg);border-radius:10px;padding:14px;">
            <div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:4px;">INGRESOS</div>
            <div style="font-size:20px;font-weight:800;color:#1D7A56;">S/ ${fondos.ingresos.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</div>
          </div>
          <div style="background:var(--bg);border-radius:10px;padding:14px;">
            <div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:4px;">EGRESOS</div>
            <div style="font-size:20px;font-weight:800;color:#C24A30;">S/ ${fondos.egresos.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</div>
          </div>
          <div style="background:${fondos.balance >= 0 ? '#E8F7F1' : '#FDE7E1'};border-radius:10px;padding:14px;">
            <div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:4px;">BALANCE</div>
            <div style="font-size:20px;font-weight:800;color:${fondos.balance >= 0 ? '#1D7A56' : '#C24A30'};">S/ ${fondos.balance.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</div>
          </div>
        </div>
        ${fondos.egresos > 0 ? `
          <div style="font-size:12px;color:var(--muted);margin-bottom:6px;">% de ingresos ejecutados</div>
          ${this.bar(Math.min(100, Math.round((fondos.egresos / Math.max(fondos.ingresos, 1)) * 100)), fondos.balance >= 0 ? '#1D7A56' : '#C24A30', 10)}
          <div style="font-size:12px;color:var(--muted);margin-top:4px;">${Math.round((fondos.egresos / Math.max(fondos.ingresos, 1)) * 100)}%</div>
        ` : '<div style="font-size:13px;color:var(--faint);">Sin egresos registrados aún.</div>'}
      `)}

      ${this.seccion('Estado del almacén', `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">
          <div style="background:var(--bg);border-radius:10px;padding:14px;">
            <div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:4px;">ARTÍCULOS</div>
            <div style="font-size:22px;font-weight:800;">${this.store.articulos.length}</div>
          </div>
          <div style="background:${criticos.length > 0 ? '#FDE7E1' : '#E8F7F1'};border-radius:10px;padding:14px;">
            <div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:4px;">CRÍTICOS</div>
            <div style="font-size:22px;font-weight:800;color:${criticos.length > 0 ? '#C24A30' : '#1D7A56'};">${criticos.length}</div>
          </div>
        </div>
        ${criticos.length > 0
          ? `<div style="font-size:12px;font-weight:700;color:var(--muted);margin-bottom:8px;">REQUIEREN REPOSICIÓN</div>
            ${criticos.slice(0, 4).map((a) => `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--line);">
                <span style="font-size:13px;font-weight:600;">${esc(a.nombre)}</span>
                <span style="font-size:12px;color:#C24A30;font-weight:700;">${a.stock}/${a.minimo} ${esc(a.unidad)}</span>
              </div>`).join('')}
            ${criticos.length > 4 ? `<div style="font-size:12px;color:var(--muted);margin-top:6px;">+${criticos.length - 4} más</div>` : ''}`
          : '<div style="color:var(--success);font-weight:700;font-size:14px;">✓ Todo el stock en niveles normales</div>'}
      `)}
    </div>

    ${this.seccion('Distribución de egresos por categoría', `
      ${catEntries.length
        ? `<div style="display:flex;flex-direction:column;gap:12px;">
            ${catEntries.map(([cat, val], i) => {
              const pct = totalGasto ? Math.round((val / totalGasto) * 100) : 0;
              const c = CAT_COLS[i % CAT_COLS.length];
              return `<div>
                <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:5px;">
                  <span style="font-weight:600;">${esc(cat)}</span>
                  <span style="font-weight:700;color:${c};">S/ ${val.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                    <span style="color:var(--faint);font-weight:400;">(${pct}%)</span></span>
                </div>
                ${this.bar(pct, c, 9)}
              </div>`;
            }).join('')}
          </div>`
        : '<div style="font-size:13px;color:var(--faint);">Sin gastos registrados.</div>'}
    `, 'resumen')}`;
  }

  /* ---------- TAB: ASISTENCIA ---------- */
  private tabAsistencia(): string {
    const asis = this.store.asistencia;
    const pres = asis.filter((a) => a.presente);
    const ausen = asis.filter((a) => !a.presente);
    const porTipo: Record<string, { total: number; presentes: number }> = {};
    for (const a of asis) {
      const d = (porTipo[a.tipo] ??= { total: 0, presentes: 0 });
      d.total++;
      if (a.presente) d.presentes++;
    }
    const metodos: Record<string, number> = {};
    for (const a of pres) metodos[a.metodo] = (metodos[a.metodo] || 0) + 1;

    return `
    <div class="kpi-grid cols-3" style="margin-bottom:16px;">
      ${this.kpiCard('Total registrados', asis.length)}
      ${this.kpiCard('Presentes', pres.length, `${pres.length} de ${asis.length} (${Math.round((pres.length / Math.max(asis.length, 1)) * 100)}%)`, 'var(--success)')}
      ${this.kpiCard('Ausentes', ausen.length, ausen.length > 0 ? 'sin registrar hoy' : 'todos presentes ✓', ausen.length > 0 ? 'var(--accent)' : 'var(--success)')}
    </div>

    <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:16px;margin-bottom:16px;">
      ${this.seccion('Por tipo de persona', `
        <div style="display:flex;flex-direction:column;gap:12px;">
          ${Object.entries(porTipo).map(([tipo, d]) => {
            const pct = Math.round((d.presentes / d.total) * 100);
            const col = TIPO_COL[tipo] || '#888';
            return `<div>
              <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:5px;">
                <span style="font-weight:700;">${esc(TIPO_LABEL[tipo] || tipo)}</span>
                <span style="color:${col};font-weight:700;">${d.presentes}/${d.total} · ${pct}%</span>
              </div>
              ${this.bar(pct, col, 9)}
            </div>`;
          }).join('')}
        </div>
      `)}
      ${this.seccion('Métodos de marcado', `
        ${Object.keys(metodos).length
          ? `<div style="display:flex;flex-direction:column;gap:10px;">
              ${Object.entries(metodos).sort((a, b) => b[1] - a[1]).map(([m, n]) => `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:var(--bg);border-radius:9px;">
                  <span style="font-size:13px;font-weight:600;">${esc(m)}</span>
                  <span style="font-size:20px;font-weight:800;color:var(--primary);">${n}</span>
                </div>`).join('')}
            </div>`
          : '<div style="font-size:13px;color:var(--faint);">Sin asistencia registrada hoy.</div>'}
      `)}
    </div>

    ${this.seccion('Detalle de asistencia de hoy', `
      ${asis.length
        ? `<div class="rep-scroll">
          <div style="font-size:12px;font-weight:700;color:var(--muted);display:grid;grid-template-columns:1fr 110px 90px 90px 130px;min-width:580px;padding:0 4px 8px;border-bottom:1px solid var(--line);">
            <span>Persona</span><span>Tipo</span><span>Estado</span><span>Hora</span><span>Método</span>
          </div>
          <div style="max-height:380px;overflow-y:auto;">
            ${asis.map((a) => {
              const col = TIPO_COL[a.tipo] || '#888';
              return `<div style="display:grid;grid-template-columns:1fr 110px 90px 90px 130px;min-width:580px;padding:9px 4px;border-bottom:1px solid var(--line);align-items:center;">
                <span style="font-size:13px;font-weight:600;">${esc(a.nombre)}</span>
                ${this.badge(TIPO_LABEL[a.tipo] || a.tipo, `${col}22`, col)}
                ${a.presente
                  ? '<span style="color:var(--success);font-weight:700;font-size:12.5px;">✓ Presente</span>'
                  : '<span style="color:var(--muted);font-size:12.5px;">— Ausente</span>'}
                <span style="font-size:12.5px;color:var(--muted);">${esc(a.hora || '—')}</span>
                <span style="font-size:12px;color:var(--muted);">${esc(a.metodo || '—')}</span>
              </div>`;
            }).join('')}
          </div></div>`
        : '<div style="color:var(--faint);font-size:13px;">Sin datos de asistencia.</div>'}
    `, 'asistencia')}`;
  }

  /* ---------- TAB: ALIMENTACIÓN ---------- */
  private tabAlimentacion(): string {
    const svcs = this.store.serviciosAlimentacion;
    const totalRac = svcs.reduce((s, x) => s + (x.total || 0), 0);
    const costos = svcs.filter((s) => s.costoPlato > 0);
    const avgCosto = costos.length ? costos.reduce((s, x) => s + x.costoPlato, 0) / costos.length : 0;

    const insumoCount: Record<string, number> = {};
    for (const s of svcs) {
      if (s.insumos) {
        for (const ins of s.insumos.split(',')) {
          const p = ins.trim();
          if (p) insumoCount[p] = (insumoCount[p] || 0) + 1;
        }
      }
    }
    const insumoEntries = Object.entries(insumoCount).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const maxIns = insumoEntries[0] ? insumoEntries[0][1] : 1;

    return `
    <div class="kpi-grid cols-3" style="margin-bottom:16px;">
      ${this.kpiCard('Servicios registrados', svcs.length)}
      ${this.kpiCard('Raciones totales', totalRac.toLocaleString(), 'personas atendidas acumulado')}
      ${this.kpiCard('Costo prom./plato', avgCosto > 0 ? `S/ ${avgCosto.toFixed(2)}` : '—', avgCosto > 0 ? 'promedio calculado' : 'registra precios en almacén', avgCosto > 0 ? 'var(--primary)' : 'var(--muted)')}
    </div>

    <div style="display:grid;grid-template-columns:1.5fr 1fr;gap:16px;margin-bottom:16px;">
      ${this.seccion('Últimos servicios registrados', `
        ${svcs.length
          ? svcs.slice(0, 10).map((s) => `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--line);">
                <div>
                  <div style="font-size:13.5px;font-weight:700;">${esc(s.menu || '(sin nombre)')}</div>
                  <div style="font-size:12px;color:var(--muted);">${esc(s.fecha)}${s.insumos ? ' · ' + esc(s.insumos) : ''}</div>
                </div>
                <div style="text-align:right;flex-shrink:0;margin-left:12px;">
                  <div style="font-size:14px;font-weight:800;color:var(--primary);">${s.total} raciones</div>
                  ${s.costoPlato > 0 ? `<div style="font-size:11.5px;color:var(--muted);">S/ ${s.costoPlato.toFixed(2)}/c.u</div>` : ''}
                </div>
              </div>`).join('')
          : '<div style="color:var(--faint);font-size:13px;">Sin servicios registrados aún.</div>'}
      `, 'alimentacion')}

      ${this.seccion('Insumos más frecuentes', `
        ${insumoEntries.length
          ? `<div style="display:flex;flex-direction:column;gap:10px;">
              ${insumoEntries.map(([ins, n]) => `
                <div>
                  <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:4px;">
                    <span style="font-weight:600;">${esc(ins)}</span>
                    <span style="color:#1D7A56;font-weight:700;">${n}x</span>
                  </div>
                  ${this.bar(Math.round((n / maxIns) * 100), '#1D7A56', 7)}
                </div>`).join('')}
            </div>`
          : '<div style="font-size:13px;color:var(--faint);">Sin datos de insumos.</div>'}
      `)}
    </div>`;
  }

  /* ---------- TAB: ALMACÉN ---------- */
  private tabAlmacen(): string {
    const arts = this.store.articulos;
    const criticos = arts.filter((a) => a.stock < a.minimo);
    const porCat: Record<string, typeof arts> = {};
    for (const a of arts) (porCat[a.categoria] ??= []).push(a);
    const totalVal = arts.reduce((s, a) => s + a.stock * (a.precio || 0), 0);
    const CAT_COLS: Record<string, string> = {
      Alimentos: '#1a7a9e', 'Proteínas': '#1D7A56', Condimentos: '#9A6B0A',
      Higiene: '#6B4EEA', 'Útiles': '#2A5FA0', Regalos: '#C24A30', Otros: '#888',
    };

    return `
    <div class="kpi-grid cols-4" style="margin-bottom:16px;">
      ${this.kpiCard('Artículos en catálogo', arts.length)}
      ${this.kpiCard('Artículos críticos', criticos.length, criticos.length > 0 ? 'requieren reposición' : 'todo OK', criticos.length > 0 ? 'var(--danger)' : 'var(--success)')}
      ${this.kpiCard('Categorías', Object.keys(porCat).length)}
      ${this.kpiCard('Valor est. del stock', totalVal > 0 ? `S/ ${totalVal.toLocaleString('es-PE', { minimumFractionDigits: 2 })}` : '—', totalVal > 0 ? 'precio × stock' : 'sin precios cargados')}
    </div>

    ${criticos.length > 0 ? `
    <div style="background:#FDE7E1;border:1.5px solid #C24A3033;border-radius:14px;padding:14px 18px;margin-bottom:16px;">
      <div style="font-weight:800;font-size:14px;color:#C24A30;margin-bottom:10px;">⚠ ${criticos.length} artículo${criticos.length > 1 ? 's' : ''} bajo el mínimo</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;">
        ${criticos.map((a) => {
          const pct = Math.round((a.stock / a.minimo) * 100);
          return `<div style="background:#fff;border-radius:10px;padding:8px 14px;min-width:160px;">
            <div style="font-weight:700;font-size:13px;">${esc(a.nombre)}</div>
            <div style="font-size:12px;color:#C24A30;margin-top:2px;">${a.stock} de ${a.minimo} ${esc(a.unidad)}</div>
            ${this.bar(pct, '#C24A30', 5)}
          </div>`;
        }).join('')}
      </div>
    </div>` : ''}

    ${this.seccion('Inventario por categoría', `
      ${Object.entries(porCat).map(([cat, lista]) => {
        const col = CAT_COLS[cat] || '#888';
        const crit = lista.filter((a) => a.stock < a.minimo).length;
        return `
        <div style="margin-bottom:16px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <div style="font-weight:800;font-size:14px;color:${col};">${esc(cat)}</div>
            <div style="display:flex;gap:8px;align-items:center;">
              ${crit > 0 ? this.badge(`${crit} crítico${crit > 1 ? 's' : ''}`, '#FDE7E1', '#C24A30') : ''}
              <span style="font-size:12px;color:var(--muted);">${lista.length} artículo${lista.length > 1 ? 's' : ''}</span>
            </div>
          </div>
          <div class="rep-scroll"><div>
          <div style="font-size:11px;font-weight:700;color:var(--muted);display:grid;grid-template-columns:1fr 80px 70px 100px;min-width:420px;padding:0 0 5px;border-bottom:1px solid var(--line);">
            <span>Artículo</span><span>Stock</span><span>Mínimo</span><span>Nivel</span>
          </div>
          ${lista.map((a) => {
            const pct = Math.min(100, Math.round((a.stock / Math.max(a.minimo, 1)) * 100));
            const c = a.stock < a.minimo ? '#C24A30' : a.stock < a.minimo * 1.5 ? '#9A6B0A' : col;
            return `<div style="display:grid;grid-template-columns:1fr 80px 70px 100px;min-width:420px;padding:7px 0;border-bottom:1px solid var(--line);align-items:center;">
              <span style="font-size:13px;font-weight:600;">${esc(a.nombre)}</span>
              <span style="font-size:13px;font-weight:700;color:${c};">${a.stock} ${esc(a.unidad)}</span>
              <span style="font-size:12px;color:var(--muted);">${a.minimo} ${esc(a.unidad)}</span>
              <div style="padding-right:8px;">${this.bar(pct, c, 7)}</div>
            </div>`;
          }).join('')}
        </div></div></div>`;
      }).join('')}
    `, 'almacen')}`;
  }

  /* ---------- TAB: ENTREGAS ---------- */
  private tabEntregas(): string {
    const ent = this.store.entregas;
    const porArt: Record<string, number> = {};
    const porTipo: Record<string, number> = {};
    for (const e of ent) {
      porArt[e.articulo] = (porArt[e.articulo] || 0) + e.cantidad;
      const t = e.personaTipo || 'nino';
      porTipo[t] = (porTipo[t] || 0) + 1;
    }
    const topArts = Object.entries(porArt).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const maxArt = topArts[0] ? topArts[0][1] : 1;
    const TIPO_COLS = ['#1a7a9e', '#6B4EEA', '#1D7A56', '#9A6B0A', '#C24A30'];

    return `
    <div class="kpi-grid cols-3" style="margin-bottom:16px;">
      ${this.kpiCard('Total entregas', ent.length)}
      ${this.kpiCard('Artículos distintos', Object.keys(porArt).length, 'tipos de bien entregados')}
      ${this.kpiCard('Tipos de beneficiario', Object.keys(porTipo).length, Object.entries(porTipo).map(([t, n]) => `${n} ${TIPO_LABEL[t] || t}`).join(' · '))}
    </div>

    <div style="display:grid;grid-template-columns:1.3fr 1fr;gap:16px;margin-bottom:16px;">
      ${this.seccion('Artículos más entregados', `
        ${topArts.length
          ? `<div style="display:flex;flex-direction:column;gap:10px;">
              ${topArts.map(([art, n], i) => {
                const c = TIPO_COLS[i % TIPO_COLS.length];
                return `<div>
                  <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;">
                    <span style="font-weight:600;">${esc(art)}</span>
                    <span style="font-weight:700;color:${c};">${n} uds</span>
                  </div>
                  ${this.bar(Math.round((n / maxArt) * 100), c, 8)}
                </div>`;
              }).join('')}
            </div>`
          : '<div style="font-size:13px;color:var(--faint);">Sin entregas registradas.</div>'}
      `)}
      ${this.seccion('Por tipo de beneficiario', `
        ${Object.entries(porTipo).length
          ? `<div style="display:flex;flex-direction:column;gap:10px;">
              ${Object.entries(porTipo).map(([t, n], i) => `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:var(--bg);border-radius:10px;">
                  <span style="font-size:13.5px;font-weight:700;">${esc(TIPO_LABEL[t] || t)}</span>
                  <div style="text-align:right;">
                    <div style="font-size:20px;font-weight:800;color:${TIPO_COLS[i % TIPO_COLS.length]};">${n}</div>
                    <div style="font-size:11px;color:var(--muted);">entregas</div>
                  </div>
                </div>`).join('')}
            </div>`
          : '<div style="font-size:13px;color:var(--faint);">Sin datos.</div>'}
      `)}
    </div>

    ${this.seccion('Historial completo de entregas', `
      ${ent.length
        ? `<div class="rep-scroll">
          <div style="font-size:12px;font-weight:700;color:var(--muted);display:grid;grid-template-columns:80px 1fr 1fr 60px 1fr;min-width:520px;padding:0 4px 8px;border-bottom:1px solid var(--line);">
            <span>Fecha</span><span>Beneficiario</span><span>Artículo</span><span>Cant.</span><span>Campaña</span>
          </div>
          <div style="max-height:360px;overflow-y:auto;">
            ${ent.map((e) => `
              <div style="display:grid;grid-template-columns:80px 1fr 1fr 60px 1fr;min-width:520px;padding:8px 4px;border-bottom:1px solid var(--line);align-items:center;">
                <span style="font-size:12px;color:var(--muted);">${esc(e.fecha)}</span>
                <span style="font-size:13px;font-weight:600;">${esc(e.nino)}</span>
                <span style="font-size:13px;">${esc(e.articulo)}</span>
                <span style="font-size:13px;font-weight:700;">${e.cantidad}</span>
                <span style="font-size:12px;color:var(--muted);">${esc(e.campana || 'General')}</span>
              </div>`).join('')}
          </div></div>`
        : '<div style="font-size:13px;color:var(--faint);">Sin entregas registradas.</div>'}
    `, 'entregas')}`;
  }

  /* ---------- TAB: GASTOS E INGRESOS ---------- */
  private tabGastos(): string {
    const gastos = this.store.gastos;
    const fondos = this.store.fondos;
    const ingresos = (fondos.movimientos || []).filter((m) => m.tipo === 'ingreso');
    const gastosCat: Record<string, number> = {};
    for (const g of gastos) gastosCat[g.categoria] = (gastosCat[g.categoria] || 0) + g.monto;
    const topCats = Object.entries(gastosCat).sort((a, b) => b[1] - a[1]);
    const maxCat = topCats[0] ? topCats[0][1] : 1;
    const conComp = gastos.filter((g) => g.comprobante).length;
    const autoGen = gastos.filter((g) => g.fuenteAuto === 'compra_almacen').length;
    const GCOLS = ['#C24A30', '#9A6B0A', '#6B4EEA', '#1a7a9e', '#2A5FA0', '#1D7A56', '#888'];
    const TICOL: Record<string, string> = {
      'Donación de dinero': '#1D7A56', 'Subvención': '#015a9e', 'Evento / Pollada': '#6B4EEA',
      Evento: '#6B4EEA', Colecta: '#9A6B0A', Transferencia: '#2A5FA0', 'Otro ingreso': '#888',
    };

    const porTipoIng: Record<string, number> = {};
    for (const m of ingresos) {
      const t = m.categoria || 'Otro ingreso';
      porTipoIng[t] = (porTipoIng[t] || 0) + m.monto;
    }

    return `
    <div class="kpi-grid cols-4" style="margin-bottom:16px;">
      ${this.kpiCard('Ingresos', `S/ ${fondos.ingresos.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`, `${ingresos.length} movimientos`, '#1D7A56')}
      ${this.kpiCard('Egresos', `S/ ${fondos.egresos.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`, `${gastos.length} gastos registrados`, '#C24A30')}
      ${this.kpiCard('Balance', `S/ ${fondos.balance.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`, fondos.balance >= 0 ? 'positivo' : '⚠ negativo', fondos.balance >= 0 ? '#1D7A56' : '#C24A30')}
      ${this.kpiCard('Con comprobante', `${conComp} / ${gastos.length}`, gastos.length ? `${Math.round((conComp / Math.max(gastos.length, 1)) * 100)}% documentados` : '—')}
    </div>

    <div style="display:grid;grid-template-columns:1.3fr 1fr;gap:16px;margin-bottom:16px;">
      ${this.seccion('Egresos por categoría', `
        ${topCats.length
          ? `<div style="display:flex;flex-direction:column;gap:12px;">
              ${topCats.map(([cat, val], i) => {
                const c = GCOLS[i % GCOLS.length];
                const pct = fondos.egresos ? Math.round((val / fondos.egresos) * 100) : 0;
                return `<div>
                  <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;">
                    <span style="font-weight:600;">${esc(cat)}</span>
                    <span style="font-weight:700;color:${c};">S/ ${val.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                      <span style="color:var(--faint);font-weight:400;">(${pct}%)</span>
                    </span>
                  </div>
                  ${this.bar(Math.round((val / maxCat) * 100), c, 9)}
                </div>`;
              }).join('')}
            </div>`
          : '<div style="font-size:13px;color:var(--faint);">Sin gastos registrados.</div>'}
      `)}

      ${this.seccion('Ingresos por tipo', `
        ${Object.entries(porTipoIng).length
          ? `<div style="display:flex;flex-direction:column;gap:10px;">
              ${Object.entries(porTipoIng).sort((a, b) => b[1] - a[1]).map(([tipo, val]) => {
                const c = TICOL[tipo] || '#888';
                return `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:var(--bg);border-radius:10px;">
                  <span style="font-size:13px;font-weight:700;">${esc(tipo)}</span>
                  <span style="font-size:16px;font-weight:800;color:${c};">S/ ${val.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</span>
                </div>`;
              }).join('')}
            </div>`
          : '<div style="font-size:13px;color:var(--faint);">Sin ingresos registrados.</div>'}
      `)}
    </div>

    ${this.seccion(`Detalle de egresos · ${gastos.length} registros`, `
      <div style="display:flex;gap:8px;font-size:12px;color:var(--muted);margin-bottom:12px;flex-wrap:wrap;">
        <span style="background:#E0F0FF;color:#015a9e;border-radius:20px;padding:3px 10px;font-weight:700;">Auto-almacén: ${autoGen}</span>
        <span style="background:var(--line);border-radius:20px;padding:3px 10px;font-weight:700;">Manual: ${gastos.length - autoGen}</span>
        <span style="background:#E8F7F1;color:#1D7A56;border-radius:20px;padding:3px 10px;font-weight:700;">Con comprobante: ${conComp}</span>
      </div>
      ${gastos.length
        ? `<div class="rep-scroll">
          <div style="font-size:12px;font-weight:700;color:var(--muted);display:grid;grid-template-columns:80px 1fr 1fr 100px 120px;min-width:580px;padding:0 4px 8px;border-bottom:1px solid var(--line);">
            <span>Fecha</span><span>Categoría</span><span>Proveedor</span><span>Monto</span><span>Origen</span>
          </div>
          <div style="max-height:360px;overflow-y:auto;">
            ${gastos.map((g) => `
              <div style="display:grid;grid-template-columns:80px 1fr 1fr 100px 120px;min-width:580px;padding:8px 4px;border-bottom:1px solid var(--line);align-items:center;">
                <span style="font-size:12px;color:var(--muted);">${esc(g.fecha)}</span>
                <div style="background:${esc(g.catBg || '#eee')};color:${esc(g.catFg || '#555')};border-radius:20px;padding:3px 9px;font-size:11.5px;font-weight:700;display:inline-flex;">${esc(g.categoria)}</div>
                <span style="font-size:13px;font-weight:600;">${esc(g.proveedor)}</span>
                <span style="font-size:13px;font-weight:800;">S/ ${g.monto.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</span>
                ${g.fuenteAuto === 'compra_almacen'
                  ? '<span style="font-size:11px;background:#E0F0FF;color:#015a9e;border-radius:20px;padding:3px 8px;font-weight:700;">Auto·Almacén</span>'
                  : `<span style="font-size:11px;background:var(--line);color:var(--muted);border-radius:20px;padding:3px 8px;font-weight:700;">${g.comprobante ? '✓ Con comp.' : 'Manual'}</span>`}
              </div>`).join('')}
          </div></div>`
        : '<div style="font-size:13px;color:var(--faint);">Sin gastos registrados.</div>'}
    `, 'gastos')}`;
  }

  /* ---------- DATOS PARA EXPORTAR (CSV/PDF) ---------- */
  private datos(key: Tab): DatosReporte {
    const out: DatosReporte = { cols: [], filas: [], resumen: [] };

    if (key === 'asistencia') {
      out.cols = ['Nombre', 'Tipo', 'Presente', 'Hora', 'Método'];
      for (const a of this.store.asistencia) {
        out.filas.push([a.nombre, a.tipo, a.presente ? '✓ Sí' : '— No', a.hora || '—', a.metodo || '—']);
      }
      const pres = this.store.asistencia.filter((a) => a.presente).length;
      const total = this.store.asistencia.length;
      out.resumen = [
        ['Total registrados', total],
        ['Presentes', pres],
        ['Ausentes', total - pres],
        ['Asistencia', `${Math.round((pres / Math.max(total, 1)) * 100)}%`],
      ];

    } else if (key === 'almacen') {
      out.cols = ['Artículo', 'Categoría', 'Stock', 'Mínimo', 'Unidad', 'Precio unit.', 'Vence', 'Estado'];
      for (const a of this.store.articulos) {
        out.filas.push([
          a.nombre, a.categoria, a.stock, a.minimo, a.unidad,
          a.precio ? `S/ ${Number(a.precio).toFixed(2)}` : '—',
          a.vence || '—',
          a.stock < a.minimo ? '⚠ Crítico' : 'OK',
        ]);
      }
      const crit = this.store.articulos.filter((a) => a.stock < a.minimo).length;
      out.resumen = [
        ['Total artículos', this.store.articulos.length],
        ['Críticos', crit],
        ['Categorías', new Set(this.store.articulos.map((a) => a.categoria)).size],
      ];

    } else if (key === 'entregas') {
      out.cols = ['Fecha', 'Beneficiario', 'Tipo', 'Artículo', 'Categoría', 'Cantidad', 'Campaña', 'Notas'];
      for (const e of this.store.entregas) {
        out.filas.push([
          e.fecha, e.nino, e.personaTipo || '—', e.articulo,
          e.articuloCategoria || '—', e.cantidad, e.campana || 'General', e.notas || '—',
        ]);
      }
      const uds = this.store.entregas.reduce((s, e) => s + e.cantidad, 0);
      out.resumen = [
        ['Total entregas', this.store.entregas.length],
        ['Unidades entregadas', uds],
        ['Artículos distintos', new Set(this.store.entregas.map((e) => e.articulo)).size],
      ];

    } else if (key === 'alimentacion') {
      out.cols = ['Fecha', 'Menú', 'Total raciones', 'Costo/plato'];
      for (const s of this.store.serviciosAlimentacion) {
        out.filas.push([s.fecha, s.menu || '—', s.total || 0, s.costoPlato > 0 ? `S/ ${s.costoPlato.toFixed(2)}` : '—']);
      }
      const totalRac = this.store.serviciosAlimentacion.reduce((s, x) => s + (x.total || 0), 0);
      out.resumen = [
        ['Servicios registrados', this.store.serviciosAlimentacion.length],
        ['Raciones totales', totalRac],
      ];

    } else if (key === 'gastos') {
      out.cols = ['Fecha', 'Categoría', 'Monto (S/)', 'Proveedor', 'Observación', 'Origen', 'Comprobante'];
      for (const g of this.store.gastos) {
        out.filas.push([
          g.fechaISO || g.fecha, g.categoria, g.monto.toFixed(2), g.proveedor, g.observacion || '—',
          g.fuenteAuto === 'compra_almacen' ? 'Auto-almacén' : 'Manual',
          g.comprobante ? 'Sí' : 'No',
        ]);
      }
      const fondos = this.store.fondos;
      out.resumen = [
        ['Ingresos totales', `S/ ${fondos.ingresos.toFixed(2)}`],
        ['Egresos totales', `S/ ${fondos.egresos.toFixed(2)}`],
        ['Balance', `S/ ${fondos.balance.toFixed(2)}`],
        ['N.º gastos', this.store.gastos.length],
      ];

    } else {
      const kpi = this.store.getKPIs();
      out.cols = ['Indicador', 'Valor'];
      out.filas = [
        ['Personas registradas', this.store.personas.length],
        ['Niños', kpi.ninos],
        ['Presentes hoy', kpi.presentes],
        ['Raciones servidas', kpi.almuerzosMes],
        ['Entregas realizadas', kpi.entregasMes],
        ['Artículos en almacén', this.store.articulos.length],
        ['Artículos críticos', kpi.criticos],
        ['Ingresos totales', `S/ ${this.store.fondos.ingresos.toFixed(2)}`],
        ['Egresos totales', `S/ ${this.store.fondos.egresos.toFixed(2)}`],
        ['Balance', `S/ ${this.store.fondos.balance.toFixed(2)}`],
      ];
    }

    return out;
  }

  /* ---------- EXPORT EXCEL (HTML → .xls) ---------- */
  private exportCSV(key: Tab): void {
    const meta = META[key];
    const datos = this.datos(key);
    const fechaStr = new Date().toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' });
    const fileDate = new Date().toLocaleDateString('es-PE').replace(/\//g, '-');

    if (!datos.filas.length) { toast('Sin datos para exportar', 'warn'); return; }

    const resumenHtml = datos.resumen.length
      ? `<table class="resumen"><tr>${datos.resumen.map(([label, val]) =>
          `<td><div class="res-val">${esc(val)}</div><div class="res-lbl">${esc(label)}</div></td>`).join('')}</tr></table>`
      : '';

    const theadCells = datos.cols.map((c) => `<th>${esc(c)}</th>`).join('');
    const tbodyRows = datos.filas.map((fila) => {
      let cls = '';
      if (key === 'almacen' && fila[fila.length - 1] === '⚠ Crítico') cls = ' class="crit"';
      if (key === 'gastos' && fila[5] === 'Auto-almacén') cls = ' class="auto"';
      const cells = fila.map((v) => {
        const align = (typeof v === 'number' || /^S\/ [\d.]/.test(String(v)) || /^\d+$/.test(String(v))) ? ' style="text-align:right;"' : '';
        return `<td${align}>${esc(v)}</td>`;
      }).join('');
      return `<tr${cls}>${cells}</tr>`;
    }).join('');

    const html = '<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" '
      + 'xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/html4/">'
      + '<head><meta charset="UTF-8">'
      + '<style>'
      + `body{font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#222;margin:16px;}`
      + `.cabecera{background:${meta.color};color:#fff;padding:14px 18px;margin-bottom:12px;}`
      + `.cabecera .org{font-size:9pt;letter-spacing:.5px;opacity:.8;margin-bottom:3px;}`
      + `.cabecera h1{font-size:16pt;font-weight:700;margin:0 0 2px;}`
      + `.cabecera .sub{font-size:9pt;opacity:.75;}`
      + `.resumen{border-collapse:collapse;margin-bottom:14px;width:auto;}`
      + `.resumen td{border:1pt solid ${meta.color}44;padding:8px 18px;text-align:center;background:#f8f8f8;}`
      + `.res-val{font-size:15pt;font-weight:700;color:${meta.color};}`
      + `.res-lbl{font-size:8pt;color:#666;margin-top:2px;}`
      + `table.datos{border-collapse:collapse;width:100%;font-size:10pt;}`
      + `table.datos th{background:${meta.color};color:#fff;padding:8px 10px;text-align:left;font-weight:700;border:1pt solid ${meta.color};}`
      + `table.datos td{padding:6px 10px;border:1pt solid #ddd;vertical-align:top;}`
      + `table.datos tr:nth-child(even) td{background:#f4f4f4;}`
      + `table.datos tr.crit td{background:#fff0f0;color:#c00;font-weight:600;}`
      + `table.datos tr.auto td{background:#f0f6ff;}`
      + `.footer{margin-top:12px;font-size:8pt;color:#999;border-top:1pt solid #ddd;padding-top:8px;}`
      + '</style></head><body>'
      + `<div class="cabecera"><div class="org">Lost Children · ONG · ${esc(fechaStr)}</div>`
      + `<h1>${meta.icon} ${esc(meta.titulo)}</h1>`
      + '</div>'
      + resumenHtml
      + `<table class="datos"><thead><tr>${theadCells}</tr></thead>`
      + `<tbody>${tbodyRows}</tbody></table>`
      + `<div class="footer">Generado automáticamente por ERP Lost Children · ${esc(fechaStr)}</div>`
      + '</body></html>';

    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${meta.titulo} - ${fileDate}.xls`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast(`${meta.titulo} exportado como Excel`, 'success');
  }

  /* ---------- EXPORT PDF (ventana imprimible) ---------- */
  private exportPDF(key: Tab): void {
    const meta = META[key];
    const datos = this.datos(key);
    const fechaStr = new Date().toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' });

    if (!datos.filas.length && key !== 'resumen') { toast('Sin datos para exportar', 'warn'); return; }

    const resCards = datos.resumen.map(([label, val]) =>
      `<div class="card"><div class="card-val">${esc(val)}</div><div class="card-lbl">${esc(label)}</div></div>`).join('');

    // esc() en cada celda: este HTML se inyecta en una ventana nueva vía
    // document.write() (mismo origen que la app) — cualquier campo de texto
    // libre (proveedor, observación, nombre de artículo/persona) que llegara
    // con HTML/JS se ejecutaría sin este escape.
    const theadCells = datos.cols.map((c) => `<th>${esc(c)}</th>`).join('');
    const tbodyRows = datos.filas.map((fila) => {
      let cls = '';
      if (key === 'almacen' && fila[fila.length - 1] === '⚠ Crítico') cls = ' class="crit"';
      if (key === 'gastos' && fila[5] === 'Auto-almacén') cls = ' class="auto"';
      const cells = fila.map((v) => {
        const isNum = /^[\d., ]+$/.test(String(v)) || /^S\/ /.test(String(v));
        return `<td${isNum ? ' style="text-align:right;"' : ''}>${esc(v)}</td>`;
      }).join('');
      return `<tr${cls}>${cells}</tr>`;
    }).join('');

    const c = meta.color;
    const style = '<style>'
      + '@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap");'
      + '*{box-sizing:border-box;margin:0;padding:0;}'
      + 'body{font-family:Inter,Arial,sans-serif;color:#1a1a1a;background:#fff;font-size:12px;}'
      + '.wrap{max-width:900px;margin:0 auto;padding:32px 28px;}'
      + `.header{background:linear-gradient(135deg,${c},${c}cc);color:#fff;border-radius:14px;padding:24px 28px;margin-bottom:22px;display:flex;justify-content:space-between;align-items:flex-end;}`
      + '.header-left .org{font-size:10px;letter-spacing:.7px;opacity:.75;text-transform:uppercase;margin-bottom:6px;}'
      + '.header-left h1{font-size:22px;font-weight:800;letter-spacing:-.3px;margin-bottom:2px;}'
      + '.header-left .sub{font-size:11px;opacity:.75;}'
      + '.header-right{text-align:right;font-size:11px;opacity:.8;line-height:1.6;}'
      + '.icon{font-size:42px;line-height:1;}'
      + '.cards{display:flex;gap:12px;margin-bottom:22px;flex-wrap:wrap;}'
      + `.card{flex:1;min-width:120px;border:1.5px solid ${c}33;border-radius:10px;padding:14px 16px;text-align:center;background:#fff;}`
      + `.card-val{font-size:22px;font-weight:800;color:${c};line-height:1;margin-bottom:4px;}`
      + '.card-lbl{font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.4px;font-weight:600;}'
      + 'table{width:100%;border-collapse:collapse;font-size:11px;}'
      + `thead tr{background:${c};}`
      + 'th{color:#fff;padding:9px 10px;text-align:left;font-weight:700;font-size:11px;letter-spacing:.2px;}'
      + 'td{padding:7px 10px;border-bottom:1px solid #eee;vertical-align:top;}'
      + 'tr:nth-child(even) td{background:#f8f9fa;}'
      + 'tr.crit td{background:#fff3f3;color:#c00;font-weight:600;}'
      + 'tr.auto td:first-child{border-left:3px solid #015a9e;}'
      + 'tbody tr:last-child td{border-bottom:none;}'
      + '.footer{margin-top:24px;padding-top:14px;border-top:1px solid #eee;display:flex;justify-content:space-between;align-items:center;}'
      + '.footer .left{font-size:10px;color:#aaa;}'
      + '.footer .right{font-size:10px;color:#aaa;}'
      + `.btn-print{display:flex;align-items:center;gap:8px;margin-bottom:20px;padding:10px 24px;background:${c};color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:700;}`
      + '@media print{'
      + '.btn-print{display:none!important;}'
      + 'body{font-size:11px;}'
      + '.wrap{padding:16px;}'
      + '.header{border-radius:6px;}'
      + '@page{margin:1.2cm;}'
      + '}'
      + '</style>';

    const body = '<div class="wrap">'
      + '<div class="header">'
      + '<div class="header-left">'
      + '<div class="org">Lost Children · ONG · Reporte oficial</div>'
      + `<h1>${esc(meta.titulo)}</h1>`
      + `<div class="sub">Datos en tiempo real · ${esc(fechaStr)}</div>`
      + '</div>'
      + `<div class="header-right"><div class="icon">${meta.icon}</div></div>`
      + '</div>'
      + '<button class="btn-print" onclick="window.print()">'
      + '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>'
      + 'Imprimir / Guardar como PDF'
      + '</button>'
      + (resCards ? `<div class="cards">${resCards}</div>` : '')
      + `<table><thead><tr>${theadCells}</tr></thead>`
      + `<tbody>${tbodyRows}</tbody></table>`
      + '<div class="footer">'
      + `<div class="left">Lost Children · Sistema ERP · ${esc(fechaStr)}</div>`
      + '<div class="right">Este documento es de uso interno</div>'
      + '</div>'
      + '</div>';

    const win = window.open('', '_blank', 'width=1000,height=760');
    if (!win) { toast('El navegador bloqueó la ventana emergente', 'warn'); return; }
    win.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">`
      + `<title>${esc(meta.titulo)} · Lost Children</title>${style}</head><body>${body}</body></html>`);
    win.document.close();
  }
}
