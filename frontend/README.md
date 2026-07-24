# Frontend ERP Lost Children — TypeScript + Vite

Reescritura completa del frontend a una arquitectura por capas. Es el único
frontend del proyecto — el legacy en JavaScript vanilla (`js/` + `modules/` +
`index.html` de la raíz) se retiró del repo al completar la Fase 3.
`bridge/server.py` sirve el build de este proyecto (`frontend/dist/`).

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
- **Fase 2** ✅ los 10 módulos migrados a `Component`: usuarios, reportes,
  marcado, alimentación, entregas, almacén, personas, gastos, asistencia,
  dashboard.
- **Fase 3** ✅ shell legacy retirado (`js/`, `modules/*.js`, `index.html` de
  la raíz borrados del repo). `bridge/server.py` sirve `frontend/dist/`
  (compilado en un stage de Node en el `Dockerfile` para producción).

## Cómo correrlo
1. Levanta el backend (Flask :7793 + MySQL).
2. `cd frontend && npm install && npm run dev`.
3. Abre http://localhost:4300 — proxya la API/WS al backend real de :7793,
   con recarga en caliente para editar componentes.

Para probar exactamente lo que corre en producción (el build servido por
Flask, sin el dev server de Vite de por medio): `npm run build` y abre
`http://localhost:7793` directo — ver el paso 3-4 del `README.md` raíz.

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
