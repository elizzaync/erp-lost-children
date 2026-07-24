# Reestructuración de arquitectura del frontend — ERP Lost Children

**Fecha:** 2026-07-24
**Rama:** `refactor/frontend-arquitectura`
**Estado:** diseño aprobado, en ejecución

## Contexto y problema

El frontend es una SPA en JavaScript vanilla servida por Flask (`bridge/server.py`).
Cada pantalla (`modules/*.js`) es un objeto con `render()` que devuelve un string
de HTML concatenado a mano; `App.navigate()` lo inyecta con `content.innerHTML`.
No hay build step, ni tipado, ni tests. Todo el estado compartido vive en globales
(`window.DB`, `window.App`, `window.Auth`, `window.UI`).

Dolores concretos detectados:

1. **Parpadeo en tiempo real (ya corregido en `main`, commit `11691ed`):** cada
   evento del DB llamaba a `App.refresh()` = `navigate()` completo, y una sola
   recarga emite ~7 eventos síncronos → 7 reconstrucciones del DOM en cadena. Se
   resolvió colapsando la ráfaga en un `requestAnimationFrame`. Esto tapa el
   síntoma; la causa de fondo (invalidación gruesa + reemplazo total del DOM,
   emisión incondicional de los 7 eventos) sigue presente y se resuelve aquí.
2. **`js/db.js` (877 líneas)** mezcla en un solo archivo: fetch HTTP, caché en
   memoria, normalización MySQL→frontend, reglas de negocio, event bus y
   WebSocket. Imposible de testear por partes.
3. Sin tipos → el *drift* de esquema MySQL (documentado en la remediación de
   seguridad) no se detecta hasta producción.

## Objetivo

Migrar el frontend a una arquitectura por capas con TypeScript + Vite,
**sin tocar `bridge/server.py`, el protocolo WebSocket, ni la lógica de
yunatt/Timmy** — todo el cambio vive estrictamente en el frontend. Migración
**incremental y reversible**: el sistema en producción (Contabo/Coolify) nunca
queda a medias.

## No-objetivos (YAGNI)

- No migrar a un framework pesado (Angular/React). Se evaluó y se descartó:
  el costo/riesgo no se justifica para el equipo y el estado actual.
- No reescribir el backend ni cambiar contratos de la API REST/WebSocket.
- No normalizar tablas ni cambiar el esquema MySQL (fuera de alcance).

## Stack

- **TypeScript** — contratos tipados entre capas.
- **Vite** — dev server con HMR + build a estático que Flask sigue sirviendo igual.
- **Vitest** — tests unitarios de repositorios y mappers (hoy: 0 tests).

## Arquitectura por capas

De abajo hacia arriba:

1. **`ApiClient`** (Singleton) — único punto que hace `fetch` con el token Bearer.
   Reemplaza `apiFetch()`. Lee el token de `Auth` (sessionStorage, key `erp_token`).
2. **`Repository` por entidad** (`PersonasRepository`, `GastosRepository`, …) —
   CRUD contra `ApiClient` + su `Mapper`. Patrón **Repository**.
3. **`Mapper` por entidad** (patrón **Strategy**) — las funciones `normPersona`,
   `normGasto`, etc. de hoy, aisladas y tipadas. Un test por mapper compara
   contra la salida de la función `norm*` original (mismo input → mismo output).
4. **`EventBus`** (patrón **Observer/PubSub**) — formaliza el `on/off/emit` de
   `db.js` como clase reusable independiente de los datos.
5. **`RealtimeClient`** — encapsula WebSocket + reconexión/backoff (hoy mezclado
   en `db.js`). Mismo endpoint `/ws/asistencia?token=…`, misma semántica de
   eventos (`asistencia` / `cambio`). **No cambia el protocolo.**
6. **`AppStore`** (patrón **Facade**) — agrega repositorios + caché en memoria +
   getters derivados (`getKPIs`, `getAlertasActivas`). Expone **exactamente la
   misma forma pública que `window.DB` hoy**, para que los módulos legacy sin
   migrar sigan funcionando sin cambios durante toda la migración.
7. **`Component`** (clase base, patrón **Template Method**) — reemplaza el
   string-HTML-completo. Define `render()` (HTML inicial) y opcional
   `patch(changedKeys)` (actualización dirigida). La clase base decide: primer
   montaje = render completo; actualizaciones = `patch()` si existe, si no
   re-render completo. Estandariza el patrón que ya funciona en `marcado.js` /
   `usuarios.js`, dejando el parpadeo estructuralmente imposible de reintroducir.

Patrones aplicados: **Singleton** (ApiClient, EventBus, Auth vía módulos ES en
vez de `window.X`), **Repository**, **Strategy** (mappers), **Observer**
(EventBus), **Facade** (AppStore), **Template Method** (Component base).

## Estructura de carpetas (estado final)

```
erp-lost-children/
├── bridge/                      # backend Flask — SIN CAMBIOS
├── frontend/                    # NUEVO — proyecto Vite + TypeScript
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── index.html               # entry de Vite (reemplaza al index.html raíz al final)
│   ├── public/assets/           # logo.jpg y estáticos que no pasan por el bundler
│   └── src/
│       ├── main.ts              # bootstrap
│       ├── core/                # infraestructura, sin lógica de negocio
│       │   ├── event-bus.ts
│       │   ├── api-client.ts
│       │   ├── realtime-client.ts
│       │   └── component.ts
│       ├── domain/              # una carpeta por entidad
│       │   ├── personas/ { *.repository.ts, *.mapper.ts, *.types.ts }
│       │   ├── articulos/  gastos/  entregas/  alimentacion/  fondos/  asistencia/
│       ├── store/
│       │   └── app-store.ts     # Facade — misma forma pública que window.DB
│       ├── modules/             # una carpeta por pantalla (reemplaza modules/*.js)
│       │   ├── dashboard/ personas/ asistencia/ almacen/ alimentacion/
│       │   ├── entregas/ gastos/ reportes/ usuarios/ marcado/
│       ├── shell/               # reemplaza app.js/auth.js/ui.js
│       │   ├── app-shell.ts
│       │   ├── auth.ts
│       │   └── ui.ts
│       └── styles/
├── docker-compose.yml
├── Dockerfile                   # + build-stage node que corre `npm run build`
├── docs/
└── erp_lost_children_mysql.sql
```

## Fases de migración

Cada fase = commit/deploy chico y reversible. Se prueba en local (XAMPP) antes
de Contabo. Ninguna fase toca el backend/WS/yunatt/Timmy.

- **Fase 0 — Tooling.** Crear `frontend/` con Vite+TS+Vitest al lado de lo actual
  (nada se borra). Meta: `npm run build` produce salida que, servida por Flask,
  se comporta idéntico a hoy. Ajustar Dockerfile con build-stage node.
- **Fase 1 — Capa de datos.** `core/` + `domain/` + `AppStore` en TS, expuesto
  como `window.DB` con la misma forma pública. Los 10 módulos legacy siguen
  intactos. Verificar mappers contra `norm*` + flujo e2e contra MySQL real.
- **Fase 2 — Migrar módulos uno por uno** como `Component`. Orden: **Usuarios**
  (piloto) → Reportes → Marcado → Alimentación/Entregas → Personas/Asistencia/
  Almacén/Gastos → **Dashboard** (último, el más complejo). El shell viejo enruta
  durante toda la fase; si un módulo falla, los otros 9 siguen y se revierte solo ese.
- **Fase 3 — Retirar shell legacy.** Reescribir `shell/app-shell.ts` (reemplazo
  de `app.js`), `index.html` de Vite como único entry, borrar `js/` y
  `modules/*.js` viejos. Verificación e2e final incluyendo sync yunatt y marcado
  del Timmy.

## Garantía transversal (requisito del usuario)

**yunatt y Timmy no pueden dejar de funcionar en ningún punto.** Se cumple porque
el backend (`bridge/server.py`, `yunatt_sync.py`, `yunatt_staff_sync.py`,
`timmy_direct.py`) y el contrato WebSocket **no se modifican**. El frontend nuevo
consume los mismos endpoints y el mismo socket que el actual. Cada fase se valida
end-to-end contra MySQL real antes de considerarse terminada.

## Testing

- **Vitest** unitario: mappers (paridad con `norm*`), repositorios (contra
  `ApiClient` mockeado), `EventBus`, lógica de `patch()` del Component base.
- **Verificación e2e manual** contra MySQL real (XAMPP local) por fase: login →
  CRUD de cada entidad → asistencia (incl. marca facial) → alimentación → fondos.
