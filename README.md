# ERP Lost Children

Sistema de gestión para ONG: beneficiarios, asistencia biométrica, alimentación,
almacén, entregas y finanzas.

## Stack

- **Frontend**: SPA en TypeScript + Vite, arquitectura por capas — `frontend/`
  (ver `frontend/README.md`). Compilado a `frontend/dist/` y servido por Flask.
- **Backend**: Flask (puerto 7793) — `bridge/server.py`
- **Base de datos**: MySQL (XAMPP) — esquema en `erp_lost_children_mysql.sql`
- **Biometría**: dispositivo Timmy TM-AI03F (reconocimiento facial) vía nube yunatt.com (protocolo ADMS)

## Características principales

- Asistencia en **tiempo real** vía WebSocket (`/ws/asistencia`) — las marcas del
  dispositivo aparecen al instante en el dashboard.
- Enrolamiento remoto: el ERP envía el comando y el Timmy activa su pantalla de
  registro; la foto que captura el dispositivo se sincroniza como foto de perfil.
- Monitoreo del enrolamiento (registrado / cancelado) con banner en vivo.
- Borrado sincronizado: eliminar una persona la quita también del dispositivo y de la nube.
- Almacén con alertas de stock mínimo, gastos y fondos con balance, servicios de alimentación.

## Puesta en marcha

```bash
# 1. Requisitos backend
pip install -r bridge/requirements.txt

# 2. Base de datos (XAMPP/MySQL)
#    Importar erp_lost_children_mysql.sql en una BD llamada erp_lost_children

# 3. Compilar el frontend (una sola vez; solo hace falta repetirlo si se
#    edita algo dentro de frontend/). Requiere Node 20+.
cd frontend && npm install && npm run build && cd ..

# 4. Arrancar el servidor — sirve el build del paso 3
python bridge/server.py
# → abrir http://localhost:7793
```

### Desarrollo del frontend (con recarga en caliente)

Para trabajar en `frontend/` sin recompilar en cada cambio, usa el dev
server de Vite en paralelo al backend — ver `frontend/README.md`:

```bash
# Terminal 1 — backend
python bridge/server.py

# Terminal 2 — frontend con HMR, proxya la API al backend de la Terminal 1
cd frontend && npm run dev
# → abrir http://localhost:4300
```

## Configuración sensible

Las credenciales de yunatt.com **no** están en el código. Se leen desde
`bridge/.env` (excluido de git). Para configurarlas:

```bash
cp bridge/.env.example bridge/.env
# editar bridge/.env con las credenciales reales
```

Las carpetas `bridge/static/fotos/` (fotos de beneficiarios), `bridge/ssl/`
(llaves) y `bridge/static/comprobantes/` están excluidas del repositorio.
