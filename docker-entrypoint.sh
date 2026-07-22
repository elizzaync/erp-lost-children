#!/bin/sh
# Arranca gunicorn con TLS si hay certificado montado en bridge/ssl/
# (cert.pem + key.pem), igual que la lógica ENABLE_TLS de server.py para el
# servidor de desarrollo — pero acá el que termina TLS es gunicorn mismo,
# porque no pasamos por el enrutamiento por dominio de Traefik/Coolify
# (acceso directo por IP pública). Si más adelante se agrega un dominio y se
# deja que Coolify emita el certificado, quitar CERT/KEY del entorno para
# que gunicorn sirva HTTP plano y Coolify haga el TLS por delante.
set -e

CERT="$(pwd)/bridge/ssl/cert.pem"
KEY="$(pwd)/bridge/ssl/key.pem"

ARGS="--chdir bridge -k gevent -w 1 -b 0.0.0.0:7793 --timeout 120 --access-logfile - --error-logfile -"

if [ -f "$CERT" ] && [ -f "$KEY" ]; then
    echo "[entrypoint] TLS activado — sirviendo con $CERT"
    exec gunicorn $ARGS --certfile "$CERT" --keyfile "$KEY" server:app
else
    echo "[entrypoint] AVISO: sin certificado en bridge/ssl/ — sirviendo HTTP plano"
    exec gunicorn $ARGS server:app
fi
