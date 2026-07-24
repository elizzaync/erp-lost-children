/**
 * EntregasComponent — módulo "Entregas a beneficiarios" migrado a la nueva
 * arquitectura (Fase 2, módulo 5).
 *
 * Diferencias clave vs modules/entregas.js legacy:
 *  - Component (mount/update/unmount) en vez de `App.register` + string HTML.
 *  - Interactividad por EVENT DELEGATION (data-action, tanto en 'click' como
 *    en 'input' para el buscador de la lista, el buscador de personas del
 *    modal y el recálculo de stock disponible) en vez de
 *    onclick="EntregasModule.x()" / oninput="..." sobre un global window.
 *  - Lectura vía AppStore (entregas, personas, articulos) y la mutación vía
 *    AppStore.registrarEntrega() — igual que el legacy hace con
 *    DB.registrarEntrega(), descuenta stock en el backend y valida cantidad
 *    contra el stock disponible (patrón `if ('error' in res) {...}`, igual
 *    que alimentacion.component.ts).
 *  - esc() en todo dato que viene de la base de datos.
 *  - El filtro de campaña y el buscador de la lista/persona son estado propio
 *    del componente (antes variables de módulo `_campana`/`_busqueda`); al
 *    cambiar se dispara `update()`, que — como este componente no implementa
 *    `patch()` (igual que Usuarios/Alimentación) — re-renderiza completo, el
 *    mismo comportamiento observable que `App.refresh()` en el legacy.
 */
import { Component } from '@core/index';
import type { AppStore } from '@store/app-store';
import type { Entrega } from '@domain/entregas/entregas.types';
import type { Persona } from '@domain/personas/personas.types';
import { Auth } from '@shell/auth';
import { esc, toast, modal, closeModal } from '@shell/ui';

const TIPO_LABEL: Record<string, string> = {
  nino: 'Niño/a', misionero: 'Misionero', voluntario: 'Voluntario', padre: 'Padre/Madre', staff: 'Staff',
};

const TIPO_COLOR: Record<string, { bg: string; fg: string }> = {
  nino: { bg: '#E0F0FF', fg: '#015a9e' },
  misionero: { bg: '#edfde0', fg: '#3d8a20' },
  voluntario: { bg: '#EDE7FD', fg: '#6B4EEA' },
  padre: { bg: '#FDE7E1', fg: '#C24A30' },
  staff: { bg: '#fff6dc', fg: '#b07900' },
};

const CAMP_COLORES: Record<string, { bg: string; fg: string }> = {
  Navidad: { bg: '#EDE7FD', fg: '#6B4EEA' },
  'Campaña escolar': { bg: '#FDF2D5', fg: '#9A6B0A' },
  Cumpleaños: { bg: '#FDE7E1', fg: '#C24A30' },
  General: { bg: 'var(--line)', fg: 'var(--muted)' },
};
const CAMPANAS = ['todas', ...Object.keys(CAMP_COLORES)];

export class EntregasComponent extends Component {
  private campana = 'todas';
  private busqueda = '';
  private readonly unsubs: Array<() => void> = [];
  private readonly onClick = (e: Event) => this.handleClick(e);
  private readonly onInput = (e: Event) => this.handleInput(e);

  constructor(private readonly store: AppStore) {
    super();
  }

  protected override onMount(): void {
    document.addEventListener('click', this.onClick);
    document.addEventListener('input', this.onInput);
    this.unsubs.push(this.store.on('entregas:update', () => this.update()));
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
      case 'nueva-entrega': this.abrirFormulario(); break;
      case 'set-campana': if (target.dataset.camp) this.setCampana(target.dataset.camp); break;
      case 'cerrar-modal': closeModal(); break;
      case 'sel-persona': {
        const id = target.dataset.id ? Number(target.dataset.id) : undefined;
        if (id != null) this.selPersona(id);
        break;
      }
      case 'guardar-entrega': void this.guardar(); break;
    }
  }

  private handleInput(e: Event): void {
    const target = (e.target as HTMLElement)?.closest<HTMLElement>('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    if (action === 'buscar-lista') this.setBusqueda((target as HTMLInputElement).value);
    else if (action === 'filtrar-persona') this.filtrarPersonas((target as HTMLInputElement).value);
    else if (action === 'art-info') this.actualizarInfoArticulo();
  }

  /* ---------- RENDER PRINCIPAL ---------- */
  protected render(): string {
    let lista = this.store.entregas;
    if (this.campana !== 'todas') lista = lista.filter((e) => e.campana === this.campana);
    if (this.busqueda) {
      const q = this.busqueda.toLowerCase();
      lista = lista.filter((e) =>
        e.nino.toLowerCase().includes(q) ||
        e.articulo.toLowerCase().includes(q) ||
        e.campana.toLowerCase().includes(q));
    }

    const todas = this.store.entregas;
    const totalItems = todas.length;
    const totalArts = todas.reduce((s, e) => s + e.cantidad, 0);
    const personas = new Set(todas.map((e) => e.personaId)).size;
    const puedeEscribir = Auth.canWrite('entregas');

    return `
    <div class="page-header">
      <div>
        <h1>Entregas a beneficiarios</h1>
        <p>Registro nominal de bienes entregados · descuenta automáticamente del almacén</p>
      </div>
      ${puedeEscribir ? `
      <button class="btn btn-primary" style="margin-left:auto;" data-action="nueva-entrega">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 5v14M5 12h14"/></svg>
        Nueva entrega
      </button>` : `<span style="margin-left:auto;font-size:12px;background:var(--line);padding:5px 12px;border-radius:20px;color:var(--muted);">Solo lectura</span>`}
    </div>

    <div class="kpi-grid cols-4" style="margin-bottom:16px;">
      ${Object.entries(CAMP_COLORES).map(([camp, c]) => {
        const n = todas.filter((e) => e.campana === camp).length;
        return `
        <div class="kpi-card" style="cursor:pointer;border:2px solid ${this.campana === camp ? 'var(--primary)' : 'var(--border)'};"
          data-action="set-campana" data-camp="${esc(camp)}">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
            <div class="label">${esc(camp)}</div>
            <div style="background:${c.bg};color:${c.fg};border-radius:20px;padding:2px 10px;font-size:11px;font-weight:700;">${camp === this.campana ? 'activa' : ''}</div>
          </div>
          <div class="value" style="font-size:30px;">${n}</div>
          <div class="sub" style="color:var(--muted);">entrega${n === 1 ? '' : 's'}</div>
        </div>`;
      }).join('')}
    </div>

    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap;">
      <div style="position:relative;flex:1;min-width:220px;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="position:absolute;left:11px;top:50%;transform:translateY(-50%);color:var(--faint);pointer-events:none;"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <input type="text" placeholder="Buscar por persona, artículo o campaña…"
          value="${esc(this.busqueda)}" data-action="buscar-lista"
          style="width:100%;padding:8px 12px 8px 33px;border:1.5px solid var(--border);border-radius:9px;font-size:13.5px;">
      </div>
      ${CAMPANAS.map((c) => `
        <button class="filter-chip ${this.campana === c ? 'active' : ''}" data-action="set-campana" data-camp="${esc(c)}">
          ${c === 'todas' ? 'Todas' : esc(c)}
        </button>`).join('')}
      <span style="font-size:12.5px;color:var(--muted);font-weight:600;white-space:nowrap;">${lista.length} de ${totalItems}</span>
    </div>

    <div style="display:grid;grid-template-columns:1fr 260px;gap:16px;align-items:start;">

      <div class="table-card">
        ${lista.length ? `
        <div class="table-head" style="grid-template-columns:85px 1.6fr 1.2fr .6fr 1fr 1.1fr;">
          <span>Fecha</span><span>Persona</span><span>Artículo</span><span>Cant.</span><span>Campaña</span><span>Notas</span>
        </div>
        ${lista.map((e) => {
          const tc = TIPO_COLOR[e.personaTipo] || TIPO_COLOR.nino;
          return `
          <div class="table-row" style="grid-template-columns:85px 1.6fr 1.2fr .6fr 1fr 1.1fr;">
            <span style="font-size:12.5px;color:var(--muted);">${esc(e.fecha)}</span>
            <div style="display:flex;align-items:center;gap:9px;">
              ${this.avatarHtml(e.inicial, e.avatarBg, e.avatarFg, 32)}
              <div>
                <div style="font-size:13.5px;font-weight:600;">${esc(e.nino)}</div>
                <div style="background:${tc.bg};color:${tc.fg};border-radius:20px;padding:1px 7px;font-size:10.5px;font-weight:700;display:inline-block;">${esc(TIPO_LABEL[e.personaTipo] || e.personaTipo)}</div>
              </div>
            </div>
            <div>
              <div style="font-size:13.5px;font-weight:600;">${esc(e.articulo)}</div>
              ${e.articuloCategoria ? `<div style="font-size:11px;color:var(--faint);">${esc(e.articuloCategoria)}</div>` : ''}
            </div>
            <span style="font-size:14px;font-weight:700;">${e.cantidad} <span style="font-size:11px;font-weight:400;color:var(--faint);">${esc(e.unidad)}</span></span>
            <div style="background:${esc(e.campBg)};color:${esc(e.campFg)};border-radius:20px;padding:4px 10px;font-size:12px;font-weight:700;display:inline-flex;align-items:center;">${esc(e.campana)}</div>
            <span style="font-size:12px;color:var(--muted);font-style:${e.notas ? 'normal' : 'italic'};">${esc(e.notas) || '—'}</span>
          </div>`;
        }).join('')}
        ` : `
        <div style="padding:40px;text-align:center;">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--line)" stroke-width="1.5" style="margin-bottom:10px;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          <div style="font-size:14px;font-weight:600;color:var(--muted);">Sin entregas${this.campana !== 'todas' ? ` en "${esc(this.campana)}"` : this.busqueda ? ' con ese criterio' : ''}</div>
        </div>`}
      </div>

      <div style="display:flex;flex-direction:column;gap:12px;">
        <div class="table-card" style="padding:18px;">
          <div style="font-weight:700;font-size:14px;margin-bottom:14px;">Resumen</div>
          <div class="ficha-dato"><span style="font-size:13px;color:var(--muted);">Total entregas</span><span style="font-weight:700;">${totalItems}</span></div>
          <div class="ficha-dato"><span style="font-size:13px;color:var(--muted);">Artículos entregados</span><span style="font-weight:700;">${totalArts}</span></div>
          <div class="ficha-dato" style="border:none;"><span style="font-size:13px;color:var(--muted);">Personas atendidas</span><span style="font-weight:700;">${personas}</span></div>
        </div>

        <div class="table-card" style="padding:18px;">
          <div style="font-weight:700;font-size:14px;margin-bottom:12px;">Por tipo de persona</div>
          ${Object.entries(TIPO_LABEL).map(([tipo, label]) => {
            const n = todas.filter((e) => e.personaTipo === tipo).length;
            if (!n) return '';
            const tc = TIPO_COLOR[tipo];
            return `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--line);">
              <div style="display:flex;align-items:center;gap:7px;">
                <div style="width:8px;height:8px;border-radius:50%;background:${tc.fg};"></div>
                <span style="font-size:13px;">${esc(label)}</span>
              </div>
              <span style="font-size:13px;font-weight:700;">${n}</span>
            </div>`;
          }).join('')}
        </div>

        <div class="table-card" style="padding:18px;">
          <div style="font-weight:700;font-size:14px;margin-bottom:12px;">Artículos más entregados</div>
          ${(() => {
            const conteo = new Map<string, number>();
            for (const e of todas) conteo.set(e.articulo, (conteo.get(e.articulo) || 0) + e.cantidad);
            const top = [...conteo.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
            return top.length
              ? top.map(([art, n]) => `
                <div style="display:flex;align-items:center;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--line);">
                  <span style="font-size:12.5px;color:var(--ink);">${esc(art)}</span>
                  <span style="font-size:12.5px;font-weight:700;color:var(--primary);">${n}</span>
                </div>`).join('')
              : '<div style="font-size:12.5px;color:var(--faint);">Sin datos</div>';
          })()}
        </div>
      </div>
    </div>`;
  }

  private avatarHtml(inicial: string, bg: string, fg: string, size = 34): string {
    const rad = Math.round(size * 0.29);
    return `<div style="width:${size}px;height:${size}px;border-radius:${rad}px;background:${esc(bg)};color:${esc(fg)};
      display:flex;align-items:center;justify-content:center;font-weight:700;font-size:${Math.round(size * 0.37)}px;flex:none;">${esc(inicial)}</div>`;
  }

  private setCampana(c: string): void {
    this.campana = c;
    this.update();
  }

  private setBusqueda(q: string): void {
    this.busqueda = q;
    this.update();
  }

  /* ---------- MODAL NUEVA ENTREGA ---------- */
  private abrirFormulario(): void {
    const personas = this.store.personas.filter((p) => p.estado === 'activo');
    const arts = this.store.articulos.filter((a) => a.stock > 0);

    if (!personas.length) { toast('No hay personas activas registradas', 'error'); return; }
    if (!arts.length) { toast('No hay artículos con stock disponible', 'error'); return; }

    modal(`
      <h2>Registrar nueva entrega</h2>
      <p style="margin:-4px 0 18px;font-size:13px;color:var(--muted);">Selecciona el beneficiario, el artículo y la campaña.</p>

      <div class="ficha-section">
        <div class="ficha-section-title">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/></svg>
          Beneficiario
        </div>
        <div style="position:relative;margin-bottom:10px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="position:absolute;left:11px;top:50%;transform:translateY(-50%);color:var(--faint);pointer-events:none;"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input type="text" id="e-buscar-persona" placeholder="Buscar por nombre…" data-action="filtrar-persona"
            style="width:100%;padding:9px 12px 9px 33px;border:1.5px solid var(--border);border-radius:9px;font-size:13.5px;">
        </div>
        <div id="e-personas-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(155px,1fr));gap:8px;max-height:230px;overflow-y:auto;padding:2px;">
          ${this.tarjetasPersonas(personas, null)}
        </div>
        <input type="hidden" id="e-persona-id">
      </div>

      <div class="ficha-section">
        <div class="ficha-section-title">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 8.5 12 4l9 4.5M3 8.5V18l9 4.5M3 8.5l9 4.5m0 0L21 8.5M12 13v9.5M21 8.5V18l-9 4.5"/></svg>
          Artículo a entregar
        </div>
        <div style="display:grid;grid-template-columns:1fr auto;gap:10px;align-items:end;">
          <div class="form-group" style="margin:0;">
            <label>Artículo *</label>
            <select id="e-art" data-action="art-info">
              <option value="">— Selecciona —</option>
              ${arts.map((a) => `<option value="${a.id}" data-stock="${a.stock}" data-unidad="${esc(a.unidad)}" data-cat="${esc(a.categoria)}">${esc(a.nombre)} · ${a.stock} ${esc(a.unidad)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="margin:0;width:110px;">
            <label>Cantidad *</label>
            <input type="number" id="e-qty" value="1" min="1" data-action="art-info"
              style="text-align:center;font-size:16px;font-weight:700;">
          </div>
        </div>
        <div id="e-art-info" style="margin-top:8px;padding:10px 14px;background:var(--bg);border-radius:9px;font-size:13px;color:var(--muted);display:none;"></div>
      </div>

      <div class="form-grid">
        <div class="form-group">
          <label>Campaña *</label>
          <select id="e-camp">
            ${Object.keys(CAMP_COLORES).map((c) => `<option>${esc(c)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Notas / Observaciones</label>
          <input type="text" id="e-notas" placeholder="Ej: Regalo de Navidad 2026" maxlength="200">
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-outline" data-action="cerrar-modal">Cancelar</button>
        <button class="btn btn-primary" data-action="guardar-entrega">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M20 6 9 17l-5-5"/></svg>
          Registrar y descontar del almacén
        </button>
      </div>
    `, { wide: true });
  }

  private tarjetasPersonas(lista: Persona[], selId: number | null): string {
    return lista.map((p) => {
      const tc = TIPO_COLOR[p.tipo] || TIPO_COLOR.nino;
      const sel = p.id === selId;
      const partes = p.nombre.split(' ');
      return `
      <div data-action="sel-persona" data-id="${p.id}" id="ep-${p.id}"
        style="cursor:pointer;border:2px solid ${sel ? 'var(--primary)' : 'var(--border)'};border-radius:12px;padding:10px;display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center;background:${sel ? 'var(--primary-soft)' : '#fff'};transition:border .15s,background .15s;">
        ${this.avatarHtml(p.inicial, p.avatarBg, p.avatarFg, 38)}
        <div style="font-size:12.5px;font-weight:700;line-height:1.2;">${esc(partes[0])}<br><span style="font-weight:400;color:var(--muted);">${esc(partes.slice(1).join(' '))}</span></div>
        <div style="background:${tc.bg};color:${tc.fg};border-radius:20px;padding:2px 8px;font-size:10.5px;font-weight:700;">${esc(TIPO_LABEL[p.tipo] || p.tipo)}</div>
      </div>`;
    }).join('');
  }

  private filtrarPersonas(q: string): void {
    const lista = this.store.personas.filter((p) => p.estado === 'activo' &&
      (!q || p.nombre.toLowerCase().includes(q.toLowerCase())));
    const selId = Number((document.getElementById('e-persona-id') as HTMLInputElement | null)?.value) || null;
    const grid = document.getElementById('e-personas-grid');
    if (grid) grid.innerHTML = this.tarjetasPersonas(lista, selId);
  }

  private selPersona(id: number): void {
    const idInput = document.getElementById('e-persona-id') as HTMLInputElement | null;
    if (idInput) idInput.value = String(id);
    const q = (document.getElementById('e-buscar-persona') as HTMLInputElement | null)?.value || '';
    const lista = this.store.personas.filter((p) => p.estado === 'activo' &&
      (!q || p.nombre.toLowerCase().includes(q.toLowerCase())));
    const grid = document.getElementById('e-personas-grid');
    if (grid) grid.innerHTML = this.tarjetasPersonas(lista, id);
  }

  private actualizarInfoArticulo(): void {
    const sel = document.getElementById('e-art') as HTMLSelectElement | null;
    const qty = parseFloat((document.getElementById('e-qty') as HTMLInputElement | null)?.value || '') || 1;
    const info = document.getElementById('e-art-info');
    if (!sel || !info || !sel.value) { if (info) info.style.display = 'none'; return; }
    const opt = sel.options[sel.selectedIndex];
    const stock = parseFloat(opt.dataset.stock || '0') || 0;
    const unidad = opt.dataset.unidad || '';
    const cat = opt.dataset.cat || '';
    const ok = qty <= stock;
    info.style.display = 'block';
    info.style.background = ok ? 'var(--bg)' : '#FDE7E1';
    info.style.color = ok ? 'var(--muted)' : 'var(--danger)';
    info.innerHTML = ok
      ? `<b>Stock disponible:</b> ${stock} ${esc(unidad)} · <b>Categoría:</b> ${esc(cat)} · Quedarán ${stock - qty} ${esc(unidad)} después de la entrega`
      : `<b>Stock insuficiente.</b> Solo hay ${stock} ${esc(unidad)} disponibles. Reduce la cantidad.`;
  }

  /* ---------- GUARDAR ---------- */
  private async guardar(): Promise<void> {
    const personaId = Number((document.getElementById('e-persona-id') as HTMLInputElement | null)?.value);
    const artId = Number((document.getElementById('e-art') as HTMLSelectElement | null)?.value);
    const qty = parseFloat((document.getElementById('e-qty') as HTMLInputElement | null)?.value || '') || 0;
    const campana = (document.getElementById('e-camp') as HTMLSelectElement | null)?.value || 'General';
    const notas = (document.getElementById('e-notas') as HTMLInputElement | null)?.value.trim() || '';

    if (!personaId) { toast('Selecciona un beneficiario', 'error'); return; }
    if (!artId) { toast('Selecciona un artículo', 'error'); return; }
    if (qty <= 0) { toast('Ingresa una cantidad válida', 'error'); return; }

    const persona = this.store.personas.find((p) => p.id === personaId);
    const art = this.store.articulos.find((a) => a.id === artId);
    if (!persona || !art) return;

    const c = CAMP_COLORES[campana] || CAMP_COLORES.General;
    const btn = document.querySelector<HTMLButtonElement>('.modal .btn-primary');
    if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }

    const entrega: Entrega = {
      id: 0,
      fecha: '',
      personaId,
      nino: persona.nombre,
      personaTipo: persona.tipo,
      articuloId: artId,
      articulo: art.nombre,
      articuloCategoria: art.categoria,
      unidad: art.unidad,
      cantidad: qty,
      campana,
      notas,
      inicial: persona.inicial,
      avatarBg: persona.avatarBg,
      avatarFg: persona.avatarFg,
      campBg: c.bg,
      campFg: c.fg,
    };

    const res = await this.store.registrarEntrega(entrega);

    if ('error' in res) {
      toast(res.error, 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Registrar y descontar del almacén'; }
      return;
    }

    closeModal();
    toast(`${esc(art.nombre)} ×${qty} entregado a ${esc(persona.nombre)}`, 'success');
  }
}
