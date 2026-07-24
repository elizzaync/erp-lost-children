/**
 * UsuariosComponent — módulo "Gestión de usuarios" migrado a la nueva
 * arquitectura (piloto de la Fase 2).
 *
 * Diferencias clave vs modules/usuarios.js legacy:
 *  - Es una subclase de Component (mount/update/unmount estandarizado).
 *  - Interactividad por EVENT DELEGATION (atributos data-action) en vez de
 *    handlers inline onclick="UsuariosModule.x()" sobre un global window. Un
 *    único listener en document despacha por data-action (cubre tabla y modal).
 *  - Datos vía UsuariosRepository (ApiClient tipado), no fetch suelto.
 *  - esc() aplicado a todo dato de usuario (disciplina anti-XSS).
 */
import { Component } from '@core/index';
import type { ApiClient } from '@core/index';
import { UsuariosRepository } from '@domain/usuarios/usuarios.repository';
import type { Usuario } from '@domain/usuarios/usuarios.types';
import { Auth } from '@shell/auth';
import { esc, modal, closeModal, toast, loadingHtml } from '@shell/ui';

const ROLES: Array<{ value: string; label: string }> = [
  { value: 'admin', label: 'Administrador' },
  { value: 'coordinador', label: 'Coordinador/a' },
  { value: 'voluntario', label: 'Voluntario/a' },
];

const ROL_COLORS: Record<string, { bg: string; fg: string }> = {
  admin: { bg: '#FDDEE0', fg: '#c2001a' },
  coordinador: { bg: '#D9EEF9', fg: '#0176bf' },
  voluntario: { bg: '#DFF5E6', fg: '#1D7A56' },
};

const ROL_DESC: Record<string, string> = {
  admin: 'Acceso total al sistema',
  coordinador: 'Todo excepto gestión de usuarios',
  voluntario: 'Asistencia (marcar) y almacén (ver)',
};

export class UsuariosComponent extends Component {
  private readonly repo: UsuariosRepository;
  private usuarios: Usuario[] = [];
  private cargando = false;
  private loaded = false;
  private readonly onClick = (e: Event) => this.handleClick(e);

  constructor(api: ApiClient) {
    super();
    this.repo = new UsuariosRepository(api);
  }

  protected override onMount(): void {
    document.addEventListener('click', this.onClick);
    void this.cargar();
  }

  protected override onUnmount(): void {
    document.removeEventListener('click', this.onClick);
  }

  private async cargar(): Promise<void> {
    if (this.cargando) return;
    this.cargando = true;
    this.loaded = false;
    const data = await this.repo.list();
    if (data) {
      this.usuarios = data;
    } else {
      this.usuarios = [];
      toast('Sin acceso o error del servidor', 'error');
    }
    this.cargando = false;
    this.loaded = true;
    this.update(); // re-render desde el estado ya cargado
  }

  protected render(): string {
    if (this.cargando || !this.loaded) return loadingHtml('Cargando usuarios…');
    const yo = Auth.getUser();
    const n = this.usuarios.length;

    return `
    <div class="page-header">
      <div>
        <h1>Gestión de Usuarios</h1>
        <p>Cuentas de acceso al sistema · ${n} usuario${n !== 1 ? 's' : ''} registrado${n !== 1 ? 's' : ''}</p>
      </div>
      <button class="btn btn-primary" style="margin-left:auto;" data-action="nuevo">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 5v14M5 12h14"/></svg>
        Nuevo usuario
      </button>
    </div>

    <div class="table-card">
      <div class="table-head" style="grid-template-columns:2fr 1.2fr 1.4fr 1fr 110px;">
        <span>Nombre</span><span>Usuario</span><span>Rol</span><span>Estado</span><span></span>
      </div>
      ${n ? this.usuarios.map((u) => this.filaHtml(u, yo.username)).join('')
          : `<div style="padding:40px;text-align:center;color:var(--muted);">No hay usuarios registrados.</div>`}
    </div>

    <div style="margin-top:20px;display:flex;flex-wrap:wrap;gap:10px;">
      ${ROLES.map((r) => {
        const c = ROL_COLORS[r.value] || { bg: '#e8e8e8', fg: '#555' };
        return `<div style="background:${c.bg};border-radius:12px;padding:10px 16px;min-width:180px;">
          <div style="font-size:12px;font-weight:800;color:${c.fg};margin-bottom:3px;">${esc(r.label)}</div>
          <div style="font-size:11.5px;color:${c.fg};opacity:.8;">${esc(ROL_DESC[r.value] || '')}</div>
        </div>`;
      }).join('')}
    </div>`;
  }

  private filaHtml(u: Usuario, miUsername?: string): string {
    const c = ROL_COLORS[u.rol] || { bg: '#e8e8e8', fg: '#555' };
    const esSelf = u.username === miUsername;
    const iniciales = u.nombre.split(' ').map((p) => p[0] || '').slice(0, 2).join('').toUpperCase();
    const rolLabel = ROLES.find((r) => r.value === u.rol)?.label || u.rol;
    return `
    <div class="table-row" style="grid-template-columns:2fr 1.2fr 1.4fr 1fr 110px;">
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="width:36px;height:36px;border-radius:50%;background:${c.bg};color:${c.fg};
          display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;flex:none;">${esc(iniciales)}</div>
        <div>
          <div style="font-size:14px;font-weight:600;">${esc(u.nombre)}${esSelf ? '<span style="font-size:11px;background:#e8e8e8;color:#555;border-radius:8px;padding:2px 7px;margin-left:6px;">tú</span>' : ''}</div>
          <div style="font-size:11.5px;color:var(--faint);">desde ${u.created_at ? esc(u.created_at.substring(0, 10)) : '—'}</div>
        </div>
      </div>
      <span style="font-size:13px;color:var(--muted);font-family:monospace;">${esc(u.username)}</span>
      <div><span style="background:${c.bg};color:${c.fg};padding:4px 10px;border-radius:20px;font-size:12px;font-weight:700;">${esc(rolLabel)}</span></div>
      <div><span style="background:${u.activo ? '#DFF5E6' : '#f0f0f0'};color:${u.activo ? '#1D7A56' : '#999'};padding:4px 10px;border-radius:20px;font-size:12px;font-weight:700;">${u.activo ? 'Activo' : 'Inactivo'}</span></div>
      <div style="display:flex;gap:4px;">
        <button class="btn btn-sm btn-outline" style="padding:6px 8px;" title="Editar" data-action="editar" data-id="${u.id}">✎</button>
        ${!esSelf ? `<button class="btn btn-sm btn-outline" style="padding:6px 8px;color:var(--danger);" title="Eliminar" data-action="confirmar-eliminar" data-id="${u.id}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
        </button>` : ''}
      </div>
    </div>`;
  }

  /* ---------- Delegación de eventos ---------- */
  private handleClick(e: Event): void {
    const target = (e.target as HTMLElement)?.closest<HTMLElement>('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    const id = target.dataset.id ? Number(target.dataset.id) : undefined;
    switch (action) {
      case 'nuevo': this.abrirNuevo(); break;
      case 'editar': if (id != null) this.abrirEditar(id); break;
      case 'guardar': void this.guardar(id); break;
      case 'confirmar-eliminar': if (id != null) this.confirmarEliminar(id); break;
      case 'do-eliminar': if (id != null) void this.eliminar(id); break;
      case 'cerrar-modal': closeModal(); break;
    }
  }

  /* ---------- Formularios / modales ---------- */
  private formHtml(u: Usuario | null): string {
    return `
      <div class="form-group"><label>Nombre completo</label>
        <input type="text" id="u-nombre" value="${esc(u ? u.nombre : '')}" placeholder="Ej: María García"></div>
      ${!u ? `<div class="form-group"><label>Nombre de usuario</label>
        <input type="text" id="u-username" value="" placeholder="Ej: mgarcia (sin espacios)" autocomplete="off"></div>`
           : `<div style="background:var(--bg);border-radius:9px;padding:10px 14px;font-size:13px;margin-bottom:14px;">
        Usuario: <b style="font-family:monospace;">${esc(u.username)}</b></div>`}
      <div class="form-group"><label>Contraseña ${u ? '(dejar vacío para no cambiar)' : ''}</label>
        <input type="password" id="u-pass" value="" placeholder="${u ? 'Nueva contraseña…' : 'Contraseña de acceso'}" autocomplete="new-password"></div>
      <div class="form-group"><label>Rol</label>
        <select id="u-rol">
          ${ROLES.map((r) => `<option value="${r.value}" ${u && u.rol === r.value ? 'selected' : ''}>${esc(r.label)}</option>`).join('')}
        </select></div>
      ${u ? `<div class="form-group"><label>Estado</label>
        <select id="u-activo">
          <option value="1" ${u.activo ? 'selected' : ''}>Activo</option>
          <option value="0" ${!u.activo ? 'selected' : ''}>Inactivo</option>
        </select></div>` : ''}`;
  }

  private abrirNuevo(): void {
    modal(`
      <h2>Nuevo usuario</h2>
      ${this.formHtml(null)}
      <div class="modal-footer">
        <button class="btn btn-outline" data-action="cerrar-modal">Cancelar</button>
        <button class="btn btn-primary" data-action="guardar">Crear usuario</button>
      </div>`);
  }

  private abrirEditar(id: number): void {
    const u = this.usuarios.find((x) => x.id === id);
    if (!u) return;
    modal(`
      <h2>Editar · ${esc(u.nombre)}</h2>
      ${this.formHtml(u)}
      <div class="modal-footer">
        <button class="btn btn-outline" data-action="cerrar-modal">Cancelar</button>
        <button class="btn btn-primary" data-action="guardar" data-id="${id}">Guardar cambios</button>
      </div>`);
  }

  private async guardar(id?: number): Promise<void> {
    const val = (elId: string) => (document.getElementById(elId) as HTMLInputElement | HTMLSelectElement | null)?.value || '';
    const nombre = val('u-nombre').trim();
    const username = val('u-username').trim().toLowerCase();
    const password = val('u-pass').trim();
    const rol = val('u-rol');
    const activo = val('u-activo');

    if (!nombre) { toast('El nombre es requerido', 'error'); return; }
    if (id == null && !username) { toast('El usuario es requerido', 'error'); return; }
    if (id == null && !password) { toast('La contraseña es requerida', 'error'); return; }

    const btn = document.querySelector<HTMLButtonElement>('.modal .btn-primary');
    if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }

    try {
      const res = id != null
        ? await this.repo.editar(id, { nombre, rol, activo: activo === '1', ...(password ? { password } : {}) })
        : await this.repo.crear({ nombre, username, password, rol });
      if (!res || !res.ok) { toast((res && res.error) || 'Error al guardar', 'error'); return; }
      closeModal();
      toast(id != null ? 'Usuario actualizado' : 'Usuario creado correctamente', 'success');
      void this.cargar();
    } catch {
      toast('Error de conexión', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Guardar'; }
    }
  }

  private confirmarEliminar(id: number): void {
    const u = this.usuarios.find((x) => x.id === id);
    modal(`
      <h2>Eliminar usuario</h2>
      <p style="color:var(--muted);margin-bottom:20px;">¿Estás seguro de eliminar a <b>${esc(u?.nombre || '')}</b>? Esta acción no se puede deshacer.</p>
      <div class="modal-footer">
        <button class="btn btn-outline" data-action="cerrar-modal">Cancelar</button>
        <button class="btn" style="background:#fd4c5c;color:#fff;" data-action="do-eliminar" data-id="${id}">Sí, eliminar</button>
      </div>`, { narrow: true });
  }

  private async eliminar(id: number): Promise<void> {
    try {
      const res = await this.repo.eliminar(id);
      if (!res || !res.ok) { toast((res && res.error) || 'Error al eliminar', 'error'); return; }
      closeModal();
      toast('Usuario eliminado', 'success');
      void this.cargar();
    } catch {
      toast('Error de conexión', 'error');
    }
  }
}
