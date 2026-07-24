/**
 * Registro de módulos del shell.
 *
 * Cada módulo migrado se declara aquí con su factory. Agregar un módulo a la
 * app = una entrada en MODULOS (+ su archivo Component). El shell itera esta
 * lista, filtra por permisos de rol y arma la navegación automáticamente.
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

export interface ModuleContext {
  api: ApiClient;
  store: AppStore;
}

export interface ModuleDescriptor {
  /** Nombre de pantalla (coincide con los permisos de Auth.canAccess). */
  name: string;
  label: string;
  /** SVG del ícono (markup de plantilla, no dato de usuario). */
  icon: string;
  factory: (ctx: ModuleContext) => Component;
}

export const MODULOS: ModuleDescriptor[] = [
  {
    name: 'usuarios',
    label: 'Gestión de Usuarios',
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    factory: (ctx) => new UsuariosComponent(ctx.api),
  },
  {
    name: 'reportes',
    label: 'Reportes',
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 21V4a1 1 0 0 1 1-1h9l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1Z"/><path d="M14 3v5h5M8.5 13.5l2.5 2.5 4-4.5"/></svg>',
    factory: (ctx) => new ReportesComponent(ctx.store),
  },
  {
    // El legacy no tenía "marcado" como ítem de barra lateral (solo un
    // acceso directo "Facial" dentro de Asistencia) — durante la Fase 2
    // (app en paralelo) cada módulo migrado aparece en el sidebar según
    // indica el propio brief; se puede revisar la navegación final en la
    // Fase 3.
    name: 'marcado',
    label: 'Marcado facial',
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="11" r="3"/><path d="M5 19a7 7 0 0 1 14 0"/></svg>',
    factory: (ctx) => new MarcadoComponent(ctx.store),
  },
  // Próximos (Fase 2): alimentacion, entregas, personas,
  // asistencia, almacen, gastos, dashboard.
];
