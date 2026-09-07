# -*- coding: utf-8 -*-
"""Que el contenedor arranque TODO lo que arranca la máquina de trabajo.

POR QUÉ EXISTE
──────────────
Hay dos formas de levantar este sistema y no hacen lo mismo:

  · aquí            `py backend/app.py`  →  pasa por app.main()
  · en el contenedor `gunicorn wsgi:app` →  NO pasa por app.main()

gunicorn no ejecuta `main()`: importa el objeto `app` y sirve. Todo lo que
se arranca dentro de `main()` sencillamente no existe en producción.

Ya mordió dos veces:

  1. La base no se creaba (por eso existe wsgi.py).
  2. El sincronizador de marcas no corría.
  3. El 07/09/2026, el sondeo del formulario. Las respuestas de las
     familias solo llegaban si alguien abría la pantalla y pulsaba el
     botón — y no se notaba, porque una bandeja vacía se ve igual tanto si
     no hay respuestas nuevas como si nadie las está trayendo.

Los tres son el mismo fallo. Y ninguno se ve desde aquí: en esta máquina
todo funciona porque app.main() sí corre.

QUÉ COMPRUEBA
─────────────
Arranca wsgi.py como lo arranca gunicorn, en las condiciones del
contenedor —base recién creada y SIN backend/.env— y exige que los dos
trabajos de fondo digan que se pusieron en marcha.

El «sin .env» es de verdad: se apunta RRHH_ENV_PATH a un archivo que no
existe ANTES de importar config. Hasta el 07/09/2026 la simulación lo hacía
después, y como todas las constantes se calculan al importar, seguía
leyendo el .env de la máquina y daba una tranquilidad falsa.
"""
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile

sys.stdout.reconfigure(encoding="utf-8")
RAIZ = pathlib.Path(__file__).resolve().parent.parent

fallos = []


def check(c, m):
    print(("  OK    " if c else "  FALLO ") + m)
    if not c:
        fallos.append(m)


GUION = '''
import logging, os, sys
logging.basicConfig(level=logging.INFO, format="%(name)s: %(message)s")
sys.path.insert(0, r"{backend}")
os.chdir(r"{raiz}")
import wsgi
print("ARRANCO")
'''

tmp = pathlib.Path(tempfile.mkdtemp())
try:
    print("1. Se arranca wsgi.py como lo arranca gunicorn, sin .env")

    entorno = dict(os.environ)
    entorno["RRHH_ENV_PATH"] = str(tmp / "no-existe.env")
    entorno["DB_PATH"] = str(tmp / "rrhh.db")
    # Que no intente hablar con nadie: sin credenciales no hay red.
    for k in ("YUNATT_EMAIL", "YUNATT_PASSWORD", "YUNATT_DEVICE_ID",
              "YUNATT_DEPT_ID", "FORM_CREDENCIAL", "FORM_CREDENCIAL_JSON",
              "FORM_HOJA_ID"):
        entorno.pop(k, None)

    guion = tmp / "arranca.py"
    guion.write_text(GUION.format(backend=RAIZ / "backend", raiz=RAIZ),
                     encoding="utf-8")

    r = subprocess.run([sys.executable, str(guion)], capture_output=True,
                       text=True, encoding="utf-8", errors="replace",
                       env=entorno, timeout=180)
    salida = (r.stdout or "") + (r.stderr or "")

    check(r.returncode == 0, "arranca sin caerse")
    check("ARRANCO" in salida, "llega hasta el final")
    if r.returncode != 0:
        print("\n--- lo que dijo ---")
        print(salida[-1500:])

    print("\n2. Se ponen en marcha los trabajos de fondo")
    check("esquema verificado" in salida, "la base se crea sola")
    check("sincronizador" in salida, "el sincronizador de marcas arranca")
    check("formulario" in salida, "el sondeo del formulario arranca")

    print("\n3. Sin .env de verdad: sabe que no hay llave")
    # Si estuviera leyendo el .env de esta máquina diría "cada 10 min",
    # porque aquí la llave sí está. Que diga "sin llave" demuestra que el
    # aislamiento funciona y la prueba vale para algo.
    check("sin llave" in salida or "sin hoja" in salida,
          "el sondeo dice que le falta configuración (no está leyendo el "
          ".env de esta máquina)")

finally:
    shutil.rmtree(tmp, ignore_errors=True)

print()
if fallos:
    print(f"FALLA: {len(fallos)}")
    for f in fallos:
        print("   ·", f)
    sys.exit(1)
print("TODO BIEN")
