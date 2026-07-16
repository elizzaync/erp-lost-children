/* ============================================================
   modules/reportes.js
   ============================================================ */
App.register('reportes', (function () {

  let _tab = 'resumen';

  const _ALL_TABS = [
    { key:'resumen',      label:'Resumen general' },
    { key:'asistencia',   label:'Asistencia' },
    { key:'alimentacion', label:'Alimentación' },
    { key:'almacen',      label:'Almacén' },
    { key:'entregas',     label:'Entregas' },
    { key:'gastos',       label:'Gastos e Ingresos' },
  ];

  /* Donador solo ve resumen y gastos */
  const _DONADOR_TABS = ['resumen', 'gastos'];

  function _getTabs() {
    if (window.Auth && Auth.rol && Auth.rol() === 'donador') {
      return _ALL_TABS.filter(t => _DONADOR_TABS.includes(t.key));
    }
    return _ALL_TABS;
  }

  function _getTab() {
    const tabs = _getTabs();
    return tabs.find(t => t.key === _tab) ? _tab : tabs[0].key;
  }

  /* ── helpers visuales ─────────────────────────────────── */
  function _bar(pct, color, h) {
    color = color || 'var(--primary)';
    h = h || 8;
    const p = Math.min(100, Math.max(0, pct));
    return `<div style="height:${h}px;background:var(--line);border-radius:99px;overflow:hidden;">
      <div style="height:100%;width:${p}%;background:${color};border-radius:99px;transition:width .4s;"></div>
    </div>`;
  }

  function _badge(txt, bg, fg) {
    return `<span style="background:${bg};color:${fg};border-radius:20px;padding:3px 10px;font-size:11.5px;font-weight:700;">${txt}</span>`;
  }

  function _kpiCard(label, value, sub, col) {
    sub = sub || '';
    col = col || 'var(--ink)';
    return `<div class="kpi-card">
      <div class="label">${label}</div>
      <div class="value" style="font-size:30px;color:${col};">${value}</div>
      ${sub ? `<div class="sub" style="color:var(--muted);">${sub}</div>` : ''}
    </div>`;
  }

  function _seccion(titulo, contenido, exportKey) {
    exportKey = exportKey || '';
    return `
    <div class="kpi-card" style="margin-bottom:16px;padding:20px 22px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <div style="font-weight:800;font-size:15px;">${titulo}</div>
        ${exportKey ? `<div style="display:flex;gap:6px;">
          <button class="btn btn-sm btn-outline" onclick="ReportesModule.exportCSV('${exportKey}')">CSV</button>
          <button class="btn btn-sm btn-outline" onclick="ReportesModule.exportPDF('${exportKey}')">PDF</button>
        </div>` : ''}
      </div>
      ${contenido}
    </div>`;
  }

  /* ─────────────────────────────────────────────────────────
     RENDER
  ───────────────────────────────────────────────────────── */
  function render() {
    return `
    <div class="page-header">
      <div>
        <h1>Reportes y Transparencia</h1>
        <p>Datos en tiempo real · Exportables en CSV y PDF</p>
      </div>
    </div>

    <!-- TABS -->
    ${(function() {
      const tabs = _getTabs();
      const tab  = _getTab();
      return `<div style="display:flex;gap:0;margin-bottom:20px;border-bottom:2px solid var(--line);overflow-x:auto;">
        ${tabs.map(function(t) { return `
          <button onclick="ReportesModule.setTab('${t.key}')"
            style="padding:10px 18px;border:none;background:none;font-size:13.5px;font-weight:700;cursor:pointer;white-space:nowrap;
              border-bottom:3px solid ${tab===t.key?'var(--primary)':'transparent'};
              color:${tab===t.key?'var(--primary)':'var(--muted)'};margin-bottom:-2px;">
            ${t.label}
          </button>`; }).join('')}
      </div>
      ${tab==='resumen'      ? _tabResumen()      :
        tab==='asistencia'   ? _tabAsistencia()   :
        tab==='alimentacion' ? _tabAlimentacion() :
        tab==='almacen'      ? _tabAlmacen()      :
        tab==='entregas'     ? _tabEntregas()     :
                               _tabGastos()}`;
    })()}`;
  }

  /* ─────────────────────────────────────────────────────────
     TAB: RESUMEN GENERAL
  ───────────────────────────────────────────────────────── */
  function _tabResumen() {
    const kpi      = DB.getKPIs();
    const fondos   = DB.fondos;
    const criticos = DB.articulos.filter(function(a) { return a.stock < a.minimo; });
    const totalP   = DB.personas.length;
    const ninos    = DB.personas.filter(function(p) { return p.tipo === 'nino'; }).length;
    const padres   = DB.personas.filter(function(p) { return p.tipo === 'padre'; }).length;
    const misioner = DB.personas.filter(function(p) { return p.tipo === 'misionero'; }).length;
    const asistPct = totalP ? Math.round(kpi.presentes / totalP * 100) : 0;
    const hoy      = new Date().toLocaleDateString('es-PE',{day:'numeric',month:'long',year:'numeric'});

    const gastosCat = {};
    DB.gastos.forEach(function(g) { gastosCat[g.categoria] = (gastosCat[g.categoria]||0) + g.monto; });
    const totalGasto = DB.gastos.reduce(function(s,g) { return s + g.monto; }, 0);
    const catEntries = Object.entries(gastosCat).sort(function(a,b) { return b[1]-a[1]; });
    const CAT_COLS   = ['#1a7a9e','#6B4EEA','#1D7A56','#C24A30','#9A6B0A','#2A5FA0','#555','#6E7872'];

    return `
    <div style="background:linear-gradient(130deg,#0d4f6e,#1a7a9e);border-radius:18px;padding:24px 28px;color:#fff;margin-bottom:18px;">
      <div style="font-size:11px;letter-spacing:.8px;font-weight:700;opacity:.7;text-transform:uppercase;margin-bottom:6px;">Reporte de impacto · ${hoy}</div>
      <div style="font-size:21px;font-weight:800;margin-bottom:4px;">Lost Children — ¿en qué estamos usando los fondos?</div>
      <p style="margin:0;font-size:13.5px;opacity:.8;">Cada número conectado a un comprobante y a un resultado medible.</p>
    </div>

    <div class="kpi-grid cols-4" style="margin-bottom:16px;">
      ${_kpiCard('Personas registradas', totalP, ninos+' niños · '+padres+' padres · '+misioner+' misioneros')}
      ${_kpiCard('Presentes hoy', kpi.presentes, asistPct+'% de asistencia', asistPct >= 75 ? 'var(--success)' : 'var(--accent)')}
      ${_kpiCard('Raciones servidas', kpi.almuerzosMes.toLocaleString(), 'acumulado registrado')}
      ${_kpiCard('Entregas realizadas', kpi.entregasMes, 'bienes entregados a beneficiarios')}
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
      ${_seccion('Balance financiero', `
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:14px;">
          <div style="background:var(--bg);border-radius:10px;padding:14px;">
            <div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:4px;">INGRESOS</div>
            <div style="font-size:20px;font-weight:800;color:#1D7A56;">S/ ${fondos.ingresos.toLocaleString('es-PE',{minimumFractionDigits:2})}</div>
          </div>
          <div style="background:var(--bg);border-radius:10px;padding:14px;">
            <div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:4px;">EGRESOS</div>
            <div style="font-size:20px;font-weight:800;color:#C24A30;">S/ ${fondos.egresos.toLocaleString('es-PE',{minimumFractionDigits:2})}</div>
          </div>
          <div style="background:${fondos.balance>=0?'#E8F7F1':'#FDE7E1'};border-radius:10px;padding:14px;">
            <div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:4px;">BALANCE</div>
            <div style="font-size:20px;font-weight:800;color:${fondos.balance>=0?'#1D7A56':'#C24A30'};">S/ ${fondos.balance.toLocaleString('es-PE',{minimumFractionDigits:2})}</div>
          </div>
        </div>
        ${fondos.egresos > 0 ? `
          <div style="font-size:12px;color:var(--muted);margin-bottom:6px;">% de ingresos ejecutados</div>
          ${_bar(Math.min(100,Math.round(fondos.egresos/Math.max(fondos.ingresos,1)*100)), fondos.balance>=0?'#1D7A56':'#C24A30', 10)}
          <div style="font-size:12px;color:var(--muted);margin-top:4px;">${Math.round(fondos.egresos/Math.max(fondos.ingresos,1)*100)}%</div>
        ` : '<div style="font-size:13px;color:var(--faint);">Sin egresos registrados aún.</div>'}
      `)}

      ${_seccion('Estado del almacén', `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">
          <div style="background:var(--bg);border-radius:10px;padding:14px;">
            <div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:4px;">ARTÍCULOS</div>
            <div style="font-size:22px;font-weight:800;">${DB.articulos.length}</div>
          </div>
          <div style="background:${criticos.length>0?'#FDE7E1':'#E8F7F1'};border-radius:10px;padding:14px;">
            <div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:4px;">CRÍTICOS</div>
            <div style="font-size:22px;font-weight:800;color:${criticos.length>0?'#C24A30':'#1D7A56'};">${criticos.length}</div>
          </div>
        </div>
        ${criticos.length > 0
          ? `<div style="font-size:12px;font-weight:700;color:var(--muted);margin-bottom:8px;">REQUIEREN REPOSICIÓN</div>
            ${criticos.slice(0,4).map(function(a) { return `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--line);">
                <span style="font-size:13px;font-weight:600;">${a.nombre}</span>
                <span style="font-size:12px;color:#C24A30;font-weight:700;">${a.stock}/${a.minimo} ${a.unidad}</span>
              </div>`; }).join('')}
            ${criticos.length > 4 ? `<div style="font-size:12px;color:var(--muted);margin-top:6px;">+${criticos.length-4} más</div>` : ''}`
          : '<div style="color:var(--success);font-weight:700;font-size:14px;">✓ Todo el stock en niveles normales</div>'}
      `)}
    </div>

    ${_seccion('Distribución de egresos por categoría', `
      ${catEntries.length
        ? `<div style="display:flex;flex-direction:column;gap:12px;">
            ${catEntries.map(function(entry,i) {
              const cat = entry[0], val = entry[1];
              const pct = totalGasto ? Math.round(val/totalGasto*100) : 0;
              const c   = CAT_COLS[i % CAT_COLS.length];
              return `<div>
                <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:5px;">
                  <span style="font-weight:600;">${cat}</span>
                  <span style="font-weight:700;color:${c};">S/ ${val.toLocaleString('es-PE',{minimumFractionDigits:2})}
                    <span style="color:var(--faint);font-weight:400;">(${pct}%)</span></span>
                </div>
                ${_bar(pct, c, 9)}
              </div>`;
            }).join('')}
          </div>`
        : '<div style="font-size:13px;color:var(--faint);">Sin gastos registrados.</div>'}
    `, 'resumen')}`;
  }

  /* ─────────────────────────────────────────────────────────
     TAB: ASISTENCIA
  ───────────────────────────────────────────────────────── */
  function _tabAsistencia() {
    const asis    = DB.asistencia;
    const pres    = asis.filter(function(a) { return a.presente; });
    const ausen   = asis.filter(function(a) { return !a.presente; });
    const porTipo = {};
    asis.forEach(function(a) {
      if (!porTipo[a.tipo]) porTipo[a.tipo] = { total:0, presentes:0 };
      porTipo[a.tipo].total++;
      if (a.presente) porTipo[a.tipo].presentes++;
    });
    const metodos = {};
    pres.forEach(function(a) { metodos[a.metodo] = (metodos[a.metodo]||0) + 1; });
    const TIPO_LABEL = { nino:'Niños', padre:'Padres', misionero:'Misioneros', staff:'Staff', voluntario:'Voluntarios' };
    const TIPO_COL   = { nino:'#1a7a9e', padre:'#6B4EEA', misionero:'#1D7A56', staff:'#9A6B0A', voluntario:'#C24A30' };

    return `
    <div class="kpi-grid cols-3" style="margin-bottom:16px;">
      ${_kpiCard('Total registrados', asis.length)}
      ${_kpiCard('Presentes', pres.length, pres.length+' de '+asis.length+' ('+Math.round(pres.length/Math.max(asis.length,1)*100)+'%)', 'var(--success)')}
      ${_kpiCard('Ausentes', ausen.length, ausen.length > 0 ? 'sin registrar hoy' : 'todos presentes ✓', ausen.length > 0 ? 'var(--accent)' : 'var(--success)')}
    </div>

    <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:16px;margin-bottom:16px;">
      ${_seccion('Por tipo de persona', `
        <div style="display:flex;flex-direction:column;gap:12px;">
          ${Object.entries(porTipo).map(function(entry) {
            const tipo = entry[0], d = entry[1];
            const pct = Math.round(d.presentes/d.total*100);
            const col = TIPO_COL[tipo] || '#888';
            return `<div>
              <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:5px;">
                <span style="font-weight:700;">${TIPO_LABEL[tipo]||tipo}</span>
                <span style="color:${col};font-weight:700;">${d.presentes}/${d.total} · ${pct}%</span>
              </div>
              ${_bar(pct, col, 9)}
            </div>`;
          }).join('')}
        </div>
      `)}
      ${_seccion('Métodos de marcado', `
        ${Object.keys(metodos).length
          ? `<div style="display:flex;flex-direction:column;gap:10px;">
              ${Object.entries(metodos).sort(function(a,b){return b[1]-a[1];}).map(function(entry) {
                const m = entry[0], n = entry[1];
                return `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:var(--bg);border-radius:9px;">
                  <span style="font-size:13px;font-weight:600;">${m}</span>
                  <span style="font-size:20px;font-weight:800;color:var(--primary);">${n}</span>
                </div>`;
              }).join('')}
            </div>`
          : '<div style="font-size:13px;color:var(--faint);">Sin asistencia registrada hoy.</div>'}
      `)}
    </div>

    ${_seccion('Detalle de asistencia de hoy', `
      ${asis.length
        ? `<div style="font-size:12px;font-weight:700;color:var(--muted);display:grid;grid-template-columns:1fr 110px 90px 90px 130px;padding:0 4px 8px;border-bottom:1px solid var(--line);">
            <span>Persona</span><span>Tipo</span><span>Estado</span><span>Hora</span><span>Método</span>
          </div>
          <div style="max-height:380px;overflow-y:auto;">
            ${asis.map(function(a) {
              const col = TIPO_COL[a.tipo] || '#888';
              return `<div style="display:grid;grid-template-columns:1fr 110px 90px 90px 130px;padding:9px 4px;border-bottom:1px solid var(--line);align-items:center;">
                <span style="font-size:13px;font-weight:600;">${a.nombre}</span>
                ${_badge(TIPO_LABEL[a.tipo]||a.tipo, col+'22', col)}
                ${a.presente
                  ? '<span style="color:var(--success);font-weight:700;font-size:12.5px;">✓ Presente</span>'
                  : '<span style="color:var(--muted);font-size:12.5px;">— Ausente</span>'}
                <span style="font-size:12.5px;color:var(--muted);">${a.hora||'—'}</span>
                <span style="font-size:12px;color:var(--muted);">${a.metodo||'—'}</span>
              </div>`;
            }).join('')}
          </div>`
        : '<div style="color:var(--faint);font-size:13px;">Sin datos de asistencia.</div>'}
    `, 'asistencia')}`;
  }

  /* ─────────────────────────────────────────────────────────
     TAB: ALIMENTACIÓN
  ───────────────────────────────────────────────────────── */
  function _tabAlimentacion() {
    const svcs     = DB.serviciosAlimentacion;
    const totalRac = svcs.reduce(function(s,x) { return s + (x.total||0); }, 0);
    const costos   = svcs.filter(function(s) { return s.costoPlato > 0; });
    const avgCosto = costos.length ? costos.reduce(function(s,x){return s+x.costoPlato;},0)/costos.length : 0;

    const insumoCount = {};
    svcs.forEach(function(s) {
      if (s.insumos) {
        s.insumos.split(',').forEach(function(ins) {
          const p = ins.trim();
          if (p) insumoCount[p] = (insumoCount[p]||0) + 1;
        });
      }
    });
    const insumoEntries = Object.entries(insumoCount).sort(function(a,b){return b[1]-a[1];}).slice(0,8);
    const maxIns = insumoEntries[0] ? insumoEntries[0][1] : 1;

    return `
    <div class="kpi-grid cols-3" style="margin-bottom:16px;">
      ${_kpiCard('Servicios registrados', svcs.length)}
      ${_kpiCard('Raciones totales', totalRac.toLocaleString(), 'personas atendidas acumulado')}
      ${_kpiCard('Costo prom./plato', avgCosto > 0 ? 'S/ '+avgCosto.toFixed(2) : '—', avgCosto > 0 ? 'promedio calculado' : 'registra precios en almacén', avgCosto > 0 ? 'var(--primary)' : 'var(--muted)')}
    </div>

    <div style="display:grid;grid-template-columns:1.5fr 1fr;gap:16px;margin-bottom:16px;">
      ${_seccion('Últimos servicios registrados', `
        ${svcs.length
          ? svcs.slice(0,10).map(function(s) { return `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--line);">
                <div>
                  <div style="font-size:13.5px;font-weight:700;">${s.menu || '(sin nombre)'}</div>
                  <div style="font-size:12px;color:var(--muted);">${s.fecha}${s.insumos ? ' · '+s.insumos : ''}</div>
                </div>
                <div style="text-align:right;flex-shrink:0;margin-left:12px;">
                  <div style="font-size:14px;font-weight:800;color:var(--primary);">${s.total} raciones</div>
                  ${s.costoPlato > 0 ? `<div style="font-size:11.5px;color:var(--muted);">S/ ${s.costoPlato.toFixed(2)}/c.u</div>` : ''}
                </div>
              </div>`; }).join('')
          : '<div style="color:var(--faint);font-size:13px;">Sin servicios registrados aún.</div>'}
      `, 'alimentacion')}

      ${_seccion('Insumos más frecuentes', `
        ${insumoEntries.length
          ? `<div style="display:flex;flex-direction:column;gap:10px;">
              ${insumoEntries.map(function(e) {
                const ins = e[0], n = e[1];
                return `<div>
                  <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:4px;">
                    <span style="font-weight:600;">${ins}</span>
                    <span style="color:#1D7A56;font-weight:700;">${n}x</span>
                  </div>
                  ${_bar(Math.round(n/maxIns*100), '#1D7A56', 7)}
                </div>`;
              }).join('')}
            </div>`
          : '<div style="font-size:13px;color:var(--faint);">Sin datos de insumos.</div>'}
      `)}
    </div>`;
  }

  /* ─────────────────────────────────────────────────────────
     TAB: ALMACÉN
  ───────────────────────────────────────────────────────── */
  function _tabAlmacen() {
    const arts     = DB.articulos;
    const criticos = arts.filter(function(a) { return a.stock < a.minimo; });
    const porCat   = {};
    arts.forEach(function(a) {
      if (!porCat[a.categoria]) porCat[a.categoria] = [];
      porCat[a.categoria].push(a);
    });
    const totalVal = arts.reduce(function(s,a) { return s + (a.stock * (a.precio||0)); }, 0);
    const CAT_COLS = { Alimentos:'#1a7a9e', 'Proteínas':'#1D7A56', Condimentos:'#9A6B0A', Higiene:'#6B4EEA', 'Útiles':'#2A5FA0', Regalos:'#C24A30', Otros:'#888' };

    return `
    <div class="kpi-grid cols-4" style="margin-bottom:16px;">
      ${_kpiCard('Artículos en catálogo', arts.length)}
      ${_kpiCard('Artículos críticos', criticos.length, criticos.length>0?'requieren reposición':'todo OK', criticos.length>0?'var(--danger)':'var(--success)')}
      ${_kpiCard('Categorías', Object.keys(porCat).length)}
      ${_kpiCard('Valor est. del stock', totalVal>0?'S/ '+totalVal.toLocaleString('es-PE',{minimumFractionDigits:2}):'—', totalVal>0?'precio × stock':'sin precios cargados')}
    </div>

    ${criticos.length > 0 ? `
    <div style="background:#FDE7E1;border:1.5px solid #C24A3033;border-radius:14px;padding:14px 18px;margin-bottom:16px;">
      <div style="font-weight:800;font-size:14px;color:#C24A30;margin-bottom:10px;">⚠ ${criticos.length} artículo${criticos.length>1?'s':''} bajo el mínimo</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;">
        ${criticos.map(function(a) {
          const pct = Math.round(a.stock/a.minimo*100);
          return `<div style="background:#fff;border-radius:10px;padding:8px 14px;min-width:160px;">
            <div style="font-weight:700;font-size:13px;">${a.nombre}</div>
            <div style="font-size:12px;color:#C24A30;margin-top:2px;">${a.stock} de ${a.minimo} ${a.unidad}</div>
            ${_bar(pct, '#C24A30', 5)}
          </div>`;
        }).join('')}
      </div>
    </div>` : ''}

    ${_seccion('Inventario por categoría', `
      ${Object.entries(porCat).map(function(entry) {
        const cat = entry[0], lista = entry[1];
        const col  = CAT_COLS[cat] || '#888';
        const crit = lista.filter(function(a) { return a.stock < a.minimo; }).length;
        return `
        <div style="margin-bottom:16px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <div style="font-weight:800;font-size:14px;color:${col};">${cat}</div>
            <div style="display:flex;gap:8px;align-items:center;">
              ${crit > 0 ? _badge(crit+' crítico'+(crit>1?'s':''), '#FDE7E1', '#C24A30') : ''}
              <span style="font-size:12px;color:var(--muted);">${lista.length} artículo${lista.length>1?'s':''}</span>
            </div>
          </div>
          <div style="font-size:11px;font-weight:700;color:var(--muted);display:grid;grid-template-columns:1fr 80px 70px 100px;padding:0 0 5px;border-bottom:1px solid var(--line);">
            <span>Artículo</span><span>Stock</span><span>Mínimo</span><span>Nivel</span>
          </div>
          ${lista.map(function(a) {
            const pct = Math.min(100, Math.round(a.stock/Math.max(a.minimo,1)*100));
            const c   = a.stock < a.minimo ? '#C24A30' : a.stock < a.minimo*1.5 ? '#9A6B0A' : col;
            return `<div style="display:grid;grid-template-columns:1fr 80px 70px 100px;padding:7px 0;border-bottom:1px solid var(--line);align-items:center;">
              <span style="font-size:13px;font-weight:600;">${a.nombre}</span>
              <span style="font-size:13px;font-weight:700;color:${c};">${a.stock} ${a.unidad}</span>
              <span style="font-size:12px;color:var(--muted);">${a.minimo} ${a.unidad}</span>
              <div style="padding-right:8px;">${_bar(pct, c, 7)}</div>
            </div>`;
          }).join('')}
        </div>`;
      }).join('')}
    `, 'almacen')}`;
  }

  /* ─────────────────────────────────────────────────────────
     TAB: ENTREGAS
  ───────────────────────────────────────────────────────── */
  function _tabEntregas() {
    const ent    = DB.entregas;
    const porArt = {}, porTipo = {};
    ent.forEach(function(e) {
      porArt[e.articulo]  = (porArt[e.articulo] ||0) + e.cantidad;
      const t = e.personaTipo || 'nino';
      porTipo[t] = (porTipo[t]||0) + 1;
    });
    const topArts = Object.entries(porArt).sort(function(a,b){return b[1]-a[1];}).slice(0,8);
    const maxArt  = topArts[0] ? topArts[0][1] : 1;
    const TIPO_LABEL = { nino:'Niños', padre:'Padres', misionero:'Misioneros', staff:'Staff', voluntario:'Voluntarios' };
    const TIPO_COLS  = ['#1a7a9e','#6B4EEA','#1D7A56','#9A6B0A','#C24A30'];

    return `
    <div class="kpi-grid cols-3" style="margin-bottom:16px;">
      ${_kpiCard('Total entregas', ent.length)}
      ${_kpiCard('Artículos distintos', Object.keys(porArt).length, 'tipos de bien entregados')}
      ${_kpiCard('Tipos de beneficiario', Object.keys(porTipo).length, Object.entries(porTipo).map(function(e){return e[1]+' '+( TIPO_LABEL[e[0]]||e[0]);}).join(' · '))}
    </div>

    <div style="display:grid;grid-template-columns:1.3fr 1fr;gap:16px;margin-bottom:16px;">
      ${_seccion('Artículos más entregados', `
        ${topArts.length
          ? `<div style="display:flex;flex-direction:column;gap:10px;">
              ${topArts.map(function(entry,i) {
                const art = entry[0], n = entry[1];
                const c = TIPO_COLS[i%TIPO_COLS.length];
                return `<div>
                  <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;">
                    <span style="font-weight:600;">${art}</span>
                    <span style="font-weight:700;color:${c};">${n} uds</span>
                  </div>
                  ${_bar(Math.round(n/maxArt*100), c, 8)}
                </div>`;
              }).join('')}
            </div>`
          : '<div style="font-size:13px;color:var(--faint);">Sin entregas registradas.</div>'}
      `)}
      ${_seccion('Por tipo de beneficiario', `
        ${Object.entries(porTipo).length
          ? `<div style="display:flex;flex-direction:column;gap:10px;">
              ${Object.entries(porTipo).map(function(entry,i) {
                const t = entry[0], n = entry[1];
                return `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:var(--bg);border-radius:10px;">
                  <span style="font-size:13.5px;font-weight:700;">${TIPO_LABEL[t]||t}</span>
                  <div style="text-align:right;">
                    <div style="font-size:20px;font-weight:800;color:${TIPO_COLS[i%TIPO_COLS.length]};">${n}</div>
                    <div style="font-size:11px;color:var(--muted);">entregas</div>
                  </div>
                </div>`;
              }).join('')}
            </div>`
          : '<div style="font-size:13px;color:var(--faint);">Sin datos.</div>'}
      `)}
    </div>

    ${_seccion('Historial completo de entregas', `
      ${ent.length
        ? `<div style="font-size:12px;font-weight:700;color:var(--muted);display:grid;grid-template-columns:80px 1fr 1fr 60px 1fr;padding:0 4px 8px;border-bottom:1px solid var(--line);">
            <span>Fecha</span><span>Beneficiario</span><span>Artículo</span><span>Cant.</span><span>Campaña</span>
          </div>
          <div style="max-height:360px;overflow-y:auto;">
            ${ent.map(function(e) { return `
              <div style="display:grid;grid-template-columns:80px 1fr 1fr 60px 1fr;padding:8px 4px;border-bottom:1px solid var(--line);align-items:center;">
                <span style="font-size:12px;color:var(--muted);">${e.fecha}</span>
                <span style="font-size:13px;font-weight:600;">${e.nino}</span>
                <span style="font-size:13px;">${e.articulo}</span>
                <span style="font-size:13px;font-weight:700;">${e.cantidad}</span>
                <span style="font-size:12px;color:var(--muted);">${e.campana||'General'}</span>
              </div>`; }).join('')}
          </div>`
        : '<div style="font-size:13px;color:var(--faint);">Sin entregas registradas.</div>'}
    `, 'entregas')}`;
  }

  /* ─────────────────────────────────────────────────────────
     TAB: GASTOS E INGRESOS
  ───────────────────────────────────────────────────────── */
  function _tabGastos() {
    const gastos   = DB.gastos;
    const fondos   = DB.fondos;
    const ingresos = (fondos.movimientos || []).filter(function(m) { return m.tipo === 'ingreso'; });
    const gastosCat = {};
    gastos.forEach(function(g) { gastosCat[g.categoria] = (gastosCat[g.categoria]||0) + g.monto; });
    const topCats  = Object.entries(gastosCat).sort(function(a,b){return b[1]-a[1];});
    const maxCat   = topCats[0] ? topCats[0][1] : 1;
    const conComp  = gastos.filter(function(g) { return g.comprobante; }).length;
    const autoGen  = gastos.filter(function(g) { return g.fuenteAuto === 'compra_almacen'; }).length;
    const GCOLS    = ['#C24A30','#9A6B0A','#6B4EEA','#1a7a9e','#2A5FA0','#1D7A56','#888'];
    const TICOL    = { 'Donación de dinero':'#1D7A56','Subvención':'#015a9e','Evento / Pollada':'#6B4EEA','Evento':'#6B4EEA','Colecta':'#9A6B0A','Transferencia':'#2A5FA0','Otro ingreso':'#888' };

    const porTipoIng = {};
    ingresos.forEach(function(m) { const t = m.categoria||'Otro ingreso'; porTipoIng[t]=(porTipoIng[t]||0)+m.monto; });

    return `
    <div class="kpi-grid cols-4" style="margin-bottom:16px;">
      ${_kpiCard('Ingresos', 'S/ '+fondos.ingresos.toLocaleString('es-PE',{minimumFractionDigits:2}), ingresos.length+' movimientos', '#1D7A56')}
      ${_kpiCard('Egresos', 'S/ '+fondos.egresos.toLocaleString('es-PE',{minimumFractionDigits:2}), gastos.length+' gastos registrados', '#C24A30')}
      ${_kpiCard('Balance', 'S/ '+fondos.balance.toLocaleString('es-PE',{minimumFractionDigits:2}), fondos.balance>=0?'positivo':'⚠ negativo', fondos.balance>=0?'#1D7A56':'#C24A30')}
      ${_kpiCard('Con comprobante', conComp+' / '+gastos.length, gastos.length?Math.round(conComp/Math.max(gastos.length,1)*100)+'% documentados':'—')}
    </div>

    <div style="display:grid;grid-template-columns:1.3fr 1fr;gap:16px;margin-bottom:16px;">
      ${_seccion('Egresos por categoría', `
        ${topCats.length
          ? `<div style="display:flex;flex-direction:column;gap:12px;">
              ${topCats.map(function(entry,i) {
                const cat = entry[0], val = entry[1];
                const c   = GCOLS[i%GCOLS.length];
                const pct = fondos.egresos ? Math.round(val/fondos.egresos*100) : 0;
                return `<div>
                  <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;">
                    <span style="font-weight:600;">${cat}</span>
                    <span style="font-weight:700;color:${c};">S/ ${val.toLocaleString('es-PE',{minimumFractionDigits:2})}
                      <span style="color:var(--faint);font-weight:400;">(${pct}%)</span>
                    </span>
                  </div>
                  ${_bar(Math.round(val/maxCat*100), c, 9)}
                </div>`;
              }).join('')}
            </div>`
          : '<div style="font-size:13px;color:var(--faint);">Sin gastos registrados.</div>'}
      `)}

      ${_seccion('Ingresos por tipo', `
        ${Object.entries(porTipoIng).length
          ? `<div style="display:flex;flex-direction:column;gap:10px;">
              ${Object.entries(porTipoIng).sort(function(a,b){return b[1]-a[1];}).map(function(entry) {
                const tipo = entry[0], val = entry[1];
                const c    = TICOL[tipo] || '#888';
                return `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:var(--bg);border-radius:10px;">
                  <span style="font-size:13px;font-weight:700;">${tipo}</span>
                  <span style="font-size:16px;font-weight:800;color:${c};">S/ ${val.toLocaleString('es-PE',{minimumFractionDigits:2})}</span>
                </div>`;
              }).join('')}
            </div>`
          : '<div style="font-size:13px;color:var(--faint);">Sin ingresos registrados.</div>'}
      `)}
    </div>

    ${_seccion('Detalle de egresos · '+gastos.length+' registros', `
      <div style="display:flex;gap:8px;font-size:12px;color:var(--muted);margin-bottom:12px;flex-wrap:wrap;">
        <span style="background:#E0F0FF;color:#015a9e;border-radius:20px;padding:3px 10px;font-weight:700;">Auto-almacén: ${autoGen}</span>
        <span style="background:var(--line);border-radius:20px;padding:3px 10px;font-weight:700;">Manual: ${gastos.length - autoGen}</span>
        <span style="background:#E8F7F1;color:#1D7A56;border-radius:20px;padding:3px 10px;font-weight:700;">Con comprobante: ${conComp}</span>
      </div>
      ${gastos.length
        ? `<div style="font-size:12px;font-weight:700;color:var(--muted);display:grid;grid-template-columns:80px 1fr 1fr 100px 120px;padding:0 4px 8px;border-bottom:1px solid var(--line);">
            <span>Fecha</span><span>Categoría</span><span>Proveedor</span><span>Monto</span><span>Origen</span>
          </div>
          <div style="max-height:360px;overflow-y:auto;">
            ${gastos.map(function(g) { return `
              <div style="display:grid;grid-template-columns:80px 1fr 1fr 100px 120px;padding:8px 4px;border-bottom:1px solid var(--line);align-items:center;">
                <span style="font-size:12px;color:var(--muted);">${g.fecha}</span>
                <div style="background:${g.catBg||'#eee'};color:${g.catFg||'#555'};border-radius:20px;padding:3px 9px;font-size:11.5px;font-weight:700;display:inline-flex;">${g.categoria}</div>
                <span style="font-size:13px;font-weight:600;">${g.proveedor}</span>
                <span style="font-size:13px;font-weight:800;">S/ ${g.monto.toLocaleString('es-PE',{minimumFractionDigits:2})}</span>
                ${g.fuenteAuto==='compra_almacen'
                  ? '<span style="font-size:11px;background:#E0F0FF;color:#015a9e;border-radius:20px;padding:3px 8px;font-weight:700;">Auto·Almacén</span>'
                  : `<span style="font-size:11px;background:var(--line);color:var(--muted);border-radius:20px;padding:3px 8px;font-weight:700;">${g.comprobante?'✓ Con comp.':'Manual'}</span>`}
              </div>`; }).join('')}
          </div>`
        : '<div style="font-size:13px;color:var(--faint);">Sin gastos registrados.</div>'}
    `, 'gastos')}`;
  }

  /* ─────────────────────────────────────────────────────────
     HELPERS COMPARTIDOS DE EXPORT
  ───────────────────────────────────────────────────────── */
  var _META = {
    asistencia:   { titulo:'Reporte de Asistencia',      color:'#1a7a9e', icon:'👥' },
    almacen:      { titulo:'Inventario General',          color:'#6B4EEA', icon:'📦' },
    entregas:     { titulo:'Historial de Entregas',       color:'#1D7A56', icon:'🎁' },
    alimentacion: { titulo:'Informe de Alimentación',     color:'#9A6B0A', icon:'🍽' },
    gastos:       { titulo:'Gastos e Ingresos',           color:'#C24A30', icon:'💰' },
    resumen:      { titulo:'Reporte de Impacto',          color:'#0d4f6e', icon:'🎯' },
  };

  function _datos(key) {
    /* Devuelve { cols:[], filas:[], resumen:[] } según la sección */
    var kpi, gastosCat, totalG, entries, out = { cols:[], filas:[], resumen:[] };

    if (key === 'asistencia') {
      out.cols = ['Nombre','Tipo','Presente','Hora','Método'];
      DB.asistencia.forEach(function(a) {
        out.filas.push([a.nombre, a.tipo, a.presente?'✓ Sí':'— No', a.hora||'—', a.metodo||'—']);
      });
      var pres = DB.asistencia.filter(function(a){return a.presente;}).length;
      out.resumen = [
        ['Total registrados', DB.asistencia.length],
        ['Presentes', pres],
        ['Ausentes', DB.asistencia.length - pres],
        ['Asistencia', Math.round(pres/Math.max(DB.asistencia.length,1)*100)+'%'],
      ];

    } else if (key === 'almacen') {
      out.cols = ['Artículo','Categoría','Stock','Mínimo','Unidad','Precio unit.','Vence','Estado'];
      DB.articulos.forEach(function(a) {
        out.filas.push([a.nombre, a.categoria, a.stock, a.minimo, a.unidad,
          a.precio ? 'S/ '+Number(a.precio).toFixed(2) : '—',
          a.vence||'—',
          a.stock < a.minimo ? '⚠ Crítico' : 'OK']);
      });
      var crit = DB.articulos.filter(function(a){return a.stock<a.minimo;}).length;
      out.resumen = [
        ['Total artículos', DB.articulos.length],
        ['Críticos', crit],
        ['Categorías', [...new Set(DB.articulos.map(function(a){return a.categoria;}))].length],
      ];

    } else if (key === 'entregas') {
      out.cols = ['Fecha','Beneficiario','Tipo','Artículo','Categoría','Cantidad','Campaña','Notas'];
      DB.entregas.forEach(function(e) {
        out.filas.push([e.fecha, e.nino, e.personaTipo||'—', e.articulo,
          e.articuloCategoria||'—', e.cantidad, e.campana||'General', e.notas||'—']);
      });
      var uds = DB.entregas.reduce(function(s,e){return s+e.cantidad;},0);
      out.resumen = [
        ['Total entregas', DB.entregas.length],
        ['Unidades entregadas', uds],
        ['Artículos distintos', [...new Set(DB.entregas.map(function(e){return e.articulo;}))].length],
      ];

    } else if (key === 'alimentacion') {
      out.cols = ['Fecha','Menú','Niños','Voluntarios','Padres','Total raciones','Costo/plato'];
      DB.serviciosAlimentacion.forEach(function(s) {
        out.filas.push([s.fecha, s.menu||'—', s.presentes||s.total||0,
          s.voluntarios||0, s.padres||0, s.total||0,
          s.costoPlato > 0 ? 'S/ '+s.costoPlato.toFixed(2) : '—']);
      });
      var totalRac = DB.serviciosAlimentacion.reduce(function(s,x){return s+(x.total||0);},0);
      out.resumen = [
        ['Servicios registrados', DB.serviciosAlimentacion.length],
        ['Raciones totales', totalRac],
      ];

    } else if (key === 'gastos') {
      out.cols = ['Fecha','Categoría','Monto (S/)','Proveedor','Observación','Origen','Comprobante'];
      DB.gastos.forEach(function(g) {
        out.filas.push([g.fechaISO||g.fecha, g.categoria,
          Number(g.monto).toFixed(2), g.proveedor, g.observacion||'—',
          g.fuenteAuto==='compra_almacen'?'Auto-almacén':'Manual',
          g.comprobante?'Sí':'No']);
      });
      var fondos = DB.fondos;
      out.resumen = [
        ['Ingresos totales', 'S/ '+fondos.ingresos.toFixed(2)],
        ['Egresos totales',  'S/ '+fondos.egresos.toFixed(2)],
        ['Balance',          'S/ '+fondos.balance.toFixed(2)],
        ['N.º gastos',       DB.gastos.length],
      ];

    } else if (key === 'resumen') {
      kpi = DB.getKPIs();
      out.cols = ['Indicador','Valor'];
      [['Personas registradas', DB.personas.length],
       ['Niños', kpi.ninos],
       ['Presentes hoy', kpi.presentes],
       ['Raciones servidas', kpi.almuerzosMes],
       ['Entregas realizadas', kpi.entregasMes],
       ['Artículos en almacén', DB.articulos.length],
       ['Artículos críticos', kpi.criticos],
       ['Ingresos totales', 'S/ '+DB.fondos.ingresos.toFixed(2)],
       ['Egresos totales', 'S/ '+DB.fondos.egresos.toFixed(2)],
       ['Balance', 'S/ '+DB.fondos.balance.toFixed(2)],
      ].forEach(function(r){ out.filas.push(r); });
    }

    return out;
  }

  /* ─────────────────────────────────────────────────────────
     EXPORT EXCEL (HTML → .xls con formato completo)
  ───────────────────────────────────────────────────────── */
  function exportCSV(key) {
    var meta  = _META[key] || { titulo: key, color:'#1a7a9e' };
    var datos = _datos(key);
    var fechaStr = new Date().toLocaleDateString('es-PE',{day:'numeric',month:'long',year:'numeric'});
    var fileDate = new Date().toLocaleDateString('es-PE').replace(/\//g,'-');

    if (!datos.filas.length) { UI.toast('Sin datos para exportar', 'warn'); return; }

    var resumenHtml = '';
    if (datos.resumen.length) {
      resumenHtml = '<table class="resumen"><tr>'
        + datos.resumen.map(function(r) {
            return '<td><div class="res-val">'+r[1]+'</div><div class="res-lbl">'+r[0]+'</div></td>';
          }).join('')
        + '</tr></table>';
    }

    var theadCells = datos.cols.map(function(c){ return '<th>'+c+'</th>'; }).join('');
    var tbodyRows  = datos.filas.map(function(fila, ri) {
      var cls = '';
      // Para almacén marca críticos
      if (key==='almacen' && fila[fila.length-1]==='⚠ Crítico') cls = ' class="crit"';
      // Para gastos marca auto-generados
      if (key==='gastos' && fila[5]==='Auto-almacén') cls = ' class="auto"';
      var cells = fila.map(function(v,ci) {
        var align = (typeof v === 'number' || /^S\/ [\d.]/.test(String(v)) || /^\d+$/.test(String(v))) ? ' style="text-align:right;"' : '';
        return '<td'+align+'>'+v+'</td>';
      }).join('');
      return '<tr'+cls+'>'+cells+'</tr>';
    }).join('');

    var html = '<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" '
      +'xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/html4/">'
      +'<head><meta charset="UTF-8">'
      +'<style>'
      +'body{font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#222;margin:16px;}'
      +'.cabecera{background:'+meta.color+';color:#fff;padding:14px 18px;margin-bottom:12px;}'
      +'.cabecera .org{font-size:9pt;letter-spacing:.5px;opacity:.8;margin-bottom:3px;}'
      +'.cabecera h1{font-size:16pt;font-weight:700;margin:0 0 2px;}'
      +'.cabecera .sub{font-size:9pt;opacity:.75;}'
      +'.resumen{border-collapse:collapse;margin-bottom:14px;width:auto;}'
      +'.resumen td{border:1pt solid '+meta.color+'44;padding:8px 18px;text-align:center;background:#f8f8f8;}'
      +'.res-val{font-size:15pt;font-weight:700;color:'+meta.color+';}'
      +'.res-lbl{font-size:8pt;color:#666;margin-top:2px;}'
      +'table.datos{border-collapse:collapse;width:100%;font-size:10pt;}'
      +'table.datos th{background:'+meta.color+';color:#fff;padding:8px 10px;text-align:left;font-weight:700;border:1pt solid '+meta.color+';}'
      +'table.datos td{padding:6px 10px;border:1pt solid #ddd;vertical-align:top;}'
      +'table.datos tr:nth-child(even) td{background:#f4f4f4;}'
      +'table.datos tr.crit td{background:#fff0f0;color:#c00;font-weight:600;}'
      +'table.datos tr.auto td{background:#f0f6ff;}'
      +'.footer{margin-top:12px;font-size:8pt;color:#999;border-top:1pt solid #ddd;padding-top:8px;}'
      +'</style></head><body>'
      +'<div class="cabecera"><div class="org">Lost Children · ONG · '+fechaStr+'</div>'
      +'<h1>'+meta.icon+' '+meta.titulo+'</h1>'
      +'</div>'
      + resumenHtml
      +'<table class="datos"><thead><tr>'+theadCells+'</tr></thead>'
      +'<tbody>'+tbodyRows+'</tbody></table>'
      +'<div class="footer">Generado automáticamente por ERP Lost Children · '+fechaStr+'</div>'
      +'</body></html>';

    var blob = new Blob([html], { type:'application/vnd.ms-excel;charset=utf-8;' });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href = url; a.download = meta.titulo+' - '+fileDate+'.xls';
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
    UI.toast(meta.titulo+' exportado como Excel', 'success');
  }

  /* ─────────────────────────────────────────────────────────
     EXPORT PDF (ventana imprimible profesional)
  ───────────────────────────────────────────────────────── */
  function exportPDF(key) {
    var meta    = _META[key] || { titulo: key, color:'#1a7a9e', icon:'' };
    var datos   = _datos(key);
    var fechaStr= new Date().toLocaleDateString('es-PE',{day:'numeric',month:'long',year:'numeric'});

    if (!datos.filas.length && key !== 'resumen') { UI.toast('Sin datos para exportar', 'warn'); return; }

    /* Tarjetas de resumen */
    var resCards = datos.resumen.map(function(r) {
      return '<div class="card"><div class="card-val">'+r[1]+'</div><div class="card-lbl">'+r[0]+'</div></div>';
    }).join('');

    /* Tabla */
    var theadCells = datos.cols.map(function(c){ return '<th>'+c+'</th>'; }).join('');
    var tbodyRows  = datos.filas.map(function(fila) {
      var cls = '';
      if (key==='almacen' && fila[fila.length-1]==='⚠ Crítico') cls = ' class="crit"';
      if (key==='gastos'  && fila[5]==='Auto-almacén')           cls = ' class="auto"';
      var cells = fila.map(function(v) {
        var isNum = /^[\d., ]+$/.test(String(v)) || /^S\/ /.test(String(v));
        return '<td'+(isNum?' style="text-align:right;"':'')+'>'+v+'</td>';
      }).join('');
      return '<tr'+cls+'>'+cells+'</tr>';
    }).join('');

    var c = meta.color;
    var style = '<style>'
      +'@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap");'
      +'*{box-sizing:border-box;margin:0;padding:0;}'
      +'body{font-family:Inter,Arial,sans-serif;color:#1a1a1a;background:#fff;font-size:12px;}'
      +'.wrap{max-width:900px;margin:0 auto;padding:32px 28px;}'

      /* Header */
      +'.header{background:linear-gradient(135deg,'+c+','+c+'cc);color:#fff;border-radius:14px;padding:24px 28px;margin-bottom:22px;display:flex;justify-content:space-between;align-items:flex-end;}'
      +'.header-left .org{font-size:10px;letter-spacing:.7px;opacity:.75;text-transform:uppercase;margin-bottom:6px;}'
      +'.header-left h1{font-size:22px;font-weight:800;letter-spacing:-.3px;margin-bottom:2px;}'
      +'.header-left .sub{font-size:11px;opacity:.75;}'
      +'.header-right{text-align:right;font-size:11px;opacity:.8;line-height:1.6;}'
      +'.icon{font-size:42px;line-height:1;}'

      /* Tarjetas resumen */
      +'.cards{display:flex;gap:12px;margin-bottom:22px;flex-wrap:wrap;}'
      +'.card{flex:1;min-width:120px;border:1.5px solid '+c+'33;border-radius:10px;padding:14px 16px;text-align:center;background:#fff;}'
      +'.card-val{font-size:22px;font-weight:800;color:'+c+';line-height:1;margin-bottom:4px;}'
      +'.card-lbl{font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.4px;font-weight:600;}'

      /* Tabla */
      +'table{width:100%;border-collapse:collapse;font-size:11px;}'
      +'thead tr{background:'+c+';}'
      +'th{color:#fff;padding:9px 10px;text-align:left;font-weight:700;font-size:11px;letter-spacing:.2px;}'
      +'td{padding:7px 10px;border-bottom:1px solid #eee;vertical-align:top;}'
      +'tr:nth-child(even) td{background:#f8f9fa;}'
      +'tr.crit td{background:#fff3f3;color:#c00;font-weight:600;}'
      +'tr.auto td:first-child{border-left:3px solid #015a9e;}'
      +'tbody tr:last-child td{border-bottom:none;}'

      /* Footer */
      +'.footer{margin-top:24px;padding-top:14px;border-top:1px solid #eee;display:flex;justify-content:space-between;align-items:center;}'
      +'.footer .left{font-size:10px;color:#aaa;}'
      +'.footer .right{font-size:10px;color:#aaa;}'

      /* Botón imprimir */
      +'.btn-print{display:flex;align-items:center;gap:8px;margin-bottom:20px;padding:10px 24px;background:'+c+';color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:700;}'
      +'@media print{'
        +'.btn-print{display:none!important;}'
        +'body{font-size:11px;}'
        +'.wrap{padding:16px;}'
        +'.header{border-radius:6px;}'
        +'@page{margin:1.2cm;}'
      +'}'
      +'</style>';

    var body = '<div class="wrap">'
      +'<div class="header">'
        +'<div class="header-left">'
          +'<div class="org">Lost Children · ONG · Reporte oficial</div>'
          +'<h1>'+meta.titulo+'</h1>'
          +'<div class="sub">Datos en tiempo real · '+fechaStr+'</div>'
        +'</div>'
        +'<div class="header-right"><div class="icon">'+meta.icon+'</div></div>'
      +'</div>'

      +'<button class="btn-print" onclick="window.print()">'
        +'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>'
        +'Imprimir / Guardar como PDF'
      +'</button>'

      +(resCards ? '<div class="cards">'+resCards+'</div>' : '')

      +'<table><thead><tr>'+theadCells+'</tr></thead>'
      +'<tbody>'+tbodyRows+'</tbody></table>'

      +'<div class="footer">'
        +'<div class="left">Lost Children · Sistema ERP · '+fechaStr+'</div>'
        +'<div class="right">Este documento es de uso interno</div>'
      +'</div>'
      +'</div>';

    var win = window.open('', '_blank', 'width=1000,height=760');
    win.document.write('<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">'
      +'<title>'+meta.titulo+' · Lost Children</title>'+style+'</head><body>'+body+'</body></html>');
    win.document.close();
  }

  function setTab(t) { _tab = t; App.refresh(); }

  window.ReportesModule = { setTab, exportCSV, exportPDF };
  return { render };
})());
