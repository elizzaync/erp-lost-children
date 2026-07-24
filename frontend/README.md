# Frontend ERP Lost Children — TypeScript + Vite

Reescritura incremental del frontend a una arquitectura por capas. **Convive con
el frontend legacy** (`js/` + `modules/` en la raíz): producción sigue usando el
legacy hasta la Fase 3. Este proyecto se prueba aparte con el dev server de Vite.

## Requisitos
- Node 20+ y npm.
- El backend Flask corriendo en `http://localhost:7793` (XAMPP/MySQL activos)
  para probar login y datos reales. El dev server de Vite proxya la API y el
  WebSocket a ese puerto (ver `vite.config.ts`).

## Comandos
```bash
cd frontend
npm install        # instala dependencias (node_modules no se versiona)
npm test           # tests unitarios (Vitest) — deben pasar todos
npm run typecheck  # verificación de tipos
npm run build      # build de producción a dist/
npm run dev        # dev server en http://localhost:4300 (HMR)
```

## Estado de la migración
- **Fase 0** ✅ tooling (Vite + TS + Vitest) y capa `core/`.
- **Fase 1** ✅ capa de datos: `domain/` (tipos, mappers, repositorios) +
  `store/app-store.ts` (Facade con la misma API pública que el `window.DB` legacy).
- **Fase 2** 🚧 migración de módulos a `Component`. **Migrado: Usuarios (piloto).**
  Pendientes: reportes, marcado, alimentación, entregas, personas, asistencia,
  almacén, gastos, dashboard.
- **Fase 3** ⏳ retirar el shell legacy y servir este build desde Flask.

## Cómo probar el piloto (Usuarios)
1. Levanta el backend (Flask :7793 + MySQL).
2. `cd frontend && npm install && npm run dev`.
3. Abre http://localhost:4300, inicia sesión con una cuenta **admin** (Usuarios
   solo es visible para admin).
4. Deberías ver "Gestión de Usuarios" en la barra lateral: listar, crear, editar
   y eliminar usuarios contra el backend real.

## Arquitectura (carpetas)
- `src/core/` — infraestructura sin lógica de negocio: `EventBus`, `ApiClient`,
  `RealtimeClient` (WebSocket), `Component` (clase base con mount/patch/unmount).
- `src/domain/<entidad>/` — `types` + `mapper` (réplica de las `norm*` legacy) +
  `repository` (CRUD tipado).
- `src/store/app-store.ts` — Facade que orquesta repos + caché + eventos + WS.
- `src/modules/<pantalla>/` — cada pantalla como `Component` (event delegation,
  sin globals `onclick`).
- `src/shell/` — `auth`, `ui`, `app-shell` (router+layout), `module-registry`.

**Regla anti-XSS:** todo dato de usuario interpolado en HTML pasa por `esc()`
(`src/shell/ui.ts`). No romper esta disciplina al migrar módulos.
