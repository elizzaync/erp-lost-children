/* ============================================================
   modules/usuarios.js — Gestión de usuarios del sistema
   Solo accesible por rol 'admin'
   ============================================================ */
App.register('usuarios', (function () {

  const ROLES = [
    { value: 'admin',       label: 'Administrador' },
    { value: 'coordinador', label: 'Coordinador/a' },
    { value: 'voluntario',  label: 'Voluntario/a' },
  ];

  const ROL_COLORS = {
    admin:       { bg: '#FDDEE0', fg: '#c2001a' },
    coordinador: { bg: '#D9EEF9', fg: '#0176bf' },
    voluntario:  { bg: '#DFF5E6', fg: '#1D7A56' },
  };

  const API = window.location.protocol === 'file:'
    ? 'http://localhost:7793'
    : window.location.origin;

  let _usuarios = [];
  let _cargando = false;
  let _loaded   = false;

  async function _cargar() {
    if (_cargando) return;          // guard: evita re-entrada desde onMount/refresh
    _cargando = true;
    try {
      const res = await fetch(API + '/auth/usuarios', {
        headers: { 'Authorization': `Bearer ${Auth.getToken()}` },
      });
      const data = await res.json();
      _usuarios = Array.isArray(data) ? data : [];
      if (!Array.isArray(data)) UI.toast('Sin acceso o error del servidor', 'error');
    } catch (e) {
      UI.toast('Error al cargar usuarios', 'error');
      _usuarios = [];
    }
    _cargando = false;
    _loaded   = true;
    // Re-render el contenido del módulo directamente, sin App.refresh()
    // para no disparar onMount de nuevo
    const el = document.getElementById('content');
    if (el && App.currentScreen() === 'usuarios') {
      el.innerHTML = `<div class="screen">${render()}</div>`;
    }
  }

  function render() {
    if (_cargando || !_loaded) return `<div class="loading"><div class="spinner"></div>Cargando usuarios…</div>`;

    const yo = Auth.getUser();

    return `
    <div class="page-header">
      <div>
        <h1>Gestión de Usuarios</h1>
        <p>Cuentas de acceso al sistema · ${_usuarios.length} usuario${_usuarios.length!==1?'s':''} registrado${_usuarios.length!==1?'s':''}</p>
      </div>
      <button class="btn btn-primary" style="margin-left:auto;" onclick="UsuariosModule.abrirNuevo()">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 5v14M5 12h14"/></svg>
        Nuevo usuario
      </button>
    </div>

    <div class="table-card">
      <div class="table-head" style="grid-template-columns:2fr 1.2fr 1.4fr 1fr 110px;">
        <span>Nombre</span><span>Usuario</span><span>Rol</span><span>Estado</span><span></span>
      </div>
      ${_usuarios.length ? _usuarios.map(u => {
        const c = ROL_COLORS[u.rol] || { bg:'#e8e8e8', fg:'#555' };
        const esSelf = u.username === yo.username;
        return `
        <div class="table-row" style="grid-template-columns:2fr 1.2fr 1.4fr 1fr 110px;">
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="width:36px;height:36px;border-radius:50%;background:${c.bg};color:${c.fg};
              display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;flex:none;">
              ${u.nombre.split(' ').map(p=>p[0]||'').slice(0,2).join('').toUpperCase()}
            </div>
            <div>
              <div style="font-size:14px;font-weight:600;">${esc(u.nombre)}${esSelf?'<span style="font-size:11px;background:#e8e8e8;color:#555;border-radius:8px;padding:2px 7px;margin-left:6px;">tú</span>':''}</div>
              <div style="font-size:11.5px;color:var(--faint);">desde ${u.created_at ? esc(u.created_at.substring(0,10)) : '—'}</div>
            </div>
          </div>
          <span style="font-size:13px;color:var(--muted);font-family:monospace;">${esc(u.username)}</span>
          <div>
            <span style="background:${c.bg};color:${c.fg};padding:4px 10px;border-radius:20px;font-size:12px;font-weight:700;">
              ${ROLES.find(r=>r.value===u.rol)?.label || u.rol}
            </span>
          </div>
          <div>
            <span style="background:${u.activo?'#DFF5E6':'#f0f0f0'};color:${u.activo?'#1D7A56':'#999'};
              padding:4px 10px;border-radius:20px;font-size:12px;font-weight:700;">
              ${u.activo ? 'Activo' : 'Inactivo'}
            </span>
          </div>
          <div style="display:flex;gap:4px;">
            <button class="btn btn-sm btn-outline" style="padding:6px 8px;" title="Editar"
              onclick="UsuariosModule.abrirEditar(${u.id})">✎</button>
            ${!esSelf ? `
            <button class="btn btn-sm btn-outline" style="padding:6px 8px;color:var(--danger);" title="Eliminar"
              onclick="UsuariosModule.confirmarEliminar(${u.id},${esc(JSON.stringify(u.nombre))})">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
            </button>` : ''}
          </div>
        </div>`;
      }).join('') : `<div style="padding:40px;text-align:center;color:var(--muted);">No hay usuarios registrados.</div>`}
    </div>

    <!-- LEYENDA DE ROLES -->
    <div style="margin-top:20px;display:flex;flex-wrap:wrap;gap:10px;">
      ${ROLES.map(r => {
        const c = ROL_COLORS[r.value] || { bg:'#e8e8e8', fg:'#555' };
        const desc = {
          admin:       'Acceso total al sistema',
          coordinador: 'Todo excepto gestión de usuarios',
          voluntario:  'Asistencia (marcar) y almacén (ver)',
        }[r.value];
        return `<div style="background:${c.bg};border-radius:12px;padding:10px 16px;min-width:180px;">
          <div style="font-size:12px;font-weight:800;color:${c.fg};margin-bottom:3px;">${r.label}</div>
          <div style="font-size:11.5px;color:${c.fg};opacity:.8;">${desc}</div>
        </div>`;
      }).join('')}
    </div>`;
  }

  function _formHtml(u) {
    return `
      <div class="form-group"><label>Nombre completo</label>
        <input type="text" id="u-nombre" value="${esc(u?u.nombre:'')}" placeholder="Ej: María García">
      </div>
      ${!u ? `<div class="form-group"><label>Nombre de usuario</label>
        <input type="text" id="u-username" value="" placeholder="Ej: mgarcia (sin espacios)" autocomplete="off">
      </div>` : `<div style="background:var(--bg);border-radius:9px;padding:10px 14px;font-size:13px;margin-bottom:14px;">
        Usuario: <b style="font-family:monospace;">${esc(u.username)}</b>
      </div>`}
      <div class="form-group"><label>Contraseña ${u ? '(dejar vacío para no cambiar)' : ''}</label>
        <input type="password" id="u-pass" value="" placeholder="${u ? 'Nueva contraseña…' : 'Contraseña de acceso'}" autocomplete="new-password">
      </div>
      <div class="form-group"><label>Rol</label>
        <select id="u-rol">
          ${ROLES.map(r => `<option value="${r.value}" ${u&&u.rol===r.value?'selected':''}>${r.label}</option>`).join('')}
        </select>
      </div>
      ${u ? `<div class="form-group"><label>Estado</label>
        <select id="u-activo">
          <option value="1" ${u.activo?'selected':''}>Activo</option>
          <option value="0" ${!u.activo?'selected':''}>Inactivo</option>
        </select>
      </div>` : ''}`;
  }

  function abrirNuevo() {
    UI.modal(`
      <h2>Nuevo usuario</h2>
      ${_formHtml(null)}
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="UI.closeModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="UsuariosModule.guardar(null)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8M7 3v5h8"/></svg>
          Crear usuario
        </button>
      </div>`);
  }

  function abrirEditar(id) {
    const u = _usuarios.find(x => x.id === id);
    if (!u) return;
    UI.modal(`
      <h2>Editar · ${esc(u.nombre)}</h2>
      ${_formHtml(u)}
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="UI.closeModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="UsuariosModule.guardar(${id})">Guardar cambios</button>
      </div>`);
  }

  async function guardar(id) {
    const nombre   = (document.getElementById('u-nombre')?.value || '').trim();
    const username = (document.getElementById('u-username')?.value || '').trim().toLowerCase();
    const password = (document.getElementById('u-pass')?.value || '').trim();
    const rol      = document.getElementById('u-rol')?.value;
    const activo   = document.getElementById('u-activo')?.value;

    if (!nombre) { UI.toast('El nombre es requerido', 'error'); return; }
    if (!id && !username) { UI.toast('El usuario es requerido', 'error'); return; }
    if (!id && !password) { UI.toast('La contraseña es requerida', 'error'); return; }

    const btn = document.querySelector('.modal .btn-primary');
    if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }

    const body = id ? { nombre, rol, activo: activo === '1' } : { nombre, username, password, rol };
    if (id && password) body.password = password;

    try {
      const url    = id ? `${API}/auth/usuarios/${id}` : `${API}/auth/usuarios`;
      const method = id ? 'PUT' : 'POST';
      const res    = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Auth.getToken()}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.ok) { UI.toast(data.error || 'Error al guardar', 'error'); return; }
      UI.closeModal();
      UI.toast(id ? 'Usuario actualizado' : 'Usuario creado correctamente', 'success');
      _cargar();
    } catch (e) {
      UI.toast('Error de conexión', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Guardar'; }
    }
  }

  function confirmarEliminar(id, nombre) {
    UI.modal(`
      <h2>Eliminar usuario</h2>
      <p style="color:var(--muted);margin-bottom:20px;">
        ¿Estás seguro de eliminar a <b>${nombre}</b>? Esta acción no se puede deshacer.
      </p>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="UI.closeModal()">Cancelar</button>
        <button class="btn" style="background:#fd4c5c;color:#fff;" onclick="UsuariosModule._doEliminar(${id})">Sí, eliminar</button>
      </div>`, { narrow: true });
  }

  async function _doEliminar(id) {
    try {
      const res = await fetch(`${API}/auth/usuarios/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${Auth.getToken()}` },
      });
      const data = await res.json();
      if (!data.ok) { UI.toast(data.error || 'Error al eliminar', 'error'); return; }
      UI.closeModal();
      UI.toast('Usuario eliminado', 'success');
      _cargar();
    } catch (e) {
      UI.toast('Error de conexión', 'error');
    }
  }

  function onMount() {
    _loaded = false;   // siempre recarga al entrar al módulo
    _cargar();
  }

  window.UsuariosModule = { abrirNuevo, abrirEditar, guardar, confirmarEliminar, _doEliminar };
  return { render, onMount };
})());
