# -*- coding: utf-8 -*-
"""
Copias de seguridad desde la pantalla de Configuración.

POR QUÉ EXISTE
──────────────
Hasta el 10/09/2026 la copia se hacía escribiendo un comando. Eso significa
que la hace quien sabe escribirlo y cuando se acuerda — es decir, casi
nunca, y nunca la persona que más la necesita.

Aquí se envuelve la misma herramienta de siempre (herramientas/respaldo.py)
para que el equipo pueda pulsar un botón. No hay una segunda forma de hacer
copias: es exactamente el mismo código, con las mismas comprobaciones.

QUÉ HACE UNA COPIA
──────────────────
La base entera y los archivos del equipo —contratos, fotos, firmas y
capturas del terminal— en un solo .zip comprobado. La llave de Google se
queda fuera a propósito; ver herramientas/respaldo.py.

Y después intenta sacarla de esta máquina, al servidor. Si no puede —no hay
red, o el sistema corre dentro del contenedor, que no tiene la clave SSH—
NO se considera un fallo: la copia local existe y está verificada. Se dice
lo que pasó y ya está. Una copia en el mismo disco protege de un borrado;
no protege de que el disco muera, y el equipo tiene derecho a saber cuál de
las dos cosas tiene.
"""
import logging
import os
import pathlib
import sys
import threading
from datetime import datetime

log = logging.getLogger("rrhh.respaldos")

RAIZ = pathlib.Path(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
HERRAMIENTAS = RAIZ / "herramientas"
CARPETA = RAIZ / "respaldos"

# Una copia a la vez. Dos a la vez no se corrompen —cada una escribe su
# propio archivo— pero sí duplican el trabajo y confunden al que mira la
# pantalla. Con -w 1 hay un solo proceso, así que este candado basta.
_haciendo = threading.Lock()


def _herramienta(nombre):
    """Importa un módulo de herramientas/ sin instalarlo como paquete.

    Se hace así, y no moviendo el código a backend/, porque la herramienta
    tiene que seguir funcionando desde la línea de comandos aunque el
    servidor no esté levantado: es lo único que queda si la web se cae.
    """
    if str(HERRAMIENTAS) not in sys.path:
        sys.path.insert(0, str(HERRAMIENTAS))
    return __import__(nombre)


def _mirar(p):
    """Datos de un .zip para enseñarlos en pantalla."""
    st = p.stat()
    return {
        "archivo": p.name,
        "bytes": st.st_size,
        "cuando": datetime.fromtimestamp(st.st_mtime).strftime("%Y-%m-%d %H:%M"),
    }


def estado():
    """Qué copias hay y cuándo fue la última, sin hacer ninguna."""
    zips = sorted(CARPETA.glob("*.zip"), key=lambda p: p.stat().st_mtime,
                  reverse=True) if CARPETA.is_dir() else []
    ultima = _mirar(zips[0]) if zips else None
    dias = None
    if ultima:
        dias = (datetime.now()
                - datetime.strptime(ultima["cuando"], "%Y-%m-%d %H:%M")).days
    return {"cuantas": len(zips), "ultima": ultima, "dias": dias,
            "haciendo": _haciendo.locked()}


def hacer():
    """Hace la copia y trata de sacarla de esta máquina.

    Devuelve lo que pasó, sin adornos: si la copia se hizo pero no salió de
    aquí, lo dice. Levanta RuntimeError solo si la copia en sí falló, que es
    lo único que hace inútil el botón.
    """
    if not _haciendo.acquire(blocking=False):
        raise RuntimeError("Ya se está haciendo una copia. Espera a que "
                           "termine y vuelve a intentarlo.")
    try:
        respaldo = _herramienta("respaldo")
        # La herramienta habla por pantalla; aquí eso va al registro.
        zip_local = respaldo.hacer()
        info = _mirar(pathlib.Path(zip_local))
        log.info("respaldo hecho: %s (%s bytes)", info["archivo"], info["bytes"])

        fuera, motivo = False, ""
        try:
            enviar = _herramienta("respaldo_fuera")
            enviar.enviar_zip(zip_local, hablar=lambda t: log.info("%s", t.strip()))
            fuera = True
            log.info("respaldo enviado fuera: %s", info["archivo"])
        except Exception as e:
            # Que no salga de aquí NO invalida la copia. Se dice y se sigue.
            motivo = str(e)[:180]
            log.warning("el respaldo no salió de esta máquina: %s", motivo)

        info["fuera"] = fuera
        info["motivo"] = motivo
        return info
    finally:
        _haciendo.release()
