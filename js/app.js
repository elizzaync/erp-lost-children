/* ============================================================
   app.js — Router SPA + sidebar + header
   ============================================================ */
window.App = (function () {

  const _modules = {};
  let _current = null;
  let _currentModule = null;

  /* Qué grupo contiene cada pantalla */
  const _screenGroup = {
    personas: 'beneficiarios', asistencia: 'beneficiarios',
    almacen: 'recursos', alimentacion: 'recursos', entregas: 'recursos',
    gastos: 'finanzas', reportes: 'finanzas',
  };

  /* Estado abierto/cerrado de grupos (persiste en localStorage) */
  let _openGroups = {};
  try {
    _openGroups = JSON.parse(localStorage.getItem('lc_nav_groups') || '{}');
  } catch { _openGroups = {}; }
  if (!('beneficiarios' in _openGroups)) _openGroups.beneficiarios = true;
  if (!('recursos'      in _openGroups)) _openGroups.recursos      = true;
  if (!('finanzas'      in _openGroups)) _openGroups.finanzas      = true;

  /* ---------- REGISTRO ---------- */
  function register(name, mod) { _modules[name] = mod; }

  /* ---------- SIDEBAR MÓVIL ---------- */
  function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('sidebar-overlay').classList.toggle('active');
  }
  function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('active');
  }

  /* ---------- GRUPOS COLAPSABLES ---------- */
  function toggleGroup(name) {
    _openGroups[name] = !_openGroups[name];
    localStorage.setItem('lc_nav_groups', JSON.stringify(_openGroups));
    _applyGroupState(name);
  }

  function _applyGroupState(name) {
    const body    = document.getElementById(`grp-${name}`);
    const chevron = document.getElementById(`chv-${name}`);
    const open    = _openGroups[name];
    if (body)    body.classList.toggle('open', open);
    if (chevron) chevron.style.transform = open ? 'rotate(180deg)' : '';
  }

  function _applyAllGroups() {
    ['beneficiarios','recursos','finanzas'].forEach(_applyGroupState);
  }

  /* ---------- NAVEGACIÓN ---------- */
  function navigate(screen) {
    if (!_modules[screen]) return;
    if (window.Auth && !Auth.canAccess(screen)) return;
    _current = screen;
    closeSidebar();

    /* Si el screen está en un grupo cerrado, ábrelo */
    const grp = _screenGroup[screen];
    if (grp && !_openGroups[grp]) {
      _openGroups[grp] = true;
      localStorage.setItem('lc_nav_groups', JSON.stringify(_openGroups));
      _applyGroupState(grp);
    }

    /* Actualizar activos en sidebar */
    document.querySelectorAll('.nav-btn[data-screen]').forEach(b => {
      b.classList.toggle('active', b.dataset.screen === screen);
    });
    /* Resaltar grupo padre activo */
    document.querySelectorAll('.nav-group-hdr').forEach(h => {
      const g = h.dataset.group;
      const hasActive = Object.entries(_screenGroup).some(([s,gr]) => gr===g && s===screen);
      h.classList.toggle('group-active', hasActive);
    });

    if (_currentModule && typeof _currentModule.onUnmount === 'function') {
      _currentModule.onUnmount();
    }

    _currentModule = _modules[screen];
    const content  = document.getElementById('content');
    content.innerHTML = `<div class="screen">${_currentModule.render()}</div>`;

    if (typeof _currentModule.onMount === 'function') {
      _currentModule.onMount();
    }
    content.scrollTop = 0;
  }

  function currentScreen() { return _current; }
  function isActive(screen) { return _current === screen; }
  function refresh() { if (_current) navigate(_current); }

  /* ---------- SVG helpers ---------- */
  const _chevron = `<svg id="chv-GRPID" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-left:auto;transition:transform .2s;flex:none;opacity:.6"><polyline points="6 9 12 15 18 9"/></svg>`;
  function chevron(id) { return _chevron.replace('GRPID', id); }

  /* ---------- SIDEBAR HTML ---------- */
  function _navItem(screen, icon, label, badgeId) {
    if (window.Auth && !Auth.canAccess(screen)) return '';
    return `<button class="nav-btn nav-sub" data-screen="${screen}">
      ${icon}${label}${badgeId ? `<span id="${badgeId}"></span>` : ''}
    </button>`;
  }

  function _groupVisible(screens) {
    if (!window.Auth) return true;
    return screens.some(s => Auth.canAccess(s));
  }

  function buildSidebar() {
    const canDash     = !window.Auth || Auth.canAccess('dashboard');
    const canMarcado  = !window.Auth || Auth.canAccess('marcado');
    const canUsuarios = !window.Auth || Auth.canAccess('usuarios');
    const showBenefi  = _groupVisible(['personas','asistencia']);
    const showRecursos= _groupVisible(['almacen','alimentacion','entregas']);
    const showFinanzas= _groupVisible(['gastos','reportes']);

    return `
    <div class="logo-area">
      <div class="logo-icon" style="background:#fff;padding:4px;">
        <img src="assets/logo.jpg" style="width:32px;height:32px;object-fit:contain;border-radius:8px;display:block;" alt="Logo">
      </div>
      <div>
        <div class="logo-title">Lost Children</div>
        <div class="logo-sub">ERP · GESTIÓN ONG</div>
      </div>
    </div>

    <nav style="display:flex;flex-direction:column;gap:2px;flex:1;overflow-y:auto;">

      ${canDash ? `<button class="nav-btn" data-screen="dashboard">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>
        Dashboard
      </button>` : ''}

      ${showBenefi ? `
      <button class="nav-group-hdr" data-group="beneficiarios" onclick="App.toggleGroup('beneficiarios')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><path d="M16 6.5a3 3 0 0 1 0 5.6M16.5 19a5.5 5.5 0 0 0-2-4.3"/></svg>
        Beneficiarios ${chevron('beneficiarios')}
      </button>
      <div class="nav-group-body" id="grp-beneficiarios">
        ${_navItem('personas',
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20a8 8 0 0 1 16 0"/></svg>',
          'Personas')}
        ${_navItem('asistencia',
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><path d="m16 12 2 2 4-4"/></svg>',
          'Asistencia')}
      </div>` : ''}

      ${showRecursos ? `
      <button class="nav-group-hdr" data-group="recursos" onclick="App.toggleGroup('recursos')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 8.5 12 4l9 4.5M3 8.5V18l9 4.5M3 8.5l9 4.5m0 0L21 8.5M12 13v9.5M21 8.5V18l-9 4.5"/></svg>
        Recursos ${chevron('recursos')}
      </button>
      <div class="nav-group-body" id="grp-recursos">
        ${_navItem('almacen',
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-4 0v2M8 7V5a2 2 0 0 0-4 0v2"/></svg>',
          'Almacén', 'badge-almacen')}
        ${_navItem('alimentacion',
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 3v7a2.5 2.5 0 0 0 5 0V3M7.5 10v11M17 3c-1.7 0-3 2.2-3 5s1.3 4 3 4m0 0v9"/></svg>',
          'Alimentación')}
        ${_navItem('entregas',
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 12v8H4v-8M2.5 7h19v5h-19zM12 22V7M12 7S11 3 8.5 3 6 6 8 7m4 0s1-4 3.5-4S18 6 16 7"/></svg>',
          'Entregas')}
      </div>` : ''}

      ${showFinanzas ? `
      <button class="nav-group-hdr" data-group="finanzas" onclick="App.toggleGroup('finanzas')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2.5" y="6" width="19" height="12" rx="2.5"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9v6M18 9v6"/></svg>
        Finanzas ${chevron('finanzas')}
      </button>
      <div class="nav-group-body" id="grp-finanzas">
        ${_navItem('gastos',
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 1 0 0 7h5a3.5 3.5 0 1 1 0 7H6"/></svg>',
          'Gastos y Fondos', 'badge-gastos')}
        ${_navItem('reportes',
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 21V4a1 1 0 0 1 1-1h9l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1Z"/><path d="M14 3v5h5M8.5 13.5l2.5 2.5 4-4.5"/></svg>',
          'Reportes')}
      </div>` : ''}

      ${canUsuarios ? `
      <div style="margin-top:4px;">
        <button class="nav-btn" data-screen="usuarios"
          style="opacity:.75;font-size:12.5px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          Gestión de Usuarios
        </button>
      </div>` : ''}

    </nav>

    <!-- USUARIO -->
    <div class="user-area">
      <div class="user-avatar-wrap" id="sidebar-avatar-wrap">
        <div class="user-avatar" id="sidebar-avatar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" opacity=".8"><circle cx="12" cy="8" r="4"/><path d="M4 20a8 8 0 0 1 16 0"/></svg>
        </div>
        <span class="user-online-dot"></span>
      </div>
      <div style="min-width:0;flex:1;">
        <div class="user-name" id="sidebar-nombre">Usuario</div>
        <div class="user-role" id="sidebar-rol">—</div>
      </div>
      <button onclick="Auth.logout()" title="Cerrar sesión" class="logout-btn">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
      </button>
    </div>`;
  }

  /* ---------- HEADER HTML ---------- */
  function buildHeader() {
    return `
    <button class="menu-btn" onclick="App.toggleSidebar()" aria-label="Menú">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2.2">
        <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
      </svg>
    </button>
    <div class="search-box">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--faint)" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/></svg>
      <input type="text" placeholder="Buscar niño, artículo, gasto…" id="global-search" oninput="App._onGlobalSearch(this.value)">
    </div>
    <div style="margin-left:auto;display:flex;align-items:center;gap:14px;">
      <div class="jornada-badge">
        <span style="width:7px;height:7px;border-radius:50%;background:var(--success);display:inline-block;"></span>
        Jornada activa
      </div>
      <button class="notif-btn" onclick="UI.openNotifications()">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8M13.7 20a2 2 0 0 1-3.4 0"/></svg>
        <span class="notif-dot" id="notif-dot"></span>
      </button>
    </div>`;
  }

  /* ---------- BADGES EN SIDEBAR ---------- */
  function updateSidebarBadges() {
    const criticos = DB.articulos.filter(a => a.stock < a.minimo).length;
    const el = document.getElementById('badge-almacen');
    if (el) {
      el.innerHTML = criticos
        ? `<span style="background:#fd4c5c;color:#fff;font-size:10px;font-weight:800;padding:2px 7px;border-radius:20px;margin-left:auto;">${criticos}</span>`
        : '';
    }
    const fondosEl = document.getElementById('badge-gastos');
    if (fondosEl) {
      fondosEl.innerHTML = DB.fondos.balance < 0
        ? `<span style="background:#fd4c5c;color:#fff;font-size:10px;font-weight:800;padding:2px 7px;border-radius:20px;margin-left:auto;">!</span>`
        : '';
    }
  }

  /* ---------- INIT ---------- */
  function init() {
    // Primera vez que hay sesión válida: arranca la carga de datos, el
    // WebSocket de asistencia y los refrescos periódicos. Si ya estaba
    // inicializado (ej. Auth ya lo hizo al restaurar sesión), esto solo
    // vuelve a pedir los datos.
    if (window.DB) DB.init();

    const ov = document.createElement('div');
    ov.id = 'sidebar-overlay';
    ov.className = 'sidebar-overlay';
    ov.onclick = closeSidebar;
    document.body.appendChild(ov);

    document.getElementById('sidebar').innerHTML = buildSidebar();
    document.querySelector('header').innerHTML   = buildHeader();

    /* Bind nav clicks */
    document.querySelectorAll('.nav-btn[data-screen]').forEach(btn => {
      btn.addEventListener('click', () => navigate(btn.dataset.screen));
    });

    /* Aplicar estado de grupos */
    _applyAllGroups();

    DB.on('almacen:update', updateSidebarBadges);
    DB.on('fondos:update',  updateSidebarBadges);
    updateSidebarBadges();

    /* Usuario logueado */
    if (window.Auth) {
      const u = Auth.getUser();
      const nombreEl = document.getElementById('sidebar-nombre');
      const rolEl    = document.getElementById('sidebar-rol');
      const avatarEl = document.getElementById('sidebar-avatar');
      if (u.nombre) {
        if (nombreEl) nombreEl.textContent = u.nombre;
        if (rolEl)    rolEl.textContent    = Auth.rolLabel ? Auth.rolLabel() : (u.rol || '—');
        if (avatarEl) {
          const iniciales = u.nombre.split(' ').map(p => p[0]||'').slice(0,2).join('').toUpperCase();
          avatarEl.innerHTML = `<span style="font-size:13px;font-weight:800;color:#fff;">${iniciales}</span>`;
          const avatarColors = {
            admin: 'linear-gradient(135deg,#fd4c5c,#febd3e)',
            coordinador: 'linear-gradient(135deg,#0176bf,#5dbc35)',
            voluntario:  'linear-gradient(135deg,#5dbc35,#0176bf)',
            kiosko:      'linear-gradient(135deg,#6B4EEA,#0176bf)',
            donador:     'linear-gradient(135deg,#febd3e,#fd4c5c)',
          };
          avatarEl.style.background = avatarColors[u.rol] || avatarColors.admin;
        }
      }

      /* Kiosko: pantalla completa sin sidebar ni header */
      if (Auth.rol && Auth.rol() === 'kiosko') {
        document.getElementById('sidebar').style.display = 'none';
        document.querySelector('header').style.display   = 'none';
        document.getElementById('main').style.marginLeft = '0';
        document.getElementById('main').style.paddingTop = '0';
        navigate('marcado');
        return;
      }

      /* Pantalla de inicio según rol */
      const _startScreen = { voluntario: 'asistencia', donador: 'gastos' };
      const start = _startScreen[Auth.rol ? Auth.rol() : ''] || 'dashboard';
      navigate(start);
    } else {
      navigate('dashboard');
    }
  }

  function _onGlobalSearch(val) {
    if (_currentModule && typeof _currentModule.onSearch === 'function') {
      _currentModule.onSearch(val);
    }
  }

  return { register, navigate, currentScreen, isActive, refresh, init,
           _onGlobalSearch, buildSidebar, toggleSidebar, closeSidebar, toggleGroup };
})();
