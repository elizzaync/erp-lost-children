/* ============================================================
   auth.js — Autenticación del ERP Lost Children
   Muestra la pantalla de login antes de iniciar la app.
   Guarda el token en sessionStorage (se limpia al cerrar el tab).
   ============================================================ */
window.Auth = (function () {

  const API = window.location.protocol === 'file:'
    ? 'http://localhost:7793'
    : window.location.origin;

  const TOKEN_KEY = 'erp_token';
  const USER_KEY  = 'erp_user';

  /* ---- Pantalla de login ---- */
  const _screen = document.createElement('div');
  _screen.id    = 'login-screen';
  _screen.innerHTML = `
    <div class="lc-bg-left">
      <div class="lc-brand">
        <div class="lc-brand-icon" style="background:rgba(255,255,255,.15);border:2px solid rgba(255,255,255,.25);">
          <img src="assets/logo.jpg" style="width:64px;height:64px;object-fit:contain;border-radius:16px;" alt="Logo">
        </div>
        <div class="lc-brand-name">Lost Children</div>
        <div class="lc-brand-sub">Sistema de Gestión ONG</div>
        <div class="lc-dots">
          <span style="background:#fd4c5c"></span>
          <span style="background:#febd3e"></span>
          <span style="background:#5dbc35"></span>
          <span style="background:#fff;opacity:.5"></span>
        </div>
        <p class="lc-quote">"Cada niño merece un registro, un seguimiento y una familia que lo cuide."</p>
      </div>
    </div>

    <div class="lc-bg-right">
      <div class="lc-card">
        <div class="lc-color-bar">
          <span style="background:#fd4c5c"></span>
          <span style="background:#0176bf"></span>
          <span style="background:#5dbc35"></span>
          <span style="background:#febd3e"></span>
        </div>

        <div style="padding:32px 36px 28px;">
          <h2 class="lc-heading">Bienvenido de vuelta</h2>
          <p class="lc-subheading">Ingresa tus credenciales para acceder al ERP</p>

          <div class="lc-field">
            <label>Usuario</label>
            <div class="lc-input-wrap">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8E97A8" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20a8 8 0 0 1 16 0"/></svg>
              <input type="text" id="lc-user" placeholder="Tu nombre de usuario" autocomplete="username"
                onkeydown="if(event.key==='Enter')document.getElementById('lc-pass').focus()">
            </div>
          </div>

          <div class="lc-field">
            <label>Contraseña</label>
            <div class="lc-input-wrap">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8E97A8" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              <input type="password" id="lc-pass" placeholder="Tu contraseña" autocomplete="current-password"
                onkeydown="if(event.key==='Enter')Auth.login()">
              <button type="button" onclick="Auth.togglePass()"
                style="background:none;border:none;cursor:pointer;padding:0;color:#8E97A8;display:flex;align-items:center;">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/><circle cx="12" cy="12" r="3"/>
                </svg>
              </button>
            </div>
          </div>

          <div id="lc-error" class="lc-error-box">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex:none;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span id="lc-error-text"></span>
          </div>

          <button id="lc-btn" onclick="Auth.login()" class="lc-submit">
            <span id="lc-btn-text">Iniciar sesión</span>
            <span id="lc-btn-spin" style="display:none;align-items:center;gap:6px;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
                style="animation:spin .7s linear infinite;"><path d="M21 12a9 9 0 1 1-6.2-8.6"/></svg>
              Verificando…
            </span>
          </button>

          <div style="margin-top:22px;text-align:center;font-size:12.5px;color:#8E97A8;">
            ¿Problemas para entrar? Contacta al administrador.
          </div>
        </div>
      </div>
    </div>
  `;

  /* ---- Estilos del login ---- */
  const _style = document.createElement('style');
  _style.textContent = `
    #login-screen {
      position:fixed;inset:0;z-index:9999;
      display:flex;font-family:'Quicksand',system-ui,sans-serif;
      background:#0176bf;
    }
    .lc-bg-left {
      flex:1;display:flex;align-items:center;justify-content:center;
      background:linear-gradient(145deg,#0176bf 0%,#015a9e 60%,#013d6e 100%);
      padding:48px;position:relative;overflow:hidden;
    }
    .lc-bg-left::before {
      content:'';position:absolute;width:400px;height:400px;
      background:rgba(255,255,255,.04);border-radius:50%;
      top:-100px;right:-100px;
    }
    .lc-bg-left::after {
      content:'';position:absolute;width:300px;height:300px;
      background:rgba(255,255,255,.04);border-radius:50%;
      bottom:-80px;left:-80px;
    }
    .lc-brand { text-align:center;color:#fff;z-index:1;max-width:340px; }
    .lc-brand-icon {
      width:88px;height:88px;border-radius:24px;margin:0 auto 20px;
      background:rgba(255,255,255,.15);backdrop-filter:blur(8px);
      border:2px solid rgba(255,255,255,.2);
      display:flex;align-items:center;justify-content:center;
      box-shadow:0 8px 32px rgba(0,0,0,.2);
    }
    .lc-brand-name { font-family:'Quicksand';font-weight:800;font-size:28px;letter-spacing:-.4px;margin-bottom:6px; }
    .lc-brand-sub  { font-size:14px;opacity:.65;font-weight:500;margin-bottom:24px; }
    .lc-dots { display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:22px; }
    .lc-dots span { width:12px;height:12px;border-radius:50%;display:block; }
    .lc-quote { font-size:13.5px;opacity:.7;line-height:1.6;font-style:italic;padding:0 8px; }
    .lc-bg-right {
      width:480px;flex:none;background:#F5F7FA;
      display:flex;align-items:center;justify-content:center;padding:32px;
      overflow-y:auto;
    }
    .lc-card {
      background:#fff;border-radius:20px;width:100%;
      box-shadow:0 4px 32px rgba(0,0,0,.1);overflow:hidden;
    }
    .lc-color-bar { display:flex;height:5px; }
    .lc-color-bar span { flex:1; }
    .lc-heading    { font-family:'Quicksand';font-weight:800;font-size:23px;color:#1A2332;margin:0 0 6px; }
    .lc-subheading { font-size:13.5px;color:#5A6478;margin:0 0 24px; }
    .lc-field { margin-bottom:15px; }
    .lc-field label { display:block;font-size:12.5px;font-weight:700;color:#5A6478;margin-bottom:7px;letter-spacing:.2px;text-transform:uppercase; }
    .lc-input-wrap {
      display:flex;align-items:center;gap:9px;
      border:1.5px solid #E2E8F0;border-radius:11px;padding:11px 14px;
      background:#F5F7FA;transition:border-color .15s,background .15s;
    }
    .lc-input-wrap:focus-within { border-color:#0176bf;background:#fff;box-shadow:0 0 0 3px rgba(1,118,191,.1); }
    .lc-input-wrap input {
      flex:1;border:none;outline:none;background:transparent;
      font-family:'Quicksand';font-size:14px;color:#1A2332;
    }
    .lc-input-wrap input::placeholder { color:#8E97A8; }
    .lc-error-box {
      display:none;background:#fff0f1;color:#c2001a;
      border:1px solid #ffd0d4;border-radius:9px;
      padding:10px 14px;font-size:13px;margin-bottom:14px;
      align-items:center;gap:8px;
    }
    .lc-submit {
      width:100%;padding:14px;border:none;border-radius:11px;
      background:linear-gradient(135deg,#0176bf,#015a9e);color:#fff;
      font-family:'Quicksand';font-size:15px;font-weight:700;
      cursor:pointer;margin-top:6px;display:flex;align-items:center;justify-content:center;gap:8px;
      transition:opacity .15s,transform .1s;box-shadow:0 4px 12px rgba(1,118,191,.35);
    }
    .lc-submit:hover  { opacity:.92;transform:translateY(-1px); }
    .lc-submit:active { transform:scale(.98); }
    .lc-submit:disabled { opacity:.6;cursor:not-allowed;transform:none; }
    @media(max-width:900px){
      .lc-bg-left { display:none; }
      .lc-bg-right { width:100%;background:#0176bf; }
      .lc-card { max-width:420px; }
    }
    @media(max-width:480px){
      .lc-bg-right { padding:16px; }
    }
  `;

  function _setLoading(on) {
    const btn  = document.getElementById('lc-btn');
    const txt  = document.getElementById('lc-btn-text');
    const spin = document.getElementById('lc-btn-spin');
    if (txt)  txt.style.display  = on ? 'none' : '';
    if (spin) spin.style.display = on ? 'flex' : 'none';
    if (btn)  btn.disabled = on;
  }

  function _setError(msg) {
    const el = document.getElementById('lc-error');
    if (!el) return;
    if (msg) {
      const sp = document.getElementById('lc-error-text');
      if (sp) sp.textContent = msg;
      el.style.display = 'flex';
    } else {
      el.style.display = 'none';
    }
  }

  function togglePass() {
    const inp = document.getElementById('lc-pass');
    inp.type  = inp.type === 'password' ? 'text' : 'password';
  }

  async function login() {
    const username = (document.getElementById('lc-user').value || '').trim();
    const password =  document.getElementById('lc-pass').value || '';
    if (!username || !password) { _setError('Completa usuario y contraseña'); return; }
    _setError('');
    _setLoading(true);
    try {
      const res = await fetch(API + '/auth/login', {
        method:  'POST',
        headers: {'Content-Type':'application/json'},
        body:    JSON.stringify({username, password}),
      });
      const data = await res.json();
      if (!data.ok) { _setError(data.error || 'Error al iniciar sesión'); return; }
      sessionStorage.setItem(TOKEN_KEY, data.token);
      sessionStorage.setItem(USER_KEY, JSON.stringify({
        nombre:   data.nombre,
        rol:      data.rol,
        username: username,
      }));
      _hide();
      App.init();
    } catch (e) {
      _setError('No se pudo conectar con el servidor. Verifica que el bridge esté activo.');
    } finally {
      _setLoading(false);
    }
  }

  async function logout() {
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (token) {
      fetch(API + '/auth/logout', {
        method:  'POST',
        headers: {'Authorization': `Bearer ${token}`},
      }).catch(() => {});
    }
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    // Recarga la página para limpiar todo el estado de la app
    window.location.reload();
  }

  function getToken()   { return sessionStorage.getItem(TOKEN_KEY) || ''; }
  function getUser()    {
    try { return JSON.parse(sessionStorage.getItem(USER_KEY) || '{}'); }
    catch { return {}; }
  }

  function _show() {
    document.head.appendChild(_style);
    document.body.appendChild(_screen);
    setTimeout(() => {
      const u = document.getElementById('lc-user');
      if (u) u.focus();
    }, 100);
  }

  function _hide() {
    _screen.remove();
    _style.remove();
  }

  /* Valida si hay sesión activa al cargar la página */
  async function init() {
    const token = getToken();
    if (!token) { _show(); return; }
    // Verifica que el token siga siendo válido
    try {
      const res  = await fetch(API + '/auth/me', {
        headers: {'Authorization': `Bearer ${token}`},
      });
      const data = await res.json();
      if (data.ok) {
        App.init();   // Token válido → lanza la app
      } else {
        sessionStorage.clear();
        _show();
      }
    } catch {
      sessionStorage.clear();
      _show();  // servidor no disponible — no dar acceso sin verificar
    }
  }

  /* ---- Permisos por rol ---- */
  const _PERMISOS = {
    admin:       { screens: ['dashboard','personas','asistencia','almacen','alimentacion','entregas','gastos','reportes','marcado','usuarios'], write: '*' },
    coordinador: { screens: ['dashboard','personas','asistencia','almacen','alimentacion','entregas','gastos','reportes','marcado'], write: '*' },
    voluntario:  { screens: ['asistencia','almacen'], write: ['asistencia'] },
  };

  function rol() { return getUser().rol || 'voluntario'; }

  function canAccess(screen) {
    const p = _PERMISOS[rol()];
    if (!p) return false;
    return p.screens === '*' || p.screens.includes(screen);
  }

  function canWrite(screen) {
    const p = _PERMISOS[rol()];
    if (!p) return false;
    return p.write === '*' || p.write.includes(screen);
  }

  const _ROL_LABELS = {
    admin:       'Administrador',
    coordinador: 'Coordinador/a',
    voluntario:  'Voluntario/a',
  };

  function rolLabel() { return _ROL_LABELS[rol()] || rol(); }

  return { init, login, logout, togglePass, getToken, getUser, rol, rolLabel, canAccess, canWrite };
})();
