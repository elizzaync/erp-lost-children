# -*- coding: utf-8 -*-
"""
Arranca el servidor SIEMPRE en el mismo puerto.

    py backend\\servidor.py            levanta en el 7801
    py backend\\servidor.py --estado   dice qué hay escuchando
    py backend\\servidor.py --parar    lo baja y no arranca nada

Por qué existe este archivo y no se llama directamente a app.py:

Si el 7801 ya está ocupado —un servidor anterior que quedó vivo tras cerrar
la consola, o un arranque duplicado— Flask falla o el sistema operativo
entrega la conexión al proceso viejo. El resultado es que la misma URL
muestra una versión antigua del código, o una base distinta, y parece que el
login «no funciona» cuando lo que falla es a quién le estás hablando.

Así que aquí se libera el puerto ANTES de arrancar, en vez de saltar a otro.
La dirección no cambia nunca: http://127.0.0.1:7801/

Los puertos 7802 y siguientes quedan reservados para las suites de prueba,
que levantan sus propios servidores contra COPIAS de la base. Nunca hay que
entrar a esos: tienen otros datos y otras cuentas.
"""
import os
import re
import socket
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8")

import config

# 7801 es el del equipo y no se mueve. El banco de pruebas se levanta en
# otro (7802) pasando PUERTO_SERVIDOR, para no quitarle la ventana a quien
# esté trabajando con la aplicación abierta.
PUERTO = int(os.environ.get("PUERTO_SERVIDOR") or 7801)
URL = f"http://127.0.0.1:{PUERTO}/"


def _pids_en(puerto):
    """Qué procesos tienen ese puerto en escucha, según netstat."""
    try:
        salida = subprocess.run(["netstat", "-ano"], capture_output=True,
                                text=True, timeout=20).stdout
    except Exception:
        return []
    pids = set()
    for linea in salida.splitlines():
        if "LISTENING" not in linea.upper():
            continue
        if not re.search(rf"[:.]{puerto}\b", linea):
            continue
        partes = linea.split()
        if partes and partes[-1].isdigit() and partes[-1] != "0":
            pids.add(int(partes[-1]))
    return sorted(pids)


def _nombre(pid):
    try:
        salida = subprocess.run(["tasklist", "/FI", f"PID eq {pid}", "/FO", "CSV"],
                                capture_output=True, text=True, timeout=15).stdout
        filas = [l for l in salida.splitlines() if l.startswith('"')]
        return filas[-1].split('","')[0].strip('"') if len(filas) > 1 else "?"
    except Exception:
        return "?"


def _libre(puerto):
    with socket.socket() as s:
        s.settimeout(0.4)
        return s.connect_ex(("127.0.0.1", puerto)) != 0


def liberar():
    """
    Mata lo que tenga el 7801. Solo procesos de Python: si el puerto lo
    tuviera otra cosa —algo del sistema, otro servicio— matarlo a ciegas
    sería peor que el problema que resuelve, así que se avisa y se para.
    """
    pids = _pids_en(PUERTO)
    if not pids:
        return True
    for pid in pids:
        nombre = _nombre(pid)
        if "python" not in nombre.lower() and "py" != nombre.lower():
            print(f"  El puerto {PUERTO} lo tiene {nombre} (PID {pid}), que no es")
            print( "  el servidor de este proyecto. No lo mato: revísalo a mano.")
            return False
        print(f"  bajando el servidor anterior · {nombre} PID {pid}")
        subprocess.run(["taskkill", "/F", "/PID", str(pid)],
                       capture_output=True, text=True)
    for _ in range(20):
        time.sleep(0.25)
        if _libre(PUERTO):
            return True
    print(f"  el puerto {PUERTO} sigue ocupado")
    return False


def estado():
    pids = _pids_en(PUERTO)
    if not pids:
        print(f"  {PUERTO} libre · no hay servidor levantado")
        return 0
    for pid in pids:
        print(f"  {PUERTO} ocupado por {_nombre(pid)} (PID {pid})")
    print(f"  {URL}")
    return 0


def main():
    if "--estado" in sys.argv:
        return estado()

    print()
    print("  Módulo RRHH — Lost Children Perú")
    print("  " + "─" * 56)
    if not liberar():
        return 1
    if "--parar" in sys.argv:
        print(f"  servidor detenido · {PUERTO} libre")
        return 0

    print(f"  dirección FIJA   {URL}")
    print( "  (7802 en adelante son las suites de prueba: no entrar ahí)")
    print("  " + "─" * 56)
    print()

    entorno = dict(os.environ, PUERTO=str(PUERTO))
    raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    try:
        return subprocess.call([sys.executable, os.path.join(raiz, "backend", "app.py")],
                               env=entorno, cwd=raiz)
    except KeyboardInterrupt:
        print("\n  servidor detenido")
        return 0


if __name__ == "__main__":
    sys.exit(main())
