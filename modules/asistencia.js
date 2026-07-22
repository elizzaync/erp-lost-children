/* ============================================================
   modules/asistencia.js
   Pestañas:
     "hoy"    → lista de asistencia del día + contador
     "timmy"  → estado del dispositivo Timmy AiFace
   Dispositivo: Timmy TM-AI03F vía bridge HTTP (puerto 7793)
   ============================================================ */
App.register('asistencia', (function () {

  const BRIDGE = window.location.protocol === 'file:'
    ? 'http://localhost:7793'
    : window.location.origin;

  function _authHeaders(extra) {
    return {...(extra||{}), 'Authorization': `Bearer ${Auth.getToken()}`};
  }

  /* ── Estado del módulo ────────────────────────────────────────── */
  let _tab       = 'hoy';
  let _filtroTipo = 'todos';      // 'todos' | 'nino' | 'misionero' | 'voluntario' | 'staff'

  // Pestaña "Marcas del dispositivo"
  let _marcas       = [];
  let _marcasFecha  = new Date().toISOString().slice(0,10);
  let _marcasCargando = false;
  let _marcasTimer  = null;
  let _marcasPersona = 'todas';   // 'todas' | 'desconocidos' | persona_id (string)

  let _bridge = {
    conectado: false, ultimo_log: null,
    error: null, checkeado: false,
    marcas_hoy: 0, sn: null, modelo: null,
  };

  let _autoTimer = null;

  /* ── Listeners de DB ─────────────────────────────────────────── */
  DB.on('asistencia:update', () => {
    if (App.isActive('asistencia') && _tab === 'hoy') _refreshHoy();
  });

  // Tiempo real (WebSocket): alguien acaba de marcar en el Timmy
  DB.on('asistencia:nueva', (nuevos) => {
    if (!App.isActive('asistencia')) return;
    _playTono('registrado');
    _mostrarBannerRegistrado(nuevos.map(n => n.nombre));
    if (_tab === 'marcas') cargarMarcas();
  });

  /* ── Lifecycle ───────────────────────────────────────────────── */
  function onMount() {
    _checkBridge();
    _autoTimer = setInterval(_checkBridge, 300000);
  }
  function onUnmount() {
    clearInterval(_autoTimer);
    if (_marcasTimer) { clearInterval(_marcasTimer); _marcasTimer = null; }
  }

  /* ══════════════════════════════════════════════════════════════
     RENDER PRINCIPAL
  ══════════════════════════════════════════════════════════════ */
  function render() {
    return `
    <div class="page-header">
      <div>
        <h1>Asistencia</h1>
        <p>Jornada de hoy · ${new Date().toLocaleDateString('es-PE',{day:'numeric',month:'long',year:'numeric'})} · Turno mañana</p>
      </div>
      <div style="margin-left:auto;display:flex;gap:8px;">
        <button class="btn btn-outline" onclick="App.navigate('marcado')">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="11" r="3"/><path d="M5 19a7 7 0 0 1 14 0"/></svg>Facial
        </button>
        <button class="btn btn-primary" id="btn-sync" onclick="AsistenciaModule.sincronizar()">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 4v6h6M23 20v-6h-6"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>Actualizar
        </button>
      </div>
    </div>

    <!-- BANNER REGISTRADO (aparece al detectar marca nueva) -->
    <div id="banner-registrado" style="display:none;margin-bottom:10px;"></div>

    <!-- STATUS BAR -->
    <div id="bridge-status-bar">${_renderStatusBar()}</div>

    <!-- TABS -->
    <div style="display:flex;gap:4px;margin-bottom:18px;border-bottom:2px solid var(--line);padding-bottom:0;">
      <button onclick="AsistenciaModule.setTab('hoy')"
        style="padding:10px 20px;font-size:14px;font-weight:700;font-family:'Quicksand';
               border:none;cursor:pointer;border-bottom:3px solid ${_tab==='hoy'?'var(--primary)':'transparent'};
               background:transparent;color:${_tab==='hoy'?'var(--primary)':'var(--muted)'};">
        Asistencia de hoy
      </button>
      <button onclick="AsistenciaModule.setTab('timmy')"
        style="padding:10px 20px;font-size:14px;font-weight:700;font-family:'Quicksand';
               border:none;cursor:pointer;border-bottom:3px solid ${_tab==='timmy'?'var(--primary)':'transparent'};
               background:transparent;color:${_tab==='timmy'?'var(--primary)':'var(--muted)'};">
        Dispositivo Timmy
      </button>
      <button onclick="AsistenciaModule.setTab('marcas')"
        style="padding:10px 20px;font-size:14px;font-weight:700;font-family:'Quicksand';
               border:none;cursor:pointer;border-bottom:3px solid ${_tab==='marcas'?'var(--primary)':'transparent'};
               background:transparent;color:${_tab==='marcas'?'var(--primary)':'var(--muted)'};">
        Marcas del dispositivo
      </button>
    </div>

    <!-- CONTENIDO DE PESTAÑA -->
    <div id="tab-content">
      ${_tab === 'hoy' ? _renderTabHoy() : _tab === 'marcas' ? _renderTabMarcas() : _renderTabTimmy()}
    </div>`;
  }

  /* ══════════════════════════════════════════════════════════════
     PESTAÑA 1 — ASISTENCIA DE HOY
  ══════════════════════════════════════════════════════════════ */
  const _TIPO_LABEL = {nino:'Niño/a', misionero:'Misionero', voluntario:'Voluntario', staff:'Staff'};
  const _TIPO_COLOR = {
    nino:      {bg:'var(--primary-soft)',  color:'var(--primary-d)'},
    misionero: {bg:'#E8F7F1',             color:'#1D7A56'},
    voluntario:{bg:'#EDE7FD',             color:'#6B4EEA'},
    staff:     {bg:'var(--line)',          color:'var(--muted)'},
  };

  /* Calcula conteos por tipo */
  function _calcByTipo() {
    const m = {};
    DB.asistencia.forEach(a => {
      const t = a.tipo || 'nino';
      if (!m[t]) m[t] = {total:0, presentes:0};
      m[t].total++;
      if (a.presente) m[t].presentes++;
    });
    return m;
  }

  function _renderTabHoy() {
    const byTipo    = _calcByTipo();
    const presentes = DB.asistencia.filter(a=>a.presente).length;
    const total     = DB.asistencia.length;
    const pct       = total ? Math.round(presentes/total*100) : 0;

    // Grupos combinados para raciones
    const GRUPOS = [
      {label:'Niños',           tipos:['nino'],                        color:'var(--primary)'},
      {label:'Misioneros',      tipos:['misionero'],                   color:'#1D7A56'},
      {label:'Voluntarios',     tipos:['voluntario'],                  color:'#6B4EEA'},
      {label:'Staff',           tipos:['staff'],                       color:'var(--muted)'},
      {label:'Adultos (todos)', tipos:['misionero','voluntario','staff'], color:'var(--accent)'},
      {label:'TOTAL',           tipos:['nino','misionero','voluntario','staff'], color:'var(--ink)'},
    ];

    return `
    <!-- ── FILTROS POR TIPO ── -->
    <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;align-items:center;">
      ${['todos','nino','misionero','voluntario','staff'].map(t => {
        const activo = _filtroTipo === t;
        const cfg    = _TIPO_COLOR[t] || {bg:'var(--ink)',color:'#fff'};
        const label  = t === 'todos' ? 'Todos' : (_TIPO_LABEL[t]||t);
        const c      = byTipo[t];
        const cnt    = t === 'todos' ? `${presentes}/${total}`
                     : c ? `${c.presentes}/${c.total}` : '0/0';
        return `<button onclick="AsistenciaModule.setFiltroTipo('${t}')"
          style="display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:10px;
                 font-size:13px;font-weight:700;cursor:pointer;font-family:'Quicksand';
                 border:2px solid ${activo ? (t==='todos'?'var(--ink)':cfg.color) : 'var(--border)'};
                 background:${activo ? (t==='todos'?'var(--ink)':cfg.bg) : 'var(--surface)'};
                 color:${activo ? (t==='todos'?'#fff':cfg.color) : 'var(--muted)'};">
          ${label}<span style="font-size:11px;opacity:.7;">${cnt}</span>
        </button>`;
      }).join('')}
      <span style="margin-left:auto;font-size:12px;color:var(--muted);">Tap para marcar · desmarcar</span>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1.7fr;gap:16px;">
      <div style="display:flex;flex-direction:column;gap:14px;">

        <!-- Contador general -->
        <div id="asist-contador" class="grad-card">
          ${_renderContador(presentes,total,pct)}
        </div>

        <!-- Panel de raciones -->
        <div id="asist-raciones" class="kpi-card" style="padding:16px;">
          ${_renderRaciones(GRUPOS, byTipo)}
        </div>

      </div>

      <!-- Lista filtrada -->
      <div class="table-card">
        <div style="padding:14px 20px;border-bottom:1px solid var(--line);font-size:15px;font-weight:700;">
          Lista de asistencia · hoy
        </div>
        <div style="max-height:520px;overflow-y:auto;" id="asist-lista">
          ${_renderLista()}
        </div>
      </div>
    </div>`;
  }

  function _renderRaciones(GRUPOS, byTipo) {
    const filas = GRUPOS.map(g => {
      const presentes = g.tipos.reduce((s,t) => s + (byTipo[t]?.presentes||0), 0);
      const total     = g.tipos.reduce((s,t) => s + (byTipo[t]?.total||0),     0);
      if (total === 0) return '';
      const esSeparador = g.label === 'TOTAL';
      return `
      <div style="display:flex;align-items:center;gap:10px;padding:${esSeparador?'10px 0 2px':'5px 0'};
                  ${esSeparador?'border-top:2px solid var(--line);margin-top:4px;':''}">
        <span style="flex:1;font-size:${esSeparador?'14px':'13px'};font-weight:${esSeparador?'800':'600'};
                     color:${esSeparador?'var(--ink)':'var(--muted)'};">${g.label}</span>
        <span style="font-size:${esSeparador?'22px':'16px'};font-weight:800;color:${g.color};min-width:28px;text-align:right;">${presentes}</span>
        <span style="font-size:11.5px;color:var(--faint);min-width:32px;">/ ${total}</span>
      </div>`;
    }).join('');
    return `
      <div style="font-size:11px;font-weight:800;letter-spacing:1px;color:var(--faint);text-transform:uppercase;margin-bottom:10px;">
        🍽 Raciones del día
      </div>
      ${filas || '<div style="color:var(--faint);font-size:13px;">Sin personas registradas</div>'}`;
  }

  function _renderContador(presentes,total,pct) {
    return `
      <div style="font-size:13px;color:rgba(255,255,255,.6);font-weight:600;">Presentes hoy</div>
      <div style="font-family:'Quicksand';font-weight:800;font-size:46px;letter-spacing:-1.5px;line-height:1.1;margin:6px 0;">
        ${presentes} <span style="font-size:22px;color:rgba(255,255,255,.45);">/ ${total}</span>
      </div>
      <div style="height:8px;background:rgba(255,255,255,.15);border-radius:6px;margin-top:8px;">
        <div style="width:${pct}%;height:100%;background:var(--accent);border-radius:6px;transition:width .4s;"></div>
      </div>
      <div style="font-size:12.5px;color:rgba(255,255,255,.6);margin-top:10px;">
        La cocina prepara <b style="color:#fff;">${presentes} almuerzos</b> hoy.
      </div>`;
  }

  function _renderLista() {
    const lista = _filtroTipo === 'todos'
      ? DB.asistencia
      : DB.asistencia.filter(a => a.sinAsignar || (a.tipo||'nino') === _filtroTipo);
    if (!lista.length) return UI.emptyState('No hay personas de este tipo registradas hoy.');
    return lista.map(a=>{
      // ── Fila especial: usuario Timmy sin persona en el ERP ──
      if (a.sinAsignar) {
        return `
        <div style="display:flex;align-items:center;gap:13px;padding:11px 20px;border-bottom:1px solid var(--line);background:#FFFBEA;">
          ${UI.avatar('?', '#FDF2D5', '#9A6B0A', true)}
          <div style="flex:1;min-width:0;">
            <div style="font-size:14px;font-weight:600;display:flex;align-items:center;gap:7px;">
              ${esc(a.nombre)}
              <span style="background:#FDF2D5;color:#9A6B0A;font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:20px;white-space:nowrap;">Sin asignar</span>
            </div>
            <div style="font-size:12px;color:var(--faint);">ID ${esc(a.zkUserId)} · ${esc(a.metodo)} · ${esc(a.hora)} · Marcó en el dispositivo pero sin persona en el ERP</div>
          </div>
          ${UI.badge('Marcó', 'badge-warn')}
          <button class="btn btn-sm btn-primary"
            onclick="AsistenciaModule.abrirAsignarPersona(${esc(JSON.stringify(a.zkUserId))},${esc(JSON.stringify(a.nombre||''))})">
            Asignar persona
          </button>
        </div>`;
      }
      // ── Fila normal ──
      const cfg = _TIPO_COLOR[a.tipo] || _TIPO_COLOR.staff;
      return `
      <div style="display:flex;align-items:center;gap:13px;padding:11px 20px;border-bottom:1px solid var(--line);">
        ${UI.avatarFoto(a.fotoUrl, a.inicial, a.avatarBg, a.avatarFg, a.nombre)}
        <div style="flex:1;min-width:0;">
          <div style="font-size:14px;font-weight:600;display:flex;align-items:center;gap:7px;">
            ${esc(a.nombre)}
            <span style="background:${cfg.bg};color:${cfg.color};font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:20px;white-space:nowrap;">${esc(_TIPO_LABEL[a.tipo]||a.tipo)}</span>
          </div>
          <div style="font-size:12px;color:var(--faint);">ID ${esc(a.personaId)} · ${a.presente ? esc(a.metodo)+' · '+esc(a.hora) : 'Sin registrar'}</div>
        </div>
        ${UI.badge(a.presente?'Presente':'Ausente', a.presente?'badge-success':'badge-muted')}
        ${a.presente ? '' : `<button class="btn btn-sm btn-primary"
          onclick="AsistenciaModule.toggle(${a.id})">✓ Presente</button>`}
      </div>`;
    }).join('');
  }

  function _iconMetodo(m) {
    if (m.includes('Huella'))  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--warn)" stroke-width="2"><path d="M12 22C6 22 2 17.5 2 12 2 6.5 6 2 12 2s10 4.5 10 10"/><path d="M12 18a6 6 0 0 1-6-6c0-3.3 2.7-6 6-6"/><path d="M12 14a2 2 0 0 1-2-2c0-1.1.9-2 2-2"/></svg>`;
    if (m.includes('Tarjeta')) return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8A6BEA" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>`;
    if (m.includes('facial'))  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2"><circle cx="12" cy="11" r="3"/><path d="M5 19a7 7 0 0 1 14 0"/></svg>`;
    if (m.includes('QR'))      return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`;
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h10"/></svg>`;
  }

  /* ══════════════════════════════════════════════════════════════
     PESTAÑA 2 — MARCAS DEL DISPOSITIVO
  ══════════════════════════════════════════════════════════════ */
  const _TIPO_COLOR_MARCAS = {
    nino:      {bg:'var(--primary-soft)',color:'var(--primary-d)'},
    misionero: {bg:'#E8F7F1',color:'#1D7A56'},
    voluntario:{bg:'#EDE7FD',color:'#6B4EEA'},
    staff:     {bg:'var(--line)',color:'var(--muted)'},
    padre:     {bg:'#FEF3E2',color:'#C47A0A'},
  };

  function _renderTabMarcas() {
    const hoy = new Date().toISOString().slice(0,10);
    const esHoy = _marcasFecha === hoy;

    return `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap;">
      <div style="display:flex;align-items:center;gap:8px;">
        <label style="font-size:13px;font-weight:700;color:var(--muted);">Fecha</label>
        <input type="date" value="${_marcasFecha}" max="${hoy}"
          onchange="AsistenciaModule.setMarcasFecha(this.value)"
          style="padding:7px 12px;border:1.5px solid var(--border);border-radius:9px;font-size:13px;
                 font-family:'Quicksand';background:var(--surface);color:var(--ink);">
      </div>
      ${!esHoy ? `<button class="btn btn-sm btn-outline" onclick="AsistenciaModule.setMarcasFecha('${hoy}')">Hoy</button>` : ''}
      <div style="display:flex;align-items:center;gap:8px;">
        <label style="font-size:13px;font-weight:700;color:var(--muted);">Persona</label>
        <select onchange="AsistenciaModule.setMarcasPersona(this.value)"
          style="padding:7px 12px;border:1.5px solid var(--border);border-radius:9px;font-size:13px;
                 font-family:'Quicksand';background:var(--surface);color:var(--ink);max-width:220px;">
          <option value="todas" ${_marcasPersona==='todas'?'selected':''}>Todas</option>
          <option value="desconocidos" ${_marcasPersona==='desconocidos'?'selected':''}>Solo sin vincular</option>
          ${(DB.personas||[]).filter(p=>p.estado==='activo'||p.activo).map(p=>
            `<option value="${p.id}" ${String(_marcasPersona)===String(p.id)?'selected':''}>${esc(p.nombre)}</option>`
          ).join('')}
        </select>
      </div>
      ${_marcasPersona!=='todas' ? `<button class="btn btn-sm btn-outline" onclick="AsistenciaModule.setMarcasPersona('todas')">✕ Quitar filtro</button>` : ''}
      <button class="btn btn-sm btn-outline" onclick="AsistenciaModule.cargarMarcas()">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M1 4v6h6M23 20v-6h-6"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>
        Actualizar
      </button>
      <span id="marcas-count" style="margin-left:auto;font-size:12px;color:var(--faint);">
        ${_marcasCargando ? 'Cargando…' : _contadorMarcasTxt()}
      </span>
    </div>

    <div class="table-card">
      <div style="display:grid;grid-template-columns:90px 48px 1fr 1fr 120px;
                  padding:10px 18px;border-bottom:1px solid var(--line);gap:12px;
                  font-size:11px;font-weight:800;letter-spacing:.6px;color:var(--faint);text-transform:uppercase;">
        <span>Hora</span><span></span><span>ID dispositivo</span><span>Persona vinculada</span><span></span>
      </div>
      <div id="marcas-list" style="max-height:560px;overflow-y:auto;">
        ${_renderMarcasLista()}
      </div>
    </div>`;
  }

  function _marcasFiltradas() {
    if (_marcasPersona === 'todas') return _marcas;
    if (_marcasPersona === 'desconocidos') return _marcas.filter(m => !m.vinculado);
    return _marcas.filter(m =>
      String(m.persona_id) === String(_marcasPersona) ||
      String(m.zk_user_id) === String(_marcasPersona)
    );
  }

  function _contadorMarcasTxt() {
    const n = _marcasFiltradas().length;
    const extra = _marcasPersona !== 'todas' ? ` (de ${_marcas.length})` : '';
    return `${n} marca${n!==1?'s':''}${extra}`;
  }

  function _renderMarcasLista() {
    if (_marcasCargando) return `<div style="padding:40px;text-align:center;"><div class="spinner" style="margin:0 auto;"></div></div>`;
    const lista = _marcasFiltradas();
    if (!lista.length) return UI.emptyState(_marcas.length
      ? 'Sin marcas para este filtro en la fecha elegida.'
      : 'Sin marcas para esta fecha.');

    return lista.map(m => {
      const hora = m.timestamp ? m.timestamp.slice(11,16) : '—';
      const esDesconocido = !m.vinculado;
      const cfg = _TIPO_COLOR_MARCAS[m.persona_tipo] || null;

      const avatarHtml = esDesconocido
        ? `<div style="width:36px;height:36px;border-radius:50%;background:#FDF2D5;display:flex;align-items:center;
                       justify-content:center;font-size:16px;font-weight:800;color:#9A6B0A;flex:none;">?</div>`
        : UI.avatarFoto(m.foto_url, m.inicial||'?', m.avatar_bg, m.avatar_fg, m.nombre, 36);

      const nombreHtml = esDesconocido
        ? `<span style="color:var(--muted);font-style:italic;">Desconocido</span>`
        : `<span style="font-weight:700;">${esc(m.nombre||'—')}</span>
           ${cfg ? `<span style="background:${cfg.bg};color:${cfg.color};font-size:10px;font-weight:700;
                               padding:2px 7px;border-radius:20px;margin-left:6px;">${esc(m.persona_tipo)}</span>` : ''}`;

      const accionHtml = esDesconocido
        ? `<button class="btn btn-sm btn-primary"
             onclick="AsistenciaModule.abrirEnlazarMarca(${esc(JSON.stringify(m.zk_user_id))})">
             Enlazar persona
           </button>`
        : `<span style="display:inline-flex;align-items:center;gap:5px;font-size:11.5px;
                        color:#1D7A56;font-weight:700;">
             <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m20 6-11 11-5-5"/></svg>
             Vinculado
           </span>`;

      const bg = esDesconocido ? 'background:#FFFBEA;' : '';

      return `
      <div style="display:grid;grid-template-columns:90px 48px 1fr 1fr 120px;
                  align-items:center;padding:10px 18px;gap:12px;
                  border-bottom:1px solid var(--line);${bg}">
        <div style="font-size:15px;font-weight:800;color:var(--ink);">${hora}</div>
        <div>${avatarHtml}</div>
        <div>
          <div style="font-size:13px;font-weight:700;">ID: ${esc(String(m.zk_user_id))}</div>
          <div style="font-size:11px;color:var(--faint);">${esc(m.metodo||'facial')} · ${esc(m.dispositivo||'TIMMY')}</div>
        </div>
        <div style="font-size:13px;">${nombreHtml}</div>
        <div style="display:flex;justify-content:flex-end;">${accionHtml}</div>
      </div>`;
    }).join('');
  }

  async function cargarMarcas() {
    _marcasCargando = true;
    const el = document.getElementById('marcas-list');
    if (el) el.innerHTML = _renderMarcasLista();

    try {
      const r = await fetch(`${BRIDGE}/device/logs?fecha=${_marcasFecha}&limit=500`,
                            {signal: AbortSignal.timeout(10000), headers:_authHeaders()});
      const d = await r.json();
      _marcas = d.registros || [];
    } catch(e) {
      _marcas = [];
      UI.toast('No se pudieron cargar las marcas', 'error');
    } finally {
      _marcasCargando = false;
      const el2 = document.getElementById('marcas-list');
      if (el2) el2.innerHTML = _renderMarcasLista();
      // Actualizar contador en header
      const cnt = document.getElementById('marcas-count');
      if (cnt) cnt.textContent = _contadorMarcasTxt();
    }
  }

  function setMarcasFecha(fecha) {
    _marcasFecha = fecha;
    const el = document.getElementById('tab-content');
    if (el) el.innerHTML = _renderTabMarcas();
    cargarMarcas();
  }

  function setMarcasPersona(valor) {
    _marcasPersona = valor;
    const el = document.getElementById('tab-content');
    if (el) el.innerHTML = _renderTabMarcas();
    const lista = document.getElementById('marcas-list');
    if (lista) lista.innerHTML = _renderMarcasLista();
  }

  /* Enlazar: abre modal con personas para vincular el device-user */
  function abrirEnlazarMarca(zkUserId) {
    UI.modal(`
      <h2 style="margin-bottom:4px;">Enlazar marca del dispositivo</h2>
      <p style="font-size:13px;color:var(--muted);margin-bottom:16px;">
        ID en el Timmy: <b>${esc(String(zkUserId))}</b> · Sin persona vinculada
      </p>
      <div style="background:#FDF2D5;border-radius:10px;padding:12px;font-size:13px;color:#9A6B0A;margin-bottom:16px;">
        Al enlazar, esta persona quedará marcada como <b>Presente</b> con la hora de la marca.
        Las próximas marcas de este ID se vincularán automáticamente.
      </div>
      <div class="form-group">
        <label>Persona del ERP</label>
        <select id="enlazar-persona" style="font-size:14px;">
          <option value="">— selecciona —</option>
          ${DB.personas.filter(p=>p.estado==='activo'||p.activo).map(p=>
            `<option value="${p.id}">${esc(p.nombre)} (${esc(p.tipo||'')})</option>`
          ).join('')}
        </select>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="UI.closeModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="AsistenciaModule._confirmarEnlace('${esc(String(zkUserId))}')">
          Enlazar y marcar presente
        </button>
      </div>`, {narrow: true});
  }

  async function _confirmarEnlace(zkUserId) {
    const sel = document.getElementById('enlazar-persona');
    const personaId = parseInt(sel?.value || 0);
    if (!personaId) { UI.toast('Selecciona una persona', 'error'); return; }
    try {
      const r = await fetch(`${BRIDGE}/asistencia/asignar-zk`, {
        method: 'POST',
        headers: _authHeaders({'Content-Type': 'application/json'}),
        body: JSON.stringify({zk_user_id: zkUserId, persona_id: personaId}),
        signal: AbortSignal.timeout(8000),
      });
      const d = await r.json();
      if (d.ok) {
        UI.closeModal();
        UI.toast('¡Enlazado! La persona quedó marcada como presente.', 'success');
        await cargarMarcas();         // refrescar tabla de marcas
        DB.recargar();                // refrescar asistencia de hoy
      } else {
        UI.toast(d.error || 'Error al enlazar', 'error');
      }
    } catch(e) {
      UI.toast('Error de conexión', 'error');
    }
  }

  /* ══════════════════════════════════════════════════════════════
     PESTAÑA 3 — DISPOSITIVO TIMMY
  ══════════════════════════════════════════════════════════════ */
  let _usuariosTimmy   = [];   // staff registrado en yunatt.com
  let _deviceStaff     = [];   // usuarios registrados físicamente en el Timmy (backupnums)
  let _cargandoTimmy   = false;
  let _enrolandoId     = null; // persona_id en proceso de enrollment
  let _timmyDirectOk   = null; // null=no probado, true=ok, false=fallo

  function _renderTabTimmy() {
    const info   = _bridge;
    const ultimo = info.ultimo_log
      ? new Date(info.ultimo_log).toLocaleString('es-PE',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})
      : '—';

    return `
    <div style="display:grid;grid-template-columns:340px 1fr;gap:16px;align-items:start;">

      <!-- Columna izquierda: info dispositivo + zona peligrosa -->
      <div>
        <div class="kpi-card" style="padding:18px;margin-bottom:14px;">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
            <div style="width:44px;height:44px;border-radius:12px;background:var(--primary-soft);
                        display:flex;align-items:center;justify-content:center;flex:none;">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--primary-d)" stroke-width="1.8">
                <circle cx="12" cy="11" r="3"/><path d="M5 19a7 7 0 0 1 14 0"/>
              </svg>
            </div>
            <div style="flex:1;min-width:0;">
              <div style="font-size:15px;font-weight:800;">${info.modelo || 'Timmy AiFace'}</div>
              <div style="font-size:12px;color:var(--muted);">TM-AI03F</div>
            </div>
            ${info.conectado
              ? `<span style="display:inline-flex;align-items:center;gap:5px;background:#E8F7F1;
                              color:#1D7A56;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;white-space:nowrap;">
                   <span style="width:6px;height:6px;border-radius:50%;background:#1D7A56;animation:lc-pulse 2s infinite;"></span>Online
                 </span>`
              : `<span style="background:#FDE7E1;color:var(--danger);padding:4px 10px;
                              border-radius:20px;font-size:11px;font-weight:700;white-space:nowrap;">Offline</span>`
            }
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12.5px;margin-bottom:12px;">
            <div style="background:var(--bg);border-radius:8px;padding:10px;">
              <div style="color:var(--faint);font-size:11px;margin-bottom:3px;">Nº serie</div>
              <div style="font-weight:700;font-size:12px;">${info.sn || '—'}</div>
            </div>
            <div style="background:var(--bg);border-radius:8px;padding:10px;">
              <div style="color:var(--faint);font-size:11px;margin-bottom:3px;">Marcas hoy</div>
              <div style="font-weight:800;font-size:18px;color:var(--primary);">${info.marcas_hoy || 0}</div>
            </div>
            <div style="background:var(--bg);border-radius:8px;padding:10px;grid-column:span 2;">
              <div style="color:var(--faint);font-size:11px;margin-bottom:3px;">Última marca</div>
              <div style="font-weight:700;font-size:12px;">${ultimo}</div>
            </div>
          </div>
          <button class="btn btn-sm btn-outline" style="width:100%;" onclick="AsistenciaModule._checkBridge()">
            ↺ Actualizar estado
          </button>
        </div>

        <div class="kpi-card" style="padding:14px;">
          <div style="font-size:13px;font-weight:700;margin-bottom:8px;color:var(--danger);">Zona de riesgo</div>
          <button class="btn btn-sm" style="background:#FDE7E1;color:var(--danger);border:none;
            border-radius:8px;padding:6px 12px;font-weight:700;cursor:pointer;font-family:'Quicksand';width:100%;"
            onclick="AsistenciaModule.abrirResetCompleto()">
            Borrar todos los datos del ERP
          </button>
          <div style="font-size:11.5px;color:var(--faint);margin-top:6px;">Con opción de limpiar también el Timmy y yunatt.</div>
        </div>
      </div>

      <!-- Columna derecha: panel único de usuarios del Timmy -->
      <div style="display:flex;flex-direction:column;gap:14px;">

        <div class="kpi-card" style="padding:18px;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
            <div style="flex:1;">
              <div style="font-size:15px;font-weight:800;">Usuarios activos en yunatt / Timmy</div>
              <div style="font-size:12px;color:var(--muted);">
                El registro biométrico y la foto se hacen en el propio Timmy.
                La foto que toma el dispositivo se sincroniza como foto de perfil en el ERP.
              </div>
            </div>
            <button class="btn btn-sm btn-outline" title="Actualizar y traer fotos del Timmy"
              onclick="AsistenciaModule.cargarUsuariosTimmy()">↺</button>
          </div>

          <div style="display:flex;gap:10px;margin:10px 0 12px;flex-wrap:wrap;">
            <span style="display:inline-flex;align-items:center;gap:5px;font-size:11.5px;color:var(--muted);">
              <span style="width:10px;height:10px;border-radius:50%;background:#1D7A56;flex:none;"></span>Registrado en el Timmy
            </span>
            <span style="display:inline-flex;align-items:center;gap:5px;font-size:11.5px;color:var(--muted);">
              <span style="width:10px;height:10px;border-radius:50%;background:var(--primary-d);flex:none;"></span>En nube, falta registro en el Timmy
            </span>
            <span style="display:inline-flex;align-items:center;gap:5px;font-size:11.5px;color:var(--muted);">
              <span style="width:10px;height:10px;border-radius:50%;background:#E8B84B;flex:none;"></span>Sin registrar
            </span>
          </div>

          <div id="timmy-enroll-status"></div>

          <div id="timmy-users-list">
            ${_renderUsuariosTimmy()}
          </div>
        </div>

      </div>
    </div>`;
  }

  function _renderDirectStatus() {
    if (_timmyDirectOk === null) {
      return `<div style="font-size:12.5px;color:var(--muted);">Sin probar. Haz clic en "Probar conexión" para verificar.</div>`;
    }
    if (_timmyDirectOk === true) {
      return `<div style="display:flex;align-items:center;gap:7px;font-size:13px;color:#1D7A56;font-weight:700;">
        <span style="width:8px;height:8px;border-radius:50%;background:#1D7A56;"></span>
        Conexión directa OK — pyzk puede agregar usuarios al Timmy
      </div>`;
    }
    return `<div style="font-size:12.5px;color:#C47A0A;background:#FEF3E2;padding:10px;border-radius:8px;">
      <b>Conexión directa no disponible.</b><br>
      Posibles causas: pyzk no instalado (<code>pip install pyzk</code>), o el TM-AI03F no
      acepta el protocolo ZK clásico (es un dispositivo AI/ADMS).<br>
      <span style="color:var(--muted);">El enrollment via yunatt sigue funcionando normalmente.</span>
    </div>`;
  }

  /* Badges de biométricos reales del dispositivo (backupnums) */
  function _badgesDevice(backupnums) {
    const b = backupnums || [];
    const tiene = {
      cara:    b.includes(50),
      huella:  b.some(n => n >= 0 && n <= 9),
      pin:     b.includes(10),
      tarjeta: b.includes(11),
    };
    return [
      tiene.cara    ? `<span style="font-size:10px;background:#E8F7F1;color:#1D7A56;padding:1px 6px;border-radius:4px;font-weight:700;">cara✓</span>` : '',
      tiene.huella  ? `<span style="font-size:10px;background:#E8F0FF;color:#5A35B5;padding:1px 6px;border-radius:4px;font-weight:700;">huella✓</span>` : '',
      tiene.pin     ? `<span style="font-size:10px;background:#FEF3E2;color:#C47A0A;padding:1px 6px;border-radius:4px;font-weight:700;">PIN✓</span>` : '',
      tiene.tarjeta ? `<span style="font-size:10px;background:#EDE7FD;color:#6B4EEA;padding:1px 6px;border-radius:4px;font-weight:700;">tarjeta✓</span>` : '',
    ].filter(Boolean).join(' ');
  }

  function _avatarTimmy(p, nombre) {
    if (p && p.fotoUrl) {
      const u = esc(p.fotoUrl);
      const n = esc(p.nombre||'').replace(/'/g,"\\'");
      return `<img src="${u}?t=${Date.now()}" alt=""
        onclick="event.stopPropagation();UI.fotoZoom('${u.replace(/'/g,"\\'")}','${n}')"
        style="width:38px;height:38px;border-radius:11px;object-fit:cover;flex:none;cursor:zoom-in;
               border:2px solid #1D7A56;" title="Foto tomada por el Timmy — clic para ampliar">`;
    }
    if (p) return UI.avatar(p.inicial || (p.nombre||'?')[0], p.avatarBg || p.avatar_bg, p.avatarFg || p.avatar_fg, true);
    return UI.avatar((nombre||'?')[0], 'var(--line)', 'var(--muted)', true);
  }

  function _renderUsuariosTimmy() {
    if (_cargandoTimmy) {
      return `<div style="padding:30px;text-align:center;"><div class="spinner" style="margin:0 auto;"></div></div>`;
    }

    const personas   = (DB.personas || []).filter(p => p.estado === 'activo' || p.activo);
    const yunattPorSN = {};
    _usuariosTimmy.forEach(s => { yunattPorSN[String(s.staffNumber)] = s; });
    const devicePorId = {};
    _deviceStaff.forEach(d => { devicePorId[String(d.enrollid)] = d; });

    if (!personas.length && !_usuariosTimmy.length) {
      return `<div style="padding:20px;text-align:center;color:var(--faint);font-size:13px;">
        Sin personas activas en el ERP ni usuarios en yunatt.
      </div>`;
    }

    const filaHtml = (p, yRow, dRow) => {
      const sid      = p ? String(p.id) : String(yRow.staffNumber || yRow.enrollid || '?');
      const nombre   = p ? p.nombre : (yRow.name || '');
      const enCloud  = !!yRow;
      const enDevice = !!dRow;
      const cargando = p && _enrolandoId === p.id;

      const estado = enDevice
        ? `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;
                        color:#1D7A56;background:#E8F7F1;padding:2px 8px;border-radius:20px;white-space:nowrap;">
             <span style="width:6px;height:6px;border-radius:50%;background:#1D7A56;"></span>En el Timmy
           </span>`
        : enCloud
        ? `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;
                        color:var(--primary-d);background:var(--primary-soft);padding:2px 8px;border-radius:20px;white-space:nowrap;">
             <span style="width:6px;height:6px;border-radius:50%;background:var(--primary-d);"></span>En nube
           </span>`
        : `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;
                        color:#C47A0A;background:#FEF3E2;padding:2px 8px;border-radius:20px;white-space:nowrap;">
             <span style="width:6px;height:6px;border-radius:50%;background:#E8B84B;"></span>Sin registrar
           </span>`;

      const badges = enDevice ? _badgesDevice(dRow.backupnums) : '';

      const nombreJs = esc(nombre).replace(/'/g, "\\'");
      const botones = enCloud
        ? `<button class="btn btn-sm" title="El Timmy activa el registro de cara"
             style="background:#E8F7F1;color:#1D7A56;border:none;border-radius:7px;padding:5px 9px;font-size:12px;cursor:pointer;font-weight:700;"
             onclick="AsistenciaModule.registrarBiometricoTimmy('${esc(sid)}','${nombreJs}','cara')">😊 Cara</button>
           <button class="btn btn-sm" title="El Timmy activa el registro de huella"
             style="background:#E8F0FF;color:#5A35B5;border:none;border-radius:7px;padding:5px 9px;font-size:12px;cursor:pointer;font-weight:700;"
             onclick="AsistenciaModule.registrarBiometricoTimmy('${esc(sid)}','${nombreJs}','huella')">👆 Huella</button>`
        : `<button class="btn btn-sm btn-primary" style="font-size:12px;padding:5px 12px;white-space:nowrap;"
             ${cargando ? 'disabled' : ''}
             onclick="AsistenciaModule.enrolarPersona(${p.id}, '${nombreJs}')">
             ${cargando ? 'Enviando…' : 'Enrolar'}
           </button>`;

      const soloYunatt = !p
        ? `<span style="font-size:10px;color:var(--faint);font-style:italic;">solo en yunatt — sin persona en el ERP</span>`
        : '';

      return `
      <div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--line);${!p?'opacity:.65;':''}">
        ${_avatarTimmy(p, nombre)}
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(nombre)}</div>
          <div style="font-size:11px;color:var(--faint);display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
            ID ${esc(sid)}${p ? ' · ' + esc(p.tipo||'') : ''} ${badges} ${soloYunatt}
          </div>
        </div>
        ${estado}
        <div style="display:flex;gap:5px;">${botones}</div>
      </div>`;
    };

    // 1) Personas activas del ERP (fuente principal)
    const filasPersonas = personas.map(p =>
      filaHtml(p, yunattPorSN[String(p.id)], devicePorId[String(p.id)])
    ).join('');

    // 2) Staff en yunatt sin persona en el ERP (informativo)
    const idsERP = new Set(personas.map(p => String(p.id)));
    const filasExtra = _usuariosTimmy
      .filter(s => !idsERP.has(String(s.staffNumber)))
      .map(s => filaHtml(null, s, devicePorId[String(s.staffNumber)]))
      .join('');

    return filasPersonas + filasExtra;
  }

  /* Enrola una persona nueva: la crea en yunatt y el Timmy activa su pantalla
     de registro — la foto la toma el propio dispositivo. */
  async function enrolarPersona(personaId, nombre) {
    _enrolandoId = personaId;
    const el = document.getElementById('timmy-users-list');
    if (el) el.innerHTML = _renderUsuariosTimmy();
    try {
      const r = await fetch(`${BRIDGE}/yunatt/enrolar`, {
        method: 'POST',
        headers: _authHeaders({'Content-Type': 'application/json'}),
        body: JSON.stringify({ persona_id: personaId, metodo: 'cara' }),
        signal: AbortSignal.timeout(30000),
      });
      const d = await r.json();
      if (d.ok) {
        UI.toast(d.remote_ok
          ? `📡 ${esc(nombre)} — el Timmy muestra la pantalla de registro; debe acercarse ahora`
          : `${esc(nombre)} guardado en yunatt. ${esc(d.aviso||'')}`,
          d.remote_ok ? 'success' : 'warn');
        if (d.remote_ok) _esperarRegistro(String(personaId), nombre, 'cara');  // monitorear resultado real
      } else {
        UI.toast(d.error || 'Error al enrolar', 'error');
        _setEnrollStatus(_bannerEnroll('fallo',
          `No se pudo enrolar a <b>${esc(nombre)}</b>: ${esc(d.error||'error desconocido')}`, true));
      }
    } catch(e) {
      UI.toast('Error de conexión con el servidor', 'error');
    } finally {
      _enrolandoId = null;
      await cargarUsuariosTimmy();
    }
  }

  /* ── Monitoreo en vivo del enrolamiento ──────────────────────────
     Tras enviar el comando al Timmy, consulta cada 5 s el estado REAL
     del dispositivo hasta detectar que la persona registró su biométrico,
     o hasta agotar el tiempo (cancelación / timeout en el Timmy). */
  let _enrollPollToken = 0;

  function _setEnrollStatus(html) {
    const el = document.getElementById('timmy-enroll-status');
    if (el) el.innerHTML = html || '';
  }

  function _bannerEnroll(tipo, texto, conCerrar) {
    const cfg = {
      espera:  {bg:'#FFF8E7', borde:'#e8c96a', color:'#9A6B0A', icono:`<div class="spinner" style="width:16px;height:16px;border-width:2px;flex:none;"></div>`},
      ok:      {bg:'#E8F7F1', borde:'#b2dfcc', color:'#1D7A56', icono:'<span style="font-size:16px;">✓</span>'},
      fallo:   {bg:'#FDE7E1', borde:'#f0b5a8', color:'var(--danger)', icono:'<span style="font-size:15px;">⚠</span>'},
    }[tipo];
    return `
    <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;margin-bottom:12px;
                background:${cfg.bg};border:1px solid ${cfg.borde};border-radius:10px;">
      ${cfg.icono}
      <div style="flex:1;font-size:13px;font-weight:600;color:${cfg.color};">${texto}</div>
      ${conCerrar ? `<button class="btn-ghost" style="font-size:12px;color:var(--muted);"
        onclick="document.getElementById('timmy-enroll-status').innerHTML=''">✕</button>` : ''}
    </div>`;
  }

  async function _estadoEnroll(sid) {
    try {
      const r = await fetch(`${BRIDGE}/yunatt/enroll-status/${encodeURIComponent(sid)}`,
                            {signal: AbortSignal.timeout(15000), headers:_authHeaders()});
      const d = await r.json();
      return d && d.ok ? d : null;
    } catch(_) { return null; }
  }

  async function _esperarRegistro(sid, nombre, tipo) {
    const token = ++_enrollPollToken;
    const label = tipo === 'huella' ? 'huella' : 'cara';

    // Estado base (para detectar el CAMBIO, incluso en re-registros)
    const base = await _estadoEnroll(sid);
    const baseKey = base ? JSON.stringify([base.backupnums, base.foto]) : null;

    _setEnrollStatus(_bannerEnroll('espera',
      `El Timmy está esperando a <b>${esc(nombre)}</b> para registrar su ${label}… ` +
      `<span style="font-weight:400;opacity:.8;">(este aviso se actualiza solo)</span>`));

    const inicio = Date.now();
    while (Date.now() - inicio < 120000) {
      await new Promise(res => setTimeout(res, 5000));
      if (token !== _enrollPollToken) return;                       // otro registro tomó el control
      if (!document.getElementById('timmy-enroll-status')) return;  // se salió de la pestaña

      const st = await _estadoEnroll(sid);
      if (!st) continue;

      const tieneBio = tipo === 'huella' ? st.tiene_huella : st.tiene_cara;
      const cambio   = baseKey === null
        ? (st.en_dispositivo && tieneBio)
        : (JSON.stringify([st.backupnums, st.foto]) !== baseKey && tieneBio);

      if (st.en_dispositivo && cambio) {
        _setEnrollStatus(_bannerEnroll('ok',
          `<b>${esc(nombre)}</b> registró su ${label} en el Timmy correctamente.`, true));
        _playTono('registrado');
        UI.toast(`✓ ${esc(nombre)} — ${label} registrada en el Timmy`, 'success');
        await cargarUsuariosTimmy();   // refresca lista + trae la foto del Timmy
        setTimeout(() => { if (token === _enrollPollToken) _setEnrollStatus(''); }, 10000);
        return;
      }
    }

    if (token !== _enrollPollToken) return;
    _setEnrollStatus(_bannerEnroll('fallo',
      `<b>${esc(nombre)}</b> no completó el registro de ${label} — se canceló en el ` +
      `Timmy o se agotó el tiempo. Puedes reenviar el comando cuando quieras.`, true));
    UI.toast(`Registro de ${esc(nombre)} no completado`, 'warn');
  }

  /* Descarga al ERP las fotos que el Timmy capturó (foto de perfil) */
  async function _syncFotosTimmy() {
    try {
      const r = await fetch(`${BRIDGE}/yunatt/sync-fotos`, {
        method: 'POST', signal: AbortSignal.timeout(30000), headers:_authHeaders(),
      });
      const d = await r.json();
      if (d.ok && d.actualizadas && d.actualizadas.length) {
        await DB.recargar();
        UI.toast(`📷 ${d.actualizadas.length} foto${d.actualizadas.length>1?'s':''} del Timmy sincronizada${d.actualizadas.length>1?'s':''} al ERP`, 'success');
        return true;
      }
    } catch(_) {}
    return false;
  }


  async function pingTimmyDirect() {
    const el = document.getElementById('timmy-direct-status');
    if (el) el.innerHTML = `<div style="font-size:12.5px;color:var(--muted);">Probando conexión con 192.168.18.145…</div>`;
    try {
      const r = await fetch(`${BRIDGE}/timmy/ping`, {signal: AbortSignal.timeout(15000), headers:_authHeaders()});
      const d = await r.json();
      _timmyDirectOk = d.ok === true;
      if (el) el.innerHTML = _renderDirectStatus();
      if (d.ok) {
        UI.toast(`Timmy directo OK — ${d.metodo || 'pyzk'}`, 'success');
      } else {
        UI.toast(d.error || d.aviso || 'No se pudo conectar', 'warn');
      }
    } catch(e) {
      _timmyDirectOk = false;
      if (el) el.innerHTML = _renderDirectStatus();
      UI.toast('Error al probar conexión directa: ' + e.message, 'error');
    }
  }

  async function registrarTodosDirecto() {
    if (!confirm('¿Registrar TODAS las personas activas del ERP directamente en el Timmy?\n\nRequiere que la PC esté en la misma red WiFi que el Timmy.')) return;
    UI.toast('Registrando todos en el Timmy… puede tardar un momento.', 'info');
    try {
      const r = await fetch(`${BRIDGE}/timmy/agregar-todos`, {
        method: 'POST',
        headers: _authHeaders({'Content-Type': 'application/json'}),
        signal: AbortSignal.timeout(120000),
      });
      const d = await r.json();
      if (d.creados !== undefined) {
        _timmyDirectOk = d.creados > 0 || d.errores < d.creados;
        const el = document.getElementById('timmy-direct-status');
        if (el) el.innerHTML = _renderDirectStatus();
        if (d.errores === 0) {
          UI.toast(`✓ ${d.creados} personas registradas en el Timmy`, 'success');
        } else if (d.creados > 0) {
          UI.toast(`${d.creados} registradas, ${d.errores} errores. Ver consola.`, 'warn');
        } else {
          UI.toast(`Error: ${d.detalle_errores?.[0]?.error || 'No se pudo conectar al Timmy'}`, 'error');
        }
      } else {
        UI.toast(d.error || 'Error desconocido', 'error');
      }
    } catch(e) {
      UI.toast('Error al registrar: ' + e.message, 'error');
    }
  }

  async function cargarUsuariosTimmy() {
    _cargandoTimmy = true;
    const el = document.getElementById('timmy-users-list');
    if (el) el.innerHTML = _renderUsuariosTimmy();
    try {
      const r = await fetch(`${BRIDGE}/yunatt/staff`, {signal: AbortSignal.timeout(15000), headers:_authHeaders()});
      const d = await r.json();
      _usuariosTimmy = d.staff  || [];
      _deviceStaff   = d.device || [];
    } catch(e) {
      _usuariosTimmy = [];
      _deviceStaff   = [];
    } finally {
      _cargandoTimmy = false;
      const el2 = document.getElementById('timmy-users-list');
      if (el2) el2.innerHTML = _renderUsuariosTimmy();
    }
    // Traer al ERP las fotos que el Timmy haya capturado (en segundo plano)
    const huboFotos = await _syncFotosTimmy();
    if (huboFotos) {
      const el3 = document.getElementById('timmy-users-list');
      if (el3) el3.innerHTML = _renderUsuariosTimmy();
    }
  }

  async function registrarBiometricoTimmy(staffNumber, nombre, tipo) {
    const backup = tipo === 'huella' ? '0' : '50'; // 50=AI face, 0=fingerprint
    const label  = tipo === 'cara' ? 'cara facial' : 'huella digital';
    UI.toast(`Enviando comando de ${label} al Timmy…`, 'info');
    try {
      const r = await fetch(`${BRIDGE}/yunatt/remoteadduser-sn`, {
        method: 'POST',
        headers: _authHeaders({'Content-Type': 'application/json'}),
        body: JSON.stringify({ staff_number: staffNumber, nombre, backup }),
        signal: AbortSignal.timeout(12000),
      });
      const d = await r.json();
      if (d.ok) {
        UI.toast(`✓ Comando enviado — ${esc(nombre)} debe acercarse al Timmy ahora`, 'success');
        _esperarRegistro(staffNumber, nombre, tipo);   // monitorear resultado real
      } else {
        UI.toast(d.error || 'Error al enviar comando', 'error');
        _setEnrollStatus(_bannerEnroll('fallo',
          `No se pudo enviar el comando de ${tipo} para <b>${esc(nombre)}</b>: ${esc(d.error||'error desconocido')}`, true));
      }
    } catch(e) {
      UI.toast('Error de conexión: ' + e.message, 'error');
    }
  }

  function abrirFormUsuarioTimmy() {
    const ninos = DB.personas.filter(p=>p.tipo==='nino'||p.tipo==='misionero'||p.tipo==='voluntario'||p.tipo==='staff');
    UI.modal(`
      <h2>Añadir usuario al Timmy</h2>
      <div style="background:var(--primary-soft);border-radius:10px;padding:12px;font-size:13px;color:var(--primary-d);margin-bottom:16px;">
        Se registrará el usuario en el Timmy. La persona deberá luego acercarse al dispositivo
        y registrar su cara en la pantalla táctil.
      </div>
      <div class="form-group">
        <label>Pre-llenar desde personas del ERP</label>
        <select id="tu-erp" onchange="AsistenciaModule.prefillTimmyDesdeERP(this.value)">
          <option value="">— o llena manualmente —</option>
          ${ninos.map(p=>`<option value="${p.id}">${esc(p.nombre)} (${esc(p.tipo)})</option>`).join('')}
        </select>
      </div>
      <div class="form-grid">
        <div class="form-group">
          <label>ID de usuario en dispositivo *</label>
          <input type="text" id="tu-userid" placeholder="Ej: 001" maxlength="20">
          <div style="font-size:11.5px;color:var(--faint);margin-top:3px;">Número único en el Timmy</div>
        </div>
        <div class="form-group">
          <label>Nombre completo *</label>
          <input type="text" id="tu-nombre" placeholder="Nombre a mostrar (máx 24 chars)" maxlength="24">
        </div>
      </div>
      <div class="form-group">
        <label>Privilegio</label>
        <select id="tu-priv">
          <option value="0">Usuario normal</option>
          <option value="14">Administrador</option>
        </select>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="UI.closeModal()">Cancelar</button>
        <button class="btn btn-primary" id="btn-tu-guardar" onclick="AsistenciaModule.guardarUsuarioTimmy()">
          Añadir al Timmy
        </button>
      </div>`, {narrow:false});
  }

  function prefillTimmyDesdeERP(idStr) {
    if (!idStr) return;
    const p = DB.personas.find(x=>x.id===parseInt(idStr));
    if (!p) return;
    const uid = document.getElementById('tu-userid');
    const nom = document.getElementById('tu-nombre');
    if (uid && !uid.value) uid.value = String(p.id);
    if (nom) nom.value = p.nombre.slice(0,24);
  }

  async function guardarUsuarioTimmy() {
    const userid = document.getElementById('tu-userid')?.value?.trim();
    const nombre = document.getElementById('tu-nombre')?.value?.trim();
    const priv   = parseInt(document.getElementById('tu-priv')?.value||'0');
    if (!userid || !nombre) { UI.toast('ID y nombre son requeridos','error'); return; }

    const btn = document.getElementById('btn-tu-guardar');
    if (btn) { btn.disabled=true; btn.textContent='Enviando…'; }

    try {
      const r = await fetch(`${BRIDGE}/timmy/users`,{
        method:'POST',
        headers:_authHeaders({'Content-Type':'application/json'}),
        body: JSON.stringify({user_id:userid, name:nombre, privilege:priv, uid:parseInt(userid)||1}),
        signal: AbortSignal.timeout(8000),
      });
      const d = await r.json();
      if (d.ok) {
        UI.closeModal();
        UI.toast(`"${nombre}" añadido — regístralo en la pantalla del Timmy`, 'success');
        await cargarUsuariosTimmy();
      } else {
        UI.toast(d.error||'Error al añadir usuario','error');
        if (btn) { btn.disabled=false; btn.textContent='Añadir al Timmy'; }
      }
    } catch(e) {
      UI.toast('Error de conexión','error');
      if (btn) { btn.disabled=false; btn.textContent='Añadir al Timmy'; }
    }
  }

  function confirmarEliminarTimmy(userId) {
    UI.confirm(`¿Eliminar al usuario <b>${esc(String(userId))}</b> del Timmy?<br>
      <span style="font-size:13px;color:var(--muted);">Sus marcas históricas en el ERP no se borran.</span>`,
      async () => {
        try {
          const uid = parseInt(userId) || userId;
          const r = await fetch(`${BRIDGE}/timmy/usuarios/${encodeURIComponent(uid)}`,
            {method:'DELETE',signal:AbortSignal.timeout(6000), headers:_authHeaders()});
          const d = await r.json();
          if (d.ok) {
            UI.toast('Usuario eliminado del Timmy','success');
            await cargarUsuariosTimmy();
          } else {
            UI.toast(d.error||'Error al eliminar','error');
          }
        } catch(e) {
          UI.toast('Error de conexión','error');
        }
      }
    );
  }

  /* ══════════════════════════════════════════════════════════════
     STATUS BAR
  ══════════════════════════════════════════════════════════════ */
  function _renderStatusBar() {
    if (!_bridge.checkeado) {
      return `<div style="padding:9px 14px;background:var(--bg);border:1px solid var(--border);border-radius:10px;margin-bottom:14px;font-size:13px;color:var(--faint);">Verificando conexión con Timmy AiFace…</div>`;
    }
    if (_bridge.conectado) {
      const via  = _bridge.via === 'yunatt' ? ' · cloud yunatt.com' : ' · WebSocket directo';
      const t    = _bridge.ultimo_log
        ? new Date(_bridge.ultimo_log).toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit'})
        : 'sin marcas';
      return `
      <div style="padding:9px 16px;background:#E8F7F1;border:1px solid #b2dfcc;border-radius:10px;margin-bottom:14px;display:flex;align-items:center;gap:12px;">
        <span style="width:8px;height:8px;border-radius:50%;background:var(--success);flex:none;animation:lc-pulse 2s infinite;"></span>
        <div style="flex:1;font-size:13px;">
          <b style="color:#1D7A56;">Timmy AiFace en línea</b>
          <span style="color:var(--muted);">· ${_bridge.sn||'ZXQH20002783'}${via} · Últ. sync: ${t}</span>
        </div>
        <button class="btn-ghost" style="font-size:12px;color:var(--muted);" onclick="AsistenciaModule.sincronizar()">↺ Sync</button>
      </div>`;
    }
    return `
    <div style="padding:9px 16px;background:#FDF2D5;border:1px solid #e8c96a;border-radius:10px;margin-bottom:14px;display:flex;align-items:center;gap:12px;">
      <span style="font-size:16px;">⚠</span>
      <div style="flex:1;font-size:13px;"><b style="color:#9A6B0A;">Timmy AiFace sin conexión</b> <span style="color:var(--muted);">— ${_bridge.error||'Verifica que server.py esté corriendo'}</span></div>
      <button class="btn btn-sm btn-outline" onclick="AsistenciaModule._checkBridge()">Reintentar</button>
    </div>`;
  }

  /* ══════════════════════════════════════════════════════════════
     ACCIONES — BRIDGE
  ══════════════════════════════════════════════════════════════ */
  async function _checkBridge() {
    // 1. Intentar conexión directa WebSocket (timmy_server.py)
    let timmyOk = false;
    try {
      const r = await fetch(`${BRIDGE}/timmy/status`, {signal:AbortSignal.timeout(3000), headers:_authHeaders()});
      const d = await r.json();
      if (d.conectado) {
        _bridge = {...d, checkeado:true, via:'websocket'};
        timmyOk = true;
      }
    } catch (_) {}

    // 2. Si no hay WebSocket, usar estado del sync yunatt.com
    if (!timmyOk) {
      try {
        const r = await fetch(`${BRIDGE}/yunatt/status`, {signal:AbortSignal.timeout(3000), headers:_authHeaders()});
        const d = await r.json();
        _bridge = {
          checkeado:   true,
          via:         'yunatt',
          conectado:   d.ok === true || d.sesion_activa === true,
          ultimo_log:  d.ultimo_sync || null,
          marcas_hoy:  DB.asistencia.filter(a => a.presente).length,
          error:       d.error || null,
          sn:          'ZXQH20002783',
          modelo:      'TM-AI03F',
        };
      } catch (_) {
        _bridge = {conectado:false, via:null, error:'Sin conexión al dispositivo', checkeado:true};
      }
    }

    _refreshStatusBar();
    if (_tab === 'timmy') _refreshTabContent();
  }

  async function sincronizar() {
    const btn = document.getElementById('btn-sync');
    if (btn) {btn.disabled=true; btn.textContent='Actualizando…';}
    try {
      // 1. Disparar sync con yunatt.com para traer marcas nuevas
      await fetch(`${BRIDGE}/yunatt/sync`, {
        method:'POST',
        headers: _authHeaders(),
        signal: AbortSignal.timeout(20000),
      }).catch(()=>{});  // No bloquear si falla

      // 2. Leer marcas del día desde MySQL
      const r = await fetch(`${BRIDGE}/attendance`, {signal:AbortSignal.timeout(5000), headers:_authHeaders()});
      const registros = await r.json();
      if (Array.isArray(registros)) {
        _aplicarRegistros(registros);
        UI.toast(registros.length
          ? `${registros.length} marca${registros.length>1?'s':''} hoy`
          : 'Sin marcas hoy todavía');
      }
    } catch(e) {
      UI.toast('No se pudo actualizar asistencia','error');
    } finally {
      if (btn) {btn.disabled=false; btn.textContent='Actualizar';}
      await _checkBridge();
    }
  }

  async function _aplicarRegistros(registros) {
    if (!registros) {
      try {
        const r = await fetch(`${BRIDGE}/attendance`,{signal:AbortSignal.timeout(3000), headers:_authHeaders()});
        registros = await r.json();
      } catch(_) {return;}
    }
    let cambios = 0;
    const nombres = [];
    registros.forEach(reg=>{
      const entrada = DB.asistencia.find(a=>
        String(a.zkUserId)===String(reg.user_id) ||
        (a.nombre&&a.nombre.toLowerCase().includes(reg.user_id))
      );
      if (entrada && !entrada.presente) {
        const metodoLabel = {facial:'Reconocimiento facial',tarjeta:'Tarjeta',teclado:'Teclado'}[reg.metodo]||reg.metodo||'Facial';
        DB.toggleAsistencia(entrada.id, metodoLabel);
        nombres.push(entrada.nombre);
        cambios++;
      }
    });
    if (cambios > 0) {
      DB.emit('asistencia:update');
      _playTono('registrado');
      _mostrarBannerRegistrado(nombres);
    }
  }

  function _mostrarBannerRegistrado(nombres) {
    const el = document.getElementById('banner-registrado');
    if (!el) return;
    el.innerHTML = nombres.map(n => `
      <div style="display:flex;align-items:center;gap:10px;padding:11px 18px;background:linear-gradient(135deg,#1C6678,#2BA876);
                  border-radius:12px;color:#fff;font-size:14px;font-weight:700;margin-bottom:6px;
                  animation:lc-slide-in .3s ease;">
        <span style="font-size:20px;">✓</span>
        <span>¡REGISTRADO! &nbsp;${n}</span>
        <span style="margin-left:auto;font-size:12px;opacity:.7;">${new Date().toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit'})}</span>
      </div>`).join('');
    el.style.display = 'block';
    clearTimeout(_bannerTimer);
    _bannerTimer = setTimeout(() => { el.style.display = 'none'; el.innerHTML = ''; }, 6000);
  }

  let _bannerTimer = null;

  /* Genera un tono corto con Web Audio API — sin archivos externos */
  function _playTono(tipo) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (tipo === 'registrado') {
        [[523, 0, 0.12], [784, 0.13, 0.38]].forEach(([freq, t0, t1]) => {
          const osc  = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain); gain.connect(ctx.destination);
          osc.frequency.value = freq;
          osc.type = 'sine';
          gain.gain.setValueAtTime(0.35, ctx.currentTime + t0);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t1);
          osc.start(ctx.currentTime + t0);
          osc.stop(ctx.currentTime + t1);
        });
      } else {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = 660;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.3);
      }
    } catch (_) {}
  }

  /* ══════════════════════════════════════════════════════════════
     ASIGNAR PERSONA A MARCA DESCONOCIDA (Timmy sin match en ERP)
  ══════════════════════════════════════════════════════════════ */
  function abrirAsignarPersona(timmyUserId, nombreTimmy) {
    UI.modal(`
      <h2>Asignar persona a ${esc(nombreTimmy || 'Timmy-'+timmyUserId)}</h2>
      <div style="background:#FDF2D5;border-radius:10px;padding:12px;font-size:13px;color:#9A6B0A;margin-bottom:16px;">
        Este usuario marcó en el Timmy (ID: ${esc(timmyUserId)}) pero no tiene una persona vinculada en el ERP.
        Selecciona a quién corresponde.
      </div>
      <div class="form-group">
        <label>Persona del ERP</label>
        <select id="asig-persona" style="font-size:14px;">
          <option value="">— selecciona —</option>
          ${DB.personas.map(p=>`<option value="${p.id}">${esc(p.nombre)} (${esc(p.tipo)})</option>`).join('')}
        </select>
      </div>
      <div style="font-size:12.5px;color:var(--muted);">
        Al asignar, la persona quedará marcada como <b>Presente</b> con la hora de la marca facial.
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="UI.closeModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="AsistenciaModule.confirmarAsignarPersona('${timmyUserId}')">
          Asignar y marcar presente
        </button>
      </div>`, {narrow: true});
  }

  async function confirmarAsignarPersona(timmyUserId) {
    const sel = document.getElementById('asig-persona');
    const personaId = parseInt(sel?.value || 0);
    if (!personaId) { UI.toast('Selecciona una persona', 'error'); return; }
    try {
      const r = await fetch(`${BRIDGE}/asistencia/asignar-zk`, {
        method: 'POST',
        headers: _authHeaders({'Content-Type':'application/json'}),
        body: JSON.stringify({zk_user_id: timmyUserId, persona_id: personaId}),
        signal: AbortSignal.timeout(8000),
      });
      const d = await r.json();
      if (d.ok) {
        UI.closeModal();
        await DB.recargar();
        UI.toast('Persona asignada y marcada como presente', 'success');
      } else {
        UI.toast(d.error || 'Error al asignar', 'error');
      }
    } catch (e) {
      UI.toast('Error de conexión', 'error');
    }
  }

  /* ── Reset completo: BD + opcionalmente Timmy/yunatt ── */
  function abrirResetCompleto() {
    UI.modal(`
      <h2 style="color:var(--danger);">⚠ Reset completo</h2>
      <div style="background:#FDE7E1;border-radius:10px;padding:14px;margin-bottom:14px;font-size:13.5px;color:var(--danger);">
        <b>Esta acción es irreversible.</b><br>
        Se borrarán permanentemente:
        <ul style="margin:8px 0 0 16px;line-height:1.8;">
          <li>Todas las personas del ERP (los logins del sistema se conservan)</li>
          <li>Historial de asistencia, gastos, entregas, almacén</li>
          <li>Logs de asistencia del Timmy en la base de datos</li>
          <li>Fotos de perfil sincronizadas</li>
        </ul>
      </div>
      <label style="display:flex;align-items:flex-start;gap:10px;padding:12px;border-radius:10px;
                    border:2px solid var(--danger);cursor:pointer;margin-bottom:14px;background:#FFF5F3;">
        <input type="checkbox" id="reset-timmy" checked style="margin-top:3px;width:16px;height:16px;">
        <div>
          <div style="font-size:13px;font-weight:700;color:var(--danger);">Borrar también del Timmy y de yunatt</div>
          <div style="font-size:11.5px;color:var(--muted);margin-top:2px;">
            Elimina los usuarios (caras, huellas) del dispositivo con comando remoto y el staff
            de yunatt.com. La cuenta admin de yunatt se conserva. Si lo desmarcas, el Timmy
            queda intacto.
          </div>
        </div>
      </label>
      <div class="form-group">
        <label>Escribe <b>CONFIRMAR</b> para continuar</label>
        <input type="text" id="reset-confirm" placeholder="CONFIRMAR" style="font-size:15px;">
      </div>
      <div class="form-group">
        <label>Tu contraseña (reautenticación obligatoria)</label>
        <input type="password" id="reset-password" placeholder="Contraseña de tu cuenta" style="font-size:15px;" autocomplete="current-password">
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="UI.closeModal()">Cancelar</button>
        <button class="btn" id="btn-reset-ejecutar" style="background:var(--danger);color:#fff;" onclick="AsistenciaModule.ejecutarResetCompleto()">
          Borrar todo y empezar desde cero
        </button>
      </div>`, {narrow: true});
  }

  async function ejecutarResetCompleto() {
    const val = document.getElementById('reset-confirm')?.value?.trim();
    if (val !== 'CONFIRMAR') {
      UI.toast('Escribe CONFIRMAR para continuar', 'error');
      return;
    }
    const password = document.getElementById('reset-password')?.value || '';
    if (!password) {
      UI.toast('Ingresa tu contraseña para confirmar', 'error');
      return;
    }
    const limpiarTimmy = document.getElementById('reset-timmy')?.checked === true;
    const btn = document.getElementById('btn-reset-ejecutar');
    if (btn) { btn.disabled = true; btn.textContent = limpiarTimmy ? 'Limpiando ERP + Timmy…' : 'Limpiando ERP…'; }
    UI.toast(limpiarTimmy ? 'Limpiando ERP, Timmy y yunatt…' : 'Limpiando base de datos…', 'info');
    try {
      const r = await fetch(`${BRIDGE}/db/reset`, {
        method: 'POST', signal: AbortSignal.timeout(120000),
        headers: _authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ confirmar: 'BORRAR_TODO', limpiar_timmy: limpiarTimmy, password }),
      });
      const d = await r.json();
      if (d.ok) {
        UI.closeModal();
        const t = d.timmy;
        if (limpiarTimmy && t) {
          if (t.ok) {
            UI.toast(`✓ ERP limpio + ${t.cloud ?? 0} usuario${(t.cloud||0)!==1?'s':''} borrado${(t.cloud||0)!==1?'s':''} del Timmy/yunatt. El dispositivo puede tardar unos segundos en reflejarlo.`, 'success');
          } else {
            UI.toast(`ERP limpio, pero hubo un problema con el Timmy/yunatt: ${(t.errores||[t.error]).join('; ') || 'error desconocido'}`, 'warn');
          }
        } else {
          UI.toast('Base de datos limpiada. ERP listo para comenzar.', 'success');
        }
        await DB.recargar();
        App.refresh();
      } else {
        UI.toast('Error al limpiar: ' + d.error, 'error');
        if (btn) { btn.disabled = false; btn.textContent = 'Borrar todo y empezar desde cero'; }
      }
    } catch (e) {
      UI.toast('Error al limpiar: ' + e.message, 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Borrar todo y empezar desde cero'; }
    }
  }

  /* ══════════════════════════════════════════════════════════════
     PARTIAL REFRESH (evita re-render completo)
  ══════════════════════════════════════════════════════════════ */
  function _refreshHoy() {
    const byTipo    = _calcByTipo();
    const presentes = DB.asistencia.filter(a=>a.presente).length;
    const total     = DB.asistencia.length;
    const pct       = total ? Math.round(presentes/total*100) : 0;
    const GRUPOS = [
      {label:'Niños',           tipos:['nino'],                           color:'var(--primary)'},
      {label:'Misioneros',      tipos:['misionero'],                      color:'#1D7A56'},
      {label:'Voluntarios',     tipos:['voluntario'],                     color:'#6B4EEA'},
      {label:'Staff',           tipos:['staff'],                          color:'var(--muted)'},
      {label:'Adultos (todos)', tipos:['misionero','voluntario','staff'],  color:'var(--accent)'},
      {label:'TOTAL',           tipos:['nino','misionero','voluntario','staff'], color:'var(--ink)'},
    ];
    const elC = document.getElementById('asist-contador');
    if (elC) elC.innerHTML = _renderContador(presentes,total,pct);
    const elR = document.getElementById('asist-raciones');
    if (elR) elR.innerHTML = _renderRaciones(GRUPOS, byTipo);
    const elL = document.getElementById('asist-lista');
    if (elL) elL.innerHTML = _renderLista();
  }
  function _refreshStatusBar() {
    const el=document.getElementById('bridge-status-bar');
    if(el) el.innerHTML=_renderStatusBar();
  }
  function _refreshTabContent() {
    const el=document.getElementById('tab-content');
    if (!el) return;
    if (_tab==='hoy')         el.innerHTML = _renderTabHoy();
    else if (_tab==='marcas') el.innerHTML = _renderTabMarcas();
    else                      el.innerHTML = _renderTabTimmy();
  }

  /* ── Cambio de pestaña ── */
  function setTab(t) {
    _tab = t;

    if (t !== 'marcas' && _marcasTimer) {
      clearInterval(_marcasTimer);
      _marcasTimer = null;
    }

    _refreshTabContent();

    if (t === 'timmy') {
      cargarUsuariosTimmy();
    }
    if (t === 'marcas') {
      cargarMarcas();
      if (!_marcasTimer) {
        _marcasTimer = setInterval(() => { if (_tab==='marcas') cargarMarcas(); }, 60000);
      }
    }

    document.querySelectorAll('[onclick*="setTab"]').forEach(b=>{
      const isActive=b.getAttribute('onclick').includes(`'${t}'`);
      b.style.borderBottom=`3px solid ${isActive?'var(--primary)':'transparent'}`;
      b.style.color=isActive?'var(--primary)':'var(--muted)';
    });
  }

  function toggle(id) { DB.toggleAsistencia(id,'Manual'); }
  function setFiltroTipo(t) {
    _filtroTipo = t;
    const elTab = document.getElementById('tab-content');
    if (elTab) elTab.innerHTML = _renderTabHoy();
  }

  /* ── API pública ── */
  window.AsistenciaModule = {
    toggle, sincronizar, setTab, setFiltroTipo,
    _checkBridge,
    abrirAsignarPersona, confirmarAsignarPersona,
    abrirResetCompleto, ejecutarResetCompleto,
    cargarUsuariosTimmy, abrirFormUsuarioTimmy,
    prefillTimmyDesdeERP, guardarUsuarioTimmy, confirmarEliminarTimmy,
    cargarMarcas, setMarcasFecha, setMarcasPersona, abrirEnlazarMarca, _confirmarEnlace,
    enrolarPersona,
    pingTimmyDirect, registrarTodosDirecto, registrarBiometricoTimmy,
  };

  return { render, onMount, onUnmount };
})());
