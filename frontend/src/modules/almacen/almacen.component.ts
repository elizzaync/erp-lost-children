/**
 * AlmacenComponent — módulo "Almacén / Inventario" migrado a la nueva
 * arquitectura (Fase 2, módulo 8).
 *
 * Diferencias clave vs modules/almacen.js legacy:
 *  - Component (mount/update/unmount) en vez de `App.register` + string HTML.
 *  - Interactividad por EVENT DELEGATION (data-action) con TRES listeners
 *    delegados en document: 'click' (botones, tabs, chips), 'input'
 *    (buscador, selects de artículo, recálculo de precio unitario) y
 *    'change' (los <input type="file"> de la imagen — igual que el legacy,
 *    que usa `onchange`, no `oninput`, para disparar el FileReader).
 *  - Lectura vía AppStore (articulos) y mutación vía AppStore.agregarArticulo
 *    / actualizarArticulo / eliminarArticulo / entradaAlmacen / salidaAlmacen
 *    — mismos efectos y eventos que el legacy con DB.*.
 *  - La subida de imagen (POST /articulos/<id>/imagen) usa un
 *    ArticulosRepository propio construido con el ApiClient inyectado (mismo
 *    patrón que Alimentación con AlimentacionRepository), cuyo método
 *    `subirImagen()` llama a `api.postForm()` — éste ya agrega el header
 *    Authorization que el legacy omitía (bug corregido en el ApiClient
 *    nuevo). El preview de imagen ANTES de subir (FileReader) es 100% local
 *    y no toca el backend, igual que el legacy.
 *  - Como el AppStore no expone un método de "solo actualizar el campo
 *    imagen en caché", tras subir la imagen se muta el artículo cacheado
 *    (`store.articulos` es la misma referencia de array que usa el AppStore)
 *    y se dispara `store.emit('almacen:update')` — `emit` ya es parte de la
 *    superficie pública del AppStore (bus de eventos), así que esto no
 *    requiere tocar app-store.ts.
 *  - esc() en todo dato que viene de la base de datos.
 */
import { Component, resolveApiBase } from '@core/index';
import type { ApiClient } from '@core/index';
import type { AppStore } from '@store/app-store';
import { ArticulosRepository } from '@domain/articulos/articulos.repository';
import type { Articulo } from '@domain/articulos/articulos.types';
import { Auth } from '@shell/auth';
import { esc, toast, modal, closeModal } from '@shell/ui';

const CATEGORIAS = ['Alimentos', 'Proteínas', 'Condimentos', 'Útiles', 'Higiene', 'Regalos', 'Otros'];
const UNIDADES = ['kg', 'g', 'lts', 'ml', 'uds', 'paquetes', 'cajas', 'bolsas', 'latas', 'docenas'];

/** Precio de referencia por categoría para estimar el valor del inventario
 *  cuando el artículo no tiene precio unitario registrado — réplica exacta
 *  de la tabla hardcodeada del legacy. */
const PRECIO_REF: Record<string, number> = {
  Alimentos: 2.5, Proteínas: 6, Condimentos: 4, Útiles: 3, Higiene: 3, Regalos: 15, Otros: 2,
};

export class AlmacenComponent extends Component {
  private readonly repo: ArticulosRepository;
  private readonly apiBase = resolveApiBase();
  private search = '';
  private catFiltro = 'todas';
  private readonly unsubs: Array<() => void> = [];
  private readonly onClick = (e: Event) => this.handleClick(e);
  private readonly onInput = (e: Event) => this.handleInput(e);
  private readonly onChange = (e: Event) => this.handleChange(e);

  constructor(private readonly store: AppStore, api: ApiClient) {
    super();
    this.repo = new ArticulosRepository(api);
  }

  protected override onMount(): void {
    document.addEventListener('click', this.onClick);
    document.addEventListener('input', this.onInput);
    document.addEventListener('change', this.onChange);
    for (const evento of ['almacen:update', 'entregas:update', 'alimentacion:update'] as const) {
      this.unsubs.push(this.store.on(evento, () => this.update()));
    }
  }

  protected override onUnmount(): void {
    document.removeEventListener('click', this.onClick);
    document.removeEventListener('input', this.onInput);
    document.removeEventListener('change', this.onChange);
    for (const unsub of this.unsubs) unsub();
    this.unsubs.length = 0;
  }

  /* ---------- Delegación de eventos ---------- */
  private handleClick(e: Event): void {
    const target = (e.target as HTMLElement)?.closest<HTMLElement>('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    const id = target.dataset.id ? Number(target.dataset.id) : undefined;
    switch (action) {
      case 'abrir-entrada': this.abrirEntrada(id); break;
      case 'abrir-salida': this.abrirSalida(id); break;
      case 'editar-articulo': if (id != null) this.abrirFormArticulo(id); break;
      case 'set-cat': if (target.dataset.cat) this.setCatFiltro(target.dataset.cat); break;
      case 'cerrar-modal': closeModal(); break;
      case 'click-file-input': {
        const targetId = target.dataset.target;
        if (targetId) document.getElementById(targetId)?.click();
        break;
      }
      case 'guardar-articulo': void this.guardarArticulo(id); break;
      case 'confirmar-eliminar': if (id != null) this.confirmarEliminar(id); break;
      case 'do-eliminar': if (id != null) void this.doEliminar(id); break;
      case 'set-origen': if (target.dataset.origen) this.setOrigen(target.dataset.origen); break;
      case 'set-articulo-mode': if (target.dataset.mode) this.setArticuloMode(target.dataset.mode); break;
      case 'guardar-entrada': void this.guardarEntrada(); break;
      case 'guardar-salida': void this.guardarSalida(); break;
    }
  }

  private handleInput(e: Event): void {
    const target = (e.target as HTMLElement)?.closest<HTMLElement>('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    switch (action) {
      case 'buscar': this.setSearch((target as HTMLInputElement).value); break;
      case 'calc-precio-unit': this.calcPrecioUnit(); break;
      case 'mostrar-stock-ent': this.showStockInfo('ent'); break;
      case 'mostrar-stock-sal': this.showStockInfo('sal'); break;
    }
  }

  private handleChange(e: Event): void {
    const target = (e.target as HTMLElement)?.closest<HTMLElement>('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    if (action === 'preview-imagen') this.previewImagen(target as HTMLInputElement, 'art-img-wrap');
    else if (action === 'preview-nuevo-img') this.previewImagen(target as HTMLInputElement, 'ent-nuevo-img-wrap');
  }

  /* ---------- RENDER PRINCIPAL ---------- */
  protected render(): string {
    const cats = ['todas', ...CATEGORIAS];
    const lista = this.store.articulos.filter((a) => {
      if (this.catFiltro !== 'todas' && a.categoria !== this.catFiltro) return false;
      if (this.search) {
        const s = this.search.toLowerCase();
        return a.nombre.toLowerCase().includes(s) || a.categoria.toLowerCase().includes(s);
      }
      return true;
    });

    const criticos = this.store.articulos.filter((a) => a.stock < a.minimo).length;
    const valorTotal = this.store.articulos.reduce((s, a) => s + a.stock * (PRECIO_REF[a.categoria] || 3), 0);
    const puedeEscribir = Auth.canWrite('almacen');

    return `
    <div class="page-header">
      <div>
        <h1>Almacén / Inventario</h1>
        <p>Entradas, salidas y control de stock mínimo</p>
      </div>
      ${puedeEscribir ? `
      <div style="margin-left:auto;display:flex;gap:8px;">
        <button class="btn btn-outline" data-action="abrir-salida">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2.2"><path d="M12 19V5M5 12l7 7 7-7"/></svg>Salida
        </button>
        <button class="btn btn-outline" data-action="abrir-entrada">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2.2"><path d="M12 5v14M5 12h14"/></svg>Entrada
        </button>
      </div>` : `<div style="margin-left:auto;"><span style="font-size:12px;background:var(--line);padding:5px 12px;border-radius:20px;color:var(--muted);">Solo lectura</span></div>`}
    </div>

    <div class="kpi-grid cols-3">
      <div class="kpi-card"><div class="label">Artículos en catálogo</div><div class="value" style="font-size:30px;">${this.store.articulos.length}</div></div>
      <div class="kpi-card"><div class="label">Por agotarse</div><div class="value" style="font-size:30px;color:var(--danger);">${criticos}</div>${criticos ? `<div class="sub" style="color:var(--danger);">Requieren reposición urgente</div>` : ''}</div>
      <div class="kpi-card"><div class="label">Valor estimado del inventario</div><div class="value" style="font-size:30px;">$${Math.round(valorTotal).toLocaleString()}</div></div>
    </div>

    <div class="filter-row">
      <div class="search-box" style="width:280px;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--faint)" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/></svg>
        <input type="text" id="alm-search" placeholder="Buscar artículo o categoría…" value="${esc(this.search)}" data-action="buscar">
      </div>
      ${cats.map((c) => `<button class="filter-chip ${this.catFiltro === c ? 'active' : ''}" data-action="set-cat" data-cat="${esc(c)}">${c === 'todas' ? 'Todas' : esc(c)}</button>`).join('')}
    </div>

    <div class="table-card">
      <div class="table-head" style="grid-template-columns:2.2fr 1fr 1.7fr .8fr .8fr .7fr 110px;">
        <span>Artículo</span><span>Categoría</span><span>Stock vs. mínimo</span><span>Unidad</span><span>Precio</span><span>Vence</span><span></span>
      </div>
      ${lista.length ? lista.map((a) => this.filaHtml(a, puedeEscribir)).join('') : `<div style="padding:40px;text-align:center;color:var(--faint);font-size:14px;">No hay artículos con ese filtro.</div>`}
    </div>`;
  }

  private filaHtml(a: Articulo, puedeEscribir: boolean): string {
    const pct = Math.min(100, Math.round((a.stock / (a.minimo || 1)) * 100));
    const bad = a.stock < a.minimo;
    const warn = !bad && a.stock < a.minimo * 1.3;
    const col = bad ? 'var(--danger)' : warn ? 'var(--warn)' : 'var(--success)';
    const imgSrc = a.imagen ? this.apiBase + a.imagen : '';
    return `
    <div class="table-row" style="grid-template-columns:2.2fr 1fr 1.7fr .8fr .8fr .7fr 110px;">
      <div style="display:flex;align-items:center;gap:10px;">
        ${imgSrc
          ? `<img src="${esc(imgSrc)}" style="width:38px;height:38px;border-radius:8px;object-fit:cover;flex:none;border:1px solid var(--border);">`
          : `<div style="width:38px;height:38px;border-radius:8px;background:var(--bg);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;flex:none;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--faint)" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            </div>`}
        <div>
          <div style="font-size:14px;font-weight:600;">${esc(a.nombre)}</div>
          <div style="font-size:11.5px;color:var(--faint);">${a.codigo ? '#' + esc(a.codigo) : esc(a.proveedor || '—')}</div>
        </div>
      </div>
      <span style="font-size:13px;color:var(--muted);">${esc(a.categoria)}</span>
      <div style="padding-right:16px;">
        <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:5px;">
          <b style="color:${col};">${a.stock}</b><span style="color:var(--faint);">mín ${a.minimo}</span>
        </div>
        <div class="progress-bar" style="height:7px;"><div class="progress-fill" style="width:${pct}%;background:${col};"></div></div>
      </div>
      <span style="font-size:13px;color:var(--muted);">${esc(a.unidad)}</span>
      <span style="font-size:13px;color:var(--muted);">${a.precio > 0 ? '$' + a.precio.toFixed(2) : '—'}</span>
      <span style="font-size:12.5px;color:var(--muted);">${esc(a.vence) || '—'}</span>
      <div style="display:flex;gap:4px;">
        ${puedeEscribir ? `
        <button class="btn btn-sm btn-outline" style="padding:6px 8px;" title="Entrada" data-action="abrir-entrada" data-id="${a.id}">+</button>
        <button class="btn btn-sm btn-outline" style="padding:6px 8px;color:var(--danger);" title="Salida" data-action="abrir-salida" data-id="${a.id}">−</button>
        <button class="btn btn-sm btn-outline" style="padding:6px 8px;" title="Editar" data-action="editar-articulo" data-id="${a.id}">✎</button>
        ` : ''}
      </div>
    </div>`;
  }

  private setSearch(v: string): void {
    this.search = v;
    this.update();
  }

  private setCatFiltro(v: string): void {
    this.catFiltro = v;
    this.update();
  }

  /* ---------- NUEVO / EDITAR ARTÍCULO ---------- */
  private abrirFormArticulo(id?: number): void {
    const a = id != null ? this.store.articulos.find((x) => x.id === id) ?? null : null;
    const imgUrl = a && a.imagen ? this.apiBase + a.imagen : '';

    modal(`
      <h2 style="margin:0 0 4px;">${a ? 'Editar artículo' : 'Nuevo artículo'}</h2>
      <p style="margin:0 0 18px;font-size:13px;color:var(--muted);">Completa la ficha del producto para el inventario.</p>

      <!-- Imagen -->
      <div style="display:flex;gap:18px;align-items:flex-start;margin-bottom:18px;">
        <div id="art-img-wrap" data-action="click-file-input" data-target="art-img-input"
          style="width:96px;height:96px;border-radius:14px;border:2px dashed var(--border);
                 background:var(--bg);display:flex;align-items:center;justify-content:center;
                 cursor:pointer;flex:none;overflow:hidden;">
          ${imgUrl
            ? `<img id="art-img-preview" src="${esc(imgUrl)}" style="width:100%;height:100%;object-fit:cover;">`
            : `<div id="art-img-placeholder" style="text-align:center;padding:10px;">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--faint)" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                <div style="font-size:10.5px;color:var(--faint);margin-top:4px;">Agregar foto</div>
              </div>`}
        </div>
        <input type="file" id="art-img-input" accept="image/*" style="display:none" data-action="preview-imagen">
        <div style="flex:1;">
          <div class="form-group" style="margin-bottom:10px;">
            <label>Nombre del artículo *</label>
            <input type="text" id="art-nombre" value="${esc(a ? a.nombre : '')}" placeholder="Ej: Arroz blanco parboil">
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label>Código / Referencia</label>
            <input type="text" id="art-codigo" value="${esc(a ? a.codigo : '')}" placeholder="Ej: ALM-001">
          </div>
        </div>
      </div>

      <!-- Clasificación -->
      <div class="ficha-section">
        <div class="ficha-section-title">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
          Clasificación
        </div>
        <div class="form-grid">
          <div class="form-group"><label>Categoría *</label>
            <select id="art-cat">
              ${CATEGORIAS.map((c) => `<option value="${esc(c)}" ${a && a.categoria === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label>Unidad de medida *</label>
            <select id="art-unidad">
              ${UNIDADES.map((u) => `<option value="${esc(u)}" ${a && a.unidad === u ? 'selected' : ''}>${esc(u)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-group"><label>Descripción</label>
          <textarea id="art-desc" rows="2" placeholder="Marca, presentación, características relevantes…">${esc(a ? a.descripcion : '')}</textarea>
        </div>
      </div>

      <!-- Stock y alertas -->
      <div class="ficha-section">
        <div class="ficha-section-title">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 8.5 12 4l9 4.5M3 8.5V18l9 4.5M3 8.5l9 4.5m0 0L21 8.5M12 13v9.5M21 8.5V18l-9 4.5"/></svg>
          Stock y alertas
        </div>
        <div class="form-grid">
          <div class="form-group">
            <label>${a ? 'Stock actual' : 'Stock inicial'} *</label>
            <input type="number" id="art-stock" value="${a ? a.stock : 0}" min="0" step="0.1" placeholder="0">
          </div>
          <div class="form-group">
            <label>Stock mínimo *</label>
            <input type="number" id="art-min" value="${a ? a.minimo : 10}" min="0" step="0.1" placeholder="10">
            <div style="font-size:11.5px;color:var(--faint);margin-top:4px;">Alerta cuando baje de este nivel</div>
          </div>
        </div>
        <div class="form-grid">
          <div class="form-group">
            <label>Fecha de vencimiento</label>
            <input type="date" id="art-vence" value="${esc(a && a.vence && a.vence !== '—' ? a.vence : '')}">
          </div>
          <div class="form-group">
            <label>Ubicación en depósito</label>
            <input type="text" id="art-ubicacion" value="${esc(a ? a.ubicacion : '')}" placeholder="Ej: Estante A, Fila 2">
          </div>
        </div>
      </div>

      <!-- Proveeduría y costo -->
      <div class="ficha-section">
        <div class="ficha-section-title">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
          Proveeduría y costo
        </div>
        <div class="form-grid">
          <div class="form-group">
            <label>Proveedor habitual</label>
            <input type="text" id="art-prov" value="${esc(a ? a.proveedor : '')}" placeholder="Ej: Mercado Central, Donación…">
          </div>
          <div class="form-group">
            <label>Precio unitario ($)</label>
            <input type="number" id="art-precio" value="${a ? a.precio : 0}" min="0" step="0.01" placeholder="0.00">
          </div>
        </div>
      </div>

      <div class="modal-footer">
        ${a ? `<button class="btn btn-danger-outline" data-action="confirmar-eliminar" data-id="${a.id}">Eliminar</button>` : ''}
        <button class="btn btn-outline" data-action="cerrar-modal">Cancelar</button>
        <button class="btn btn-primary" data-action="guardar-articulo" ${id != null ? `data-id="${id}"` : ''}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8M7 3v5h8"/></svg>
          ${a ? 'Guardar cambios' : 'Agregar al catálogo'}
        </button>
      </div>`, { wide: true });
  }

  /** Preview 100% local (FileReader) — no toca el backend. */
  private previewImagen(input: HTMLInputElement, wrapId: string): void {
    if (!input.files || !input.files[0]) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const wrap = document.getElementById(wrapId);
      if (wrap) wrap.innerHTML = `<img src="${e.target?.result}" style="width:100%;height:100%;object-fit:cover;">`;
    };
    reader.readAsDataURL(input.files[0]);
  }

  private async guardarArticulo(id?: number): Promise<void> {
    const val = (elId: string) => (document.getElementById(elId) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null)?.value ?? '';
    const nombre = val('art-nombre').trim();
    if (!nombre) { toast('El nombre es obligatorio', 'error'); return; }

    const campos = {
      nombre,
      categoria: val('art-cat'),
      unidad: val('art-unidad'),
      stock: parseFloat(val('art-stock')) || 0,
      minimo: parseFloat(val('art-min')) || 0,
      vence: val('art-vence') || '—',
      descripcion: val('art-desc').trim(),
      codigo: val('art-codigo').trim(),
      ubicacion: val('art-ubicacion').trim(),
      proveedor: val('art-prov').trim(),
      precio: parseFloat(val('art-precio')) || 0,
    };

    const esEdicion = id != null;
    const btn = document.querySelector<HTMLButtonElement>('.modal .btn-primary');
    if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }

    let artId: number | undefined = id;
    if (esEdicion && id != null) {
      await this.store.actualizarArticulo(id, campos);
      toast(`"${esc(nombre)}" actualizado`);
    } else {
      const art = await this.store.agregarArticulo({ id: 0, imagen: '', ...campos });
      artId = art.id;
      toast(`"${esc(nombre)}" agregado al catálogo`);
    }

    await this.subirImagenSiHay('art-img-input', artId);
    closeModal();
  }

  /** Sube la imagen seleccionada (si hay) y refresca la caché del artículo. */
  private async subirImagenSiHay(inputId: string, artId?: number): Promise<void> {
    const fileInput = document.getElementById(inputId) as HTMLInputElement | null;
    const file = fileInput?.files?.[0];
    if (!file || artId == null) return;
    try {
      const res = await this.repo.subirImagen(artId, file);
      if (res && res.ok && res.url) {
        const art = this.store.articulos.find((a) => a.id === artId);
        if (art) art.imagen = res.url;
        this.store.emit('almacen:update');
      }
    } catch {
      /* upload falló silenciosamente, igual que el legacy */
    }
  }

  private confirmarEliminar(id: number): void {
    const a = this.store.articulos.find((x) => x.id === id);
    if (!a) return;
    modal(`
      <h2>Eliminar artículo</h2>
      <p style="color:var(--muted);margin-bottom:20px;">¿Eliminar <b>${esc(a.nombre)}</b> del catálogo?<br><br>
        <span style="color:var(--danger);font-size:13px;">Se eliminará el artículo y su historial de stock. Las entregas y servicios previos no se modifican.</span></p>
      <div class="modal-footer">
        <button class="btn btn-outline" data-action="cerrar-modal">Cancelar</button>
        <button class="btn" style="background:#fd4c5c;color:#fff;" data-action="do-eliminar" data-id="${id}">Sí, eliminar</button>
      </div>`, { narrow: true });
  }

  private async doEliminar(id: number): Promise<void> {
    const a = this.store.articulos.find((x) => x.id === id);
    const nombre = a?.nombre || '';
    await this.store.eliminarArticulo(id);
    closeModal();
    toast(`"${esc(nombre)}" eliminado del catálogo`, 'warn');
  }

  /* ---------- ENTRADA ---------- */
  private abrirEntrada(preId?: number): void {
    modal(`
      <h2>Registrar entrada al almacén</h2>

      <!-- TIPO: COMPRA o DONACIÓN -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">
        <label id="ent-tab-compra" data-action="set-origen" data-origen="compra"
          style="cursor:pointer;border:2px solid var(--primary);border-radius:12px;padding:13px 16px;background:var(--primary-soft);display:flex;align-items:center;gap:10px;">
          <input type="radio" name="ent-origen" value="compra" checked style="accent-color:var(--primary);width:16px;height:16px;">
          <div>
            <div style="font-weight:700;font-size:14px;color:var(--primary);">Compra</div>
            <div style="font-size:12px;color:var(--muted);">Genera gasto automático</div>
          </div>
        </label>
        <label id="ent-tab-donacion" data-action="set-origen" data-origen="donacion"
          style="cursor:pointer;border:2px solid var(--border);border-radius:12px;padding:13px 16px;display:flex;align-items:center;gap:10px;">
          <input type="radio" name="ent-origen" value="donacion" style="accent-color:var(--success);width:16px;height:16px;">
          <div>
            <div style="font-weight:700;font-size:14px;">Donación</div>
            <div style="font-size:12px;color:var(--muted);">Solo suma stock · sin gasto</div>
          </div>
        </label>
      </div>

      <!-- ARTÍCULO: EXISTENTE o NUEVO -->
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
        <span style="font-size:13px;font-weight:600;color:var(--muted);">Artículo:</span>
        <button id="ent-tab-existente" data-action="set-articulo-mode" data-mode="existente"
          style="padding:5px 14px;border-radius:20px;border:none;background:var(--ink);color:#fff;font-size:12.5px;font-weight:700;cursor:pointer;">
          Existente
        </button>
        <button id="ent-tab-nuevo" data-action="set-articulo-mode" data-mode="nuevo"
          style="padding:5px 14px;border-radius:20px;border:1.5px solid var(--border);background:transparent;font-size:12.5px;font-weight:700;cursor:pointer;color:var(--muted);">
          + Artículo nuevo
        </button>
      </div>

      <!-- ARTÍCULO EXISTENTE -->
      <div id="ent-wrap-existente">
        <div class="form-group">
          <label>Artículo *</label>
          <select id="ent-art" data-action="mostrar-stock-ent">
            ${this.store.articulos.map((a) => `<option value="${a.id}" ${a.id === preId ? 'selected' : ''}>${esc(a.nombre)} (stock: ${a.stock} ${esc(a.unidad)})</option>`).join('')}
          </select>
        </div>
      </div>

      <!-- ARTÍCULO NUEVO (oculto por defecto) -->
      <div id="ent-wrap-nuevo" style="display:none;">
        <div style="background:#fff6dc;border:1.5px solid var(--warn);border-radius:10px;padding:10px 14px;margin-bottom:12px;font-size:12.5px;color:#7a5800;">
          El artículo se creará en el inventario y se le sumará el stock de esta entrada.
        </div>
        <div style="display:flex;gap:14px;align-items:flex-start;">
          <!-- Imagen -->
          <div>
            <div id="ent-nuevo-img-wrap" data-action="click-file-input" data-target="ent-nuevo-img-input"
              style="width:88px;height:88px;border-radius:12px;border:2px dashed var(--border);background:var(--bg);display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;overflow:hidden;flex-shrink:0;">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--faint)" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
              <span style="font-size:10px;color:var(--faint);margin-top:4px;">Foto</span>
            </div>
            <input type="file" id="ent-nuevo-img-input" accept="image/*" style="display:none" data-action="preview-nuevo-img">
          </div>
          <!-- Campos -->
          <div style="flex:1;display:flex;flex-direction:column;gap:10px;">
            <div class="form-grid" style="margin:0;">
              <div class="form-group" style="margin:0;">
                <label>Nombre del artículo *</label>
                <input type="text" id="ent-nuevo-nombre" placeholder="Ej: Aceite de oliva">
              </div>
              <div class="form-group" style="margin:0;">
                <label>Categoría *</label>
                <select id="ent-nuevo-cat">
                  ${CATEGORIAS.map((c) => `<option>${esc(c)}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="form-grid" style="margin:0;">
              <div class="form-group" style="margin:0;">
                <label>Unidad de medida *</label>
                <select id="ent-nuevo-unidad">
                  ${UNIDADES.map((u) => `<option>${esc(u)}</option>`).join('')}
                </select>
              </div>
              <div class="form-group" style="margin:0;">
                <label>Stock mínimo <span style="font-weight:400;color:var(--faint);">opcional</span></label>
                <input type="number" id="ent-nuevo-min" min="0" placeholder="0">
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- CANTIDAD + COSTO -->
      <div class="form-grid">
        <div class="form-group">
          <label>Cantidad *</label>
          <input type="number" id="ent-qty" min="0.01" step="0.01" placeholder="0" data-action="calc-precio-unit">
        </div>
        <div class="form-group" id="ent-costo-wrap">
          <label>Costo total pagado ($) *</label>
          <input type="number" id="ent-costo" min="0" step="0.01" placeholder="0.00" data-action="calc-precio-unit">
        </div>
        <div class="form-group" id="ent-valor-wrap" style="display:none;">
          <label>Valor estimado ($) <span style="font-weight:400;color:var(--faint);">opcional</span></label>
          <input type="number" id="ent-valor" min="0" step="0.01" placeholder="0.00">
        </div>
      </div>

      <!-- Precio unitario calculado -->
      <div id="ent-preciounit-wrap" style="background:var(--primary-soft);border-radius:10px;padding:11px 16px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;">
        <div style="font-size:13px;color:var(--primary-d);">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:4px;"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
          Precio por unidad calculado
        </div>
        <div id="ent-preciounit" style="font-size:20px;font-weight:800;color:var(--primary);">—</div>
      </div>

      <div class="form-grid">
        <div class="form-group">
          <label id="ent-prov-label">Proveedor *</label>
          <input type="text" id="ent-prov" placeholder="Mercado Central…">
        </div>
        <div class="form-group">
          <label>Observación <span style="font-weight:400;color:var(--faint);">opcional</span></label>
          <input type="text" id="ent-obs" placeholder="Ej: Lote 2026-07">
        </div>
      </div>

      <div id="ent-info" style="font-size:12.5px;color:var(--muted);margin-bottom:6px;"></div>

      <div class="modal-footer">
        <button class="btn btn-outline" data-action="cerrar-modal">Cancelar</button>
        <button class="btn btn-primary" id="ent-btn-guardar" data-action="guardar-entrada">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M20 6 9 17l-5-5"/></svg>
          Registrar compra
        </button>
      </div>
    `, { wide: true });
    setTimeout(() => { this.showStockInfo('ent'); this.calcPrecioUnit(); }, 50);
  }

  private setArticuloMode(mode: string): void {
    const esNuevo = mode === 'nuevo';
    const wrapE = document.getElementById('ent-wrap-existente');
    const wrapN = document.getElementById('ent-wrap-nuevo');
    const btnE = document.getElementById('ent-tab-existente');
    const btnN = document.getElementById('ent-tab-nuevo');
    const info = document.getElementById('ent-info');
    if (wrapE) wrapE.style.display = esNuevo ? 'none' : '';
    if (wrapN) wrapN.style.display = esNuevo ? '' : 'none';
    if (btnE) { btnE.style.background = esNuevo ? 'transparent' : 'var(--ink)'; btnE.style.color = esNuevo ? 'var(--muted)' : '#fff'; btnE.style.border = esNuevo ? '1.5px solid var(--border)' : 'none'; }
    if (btnN) { btnN.style.background = esNuevo ? 'var(--ink)' : 'transparent'; btnN.style.color = esNuevo ? '#fff' : 'var(--muted)'; btnN.style.border = esNuevo ? 'none' : '1.5px solid var(--border)'; }
    if (info) { if (esNuevo) info.textContent = ''; else this.showStockInfo('ent'); }
  }

  private setOrigen(origen: string): void {
    const esCompra = origen === 'compra';
    const tabC = document.getElementById('ent-tab-compra');
    const tabD = document.getElementById('ent-tab-donacion');
    if (tabC) { tabC.style.borderColor = esCompra ? 'var(--primary)' : 'var(--border)'; tabC.style.background = esCompra ? 'var(--primary-soft)' : ''; }
    if (tabD) { tabD.style.borderColor = !esCompra ? 'var(--success)' : 'var(--border)'; tabD.style.background = !esCompra ? '#edfde0' : ''; }
    const costoWrap = document.getElementById('ent-costo-wrap');
    const valorWrap = document.getElementById('ent-valor-wrap');
    const precioWrap = document.getElementById('ent-preciounit-wrap');
    const label = document.getElementById('ent-prov-label');
    const btn = document.getElementById('ent-btn-guardar');
    if (costoWrap) costoWrap.style.display = esCompra ? '' : 'none';
    if (valorWrap) valorWrap.style.display = esCompra ? 'none' : '';
    if (precioWrap) precioWrap.style.display = esCompra ? '' : 'none';
    if (label) label.textContent = esCompra ? 'Proveedor *' : 'Donante / Organización';
    if (btn) btn.textContent = esCompra ? '✓ Registrar compra' : '✓ Registrar donación';
    this.calcPrecioUnit();
  }

  private calcPrecioUnit(): void {
    const qty = parseFloat((document.getElementById('ent-qty') as HTMLInputElement | null)?.value || '') || 0;
    const costo = parseFloat((document.getElementById('ent-costo') as HTMLInputElement | null)?.value || '') || 0;
    const el = document.getElementById('ent-preciounit');
    if (!el) return;
    if (qty > 0 && costo > 0) {
      const unit = costo / qty;
      el.textContent = '$' + unit.toFixed(unit < 1 ? 4 : 2);
    } else {
      el.textContent = '—';
    }
  }

  private async guardarEntrada(): Promise<void> {
    const origen = (document.querySelector('input[name="ent-origen"]:checked') as HTMLInputElement | null)?.value || 'compra';
    const esCompra = origen === 'compra';
    const modeNuevo = document.getElementById('ent-wrap-nuevo')?.style.display !== 'none';

    const qty = parseFloat((document.getElementById('ent-qty') as HTMLInputElement | null)?.value || '0');
    const prov = (document.getElementById('ent-prov') as HTMLInputElement | null)?.value.trim() || '';
    const costoTotal = esCompra
      ? parseFloat((document.getElementById('ent-costo') as HTMLInputElement | null)?.value || '0')
      : parseFloat((document.getElementById('ent-valor') as HTMLInputElement | null)?.value || '0');

    if (!qty || qty <= 0) { toast('Ingresa una cantidad válida', 'error'); return; }
    if (esCompra && costoTotal <= 0) { toast('Ingresa el costo total de la compra', 'error'); return; }
    if (esCompra && !prov) { toast('Ingresa el nombre del proveedor', 'error'); return; }

    let artId: number | undefined;
    let artNombre = '';
    let artUnidad = '';

    if (modeNuevo) {
      const nombre = (document.getElementById('ent-nuevo-nombre') as HTMLInputElement | null)?.value.trim() || '';
      const cat = (document.getElementById('ent-nuevo-cat') as HTMLSelectElement | null)?.value || CATEGORIAS[0];
      const unidad = (document.getElementById('ent-nuevo-unidad') as HTMLSelectElement | null)?.value || UNIDADES[0];
      const minimo = parseFloat((document.getElementById('ent-nuevo-min') as HTMLInputElement | null)?.value || '0');
      if (!nombre) { toast('Ingresa el nombre del artículo', 'error'); return; }
      const precioUnit = esCompra && costoTotal > 0 ? costoTotal / qty : 0;
      const nuevoArt = await this.store.agregarArticulo({
        id: 0, nombre, categoria: cat, unidad, stock: 0, minimo, vence: '—',
        precio: precioUnit, descripcion: '', proveedor: prov,
        codigo: '', ubicacion: '', imagen: '',
      });
      artId = nuevoArt.id;
      artNombre = nuevoArt.nombre;
      artUnidad = nuevoArt.unidad;
      await this.subirImagenSiHay('ent-nuevo-img-input', artId);
    } else {
      const id = Number((document.getElementById('ent-art') as HTMLSelectElement | null)?.value);
      const art = this.store.articulos.find((a) => a.id === id);
      if (!art) { toast('Selecciona un artículo', 'error'); return; }
      artId = art.id;
      artNombre = art.nombre;
      artUnidad = art.unidad;
    }

    const btn = document.getElementById('ent-btn-guardar') as HTMLButtonElement | null;
    if (btn) btn.disabled = true;

    if (artId == null) { if (btn) btn.disabled = false; return; }
    const res = await this.store.entradaAlmacen(artId, qty, origen, costoTotal, prov);
    if (!res) { toast('No se pudo registrar la entrada', 'error'); if (btn) btn.disabled = false; return; }
    closeModal();

    if (esCompra) {
      const unit = costoTotal / qty;
      toast(`Compra: +${qty} ${esc(artUnidad)} de ${esc(artNombre)} · $${costoTotal.toFixed(2)} ($${unit.toFixed(2)}/${esc(artUnidad)}) · gasto registrado`, 'success');
    } else {
      const esNuevo = modeNuevo ? ' (artículo creado)' : '';
      toast(`Donación: +${qty} ${esc(artUnidad)} de ${esc(artNombre)}${prov ? ' de ' + esc(prov) : ''}${esNuevo}`, 'success');
    }
  }

  /* ---------- SALIDA ---------- */
  private abrirSalida(preId?: number): void {
    modal(`
      <h2>Registrar salida del almacén</h2>
      <div class="form-group">
        <label>Artículo *</label>
        <select id="sal-art" data-action="mostrar-stock-sal">
          ${this.store.articulos.map((a) => `<option value="${a.id}" ${a.id === preId ? 'selected' : ''}>${esc(a.nombre)} (disponible: ${a.stock} ${esc(a.unidad)})</option>`).join('')}
        </select>
      </div>
      <div class="form-grid">
        <div class="form-group">
          <label>Cantidad a retirar *</label>
          <input type="number" id="sal-qty" min="1" placeholder="0">
          <div id="sal-info" style="font-size:12px;color:var(--muted);margin-top:4px;"></div>
        </div>
        <div class="form-group">
          <label>Motivo</label>
          <select id="sal-motivo">
            <option>Servicio de alimentación</option>
            <option>Entrega a beneficiario</option>
            <option>Consumo propio</option>
            <option>Merma / vencimiento</option>
            <option>Otro</option>
          </select>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" data-action="cerrar-modal">Cancelar</button>
        <button class="btn btn-danger-outline" data-action="guardar-salida">Registrar salida</button>
      </div>`);
    setTimeout(() => this.showStockInfo('sal'), 50);
  }

  private async guardarSalida(): Promise<void> {
    const id = Number((document.getElementById('sal-art') as HTMLSelectElement | null)?.value);
    const qty = parseFloat((document.getElementById('sal-qty') as HTMLInputElement | null)?.value || '0');
    const motivo = (document.getElementById('sal-motivo') as HTMLSelectElement | null)?.value || 'Salida manual';
    if (!qty || qty <= 0) { toast('Ingresa una cantidad válida', 'error'); return; }
    const art = this.store.articulos.find((a) => a.id === id);
    if (!art) return;

    const btn = document.querySelector<HTMLButtonElement>('.modal .btn-danger-outline');
    if (btn) { btn.disabled = true; btn.textContent = 'Registrando…'; }

    const res = await this.store.salidaAlmacen(id, qty, motivo);
    if ('error' in res) {
      toast(res.error, 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Registrar salida'; }
      return;
    }
    closeModal();
    toast(`−${qty} ${esc(art.unidad)} de ${esc(art.nombre)} registrado`, 'warn');
  }

  /* ---------- HELPERS ---------- */
  private showStockInfo(prefix: 'ent' | 'sal'): void {
    const sel = document.getElementById(`${prefix}-art`) as HTMLSelectElement | null;
    const info = document.getElementById(`${prefix}-info`);
    if (!sel || !info) return;
    const art = this.store.articulos.find((a) => a.id === Number(sel.value));
    if (art) info.textContent = `Disponible: ${art.stock} ${art.unidad} · mínimo: ${art.minimo}`;
  }
}
