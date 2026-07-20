/* ============================================================
   modules/personas.js
   ============================================================ */
App.register('personas', (function () {

  let _filter = 'todos';
  let _search = '';
  let _editId = null;

  DB.on('personas:update', () => { if (App.isActive('personas')) App.refresh(); });

  /* ---------- RENDER LISTA ---------- */
  function render() {
    const tipos = {todos:'Todos',nino:'Niños',padre:'Padres/Madres',misionero:'Misioneros',voluntario:'Voluntarios',staff:'Staff'};
    const lista = DB.personas.filter(p => {
      if (_filter !== 'todos' && p.tipo !== _filter) return false;
      if (_search && !p.nombre.toLowerCase().includes(_search.toLowerCase())) return false;
      return true;
    });
    return `
    <div class="page-header">
      <div>
        <h1>Personas / Beneficiarios</h1>
        <p>Registro central · base de todos los módulos</p>
      </div>
      <button class="btn btn-primary" style="margin-left:auto;" onclick="PersonasModule.abrirFormulario()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 5v14M5 12h14"/></svg>Nueva persona
      </button>
    </div>
    <div class="filter-row">
      ${UI.searchBox('personas-search','Buscar por nombre…',_search,'PersonasModule.setSearch(this.value)')}
      ${Object.entries(tipos).map(([k,v])=>`<button class="filter-chip ${_filter===k?'active':''}" onclick="PersonasModule.setFilter('${k}')">${v}</button>`).join('')}
      <span style="margin-left:auto;font-size:13px;color:var(--muted);font-weight:600;">${lista.length} registros</span>
    </div>
    <div class="table-card">
      <div class="table-head" style="grid-template-columns:2.4fr 1.2fr .7fr .7fr .9fr .8fr 1fr 140px;">
        <span>Persona</span><span>Tipo</span><span>Edad</span><span>Gén.</span><span>Prioridad</span><span>Ingreso</span><span>Estado</span><span></span>
      </div>
      ${lista.length ? lista.map(p=>`
        <div class="table-row" style="grid-template-columns:2.4fr 1.2fr .7fr .7fr .9fr .8fr 1fr 140px;">
          <div style="display:flex;align-items:center;gap:12px;">
            ${UI.avatarFoto(p.fotoUrl, p.inicial, p.avatarBg, p.avatarFg, p.nombre)}
            <div>
              <div style="font-size:14px;font-weight:600;">${esc(p.nombre)}</div>
              <div style="font-size:12px;color:var(--faint);">${p.dni?'DNI: '+esc(p.dni):(esc(p.ocupacion)||esc(p.tutor)||'—')}</div>
            </div>
          </div>
          ${UI.badgeTipo(p.tipo)}
          <span style="font-size:13.5px;color:var(--muted);">${esc(p.edad)||'—'}</span>
          <span style="font-size:13.5px;color:var(--muted);">${p.genero==='F'?'F':'M'}</span>
          ${_badgePrioridad(p.prioridad)}
          <span style="font-size:13.5px;color:var(--muted);">${esc(p.ingreso)||'—'}</span>
          ${UI.badgeEstado(p.estado)}
          <div style="display:flex;gap:5px;">
            <button class="btn btn-sm btn-outline" onclick="PersonasModule.verFicha(${p.id})">Ver ficha</button>
            <button class="btn btn-sm" style="background:#FDE7E1;color:var(--danger);border:none;border-radius:9px;padding:7px 10px;font-weight:700;cursor:pointer;" onclick="PersonasModule.confirmarEliminar(${p.id},${esc(JSON.stringify(p.nombre))})">✕</button>
          </div>
        </div>`).join('') : UI.emptyState('No se encontraron personas con ese filtro.')}
    </div>`;
  }

  function _badgePrioridad(p) {
    const map = {alta:'#ffe0e3:#c2001a',media:'#fff6dc:#b07900',baja:'#edfde0:#3d8a20'};
    const [bg,fg] = (map[p]||map.media).split(':');
    return `<span style="background:${bg};color:${fg};font-size:11.5px;font-weight:700;padding:3px 9px;border-radius:20px;">${{alta:'Alta',media:'Media',baja:'Baja'}[p]||'Media'}</span>`;
  }

  function onSearch(val) { _search = val; App.refresh(); }
  function setFilter(f)  { _filter = f;  App.refresh(); }
  function setSearch(v)  { _search = v;  App.refresh(); }

  /* ---------- HELPERS FORMULARIO ---------- */
  function _renderTutorField(val) {
    const padres = DB.personas.filter(p => p.tipo === 'padre');
    if (!padres.length) return `<input type="text" id="p-tutor" value="${esc(val)}" placeholder="Nombre del responsable">`;
    const manual = !padres.find(p => p.nombre === val);
    return `
      <select id="p-tutor-sel" onchange="PersonasModule.onTutorSelect(this.value)">
        <option value="">— selecciona —</option>
        ${padres.map(p=>`<option value="${esc(p.nombre)}" ${p.nombre===val?'selected':''}>${esc(p.nombre)}</option>`).join('')}
        <option value="__manual__" ${manual&&val?'selected':''}>Escribir manualmente…</option>
      </select>
      <input type="text" id="p-tutor" value="${esc(val)}" style="margin-top:6px;${manual&&val?'':'display:none'}" placeholder="Nombre del tutor">`;
  }

  function onTutorSelect(val) {
    const inp = document.getElementById('p-tutor');
    if (!inp) return;
    if (val==='__manual__') { inp.style.display=''; inp.value=''; inp.focus(); }
    else { inp.style.display='none'; inp.value=val; }
  }

  /* Muestra/oculta secciones según tipo seleccionado */
  function onTipoChange(tipo) {
    const secciones = ['section-nino','section-padre','section-misionero','section-voluntario','section-staff'];
    secciones.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    const mapa = {nino:'section-nino',padre:'section-padre',misionero:'section-misionero',voluntario:'section-voluntario',staff:'section-staff'};
    const target = document.getElementById(mapa[tipo]);
    if (target) target.style.display = '';
  }

  /* ---------- FORMULARIO ---------- */
  function abrirFormulario(id) {
    _editId = id || null;
    const p = _editId ? DB.personas.find(x=>x.id===_editId) : null;
    const tipo = p ? p.tipo : 'nino';

    const _sec = (secId, titulo, icono, contenido) => `
      <div class="ficha-section" id="${secId}" style="${tipo===secId.replace('section-','')?'':'display:none'}">
        <div class="ficha-section-title">${icono} ${titulo}</div>
        ${contenido}
      </div>`;

    UI.modal(`
      <h2 style="margin:0 0 4px;">${p?'Editar persona':'Nueva persona'}</h2>
      <p style="margin:0 0 20px;font-size:13px;color:var(--muted);">Los campos con * son obligatorios.</p>

      <!-- IDENTIFICACIÓN (todos) -->
      <div class="ficha-section">
        <div class="ficha-section-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>
          Identificación
        </div>
        <div class="form-group"><label>Nombre completo *</label><input type="text" id="p-nombre" value="${esc(p?p.nombre:'')}" placeholder="Ej: María García López"></div>
        <div class="form-grid">
          <div class="form-group"><label>Tipo *</label>
            <select id="p-tipo" onchange="PersonasModule.onTipoChange(this.value)">
              ${['nino','padre','misionero','voluntario','staff'].map(t=>`<option value="${t}" ${tipo===t?'selected':''}>${{nino:'Niño/a',padre:'Padre/Madre',misionero:'Misionero',voluntario:'Voluntario',staff:'Staff'}[t]}</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label>Estado</label>
            <select id="p-estado">
              ${['activo','inactivo','alerta'].map(e=>`<option value="${e}" ${p&&p.estado===e?'selected':''}>${{activo:'Activo',inactivo:'Inactivo',alerta:'Alerta'}[e]}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-grid">
          <div class="form-group"><label>DNI / Cédula</label><input type="text" id="p-dni" value="${esc(p?p.dni:'')}" placeholder="Número de documento"></div>
          <div class="form-group"><label>Fecha de nacimiento</label><input type="date" id="p-fnac" value="${esc(p?p.fechaNacimiento:'')}"></div>
        </div>
        <div class="form-grid">
          <div class="form-group"><label>Género</label>
            <select id="p-genero">
              <option value="F" ${p&&p.genero==='F'?'selected':''}>Femenino</option>
              <option value="M" ${p&&p.genero==='M'?'selected':''}>Masculino</option>
            </select>
          </div>
          <div class="form-group"><label>Nacionalidad</label><input type="text" id="p-nac" value="${esc(p?p.nacionalidad:'')}" placeholder="Ej: Venezolana"></div>
        </div>
        <div class="form-grid">
          <div class="form-group"><label>Procedencia</label><input type="text" id="p-proc" value="${esc(p?p.procedencia:'')}" placeholder="Ciudad o región de origen"></div>
          <div class="form-group"><label>Prioridad</label>
            <select id="p-prioridad">
              ${['alta','media','baja'].map(pr=>`<option value="${pr}" ${p&&p.prioridad===pr?'selected':''}>${{alta:'Alta',media:'Media',baja:'Baja'}[pr]}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-group"><label>Fecha de ingreso al programa</label><input type="month" id="p-ingreso" value="${esc(p?p.ingreso:'')}"></div>
      </div>

      <!-- CONTACTO (todos) -->
      <div class="ficha-section">
        <div class="ficha-section-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.9v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 3 4.2 2 2 0 0 1 5 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L9.1 9.9a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.4c1 .3 1.9.6 2.9.7A2 2 0 0 1 23 17Z"/></svg>
          Contacto y Ubicación
        </div>
        <div class="form-grid">
          <div class="form-group"><label>Teléfono</label><input type="tel" id="p-tel" value="${esc(p?p.telefono:'')}" placeholder="+58 412 000 0000"></div>
          <div class="form-group"><label>Email</label><input type="email" id="p-email" value="${esc(p?p.email:'')}" placeholder="correo@ejemplo.com"></div>
        </div>
        <div class="form-group"><label>Dirección</label><input type="text" id="p-dir" value="${esc(p?p.direccion:'')}" placeholder="Calle, número, casa…"></div>
        <div class="form-group"><label>Barrio / Sector</label><input type="text" id="p-barrio" value="${esc(p?p.barrio:'')}" placeholder="Nombre del barrio o sector"></div>
      </div>

      <!-- SECCIÓN NIÑO -->
      <div class="ficha-section" id="section-nino" style="${tipo==='nino'?'':'display:none'}">
        <div class="ficha-section-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><path d="M16 6.5a3 3 0 0 1 0 5.6M16.5 19a5.5 5.5 0 0 0-2-4.3"/></svg>
          Familia / Tutor
        </div>
        <div class="form-group"><label>Padre / Madre responsable</label>${_renderTutorField(p?.tutor||'')}</div>
        <div class="form-grid">
          <div class="form-group"><label>Parentesco</label>
            <select id="p-parentesco">
              ${['','Padre','Madre','Abuelo/a','Tío/a','Hermano/a','Padrino/Madrina','Otro'].map(r=>`<option value="${r}" ${p&&p.parentescoTutor===r?'selected':''}>${r||'— selecciona —'}</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label>Teléfono del tutor</label><input type="tel" id="p-tel-tutor" value="${esc(p?p.telefonoTutor:'')}" placeholder="+58 412 000 0000"></div>
        </div>
        <div class="form-group"><label>Situación familiar</label>
          <select id="p-sit-familiar">
            ${['','Familia completa','Madre soltera','Padre soltero','Huérfano parcial','Huérfano total','Familia extendida','Tutela institucional','Otra'].map(s=>`<option value="${s}" ${p&&p.situacionFamiliar===s?'selected':''}>${s||'— selecciona —'}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label>Motivo de ingreso al programa</label>
          <textarea id="p-motivo" rows="2" placeholder="Describa brevemente el motivo…">${esc(p?p.motivoIngreso:'')}</textarea>
        </div>
        <div class="ficha-section-title" style="margin-top:14px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h20v7H2zM6 10v11M18 10v11M2 17h4M18 17h4"/></svg>
          Escolaridad
        </div>
        <div class="form-grid">
          <div class="form-group"><label>Nivel escolar</label>
            <select id="p-escolaridad">
              ${['','Preescolar','1° Primaria','2° Primaria','3° Primaria','4° Primaria','5° Primaria','6° Primaria','1° Secundaria','2° Secundaria','3° Secundaria','4° Secundaria','5° Secundaria','Sin escolarizar'].map(e=>`<option value="${e}" ${p&&p.escolaridad===e?'selected':''}>${e||'— selecciona —'}</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label>Colegio / Escuela</label><input type="text" id="p-colegio" value="${esc(p?p.colegio:'')}" placeholder="Nombre de la institución"></div>
        </div>
      </div>

      <!-- SECCIÓN PADRE/MADRE -->
      <div class="ficha-section" id="section-padre" style="${tipo==='padre'?'':'display:none'}">
        <div class="ficha-section-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          Datos del Hogar
        </div>
        <div class="form-grid">
          <div class="form-group"><label>Ocupación / Trabajo</label><input type="text" id="p-ocupacion" value="${esc(p?p.ocupacion:'')}" placeholder="Ej: Comerciante, Docente…"></div>
          <div class="form-group"><label>Ingreso familiar estimado</label>
            <select id="p-ingreso-familiar">
              ${['','Menos de $50','$50 - $100','$100 - $200','$200 - $400','Más de $400','Sin ingreso fijo'].map(v=>`<option value="${v}" ${p&&p.ingresoFamiliar===v?'selected':''}>${v||'— selecciona —'}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-group"><label>Hijos registrados en el programa</label><input type="number" id="p-num-hijos" value="${esc(p?p.numHijosPrograma:'')}" min="0" max="20" placeholder="Número de hijos en el programa"></div>
        <div class="form-group"><label>Situación familiar</label>
          <select id="p-sit-familiar-padre">
            ${['','Familia completa','Madre soltera','Padre soltero','Familia extendida','Familia reconstituida','Otra'].map(s=>`<option value="${s}" ${p&&p.situacionFamiliar===s?'selected':''}>${s||'— selecciona —'}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label>Observaciones del hogar</label>
          <textarea id="p-motivo-padre" rows="2" placeholder="Situación especial, necesidades del hogar…">${esc(p?p.motivoIngreso:'')}</textarea>
        </div>
      </div>

      <!-- SECCIÓN MISIONERO -->
      <div class="ficha-section" id="section-misionero" style="${tipo==='misionero'?'':'display:none'}">
        <div class="ficha-section-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
          Datos de Misión
        </div>
        <div class="form-group"><label>Organización / Iglesia de origen</label><input type="text" id="p-organizacion" value="${esc(p?p.organizacion:'')}" placeholder="Ej: Iglesia Bautista Central…"></div>
        <div class="form-grid">
          <div class="form-group"><label>País de origen</label><input type="text" id="p-pais" value="${esc(p?p.paisOrigen:'')}" placeholder="Ej: Colombia, España…"></div>
          <div class="form-group"><label>Rol / Cargo en misión</label><input type="text" id="p-ocupacion-mis" value="${esc(p?p.ocupacion:'')}" placeholder="Ej: Líder de misión, Maestro…"></div>
        </div>
        <div class="form-grid">
          <div class="form-group"><label>Tipo de misión</label>
            <select id="p-tipo-vinculo">
              ${['','Corto plazo (menos de 3 meses)','Mediano plazo (3-12 meses)','Largo plazo (más de 1 año)','Permanente'].map(v=>`<option value="${v}" ${p&&p.tipoVinculo===v?'selected':''}>${v||'— selecciona —'}</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label>Fecha fin de misión</label><input type="date" id="p-fecha-fin" value="${esc(p?p.fechaFin:'')}"></div>
        </div>
      </div>

      <!-- SECCIÓN VOLUNTARIO -->
      <div class="ficha-section" id="section-voluntario" style="${tipo==='voluntario'?'':'display:none'}">
        <div class="ficha-section-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0l-1 1-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>
          Datos de Voluntariado
        </div>
        <div class="form-group"><label>Organización que representa</label><input type="text" id="p-organizacion" value="${esc(p?p.organizacion:'')}" placeholder="Organización, universidad, empresa… (opcional)"></div>
        <div class="form-grid">
          <div class="form-group"><label>Área de servicio</label>
            <select id="p-area">
              ${['','Educación','Alimentación','Salud','Logística','Administración','Recreación','Comunicación','Construcción','Otra'].map(a=>`<option value="${a}" ${p&&p.areaServicio===a?'selected':''}>${a||'— selecciona —'}</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label>Disponibilidad</label>
            <select id="p-tipo-vinculo">
              ${['','Tiempo completo','Medio tiempo','Fines de semana','Esporádico'].map(v=>`<option value="${v}" ${p&&p.tipoVinculo===v?'selected':''}>${v||'— selecciona —'}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-group"><label>Fecha fin de voluntariado</label><input type="date" id="p-fecha-fin" value="${esc(p?p.fechaFin:'')}"></div>
        <div class="form-group"><label>Habilidades / Competencias</label>
          <textarea id="p-motivo-vol" rows="2" placeholder="Describe tus habilidades o lo que puedes aportar…">${esc(p?p.motivoIngreso:'')}</textarea>
        </div>
      </div>

      <!-- SECCIÓN STAFF -->
      <div class="ficha-section" id="section-staff" style="${tipo==='staff'?'':'display:none'}">
        <div class="ficha-section-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-4 0v2M8 7V5a2 2 0 0 0-4 0v2"/></svg>
          Datos Laborales
        </div>
        <div class="form-grid">
          <div class="form-group"><label>Cargo / Puesto</label><input type="text" id="p-ocupacion-sta" value="${esc(p?p.ocupacion:'')}" placeholder="Ej: Coordinador, Psicólogo…"></div>
          <div class="form-group"><label>Área / Departamento</label>
            <select id="p-area">
              ${['','Dirección','Administración','Trabajo social','Psicología','Educación','Salud','Logística','Comunicación','Otra'].map(a=>`<option value="${a}" ${p&&p.areaServicio===a?'selected':''}>${a||'— selecciona —'}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-grid">
          <div class="form-group"><label>Tipo de contrato</label>
            <select id="p-tipo-vinculo">
              ${['','Tiempo completo','Medio tiempo','Por horas','Honorarios','Voluntario remunerado'].map(v=>`<option value="${v}" ${p&&p.tipoVinculo===v?'selected':''}>${v||'— selecciona —'}</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label>Fecha fin de contrato</label><input type="date" id="p-fecha-fin" value="${esc(p?p.fechaFin:'')}"></div>
        </div>
      </div>

      <!-- SALUD (todos) -->
      <div class="ficha-section">
        <div class="ficha-section-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
          Salud
        </div>
        <div class="form-grid">
          <div class="form-group"><label>Grupo sanguíneo</label>
            <select id="p-sangre">
              ${['','A+','A-','B+','B-','AB+','AB-','O+','O-','Desconocido'].map(s=>`<option value="${s}" ${p&&p.grupoSanguineo===s?'selected':''}>${s||'— selecciona —'}</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label>Alergias conocidas</label><input type="text" id="p-alergias" value="${esc(p?p.alergias:'')}" placeholder="Ej: Polen, penicilina… o Ninguna"></div>
        </div>
        <div class="form-group"><label>Condición médica o discapacidad</label>
          <textarea id="p-medica" rows="2" placeholder="Condiciones relevantes o 'Ninguna'…">${esc(p?p.condicionMedica:'')}</textarea>
        </div>
      </div>

      <!-- OBSERVACIONES (todos) -->
      <div class="ficha-section">
        <div class="ficha-section-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>
          Observaciones generales
        </div>
        <textarea id="p-obs" rows="3" placeholder="Notas adicionales, seguimiento, situación especial…" style="width:100%;border:1px solid var(--border);border-radius:9px;padding:10px 13px;font-family:'Public Sans';font-size:14px;background:var(--bg);color:var(--ink);outline:none;resize:vertical;">${esc(p?p.observaciones:'')}</textarea>
      </div>

      <div class="modal-footer">
        <button class="btn btn-outline" onclick="UI.closeModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="PersonasModule.guardar()">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8M7 3v5h8"/></svg>
          Guardar ficha
        </button>
      </div>`, {wide:true});
  }

  /* ---------- GUARDAR ---------- */
  async function guardar() {
    const nombre = document.getElementById('p-nombre').value.trim();
    if (!nombre) { UI.toast('El nombre es obligatorio','error'); return; }

    const tipo    = document.getElementById('p-tipo').value;
    const estado  = document.getElementById('p-estado').value;
    const genero  = document.getElementById('p-genero').value;
    const ingreso = document.getElementById('p-ingreso').value;
    const inicial = nombre.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2);

    const tutorSel = document.getElementById('p-tutor-sel');
    const tutorInp = document.getElementById('p-tutor');
    const tutor = tutorSel
      ? (tutorSel.value==='__manual__' ? tutorInp?.value.trim() : tutorSel.value)
      : (tutorInp?.value.trim()||'');

    const _val = id => document.getElementById(id)?.value.trim()||'';
    const _num = id => parseInt(document.getElementById(id)?.value)||0;

    const datos = {
      nombre, tipo, estado, genero, ingreso, inicial, tutor,
      dni:              _val('p-dni'),
      fechaNacimiento:  _val('p-fnac'),
      edad:             _calcularEdad(_val('p-fnac')),
      nacionalidad:     _val('p-nac'),
      procedencia:      _val('p-proc'),
      prioridad:        document.getElementById('p-prioridad')?.value||'media',
      telefono:         _val('p-tel'),
      email:            _val('p-email'),
      direccion:        _val('p-dir'),
      barrio:           _val('p-barrio'),
      parentescoTutor:  document.getElementById('p-parentesco')?.value||'',
      telefonoTutor:    _val('p-tel-tutor'),
      situacionFamiliar:( document.getElementById('p-sit-familiar')?.value ||
                          document.getElementById('p-sit-familiar-padre')?.value || ''),
      motivoIngreso:    (_val('p-motivo') || _val('p-motivo-padre') ||
                         _val('p-motivo-vol')),
      escolaridad:      document.getElementById('p-escolaridad')?.value||'',
      colegio:          _val('p-colegio'),
      grupoSanguineo:   document.getElementById('p-sangre')?.value||'',
      alergias:         _val('p-alergias'),
      condicionMedica:  _val('p-medica'),
      observaciones:    _val('p-obs'),
      ocupacion:        (_val('p-ocupacion') || _val('p-ocupacion-mis') ||
                         _val('p-ocupacion-sta')),
      organizacion:     _val('p-organizacion'),
      paisOrigen:       _val('p-pais'),
      areaServicio:     document.getElementById('p-area')?.value||'',
      tipoVinculo:      document.getElementById('p-tipo-vinculo')?.value||'',
      fechaFin:         _val('p-fecha-fin'),
      ingresoFamiliar:  document.getElementById('p-ingreso-familiar')?.value||'',
      numHijosPrograma: _num('p-num-hijos'),
    };

    const btn = document.querySelector('.modal .btn-primary');
    if (btn) { btn.disabled=true; btn.textContent='Guardando…'; }

    if (_editId) {
      await DB.actualizarPersona(_editId, datos);
      UI.toast('Ficha actualizada correctamente');
    } else {
      const colores = [
        {bg:'#E0F0FF',fg:'#015a9e'},{bg:'#edfde0',fg:'#3d8a20'},
        {bg:'#EDE7FD',fg:'#6B4EEA'},{bg:'#fff6dc',fg:'#b07900'},
        {bg:'#ffe0e3',fg:'#c2001a'},
      ];
      const c = colores[Math.floor(Math.random()*colores.length)];
      await DB.agregarPersona({...datos, avatarBg:c.bg, avatarFg:c.fg});
      UI.toast('Persona registrada correctamente');
    }
    _editId = null;
    UI.closeModal();
  }

  function _calcularEdad(fechaNac) {
    if (!fechaNac) return '';
    const hoy = new Date(), nac = new Date(fechaNac + 'T00:00:00');
    let e = hoy.getFullYear() - nac.getFullYear();
    if (hoy.getMonth() - nac.getMonth() < 0 || (hoy.getMonth()===nac.getMonth() && hoy.getDate()<nac.getDate())) e--;
    return String(e);
  }

  /* ---------- FICHA ---------- */
  function verFicha(id) {
    const p = DB.personas.find(x=>x.id===id);
    if (!p) return;
    const asistHoy  = DB.asistencia.find(a=>a.personaId===id);
    const entregasP = DB.entregas.filter(e=>e.personaId===id);
    const tipoLabel = {nino:'Niño/a',padre:'Padre/Madre',misionero:'Misionero',voluntario:'Voluntario',staff:'Staff'}[p.tipo]||p.tipo;

    const fila = (label, valor) => valor
      ? `<div class="ficha-dato"><span class="ficha-dato-label">${esc(label)}</span><span class="ficha-dato-val">${esc(valor)}</span></div>`
      : '';
    const bloque = (titulo, contenido) => contenido.trim()
      ? `<div class="ficha-bloque"><div class="ficha-bloque-title">${titulo}</div>${contenido}</div>`
      : '';

    /* Sección específica por tipo */
    let seccionTipo = '';
    if (p.tipo==='nino') seccionTipo = bloque('👨‍👩‍👧 Familia / Tutor',
      fila('Tutor',p.tutor)+fila('Parentesco',p.parentescoTutor)+fila('Tel. tutor',p.telefonoTutor)+
      fila('Situación familiar',p.situacionFamiliar)+fila('Motivo de ingreso',p.motivoIngreso)
    ) + bloque('🏫 Escolaridad', fila('Nivel',p.escolaridad)+fila('Colegio',p.colegio));

    if (p.tipo==='padre') seccionTipo = bloque('🏠 Datos del Hogar',
      fila('Ocupación',p.ocupacion)+fila('Ingreso familiar',p.ingresoFamiliar)+
      fila('Hijos en programa',p.numHijosPrograma?String(p.numHijosPrograma):'')+
      fila('Situación familiar',p.situacionFamiliar)+fila('Observaciones',p.motivoIngreso)
    );

    if (p.tipo==='misionero') seccionTipo = bloque('🌍 Datos de Misión',
      fila('Organización',p.organizacion)+fila('País de origen',p.paisOrigen)+
      fila('Rol en misión',p.ocupacion)+fila('Tipo de misión',p.tipoVinculo)+
      fila('Fin de misión',p.fechaFin)
    );

    if (p.tipo==='voluntario') seccionTipo = bloque('💛 Datos de Voluntariado',
      fila('Organización',p.organizacion)+fila('Área de servicio',p.areaServicio)+
      fila('Disponibilidad',p.tipoVinculo)+fila('Fin de voluntariado',p.fechaFin)+
      fila('Habilidades',p.motivoIngreso)
    );

    if (p.tipo==='staff') seccionTipo = bloque('💼 Datos Laborales',
      fila('Cargo',p.ocupacion)+fila('Área',p.areaServicio)+
      fila('Tipo de contrato',p.tipoVinculo)+fila('Fin de contrato',p.fechaFin)
    );

    const avatarHtml = UI.avatarFoto(p.fotoUrl, p.inicial, p.avatarBg, p.avatarFg, p.nombre, 56);

    UI.modal(`
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:22px;padding-bottom:18px;border-bottom:1px solid var(--line);">
        ${avatarHtml}
        <div style="flex:1;">
          <h2 style="margin:0 0 4px;font-size:20px;">${esc(p.nombre)}</h2>
          <div style="font-size:13px;color:var(--muted);margin-bottom:6px;">${esc(tipoLabel)}${p.ocupacion?' · '+esc(p.ocupacion):''}</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">${UI.badgeTipo(p.tipo)} ${UI.badgeEstado(p.estado)} ${_badgePrioridad(p.prioridad)}</div>
        </div>
      </div>

      ${bloque('🪪 Identificación',
        fila('DNI / Cédula',p.dni)+fila('Fecha nacimiento',p.fechaNacimiento)+
        fila('Edad',p.edad?p.edad+' años':'')+fila('Género',p.genero==='F'?'Femenino':'Masculino')+
        fila('Nacionalidad',p.nacionalidad)+fila('Procedencia',p.procedencia)+
        fila('Ingreso al programa',p.ingreso)
      )}

      ${bloque('📞 Contacto y Ubicación',
        fila('Teléfono',p.telefono)+fila('Email',p.email)+
        fila('Dirección',p.direccion)+fila('Barrio / Sector',p.barrio)
      )}

      ${seccionTipo}

      ${bloque('🩸 Salud',
        fila('Grupo sanguíneo',p.grupoSanguineo)+fila('Alergias',p.alergias)+
        fila('Condición médica',p.condicionMedica)
      )}

      ${asistHoy ? bloque('📋 Asistencia hoy',
        `<div class="ficha-dato"><span class="ficha-dato-label">Estado</span>
         <span class="ficha-dato-val" style="color:${asistHoy.presente?'var(--success)':'var(--danger)'}">
           ${asistHoy.presente?'✓ Presente · '+asistHoy.hora:'✗ Ausente'}
         </span></div>`+
        (asistHoy.presente?fila('Método',asistHoy.metodo):'')
      ) : ''}

      ${entregasP.length ? bloque(`📦 Últimas entregas (${entregasP.length})`,
        entregasP.slice(0,4).map(e=>fila(e.fecha, e.articulo+' ×'+e.cantidad)).join('')
      ) : ''}

      ${p.observaciones ? bloque('📝 Observaciones',
        `<p style="margin:0;font-size:13.5px;color:var(--ink);line-height:1.6;">${esc(p.observaciones)}</p>`
      ) : ''}

      <div class="modal-footer">
        <button class="btn btn-outline" onclick="UI.closeModal()">Cerrar</button>
        <button class="btn btn-outline" onclick="UI.closeModal();PersonasModule.abrirFormulario(${p.id})">Editar</button>
        <button class="btn btn-outline" style="color:var(--danger);border-color:var(--danger);" onclick="UI.closeModal();PersonasModule.confirmarEliminar(${p.id},${esc(JSON.stringify(p.nombre))})">Eliminar</button>
        <button class="btn btn-primary" onclick="UI.closeModal();PersonasModule._registrarHuella(${p.id},${esc(JSON.stringify(p.nombre))},${p.zkUserId||'null'})">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22C6 22 2 17.5 2 12 2 6.5 6 2 12 2s10 4.5 10 10"/><path d="M12 18a6 6 0 0 1-6-6c0-3.3 2.7-6 6-6"/><path d="M12 14a2 2 0 0 1-2-2c0-1.1.9-2 2-2"/></svg>
          Registrar huella
        </button>
      </div>`, {wide:true});
  }

  function _registrarHuella(personaId, nombre, zkUserId) {
    if (!zkUserId) {
      UI.modal(`
        <h2>Registrar huella</h2>
        <div style="background:#fff6dc;border-radius:10px;padding:14px;font-size:13.5px;color:#b07900;margin-bottom:16px;">
          <b>${esc(nombre)}</b> aún no está registrado en el SF420.<br><br>
          Ve a <b>Asistencia → Usuarios del dispositivo → Agregar usuario</b> y luego regresa aquí.
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" onclick="UI.closeModal()">Cerrar</button>
          <button class="btn btn-primary" onclick="UI.closeModal();App.navigate('asistencia')">Ir a Asistencia</button>
        </div>`, {narrow:true});
      return;
    }
    App.navigate('asistencia');
    setTimeout(() => { if (window.AsistenciaModule) AsistenciaModule.abrirEnrollHuella(zkUserId, nombre); }, 350);
  }

  function confirmarEliminar(id, nombre) {
    UI.confirm(
      `¿Eliminar a <b>${esc(nombre)}</b>?<br><br>
       <span style="font-size:13px;color:var(--danger);">También se borrará del dispositivo Timmy y de yunatt
       (perderá su cara/huella registrada). Su historial de asistencia se conserva.</span>`,
      async () => {
        const ok = await DB.eliminarPersona(id);
        UI.toast(ok ? `"${esc(nombre)}" eliminado — borrándose del Timmy y yunatt…` : 'Error al eliminar',
                 ok ? 'success' : 'error');
      }
    );
  }

  window.PersonasModule = { setFilter, setSearch, abrirFormulario, guardar, verFicha,
                            confirmarEliminar, onTipoChange, onTutorSelect, _registrarHuella };
  return { render, onSearch };
})());
