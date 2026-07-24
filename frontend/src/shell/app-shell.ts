/**
 * AppShell — cascarón de la aplicación (sidebar + header + área de contenido)
 * y router mínimo. Reemplazo incremental de js/app.js.
 *
 * A diferencia del app.js legacy, navigate() monta un Component (mount/unmount
 * del ciclo de vida) en #content en vez de inyectar strings y re-ejecutar
 * onMount en cada refresco — el bucle de parpadeo es imposible por diseño aquí.
 *
 * El sidebar reproduce la estructura EXACTA del legacy: 3 grupos colapsables
 * (Beneficiarios/Recursos/Finanzas) con estado persistido en localStorage
 * ('lc_nav_groups', mismo nombre de clave), Dashboard como botón grande
 * arriba (sidebarStyle:'top', pendiente del módulo 10), y "Gestión de
 * Usuarios" como botón atenuado al final (sidebarStyle:'footer'). Un módulo
 * sin group/sidebarStyle (Marcado) no genera botón pero sigue siendo
 * navegable vía ctx.navigate — así el botón "Facial" de Asistencia funciona.
 */
import type { ApiClient } from '@core/index';
import type { Component } from '@core/index';
import type { AppStore } from '@store/app-store';
import { Auth } from './auth';
import { esc } from './ui';
import { MODULOS, GRUPOS_SIDEBAR, type ModuleContext, type ModuleDescriptor, type SidebarGroup } from './module-registry';

const GRUPOS_ORDEN: SidebarGroup[] = ['beneficiarios', 'recursos', 'finanzas'];
const STORAGE_KEY = 'lc_nav_groups';

export class AppShell {
  private currentComponent: Component | null = null;
  private readonly visibles: ModuleDescriptor[];
  private readonly ctx: ModuleContext;
  private openGroups: Record<string, boolean> = {};
  private readonly onSidebarClick = (e: Event) => this.handleSidebarClick(e);

  constructor(deps: { api: ApiClient; store: AppStore }) {
    this.ctx = { ...deps, navigate: (name) => this.navigate(name) };
    this.visibles = MODULOS.filter((m) => Auth.canAccess(m.name));
    this.loadOpenGroups();
  }

  private loadOpenGroups(): void {
    try {
      this.openGroups = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch {
      this.openGroups = {};
    }
    for (const g of GRUPOS_ORDEN) {
      if (!(g in this.openGroups)) this.openGroups[g] = true;
    }
  }

  private saveOpenGroups(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.openGroups));
  }

  /** Monta el layout del shell y navega a la primera pantalla disponible. */
  mount(): void {
    const sidebar = document.getElementById('sidebar');
    const header = document.querySelector('header');
    if (sidebar) {
      sidebar.innerHTML = this.sidebarHtml();
      sidebar.addEventListener('click', this.onSidebarClick);
    }
    if (header) header.innerHTML = this.headerHtml();
    document.querySelector('[data-action="logout"]')?.addEventListener('click', () => void Auth.logout());

    if (this.visibles.length) this.navigate(this.visibles[0]!.name);
  }

  private handleSidebarClick(e: Event): void {
    const target = (e.target as HTMLElement)?.closest<HTMLElement>('[data-nav], [data-group-toggle]');
    if (!target) return;
    if (target.dataset.nav) { this.navigate(target.dataset.nav); return; }
    if (target.dataset.groupToggle) this.toggleGroup(target.dataset.groupToggle);
  }

  navigate(name: string): void {
    const desc = this.visibles.find((m) => m.name === name);
    if (!desc) return;

    // Si la pantalla está en un grupo cerrado, ábrelo (igual que el legacy).
    if (desc.group && !this.openGroups[desc.group]) {
      this.openGroups[desc.group] = true;
      this.saveOpenGroups();
      this.applyGroupState(desc.group);
    }

    document.querySelectorAll<HTMLElement>('[data-nav]').forEach((b) => {
      b.classList.toggle('active', b.dataset.nav === name);
    });
    document.querySelectorAll<HTMLElement>('[data-group-toggle]').forEach((h) => {
      h.classList.toggle('group-active', h.dataset.groupToggle === desc.group);
    });

    const content = document.getElementById('content');
    if (!content) return;

    this.currentComponent?.unmount();
    this.currentComponent = desc.factory(this.ctx);
    this.currentComponent.mount(content);
    content.scrollTop = 0;
  }

  private toggleGroup(name: string): void {
    this.openGroups[name] = !this.openGroups[name];
    this.saveOpenGroups();
    this.applyGroupState(name);
  }

  private applyGroupState(name: string): void {
    const body = document.getElementById(`grp-${name}`);
    const chevron = document.getElementById(`chv-${name}`);
    const open = !!this.openGroups[name];
    if (body) body.classList.toggle('open', open);
    if (chevron) chevron.style.transform = open ? 'rotate(180deg)' : '';
  }

  private navItemHtml(m: ModuleDescriptor, sub: boolean, dimmed = false): string {
    return `<button class="nav-btn${sub ? ' nav-sub' : ''}" data-nav="${m.name}"${dimmed ? ' style="opacity:.75;font-size:12.5px;"' : ''}>${m.icon}${esc(m.label)}</button>`;
  }

  private grupoHtml(g: SidebarGroup): string {
    const items = this.visibles.filter((m) => m.group === g);
    if (!items.length) return '';
    const meta = GRUPOS_SIDEBAR[g];
    const open = !!this.openGroups[g];
    return `
    <button class="nav-group-hdr" data-group-toggle="${g}">
      ${meta.icon}${esc(meta.label)}
      <svg id="chv-${g}" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
        style="margin-left:auto;transition:transform .2s;flex:none;opacity:.6;${open ? 'transform:rotate(180deg);' : ''}">
        <polyline points="6 9 12 15 18 9"/>
      </svg>
    </button>
    <div class="nav-group-body${open ? ' open' : ''}" id="grp-${g}">
      ${items.map((m) => this.navItemHtml(m, true)).join('')}
    </div>`;
  }

  private sidebarHtml(): string {
    const u = Auth.getUser();
    const iniciales = (u.nombre || '?').split(' ').map((p) => p[0] || '').slice(0, 2).join('').toUpperCase();

    const top = this.visibles.filter((m) => m.sidebarStyle === 'top');
    const footer = this.visibles.filter((m) => m.sidebarStyle === 'footer');

    const nav = [
      top.map((m) => this.navItemHtml(m, false)).join(''),
      ...GRUPOS_ORDEN.map((g) => this.grupoHtml(g)),
      footer.length ? `<div style="margin-top:4px;">${footer.map((m) => this.navItemHtml(m, false, true)).join('')}</div>` : '',
    ].join('');

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
      ${nav || '<div style="padding:16px;color:var(--faint);font-size:12px;">Sin módulos disponibles para tu rol.</div>'}
    </nav>
    <div class="user-area">
      <div class="user-avatar" style="background:linear-gradient(135deg,#0176bf,#5dbc35);">
        <span style="font-size:13px;font-weight:800;color:#fff;">${esc(iniciales)}</span>
      </div>
      <div style="min-width:0;flex:1;">
        <div class="user-name">${esc(u.nombre || 'Usuario')}</div>
        <div class="user-role">${esc(Auth.rolLabel())}</div>
      </div>
      <button title="Cerrar sesión" class="logout-btn" data-action="logout">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
      </button>
    </div>`;
  }

  private headerHtml(): string {
    return `
    <div style="margin-left:auto;display:flex;align-items:center;gap:14px;">
      <div class="jornada-badge">
        <span style="width:7px;height:7px;border-radius:50%;background:var(--success);display:inline-block;"></span>
        Jornada activa
      </div>
    </div>`;
  }
}
