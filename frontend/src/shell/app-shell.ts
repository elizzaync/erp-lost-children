/**
 * AppShell — cascarón de la aplicación (sidebar + header + área de contenido)
 * y router mínimo. Reemplazo incremental de js/app.js.
 *
 * A diferencia del app.js legacy, navigate() monta un Component (mount/unmount
 * del ciclo de vida) en #content en vez de inyectar strings y re-ejecutar
 * onMount en cada refresco — el bucle de parpadeo es imposible por diseño aquí.
 */
import type { Component } from '@core/index';
import { Auth } from './auth';
import { esc } from './ui';
import { MODULOS, type ModuleContext, type ModuleDescriptor } from './module-registry';

export class AppShell {
  private currentComponent: Component | null = null;
  private readonly visibles: ModuleDescriptor[];

  constructor(private readonly ctx: ModuleContext) {
    this.visibles = MODULOS.filter((m) => Auth.canAccess(m.name));
  }

  /** Monta el layout del shell y navega a la primera pantalla disponible. */
  mount(): void {
    const sidebar = document.getElementById('sidebar');
    const header = document.querySelector('header');
    if (sidebar) sidebar.innerHTML = this.sidebarHtml();
    if (header) header.innerHTML = this.headerHtml();

    document.querySelectorAll<HTMLElement>('[data-nav]').forEach((btn) => {
      btn.addEventListener('click', () => this.navigate(btn.dataset.nav!));
    });
    document.querySelector('[data-action="logout"]')?.addEventListener('click', () => void Auth.logout());

    if (this.visibles.length) this.navigate(this.visibles[0].name);
  }

  navigate(name: string): void {
    const desc = this.visibles.find((m) => m.name === name);
    if (!desc) return;

    document.querySelectorAll<HTMLElement>('[data-nav]').forEach((b) => {
      b.classList.toggle('active', b.dataset.nav === name);
    });

    const content = document.getElementById('content');
    if (!content) return;

    this.currentComponent?.unmount();
    this.currentComponent = desc.factory(this.ctx);
    this.currentComponent.mount(content);
  }

  private sidebarHtml(): string {
    const u = Auth.getUser();
    const iniciales = (u.nombre || '?').split(' ').map((p) => p[0] || '').slice(0, 2).join('').toUpperCase();
    const nav = this.visibles.map((m) => `
      <button class="nav-btn" data-nav="${m.name}">${m.icon}${esc(m.label)}</button>`).join('');

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
