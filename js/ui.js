/* ============================================================
   ui.js — Componentes reutilizables de interfaz
   ============================================================
   Cualquier módulo puede usar:
     UI.modal(html)             → abre modal
     UI.closeModal()            → cierra
     UI.badge(label, clase)     → genera badge HTML
     UI.avatar(inicial,bg,fg,sq)→ genera avatar HTML
     UI.toast(msg, tipo)        → notificación temporal
     UI.confirm(msg, cb)        → confirmación
   ============================================================ */
/* Escapa caracteres HTML para evitar XSS al insertar datos en innerHTML */
window.esc = function(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

window.UI = (function () {

  /* ---------- MODAL ---------- */
  function modal(html, opts) {
    opts = opts || {};
    const root = document.getElementById('modal-root');
    root.innerHTML = `
      <div class="modal-overlay" id="modal-overlay">
        <div class="modal" style="${opts.wide?'width:680px;':''}${opts.narrow?'width:380px;':''}">
          ${html}
        </div>
      </div>`;
    if (!opts.noClose) {
      document.getElementById('modal-overlay').addEventListener('click', function(e) {
        if (e.target === this) closeModal();
      });
    }
    // Focus first input
    setTimeout(() => {
      const first = root.querySelector('input:not([type=hidden]),select');
      if (first) first.focus();
    }, 50);
  }

  function closeModal() {
    document.getElementById('modal-root').innerHTML = '';
  }

  /* ---------- TOAST ---------- */
  let _toastTimer;
  function toast(msg, tipo) {
    tipo = tipo || 'success';
    const colors = {
      success: {bg:'#E8F7F1', color:'#1D7A56', icon:'✓'},
      error:   {bg:'#FDE7E1', color:'#C24A30', icon:'✕'},
      warn:    {bg:'#FDF2D5', color:'#9A6B0A', icon:'!'},
      info:    {bg:'var(--primary-soft)', color:'var(--primary-d)', icon:'ℹ'},
    };
    const c = colors[tipo] || colors.success;
    let el = document.getElementById('toast-root');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast-root';
      el.style.cssText = 'position:fixed;bottom:28px;right:28px;z-index:200;display:flex;flex-direction:column;gap:8px;';
      document.body.appendChild(el);
    }
    const t = document.createElement('div');
    t.style.cssText = `background:${c.bg};color:${c.color};padding:12px 18px;border-radius:12px;font-size:14px;font-weight:600;font-family:'Quicksand';box-shadow:0 4px 20px rgba(0,0,0,.12);display:flex;align-items:center;gap:10px;animation:fadeIn .2s ease;max-width:340px;`;
    t.innerHTML = `<span style="font-size:16px;">${c.icon}</span>${msg}`;
    el.appendChild(t);
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => { t.remove(); }, 3000);
  }

  /* ---------- CONFIRM ---------- */
  function confirm(msg, cb, cancelCb) {
    modal(`
      <h2 style="font-size:17px;">Confirmar acción</h2>
      <p style="color:var(--muted);font-size:14px;margin:0 0 20px;">${msg}</p>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="UI.closeModal();${cancelCb?'('+cancelCb+')()':''}">Cancelar</button>
        <button class="btn btn-primary" id="confirm-ok">Confirmar</button>
      </div>
    `, {narrow: true});
    document.getElementById('confirm-ok').addEventListener('click', () => {
      closeModal();
      cb();
    });
  }

  /* ---------- BADGE ---------- */
  function badge(label, clase, extraStyle) {
    return `<span class="badge ${clase||''}" style="${extraStyle||''}">${label}</span>`;
  }

  function badgeEstado(estado) {
    const map = {
      activo:   {label:'Activo',   cls:'badge-success'},
      inactivo: {label:'Inactivo', cls:'badge-muted'},
      alerta:   {label:'Alerta',   cls:'badge-warn'},
      critico:  {label:'Crítico',  cls:'badge-danger'},
      bajo:     {label:'Bajo',     cls:'badge-warn'},
      ok:       {label:'OK',       cls:'badge-success'},
    };
    const d = map[estado] || {label:estado, cls:'badge-muted'};
    return badge(d.label, d.cls);
  }

  function badgeTipo(tipo) {
    const map = {
      nino:      {label:'Niño/a',     cls:'badge-primary'},
      misionero: {label:'Misionero',  cls:'badge-danger'},
      voluntario:{label:'Voluntario', cls:'badge-purple'},
      staff:     {label:'Staff',      cls:'badge-success'},
    };
    const d = map[tipo] || {label:tipo, cls:'badge-muted'};
    return badge(d.label, d.cls);
  }

  /* ---------- AVATAR ---------- */
  function avatar(inicial, bg, fg, square, size) {
    size = size || 38;
    const cls = square ? 'avatar-sq' : 'avatar';
    const rad = square ? `border-radius:${Math.round(size*.29)}px;` : 'border-radius:50%;';
    return `<div class="${cls}" style="width:${size}px;height:${size}px;${rad}background:${esc(bg)};color:${esc(fg)};font-size:${Math.round(size*.37)}px;">${esc(inicial)}</div>`;
  }

  /* ---------- AVATAR CON FOTO (clic = zoom) ----------
     Si hay fotoUrl muestra la foto (clic abre zoom); si no, iniciales. */
  function avatarFoto(fotoUrl, inicial, bg, fg, nombre, size) {
    size = size || 38;
    if (!fotoUrl) return avatar(inicial, bg, fg, true, size);
    const rad = Math.round(size * .29);
    const u = esc(fotoUrl);
    const n = esc(nombre || '');
    // Doble contexto: dentro de onerror/onclick el valor se interpreta como
    // JS (hay que escapar comillas simples y backslash para no romper el
    // string), pero ese atributo a su vez está delimitado por comillas
    // dobles en el HTML (hay que escapar esas también) — un solo esc() no
    // cubre ambas capas.
    const jsAttr = (s) => esc(String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"));
    return `<img src="${u}" alt="${n}"
      onclick="event.stopPropagation();UI.fotoZoom('${jsAttr(fotoUrl)}','${jsAttr(nombre||'')}')"
      onerror="this.outerHTML=UI.avatar('${jsAttr(inicial||'?')}','${jsAttr(bg||'var(--line)')}','${jsAttr(fg||'var(--muted)')}',true,${size})"
      style="width:${size}px;height:${size}px;border-radius:${rad}px;object-fit:cover;flex:none;
             cursor:zoom-in;border:1.5px solid var(--line);" title="Clic para ampliar">`;
  }

  /* ---------- ZOOM DE FOTO (lightbox) ---------- */
  function fotoZoom(url, nombre) {
    const prev = document.getElementById('foto-zoom-overlay');
    if (prev) prev.remove();
    const div = document.createElement('div');
    div.id = 'foto-zoom-overlay';
    div.style.cssText = `position:fixed;inset:0;z-index:9999;background:rgba(10,15,20,.85);
      display:flex;align-items:center;justify-content:center;flex-direction:column;gap:14px;
      cursor:zoom-out;animation:lc-fade-in .15s ease;`;
    div.innerHTML = `
      <img src="${esc(url)}" alt="" style="max-width:88vw;max-height:78vh;border-radius:14px;
           box-shadow:0 18px 60px rgba(0,0,0,.55);object-fit:contain;background:#111;">
      ${nombre ? `<div style="color:#fff;font-size:16px;font-weight:700;font-family:'Quicksand';">${esc(nombre)}</div>` : ''}
      <div style="color:rgba(255,255,255,.55);font-size:12px;">Clic en cualquier lugar o ESC para cerrar</div>`;
    const cerrar = () => { div.remove(); document.removeEventListener('keydown', onKey); };
    const onKey  = (e) => { if (e.key === 'Escape') cerrar(); };
    div.onclick = cerrar;
    document.addEventListener('keydown', onKey);
    document.body.appendChild(div);
  }

  /* ---------- SEARCH BOX ---------- */
  function searchBox(id, placeholder, value, onInputCode) {
    return `
    <div class="search-box" style="width:280px;">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--faint)" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/></svg>
      <input type="text" id="${id}" placeholder="${placeholder}" value="${value||''}" oninput="${onInputCode}">
    </div>`;
  }

  /* ---------- PROGRESS BAR ---------- */
  function progressBar(pct, color, height) {
    height = height || 9;
    return `<div class="progress-bar" style="height:${height}px;"><div class="progress-fill" style="width:${Math.min(100,Math.max(0,pct))}%;background:${color||'var(--primary)'};"></div></div>`;
  }

  /* ---------- EMPTY STATE ---------- */
  function emptyState(msg) {
    return `<div style="padding:40px;text-align:center;color:var(--faint);font-size:14px;">${msg}</div>`;
  }

  /* ---------- LOADING ---------- */
  function loading() {
    return `<div class="loading"><div class="spinner"></div>Cargando…</div>`;
  }

  /* ---------- NOTIFICACIONES SIDEBAR ---------- */
  function openNotifications() {
    const alertas = DB.getAlertasActivas();
    const tipoColor = {danger:'#FDE7E1', warn:'#FDF2D5', primary:'var(--primary-soft)'};
    const tipoFg = {danger:'var(--danger)', warn:'var(--warn)', primary:'var(--primary)'};
    const icons = {
      danger:`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2"><path d="M12 9v4m0 4h.01M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>`,
      warn:`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--warn)" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`,
      primary:`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v4m0 4h.01"/></svg>`,
    };
    modal(`
      <h2>Notificaciones <span class="badge badge-danger" style="font-size:12px;">${alertas.length}</span></h2>
      <div style="display:flex;flex-direction:column;gap:10px;">
        ${alertas.length ? alertas.map(a=>`
          <div class="alert-strip" style="background:${tipoColor[a.tipo]||tipoColor.primary};">
            ${icons[a.tipo]||icons.primary}
            <div style="flex:1;">
              <div style="font-size:13.5px;font-weight:600;">${esc(a.texto)}</div>
              <div style="font-size:12px;color:var(--muted);">${esc(a.sub)}</div>
            </div>
            <button class="btn-ghost" style="color:${tipoFg[a.tipo]||'var(--primary)'};" onclick="UI.closeModal();App.navigate('${a.link}')">Ver →</button>
          </div>`).join('') : UI.emptyState('No hay alertas activas')}
      </div>
      <div class="modal-footer"><button class="btn btn-outline" onclick="UI.closeModal()">Cerrar</button></div>
    `);
  }

  return {
    modal,
    closeModal,
    toast,
    confirm,
    badge,
    badgeEstado,
    badgeTipo,
    avatar,
    avatarFoto,
    fotoZoom,
    searchBox,
    progressBar,
    emptyState,
    loading,
    openNotifications,
  };
})();
