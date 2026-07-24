/**
 * AlimentacionComponent — módulo "Alimentación" migrado a la nueva
 * arquitectura (Fase 2, módulo 4).
 *
 * Diferencias clave vs modules/alimentacion.js legacy:
 *  - Component (mount/update/unmount) en vez de `App.register` + string HTML.
 *  - Interactividad por EVENT DELEGATION (data-action, tanto en 'click' como
 *    en 'input' para el recálculo en vivo del formulario) en vez de
 *    onclick="AlimentacionModule.x()" / oninput="..." sobre un global window.
 *  - Lectura vía AppStore (serviciosAlimentacion, articulos, personas,
 *    asistencia) y la mutación vía AppStore.registrarServicio() — igual que
 *    el legacy hace con DB.registrarServicio(), descuenta insumos en el
 *    backend. El único endpoint que no está en el AppStore (consumo de una
 *    plantilla anterior) usa un AlimentacionRepository propio construido con
 *    el ApiClient inyectado — mismo patrón que usó Usuarios.
 *  - esc() en todo dato que viene de la base de datos.
 */
import { Component } from '@core/index';
import type { ApiClient } from '@core/index';
import type { AppStore } from '@store/app-store';
import { AlimentacionRepository } from '@domain/alimentacion/alimentacion.repository';
import type { ServicioAlimentacion } from '@domain/alimentacion/alimentacion.types';
import { Auth } from '@shell/auth';
import { esc, toast, modal, closeModal } from '@shell/ui';

const CATS_ALIMENTO = ['Alimentos', 'Proteínas', 'Condimentos'];

const GRUPOS_COMENSALES = [
  ['al-ninos', 'Niños'],
  ['al-misioneros', 'Misioneros'],
  ['al-voluntarios', 'Voluntarios'],
  ['al-padres', 'Padres'],
  ['al-staff', 'Staff'],
] as const;

export class AlimentacionComponent extends Component {
  private readonly repo: AlimentacionRepository;
  private readonly unsubs: Array<() => void> = [];
  private readonly onClick = (e: Event) => this.handleClick(e);
  private readonly onInput = (e: Event) => this.handleInput(e);

  constructor(private readonly store: AppStore, api: ApiClient) {
    super();
    this.repo = new AlimentacionRepository(api);
  }

  protected override onMount(): void {
    document.addEventListener('click', this.onClick);
    document.addEventListener('input', this.onInput);
    for (const evento of ['almacen:update', 'asistencia:update', 'alimentacion:update'] as const) {
      this.unsubs.push(this.store.on(evento, () => this.update()));
    }
  }

  protected override onUnmount(): void {
    document.removeEventListener('click', this.onClick);
    document.removeEventListener('input', this.onInput);
    for (const unsub of this.unsubs) unsub();
    this.unsubs.length = 0;
  }

  /* ---------- Delegación de eventos ---------- */
  private handleClick(e: Event): void {
    const target = (e.target as HTMLElement)?.closest<HTMLElement>('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    switch (action) {
      case 'nuevo-servicio': void this.abrirServicio(); break;
      case 'copiar-servicio': {
        const id = target.dataset.id ? Number(target.dataset.id) : undefined;
        void this.abrirServicio(id);
        break;
      }
      case 'cerrar-modal': closeModal(); break;
      case 'confirmar-servicio': void this.confirmarServicio(); break;
    }
  }

  private handleInput(e: Event): void {
    const target = (e.target as HTMLElement)?.closest<HTMLElement>('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    if (action === 'recalc-comensales') this.actualizarTotal();
    else if (action === 'recalc-insumo') {
      const artId = Number(target.dataset.artId);
      const precio = Number(target.dataset.precio);
      this.onCantidadChange(target as HTMLInputElement, artId, precio);
    }
  }

  /* ---------- RENDER PRINCIPAL ---------- */
  protected render(): string {
    const presentes = this.store.asistencia.filter((a) => a.presente).length;
    const misioneros = this.store.personas.filter((p) => p.tipo === 'misionero' && p.estado === 'activo').length;
    const voluntarios = this.store.personas.filter((p) => p.tipo === 'voluntario' && p.estado === 'activo').length;
    const staff = this.store.personas.filter((p) => p.tipo === 'staff' && p.estado === 'activo').length;
    const total = presentes + misioneros + voluntarios + staff;

    const servicios = this.store.serviciosAlimentacion;
    const racionesMes = servicios.reduce((s, x) => s + x.total, 0);
    const costoMes = servicios.reduce((s, x) => s + x.costo, 0);
    const costoPromPlato = servicios.length
      ? (servicios.reduce((s, x) => s + (x.costoPlato || 0), 0) / servicios.length).toFixed(2)
      : '0.00';

    const puedeEscribir = Auth.canWrite('alimentacion');

    return `
    <div class="page-header">
      <div>
        <h1>Alimentación</h1>
        <p>Registro de servicios · descuento automático de almacén</p>
      </div>
      ${puedeEscribir ? `
      <button class="btn btn-primary" style="margin-left:auto;"
        ${!this.store.articulos.length ? 'disabled title="Agrega artículos al almacén primero"' : 'data-action="nuevo-servicio"'}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 5v14M5 12h14"/></svg>
        Registrar servicio
      </button>` : `<span style="margin-left:auto;font-size:12px;background:var(--line);padding:5px 12px;border-radius:20px;color:var(--muted);">Solo lectura</span>`}
    </div>

    <div class="kpi-grid cols-4" style="margin-bottom:18px;">
      <div class="kpi-card">
        <div class="label">Servicios este mes</div>
        <div class="value" style="font-size:32px;">${servicios.length}</div>
      </div>
      <div class="kpi-card">
        <div class="label">Raciones servidas</div>
        <div class="value" style="font-size:32px;">${racionesMes.toLocaleString()}</div>
      </div>
      <div class="kpi-card">
        <div class="label">Costo total del mes</div>
        <div class="value" style="font-size:26px;">$${costoMes.toFixed(2)}</div>
      </div>
      <div class="kpi-card">
        <div class="label">Costo promedio / plato</div>
        <div class="value" style="font-size:26px;color:var(--primary);">$${costoPromPlato}</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1.6fr 1fr;gap:16px;align-items:start;">

      <div class="table-card">
        <div style="padding:14px 20px;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;">
          <div style="font-weight:700;font-size:15px;">Historial de servicios</div>
          <span style="font-size:12px;color:var(--muted);">${servicios.length} registros</span>
        </div>
        ${servicios.length ? `
        <div class="table-head" style="grid-template-columns:90px 1.5fr 70px 70px 80px 80px;">
          <span>Fecha</span><span>Menú</span><span>Raciones</span><span>$/plato</span><span>Costo</span><span></span>
        </div>
        ${servicios.map((s) => `
          <div class="table-row" style="grid-template-columns:90px 1.5fr 70px 70px 80px 80px;">
            <span style="font-size:12.5px;color:var(--muted);">${esc(s.fecha)}</span>
            <div>
              <div style="font-size:13.5px;font-weight:600;">${esc(s.menu)}</div>
              <div style="font-size:11.5px;color:var(--faint);">${s.insumos ? s.insumos.split('·').length + ' insumos' : '—'}</div>
            </div>
            <span style="font-size:14px;font-weight:700;">${s.total}</span>
            <span style="font-size:13px;color:var(--primary);font-weight:700;">${s.costoPlato > 0 ? '$' + s.costoPlato.toFixed(2) : '—'}</span>
            <span style="font-size:13.5px;font-weight:600;">${s.costo > 0 ? '$' + s.costo.toFixed(2) : '—'}</span>
            <button class="btn btn-sm btn-outline" data-action="copiar-servicio" data-id="${s.id}"
              title="Usar como plantilla" style="padding:5px 8px;font-size:11.5px;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              Copiar
            </button>
          </div>`).join('')}
        ` : `<div style="padding:32px;text-align:center;color:var(--muted);font-size:13.5px;">Aún no hay servicios registrados.</div>`}
      </div>

      <div class="table-card">
        <div style="padding:14px 20px;border-bottom:1px solid var(--line);">
          <div style="font-weight:700;font-size:15px;">Insumos disponibles</div>
          <div style="font-size:12px;color:var(--muted);margin-top:2px;">Stock actual · ${esc(this.store.hoy())}</div>
        </div>
        <div style="padding:10px 16px;background:var(--bg);border-bottom:1px solid var(--line);display:flex;gap:10px;flex-wrap:wrap;">
          ${this.grupoBadge('Niños presentes', presentes, '#E0F0FF', '#015a9e')}
          ${this.grupoBadge('Misioneros', misioneros, '#edfde0', '#3d8a20')}
          ${this.grupoBadge('Voluntarios', voluntarios, '#EDE7FD', '#6B4EEA')}
          ${this.grupoBadge('Staff', staff, '#fff6dc', '#b07900')}
          <div style="margin-left:auto;background:var(--ink);color:#fff;border-radius:20px;padding:4px 12px;font-size:12px;font-weight:800;">${total} total</div>
        </div>
        ${this.store.articulos.filter((a) => CATS_ALIMENTO.includes(a.categoria)).map((a) => {
          const bad = a.stock < a.minimo;
          const warn = !bad && a.minimo > 0 && a.stock < a.minimo * 1.3;
          const col = bad ? 'var(--danger)' : warn ? 'var(--warn)' : 'var(--success)';
          return `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:9px 16px;border-bottom:1px solid var(--line);">
            <span style="font-size:13.5px;font-weight:600;">${esc(a.nombre)}</span>
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-size:14px;font-weight:800;color:${col};">${a.stock}</span>
              <span style="font-size:12px;color:var(--faint);">${esc(a.unidad)}</span>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }

  private grupoBadge(label: string, n: number, bg: string, fg: string): string {
    return `<div style="background:${bg};color:${fg};border-radius:20px;padding:3px 10px;font-size:12px;font-weight:700;">${esc(label)}: ${n}</div>`;
  }

  /* ---------- MODAL REGISTRAR SERVICIO ---------- */
  private async abrirServicio(plantillaId?: number): Promise<void> {
    const presentes = this.store.asistencia.filter((a) => a.presente).length;
    const misioneros = this.store.personas.filter((p) => p.tipo === 'misionero' && p.estado === 'activo').length;
    const voluntarios = this.store.personas.filter((p) => p.tipo === 'voluntario' && p.estado === 'activo').length;
    const padres = this.store.personas.filter((p) => p.tipo === 'padre' && p.estado === 'activo').length;
    const staff = this.store.personas.filter((p) => p.tipo === 'staff' && p.estado === 'activo').length;
    const arts = this.store.articulos.filter((a) => CATS_ALIMENTO.includes(a.categoria));

    const consumoPlantilla: Record<number, number> = {};
    if (plantillaId != null) {
      const consumo = await this.repo.consumo(plantillaId);
      if (consumo) for (const c of consumo) consumoPlantilla[c.articuloId] = c.cantidad;
    }
    const plantilla = plantillaId != null
      ? this.store.serviciosAlimentacion.find((s) => s.id === plantillaId) ?? null
      : null;

    const valoresIniciales: Record<string, number> = {
      'al-ninos': presentes, 'al-misioneros': misioneros, 'al-voluntarios': voluntarios,
      'al-padres': padres, 'al-staff': staff,
    };
    const totalInicial = presentes + misioneros + voluntarios + staff;

    modal(`
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:4px;">
        <h2 style="margin:0;flex:1;">Registrar servicio de almuerzo</h2>
        ${plantilla ? `<div style="background:#edfde0;color:#3d8a20;border-radius:8px;padding:5px 11px;font-size:12px;font-weight:700;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:3px;"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          Plantilla: ${esc(plantilla.menu)}
        </div>` : ''}
      </div>
      <p style="margin:0 0 18px;font-size:13px;color:var(--muted);">
        ${plantilla ? 'Las cantidades se pre-llenaron desde el servicio anterior. Ajusta según lo que usaste hoy.' : 'Ingresa el menú, los comensales y cuánto usaste de cada insumo.'}
      </p>

      <div class="ficha-section">
        <div class="ficha-section-title">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 3v7a2.5 2.5 0 0 0 5 0V3M7.5 10v11M17 3c-1.7 0-3 2.2-3 5s1.3 4 3 4m0 0v9"/></svg>
          Servicio
        </div>
        <div class="form-grid">
          <div class="form-group">
            <label>Menú / Descripción *</label>
            <input type="text" id="al-menu" value="${esc(plantilla ? plantilla.menu : '')}" placeholder="Ej: Arroz con pollo, ensalada y jugo">
          </div>
          <div class="form-group">
            <label>Fecha</label>
            <input type="date" id="al-fecha" value="${new Date().toISOString().split('T')[0]}">
          </div>
        </div>
      </div>

      <div class="ficha-section">
        <div class="ficha-section-title">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><path d="M16 6.5a3 3 0 0 1 0 5.6M16.5 19a5.5 5.5 0 0 0-2-4.3"/></svg>
          Comensales atendidos
        </div>
        <div class="comensales-grid" style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:10px;">
          ${GRUPOS_COMENSALES.map(([id, label]) => `
            <div style="text-align:center;">
              <div style="font-size:11.5px;font-weight:700;color:var(--muted);margin-bottom:5px;">${label}</div>
              <input type="number" id="${id}" value="${valoresIniciales[id]}" min="0" data-action="recalc-comensales"
                style="width:100%;text-align:center;padding:8px 4px;border:1.5px solid var(--border);border-radius:9px;font-size:16px;font-weight:800;font-family:'Quicksand';">
            </div>`).join('')}
        </div>
        <div style="background:var(--bg);border-radius:10px;padding:10px 16px;display:flex;align-items:center;justify-content:space-between;">
          <span style="font-size:13px;font-weight:600;color:var(--muted);">Total comensales</span>
          <span id="al-total-display" style="font-size:22px;font-weight:800;color:var(--ink);">${totalInicial}</span>
        </div>
      </div>

      <div class="ficha-section">
        <div class="ficha-section-title">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 8.5 12 4l9 4.5M3 8.5V18l9 4.5M3 8.5l9 4.5m0 0L21 8.5M12 13v9.5M21 8.5V18l-9 4.5"/></svg>
          Insumos utilizados
          <span style="font-size:11px;font-weight:400;color:var(--faint);margin-left:4px;">— solo los que usaste, deja en 0 el resto</span>
        </div>
        <div style="border:1px solid var(--line);border-radius:10px;overflow:hidden;">
          <div style="display:grid;grid-template-columns:1.8fr .8fr .9fr .9fr .9fr;gap:6px;padding:8px 14px;background:var(--bg);font-size:11px;font-weight:700;letter-spacing:.4px;color:var(--faint);text-transform:uppercase;">
            <span>Artículo</span><span>Stock</span><span>Cantidad usada</span><span>Precio/u</span><span>Subtotal</span>
          </div>
          ${arts.map((a) => {
            const cantPrev = consumoPlantilla[a.id] || 0;
            const subtotal = cantPrev > 0 && a.precio > 0 ? (cantPrev * a.precio).toFixed(2) : '0.00';
            return `
            <div style="display:grid;grid-template-columns:1.8fr .8fr .9fr .9fr .9fr;gap:6px;padding:9px 14px;border-top:1px solid var(--line);align-items:center;">
              <div>
                <div style="font-size:13.5px;font-weight:600;">${esc(a.nombre)}</div>
                <div style="font-size:11px;color:var(--faint);">${esc(a.categoria)}</div>
              </div>
              <span style="font-size:13px;font-weight:700;color:${a.stock < a.minimo ? 'var(--danger)' : 'var(--ink)'};">${a.stock} <span style="font-size:11px;font-weight:400;color:var(--faint);">${esc(a.unidad)}</span></span>
              <input type="number" id="al-uso-${a.id}" value="${cantPrev}" min="0" step="0.01"
                data-action="recalc-insumo" data-art-id="${a.id}" data-precio="${a.precio}"
                style="width:80px;padding:6px 8px;border:1.5px solid var(--border);border-radius:7px;font-size:13px;text-align:center;">
              <span style="font-size:12.5px;color:var(--muted);">${a.precio > 0 ? '$' + a.precio.toFixed(2) : '—'}</span>
              <span id="al-sub-${a.id}" style="font-size:13px;font-weight:700;color:var(--primary);">${cantPrev > 0 && a.precio > 0 ? '$' + subtotal : '—'}</span>
            </div>`;
          }).join('')}
        </div>
      </div>

      <div id="al-resumen" style="background:linear-gradient(135deg,var(--primary),var(--primary-d));color:#fff;border-radius:14px;padding:16px 20px;margin-top:4px;">
        <div style="font-size:12px;font-weight:700;letter-spacing:.5px;opacity:.7;margin-bottom:10px;">RESUMEN DE COSTOS</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;">
          <div>
            <div style="font-size:11px;opacity:.7;">Costo ingredientes</div>
            <div id="al-res-total" style="font-size:22px;font-weight:800;">$0.00</div>
          </div>
          <div>
            <div style="font-size:11px;opacity:.7;">Comensales</div>
            <div id="al-res-comensales" style="font-size:22px;font-weight:800;">${totalInicial}</div>
          </div>
          <div>
            <div style="font-size:11px;opacity:.7;">Costo por plato</div>
            <div id="al-res-plato" style="font-size:22px;font-weight:800;">—</div>
          </div>
        </div>
        <div style="margin-top:10px;font-size:11.5px;opacity:.6;">
          Calculado automáticamente según precio unitario × cantidad usada de cada artículo.
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-outline" data-action="cerrar-modal">Cancelar</button>
        <button class="btn btn-primary" data-action="confirmar-servicio">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M20 6 9 17l-5-5"/></svg>
          Registrar y descontar del almacén
        </button>
      </div>
    `, { wide: true });

    setTimeout(() => this.recalcularResumen(), 50);
  }

  /* ---------- Recálculo en vivo (estado transitorio del modal) ---------- */
  private onCantidadChange(input: HTMLInputElement, artId: number, precio: number): void {
    const cant = parseFloat(input.value) || 0;
    const sub = document.getElementById(`al-sub-${artId}`);
    if (sub) {
      if (cant > 0 && precio > 0) {
        sub.textContent = `$${(cant * precio).toFixed(2)}`;
        sub.style.color = 'var(--primary)';
        input.style.borderColor = 'var(--primary)';
      } else {
        sub.textContent = '—';
        sub.style.color = 'var(--faint)';
        input.style.borderColor = cant > 0 ? 'var(--success)' : 'var(--border)';
      }
    }
    this.recalcularResumen();
  }

  private actualizarTotal(): void {
    const total = GRUPOS_COMENSALES.reduce((s, [id]) => {
      const el = document.getElementById(id) as HTMLInputElement | null;
      return s + (parseInt(el?.value || '0', 10) || 0);
    }, 0);
    const el = document.getElementById('al-total-display');
    const rc = document.getElementById('al-res-comensales');
    if (el) el.textContent = String(total);
    if (rc) rc.textContent = String(total);
    this.recalcularResumen();
  }

  private recalcularResumen(): void {
    let costoTotal = 0;
    for (const a of this.store.articulos.filter((x) => CATS_ALIMENTO.includes(x.categoria))) {
      const input = document.getElementById(`al-uso-${a.id}`) as HTMLInputElement | null;
      const cant = parseFloat(input?.value || '0') || 0;
      if (cant > 0 && a.precio > 0) costoTotal += cant * a.precio;
    }
    const comensales = GRUPOS_COMENSALES.reduce((s, [id]) => {
      const el = document.getElementById(id) as HTMLInputElement | null;
      return s + (parseInt(el?.value || '0', 10) || 0);
    }, 0);

    const elTotal = document.getElementById('al-res-total');
    const elPlato = document.getElementById('al-res-plato');
    if (elTotal) elTotal.textContent = `$${costoTotal.toFixed(2)}`;
    if (elPlato) elPlato.textContent = comensales > 0 && costoTotal > 0 ? `$${(costoTotal / comensales).toFixed(2)}` : '—';
  }

  /* ---------- CONFIRMAR ---------- */
  private async confirmarServicio(): Promise<void> {
    const menuInput = document.getElementById('al-menu') as HTMLInputElement | null;
    const menu = menuInput?.value.trim() || '';
    if (!menu) { toast('Escribe el nombre del menú', 'error'); return; }

    const valor = (id: string): number => {
      const el = document.getElementById(id) as HTMLInputElement | null;
      return parseInt(el?.value || '0', 10) || 0;
    };
    const ninos = valor('al-ninos');
    const misioneros = valor('al-misioneros');
    const voluntarios = valor('al-voluntarios');
    const padres = valor('al-padres');
    const staff = valor('al-staff');
    const total = ninos + misioneros + voluntarios + padres + staff;

    if (total <= 0) { toast('Ingresa al menos un comensal', 'error'); return; }

    const consumoValido: Array<{ articuloId: number; cantidad: number }> = [];
    const insumosTexto: string[] = [];
    let costoTotal = 0;

    for (const a of this.store.articulos.filter((x) => CATS_ALIMENTO.includes(x.categoria))) {
      const input = document.getElementById(`al-uso-${a.id}`) as HTMLInputElement | null;
      const cant = parseFloat(input?.value || '0') || 0;
      if (cant > 0) {
        consumoValido.push({ articuloId: a.id, cantidad: cant });
        insumosTexto.push(`${a.nombre} ${cant}${a.unidad}`);
        if (a.precio > 0) costoTotal += cant * a.precio;
      }
    }

    const costoPlato = total > 0 && costoTotal > 0 ? parseFloat((costoTotal / total).toFixed(2)) : 0;

    const btn = document.querySelector<HTMLButtonElement>('.modal .btn-primary');
    if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }

    const servicio: ServicioAlimentacion = {
      id: 0, fecha: '', descontado: false,
      menu, total, ninos, misioneros, voluntarios, padres, staff,
      insumos: insumosTexto.join(' · ') || 'Sin insumos registrados',
      costo: parseFloat(costoTotal.toFixed(2)),
      costoPlato,
    };

    const res = await this.store.registrarServicio(servicio, consumoValido);

    if ('error' in res) {
      toast(res.error, 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Registrar y descontar del almacén'; }
      return;
    }

    closeModal();
    toast(`"${esc(menu)}" registrado — ${total} comensales · $${costoTotal.toFixed(2)} · $${costoPlato.toFixed(2)}/plato`, 'success');
  }
}
