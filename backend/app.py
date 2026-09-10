# -*- coding: utf-8 -*-
"""
app.py — crea la aplicación y la arranca. Las rutas NO están aquí.

Estuvieron: 131 rutas y 3 219 líneas en este archivo. Cada una era corta
—14,7 líneas de media— así que el problema no era lógica escondida, sino
que no había forma de encontrar nada. El 02/09/2026 se repartieron en
blueprints por familia, dentro de backend/rutas/.

Lo que se quedó aquí es lo que no pertenece a ninguna familia:

  · crear el objeto Flask y su configuración
  · los tres manejadores de error, que valen para toda la aplicación
  · registrar los blueprints
  · main(), que arranca el servidor de la oficina

Ni una URL cambió al partirlo: el mapa de rutas se comparó regla por
regla, método por método, antes y después.

Los ayudantes que compartían las rutas —la respuesta de error
normalizada, quién pregunta, de quién es una ficha— están en
backend/rutas/apoyo.py.
"""
import datetime
import logging
import os
import sys
import webbrowser
from flask import Flask, jsonify, request
import auth
import config
import db


sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
# La consola de Windows usa cp1252: sin esto, cualquier acento en un log
# (y los hay, todos los mensajes están en español) revienta el proceso con
# UnicodeEncodeError en mitad de una operación.
for _flujo in (sys.stdout, sys.stderr):
    try:
        _flujo.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("rrhh")
RAIZ = config.RAIZ_PROYECTO
INTERFAZ = "ERP RRHH - Lost Children Peru.dc.html"
# El .dc.html es un archivo GENERADO desde interfaz/ (ver construir_interfaz.py
# y PLAN-MANANA.md). Se reconstruye a cada arranque para que editar una pieza
# y recargar el navegador baste — sin acordarse de ningún paso extra. Si
# falta una pieza o un módulo, esto revienta el arranque a propósito: servir
# la versión vieja en silencio sería peor que no arrancar.
sys.path.insert(0, RAIZ)
# Se importa AQUÍ, no arriba con los demás: construir_interfaz.py vive en la
# raíz del proyecto, no en backend/, así que hasta esta línea no existe para
# Python. Al partir app.py en blueprints subió por error al bloque de arriba
# y el servidor dejó de arrancar — lo cazó levantarlo de verdad, no el que
# la aplicación importara sin quejarse.
import construir_interfaz
construir_interfaz.escribir()
log.info("interfaz reconstruida desde interfaz/")
app = Flask(__name__, static_folder=None)
# Lo único que la página pide del disco, aparte de ella misma. Es una
# lista de lo PERMITIDO, no de lo prohibido: una lista de prohibidos nunca
# está completa, y lo que se olvide se publica. Aquí lo que se olvide
# simplemente no se sirve, que es el fallo correcto.
PUBLICABLES = ("support.js", "image-slot.js")
PREFIJOS_PUBLICABLES = ("_ds/", "web/")
# Sesiones e incidencias son cosas distintas —una es acompañamiento
# planificado y la otra algo que pasó— pero viven en la misma pantalla y se
# guardan igual. Lo que sigue es lo que tenían en común, escrito una vez.

# De qué tabla sale cada cosa. Se escribe aquí y no se recibe de fuera: el
# nombre de una tabla no puede venir de una petición.
_TABLA_ACOMP = {
    "sesion": ("sesiones_acompanamiento", "la sesión"),
    "incidencia": ("incidencias", "la incidencia"),
}
# ── Manejadores de error ──────────────────────────────────────────────────
#
# Van aquí y no en un blueprint porque valen para toda la aplicación: un
# 404 puede venir de cualquier familia, o de ninguna.
@app.errorhandler(404)
def _no_existe(e):
    if _es_api():
        return jsonify({"ok": False,
                        "error": f"No existe la dirección {request.path}"}), 404
    return e
@app.errorhandler(405)
def _metodo_no_admitido(e):
    if _es_api():
        return jsonify({"ok": False,
                        "error": f"{request.method} no está permitido en {request.path}"}), 405
    return e
@app.errorhandler(500)
def _reventon(e):
    if _es_api():
        # El detalle va al registro, no a la respuesta: puede llevar rutas
        # del servidor o fragmentos de consulta.
        app.logger.exception("error no capturado en %s", request.path)
        return jsonify({"ok": False,
                        "error": "Algo falló en el servidor. Quedó anotado en el registro."}), 500
    return e


# ── Las rutas ─────────────────────────────────────────────────────────────
#
# Una línea. Añadir una familia nueva es crear su módulo en rutas/ y
# ponerlo en la lista de rutas/__init__.py; este archivo no se toca.
# Igual que arriba: los módulos de rutas importan db, auth y config, que
# solo existen una vez backend/ está en la ruta de búsqueda.
# Los manejadores de error de abajo usan estos ayudantes, que viven
# con las rutas desde que app.py se partió en blueprints.
from rutas.apoyo import _es_api
from rutas import TODOS

for _bp in TODOS:
    app.register_blueprint(_bp)


# ══════════════════════════════════════════════════════════════════════════

def main():
    db.iniciar()
    # Los tokens que quedaran en claro pasan a huella. Nadie se queda fuera.
    pasados = auth.migrar_tokens()
    if pasados:
        log.info("sesiones migradas a huella: %s", pasados)

    # Trae las marcas del terminal solo, cada pocos segundos. Va aquí y no
    # al importar el módulo a propósito: las suites de prueba importan
    # `app` muchas veces, y no deben abrir hilos hablando con yunatt de
    # verdad. Ver backend/sincronizador.py.
    import sincronizador
    sincronizador.arrancar()

    ok, faltan = config.configurado()
    url = f"http://127.0.0.1:{config.PUERTO}/"

    print()
    print("  Módulo RRHH — Lost Children Perú")
    print("  " + "-" * 58)
    print(f"  Interfaz         {url}")
    print(f"  Rango reservado  staffNumber >= {config.STAFF_NUMBER_BASE}"
          f"{'  (estricto)' if config.RANGO_ESTRICTO else '  (SIN restricción)'}")
    print(f"  Departamento     {config.DEPT_NAME or '(sin definir)'}")
    import sondeo_formulario
    print(f"  Formulario       {sondeo_formulario.arrancar()}")
    if ok:
        print("  Yunatt           credenciales cargadas")
    else:
        print("  Yunatt           SIN CONFIGURAR — falta: " + ", ".join(faltan))
        print("                   copia backend/.env.example a backend/.env")
    print("  " + "-" * 58)
    print()

    if os.environ.get("WERKZEUG_RUN_MAIN") != "true":
        try:
            webbrowser.open(url)
        except Exception:
            pass

    app.run(host="127.0.0.1", port=config.PUERTO, debug=False, threaded=True)


if __name__ == "__main__":
    main()
