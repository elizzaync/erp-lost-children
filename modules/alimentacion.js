/* ============================================================
   modules/alimentacion.js
   ============================================================ */
App.register('alimentacion', (function () {

  const API_URL = window.location.protocol === 'file:' ? 'http://localhost:7793' : window.location.origin;
  const CATS_ALIMENTO = ['Alimentos', 'Proteínas', 'Condimentos'];

  ['almacen:update','asistencia:update'].forEach(ev => {
    DB.on(ev, () => { if (App.isActive('alimentacion')) App.refresh(); });
  });

  /* ---------- RENDER ---------- */
  function render() {
    const presentes  = DB.asistencia.filter(a => a.presente).length;
    const misioneros = DB.personas.filter(p => p.tipo === 'misionero' && p.estado === 'activo').length;
    const voluntarios= DB.personas.filter(p => p.tipo === 'voluntario' && p.estado === 'activo').length;
    const padres     = DB.personas.filter(p => p.tipo === 'padre'      && p.estado === 'activo').length;
    const staff      = DB.personas.filter(p => p.tipo === 'staff'      && p.estado === 'activo').length;
    const total      = presentes + misioneros + voluntarios + staff;

    const servicios   = DB.serviciosAlimentacion;
    const racionesMes = servicios.reduce((s,x) => s + x.total, 0);
    const costoMes    = servicios.reduce((s,x) => s + x.costo, 0);
    const costoPromPlato = servicios.length
      ? (servicios.reduce((s,x) => s + (x.costoPlato || 0), 0) / servicios.length).toFixed(2)
      : '0.00';

    return `
    <div class="page-header">
      <div>
        <h1>Alimentación</h1>
        <p>Registro de servicios · descuento automático de almacén</p>
      </div>
      ${(!window.Auth || Auth.canWrite('alimentacion')) ? `
      <button class="btn btn-primary" style="margin-left:auto;"
        ${!DB.articulos.length ? 'disabled title="Agrega artículos al almacén primero"'
          : `onclick="AlimentacionModule.abrirServicio(${presentes},${misioneros},${voluntarios},${padres},${staff})"`}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 5v14M5 12h14"/></svg>
        Registrar servicio
      </button>` : `<span style="margin-left:auto;font-size:12px;background:var(--line);padding:5px 12px;border-radius:20px;color:var(--muted);">Solo lectura</span>`}
    </div>

    <!-- KPIs -->
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

      <!-- HISTORIAL -->
      <div class="table-card">
        <div style="padding:14px 20px;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;">
          <div style="font-weight:700;font-size:15px;">Historial de servicios</div>
          <span style="font-size:12px;color:var(--muted);">${servicios.length} registros</span>
        </div>
        ${servicios.length ? `
        <div class="table-head" style="grid-template-columns:90px 1.5fr 70px 70px 80px 80px;">
          <span>Fecha</span><span>Menú</span><span>Raciones</span><span>$/plato</span><span>Costo</span><span></span>
        </div>
        ${servicios.map(s => `
          <div class="table-row" style="grid-template-columns:90px 1.5fr 70px 70px 80px 80px;">
            <span style="font-size:12.5px;color:var(--muted);">${esc(s.fecha)}</span>
            <div>
              <div style="font-size:13.5px;font-weight:600;">${esc(s.menu)}</div>
              <div style="font-size:11.5px;color:var(--faint);">${s.insumos ? s.insumos.split('·').length+' insumos' : '—'}</div>
            </div>
            <span style="font-size:14px;font-weight:700;">${s.total}</span>
            <span style="font-size:13px;color:var(--primary);font-weight:700;">${s.costoPlato>0?'$'+s.costoPlato.toFixed(2):'—'}</span>
            <span style="font-size:13.5px;font-weight:600;">${s.costo>0?'$'+s.costo.toFixed(2):'—'}</span>
            <button class="btn btn-sm btn-outline" onclick="AlimentacionModule.abrirServicio(${presentes},${misioneros},${voluntarios},${padres},${staff},${s.id})"
              title="Usar como plantilla" style="padding:5px 8px;font-size:11.5px;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              Copiar
            </button>
          </div>`).join('')}
        ` : `<div style="padding:32px;text-align:center;color:var(--muted);font-size:13.5px;">Aún no hay servicios registrados.</div>`}
      </div>

      <!-- STOCK RÁPIDO -->
      <div class="table-card">
        <div style="padding:14px 20px;border-bottom:1px solid var(--line);">
          <div style="font-weight:700;font-size:15px;">Insumos disponibles</div>
          <div style="font-size:12px;color:var(--muted);margin-top:2px;">Stock actual · ${DB.hoy()}</div>
        </div>
        <div style="padding:10px 16px;background:var(--bg);border-bottom:1px solid var(--line);display:flex;gap:10px;flex-wrap:wrap;">
          ${_grupoBadge('Niños presentes', presentes, '#E0F0FF', '#015a9e')}
          ${_grupoBadge('Misioneros', misioneros, '#edfde0', '#3d8a20')}
          ${_grupoBadge('Voluntarios', voluntarios, '#EDE7FD', '#6B4EEA')}
          ${_grupoBadge('Staff', staff, '#fff6dc', '#b07900')}
          <div style="margin-left:auto;background:var(--ink);color:#fff;border-radius:20px;padding:4px 12px;font-size:12px;font-weight:800;">${total} total</div>
        </div>
        ${DB.articulos.filter(a => CATS_ALIMENTO.includes(a.categoria)).map(a => {
          const bad  = a.stock < a.minimo;
          const warn = !bad && a.minimo > 0 && a.stock < a.minimo * 1.3;
          const col  = bad ? 'var(--danger)' : warn ? 'var(--warn)' : 'var(--success)';
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

  function _grupoBadge(label, n, bg, fg) {
    return `<div style="background:${bg};color:${fg};border-radius:20px;padding:3px 10px;font-size:12px;font-weight:700;">${label}: ${n}</div>`;
  }

  /* ---------- MODAL REGISTRAR SERVICIO ---------- */
  async function abrirServicio(presentes, misioneros, voluntarios, padres, staff, plantillaId) {
    const arts = DB.articulos.filter(a => CATS_ALIMENTO.includes(a.categoria));

    // Si viene con plantilla, carga el consumo previo
    let consumoPlantilla = {};
    if (plantillaId) {
      try {
        const res = await fetch(`${API_URL}/alimentacion/${plantillaId}/consumo`);
        const data = await res.json();
        if (data.ok && Array.isArray(data.consumo)) {
          data.consumo.forEach(c => { consumoPlantilla[c.articuloId] = c.cantidad; });
        }
      } catch(e) { /* plantilla no disponible */ }
    }

    const plantilla = plantillaId
      ? DB.serviciosAlimentacion.find(s => s.id === plantillaId)
      : null;

    UI.modal(`
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

      <!-- Info y menú -->
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

      <!-- Comensales por grupo -->
      <div class="ficha-section">
        <div class="ficha-section-title">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><path d="M16 6.5a3 3 0 0 1 0 5.6M16.5 19a5.5 5.5 0 0 0-2-4.3"/></svg>
          Comensales atendidos
        </div>
        <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:10px;">
          ${[
            ['al-ninos',      'Niños',       presentes],
            ['al-misioneros', 'Misioneros',  misioneros],
            ['al-voluntarios','Voluntarios', voluntarios],
            ['al-padres',     'Padres',      padres],
            ['al-staff',      'Staff',       staff],
          ].map(([id, label, val]) => `
            <div style="text-align:center;">
              <div style="font-size:11.5px;font-weight:700;color:var(--muted);margin-bottom:5px;">${label}</div>
              <input type="number" id="${id}" value="${val}" min="0"
                style="width:100%;text-align:center;padding:8px 4px;border:1.5px solid var(--border);border-radius:9px;font-size:16px;font-weight:800;font-family:'Plus Jakarta Sans';"
                oninput="AlimentacionModule._actualizarTotal()">
            </div>`).join('')}
        </div>
        <div style="background:var(--bg);border-radius:10px;padding:10px 16px;display:flex;align-items:center;justify-content:space-between;">
          <span style="font-size:13px;font-weight:600;color:var(--muted);">Total comensales</span>
          <span id="al-total-display" style="font-size:22px;font-weight:800;color:var(--ink);">${presentes+misioneros+voluntarios+staff}</span>
        </div>
      </div>

      <!-- Insumos usados -->
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
          ${arts.map(a => {
            const cantPrev = consumoPlantilla[a.id] || 0;
            const subtotal = cantPrev > 0 && a.precio > 0 ? (cantPrev * a.precio).toFixed(2) : '0.00';
            return `
            <div style="display:grid;grid-template-columns:1.8fr .8fr .9fr .9fr .9fr;gap:6px;padding:9px 14px;border-top:1px solid var(--line);align-items:center;">
              <div>
                <div style="font-size:13.5px;font-weight:600;">${esc(a.nombre)}</div>
                <div style="font-size:11px;color:var(--faint);">${esc(a.categoria)}</div>
              </div>
              <span style="font-size:13px;font-weight:700;color:${a.stock<a.minimo?'var(--danger)':'var(--ink)'};">${a.stock} <span style="font-size:11px;font-weight:400;color:var(--faint);">${esc(a.unidad)}</span></span>
              <input type="number" id="al-uso-${a.id}" value="${cantPrev}" min="0" step="0.01"
                style="width:80px;padding:6px 8px;border:1.5px solid var(--border);border-radius:7px;font-size:13px;text-align:center;"
                oninput="AlimentacionModule._onCantidadChange(this,${a.id},${a.precio})">
              <span style="font-size:12.5px;color:var(--muted);">${a.precio>0?'$'+a.precio.toFixed(2):'—'}</span>
              <span id="al-sub-${a.id}" style="font-size:13px;font-weight:700;color:var(--primary);">${cantPrev>0&&a.precio>0?'$'+subtotal:'—'}</span>
            </div>`;
          }).join('')}
        </div>
      </div>

      <!-- Resumen de costos (live) -->
      <div id="al-resumen" style="background:linear-gradient(135deg,var(--primary),var(--primary-d));color:#fff;border-radius:14px;padding:16px 20px;margin-top:4px;">
        <div style="font-size:12px;font-weight:700;letter-spacing:.5px;opacity:.7;margin-bottom:10px;">RESUMEN DE COSTOS</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;">
          <div>
            <div style="font-size:11px;opacity:.7;">Costo ingredientes</div>
            <div id="al-res-total" style="font-size:22px;font-weight:800;">$0.00</div>
          </div>
          <div>
            <div style="font-size:11px;opacity:.7;">Comensales</div>
            <div id="al-res-comensales" style="font-size:22px;font-weight:800;">${presentes+misioneros+voluntarios+staff}</div>
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
        <button class="btn btn-outline" onclick="UI.closeModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="AlimentacionModule.confirmarServicio()">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M20 6 9 17l-5-5"/></svg>
          Registrar y descontar del almacén
        </button>
      </div>
    `, {wide: true});

    // Inicializa el resumen con los valores de la plantilla
    setTimeout(() => _recalcularResumen(), 50);
  }

  /* Live: actualiza subtotal de un artículo y recalcula resumen */
  function _onCantidadChange(input, artId, precio) {
    const cant = parseFloat(input.value) || 0;
    const sub  = document.getElementById(`al-sub-${artId}`);
    if (sub) {
      if (cant > 0 && precio > 0) {
        sub.textContent = '$' + (cant * precio).toFixed(2);
        sub.style.color = 'var(--primary)';
        input.style.borderColor = 'var(--primary)';
      } else {
        sub.textContent = '—';
        sub.style.color = 'var(--faint)';
        input.style.borderColor = cant > 0 ? 'var(--success)' : 'var(--border)';
      }
    }
    _recalcularResumen();
  }

  function _actualizarTotal() {
    const total = ['al-ninos','al-misioneros','al-voluntarios','al-padres','al-staff']
      .reduce((s, id) => s + (parseInt(document.getElementById(id)?.value) || 0), 0);
    const el = document.getElementById('al-total-display');
    const rc = document.getElementById('al-res-comensales');
    if (el) el.textContent = total;
    if (rc) rc.textContent = total;
    _recalcularResumen();
  }

  function _recalcularResumen() {
    let costoTotal = 0;
    DB.articulos.filter(a => CATS_ALIMENTO.includes(a.categoria)).forEach(a => {
      const cant = parseFloat(document.getElementById(`al-uso-${a.id}`)?.value) || 0;
      if (cant > 0 && a.precio > 0) costoTotal += cant * a.precio;
    });
    const comensales = ['al-ninos','al-misioneros','al-voluntarios','al-padres','al-staff']
      .reduce((s, id) => s + (parseInt(document.getElementById(id)?.value) || 0), 0);

    const elTotal = document.getElementById('al-res-total');
    const elPlato = document.getElementById('al-res-plato');
    if (elTotal) elTotal.textContent = '$' + costoTotal.toFixed(2);
    if (elPlato) elPlato.textContent = comensales > 0 && costoTotal > 0
      ? '$' + (costoTotal / comensales).toFixed(2)
      : '—';
  }

  /* ---------- CONFIRMAR ---------- */
  async function confirmarServicio() {
    const menu = document.getElementById('al-menu')?.value.trim();
    if (!menu) { UI.toast('Escribe el nombre del menú', 'error'); return; }

    const ninos       = parseInt(document.getElementById('al-ninos')?.value) || 0;
    const misioneros  = parseInt(document.getElementById('al-misioneros')?.value) || 0;
    const voluntarios = parseInt(document.getElementById('al-voluntarios')?.value) || 0;
    const padres      = parseInt(document.getElementById('al-padres')?.value) || 0;
    const staff       = parseInt(document.getElementById('al-staff')?.value) || 0;
    const total       = ninos + misioneros + voluntarios + padres + staff;

    if (total <= 0) { UI.toast('Ingresa al menos un comensal', 'error'); return; }

    const consumoValido = [];
    const insumosTexto  = [];
    let costoTotal = 0;

    DB.articulos.filter(a => CATS_ALIMENTO.includes(a.categoria)).forEach(a => {
      const cant = parseFloat(document.getElementById(`al-uso-${a.id}`)?.value) || 0;
      if (cant > 0) {
        consumoValido.push({ articuloId: a.id, cantidad: cant });
        insumosTexto.push(`${a.nombre} ${cant}${a.unidad}`);
        if (a.precio > 0) costoTotal += cant * a.precio;
      }
    });

    const costoPlato = total > 0 && costoTotal > 0
      ? parseFloat((costoTotal / total).toFixed(2))
      : 0;

    const btn = document.querySelector('.modal .btn-primary');
    if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }

    const res = await DB.registrarServicio({
      menu,
      total,
      ninos,
      misioneros,
      voluntarios,
      padres,
      staff,
      insumos:    insumosTexto.join(' · ') || 'Sin insumos registrados',
      costo:      parseFloat(costoTotal.toFixed(2)),
      costoPlato,
    }, consumoValido);

    if (res && res.error) { UI.toast(res.error, 'error'); if (btn) { btn.disabled=false; btn.textContent='Registrar y descontar del almacén'; } return; }

    UI.closeModal();
    const desc = consumoValido.length
      ? `${consumoValido.length} insumo${consumoValido.length>1?'s':''} descontado${consumoValido.length>1?'s':''}`
      : 'sin insumos';
    UI.toast(`"${esc(menu)}" registrado — ${total} comensales · $${costoTotal.toFixed(2)} · $${costoPlato.toFixed(2)}/plato`, 'success');
    App.refresh();
  }

  window.AlimentacionModule = {
    abrirServicio, confirmarServicio,
    _onCantidadChange, _actualizarTotal, _recalcularResumen,
  };
  return { render };
})());
