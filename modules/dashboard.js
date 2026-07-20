/* ============================================================
   modules/dashboard.js
   ============================================================ */
App.register('dashboard', (function () {

  ['asistencia:update','gastos:update','fondos:update','entregas:update',
   'alimentacion:update','almacen:update','personas:update','actividad:add'
  ].forEach(function(ev) {
    DB.on(ev, function() { if (App.isActive('dashboard')) App.refresh(); });
  });

  /* ── micro helpers ─────────────────────────────────────── */
  function _bar(pct, color, h) {
    pct = Math.min(100, Math.max(0, pct || 0));
    h   = h || 8;
    return '<div style="height:'+h+'px;background:var(--line);border-radius:99px;overflow:hidden;">'
         + '<div style="height:100%;width:'+pct+'%;background:'+color+';border-radius:99px;"></div></div>';
  }

  function _s(n) {
    return Number(n || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function _si(n) {
    return Number(n || 0).toLocaleString('es-PE');
  }

  function _navBtn(mod, label) {
    return '<button class="btn-ghost" style="font-size:11.5px;padding:4px 0;color:var(--primary);font-weight:700;" '
         + 'onclick="App.navigate(\''+mod+'\')">'+label+' →</button>';
  }

  /* ── render ────────────────────────────────────────────── */
  function render() {
    var kpi      = DB.getKPIs();
    var fondos   = DB.fondos;
    var alertas  = DB.getAlertasActivas();
    var personas = DB.personas;
    var asist    = DB.asistencia;
    var gastos   = DB.gastos;
    var arts     = DB.articulos;
    var svcs     = DB.serviciosAlimentacion;
    var entregas = DB.entregas;

    /* --- personas por tipo --- */
    var pTipos = { nino:0, padre:0, misionero:0, voluntario:0, staff:0 };
    personas.forEach(function(p) { if (pTipos[p.tipo] !== undefined) pTipos[p.tipo]++; });
    var pTotal  = personas.length;
    var pActivos= personas.filter(function(p){return p.estado==='activo';}).length;

    /* --- asistencia --- */
    var aPresentes = asist.filter(function(a){return a.presente;}).length;
    var aTotal     = asist.length;
    var aPct       = aTotal ? Math.round(aPresentes/aTotal*100) : 0;
    var aColor     = aPct >= 75 ? '#1D7A56' : aPct >= 50 ? '#9A6B0A' : '#C24A30';

    var asisTipos = {};
    asist.forEach(function(a) {
      if (!asisTipos[a.tipo]) asisTipos[a.tipo] = { total:0, presentes:0 };
      asisTipos[a.tipo].total++;
      if (a.presente) asisTipos[a.tipo].presentes++;
    });

    /* --- alimentación --- */
    var totalRaciones = svcs.reduce(function(s,x){return s+(x.total||0);},0);
    var costos = svcs.filter(function(s){return s.costoPlato>0;});
    var avgCosto = costos.length ? costos.reduce(function(s,x){return s+x.costoPlato;},0)/costos.length : 0;
    var svcsRecientes = svcs.slice(0,8).reverse(); // cronológico para la barra
    var maxRac = svcsRecientes.length ? Math.max.apply(null,svcsRecientes.map(function(s){return s.total||0;})) : 1;

    /* --- almacén --- */
    var criticos = arts.filter(function(a){return a.stock<a.minimo;});
    var stockVal = arts.reduce(function(s,a){return s+(a.stock*(a.precio||0));},0);
    var porCat   = {};
    arts.forEach(function(a){ porCat[a.categoria]=(porCat[a.categoria]||0)+1; });

    /* --- gastos --- */
    var totalGasto = gastos.reduce(function(s,g){return s+g.monto;},0);
    var gastosCat  = {};
    gastos.forEach(function(g){ gastosCat[g.categoria]=(gastosCat[g.categoria]||0)+g.monto; });
    var catEntries = Object.entries(gastosCat).sort(function(a,b){return b[1]-a[1];}).slice(0,5);
    var maxCat     = catEntries[0] ? catEntries[0][1] : 1;

    /* --- entregas --- */
    var entRecientes = entregas.slice(0,6);
    var entPorTipo   = {};
    entregas.forEach(function(e){
      var t = e.personaTipo||'nino';
      entPorTipo[t]=(entPorTipo[t]||0)+1;
    });

    /* --- fondos --- */
    var balance    = fondos.balance || 0;
    var ingresos   = fondos.ingresos || 0;
    var egresos    = fondos.egresos || 0;
    var balPos     = balance >= 0;
    var balColor   = balPos ? '#1D7A56' : '#C24A30';
    var ingPct     = ingresos ? Math.min(100,Math.round(ingresos/(ingresos+egresos||1)*100)) : 0;
    var egPct      = 100 - ingPct;

    var TIPO_LABEL = { nino:'Niños', padre:'Padres', misionero:'Misioneros', voluntario:'Voluntarios', staff:'Staff' };
    var TIPO_COL   = { nino:'#1a7a9e', padre:'#6B4EEA', misionero:'#1D7A56', voluntario:'#C24A30', staff:'#9A6B0A' };
    var CAT_COLS   = ['#1a7a9e','#6B4EEA','#1D7A56','#9A6B0A','#C24A30'];

    var now    = new Date();
    var hoyStr = now.toLocaleDateString('es-PE',{weekday:'long',day:'numeric',month:'long'});
    hoyStr     = hoyStr.charAt(0).toUpperCase()+hoyStr.slice(1);

    /* ========================================================
       HTML
    ======================================================== */
    return (

    /* ── PAGE HEADER ──────────────────────────────────────── */
    '<div class="page-header">'
    + '<div><h1>Panel de impacto</h1>'
    + '<p style="color:var(--muted);">'+hoyStr+' · datos conectados en tiempo real</p></div>'
    + '<div style="margin-left:auto;display:flex;gap:8px;">'
    + '<button class="btn btn-outline" onclick="App.navigate(\'reportes\')">'
    + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> Reportes</button>'
    + '</div></div>'

    /* ── FILA 1: 5 KPIs ───────────────────────────────────── */
    + '<div class="dash-r5">'

    /* Personas */
    + '<div class="kpi-card" style="cursor:pointer;" onclick="App.navigate(\'personas\')">'
    + '<div style="display:flex;justify-content:space-between;align-items:flex-start;">'
    + '<span class="label">Personas</span>'
    + '<div style="width:32px;height:32px;background:#E0F0FF;border-radius:9px;display:flex;align-items:center;justify-content:center;">'
    + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#015a9e" stroke-width="2"><circle cx="9" cy="7" r="3"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/><circle cx="19" cy="7" r="2"/><path d="M23 21v-1a3 3 0 0 0-2-2.8"/></svg>'
    + '</div></div>'
    + '<div class="value" style="font-size:34px;">'+pTotal+'</div>'
    + '<div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:4px;">'
    + Object.entries(pTipos).filter(function(e){return e[1]>0;}).map(function(e){
        return '<span style="font-size:10.5px;background:'+TIPO_COL[e[0]]+'18;color:'+TIPO_COL[e[0]]+';border-radius:20px;padding:2px 7px;font-weight:700;">'+e[1]+' '+TIPO_LABEL[e[0]]+'</span>';
      }).join('')
    + '</div></div>'

    /* Asistencia hoy */
    + '<div class="kpi-card" style="cursor:pointer;" onclick="App.navigate(\'asistencia\')">'
    + '<div style="display:flex;justify-content:space-between;align-items:flex-start;">'
    + '<span class="label">Asistencia hoy</span>'
    + '<span style="font-size:11px;font-weight:800;background:'+(aPct>=75?'#E8F7F1':aPct>=50?'#FDF2D5':'#FDE7E1')+';color:'+aColor+';border-radius:20px;padding:3px 9px;">'+aPct+'%</span>'
    + '</div>'
    + '<div class="value" style="font-size:34px;color:'+aColor+';">'+aPresentes+'<span style="font-size:16px;font-weight:400;color:var(--muted);"> / '+aTotal+'</span></div>'
    + _bar(aPct, aColor, 6)
    + '<div class="sub" style="margin-top:6px;color:var(--muted);">'+(aTotal-aPresentes)+' ausentes</div>'
    + '</div>'

    /* Raciones */
    + '<div class="kpi-card" style="cursor:pointer;" onclick="App.navigate(\'alimentacion\')">'
    + '<div style="display:flex;justify-content:space-between;align-items:flex-start;">'
    + '<span class="label">Raciones servidas</span>'
    + '<div style="width:32px;height:32px;background:#FDF2D5;border-radius:9px;display:flex;align-items:center;justify-content:center;">'
    + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9A6B0A" stroke-width="2"><path d="M5 3v7a2.5 2.5 0 0 0 5 0V3M7.5 10v11M17 3c-1.7 0-3 2.2-3 5s1.3 4 3 4v9"/></svg>'
    + '</div></div>'
    + '<div class="value" style="font-size:34px;">'+_si(totalRaciones)+'</div>'
    + '<div class="sub" style="color:var(--muted);">'+svcs.length+' servicios · '+(avgCosto>0?'S/ '+avgCosto.toFixed(2)+'/plato':'sin costo registrado')+'</div>'
    + '</div>'

    /* Entregas */
    + '<div class="kpi-card" style="cursor:pointer;" onclick="App.navigate(\'entregas\')">'
    + '<div style="display:flex;justify-content:space-between;align-items:flex-start;">'
    + '<span class="label">Entregas realizadas</span>'
    + '<div style="width:32px;height:32px;background:#EDE7FD;border-radius:9px;display:flex;align-items:center;justify-content:center;">'
    + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6B4EEA" stroke-width="2"><path d="M20 12v8H4v-8M2.5 7h19v5h-19zM12 22V7"/></svg>'
    + '</div></div>'
    + '<div class="value" style="font-size:34px;">'+entregas.length+'</div>'
    + '<div class="sub" style="color:var(--muted);">'+Object.keys(entPorTipo).length+' tipos de beneficiario</div>'
    + '</div>'

    /* Balance */
    + '<div class="kpi-card" style="cursor:pointer;background:'+(balPos?'#E8F7F1':'#FDE7E1')+';border:1.5px solid '+balColor+'33;" onclick="App.navigate(\'gastos\')">'
    + '<div style="display:flex;justify-content:space-between;align-items:flex-start;">'
    + '<span class="label" style="color:'+balColor+';">Balance fondos</span>'
    + '<span style="font-size:10px;font-weight:800;color:'+balColor+';opacity:.7;">'+(balPos?'▲ POSITIVO':'▼ NEGATIVO')+'</span>'
    + '</div>'
    + '<div class="value" style="font-size:28px;color:'+balColor+';">S/ '+_s(Math.abs(balance))+'</div>'
    + '<div style="display:flex;justify-content:space-between;font-size:11px;margin-top:6px;">'
    + '<span style="color:#1D7A56;font-weight:700;">▲ S/ '+_s(ingresos)+'</span>'
    + '<span style="color:#C24A30;font-weight:700;">▼ S/ '+_s(egresos)+'</span>'
    + '</div>'
    + '</div>'

    + '</div>' /* /fila 1 */

    /* ── FILA 2: Barras raciones + Asistencia por tipo ──── */
    + '<div class="dash-r2l">'

    /* Gráfico raciones por servicio */
    + '<div class="kpi-card">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;">'
    + '<div style="font-weight:800;font-size:15px;">Raciones por servicio <span style="font-size:12px;font-weight:400;color:var(--muted);">últimos '+svcsRecientes.length+' servicios</span></div>'
    + _navBtn('alimentacion','Ver todos')
    + '</div>'
    + (svcsRecientes.length
      ? '<div style="display:flex;align-items:flex-end;gap:8px;height:140px;">'
        + svcsRecientes.map(function(s) {
            var h   = maxRac ? Math.round((s.total||0)/maxRac*120) : 4;
            var mes = (s.fecha||'').slice(5,7);
            var dia = (s.fecha||'').slice(8,10);
            var MESES = ['','ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
            var label = dia+' '+MESES[parseInt(mes,10)];
            return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;">'
              + '<div style="font-size:10px;font-weight:700;color:var(--primary);">'+s.total+'</div>'
              + '<div style="width:100%;height:'+(h||4)+'px;background:var(--primary);border-radius:5px 5px 0 0;min-height:4px;opacity:.85;"></div>'
              + '<div style="font-size:9.5px;color:var(--muted);text-align:center;line-height:1.2;">'+label+'</div>'
              + '</div>';
          }).join('')
        + '</div>'
      : '<div style="height:140px;display:flex;align-items:center;justify-content:center;color:var(--faint);font-size:13px;">Sin servicios registrados</div>')
    + '</div>'

    /* Asistencia por tipo */
    + '<div class="kpi-card">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">'
    + '<div style="font-weight:800;font-size:15px;">Asistencia hoy</div>'
    + _navBtn('asistencia','Ver detalle')
    + '</div>'
    + (Object.keys(asisTipos).length
      ? '<div style="display:flex;flex-direction:column;gap:12px;">'
        + Object.entries(asisTipos).map(function(entry) {
            var tipo = entry[0], d = entry[1];
            var pct  = Math.round(d.presentes/d.total*100);
            var col  = TIPO_COL[tipo]||'#888';
            return '<div>'
              + '<div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:4px;">'
              + '<span style="font-weight:700;">'+TIPO_LABEL[tipo]+'</span>'
              + '<span style="color:'+col+';font-weight:800;">'+d.presentes+'/'+d.total+' · '+pct+'%</span>'
              + '</div>'
              + _bar(pct, col, 8)
              + '</div>';
          }).join('')
        + '</div>'
      : '<div style="color:var(--faint);font-size:13px;">Sin datos de asistencia hoy</div>')
    + '</div>'

    + '</div>' /* /fila 2 */

    /* ── FILA 3: Gastos cat + Almacén + Finanzas ─────────── */
    + '<div class="dash-r3">'

    /* Gastos por categoría */
    + '<div class="kpi-card">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">'
    + '<div style="font-weight:800;font-size:15px;">Egresos por categoría</div>'
    + _navBtn('gastos','Ver gastos')
    + '</div>'
    + (catEntries.length
      ? '<div style="display:flex;flex-direction:column;gap:11px;">'
        + catEntries.map(function(entry,i) {
            var cat = entry[0], val = entry[1];
            var pct = Math.round(val/maxCat*100);
            var c   = CAT_COLS[i%CAT_COLS.length];
            return '<div>'
              + '<div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:4px;">'
              + '<span style="font-weight:600;">'+esc(cat)+'</span>'
              + '<span style="font-weight:800;color:'+c+';">S/ '+_s(val)+'</span>'
              + '</div>'
              + _bar(pct, c, 7)
              + '</div>';
          }).join('')
        + '<div style="padding-top:8px;border-top:1px solid var(--line);display:flex;justify-content:space-between;font-size:12.5px;">'
        + '<span style="font-weight:700;color:var(--muted);">Total egresos</span>'
        + '<span style="font-weight:800;">S/ '+_s(totalGasto)+'</span>'
        + '</div></div>'
      : '<div style="color:var(--faint);font-size:13px;">Sin gastos registrados</div>')
    + '</div>'

    /* Estado almacén */
    + '<div class="kpi-card">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">'
    + '<div style="font-weight:800;font-size:15px;">Almacén</div>'
    + _navBtn('almacen','Ver inventario')
    + '</div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;">'
    + '<div style="background:var(--bg);border-radius:10px;padding:10px 12px;text-align:center;">'
    + '<div style="font-size:22px;font-weight:800;">'+arts.length+'</div>'
    + '<div style="font-size:10.5px;color:var(--muted);font-weight:700;">artículos</div>'
    + '</div>'
    + '<div style="background:'+(criticos.length?'#FDE7E1':'#E8F7F1')+';border-radius:10px;padding:10px 12px;text-align:center;">'
    + '<div style="font-size:22px;font-weight:800;color:'+(criticos.length?'#C24A30':'#1D7A56')+';">'+criticos.length+'</div>'
    + '<div style="font-size:10.5px;color:var(--muted);font-weight:700;">críticos</div>'
    + '</div></div>'
    + (criticos.length
      ? '<div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:6px;">REQUIEREN REPOSICIÓN</div>'
        + criticos.slice(0,4).map(function(a) {
            var pct = Math.round(a.stock/Math.max(a.minimo,1)*100);
            return '<div style="margin-bottom:8px;">'
              + '<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px;">'
              + '<span style="font-weight:600;">'+esc(a.nombre)+'</span>'
              + '<span style="color:#C24A30;font-weight:700;">'+a.stock+'/'+a.minimo+' '+esc(a.unidad)+'</span>'
              + '</div>'+_bar(pct,'#C24A30',5)+'</div>';
          }).join('')
        + (criticos.length>4 ? '<div style="font-size:11.5px;color:var(--muted);">+'+( criticos.length-4)+' más →</div>' : '')
      : '<div style="color:var(--success);font-weight:700;font-size:13px;">✓ Todo el stock en niveles normales</div>'
        + (stockVal > 0 ? '<div style="font-size:12px;color:var(--muted);margin-top:8px;">Valor estimado: S/ '+_s(stockVal)+'</div>' : ''))
    + '</div>'

    /* Finanzas */
    + '<div class="kpi-card">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">'
    + '<div style="font-weight:800;font-size:15px;">Fondos</div>'
    + _navBtn('gastos','Ver detalle')
    + '</div>'
    /* Barra ingreso vs egreso */
    + '<div style="margin-bottom:14px;">'
    + '<div style="display:flex;justify-content:space-between;font-size:11px;font-weight:700;color:var(--muted);margin-bottom:5px;">'
    + '<span>Ingresos vs Egresos</span>'
    + '<span>'+(ingresos+egresos>0?Math.round(egresos/(ingresos||1)*100)+'% ejecutado':'—')+'</span>'
    + '</div>'
    + '<div style="height:10px;background:var(--line);border-radius:99px;overflow:hidden;">'
    + '<div style="height:100%;display:flex;">'
    + (ingresos+egresos>0
        ? '<div style="flex:'+ingPct+';background:#1D7A56;"></div><div style="flex:'+egPct+';background:#C24A30;"></div>'
        : '<div style="width:100%;background:var(--line);"></div>')
    + '</div></div>'
    + '<div style="display:flex;justify-content:space-between;font-size:11px;margin-top:4px;">'
    + '<span style="color:#1D7A56;font-weight:700;">▲ S/ '+_s(ingresos)+'</span>'
    + '<span style="color:#C24A30;font-weight:700;">▼ S/ '+_s(egresos)+'</span>'
    + '</div></div>'
    /* Últimos ingresos */
    + '<div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:7px;">ÚLTIMOS INGRESOS</div>'
    + ((fondos.movimientos||[]).filter(function(m){return m.tipo==='ingreso';}).slice(0,3).map(function(m) {
        return '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--line);">'
          + '<div><div style="font-size:12px;font-weight:600;">'+esc(m.descripcion||m.categoria||'Ingreso')+'</div>'
          + '<div style="font-size:11px;color:var(--muted);">'+esc(m.fecha)+'</div></div>'
          + '<span style="font-size:13px;font-weight:800;color:#1D7A56;">+S/ '+_s(m.monto)+'</span>'
          + '</div>';
      }).join('') || '<div style="font-size:12.5px;color:var(--faint);">Sin ingresos registrados</div>')
    + '</div>'

    + '</div>' /* /fila 3 */

    /* ── FILA 4: Últimas entregas + Alertas + Actividad ──── */
    + '<div class="dash-r3">'

    /* Últimas entregas */
    + '<div class="kpi-card">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">'
    + '<div style="font-weight:800;font-size:15px;">Últimas entregas</div>'
    + _navBtn('entregas','Ver todas')
    + '</div>'
    + (entRecientes.length
      ? entRecientes.map(function(e) {
          var col = TIPO_COL[e.personaTipo||'nino']||'#1a7a9e';
          return '<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--line);">'
            + '<div style="width:30px;height:30px;border-radius:50%;background:'+col+'18;display:flex;align-items:center;justify-content:center;flex:none;">'
            + '<span style="font-size:13px;font-weight:800;color:'+col+';">'+esc((e.nino||'').charAt(0))+'</span></div>'
            + '<div style="flex:1;min-width:0;">'
            + '<div style="font-size:12.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+esc(e.nino)+'</div>'
            + '<div style="font-size:11.5px;color:var(--muted);">'+esc(e.articulo)+' · x'+e.cantidad+'</div>'
            + '</div>'
            + '<div style="font-size:11px;color:var(--faint);flex:none;">'+esc(e.fecha)+'</div>'
            + '</div>';
        }).join('')
      : '<div style="color:var(--faint);font-size:13px);">Sin entregas registradas</div>')
    + '</div>'

    /* Alertas */
    + '<div class="kpi-card">'
    + '<div style="font-weight:800;font-size:15px;margin-bottom:14px;">Alertas activas</div>'
    + '<div style="display:flex;flex-direction:column;gap:9px;">'
    + (alertas.length
      ? alertas.map(function(a) {
          var bgMap  = {danger:'#FDE7E1', warn:'#FDF2D5', primary:'var(--primary-soft)'};
          var colMap = {danger:'#C24A30', warn:'#9A6B0A', primary:'var(--primary)'};
          var col    = colMap[a.tipo]||'#888';
          var bg     = bgMap[a.tipo]||'var(--line)';
          return '<div style="background:'+bg+';border-radius:10px;padding:10px 12px;display:flex;align-items:flex-start;gap:10px;">'
            + '<div style="width:6px;height:6px;border-radius:50%;background:'+col+';margin-top:5px;flex:none;"></div>'
            + '<div style="flex:1;">'
            + '<div style="font-size:12.5px;font-weight:700;color:'+col+';">'+esc(a.texto)+'</div>'
            + '<div style="font-size:11.5px;color:var(--muted);margin-top:1px;">'+esc(a.sub)+'</div>'
            + '</div>'
            + '<button class="btn-ghost" style="font-size:11px;color:'+col+';padding:2px 0;font-weight:700;flex:none;" onclick="App.navigate(\''+a.link+'\')">Ir →</button>'
            + '</div>';
        }).join('')
      : '<div style="padding:16px;text-align:center;color:var(--faint);">'
        + '<div style="font-size:22px;margin-bottom:6px;">✓</div>'
        + '<div style="font-size:13px;font-weight:600;">Sin alertas activas</div>'
        + '</div>')
    + '</div></div>'

    /* Actividad reciente */
    + '<div class="kpi-card">'
    + '<div style="font-weight:800;font-size:15px;margin-bottom:14px;">Actividad reciente</div>'
    + '<div style="display:flex;flex-direction:column;gap:0;">'
    + (DB.actividad.length
      ? DB.actividad.slice(0,6).map(function(a,i) {
          return '<div style="display:flex;gap:10px;padding:8px 0;'+(i<5?'border-bottom:1px solid var(--line);':'')+'align-items:flex-start;">'
            + '<div style="width:7px;height:7px;border-radius:50%;background:'+a.color+';margin-top:6px;flex:none;"></div>'
            + '<div style="flex:1;"><div style="font-size:12.5px;line-height:1.4;">'+esc(a.texto)+'</div>'
            + '<div style="font-size:11px;color:var(--faint);margin-top:2px;">'+esc(a.tiempo)+' · '+esc(a.lugar)+'</div>'
            + '</div></div>';
        }).join('')
      : '<div style="color:var(--faint);font-size:13px;">Sin actividad reciente</div>')
    + '</div></div>'

    + '</div>' /* /fila 4 */
    );
  }

  let _refrescando = false;
  function onMount() {
    if (_refrescando) return;
    _refrescando = true;
    DB.recargar().finally(function() { _refrescando = false; });
  }

  window.DashboardModule = {};
  return { render, onMount };
})());
