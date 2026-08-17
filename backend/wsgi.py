# -*- coding: utf-8 -*-
"""
Punto de entrada para un servidor WSGI de producción (gunicorn).

Existe por un motivo concreto: `app.py` crea las tablas dentro de `main()`,
y `main()` solo corre cuando se ejecuta el archivo a mano. Gunicorn no lo
llama —importa el objeto `app` y sirve— así que sin esto la base nunca se
crearía y toda petición fallaría con "no such table".

Uso:
    gunicorn --chdir backend wsgi:app -b 0.0.0.0:7801 -w 1 --threads 8

El `-w 1` NO es opcional. `enrolamiento._sesiones` es un diccionario en la
memoria del proceso: una captura biométrica iniciada en el trabajador A no
existiría para el trabajador B, y la pantalla se quedaría preguntando por
un enrolamiento que "no existe". Las sesiones de login sí viven en tabla, así
que ese lado sí escalaría; el enrolamiento es el que ata al proceso único.
Para levantar el límite hay que mover ese diccionario a la base.
"""
import logging

import db
from app import app

log = logging.getLogger("rrhh.wsgi")

# Crea el esquema si falta y aplica las columnas nuevas. Es idempotente, así
# que no molesta en un reinicio.
db.iniciar()
log.info("esquema verificado · base en %s", db.config.DB_PATH)

# gunicorn busca este nombre.
application = app
