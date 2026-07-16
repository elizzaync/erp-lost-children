/* ============================================================
   modules/entregas.js
   ============================================================ */
App.register('entregas', (function () {

  let _campana = 'todas';
  let _busqueda = '';

  const TIPO_LABEL = { nino:'Niño/a', misionero:'Misionero', voluntario:'Voluntario', padre:'Padre/Madre', staff:'Staff' };
  const TIPO_COLOR = {
    nino:       {bg:'#E0F0FF', fg:'#015a9e'},
    misionero:  {bg:'#edfde0', fg:'#3d8a20'},
    voluntario: {bg:'#EDE7FD', fg:'#6B4EEA'},
    padre:      {bg:'#FDE7E1', fg:'#C24A30'},
    staff:      {bg:'#fff6dc', fg:'#b07900'},
  };

  const CAMP_COLORES = {
    'Navidad':          {bg:'#EDE7FD', fg:'#6B4EEA'},
    'Campaña escolar':  {bg:'#FDF2D5', fg:'#9A6B0A'},
    'Cumpleaños':       {bg:'#FDE7E1', fg:'#C24A30'},
    'General':          {bg:'var(--line)', fg:'var(--muted)'},
  };
  const CAMPANAS = ['todas', ...Object.keys(CAMP_COLORES)];

  DB.on('entregas:update', () => { if (App.isActive('entregas')) App.refresh(); });

  /* ---------- RENDER ---------- */
  function render() {
    let lista = DB.entregas;
    if (_campana !== 'todas') lista = lista.filter(e => e.campana === _campana);
    if (_busqueda) {
      const q = _busqueda.toLowerCase();
      lista = lista.filter(e =>
        e.nino.toLowerCase().includes(q) ||
        e.articulo.toLowerCase().includes(q) ||
        e.campana.toLowerCase().includes(q)
      );
    }

    const totalItems = DB.entregas.length;
    const totalArts  = DB.entregas.reduce((s,e) => s + e.cantidad, 0);
    const personas   = [...new Set(DB.entregas.map(e => e.personaId))].length;

    return `
    <div class="page-header">
      <div>
        <h1>Entregas a beneficiarios</h1>
        <p>Registro nominal de bienes entregados · descuenta automáticamente del almacén</p>
      </div>
      ${(!window.Auth || Auth.canWrite('entregas')) ? `
      <button class="btn btn-primary" style="margin-left:auto;" onclick="EntregasModule.abrirFormulario()">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 5v14M5 12h14"/></svg>
        Nueva entrega
      </button>` : `<span style="margin-left:auto;font-size:12px;background:var(--line);padding:5px 12px;border-radius:20px;color:var(--muted);">Solo lectura</span>`}
    </div>

    <!-- KPIs -->
    <div class="kpi-grid cols-4" style="margin-bottom:16px;">
      ${Object.entries(CAMP_COLORES).map(([camp, c]) => {
        const n = DB.entregas.filter(e => e.campana === camp).length;
        return `
        <div class="kpi-card" style="cursor:pointer;border:2px solid ${_campana===camp?'var(--primary)':'var(--border)'};"
          onclick="EntregasModule.setCampana('${camp}')">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
            <div class="label">${camp}</div>
            <div style="background:${c.bg};color:${c.fg};border-radius:20px;padding:2px 10px;font-size:11px;font-weight:700;">${camp === _campana ? 'activa' : ''}</div>
          </div>
          <div class="value" style="font-size:30px;">${n}</div>
          <div class="sub" style="color:var(--muted);">entrega${n===1?'':'s'}</div>
        </div>`;
      }).join('')}
    </div>

    <!-- Barra de filtros y búsqueda -->
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap;">
      <div style="position:relative;flex:1;min-width:220px;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="position:absolute;left:11px;top:50%;transform:translateY(-50%);color:var(--faint);pointer-events:none;"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <input type="text" placeholder="Buscar por persona, artículo o campaña…"
          value="${_busqueda}"
          style="width:100%;padding:8px 12px 8px 33px;border:1.5px solid var(--border);border-radius:9px;font-size:13.5px;"
          oninput="EntregasModule.setBusqueda(this.value)">
      </div>
      ${CAMPANAS.map(c => `
        <button class="filter-chip ${_campana===c?'active':''}" onclick="EntregasModule.setCampana('${c}')">
          ${c==='todas'?'Todas':c}
        </button>`).join('')}
      <span style="font-size:12.5px;color:var(--muted);font-weight:600;white-space:nowrap;">${lista.length} de ${totalItems}</span>
    </div>

    <div style="display:grid;grid-template-columns:1fr 260px;gap:16px;align-items:start;">

      <!-- TABLA HISTORIAL -->
      <div class="table-card">
        ${lista.length ? `
        <div class="table-head" style="grid-template-columns:85px 1.6fr 1.2fr .6fr 1fr 1.1fr;">
          <span>Fecha</span><span>Persona</span><span>Artículo</span><span>Cant.</span><span>Campaña</span><span>Notas</span>
        </div>
        ${lista.map(e => {
          const tc = TIPO_COLOR[e.personaTipo] || TIPO_COLOR.nino;
          return `
          <div class="table-row" style="grid-template-columns:85px 1.6fr 1.2fr .6fr 1fr 1.1fr;">
            <span style="font-size:12.5px;color:var(--muted);">${e.fecha}</span>
            <div style="display:flex;align-items:center;gap:9px;">
              ${UI.avatar(e.inicial, e.avatarBg, e.avatarFg, true, 32)}
              <div>
                <div style="font-size:13.5px;font-weight:600;">${e.nino}</div>
                <div style="background:${tc.bg};color:${tc.fg};border-radius:20px;padding:1px 7px;font-size:10.5px;font-weight:700;display:inline-block;">${TIPO_LABEL[e.personaTipo]||e.personaTipo}</div>
              </div>
            </div>
            <div>
              <div style="font-size:13.5px;font-weight:600;">${e.articulo}</div>
              ${e.articuloCategoria ? `<div style="font-size:11px;color:var(--faint);">${e.articuloCategoria}</div>` : ''}
            </div>
            <span style="font-size:14px;font-weight:700;">${e.cantidad} <span style="font-size:11px;font-weight:400;color:var(--faint);">${e.unidad}</span></span>
            <div style="background:${e.campBg};color:${e.campFg};border-radius:20px;padding:4px 10px;font-size:12px;font-weight:700;display:inline-flex;align-items:center;">${e.campana}</div>
            <span style="font-size:12px;color:var(--muted);font-style:${e.notas?'normal':'italic'};">${e.notas||'—'}</span>
          </div>`;
        }).join('')}
        ` : `
        <div style="padding:40px;text-align:center;">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--line)" stroke-width="1.5" style="margin-bottom:10px;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          <div style="font-size:14px;font-weight:600;color:var(--muted);">Sin entregas${_campana!=='todas'?' en "'+_campana+'"':_busqueda?' con ese criterio':''}</div>
        </div>`}
      </div>

      <!-- PANEL LATERAL RESUMEN -->
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
            const n = DB.entregas.filter(e => e.personaTipo === tipo).length;
            if (!n) return '';
            const tc = TIPO_COLOR[tipo];
            return `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--line);">
              <div style="display:flex;align-items:center;gap:7px;">
                <div style="width:8px;height:8px;border-radius:50%;background:${tc.fg};"></div>
                <span style="font-size:13px;">${label}</span>
              </div>
              <span style="font-size:13px;font-weight:700;">${n}</span>
            </div>`;
          }).join('')}
        </div>

        <div class="table-card" style="padding:18px;">
          <div style="font-weight:700;font-size:14px;margin-bottom:12px;">Artículos más entregados</div>
          ${(() => {
            const conteo = {};
            DB.entregas.forEach(e => { conteo[e.articulo] = (conteo[e.articulo]||0) + e.cantidad; });
            return Object.entries(conteo).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([art,n]) => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--line);">
              <span style="font-size:12.5px;color:var(--ink);">${art}</span>
              <span style="font-size:12.5px;font-weight:700;color:var(--primary);">${n}</span>
            </div>`).join('') || '<div style="font-size:12.5px;color:var(--faint);">Sin datos</div>';
          })()}
        </div>
      </div>
    </div>`;
  }

  /* ---------- MODAL NUEVA ENTREGA ---------- */
  function abrirFormulario() {
    const personas = DB.personas.filter(p => p.estado === 'activo');
    const arts     = DB.articulos.filter(a => a.stock > 0);

    if (!personas.length) { UI.toast('No hay personas activas registradas', 'error'); return; }
    if (!arts.length)     { UI.toast('No hay artículos con stock disponible', 'error'); return; }

    UI.modal(`
      <h2>Registrar nueva entrega</h2>
      <p style="margin:-4px 0 18px;font-size:13px;color:var(--muted);">Selecciona el beneficiario, el artículo y la campaña.</p>

      <!-- BUSCADOR DE PERSONA -->
      <div class="ficha-section">
        <div class="ficha-section-title">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/></svg>
          Beneficiario
        </div>
        <div style="position:relative;margin-bottom:10px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="position:absolute;left:11px;top:50%;transform:translateY(-50%);color:var(--faint);pointer-events:none;"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input type="text" id="e-buscar-persona" placeholder="Buscar por nombre…"
            style="width:100%;padding:9px 12px 9px 33px;border:1.5px solid var(--border);border-radius:9px;font-size:13.5px;"
            oninput="EntregasModule._filtrarPersonas(this.value)">
        </div>
        <div id="e-personas-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(155px,1fr));gap:8px;max-height:230px;overflow-y:auto;padding:2px;">
          ${_tarjetasPersonas(personas, null)}
        </div>
        <input type="hidden" id="e-persona-id">
      </div>

      <!-- ARTÍCULO -->
      <div class="ficha-section">
        <div class="ficha-section-title">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 8.5 12 4l9 4.5M3 8.5V18l9 4.5M3 8.5l9 4.5m0 0L21 8.5M12 13v9.5M21 8.5V18l-9 4.5"/></svg>
          Artículo a entregar
        </div>
        <div style="display:grid;grid-template-columns:1fr auto;gap:10px;align-items:end;">
          <div class="form-group" style="margin:0;">
            <label>Artículo *</label>
            <select id="e-art" onchange="EntregasModule._onArtChange()">
              <option value="">— Selecciona —</option>
              ${arts.map(a => {
                const hayImg = a.imagen;
                return `<option value="${a.id}" data-stock="${a.stock}" data-unidad="${a.unidad}" data-cat="${a.categoria}">${a.nombre} · ${a.stock} ${a.unidad}</option>`;
              }).join('')}
            </select>
          </div>
          <div class="form-group" style="margin:0;width:110px;">
            <label>Cantidad *</label>
            <input type="number" id="e-qty" value="1" min="1"
              style="text-align:center;font-size:16px;font-weight:700;"
              oninput="EntregasModule._onArtChange()">
          </div>
        </div>
        <div id="e-art-info" style="margin-top:8px;padding:10px 14px;background:var(--bg);border-radius:9px;font-size:13px;color:var(--muted);display:none;"></div>
      </div>

      <!-- CAMPAÑA Y NOTAS -->
      <div class="form-grid">
        <div class="form-group">
          <label>Campaña *</label>
          <select id="e-camp">
            ${Object.keys(CAMP_COLORES).map(c => `<option>${c}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Notas / Observaciones</label>
          <input type="text" id="e-notas" placeholder="Ej: Regalo de Navidad 2026" maxlength="200">
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-outline" onclick="UI.closeModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="EntregasModule.guardar()">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M20 6 9 17l-5-5"/></svg>
          Registrar y descontar del almacén
        </button>
      </div>
    `, {wide: true});
  }

  function _tarjetasPersonas(lista, selId) {
    return lista.map(p => {
      const tc  = TIPO_COLOR[p.tipo] || TIPO_COLOR.nino;
      const sel = p.id === selId;
      return `
      <div onclick="EntregasModule._selPersona(${p.id})" id="ep-${p.id}"
        style="cursor:pointer;border:2px solid ${sel?'var(--primary)':'var(--border)'};border-radius:12px;padding:10px;display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center;background:${sel?'var(--primary-soft)':'#fff'};transition:border .15s,background .15s;">
        ${UI.avatar(p.inicial, p.avatarBg, p.avatarFg, true, 38)}
        <div style="font-size:12.5px;font-weight:700;line-height:1.2;">${p.nombre.split(' ')[0]}<br><span style="font-weight:400;color:var(--muted);">${p.nombre.split(' ').slice(1).join(' ')}</span></div>
        <div style="background:${tc.bg};color:${tc.fg};border-radius:20px;padding:2px 8px;font-size:10.5px;font-weight:700;">${TIPO_LABEL[p.tipo]||p.tipo}</div>
      </div>`;
    }).join('');
  }

  function _filtrarPersonas(q) {
    const lista = DB.personas.filter(p => p.estado === 'activo' &&
      (!q || p.nombre.toLowerCase().includes(q.toLowerCase())));
    const selId = parseInt(document.getElementById('e-persona-id')?.value) || null;
    const grid  = document.getElementById('e-personas-grid');
    if (grid) grid.innerHTML = _tarjetasPersonas(lista, selId);
  }

  function _selPersona(id) {
    document.getElementById('e-persona-id').value = id;
    // Re-renderiza todas las tarjetas para reflejar selección
    const q     = document.getElementById('e-buscar-persona')?.value || '';
    const lista = DB.personas.filter(p => p.estado === 'activo' &&
      (!q || p.nombre.toLowerCase().includes(q.toLowerCase())));
    const grid  = document.getElementById('e-personas-grid');
    if (grid) grid.innerHTML = _tarjetasPersonas(lista, id);
  }

  function _onArtChange() {
    const sel  = document.getElementById('e-art');
    const qty  = parseFloat(document.getElementById('e-qty')?.value) || 1;
    const info = document.getElementById('e-art-info');
    if (!sel || !info || !sel.value) { if (info) info.style.display='none'; return; }
    const opt   = sel.options[sel.selectedIndex];
    const stock = parseFloat(opt.dataset.stock) || 0;
    const unidad= opt.dataset.unidad || '';
    const cat   = opt.dataset.cat || '';
    const ok    = qty <= stock;
    info.style.display = 'block';
    info.style.background = ok ? 'var(--bg)' : '#FDE7E1';
    info.style.color      = ok ? 'var(--muted)' : 'var(--danger)';
    info.innerHTML = ok
      ? `<b>Stock disponible:</b> ${stock} ${unidad} · <b>Categoría:</b> ${cat} · Quedarán ${stock - qty} ${unidad} después de la entrega`
      : `<b>Stock insuficiente.</b> Solo hay ${stock} ${unidad} disponibles. Reduce la cantidad.`;
  }

  /* ---------- GUARDAR ---------- */
  async function guardar() {
    const personaId = parseInt(document.getElementById('e-persona-id')?.value);
    const artId     = parseInt(document.getElementById('e-art')?.value);
    const qty       = parseFloat(document.getElementById('e-qty')?.value) || 0;
    const campana   = document.getElementById('e-camp')?.value;
    const notas     = document.getElementById('e-notas')?.value.trim() || '';

    if (!personaId) { UI.toast('Selecciona un beneficiario', 'error'); return; }
    if (!artId)     { UI.toast('Selecciona un artículo', 'error'); return; }
    if (qty <= 0)   { UI.toast('Ingresa una cantidad válida', 'error'); return; }

    const persona = DB.personas.find(p => p.id === personaId);
    const art     = DB.articulos.find(a => a.id === artId);
    if (!persona || !art) return;

    const c   = CAMP_COLORES[campana] || CAMP_COLORES.General;
    const btn = document.querySelector('.modal .btn-primary');
    if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }

    const res = await DB.registrarEntrega({
      personaId, nino: persona.nombre, personaTipo: persona.tipo,
      articuloId: artId, articulo: art.nombre,
      articuloCategoria: art.categoria, unidad: art.unidad,
      cantidad: qty, campana, notas,
      inicial: persona.inicial, avatarBg: persona.avatarBg, avatarFg: persona.avatarFg,
      campBg: c.bg, campFg: c.fg,
    });

    if (res && res.error) {
      UI.toast(res.error, 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Registrar y descontar del almacén'; }
      return;
    }

    UI.closeModal();
    UI.toast(`${art.nombre} ×${qty} entregado a ${persona.nombre}`, 'success');
    App.refresh();
  }

  function setCampana(c) { _campana = c; App.refresh(); }
  function setBusqueda(q) { _busqueda = q; App.refresh(); }

  window.EntregasModule = {
    abrirFormulario, guardar, setCampana, setBusqueda,
    _filtrarPersonas, _selPersona, _onArtChange,
  };
  return { render };
})());
