# ERP Lost Children — imagen de producción
# El frontend es una SPA vanilla JS servida por el propio Flask (bridge/server.py
# sirve index.html, css/, js/, modules/ desde ERP_DIR = carpeta raíz del repo),
# así que la imagen necesita el repo completo, no solo bridge/.
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
