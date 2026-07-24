/**
 * Registro de módulos del shell.
 *
 * Cada módulo migrado se declara aquí con su factory. Agregar un módulo a la
 * app = una entrada en MODULOS (+ su archivo Component). El shell itera esta
 * lista, filtra por permisos de rol y arma la navegación automáticamente.
 *
 * `group`/`sidebarStyle` reproducen la estructura EXACTA del sidebar legacy
 * (js/app.js: _screenGroup + buildSidebar) — 3 grupos colapsables
 * (Beneficiarios/Recursos/Finanzas), Dashboard como botón grande arriba, y
 * "Gestión de Usuarios" como botón atenuado abajo. Un módulo sin `group` ni
 * `sidebarStyle` (ej. Marcado) NO aparece en el sidebar — sigue siendo
 * navegable por código vía `ctx.navigate(name)`, igual que el legacy solo
 * llegaba a "marcado" desde el botón "Facial" dentro de Asistencia, nunca
 * desde la barra lateral.
 *
 * Durante la Fase 2 esta lista crece módulo a módulo; al terminar contiene los
 * 10 módulos y el shell legacy (app.js) queda obsoleto.
 */
import type { Component } from '@core/index';
import type { ApiClient } from '@core/index';
import type { AppStore } from '@store/app-store';
import { UsuariosComponent } from '@modules/usuarios/usuarios.component';
import { ReportesComponent } from '@modules/reportes/reportes.component';
import { MarcadoComponent } from '@modules/marcado/marcado.component';
import { AlimentacionComponent } from '@modules/alimentacion/alimentacion.component';
import { EntregasComponent } from '@modules/entregas/entregas.component';
import { AlmacenComponent } from '@modules/almacen/almacen.component';
import { PersonasComponent } from '@modules/personas/personas.component';
import { GastosComponent } from '@modules/gastos/gastos.component';
import { AsistenciaComponent } from '@modules/asistencia/asistencia.component';

export type SidebarGroup = 'beneficiarios' | 'recursos' | 'finanzas';

export interface ModuleContext {
  api: ApiClient;
  store: AppStore;
  /** Navega a otro módulo registrado (aparezca o no en el sidebar) — p.ej.
   *  el botón "Facial" de Asistencia usa esto para ir a Marcado. */
  navigate: (name: string) => void;
}

export interface ModuleDescriptor {
  /** Nombre de pantalla (coincide con los permisos de Auth.canAccess). */
  name: string;
  label: string;
  /** SVG del ícono (markup de plantilla, no dato de usuario). */
  icon: string;
  factory: (ctx: ModuleContext) => Component;
  /** Grupo colapsable del sidebar — mismo criterio que _screenGroup del legacy. */
  group?: SidebarGroup;
  /** 'top' = botón grande arriba de todo (Dashboard). 'footer' = botón
   *  atenuado al final (Gestión de Usuarios). Sin group y sin sidebarStyle
   *  = no aparece en el sidebar. */
  sidebarStyle?: 'top' | 'footer';
}

/** Metadatos de cada grupo — icono, label y orden de aparición en el sidebar. */
export const GRUPOS_SIDEBAR: Record<SidebarGroup, { label: string; icon: string }> = {
  beneficiarios: {
    label: 'Beneficiarios',
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><path d="M16 6.5a3 3 0 0 1 0 5.6M16.5 19a5.5 5.5 0 0 0-2-4.3"/></svg>',
  },
  recursos: {
    label: 'Recursos',
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 8.5 12 4l9 4.5M3 8.5V18l9 4.5M3 8.5l9 4.5m0 0L21 8.5M12 13v9.5M21 8.5V18l-9 4.5"/></svg>',
  },
  finanzas: {
    label: 'Finanzas',
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2.5" y="6" width="19" height="12" rx="2.5"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9v6M18 9v6"/></svg>',
  },
};

export const MODULOS: ModuleDescriptor[] = [
  {
    name: 'personas',
    label: 'Personas',
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20a8 8 0 0 1 16 0"/></svg>',
    factory: (ctx) => new PersonasComponent(ctx.store, ctx.navigate),
    group: 'beneficiarios',
  },
  {
    name: 'asistencia',
    label: 'Asistencia',
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><path d="m16 12 2 2 4-4"/></svg>',
    factory: (ctx) => new AsistenciaComponent(ctx.store, ctx.api, ctx.navigate),
    group: 'beneficiarios',
  },
  {
    name: 'almacen',
    label: 'Almacén',
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-4 0v2M8 7V5a2 2 0 0 0-4 0v2"/></svg>',
    factory: (ctx) => new AlmacenComponent(ctx.store, ctx.api),
    group: 'recursos',
  },
  {
    name: 'alimentacion',
    label: 'Alimentación',
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 3v7a2.5 2.5 0 0 0 5 0V3M7.5 10v11M17 3c-1.7 0-3 2.2-3 5s1.3 4 3 4m0 0v9"/></svg>',
    factory: (ctx) => new AlimentacionComponent(ctx.store, ctx.api),
    group: 'recursos',
  },
  {
    name: 'entregas',
    label: 'Entregas',
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 12v8H4v-8M2.5 7h19v5h-19zM12 22V7M12 7S11 3 8.5 3 6 6 8 7m4 0s1-4 3.5-4S18 6 16 7"/></svg>',
    factory: (ctx) => new EntregasComponent(ctx.store),
    group: 'recursos',
  },
  {
    name: 'gastos',
    label: 'Gastos y Fondos',
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 1 0 0 7h5a3.5 3.5 0 1 1 0 7H6"/></svg>',
    factory: (ctx) => new GastosComponent(ctx.store, ctx.api),
    group: 'finanzas',
  },
  {
    name: 'reportes',
    label: 'Reportes',
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 21V4a1 1 0 0 1 1-1h9l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1Z"/><path d="M14 3v5h5M8.5 13.5l2.5 2.5 4-4.5"/></svg>',
    factory: (ctx) => new ReportesComponent(ctx.store),
    group: 'finanzas',
  },
  {
    name: 'usuarios',
    label: 'Gestión de Usuarios',
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    factory: (ctx) => new UsuariosComponent(ctx.api),
    sidebarStyle: 'footer',
  },
  {
    // Sin group ni sidebarStyle a propósito: el legacy solo llegaba a
    // "marcado" desde el botón "Facial" dentro de Asistencia, nunca desde
    // el sidebar. Sigue registrado (y navegable con ctx.navigate('marcado'))
    // para que ese botón funcione, pero no genera su propio ítem de menú.
    name: 'marcado',
    label: 'Marcado facial',
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="11" r="3"/><path d="M5 19a7 7 0 0 1 14 0"/></svg>',
    factory: (ctx) => new MarcadoComponent(ctx.store, ctx.navigate),
  },
  // Próximo (Fase 2, último): dashboard (sidebarStyle: 'top').
];
