/* ============================================================
   modules/marcado.js — Kiosko de marcado facial
   Depende de: DB.asistencia, DB.personas
   Emite:    asistencia:update (vía DB.marcarFacial / DB.toggleAsistencia)
   Escucha:  asistencia:update → actualiza contadores en kiosko
   ============================================================ */
App.register('marcado', (function () {

  let _scanning = false;

  DB.on('asistencia:update', ()=>{ if(App.isActive('marcado')) _refreshContadores(); });

  function render() {
    return `
    <div class="page-header" style="flex-direction:column;align-items:center;text-align:center;margin-bottom:14px;">
      <h1>Kiosko de marcado facial</h1>
      <p>El niño se coloca frente a la cámara · el sistema identifica y registra la asistencia</p>
    </div>

    <div class="kiosk-wrap">

      <!-- CÁMARA SIMULADA -->
      <div class="kiosk-cam" id="kiosk-cam">
        <!-- guías de encuadre -->
        <svg style="position:absolute;inset:0;width:100%;height:100%;" viewBox="0 0 280 280" fill="none">
          <rect x="60" y="50" width="60" height="4" rx="2" fill="rgba(42,135,156,.6)"/>
          <rect x="60" y="50" width="4" height="60" rx="2" fill="rgba(42,135,156,.6)"/>
          <rect x="160" y="50" width="60" height="4" rx="2" fill="rgba(42,135,156,.6)"/>
          <rect x="216" y="50" width="4" height="60" rx="2" fill="rgba(42,135,156,.6)"/>
          <rect x="60" y="172" width="60" height="4" rx="2" fill="rgba(42,135,156,.6)"/>
          <rect x="60" y="172" width="4" height="58" rx="2" fill="rgba(42,135,156,.6)"/>
          <rect x="160" y="172" width="60" height="4" rx="2" fill="rgba(42,135,156,.6)"/>
          <rect x="216" y="172" width="4" height="58" rx="2" fill="rgba(42,135,156,.6)"/>
          <!-- rostro guía -->
          <ellipse cx="140" cy="118" rx="52" ry="62" stroke="rgba(42,135,156,.25)" stroke-width="2" fill="rgba(42,135,156,.06)"/>
        </svg>
        <div class="kiosk-scan-line" style="top:60px;"></div>
        <div style="position:absolute;bottom:16px;left:0;right:0;text-align:center;font-size:12px;color:rgba(255,255,255,.5);">
          Coloca tu rostro en el recuadro
        </div>
      </div>

      <!-- STATUS -->
      <div id="kiosk-status" style="text-align:center;min-height:52px;">
        <div style="font-family:'Plus Jakarta Sans';font-weight:800;font-size:18px;">Esperando…</div>
        <div style="font-size:13px;color:var(--muted);margin-top:4px;">Sistema listo para reconocer</div>
      </div>

      <!-- BOTONES -->
      <div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center;">
        <button class="btn btn-primary" id="btn-simular" onclick="MarcadoModule.simular()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="11" r="3"/><path d="M5 19a7 7 0 0 1 14 0"/></svg>Simular reconocimiento
        </button>
        <button class="btn btn-outline" onclick="MarcadoModule.marcarManual()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h10"/></svg>Marcar manual
        </button>
        <button class="btn btn-outline" onclick="App.navigate('asistencia')">Ver lista completa</button>
      </div>

      <!-- CONTADORES -->
      <div id="kiosk-contadores" style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;width:100%;max-width:460px;">
        ${_renderContadores()}
      </div>

      <!-- HISTORIAL DE HOY -->
      <div style="width:100%;max-width:560px;">
        <div style="font-weight:700;font-size:14px;margin-bottom:10px;color:var(--muted);">Últimas marcas de hoy</div>
        <div id="kiosk-historial" style="display:flex;flex-direction:column;gap:8px;">
          ${_renderHistorial()}
        </div>
      </div>

    </div>`;
  }

  function _renderContadores() {
    const presentes = DB.asistencia.filter(a=>a.presente).length;
    const facial    = DB.asistencia.filter(a=>a.presente&&a.metodo.includes('facial')).length;
    const ausentes  = DB.asistencia.filter(a=>!a.presente).length;
    return `
      <div class="kpi-card" style="text-align:center;padding:14px;">
        <div style="font-family:'Plus Jakarta Sans';font-weight:800;font-size:22px;color:var(--primary);">${facial}</div>
        <div style="font-size:12px;color:var(--muted);">Por facial</div>
      </div>
      <div class="kpi-card" style="text-align:center;padding:14px;">
        <div style="font-family:'Plus Jakarta Sans';font-weight:800;font-size:22px;color:var(--success);">${presentes}</div>
        <div style="font-size:12px;color:var(--muted);">Presentes</div>
      </div>
      <div class="kpi-card" style="text-align:center;padding:14px;">
        <div style="font-family:'Plus Jakarta Sans';font-weight:800;font-size:22px;color:var(--danger);">${ausentes}</div>
        <div style="font-size:12px;color:var(--muted);">Ausentes</div>
      </div>`;
  }

  function _renderHistorial() {
    const marcados = DB.asistencia.filter(a=>a.presente&&a.hora).slice(0,5);
    if (!marcados.length) return `<div style="font-size:13px;color:var(--faint);text-align:center;">Sin marcas aún</div>`;
    return marcados.map(a=>`
      <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:var(--surface);border:1px solid var(--border);border-radius:12px;">
        ${UI.avatar(a.inicial, a.avatarBg, a.avatarFg, true, 34)}
        <div style="flex:1;"><div style="font-weight:600;font-size:14px;">${a.nombre}</div><div style="font-size:12px;color:var(--faint);">${a.metodo}</div></div>
        <span style="font-size:13px;font-weight:700;color:var(--success);">${a.hora}</span>
      </div>`).join('');
  }

  function _refreshContadores() {
    const el = document.getElementById('kiosk-contadores');
    if (el) el.innerHTML = _renderContadores();
    const hist = document.getElementById('kiosk-historial');
    if (hist) hist.innerHTML = _renderHistorial();
  }

  /* Simula reconocimiento facial de alguien ausente */
  let _idx = 0;
  function simular() {
    if (_scanning) return;
    _scanning = true;

    const btn = document.getElementById('btn-simular');
    if (btn) { btn.disabled=true; btn.textContent='Escaneando…'; }

    // busca el siguiente ausente
    const ausentes = DB.asistencia.filter(a=>!a.presente);
    if (!ausentes.length) {
      _setStatus('✓ Todos presentes','Todos los niños ya fueron marcados hoy','success');
      _scanning=false;
      if(btn){btn.disabled=false;btn.textContent='Simular reconocimiento';}
      return;
    }
    const target = ausentes[_idx % ausentes.length];
    _idx++;

    // animación de "buscando"
    _setStatus('','Analizando rostro…','');

    setTimeout(()=>{
      const a = DB.marcarFacial(target.personaId||target.id);
      if (a) {
        _setStatus(`¡Reconocido! → ${a.nombre}`, 'Asistencia registrada · ' + a.hora, 'success');
      } else {
        _setStatus('No reconocido', 'Intenta de nuevo o usa el modo manual', 'warn');
      }
      _scanning = false;
      if(btn){btn.disabled=false;btn.textContent='Simular reconocimiento';}
      setTimeout(()=>{
        _setStatus('Esperando…','Sistema listo para reconocer','');
      },3000);
    },1400);
  }

  function _setStatus(titulo, sub, tipo) {
    const el = document.getElementById('kiosk-status');
    if (!el) return;
    const colors = {success:'var(--success)', warn:'var(--warn)', error:'var(--danger)', '':'var(--ink)'};
    el.innerHTML = `
      <div style="font-family:'Plus Jakarta Sans';font-weight:800;font-size:18px;color:${colors[tipo]||'var(--ink)'};">${titulo}</div>
      <div style="font-size:13px;color:var(--muted);margin-top:4px;">${sub}</div>`;
  }

  /* Marcado manual con selector de persona */
  function marcarManual() {
    const ausentes = DB.asistencia.filter(a=>!a.presente);
    if (!ausentes.length) { UI.toast('Todos los niños ya están marcados','info'); return; }
    UI.modal(`
      <h2>Marcado manual</h2>
      <div class="form-group"><label>Selecciona la persona *</label>
        <select id="manual-persona">
          ${ausentes.map(a=>`<option value="${a.id}">${a.nombre}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label>Motivo</label>
        <select id="manual-motivo">
          <option>QR dañado</option><option>Sin rostro registrado</option><option>Falla de cámara</option><option>Otro</option>
        </select>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="UI.closeModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="MarcadoModule.confirmarManual()">Marcar presente</button>
      </div>`, {narrow:true});
  }

  function confirmarManual() {
    const id = parseInt(document.getElementById('manual-persona').value);
    DB.toggleAsistencia(id, 'Manual');
    UI.closeModal();
    UI.toast('Marcado manual registrado');
  }

  window.MarcadoModule = { simular, marcarManual, confirmarManual };
  return { render };
})());
