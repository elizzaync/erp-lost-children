/* ============================================================
   modules/gastos.js
   ============================================================ */
App.register('gastos', (function () {

  const API_URL = window.location.protocol === 'file:' ? 'http://localhost:7793' : window.location.origin;

  let _tab      = 'egresos'; // 'egresos' | 'ingresos'
  let _search   = '';
  let _catFilter= 'todas';

  const CAT_COLORES = {
    Alimentos:   { bg:'#DDEDF1', fg:'#1C6678' },
    Almacén:     { bg:'#E0F0FF', fg:'#015a9e' },
    Regalos:     { bg:'#EDE7FD', fg:'#6B4EEA' },
    Útiles:      { bg:'#FDF2D5', fg:'#9A6B0A' },
    Servicios:   { bg:'#e8e8e8', fg:'#555' },
    Transporte:  { bg:'#E1EDFD', fg:'#2A5FA0' },
    Higiene:     { bg:'#E8F7F1', fg:'#1D7A56' },
    Otros:       { bg:'#e8e8e8', fg:'#6E7872' },
  };

  const TIPO_INGRESO = {
    'Donación de dinero': { bg:'#edfde0', fg:'#3d8a20' },
    'Subvención':         { bg:'#E0F0FF', fg:'#015a9e' },
    'Evento':   { bg:'#EDE7FD', fg:'#6B4EEA' },
    'Colecta':            { bg:'#FDF2D5', fg:'#9A6B0A' },
    'Transferencia':      { bg:'#E8F7F1', fg:'#1D7A56' },
    'Otro ingreso':       { bg:'#e8e8e8', fg:'#555'    },
  };

  const CATEGORIAS = Object.keys(CAT_COLORES);

  DB.on('gastos:update', () => { if (App.isActive('gastos')) App.refresh(); });
  DB.on('fondos:update', () => { if (App.isActive('gastos')) App.refresh(); });

  /* ---------- RENDER ---------- */
  function render() {
    const f = DB.fondos;
    const balPos = f.balance >= 0;
    const balCol = balPos ? '#1D7A56' : '#C24A30';
    const balBg  = balPos ? '#E8F7F1' : '#FDE7E1';

    // Gastos filtrados
    const gastos = DB.gastos.filter(g => {
      if (_catFilter !== 'todas' && g.categoria !== _catFilter) return false;
      if (_search) {
        const q = _search.toLowerCase();
        return g.categoria.toLowerCase().includes(q) ||
               g.proveedor.toLowerCase().includes(q) ||
               (g.observacion||'').toLowerCase().includes(q);
      }
      return true;
    });

    const totalGastos  = DB.gastos.reduce((s,g) => s + g.monto, 0);
    const conComprobante = DB.gastos.filter(g => g.comprobante).length;
    const autoGenerados  = DB.gastos.filter(g => g.fuenteAuto === 'compra_almacen').length;

    // Movimientos de ingresos (fondos)
    const ingresos = (f.movimientos || []).filter(m => m.tipo === 'ingreso');
    const totalIngresos = ingresos.reduce((s,m) => s + m.monto, 0);

    return `
    <div class="page-header">
      <div>
        <h1>Gastos e Ingresos</h1>
        <p>Transparencia de fondos · comprobantes adjuntos · balance en tiempo real</p>
      </div>
      ${(!window.Auth || Auth.canWrite('gastos')) ? `
      <div style="margin-left:auto;display:flex;gap:10px;">
        <button class="btn btn-outline" onclick="GastosModule.abrirIngreso()"
          style="border-color:#1D7A56;color:#1D7A56;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
          Registrar ingreso
        </button>
        <button class="btn btn-primary" onclick="GastosModule.abrirGasto()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 5v14M5 12h14"/></svg>
          Registrar gasto
        </button>
      </div>` : `<div style="margin-left:auto;"><span style="font-size:12px;background:rgba(255,255,255,.15);padding:5px 12px;border-radius:20px;color:inherit;opacity:.7;">Solo lectura</span></div>`}
    </div>

    <!-- BALANCE -->
    <div style="background:${balBg};border:1.5px solid ${balCol}44;border-radius:16px;padding:20px 24px;margin-bottom:18px;display:flex;align-items:center;gap:24px;flex-wrap:wrap;">
      <div style="flex:1;min-width:180px;">
        <div style="font-size:11px;font-weight:700;letter-spacing:.6px;color:${balCol};text-transform:uppercase;margin-bottom:4px;">
          ${balPos ? '▲' : '▼'} Fondos disponibles
        </div>
        <div style="font-size:38px;font-weight:800;color:${balCol};line-height:1;">
          S/ ${Math.abs(f.balance).toLocaleString('es-PE',{minimumFractionDigits:2})}
        </div>
        <div style="font-size:12.5px;color:${balCol};opacity:.7;margin-top:4px;">
          ${balPos ? 'Balance positivo' : '⚠ Egresos superan ingresos'}
        </div>
      </div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;">
        <div style="background:#fff8;border-radius:12px;padding:12px 18px;min-width:130px;">
          <div style="font-size:11px;color:var(--muted);font-weight:700;letter-spacing:.4px;text-transform:uppercase;">Ingresos totales</div>
          <div style="font-size:22px;font-weight:800;color:#1D7A56;margin-top:3px;">
            S/ ${f.ingresos.toLocaleString('es-PE',{minimumFractionDigits:2})}
          </div>
        </div>
        <div style="background:#fff8;border-radius:12px;padding:12px 18px;min-width:130px;">
          <div style="font-size:11px;color:var(--muted);font-weight:700;letter-spacing:.4px;text-transform:uppercase;">Egresos totales</div>
          <div style="font-size:22px;font-weight:800;color:#C24A30;margin-top:3px;">
            S/ ${f.egresos.toLocaleString('es-PE',{minimumFractionDigits:2})}
          </div>
        </div>
      </div>
    </div>

    <!-- TABS -->
    <div style="display:flex;gap:4px;margin-bottom:16px;border-bottom:2px solid var(--line);padding-bottom:0;">
      ${[['egresos','Egresos / Gastos'],['ingresos','Ingresos']].map(([key,label]) => `
        <button onclick="GastosModule.setTab('${key}')"
          style="padding:9px 20px;border:none;background:none;font-size:14px;font-weight:700;cursor:pointer;
            border-bottom:3px solid ${_tab===key?'var(--primary)':'transparent'};
            color:${_tab===key?'var(--primary)':'var(--muted)'};margin-bottom:-2px;">
          ${label}
          <span style="margin-left:6px;background:${_tab===key?'var(--primary)':'var(--line)'};color:${_tab===key?'#fff':'var(--muted)'};border-radius:20px;padding:1px 8px;font-size:11px;font-weight:700;">
            ${key==='egresos' ? DB.gastos.length : ingresos.length}
          </span>
        </button>`).join('')}
    </div>

    ${_tab === 'egresos' ? _renderEgresos(gastos, totalGastos, conComprobante, autoGenerados) : _renderIngresos(ingresos, totalIngresos)}
    `;
  }

  function _renderEgresos(gastos, total, conComp, autoGen) {
    return `
    <!-- KPIs egresos -->
    <div class="kpi-grid cols-3" style="margin-bottom:16px;">
      <div class="kpi-card">
        <div class="label">Total egresos</div>
        <div class="value" style="font-size:28px;">S/ ${total.toLocaleString('es-PE',{minimumFractionDigits:2})}</div>
      </div>
      <div class="kpi-card">
        <div class="label">Con comprobante</div>
        <div class="value" style="font-size:28px;color:var(--success);">${conComp} <span style="font-size:16px;color:var(--muted);">/ ${DB.gastos.length}</span></div>
        <div class="sub">${DB.gastos.length > 0 ? Math.round(conComp/DB.gastos.length*100)+'% documentados' : '—'}</div>
      </div>
      <div class="kpi-card">
        <div class="label">Auto-generados (compras)</div>
        <div class="value" style="font-size:28px;color:var(--primary);">${autoGen}</div>
        <div class="sub" style="color:var(--muted);">desde módulo almacén</div>
      </div>
    </div>

    <!-- Filtros -->
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap;">
      <div style="position:relative;flex:1;min-width:200px;">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--faint);pointer-events:none;"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <input type="text" placeholder="Buscar gasto…" value="${esc(_search)}"
          style="width:100%;padding:8px 12px 8px 30px;border:1.5px solid var(--border);border-radius:9px;font-size:13px;"
          oninput="GastosModule.setSearch(this.value)">
      </div>
      <button class="filter-chip ${_catFilter==='todas'?'active':''}" onclick="GastosModule.setCat('todas')">Todas</button>
      ${Object.keys(CAT_COLORES).map(c => `
        <button class="filter-chip ${_catFilter===c?'active':''}" onclick="GastosModule.setCat('${c}')">${c}</button>`).join('')}
    </div>

    <div class="table-card">
      ${gastos.length ? `
      <div class="table-head" style="grid-template-columns:80px 1.1fr 1fr 1.4fr 1.3fr 90px 110px;">
        <span>Fecha</span><span>Categoría</span><span>Monto</span><span>Proveedor</span><span>Nota</span><span>Origen</span><span>Acciones</span>
      </div>
      ${gastos.map(g => `
        <div class="table-row" style="grid-template-columns:80px 1.1fr 1fr 1.4fr 1.3fr 90px 110px;">
          <span style="font-size:12.5px;color:var(--muted);">${esc(g.fecha)}</span>
          <div style="background:${g.catBg};color:${g.catFg};border-radius:20px;padding:4px 10px;font-size:12px;font-weight:700;display:inline-flex;align-items:center;">${esc(g.categoria)}</div>
          <span style="font-size:14px;font-weight:800;">S/ ${g.monto.toLocaleString('es-PE',{minimumFractionDigits:2})}</span>
          <span style="font-size:13px;font-weight:600;">${esc(g.proveedor)}</span>
          <span style="font-size:12.5px;color:var(--muted);font-style:${g.observacion?'normal':'italic'};">${esc(g.observacion)||'—'}</span>
          <div>
            ${g.fuenteAuto === 'compra_almacen'
              ? `<span style="background:#E0F0FF;color:#015a9e;border-radius:20px;padding:3px 8px;font-size:10.5px;font-weight:700;">Auto·Almacén</span>`
              : `<span style="background:var(--line);color:var(--muted);border-radius:20px;padding:3px 8px;font-size:10.5px;font-weight:700;">Manual</span>`}
          </div>
          <div style="display:flex;align-items:center;gap:4px;">
            ${g.comprobante
              ? `<button class="btn btn-sm btn-outline" style="padding:5px 7px;" onclick="GastosModule.verComprobante(${g.id})" title="Ver comprobante">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2.2"><path d="M20 6 9 17l-5-5"/></svg>
                </button>`
              : `<button class="btn btn-sm btn-outline" style="padding:5px 7px;" onclick="GastosModule.subirComprobante(${g.id})" title="Adjuntar comprobante">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                </button>`}
            ${(!window.Auth || Auth.canWrite('gastos')) ? `
            <button class="btn btn-sm btn-outline" style="padding:5px 7px;" onclick="GastosModule.editarGasto(${g.id})" title="Editar">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>
            </button>
            <button class="btn btn-sm btn-outline" style="padding:5px 7px;color:var(--danger);border-color:var(--danger)20;" onclick="GastosModule.confirmarEliminarGasto(${g.id})" title="Eliminar">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
            </button>` : ''}
          </div>
        </div>`).join('')}
      ` : `<div style="padding:36px;text-align:center;color:var(--muted);font-size:14px;">Sin gastos registrados${_search?' con ese criterio':''}.</div>`}
    </div>`;
  }

  function _renderIngresos(ingresos, total) {
    return `
    <div class="kpi-grid cols-2" style="margin-bottom:16px;">
      <div class="kpi-card">
        <div class="label">Total ingresos</div>
        <div class="value" style="font-size:28px;color:#1D7A56;">S/ ${total.toLocaleString('es-PE',{minimumFractionDigits:2})}</div>
      </div>
      <div class="kpi-card">
        <div class="label">Cantidad de ingresos</div>
        <div class="value" style="font-size:28px;">${ingresos.length}</div>
      </div>
    </div>

    <div class="table-card">
      ${ingresos.length ? `
      <div class="table-head" style="grid-template-columns:80px 1.2fr 1fr 1.5fr 70px;">
        <span>Fecha</span><span>Tipo</span><span>Monto</span><span>Descripción / Donante</span><span></span>
      </div>
      ${ingresos.map(m => {
        const c = TIPO_INGRESO[m.categoria] || TIPO_INGRESO['Otro ingreso'];
        return `
        <div class="table-row" style="grid-template-columns:80px 1.2fr 1fr 1.5fr 70px;">
          <span style="font-size:12.5px;color:var(--muted);">${esc(m.fecha)}</span>
          <div style="background:${c.bg};color:${c.fg};border-radius:20px;padding:4px 10px;font-size:12px;font-weight:700;display:inline-flex;">${esc(m.categoria)||'Ingreso'}</div>
          <span style="font-size:14px;font-weight:800;color:#1D7A56;">+ S/ ${m.monto.toLocaleString('es-PE',{minimumFractionDigits:2})}</span>
          <span style="font-size:13px;color:var(--muted);">${esc(m.descripcion)||'—'}</span>
          ${(!window.Auth || Auth.canWrite('gastos')) ? `
          <button class="btn btn-sm btn-outline" style="padding:5px 7px;color:var(--danger);border-color:var(--danger)20;" onclick="GastosModule.confirmarEliminarIngreso(${m.id})" title="Eliminar">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
          </button>` : ''}
        </div>`;
      }).join('')}
      ` : `<div style="padding:36px;text-align:center;color:var(--muted);font-size:14px;">Sin ingresos registrados aún.</div>`}
    </div>`;
  }

  /* ---------- MODAL GASTO ---------- */
  function abrirGasto() {
    UI.modal(`
      <h2>Registrar gasto</h2>
      <div class="form-grid">
        <div class="form-group">
          <label>Fecha *</label>
          <input type="date" id="g-fecha" value="${new Date().toISOString().split('T')[0]}">
        </div>
        <div class="form-group">
          <label>Categoría *</label>
          <select id="g-cat">${CATEGORIAS.map(c=>`<option>${c}</option>`).join('')}</select>
        </div>
      </div>
      <div class="form-grid">
        <div class="form-group">
          <label>Monto (S/) *</label>
          <input type="number" id="g-monto" placeholder="0.00" step="0.01" min="0">
        </div>
        <div class="form-group">
          <label>Proveedor / A quién se pagó *</label>
          <input type="text" id="g-prov" placeholder="Nombre del proveedor">
        </div>
      </div>
      <div class="form-group">
        <label>Nota / Observación <span style="font-weight:400;color:var(--faint);">opcional</span></label>
        <input type="text" id="g-obs" placeholder="Ej: Compra mensual de alimentos">
      </div>

      <!-- COMPROBANTE -->
      <div class="ficha-section" style="margin-top:4px;">
        <div class="ficha-section-title">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3v5h5M5 21V4a1 1 0 0 1 1-1h8l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1Z"/></svg>
          Comprobante
          <span style="font-size:11px;font-weight:400;color:var(--faint);margin-left:4px;">foto de factura, recibo o ticket</span>
        </div>
        <div id="g-comp-wrap" onclick="document.getElementById('g-comp-input').click()"
          style="border:2px dashed var(--border);border-radius:12px;padding:24px;text-align:center;cursor:pointer;background:var(--bg);transition:border .15s;">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--faint)" stroke-width="1.5" style="margin-bottom:8px;"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
          <div style="font-size:13px;font-weight:600;color:var(--muted);">Hacer clic para adjuntar</div>
          <div style="font-size:12px;color:var(--faint);margin-top:3px;">JPG, PNG o PDF · máx. 5MB</div>
        </div>
        <input type="file" id="g-comp-input" accept="image/*,.pdf" style="display:none"
          onchange="GastosModule._previewComp(this)">
      </div>

      <div class="modal-footer">
        <button class="btn btn-outline" onclick="UI.closeModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="GastosModule.guardarGasto()">Registrar gasto</button>
      </div>`);
  }

  function _previewComp(input) {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    const wrap = document.getElementById('g-comp-wrap');
    if (!wrap) return;
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = e => {
        wrap.innerHTML = `
          <img src="${e.target.result}" style="max-height:160px;border-radius:8px;object-fit:contain;">
          <div style="font-size:12px;color:var(--success);margin-top:8px;font-weight:600;">✓ ${file.name}</div>`;
      };
      reader.readAsDataURL(file);
    } else {
      wrap.innerHTML = `
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="1.5" style="margin-bottom:6px;"><path d="M14 3v5h5M5 21V4a1 1 0 0 1 1-1h8l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1Z"/></svg>
        <div style="font-size:13px;font-weight:600;color:var(--primary);">${file.name}</div>
        <div style="font-size:12px;color:var(--success);margin-top:4px;font-weight:600;">✓ PDF adjunto</div>`;
    }
    wrap.style.borderColor = 'var(--success)';
    wrap.onclick = null;
  }

  async function guardarGasto() {
    const fecha = document.getElementById('g-fecha').value;
    const cat   = document.getElementById('g-cat').value;
    const monto = parseFloat(document.getElementById('g-monto').value || 0);
    const prov  = document.getElementById('g-prov').value.trim();
    const obs   = document.getElementById('g-obs').value.trim();
    if (!monto || monto <= 0) { UI.toast('Ingresa un monto válido', 'error'); return; }
    if (!prov)                { UI.toast('Ingresa el proveedor', 'error'); return; }

    const c   = CAT_COLORES[cat] || CAT_COLORES.Otros;
    const btn = document.querySelector('.modal .btn-primary');
    if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }

    const res = await DB.registrarGasto({
      fecha, categoria: cat, monto,
      proveedor: prov, fondo: 'Fondo General',
      observacion: obs, catBg: c.bg, catFg: c.fg,
    });

    // Subir comprobante si se adjuntó uno
    const fileInput = document.getElementById('g-comp-input');
    if (fileInput && fileInput.files[0] && res && res.id) {
      const fd = new FormData();
      fd.append('comprobante', fileInput.files[0]);
      try {
        const r    = await fetch(`${API_URL}/gastos/${res.id}/comprobante`, { method:'POST', body:fd });
        const data = await r.json();
        if (data.ok) {
          const g = DB.gastos.find(x => x.id === res.id);
          if (g) g.comprobante = data.url;
        }
      } catch(e) { /* upload falló silenciosamente */ }
    }

    UI.closeModal();
    UI.toast(`Gasto de S/${monto.toFixed(2)} registrado${fileInput?.files[0]?' con comprobante':''}`, 'success');
    App.refresh();
  }

  /* ---------- MODAL INGRESO ---------- */
  function abrirIngreso() {
    UI.modal(`
      <h2>Registrar ingreso</h2>
      <p style="margin:-4px 0 16px;font-size:13px;color:var(--muted);">Donaciones de dinero, polladas, colectas, subvenciones, etc.</p>

      <div class="form-grid">
        <div class="form-group">
          <label>Fecha *</label>
          <input type="date" id="ing-fecha" value="${new Date().toISOString().split('T')[0]}">
        </div>
        <div class="form-group">
          <label>Tipo de ingreso *</label>
          <select id="ing-tipo">
            ${Object.keys(TIPO_INGRESO).map(t => `<option>${t}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Monto (S/) *</label>
        <input type="number" id="ing-monto" placeholder="0.00" step="0.01" min="0.01">
      </div>
      <div class="form-group">
        <label>Descripción / Donante / Evento</label>
        <input type="text" id="ing-desc" placeholder="Ej: Donación de la parroquia San José · Pollada 5 julio">
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="UI.closeModal()">Cancelar</button>
        <button class="btn btn-primary" style="background:#1D7A56;border-color:#1D7A56;" onclick="GastosModule.guardarIngreso()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
          Registrar ingreso
        </button>
      </div>`, { narrow: true });
  }

  async function guardarIngreso() {
    const monto = parseFloat(document.getElementById('ing-monto')?.value || 0);
    const tipo  = document.getElementById('ing-tipo')?.value;
    const desc  = document.getElementById('ing-desc')?.value.trim();
    const fecha = document.getElementById('ing-fecha')?.value;
    if (!monto || monto <= 0) { UI.toast('Ingresa un monto válido', 'error'); return; }

    const res = await DB.registrarIngreso({ monto, descripcion: desc, categoria: tipo, fuente: 'donacion', fecha });
    if (res && res.error) { UI.toast(res.error, 'error'); return; }
    UI.closeModal();
    UI.toast(`Ingreso de S/${monto.toLocaleString('es-PE',{minimumFractionDigits:2})} registrado`, 'success');
    App.refresh();
  }

  /* ---------- COMPROBANTE ---------- */
  function verComprobante(id) {
    const g = DB.gastos.find(x => x.id === id);
    if (!g) return;
    const url = g.comprobante ? `${API_URL}${g.comprobante}` : null;
    const esImg = url && /\.(jpg|jpeg|png|gif|webp)$/i.test(url);
    UI.modal(`
      <h2>Comprobante · ${esc(g.categoria)}</h2>
      <div style="background:var(--bg);border-radius:12px;padding:16px;margin-bottom:14px;display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div><div style="font-size:11px;color:var(--muted);font-weight:700;margin-bottom:3px;">FECHA</div><div style="font-weight:600;">${esc(g.fecha)}</div></div>
        <div><div style="font-size:11px;color:var(--muted);font-weight:700;margin-bottom:3px;">MONTO</div><div style="font-weight:800;font-size:18px;">S/ ${g.monto.toLocaleString('es-PE',{minimumFractionDigits:2})}</div></div>
        <div><div style="font-size:11px;color:var(--muted);font-weight:700;margin-bottom:3px;">PROVEEDOR</div><div style="font-weight:600;">${esc(g.proveedor)}</div></div>
        <div><div style="font-size:11px;color:var(--muted);font-weight:700;margin-bottom:3px;">CATEGORÍA</div><div style="font-weight:600;">${esc(g.categoria)}</div></div>
        ${g.observacion ? `<div style="grid-column:span 2;"><div style="font-size:11px;color:var(--muted);font-weight:700;margin-bottom:3px;">NOTA</div><div>${esc(g.observacion)}</div></div>` : ''}
      </div>
      ${url
        ? esImg
          ? `<img src="${url}" style="width:100%;border-radius:10px;max-height:340px;object-fit:contain;background:#000;">`
          : `<div style="text-align:center;padding:24px;border:1.5px solid var(--border);border-radius:12px;">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="1.5" style="margin-bottom:8px;"><path d="M14 3v5h5M5 21V4a1 1 0 0 1 1-1h8l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1Z"/></svg>
              <div style="font-weight:600;margin-bottom:8px;">Comprobante PDF adjunto</div>
              <a href="${url}" target="_blank" class="btn btn-primary" style="text-decoration:none;">Abrir PDF</a>
            </div>`
        : `<div style="background:#FDF2D5;border-radius:10px;padding:14px 16px;font-size:13px;color:#9A6B0A;text-align:center;">
            Sin comprobante adjunto.
            <button class="btn btn-sm btn-outline" style="margin-left:10px;" onclick="GastosModule.subirComprobante(${g.id})">Adjuntar ahora</button>
          </div>`}
      <div class="modal-footer"><button class="btn btn-outline" onclick="UI.closeModal()">Cerrar</button></div>
    `, { narrow: true });
  }

  function subirComprobante(id) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,.pdf';
    input.onchange = async () => {
      if (!input.files[0]) return;
      const fd = new FormData();
      fd.append('comprobante', input.files[0]);
      UI.toast('Subiendo comprobante…');
      try {
        const r    = await fetch(`${API_URL}/gastos/${id}/comprobante`, { method:'POST', body:fd });
        const data = await r.json();
        if (data.ok) {
          const g = DB.gastos.find(x => x.id === id);
          if (g) g.comprobante = data.url;
          UI.closeModal();
          UI.toast('Comprobante adjuntado correctamente', 'success');
          App.refresh();
        }
      } catch(e) { UI.toast('Error al subir el comprobante', 'error'); }
    };
    input.click();
  }

  /* ---------- EDITAR GASTO ---------- */
  function editarGasto(id) {
    const g = DB.gastos.find(x => x.id === id);
    if (!g) return;
    UI.modal(`
      <h2>Editar gasto</h2>
      <div class="form-grid">
        <div class="form-group">
          <label>Fecha *</label>
          <input type="date" id="ge-fecha" value="${g.fechaISO || ''}">
        </div>
        <div class="form-group">
          <label>Categoría *</label>
          <select id="ge-cat">${CATEGORIAS.map(c=>`<option ${c===g.categoria?'selected':''}>${c}</option>`).join('')}</select>
        </div>
      </div>
      <div class="form-grid">
        <div class="form-group">
          <label>Monto (S/) *</label>
          <input type="number" id="ge-monto" value="${g.monto}" step="0.01" min="0">
        </div>
        <div class="form-group">
          <label>Proveedor *</label>
          <input type="text" id="ge-prov" value="${esc(g.proveedor)}">
        </div>
      </div>
      <div class="form-group">
        <label>Nota / Observación</label>
        <input type="text" id="ge-obs" value="${esc(g.observacion)}">
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="UI.closeModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="GastosModule.guardarEdicionGasto(${id})">Guardar cambios</button>
      </div>`);
  }

  async function guardarEdicionGasto(id) {
    const fecha = document.getElementById('ge-fecha').value;
    const cat   = document.getElementById('ge-cat').value;
    const monto = parseFloat(document.getElementById('ge-monto').value || 0);
    const prov  = document.getElementById('ge-prov').value.trim();
    const obs   = document.getElementById('ge-obs').value.trim();
    if (!monto || monto <= 0) { UI.toast('Monto inválido', 'error'); return; }
    if (!prov)                { UI.toast('Proveedor obligatorio', 'error'); return; }
    const c   = CAT_COLORES[cat] || CAT_COLORES.Otros;
    const btn = document.querySelector('.modal .btn-primary');
    if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
    const d = new Date(fecha + 'T00:00:00');
    const ms = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    const res = await DB.actualizarGasto(id, {
      fechaISO: fecha,
      fecha: `${d.getDate()} ${ms[d.getMonth()]}`,
      categoria: cat, monto, proveedor: prov, observacion: obs,
      catBg: c.bg, catFg: c.fg,
    });
    if (res && res.ok === false) { UI.toast('Error al guardar', 'error'); return; }
    UI.closeModal();
    UI.toast('Gasto actualizado', 'success');
    App.refresh();
  }

  /* ---------- ELIMINAR ---------- */
  function confirmarEliminarGasto(id) {
    const g = DB.gastos.find(x => x.id === id);
    if (!g) return;
    UI.modal(`
      <h2>Eliminar gasto</h2>
      <p style="font-size:14px;margin-bottom:18px;">¿Eliminar el gasto de <b>S/ ${g.monto.toFixed(2)}</b> en <b>${esc(g.categoria)}</b> · ${esc(g.proveedor)}?<br>
      <span style="color:var(--danger);font-size:13px;">También se eliminará el egreso de fondos asociado.</span></p>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="UI.closeModal()">Cancelar</button>
        <button class="btn btn-primary" style="background:var(--danger);border-color:var(--danger);" onclick="GastosModule._doEliminarGasto(${id})">Sí, eliminar</button>
      </div>`, { narrow: true });
  }

  async function _doEliminarGasto(id) {
    const res = await DB.eliminarGasto(id);
    if (res && res.ok === false) { UI.toast('Error al eliminar', 'error'); return; }
    UI.closeModal();
    UI.toast('Gasto eliminado', 'success');
    App.refresh();
  }

  function confirmarEliminarIngreso(id) {
    const m = (DB.fondos.movimientos || []).find(x => x.id === id);
    if (!m) return;
    UI.modal(`
      <h2>Eliminar ingreso</h2>
      <p style="font-size:14px;margin-bottom:18px;">¿Eliminar el ingreso de <b>S/ ${m.monto.toFixed(2)}</b> — ${esc(m.descripcion||m.categoria)}?</p>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="UI.closeModal()">Cancelar</button>
        <button class="btn btn-primary" style="background:var(--danger);border-color:var(--danger);" onclick="GastosModule._doEliminarIngreso(${id})">Sí, eliminar</button>
      </div>`, { narrow: true });
  }

  async function _doEliminarIngreso(id) {
    const res = await DB.eliminarFondoMovimiento(id);
    if (res && res.ok === false) { UI.toast('Error al eliminar', 'error'); return; }
    UI.closeModal();
    UI.toast('Ingreso eliminado', 'success');
    App.refresh();
  }

  function setTab(t)    { _tab = t; _search = ''; _catFilter = 'todas'; App.refresh(); }
  function setSearch(v) { _search = v; App.refresh(); }
  function setCat(c)    { _catFilter = c; App.refresh(); }

  window.GastosModule = {
    abrirGasto, guardarGasto, abrirIngreso, guardarIngreso,
    verComprobante, subirComprobante,
    editarGasto, guardarEdicionGasto,
    confirmarEliminarGasto, _doEliminarGasto,
    confirmarEliminarIngreso, _doEliminarIngreso,
    setTab, setSearch, setCat, _previewComp,
    abrirFormulario: abrirGasto, guardar: guardarGasto,
    abrirDonacion: abrirIngreso, guardarDonacion: guardarIngreso,
  };
  return { render };
})());
