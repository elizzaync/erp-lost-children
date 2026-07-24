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
import { AlimentacionComponent } from '@modules/alimentacion/alimentacion.component';
import { EntregasComponent } from '@modules/entregas/entregas.component';
import { AlmacenComponent } from '@modules/almacen/almacen.component';
import { PersonasComponent } from '@modules/personas/personas.component';
import { GastosComponent } from '@modules/gastos/gastos.component';

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
  {
    name: 'alimentacion',
    label: 'Alimentación',
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 3v7a2.5 2.5 0 0 0 5 0V3M7.5 10v11M17 3c-1.7 0-3 2.2-3 5s1.3 4 3 4m0 0v9"/></svg>',
    factory: (ctx) => new AlimentacionComponent(ctx.store, ctx.api),
  },
  {
    name: 'entregas',
    label: 'Entregas',
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 12v8H4v-8M2.5 7h19v5h-19zM12 22V7M12 7S11 3 8.5 3 6 6 8 7m4 0s1-4 3.5-4S18 6 16 7"/></svg>',
    factory: (ctx) => new EntregasComponent(ctx.store),
  },
  {
    name: 'personas',
    label: 'Personas',
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20a8 8 0 0 1 16 0"/></svg>',
    factory: (ctx) => new PersonasComponent(ctx.store),
  },
  {
    name: 'almacen',
    label: 'Almacén',
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-4 0v2M8 7V5a2 2 0 0 0-4 0v2"/></svg>',
    factory: (ctx) => new AlmacenComponent(ctx.store, ctx.api),
  },
  {
    name: 'gastos',
    label: 'Gastos y Fondos',
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 1 0 0 7h5a3.5 3.5 0 1 1 0 7H6"/></svg>',
    factory: (ctx) => new GastosComponent(ctx.store, ctx.api),
  },
  // Próximos (Fase 2): asistencia, dashboard.
];
