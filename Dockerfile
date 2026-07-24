# ERP Lost Children — imagen de producción
#
# Fase 3 de la migración de frontend: el frontend en TypeScript + Vite
# (frontend/) reemplaza al legacy vanilla JS (que vivía en js/ + modules/ +
# index.html de la raíz, ya retirados del repo). Se compila en un stage de
# Node aparte y el resultado estático (frontend/dist) se copia a la imagen
# final de Python — la imagen que corre en producción no necesita Node
# instalado, solo el HTML/CSS/JS ya compilado.

# ── Etapa 1: build del frontend ───────────────────────────────────────────────
FROM node:20-slim AS frontend-build
WORKDIR /app/frontend

# Copiar solo los manifiestos primero aprovecha la cache de capas de Docker:
# si package*.json no cambia, no se reinstalan dependencias en cada build.
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# ── Etapa 2: imagen final (Python + Flask) ────────────────────────────────────
FROM python:3.11-slim

WORKDIR /app

# mysqlclient/pyzk no necesitan headers de compilación adicionales con las
# versiones fijadas en requirements.txt (mysql-connector-python es puro
# Python); ca-certificates es necesario para las llamadas salientes HTTPS a
# global.yunatt.com.
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY bridge/requirements.txt bridge/requirements.txt
RUN pip install --no-cache-dir -r bridge/requirements.txt

COPY . .

# El build real del frontend (compilado en la Etapa 1) reemplaza cualquier
# frontend/dist que hubiera llegado por el contexto de build (no debería —
# está en .dockerignore — pero esto deja la fuente de verdad explícita).
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# Directorios de datos que se montan como volúmenes en docker-compose.yml —
# se crean acá por si el volumen aún no existe en el primer arranque.
RUN mkdir -p bridge/static/fotos bridge/static/comprobantes bridge/static/articulos \
             bridge/logs bridge/ssl

RUN chmod +x docker-entrypoint.sh

EXPOSE 7793

# gunicorn (no el servidor de desarrollo de Flask) con worker gevent:
# necesario para que /ws/asistencia (WebSocket) funcione bajo un servidor de
# producción. -w 1 es OBLIGATORIO con el código actual: las sesiones viven en
# un dict en memoria del proceso y los hilos de sync de yunatt / watcher de
# asistencia arrancan una vez por proceso — más de un worker duplicaría esos
# hilos (llamadas repetidas a yunatt.com, doble polling de MySQL) y rompería
# el login (una sesión creada en el worker A no existiría en el worker B).
# No escalar réplicas de este contenedor sin antes mover las sesiones a un
# store compartido (Redis) y des-duplicar los hilos de fondo.
# TLS: docker-entrypoint.sh activa gunicorn --certfile/--keyfile solo si hay
# certificado montado en bridge/ssl/ (ver docker-compose.yml).
ENTRYPOINT ["./docker-entrypoint.sh"]
