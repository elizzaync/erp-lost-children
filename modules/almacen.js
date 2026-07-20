/* ============================================================
   modules/almacen.js
   Depende de: DB.articulos
   Emite:    almacen:update (vía DB.entradaAlmacen / salidaAlmacen / agregarArticulo)
   Escucha:  almacen:update, entregas:update, alimentacion:update
   ============================================================ */
App.register('almacen', (function () {

  let _search = '';
  let _catFilter = 'todas';

  const CATEGORIAS = ['Alimentos','Proteínas','Condimentos','Útiles','Higiene','Regalos','Otros'];
  const UNIDADES   = ['kg','g','lts','ml','uds','paquetes','cajas','bolsas','latas','docenas'];

  ['almacen:update','entregas:update','alimentacion:update'].forEach(ev => {
    DB.on(ev, () => { if (App.isActive('almacen')) App.refresh(); });
  });

  /* ── RENDER ─────────────────────────────────────────────────── */
  function render() {
    const cats = ['todas', ...CATEGORIAS];
    const lista = DB.articulos.filter(a => {
      if (_catFilter !== 'todas' && a.categoria !== _catFilter) return false;
      if (_search) {
        const s = _search.toLowerCase();
        return a.nombre.toLowerCase().includes(s) || a.categoria.toLowerCase().includes(s);
      }
      return true;
    });

    const criticos = DB.articulos.filter(a => a.stock < a.minimo).length;
    const valorTotal = DB.articulos.reduce((s, a) => {
      const precio = {Alimentos:2.5,Proteínas:6,Condimentos:4,Útiles:3,Higiene:3,Regalos:15,Otros:2}[a.categoria] || 3;
      return s + a.stock * precio;
    }, 0);

    return `
    <div class="page-header">
      <div>
        <h1>Almacén / Inventario</h1>
        <p>Entradas, salidas y control de stock mínimo</p>
      </div>
      ${(!window.Auth || Auth.canWrite('almacen')) ? `
      <div style="margin-left:auto;display:flex;gap:8px;">
        <button class="btn btn-outline" onclick="AlmacenModule.abrirSalida()">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2.2"><path d="M12 19V5M5 12l7 7 7-7"/></svg>Salida
        </button>
        <button class="btn btn-outline" onclick="AlmacenModule.abrirEntrada()">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2.2"><path d="M12 5v14M5 12h14"/></svg>Entrada
        </button>
      </div>` : `<div style="margin-left:auto;"><span style="font-size:12px;background:var(--line);padding:5px 12px;border-radius:20px;color:var(--muted);">Solo lectura</span></div>`}
    </div>

    <div class="kpi-grid cols-3">
      <div class="kpi-card"><div class="label">Artículos en catálogo</div><div class="value" style="font-size:30px;">${DB.articulos.length}</div></div>
      <div class="kpi-card"><div class="label">Por agotarse</div><div class="value" style="font-size:30px;color:var(--danger);">${criticos}</div>${criticos ? `<div class="sub" style="color:var(--danger);">Requieren reposición urgente</div>` : ''}</div>
      <div class="kpi-card"><div class="label">Valor estimado del inventario</div><div class="value" style="font-size:30px;">$${Math.round(valorTotal).toLocaleString()}</div></div>
    </div>

    <div class="filter-row">
      ${UI.searchBox('alm-search','Buscar artículo o categoría…',_search,"AlmacenModule.setSearch(this.value)")}
      ${cats.map(c=>`<button class="filter-chip ${_catFilter===c?'active':''}" onclick="AlmacenModule.setCat('${c}')">${c==='todas'?'Todas':c}</button>`).join('')}
    </div>

    <div class="table-card">
      <div class="table-head" style="grid-template-columns:2.2fr 1fr 1.7fr .8fr .8fr .7fr 110px;">
        <span>Artículo</span><span>Categoría</span><span>Stock vs. mínimo</span><span>Unidad</span><span>Precio</span><span>Vence</span><span></span>
      </div>
      ${lista.length ? lista.map(a => {
        const pct  = Math.min(100, Math.round(a.stock / (a.minimo||1) * 100));
        const bad  = a.stock < a.minimo;
        const warn = !bad && a.stock < a.minimo * 1.3;
        const col  = bad ? 'var(--danger)' : warn ? 'var(--warn)' : 'var(--success)';
        const imgSrc = a.imagen ? API_URL + a.imagen : '';
        return `
        <div class="table-row" style="grid-template-columns:2.2fr 1fr 1.7fr .8fr .8fr .7fr 110px;">
          <div style="display:flex;align-items:center;gap:10px;">
            ${imgSrc
              ? `<img src="${imgSrc}" style="width:38px;height:38px;border-radius:8px;object-fit:cover;flex:none;border:1px solid var(--border);">`
              : `<div style="width:38px;height:38px;border-radius:8px;background:var(--bg);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;flex:none;">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--faint)" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                </div>`}
            <div>
              <div style="font-size:14px;font-weight:600;">${esc(a.nombre)}</div>
              <div style="font-size:11.5px;color:var(--faint);">${a.codigo ? '#'+esc(a.codigo) : esc(a.proveedor||'—')}</div>
            </div>
          </div>
          <span style="font-size:13px;color:var(--muted);">${esc(a.categoria)}</span>
          <div style="padding-right:16px;">
            <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:5px;">
              <b style="color:${col};">${a.stock}</b><span style="color:var(--faint);">mín ${a.minimo}</span>
            </div>
            ${UI.progressBar(pct, col, 7)}
          </div>
          <span style="font-size:13px;color:var(--muted);">${esc(a.unidad)}</span>
          <span style="font-size:13px;color:var(--muted);">${a.precio>0?'$'+a.precio.toFixed(2):'—'}</span>
          <span style="font-size:12.5px;color:var(--muted);">${esc(a.vence)||'—'}</span>
          <div style="display:flex;gap:4px;">
            ${(!window.Auth || Auth.canWrite('almacen')) ? `
            <button class="btn btn-sm btn-outline" style="padding:6px 8px;" title="Entrada" onclick="AlmacenModule.abrirEntrada(${a.id})">+</button>
            <button class="btn btn-sm btn-outline" style="padding:6px 8px;color:var(--danger);" title="Salida" onclick="AlmacenModule.abrirSalida(${a.id})">−</button>
            <button class="btn btn-sm btn-outline" style="padding:6px 8px;" title="Editar" onclick="AlmacenModule.abrirFormArticulo(${a.id})">✎</button>
            ` : ''}
          </div>
        </div>`;
      }).join('') : UI.emptyState('No hay artículos con ese filtro.')}
    </div>`;
  }

  /* ── NUEVO / EDITAR ARTÍCULO ─────────────────────────────── */
  const API_URL = window.location.protocol === 'file:' ? 'http://localhost:7793' : window.location.origin;

  function abrirFormArticulo(id) {
    const a = id != null ? DB.articulos.find(x => x.id === id) : null;
    const imgUrl = a && a.imagen ? API_URL + a.imagen : '';

    UI.modal(`
      <h2 style="margin:0 0 4px;">${a ? 'Editar artículo' : 'Nuevo artículo'}</h2>
      <p style="margin:0 0 18px;font-size:13px;color:var(--muted);">Completa la ficha del producto para el inventario.</p>

      <!-- Imagen -->
      <div style="display:flex;gap:18px;align-items:flex-start;margin-bottom:18px;">
        <div id="art-img-wrap" onclick="document.getElementById('art-img-input').click()"
          style="width:96px;height:96px;border-radius:14px;border:2px dashed var(--border);
                 background:var(--bg);display:flex;align-items:center;justify-content:center;
                 cursor:pointer;flex:none;overflow:hidden;transition:border-color .15s;"
          onmouseover="this.style.borderColor='var(--primary)'" onmouseout="this.style.borderColor='var(--border)'">
          ${imgUrl
            ? `<img id="art-img-preview" src="${imgUrl}" style="width:100%;height:100%;object-fit:cover;">`
            : `<div id="art-img-placeholder" style="text-align:center;padding:10px;">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--faint)" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                <div style="font-size:10.5px;color:var(--faint);margin-top:4px;">Agregar foto</div>
              </div>`}
        </div>
        <input type="file" id="art-img-input" accept="image/*" style="display:none"
          onchange="AlmacenModule._previewImagen(this)">
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
              ${CATEGORIAS.map(c=>`<option value="${c}" ${a&&a.categoria===c?'selected':''}>${c}</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label>Unidad de medida *</label>
            <select id="art-unidad">
              ${UNIDADES.map(u=>`<option value="${u}" ${a&&a.unidad===u?'selected':''}>${u}</option>`).join('')}
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
        ${a ? `<button class="btn" style="background:#FDE7E1;color:var(--danger);border:none;" onclick="AlmacenModule.confirmarEliminar(${a.id},${esc(JSON.stringify(a.nombre))})">Eliminar</button>` : ''}
        <button class="btn btn-outline" onclick="UI.closeModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="AlmacenModule.guardarArticulo(${id != null ? id : 'null'})">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8M7 3v5h8"/></svg>
          ${a ? 'Guardar cambios' : 'Agregar al catálogo'}
        </button>
      </div>`, {wide: true});
  }

  function _previewImagen(input) {
    if (!input.files || !input.files[0]) return;
    const reader = new FileReader();
    reader.onload = e => {
      const wrap = document.getElementById('art-img-wrap');
      wrap.innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;">`;
    };
    reader.readAsDataURL(input.files[0]);
  }

  function _previewNuevoImg(input) {
    if (!input.files || !input.files[0]) return;
    const reader = new FileReader();
    reader.onload = e => {
      const wrap = document.getElementById('ent-nuevo-img-wrap');
      wrap.innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;border-radius:10px;">`;
    };
    reader.readAsDataURL(input.files[0]);
  }

  async function guardarArticulo(id) {
    const nombre = document.getElementById('art-nombre').value.trim();
    if (!nombre) { UI.toast('El nombre es obligatorio', 'error'); return; }

    const datos = {
      nombre,
      categoria:   document.getElementById('art-cat').value,
      unidad:      document.getElementById('art-unidad').value,
      stock:       parseFloat(document.getElementById('art-stock').value) || 0,
      minimo:      parseFloat(document.getElementById('art-min').value) || 0,
      vence:       document.getElementById('art-vence').value || '—',
      descripcion: document.getElementById('art-desc').value.trim(),
      codigo:      document.getElementById('art-codigo').value.trim(),
      ubicacion:   document.getElementById('art-ubicacion').value.trim(),
      proveedor:   document.getElementById('art-prov').value.trim(),
      precio:      parseFloat(document.getElementById('art-precio').value) || 0,
    };

    const esEdicion = id !== null && id !== 'null';
    const btn = document.querySelector('.modal .btn-primary');
    if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }

    let artId = id;
    if (esEdicion) {
      await DB.actualizarArticulo(parseInt(id), datos);
      UI.toast(`"${esc(nombre)}" actualizado`);
    } else {
      const art = await DB.agregarArticulo(datos);
      artId = art.id;
      UI.toast(`"${esc(nombre)}" agregado al catálogo`);
    }

    // Subir imagen si se seleccionó una
    const fileInput = document.getElementById('art-img-input');
    if (fileInput && fileInput.files && fileInput.files[0] && artId) {
      const fd = new FormData();
      fd.append('imagen', fileInput.files[0]);
      try {
        const res = await fetch(`${API_URL}/articulos/${artId}/imagen`, { method: 'POST', body: fd });
        const data = await res.json();
        if (data.ok) {
          const art = DB.articulos.find(a => a.id == artId);
          if (art) art.imagen = data.url;
        }
      } catch(e) { /* upload falló silenciosamente */ }
    }

    UI.closeModal();
  }

  function confirmarEliminar(id, nombre) {
    UI.confirm(
      `¿Eliminar <b>${esc(nombre)}</b> del catálogo?<br><br>
       <span style="color:var(--danger);font-size:13px;">Se eliminará el artículo y su historial de stock. Las entregas y servicios previos no se modifican.</span>`,
      () => {
        DB.eliminarArticulo(id);
        UI.closeModal();
        UI.toast(`"${esc(nombre)}" eliminado del catálogo`, 'warn');
      }
    );
  }

  /* ── ENTRADA ──────────────────────────────────────────────── */

  function abrirEntrada(preId) {
    UI.modal(`
      <h2>Registrar entrada al almacén</h2>

      <!-- TIPO: COMPRA o DONACIÓN -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">
        <label id="ent-tab-compra" onclick="AlmacenModule._setOrigen('compra')"
          style="cursor:pointer;border:2px solid var(--primary);border-radius:12px;padding:13px 16px;background:var(--primary-soft);display:flex;align-items:center;gap:10px;">
          <input type="radio" name="ent-origen" value="compra" checked style="accent-color:var(--primary);width:16px;height:16px;">
          <div>
            <div style="font-weight:700;font-size:14px;color:var(--primary);">Compra</div>
            <div style="font-size:12px;color:var(--muted);">Genera gasto automático</div>
          </div>
        </label>
        <label id="ent-tab-donacion" onclick="AlmacenModule._setOrigen('donacion')"
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
        <button id="ent-tab-existente" onclick="AlmacenModule._setArticuloMode('existente')"
          style="padding:5px 14px;border-radius:20px;border:none;background:var(--ink);color:#fff;font-size:12.5px;font-weight:700;cursor:pointer;">
          Existente
        </button>
        <button id="ent-tab-nuevo" onclick="AlmacenModule._setArticuloMode('nuevo')"
          style="padding:5px 14px;border-radius:20px;border:1.5px solid var(--border);background:transparent;font-size:12.5px;font-weight:700;cursor:pointer;color:var(--muted);">
          + Artículo nuevo
        </button>
      </div>

      <!-- ARTÍCULO EXISTENTE -->
      <div id="ent-wrap-existente">
        <div class="form-group">
          <label>Artículo *</label>
          <select id="ent-art" onchange="AlmacenModule._showStockInfo('ent')">
            ${DB.articulos.map(a => `<option value="${a.id}" ${a.id===preId?'selected':''}>${esc(a.nombre)} (stock: ${a.stock} ${esc(a.unidad)})</option>`).join('')}
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
            <div id="ent-nuevo-img-wrap"
              onclick="document.getElementById('ent-nuevo-img-input').click()"
              style="width:88px;height:88px;border-radius:12px;border:2px dashed var(--border);background:var(--bg);display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;overflow:hidden;flex-shrink:0;">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--faint)" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
              <span style="font-size:10px;color:var(--faint);margin-top:4px;">Foto</span>
            </div>
            <input type="file" id="ent-nuevo-img-input" accept="image/*" style="display:none"
              onchange="AlmacenModule._previewNuevoImg(this)">
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
                  ${CATEGORIAS.map(c => `<option>${c}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="form-grid" style="margin:0;">
              <div class="form-group" style="margin:0;">
                <label>Unidad de medida *</label>
                <select id="ent-nuevo-unidad">
                  ${UNIDADES.map(u => `<option>${u}</option>`).join('')}
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
          <input type="number" id="ent-qty" min="0.01" step="0.01" placeholder="0"
            oninput="AlmacenModule._calcPrecioUnit()">
        </div>
        <div class="form-group" id="ent-costo-wrap">
          <label>Costo total pagado ($) *</label>
          <input type="number" id="ent-costo" min="0" step="0.01" placeholder="0.00"
            oninput="AlmacenModule._calcPrecioUnit()">
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
        <button class="btn btn-outline" onclick="UI.closeModal()">Cancelar</button>
        <button class="btn btn-primary" id="ent-btn-guardar" onclick="AlmacenModule.guardarEntrada()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M20 6 9 17l-5-5"/></svg>
          Registrar compra
        </button>
      </div>
    `, {wide: true});
    setTimeout(() => { _showStockInfo('ent'); _calcPrecioUnit(); }, 50);
  }

  function _setArticuloMode(mode) {
    const esNuevo = mode === 'nuevo';
    const wrapE = document.getElementById('ent-wrap-existente');
    const wrapN = document.getElementById('ent-wrap-nuevo');
    const btnE  = document.getElementById('ent-tab-existente');
    const btnN  = document.getElementById('ent-tab-nuevo');
    const info  = document.getElementById('ent-info');
    if (wrapE) wrapE.style.display = esNuevo ? 'none' : '';
    if (wrapN) wrapN.style.display = esNuevo ? '' : 'none';
    if (btnE) { btnE.style.background = esNuevo ? 'transparent' : 'var(--ink)'; btnE.style.color = esNuevo ? 'var(--muted)' : '#fff'; btnE.style.border = esNuevo ? '1.5px solid var(--border)' : 'none'; }
    if (btnN) { btnN.style.background = esNuevo ? 'var(--ink)' : 'transparent'; btnN.style.color = esNuevo ? '#fff' : 'var(--muted)'; btnN.style.border = esNuevo ? 'none' : '1.5px solid var(--border)'; }
    if (info) esNuevo ? info.textContent = '' : _showStockInfo('ent');
  }

  function _setOrigen(origen) {
    const esCompra = origen === 'compra';
    const tabC = document.getElementById('ent-tab-compra');
    const tabD = document.getElementById('ent-tab-donacion');
    if (tabC) { tabC.style.borderColor = esCompra ? 'var(--primary)' : 'var(--border)'; tabC.style.background = esCompra ? 'var(--primary-soft)' : ''; }
    if (tabD) { tabD.style.borderColor = !esCompra ? 'var(--success)' : 'var(--border)'; tabD.style.background = !esCompra ? '#edfde0' : ''; }
    const costoWrap  = document.getElementById('ent-costo-wrap');
    const valorWrap  = document.getElementById('ent-valor-wrap');
    const precioWrap = document.getElementById('ent-preciounit-wrap');
    const label      = document.getElementById('ent-prov-label');
    const btn        = document.getElementById('ent-btn-guardar');
    if (costoWrap)  costoWrap.style.display  = esCompra ? '' : 'none';
    if (valorWrap)  valorWrap.style.display  = esCompra ? 'none' : '';
    if (precioWrap) precioWrap.style.display = esCompra ? '' : 'none';
    if (label)  label.textContent = esCompra ? 'Proveedor *' : 'Donante / Organización';
    if (btn)    btn.textContent   = esCompra ? '✓ Registrar compra' : '✓ Registrar donación';
    _calcPrecioUnit();
  }

  function _calcPrecioUnit() {
    const qty   = parseFloat(document.getElementById('ent-qty')?.value) || 0;
    const costo = parseFloat(document.getElementById('ent-costo')?.value) || 0;
    const el    = document.getElementById('ent-preciounit');
    if (!el) return;
    if (qty > 0 && costo > 0) {
      const unit = costo / qty;
      el.textContent = '$' + unit.toFixed(unit < 1 ? 4 : 2);
    } else {
      el.textContent = '—';
    }
  }

  async function guardarEntrada() {
    const origen   = document.querySelector('input[name="ent-origen"]:checked')?.value || 'compra';
    const esCompra = origen === 'compra';
    const modeNuevo = document.getElementById('ent-wrap-nuevo')?.style.display !== 'none';

    const qty  = parseFloat(document.getElementById('ent-qty')?.value || 0);
    const prov = document.getElementById('ent-prov')?.value.trim() || '';
    const costoTotal = esCompra
      ? parseFloat(document.getElementById('ent-costo')?.value || 0)
      : parseFloat(document.getElementById('ent-valor')?.value || 0);

    if (!qty || qty <= 0) { UI.toast('Ingresa una cantidad válida', 'error'); return; }
    if (esCompra && costoTotal <= 0) { UI.toast('Ingresa el costo total de la compra', 'error'); return; }
    if (esCompra && !prov) { UI.toast('Ingresa el nombre del proveedor', 'error'); return; }

    let artId, artNombre, artUnidad;

    if (modeNuevo) {
      // Crear artículo nuevo primero
      const nombre = document.getElementById('ent-nuevo-nombre')?.value.trim();
      const cat    = document.getElementById('ent-nuevo-cat')?.value;
      const unidad = document.getElementById('ent-nuevo-unidad')?.value;
      const minimo = parseFloat(document.getElementById('ent-nuevo-min')?.value || 0);
      if (!nombre) { UI.toast('Ingresa el nombre del artículo', 'error'); return; }
      const precioUnit = esCompra && costoTotal > 0 ? costoTotal / qty : 0;
      const nuevoArt = await DB.agregarArticulo({
        nombre, categoria: cat, unidad, stock: 0, minimo,
        precio: precioUnit, descripcion: '', proveedor: prov,
        codigo: '', ubicacion: '', imagen: '',
      });
      if (!nuevoArt || nuevoArt.error) { UI.toast(nuevoArt?.error || 'Error al crear artículo', 'error'); return; }
      artId     = nuevoArt.id;
      artNombre = nuevoArt.nombre;
      artUnidad = nuevoArt.unidad;
      // Subir imagen si se eligió una
      const imgInput = document.getElementById('ent-nuevo-img-input');
      if (imgInput && imgInput.files && imgInput.files[0]) {
        const fd = new FormData();
        fd.append('imagen', imgInput.files[0]);
        try {
          const res  = await fetch(`${API_URL}/articulos/${artId}/imagen`, { method: 'POST', body: fd });
          const data = await res.json();
          if (data.ok) { const a = DB.articulos.find(x => x.id === artId); if (a) a.imagen = data.url; }
        } catch(e) { /* upload falló silenciosamente */ }
      }
    } else {
      const id = parseInt(document.getElementById('ent-art')?.value);
      const art = DB.articulos.find(a => a.id === id);
      if (!art) { UI.toast('Selecciona un artículo', 'error'); return; }
      artId     = art.id;
      artNombre = art.nombre;
      artUnidad = art.unidad;
    }

    const btn = document.getElementById('ent-btn-guardar');
    if (btn) btn.disabled = true;

    await DB.entradaAlmacen(artId, qty, origen, costoTotal, prov);
    UI.closeModal();

    if (esCompra) {
      const unit = costoTotal / qty;
      UI.toast(`Compra: +${qty} ${esc(artUnidad)} de ${esc(artNombre)} · $${costoTotal.toFixed(2)} ($${unit.toFixed(2)}/${esc(artUnidad)}) · gasto registrado`, 'success');
    } else {
      const esNuevo = modeNuevo ? ' (artículo creado)' : '';
      UI.toast(`Donación: +${qty} ${esc(artUnidad)} de ${esc(artNombre)}${prov?' de '+esc(prov):''}${esNuevo}`, 'success');
    }
    App.refresh();
  }

  /* ── SALIDA ───────────────────────────────────────────────── */
  function abrirSalida(preId) {
    UI.modal(`
      <h2>Registrar salida del almacén</h2>
      <div class="form-group">
        <label>Artículo *</label>
        <select id="sal-art" onchange="AlmacenModule._showStockInfo('sal')">
          ${DB.articulos.map(a=>`<option value="${a.id}" ${a.id===preId?'selected':''}>${esc(a.nombre)} (disponible: ${a.stock} ${esc(a.unidad)})</option>`).join('')}
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
        <button class="btn btn-outline" onclick="UI.closeModal()">Cancelar</button>
        <button class="btn btn-danger-outline" onclick="AlmacenModule.guardarSalida()">Registrar salida</button>
      </div>`);
    setTimeout(() => _showStockInfo('sal'), 50);
  }

  async function guardarSalida() {
    const id     = parseInt(document.getElementById('sal-art').value);
    const qty    = parseFloat(document.getElementById('sal-qty').value || 0);
    const motivo = document.getElementById('sal-motivo').value || 'Salida manual';
    if (!qty || qty <= 0) { UI.toast('Ingresa una cantidad válida', 'error'); return; }
    const art = DB.articulos.find(a => a.id === id);
    if (!art) return;
    const btn = document.querySelector('.modal .btn-danger-outline');
    if (btn) { btn.disabled = true; btn.textContent = 'Registrando…'; }
    const res = await DB.salidaAlmacen(id, qty, motivo);
    if (res && res.error) { UI.toast(res.error, 'error'); if (btn) { btn.disabled = false; btn.textContent = 'Registrar salida'; } return; }
    UI.closeModal();
    UI.toast(`−${qty} ${esc(art.unidad)} de ${esc(art.nombre)} registrado`, 'warn');
  }

  /* ── HELPERS ──────────────────────────────────────────────── */
  function _showStockInfo(prefix) {
    const sel  = document.getElementById(`${prefix}-art`);
    const info = document.getElementById(`${prefix}-info`);
    if (!sel || !info) return;
    const art = DB.articulos.find(a => a.id === parseInt(sel.value));
    if (art) info.textContent = `Disponible: ${art.stock} ${art.unidad} · mínimo: ${art.minimo}`;
  }

  function setSearch(v) { _search = v; App.refresh(); }
  function setCat(v)    { _catFilter = v; App.refresh(); }

  window.AlmacenModule = {
    abrirEntrada, guardarEntrada, _setOrigen, _setArticuloMode, _calcPrecioUnit,
    abrirSalida, guardarSalida,
    abrirFormArticulo, guardarArticulo, confirmarEliminar,
    setSearch, setCat, _showStockInfo, _previewImagen, _previewNuevoImg,
  };
  return { render };
})());
