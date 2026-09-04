# -*- coding: utf-8 -*-
"""Que la llave de Google se pueda pasar por variable, no solo como archivo.

POR QUÉ EXISTE
──────────────
El 04/09/2026, con el despliegue ya funcionando, la pantalla de Respuestas
del formulario decía: «Todavía no está la llave de Google, así que no se
pueden traer respuestas».

No era un fallo. La llave es un archivo en data/credenciales/, y esa carpeta
está en .gitignore —y data/ entero en .dockerignore— a propósito: una clave
privada de una cuenta de servicio no puede acabar en un repositorio público.
Correcto, pero deja al contenedor sin llave.

Y no se puede arreglar montando el archivo: Coolify avisa de que en las
aplicaciones de Docker Compose los montajes solo se declaran en el
docker-compose.yml, que es justo lo que se versiona. Meter ahí la clave sería
volver a publicarla.

La salida es la de siempre en contenedores: pasarla por variable de entorno,
que vive en el panel y no en el repositorio.

QUÉ COMPRUEBA
─────────────
Las tres situaciones, con una llave INVENTADA —nunca la de verdad—:

  · solo archivo   → sigue funcionando igual que antes (no se rompió nada)
  · solo variable  → el sistema la encuentra y la lee
  · las dos        → manda el archivo, que es lo local

Y que un JSON roto en la variable dé un error claro SIN filtrar el contenido:
el texto de un error de json trae trozos del propio texto, y ese texto sería
la clave privada.
"""

import json
import os
import pathlib
import shutil
import sys
import tempfile

sys.stdout.reconfigure(encoding="utf-8")
RAIZ = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "backend"))

fallos = []


def check(c, m):
    print(("  OK    " if c else "  FALLO ") + m)
    if not c:
        fallos.append(m)


# Una llave con la forma correcta y ningún valor real.
LLAVE_FALSA = {
    "type": "service_account",
    "project_id": "proyecto-de-mentira",
    "client_email": "nadie@ejemplo.invalid",
    "private_key": "-----BEGIN PRIVATE KEY-----\nESTO-NO-ES-UNA-CLAVE\n-----END PRIVATE KEY-----\n",
    "token_uri": "https://oauth2.googleapis.com/token",
}

tmp = pathlib.Path(tempfile.mkdtemp())
archivo = tmp / "llave.json"
archivo.write_text(json.dumps(LLAVE_FALSA), encoding="utf-8")


import config          # noqa: E402
import google_hoja     # noqa: E402


def recargar(ruta_archivo, json_variable):
    """Deja config con esa llave y devuelve los dos módulos.

    Se asignan los valores directamente en vez de recargar el módulo: las
    dos funciones los leen en el momento de la llamada, y recargando
    volvería a mandar el backend/.env de esta máquina —que apunta a la
    llave de verdad— y la prueba comprobaría otra cosa.
    """
    config.FORM_CREDENCIAL = str(ruta_archivo) if ruta_archivo else ""
    config.FORM_CREDENCIAL_JSON = json_variable or ""
    return config, google_hoja


try:
    print("1. Solo el archivo — como en la máquina de trabajo")
    config, gh = recargar(archivo, None)
    check(config.credencial_lista(), "la encuentra")
    d = gh._credencial()
    check(d["client_email"] == LLAVE_FALSA["client_email"], "la lee entera")

    print("\n2. Solo la variable — como en el contenedor")
    config, gh = recargar(None, json.dumps(LLAVE_FALSA))
    check(config.credencial_lista(), "la encuentra")
    d = gh._credencial()
    check(d["client_email"] == LLAVE_FALSA["client_email"], "la lee entera")

    print("\n3. Las dos a la vez — manda el archivo")
    otra = dict(LLAVE_FALSA, client_email="variable@ejemplo.invalid")
    config, gh = recargar(archivo, json.dumps(otra))
    d = gh._credencial()
    check(d["client_email"] == LLAVE_FALSA["client_email"],
          f"usa la del archivo (leyó {d['client_email']})")

    print("\n4. Ninguna de las dos — lo dice, y dice las dos formas")
    config, gh = recargar(None, None)
    check(not config.credencial_lista(), "sabe que no hay llave")
    try:
        gh._credencial()
        check(False, "debería haber avisado y no avisó")
    except gh.GoogleError as e:
        texto = str(e)
        check("FORM_CREDENCIAL_JSON" in texto, "el aviso nombra la variable")
        check("credenciales" in texto, "el aviso nombra la carpeta")

    print("\n5. Variable con JSON roto — error claro y SIN filtrar la clave")
    roto = '{"private_key": "-----BEGIN PRIVATE KEY-----SECRETO-QUE-NO-DEBE-SALIR'
    config, gh = recargar(None, roto)
    try:
        gh._credencial()
        check(False, "debería haber fallado y no falló")
    except gh.GoogleError as e:
        texto = str(e)
        check("JSON" in texto, "dice que el problema es el formato")
        check("SECRETO-QUE-NO-DEBE-SALIR" not in texto,
              "NO repite el contenido de la llave en el mensaje")

    print("\n6. Variable con JSON válido pero incompleto")
    config, gh = recargar(None, json.dumps({"client_email": "a@b.c"}))
    try:
        gh._credencial()
        check(False, "debería haber fallado y no falló")
    except gh.GoogleError as e:
        check("falta" in str(e), f"dice qué falta ({e})")

finally:
    for k in ("FORM_CREDENCIAL", "FORM_CREDENCIAL_JSON"):
        os.environ.pop(k, None)
    shutil.rmtree(tmp, ignore_errors=True)

print()
if fallos:
    print(f"FALLA: {len(fallos)}")
    for f in fallos:
        print("   ·", f)
    sys.exit(1)
print("TODO BIEN")
