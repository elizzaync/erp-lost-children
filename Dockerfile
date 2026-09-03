# Módulo RRHH — Lost Children Perú · imagen de producción
#
# La interfaz es un único .dc.html que sirve el propio Flask desde la raíz del
# repositorio, así que la imagen necesita el repositorio completo, no solo
# backend/.
FROM python:3.11-slim

WORKDIR /app

# ca-certificates es imprescindible: hay HTTPS saliente hacia la API de Google
# Sheets (el formulario de tutores) y sin los certificados raíz el handshake
# falla. Ya no es por yunatt —desde el 01/09/2026 se habla con él por HTTP en
# el puerto 82— pero sigue haciendo falta; no lo quites.
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY . .

# Se crean por si el volumen todavía no existe en el primer arranque. La base
# vive aquí, así que este directorio TIENE que ser un volumen persistente o
# cada redespliegue la borra (ver docker-compose.yml).
RUN mkdir -p data/archivos

EXPOSE 7801

# Comprobación de salud: /api/health no exige sesión ni toca el terminal, así
# que responde aunque yunatt esté caído o todavía no haya cuentas creadas.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0) if urllib.request.urlopen('http://127.0.0.1:7801/api/health', timeout=4).status==200 else sys.exit(1)"

# gunicorn, no el servidor de desarrollo de Flask (que además escucha solo en
# 127.0.0.1 y sería inalcanzable desde fuera del contenedor).
#
# -w 1 es OBLIGATORIO: enrolamiento._sesiones es un diccionario en memoria del
# proceso. Con dos trabajadores, una captura biométrica iniciada en uno no
# existiría para el otro. La concurrencia se cubre con hilos, que comparten
# esa memoria. Ver backend/wsgi.py.
CMD ["gunicorn", "--chdir", "backend", "wsgi:app", \
     "-b", "0.0.0.0:7801", \
     "-w", "1", "--threads", "8", \
     "--timeout", "120", \
     "--access-logfile", "-", "--error-logfile", "-"]
