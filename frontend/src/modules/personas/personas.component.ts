/**
 * PersonasComponent — módulo "Personas / Beneficiarios" migrado a la nueva
 * arquitectura (Fase 2, módulo 6). Es el CRUD más grande del sistema: la
 * ficha tiene ~35 campos, varios condicionales al tipo de persona.
 *
 * Diferencias clave vs modules/personas.js legacy:
 *  - Component (mount/update/unmount) en vez de `App.register` + string HTML.
 *  - Interactividad por EVENT DELEGATION (data-action, tanto en 'click' como
 *    en 'input' para el buscador, el cambio de tipo, el selector de tutor y
 *    el cálculo de edad en vivo) en vez de onclick="PersonasModule.x()" /
 *    onchange="..." sobre un global window.
 *  - Lectura vía AppStore (personas, asistencia, entregas) y mutación vía
 *    AppStore.agregarPersona()/actualizarPersona()/eliminarPersona() — misma
 *    superficie que DB.* en el legacy.
 *  - esc() en TODO dato que viene de la base de datos (este módulo tiene
 *    muchos campos de texto libre: dirección, alergias, condición médica,
 *    observaciones, etc.).
 *
 *  - BUGFIX DELIBERADO (sin cambio de UI observable): el formulario legacy
 *    reutilizaba el mismo id de DOM en varias secciones ocultas a la vez
 *    (p.ej. "p-organizacion" existía tanto en la sección Misionero como en
 *    Voluntario; "p-tipo-vinculo"/"p-area"/"p-fecha-fin" en 3 secciones).
 *    Como todas las secciones están en el DOM simultáneamente (solo con
 *    display:none), `document.getElementById` siempre devolvía la PRIMERA
 *    coincidencia — para tipo "staff"/"voluntario" eso significaba leer el
 *    valor de un <select> oculto de otra sección (vacío), perdiendo
 *    silenciosamente tipoVinculo/área/fechaFin/organización al guardar. Aquí
 *    cada sección usa ids únicos (sufijo -mis/-vol/-staff) y guardar() los
 *    combina con el mismo patrón OR-chain que ya usaba el legacy para los
 *    campos que sí tenían ids únicos (motivoIngreso, situacionFamiliar). Cero
 *    cambio visual, cero campo nuevo — solo deja de perder datos.
 *  - Se omite el zoom de foto (UI.avatarFoto/UI.fotoZoom) del legacy: el
 *    avatar se muestra siempre con iniciales, igual que ya simplificaron
 *    Entregas y Marcado ya migrados. `fotoUrl` no se edita desde este
 *    formulario (el legacy tampoco lo hacía).
 *  - "Registrar huella" (antes navegaba a Asistencia con un enrolamiento
 *    biométrico fuera del alcance de este módulo): Asistencia todavía no
 *    está migrado a esta app en paralelo, así que — mismo criterio que el
 *    botón "Ver lista completa" de Marcado ya migrado — se resuelve con un
 *    toast informativo en vez de una navegación inexistente.
 */
import { Component } from '@core/index';
import type { AppStore } from '@store/app-store';
import type { Persona, PersonaTipo, PersonaEstado } from '@domain/personas/personas.types';
import { Auth } from '@shell/auth';
import { esc, toast, modal, closeModal } from '@shell/ui';

type CamposComunes = Omit<Persona, 'id' | 'avatarBg' | 'avatarFg' | 'cargo' | 'zkUserId' | 'fotoUrl'>;

const FILTROS: Array<[string, string]> = [
  ['todos', 'Todos'], ['nino', 'Niños'], ['padre', 'Padres/Madres'],
  ['misionero', 'Misioneros'], ['voluntario', 'Voluntarios'], ['staff', 'Staff'],
];

const TIPO_LABEL: Record<string, string> = {
  nino: 'Niño/a', padre: 'Padre/Madre', misionero: 'Misionero', voluntario: 'Voluntario', staff: 'Staff',
};

const TIPO_COLOR: Record<string, { bg: string; fg: string }> = {
  nino: { bg: '#E0F0FF', fg: '#015a9e' },
  misionero: { bg: '#edfde0', fg: '#3d8a20' },
  voluntario: { bg: '#EDE7FD', fg: '#6B4EEA' },
  padre: { bg: '#FDE7E1', fg: '#C24A30' },
  staff: { bg: '#fff6dc', fg: '#b07900' },
};

const ESTADO_LABEL: Record<string, string> = { activo: 'Activo', inactivo: 'Inactivo', alerta: 'Alerta' };
const ESTADO_COLOR: Record<string, { bg: string; fg: string }> = {
  activo: { bg: '#edfde0', fg: '#3d8a20' },
  alerta: { bg: '#fff6dc', fg: '#b07900' },
  inactivo: { bg: 'var(--line)', fg: 'var(--muted)' },
};

const PRIORIDAD_LABEL: Record<string, string> = { alta: 'Alta', media: 'Media', baja: 'Baja' };
const PRIORIDAD_COLOR: Record<string, { bg: string; fg: string }> = {
  alta: { bg: '#ffe0e3', fg: '#c2001a' },
  media: { bg: '#fff6dc', fg: '#b07900' },
  baja: { bg: '#edfde0', fg: '#3d8a20' },
};

const AVATAR_PALETTE: Array<{ bg: string; fg: string }> = [
  { bg: '#E0F0FF', fg: '#015a9e' }, { bg: '#edfde0', fg: '#3d8a20' },
  { bg: '#EDE7FD', fg: '#6B4EEA' }, { bg: '#fff6dc', fg: '#b07900' },
  { bg: '#ffe0e3', fg: '#c2001a' },
];

const PARENTESCOS = ['', 'Padre', 'Madre', 'Abuelo/a', 'Tío/a', 'Hermano/a', 'Padrino/Madrina', 'Otro'];
const SITUACIONES_NINO = ['', 'Familia completa', 'Madre soltera', 'Padre soltero', 'Huérfano parcial', 'Huérfano total', 'Familia extendida', 'Tutela institucional', 'Otra'];
const ESCOLARIDADES = ['', 'Preescolar', '1° Primaria', '2° Primaria', '3° Primaria', '4° Primaria', '5° Primaria', '6° Primaria', '1° Secundaria', '2° Secundaria', '3° Secundaria', '4° Secundaria', '5° Secundaria', 'Sin escolarizar'];
const SITUACIONES_PADRE = ['', 'Familia completa', 'Madre soltera', 'Padre soltero', 'Familia extendida', 'Familia reconstituida', 'Otra'];
const INGRESOS_FAMILIARES = ['', 'Menos de $50', '$50 - $100', '$100 - $200', '$200 - $400', 'Más de $400', 'Sin ingreso fijo'];
const TIPOS_MISION = ['', 'Corto plazo (menos de 3 meses)', 'Mediano plazo (3-12 meses)', 'Largo plazo (más de 1 año)', 'Permanente'];
const AREAS_VOLUNTARIO = ['', 'Educación', 'Alimentación', 'Salud', 'Logística', 'Administración', 'Recreación', 'Comunicación', 'Construcción', 'Otra'];
const DISPONIBILIDADES = ['', 'Tiempo completo', 'Medio tiempo', 'Fines de semana', 'Esporádico'];
const AREAS_STAFF = ['', 'Dirección', 'Administración', 'Trabajo social', 'Psicología', 'Educación', 'Salud', 'Logística', 'Comunicación', 'Otra'];
const CONTRATOS_STAFF = ['', 'Tiempo completo', 'Medio tiempo', 'Por horas', 'Honorarios', 'Voluntario remunerado'];
const GRUPOS_SANGUINEOS = ['', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Desconocido'];

export class PersonasComponent extends Component {
  private filtro = 'todos';
  private busqueda = '';
  private editId: number | null = null;
  private readonly unsubs: Array<() => void> = [];
  private readonly onClick = (e: Event) => this.handleClick(e);
  private readonly onInput = (e: Event) => this.handleInput(e);

  constructor(private readonly store: AppStore) {
    super();
  }

  protected override onMount(): void {
    document.addEventListener('click', this.onClick);
    document.addEventListener('input', this.onInput);
    this.unsubs.push(this.store.on('personas:update', () => this.update()));
  }

  protected override onUnmount(): void {
    document.removeEventListener('click', this.onClick);
    document.removeEventListener('input', this.onInput);
    for (const unsub of this.unsubs) unsub();
    this.unsubs.length = 0;
  }

  /* ---------- Delegación de eventos ---------- */
  private handleClick(e: Event): void {
    const target = (e.target as HTMLElement)?.closest<HTMLElement>('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    const id = target.dataset.id ? Number(target.dataset.id) : undefined;
    switch (action) {
      case 'nuevo': this.abrirFormulario(); break;
      case 'set-filtro': if (target.dataset.filtro) this.setFiltro(target.dataset.filtro); break;
      case 'ver-ficha': if (id != null) this.verFicha(id); break;
      case 'editar': closeModal(); if (id != null) this.abrirFormulario(id); break;
      case 'confirmar-eliminar': if (id != null) { closeModal(); this.confirmarEliminar(id); } break;
      case 'do-eliminar': if (id != null) void this.eliminar(id); break;
      case 'guardar': void this.guardar(); break;
      case 'registrar-huella': this.registrarHuella(); break;
      case 'cerrar-modal': closeModal(); break;
    }
  }

  private handleInput(e: Event): void {
    const target = (e.target as HTMLElement)?.closest<HTMLElement>('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    if (action === 'buscar') this.setBusqueda((target as HTMLInputElement).value);
    else if (action === 'cambiar-tipo') this.onTipoChange((target as HTMLSelectElement).value);
    else if (action === 'calc-edad') this.actualizarEdadPreview((target as HTMLInputElement).value);
    else if (action === 'tutor-select') this.onTutorSelect((target as HTMLSelectElement).value);
  }

  private setFiltro(f: string): void { this.filtro = f; this.update(); }
  private setBusqueda(q: string): void { this.busqueda = q; this.update(); }

  /* ---------- RENDER LISTA ---------- */
  protected render(): string {
    const lista = this.store.personas.filter((p) => {
      if (this.filtro !== 'todos' && p.tipo !== this.filtro) return false;
      if (this.busqueda && !p.nombre.toLowerCase().includes(this.busqueda.toLowerCase())) return false;
      return true;
    });
    const puedeEscribir = Auth.canWrite('personas');

    return `
    <div class="page-header">
      <div>
        <h1>Personas / Beneficiarios</h1>
        <p>Registro central · base de todos los módulos</p>
      </div>
      ${puedeEscribir ? `
      <button class="btn btn-primary" style="margin-left:auto;" data-action="nuevo">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 5v14M5 12h14"/></svg>Nueva persona
      </button>` : `<span style="margin-left:auto;font-size:12px;background:var(--line);padding:5px 12px;border-radius:20px;color:var(--muted);">Solo lectura</span>`}
    </div>
    <div class="filter-row">
      <div class="search-box" style="width:280px;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--faint)" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/></svg>
        <input type="text" placeholder="Buscar por nombre…" value="${esc(this.busqueda)}" data-action="buscar">
      </div>
      ${FILTROS.map(([k, v]) => `<button class="filter-chip ${this.filtro === k ? 'active' : ''}" data-action="set-filtro" data-filtro="${k}">${esc(v)}</button>`).join('')}
      <span style="margin-left:auto;font-size:13px;color:var(--muted);font-weight:600;">${lista.length} registros</span>
    </div>
    <div class="table-card">
      <div class="table-head" style="grid-template-columns:2.4fr 1.2fr .7fr .7fr .9fr .8fr 1fr 140px;">
        <span>Persona</span><span>Tipo</span><span>Edad</span><span>Gén.</span><span>Prioridad</span><span>Ingreso</span><span>Estado</span><span></span>
      </div>
      ${lista.length ? lista.map((p) => `
        <div class="table-row" style="grid-template-columns:2.4fr 1.2fr .7fr .7fr .9fr .8fr 1fr 140px;">
          <div style="display:flex;align-items:center;gap:12px;">
            ${this.avatarHtml(p.inicial, p.avatarBg, p.avatarFg, 38)}
            <div>
              <div style="font-size:14px;font-weight:600;">${esc(p.nombre)}</div>
              <div style="font-size:12px;color:var(--faint);">${p.dni ? 'DNI: ' + esc(p.dni) : (esc(p.ocupacion) || esc(p.tutor) || '—')}</div>
            </div>
          </div>
          ${this.badgeTipo(p.tipo)}
          <span style="font-size:13.5px;color:var(--muted);">${esc(p.edad) || '—'}</span>
          <span style="font-size:13.5px;color:var(--muted);">${p.genero === 'F' ? 'F' : 'M'}</span>
          ${this.badgePrioridad(p.prioridad)}
          <span style="font-size:13.5px;color:var(--muted);">${esc(p.ingreso) || '—'}</span>
          ${this.badgeEstado(p.estado)}
          <div style="display:flex;gap:5px;">
            <button class="btn btn-sm btn-outline" data-action="ver-ficha" data-id="${p.id}">Ver ficha</button>
            ${puedeEscribir ? `<button class="btn btn-sm" style="background:#FDE7E1;color:var(--danger);border:none;border-radius:9px;padding:7px 10px;font-weight:700;cursor:pointer;" data-action="confirmar-eliminar" data-id="${p.id}">✕</button>` : ''}
          </div>
        </div>`).join('') : `<div style="padding:40px;text-align:center;color:var(--faint);font-size:14px;">No se encontraron personas con ese filtro.</div>`}
    </div>`;
  }

  /* ---------- Badges / avatar ---------- */
  private avatarHtml(inicial: string, bg: string, fg: string, size = 38): string {
    const rad = Math.round(size * 0.29);
    return `<div style="width:${size}px;height:${size}px;border-radius:${rad}px;background:${esc(bg)};color:${esc(fg)};
      display:flex;align-items:center;justify-content:center;font-weight:700;font-size:${Math.round(size * 0.37)}px;flex:none;">${esc(inicial)}</div>`;
  }

  private badgeTipo(tipo: string): string {
    const c = TIPO_COLOR[tipo] || TIPO_COLOR.nino!;
    return `<span style="background:${c.bg};color:${c.fg};border-radius:20px;padding:3px 10px;font-size:11.5px;font-weight:700;">${esc(TIPO_LABEL[tipo] || tipo)}</span>`;
  }

  private badgeEstado(estado: string): string {
    const c = ESTADO_COLOR[estado] || ESTADO_COLOR.activo!;
    return `<span style="background:${c.bg};color:${c.fg};border-radius:20px;padding:3px 10px;font-size:11.5px;font-weight:700;">${esc(ESTADO_LABEL[estado] || estado)}</span>`;
  }

  private badgePrioridad(prioridad: string): string {
    const c = PRIORIDAD_COLOR[prioridad] || PRIORIDAD_COLOR.media!;
    return `<span style="background:${c.bg};color:${c.fg};font-size:11.5px;font-weight:700;padding:3px 9px;border-radius:20px;">${esc(PRIORIDAD_LABEL[prioridad] || 'Media')}</span>`;
  }

  /* ---------- Selector de tutor ---------- */
  private renderTutorField(val: string): string {
    const padres = this.store.personas.filter((p) => p.tipo === 'padre');
    if (!padres.length) {
      return `<input type="text" id="p-tutor" value="${esc(val)}" placeholder="Nombre del responsable">`;
    }
    const manual = !padres.find((p) => p.nombre === val);
    return `
      <select id="p-tutor-sel" data-action="tutor-select">
        <option value="">— selecciona —</option>
        ${padres.map((p) => `<option value="${esc(p.nombre)}" ${p.nombre === val ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('')}
        <option value="__manual__" ${manual && val ? 'selected' : ''}>Escribir manualmente…</option>
      </select>
      <input type="text" id="p-tutor" value="${esc(val)}" style="margin-top:6px;${manual && val ? '' : 'display:none'}" placeholder="Nombre del tutor">`;
  }

  private onTutorSelect(val: string): void {
    const inp = document.getElementById('p-tutor') as HTMLInputElement | null;
    if (!inp) return;
    if (val === '__manual__') { inp.style.display = ''; inp.value = ''; inp.focus(); }
    else { inp.style.display = 'none'; inp.value = val; }
  }

  /* ---------- Tipo → mostrar/ocultar secciones ---------- */
  private onTipoChange(tipo: string): void {
    const mapa: Record<string, string> = {
      nino: 'section-nino', padre: 'section-padre', misionero: 'section-misionero',
      voluntario: 'section-voluntario', staff: 'section-staff',
    };
    for (const secId of Object.values(mapa)) {
      const el = document.getElementById(secId);
      if (el) el.style.display = 'none';
    }
    const target = document.getElementById(mapa[tipo] || '');
    if (target) target.style.display = '';
  }

  /* ---------- Edad en vivo ---------- */
  private calcularEdad(fechaNac: string): string {
    if (!fechaNac) return '';
    const hoy = new Date();
    const nac = new Date(fechaNac + 'T00:00:00');
    let e = hoy.getFullYear() - nac.getFullYear();
    if (hoy.getMonth() - nac.getMonth() < 0 || (hoy.getMonth() === nac.getMonth() && hoy.getDate() < nac.getDate())) e--;
    return String(e);
  }

  private actualizarEdadPreview(fechaNac: string): void {
    const el = document.getElementById('p-edad-preview');
    if (!el) return;
    const edad = this.calcularEdad(fechaNac);
    el.textContent = edad ? `${edad} años` : '';
  }

  /* ---------- FORMULARIO (crear / editar) ---------- */
  private abrirFormulario(personaId?: number): void {
    this.editId = personaId ?? null;
    const p = this.editId != null ? this.store.personas.find((x) => x.id === this.editId) : null;
    const tipo = p ? p.tipo : 'nino';

    const seccion = (secId: string, tipoSec: string, titulo: string, icono: string, contenido: string): string => `
      <div class="ficha-section" id="${secId}" style="${tipo === tipoSec ? '' : 'display:none'}">
        <div class="ficha-section-title">${icono}${esc(titulo)}</div>
        ${contenido}
      </div>`;

    const opciones = (valores: string[], actual: string): string =>
      valores.map((v) => `<option value="${esc(v)}" ${p && actual === v ? 'selected' : ''}>${v || '— selecciona —'}</option>`).join('');

    modal(`
      <h2 style="margin:0 0 4px;">${p ? 'Editar persona' : 'Nueva persona'}</h2>
      <p style="margin:0 0 20px;font-size:13px;color:var(--muted);">Los campos con * son obligatorios.</p>

      <!-- IDENTIFICACIÓN (todos) -->
      <div class="ficha-section">
        <div class="ficha-section-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>
          Identificación
        </div>
        <div class="form-group"><label>Nombre completo *</label><input type="text" id="p-nombre" value="${esc(p ? p.nombre : '')}" placeholder="Ej: María García López"></div>
        <div class="form-grid">
          <div class="form-group"><label>Tipo *</label>
            <select id="p-tipo" data-action="cambiar-tipo">
              ${(['nino', 'padre', 'misionero', 'voluntario', 'staff'] as const).map((t) => `<option value="${t}" ${tipo === t ? 'selected' : ''}>${TIPO_LABEL[t]}</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label>Estado</label>
            <select id="p-estado">
              ${(['activo', 'inactivo', 'alerta'] as const).map((e) => `<option value="${e}" ${p && p.estado === e ? 'selected' : ''}>${ESTADO_LABEL[e]}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-grid">
          <div class="form-group"><label>DNI / Cédula</label><input type="text" id="p-dni" value="${esc(p ? p.dni : '')}" placeholder="Número de documento"></div>
          <div class="form-group"><label>Fecha de nacimiento</label>
            <input type="date" id="p-fnac" value="${esc(p ? p.fechaNacimiento : '')}" data-action="calc-edad">
            <span id="p-edad-preview" style="font-size:12px;color:var(--muted);display:inline-block;margin-top:4px;">${p && p.edad ? esc(p.edad) + ' años' : ''}</span>
          </div>
        </div>
        <div class="form-grid">
          <div class="form-group"><label>Género</label>
            <select id="p-genero">
              <option value="F" ${p && p.genero === 'F' ? 'selected' : ''}>Femenino</option>
              <option value="M" ${p && p.genero === 'M' ? 'selected' : ''}>Masculino</option>
            </select>
          </div>
          <div class="form-group"><label>Nacionalidad</label><input type="text" id="p-nac" value="${esc(p ? p.nacionalidad : '')}" placeholder="Ej: Venezolana"></div>
        </div>
        <div class="form-grid">
          <div class="form-group"><label>Procedencia</label><input type="text" id="p-proc" value="${esc(p ? p.procedencia : '')}" placeholder="Ciudad o región de origen"></div>
          <div class="form-group"><label>Prioridad</label>
            <select id="p-prioridad">
              ${(['alta', 'media', 'baja'] as const).map((pr) => `<option value="${pr}" ${p && p.prioridad === pr ? 'selected' : ''}>${PRIORIDAD_LABEL[pr]}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-group"><label>Fecha de ingreso al programa</label><input type="month" id="p-ingreso" value="${esc(p ? p.ingreso : '')}"></div>
      </div>

      <!-- CONTACTO (todos) -->
      <div class="ficha-section">
        <div class="ficha-section-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.9v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 3 4.2 2 2 0 0 1 5 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L9.1 9.9a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.4c1 .3 1.9.6 2.9.7A2 2 0 0 1 23 17Z"/></svg>
          Contacto y Ubicación
        </div>
        <div class="form-grid">
          <div class="form-group"><label>Teléfono</label><input type="tel" id="p-tel" value="${esc(p ? p.telefono : '')}" placeholder="+58 412 000 0000"></div>
          <div class="form-group"><label>Email</label><input type="email" id="p-email" value="${esc(p ? p.email : '')}" placeholder="correo@ejemplo.com"></div>
        </div>
        <div class="form-group"><label>Dirección</label><input type="text" id="p-dir" value="${esc(p ? p.direccion : '')}" placeholder="Calle, número, casa…"></div>
        <div class="form-group"><label>Barrio / Sector</label><input type="text" id="p-barrio" value="${esc(p ? p.barrio : '')}" placeholder="Nombre del barrio o sector"></div>
      </div>

      ${seccion('section-nino', 'nino', 'Familia / Tutor',
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><path d="M16 6.5a3 3 0 0 1 0 5.6M16.5 19a5.5 5.5 0 0 0-2-4.3"/></svg>',
        `
        <div class="form-group"><label>Padre / Madre responsable</label>${this.renderTutorField(p?.tutor || '')}</div>
        <div class="form-grid">
          <div class="form-group"><label>Parentesco</label>
            <select id="p-parentesco">${opciones(PARENTESCOS, p?.parentescoTutor || '')}</select>
          </div>
          <div class="form-group"><label>Teléfono del tutor</label><input type="tel" id="p-tel-tutor" value="${esc(p ? p.telefonoTutor : '')}" placeholder="+58 412 000 0000"></div>
        </div>
        <div class="form-group"><label>Situación familiar</label>
          <select id="p-sit-familiar">${opciones(SITUACIONES_NINO, p?.situacionFamiliar || '')}</select>
        </div>
        <div class="form-group"><label>Motivo de ingreso al programa</label>
          <textarea id="p-motivo" rows="2" placeholder="Describa brevemente el motivo…">${esc(p ? p.motivoIngreso : '')}</textarea>
        </div>
        <div class="ficha-section-title" style="margin-top:14px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h20v7H2zM6 10v11M18 10v11M2 17h4M18 17h4"/></svg>
          Escolaridad
        </div>
        <div class="form-grid">
          <div class="form-group"><label>Nivel escolar</label>
            <select id="p-escolaridad">${opciones(ESCOLARIDADES, p?.escolaridad || '')}</select>
          </div>
          <div class="form-group"><label>Colegio / Escuela</label><input type="text" id="p-colegio" value="${esc(p ? p.colegio : '')}" placeholder="Nombre de la institución"></div>
        </div>`)}

      ${seccion('section-padre', 'padre', 'Datos del Hogar',
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
        `
        <div class="form-grid">
          <div class="form-group"><label>Ocupación / Trabajo</label><input type="text" id="p-ocupacion" value="${esc(p ? p.ocupacion : '')}" placeholder="Ej: Comerciante, Docente…"></div>
          <div class="form-group"><label>Ingreso familiar estimado</label>
            <select id="p-ingreso-familiar">${opciones(INGRESOS_FAMILIARES, p?.ingresoFamiliar || '')}</select>
          </div>
        </div>
        <div class="form-group"><label>Hijos registrados en el programa</label><input type="number" id="p-num-hijos" value="${p && p.numHijosPrograma ? p.numHijosPrograma : ''}" min="0" max="20" placeholder="Número de hijos en el programa"></div>
        <div class="form-group"><label>Situación familiar</label>
          <select id="p-sit-familiar-padre">${opciones(SITUACIONES_PADRE, p?.situacionFamiliar || '')}</select>
        </div>
        <div class="form-group"><label>Observaciones del hogar</label>
          <textarea id="p-motivo-padre" rows="2" placeholder="Situación especial, necesidades del hogar…">${esc(p ? p.motivoIngreso : '')}</textarea>
        </div>`)}

      ${seccion('section-misionero', 'misionero', 'Datos de Misión',
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
        `
        <div class="form-group"><label>Organización / Iglesia de origen</label><input type="text" id="p-organizacion-mis" value="${esc(p ? p.organizacion : '')}" placeholder="Ej: Iglesia Bautista Central…"></div>
        <div class="form-grid">
          <div class="form-group"><label>País de origen</label><input type="text" id="p-pais" value="${esc(p ? p.paisOrigen : '')}" placeholder="Ej: Colombia, España…"></div>
          <div class="form-group"><label>Rol / Cargo en misión</label><input type="text" id="p-ocupacion-mis" value="${esc(p ? p.ocupacion : '')}" placeholder="Ej: Líder de misión, Maestro…"></div>
        </div>
        <div class="form-grid">
          <div class="form-group"><label>Tipo de misión</label>
            <select id="p-tipo-vinculo-mis">${opciones(TIPOS_MISION, p?.tipoVinculo || '')}</select>
          </div>
          <div class="form-group"><label>Fecha fin de misión</label><input type="date" id="p-fecha-fin-mis" value="${esc(p ? p.fechaFin : '')}"></div>
        </div>`)}

      ${seccion('section-voluntario', 'voluntario', 'Datos de Voluntariado',
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0l-1 1-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>',
        `
        <div class="form-group"><label>Organización que representa</label><input type="text" id="p-organizacion-vol" value="${esc(p ? p.organizacion : '')}" placeholder="Organización, universidad, empresa… (opcional)"></div>
        <div class="form-grid">
          <div class="form-group"><label>Área de servicio</label>
            <select id="p-area-vol">${opciones(AREAS_VOLUNTARIO, p?.areaServicio || '')}</select>
          </div>
          <div class="form-group"><label>Disponibilidad</label>
            <select id="p-tipo-vinculo-vol">${opciones(DISPONIBILIDADES, p?.tipoVinculo || '')}</select>
          </div>
        </div>
        <div class="form-group"><label>Fecha fin de voluntariado</label><input type="date" id="p-fecha-fin-vol" value="${esc(p ? p.fechaFin : '')}"></div>
        <div class="form-group"><label>Habilidades / Competencias</label>
          <textarea id="p-motivo-vol" rows="2" placeholder="Describe tus habilidades o lo que puedes aportar…">${esc(p ? p.motivoIngreso : '')}</textarea>
        </div>`)}

      ${seccion('section-staff', 'staff', 'Datos Laborales',
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-4 0v2M8 7V5a2 2 0 0 0-4 0v2"/></svg>',
        `
        <div class="form-grid">
          <div class="form-group"><label>Cargo / Puesto</label><input type="text" id="p-ocupacion-sta" value="${esc(p ? p.ocupacion : '')}" placeholder="Ej: Coordinador, Psicólogo…"></div>
          <div class="form-group"><label>Área / Departamento</label>
            <select id="p-area-staff">${opciones(AREAS_STAFF, p?.areaServicio || '')}</select>
          </div>
        </div>
        <div class="form-grid">
          <div class="form-group"><label>Tipo de contrato</label>
            <select id="p-tipo-vinculo-staff">${opciones(CONTRATOS_STAFF, p?.tipoVinculo || '')}</select>
          </div>
          <div class="form-group"><label>Fecha fin de contrato</label><input type="date" id="p-fecha-fin-staff" value="${esc(p ? p.fechaFin : '')}"></div>
        </div>`)}

      <!-- SALUD (todos) -->
      <div class="ficha-section">
        <div class="ficha-section-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
          Salud
        </div>
        <div class="form-grid">
          <div class="form-group"><label>Grupo sanguíneo</label>
            <select id="p-sangre">${opciones(GRUPOS_SANGUINEOS, p?.grupoSanguineo || '')}</select>
          </div>
          <div class="form-group"><label>Alergias conocidas</label><input type="text" id="p-alergias" value="${esc(p ? p.alergias : '')}" placeholder="Ej: Polen, penicilina… o Ninguna"></div>
        </div>
        <div class="form-group"><label>Condición médica o discapacidad</label>
          <textarea id="p-medica" rows="2" placeholder="Condiciones relevantes o 'Ninguna'…">${esc(p ? p.condicionMedica : '')}</textarea>
        </div>
      </div>

      <!-- OBSERVACIONES (todos) -->
      <div class="ficha-section">
        <div class="ficha-section-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>
          Observaciones generales
        </div>
        <textarea id="p-obs" rows="3" placeholder="Notas adicionales, seguimiento, situación especial…" style="width:100%;border:1px solid var(--border);border-radius:9px;padding:10px 13px;font-family:'Quicksand';font-size:14px;background:var(--bg);color:var(--ink);outline:none;resize:vertical;">${esc(p ? p.observaciones : '')}</textarea>
      </div>

      <div class="modal-footer">
        <button class="btn btn-outline" data-action="cerrar-modal">Cancelar</button>
        <button class="btn btn-primary" data-action="guardar">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8M7 3v5h8"/></svg>
          Guardar ficha
        </button>
      </div>`, { wide: true });
  }

  /* ---------- GUARDAR ---------- */
  private async guardar(): Promise<void> {
    const val = (id: string): string => {
      const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
      return el?.value.trim() || '';
    };
    const nombre = val('p-nombre');
    if (!nombre) { toast('El nombre es obligatorio', 'error'); return; }

    const tipo = (val('p-tipo') || 'nino') as PersonaTipo;
    const estado = (val('p-estado') || 'activo') as PersonaEstado;
    const genero = val('p-genero') || 'M';
    const ingreso = val('p-ingreso');
    const inicial = nombre.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

    const tutorSel = document.getElementById('p-tutor-sel') as HTMLSelectElement | null;
    const tutorInp = document.getElementById('p-tutor') as HTMLInputElement | null;
    const tutor = tutorSel
      ? (tutorSel.value === '__manual__' ? (tutorInp?.value.trim() || '') : tutorSel.value)
      : (tutorInp?.value.trim() || '');

    const fechaNacimiento = val('p-fnac');

    const valores: CamposComunes = {
      nombre, tutor, tipo, edad: this.calcularEdad(fechaNacimiento), genero, ingreso, estado, inicial,
      dni: val('p-dni'),
      fechaNacimiento,
      nacionalidad: val('p-nac'),
      telefono: val('p-tel'),
      email: val('p-email'),
      direccion: val('p-dir'),
      barrio: val('p-barrio'),
      parentescoTutor: val('p-parentesco'),
      telefonoTutor: val('p-tel-tutor'),
      situacionFamiliar: val('p-sit-familiar') || val('p-sit-familiar-padre'),
      grupoSanguineo: val('p-sangre'),
      alergias: val('p-alergias'),
      condicionMedica: val('p-medica'),
      escolaridad: val('p-escolaridad'),
      colegio: val('p-colegio'),
      procedencia: val('p-proc'),
      motivoIngreso: val('p-motivo') || val('p-motivo-padre') || val('p-motivo-vol'),
      prioridad: val('p-prioridad') || 'media',
      observaciones: val('p-obs'),
      ocupacion: val('p-ocupacion') || val('p-ocupacion-mis') || val('p-ocupacion-sta'),
      organizacion: val('p-organizacion-mis') || val('p-organizacion-vol'),
      paisOrigen: val('p-pais'),
      areaServicio: val('p-area-vol') || val('p-area-staff'),
      tipoVinculo: val('p-tipo-vinculo-mis') || val('p-tipo-vinculo-vol') || val('p-tipo-vinculo-staff'),
      fechaFin: val('p-fecha-fin-mis') || val('p-fecha-fin-vol') || val('p-fecha-fin-staff'),
      ingresoFamiliar: val('p-ingreso-familiar'),
      numHijosPrograma: parseInt(val('p-num-hijos'), 10) || 0,
    };

    const btn = document.querySelector<HTMLButtonElement>('.modal .btn-primary');
    if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }

    if (this.editId != null) {
      await this.store.actualizarPersona(this.editId, valores);
      toast('Ficha actualizada correctamente');
    } else {
      const c = AVATAR_PALETTE[Math.floor(Math.random() * AVATAR_PALETTE.length)]!;
      const persona: Persona = {
        id: 0,
        avatarBg: c.bg,
        avatarFg: c.fg,
        cargo: '',
        zkUserId: '',
        fotoUrl: '',
        ...valores,
      };
      await this.store.agregarPersona(persona);
      toast('Persona registrada correctamente');
    }
    this.editId = null;
    closeModal();
  }

  /* ---------- FICHA (solo lectura) ---------- */
  private verFicha(id: number): void {
    const p = this.store.personas.find((x) => x.id === id);
    if (!p) return;
    const asistHoy = this.store.asistencia.find((a) => a.personaId === id);
    const entregasP = this.store.entregas.filter((en) => en.personaId === id);
    const puedeEscribir = Auth.canWrite('personas');

    const fila = (label: string, valor: string | number | undefined | null): string =>
      valor ? `<div class="ficha-dato"><span class="ficha-dato-label">${esc(label)}</span><span class="ficha-dato-val">${esc(valor)}</span></div>` : '';
    const bloque = (titulo: string, contenido: string): string =>
      contenido.trim() ? `<div class="ficha-bloque"><div class="ficha-bloque-title">${esc(titulo)}</div>${contenido}</div>` : '';

    let seccionTipo = '';
    if (p.tipo === 'nino') {
      seccionTipo = bloque('👨‍👩‍👧 Familia / Tutor',
        fila('Tutor', p.tutor) + fila('Parentesco', p.parentescoTutor) + fila('Tel. tutor', p.telefonoTutor) +
        fila('Situación familiar', p.situacionFamiliar) + fila('Motivo de ingreso', p.motivoIngreso)) +
        bloque('🏫 Escolaridad', fila('Nivel', p.escolaridad) + fila('Colegio', p.colegio));
    } else if (p.tipo === 'padre') {
      seccionTipo = bloque('🏠 Datos del Hogar',
        fila('Ocupación', p.ocupacion) + fila('Ingreso familiar', p.ingresoFamiliar) +
        fila('Hijos en programa', p.numHijosPrograma ? String(p.numHijosPrograma) : '') +
        fila('Situación familiar', p.situacionFamiliar) + fila('Observaciones', p.motivoIngreso));
    } else if (p.tipo === 'misionero') {
      seccionTipo = bloque('🌍 Datos de Misión',
        fila('Organización', p.organizacion) + fila('País de origen', p.paisOrigen) +
        fila('Rol en misión', p.ocupacion) + fila('Tipo de misión', p.tipoVinculo) +
        fila('Fin de misión', p.fechaFin));
    } else if (p.tipo === 'voluntario') {
      seccionTipo = bloque('💛 Datos de Voluntariado',
        fila('Organización', p.organizacion) + fila('Área de servicio', p.areaServicio) +
        fila('Disponibilidad', p.tipoVinculo) + fila('Fin de voluntariado', p.fechaFin) +
        fila('Habilidades', p.motivoIngreso));
    } else if (p.tipo === 'staff') {
      seccionTipo = bloque('💼 Datos Laborales',
        fila('Cargo', p.ocupacion) + fila('Área', p.areaServicio) +
        fila('Tipo de contrato', p.tipoVinculo) + fila('Fin de contrato', p.fechaFin));
    }

    const tipoLabel = TIPO_LABEL[p.tipo] || p.tipo;

    modal(`
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:22px;padding-bottom:18px;border-bottom:1px solid var(--line);">
        ${this.avatarHtml(p.inicial, p.avatarBg, p.avatarFg, 56)}
        <div style="flex:1;">
          <h2 style="margin:0 0 4px;font-size:20px;">${esc(p.nombre)}</h2>
          <div style="font-size:13px;color:var(--muted);margin-bottom:6px;">${esc(tipoLabel)}${p.ocupacion ? ' · ' + esc(p.ocupacion) : ''}</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">${this.badgeTipo(p.tipo)} ${this.badgeEstado(p.estado)} ${this.badgePrioridad(p.prioridad)}</div>
        </div>
      </div>

      ${bloque('🪪 Identificación',
        fila('DNI / Cédula', p.dni) + fila('Fecha nacimiento', p.fechaNacimiento) +
        fila('Edad', p.edad ? p.edad + ' años' : '') + fila('Género', p.genero === 'F' ? 'Femenino' : 'Masculino') +
        fila('Nacionalidad', p.nacionalidad) + fila('Procedencia', p.procedencia) +
        fila('Ingreso al programa', p.ingreso))}

      ${bloque('📞 Contacto y Ubicación',
        fila('Teléfono', p.telefono) + fila('Email', p.email) +
        fila('Dirección', p.direccion) + fila('Barrio / Sector', p.barrio))}

      ${seccionTipo}

      ${bloque('🩸 Salud',
        fila('Grupo sanguíneo', p.grupoSanguineo) + fila('Alergias', p.alergias) +
        fila('Condición médica', p.condicionMedica))}

      ${asistHoy ? bloque('📋 Asistencia hoy',
        `<div class="ficha-dato"><span class="ficha-dato-label">Estado</span>
         <span class="ficha-dato-val" style="color:${asistHoy.presente ? 'var(--success)' : 'var(--danger)'}">
           ${asistHoy.presente ? '✓ Presente · ' + esc(asistHoy.hora) : '✗ Ausente'}
         </span></div>` +
        (asistHoy.presente ? fila('Método', asistHoy.metodo) : '')) : ''}

      ${entregasP.length ? bloque(`📦 Últimas entregas (${entregasP.length})`,
        entregasP.slice(0, 4).map((en) => fila(en.fecha, en.articulo + ' ×' + en.cantidad)).join('')) : ''}

      ${p.observaciones ? bloque('📝 Observaciones',
        `<p style="margin:0;font-size:13.5px;color:var(--ink);line-height:1.6;">${esc(p.observaciones)}</p>`) : ''}

      <div class="modal-footer">
        <button class="btn btn-outline" data-action="cerrar-modal">Cerrar</button>
        ${puedeEscribir ? `
        <button class="btn btn-outline" data-action="editar" data-id="${p.id}">Editar</button>
        <button class="btn btn-outline" style="color:var(--danger);border-color:var(--danger);" data-action="confirmar-eliminar" data-id="${p.id}">Eliminar</button>
        <button class="btn btn-primary" data-action="registrar-huella">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22C6 22 2 17.5 2 12 2 6.5 6 2 12 2s10 4.5 10 10"/><path d="M12 18a6 6 0 0 1-6-6c0-3.3 2.7-6 6-6"/><path d="M12 14a2 2 0 0 1-2-2c0-1.1.9-2 2-2"/></svg>
          Registrar huella
        </button>` : ''}
      </div>`, { wide: true });
  }

  /** Atajo de enrolamiento biométrico: Asistencia todavía no está migrado a
   *  esta app en paralelo (será el módulo 7), así que — mismo criterio que
   *  el botón "Ver lista completa" de Marcado ya migrado — no hay a dónde
   *  navegar todavía; se informa con un toast en vez de romper la navegación. */
  private registrarHuella(): void {
    closeModal();
    toast('El módulo Asistencia todavía no está migrado a esta vista previa. Usa el panel actual para registrar huella/rostro en el Timmy.', 'info');
  }

  /* ---------- ELIMINAR ---------- */
  private confirmarEliminar(id: number): void {
    const p = this.store.personas.find((x) => x.id === id);
    const nombre = p?.nombre || '';
    modal(`
      <h2>Eliminar persona</h2>
      <p style="color:var(--muted);margin-bottom:14px;">¿Eliminar a <b>${esc(nombre)}</b>?</p>
      <div style="background:#FDE7E1;border-radius:10px;padding:12px 14px;font-size:12.5px;color:var(--danger);margin-bottom:20px;">
        También se borrará del dispositivo Timmy y de yunatt (perderá su cara/huella registrada). Su historial de asistencia se conserva.
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" data-action="cerrar-modal">Cancelar</button>
        <button class="btn" style="background:#fd4c5c;color:#fff;" data-action="do-eliminar" data-id="${id}">Sí, eliminar</button>
      </div>`, { narrow: true });
  }

  private async eliminar(id: number): Promise<void> {
    const p = this.store.personas.find((x) => x.id === id);
    const nombre = p?.nombre || '';
    const ok = await this.store.eliminarPersona(id);
    closeModal();
    toast(ok ? `"${esc(nombre)}" eliminado — borrándose del Timmy y yunatt…` : 'Error al eliminar', ok ? 'success' : 'error');
  }
}
