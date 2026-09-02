# -*- coding: utf-8 -*-
"""
sincronizador.py — trae las marcas del Timmy solo, cada pocos segundos.

POR QUÉ EXISTE
──────────────
Hasta hoy las marcas del terminal solo entraban cuando alguien pulsaba
«sincronizar» en la pantalla. El resto del tiempo, alguien podía fichar y
el sistema no enterarse: la web se actualiza sola, sí, pero solo refleja
lo que ya está en la base, y en la base no había nada porque nadie lo
había traído.

Esto cierra ese hueco. Un hilo de fondo pregunta a yunatt cada rato y
guarda lo nuevo. Como la pantalla ya vigila la base cada pocos segundos
(/api/novedades), en cuanto una marca entra aparece sola, sin recargar.

POR QUÉ NO ARRANCA AL IMPORTAR
──────────────────────────────
Se arranca a mano desde servidor.py y wsgi.py, no al importar `app`. Las
suites de prueba importan `app` decenas de veces: si esto arrancara solo,
cada corrida abriría hilos hablando con yunatt de verdad —con la cuenta
real, contra el terminal real— y además ensuciaría el banco de pruebas.

CUIDADOS CON EL PROVEEDOR
─────────────────────────
La plataforma de yunatt va irregular: hay ratos que corta la conexión o
tarda. Por eso:

  · un fallo NUNCA sale de aquí: se apunta y se sigue
  · tras fallar se espera más (hasta 5 minutos) en vez de insistir cada
    minuto contra un servidor que ya dijo que no
  · al volver a funcionar se recupera el ritmo normal de inmediato
  · si faltan credenciales ni se intenta
"""
import logging
import threading
import time

import config

log = logging.getLogger("rrhh.sincronizador")

# Cada cuánto se pregunta cuando todo va bien. 45s es el equilibrio entre
# que una marca tarde poco en verse y no castigar una plataforma que ya
# demostró ir justa.
CADA = int(config.env("SINCRONIZAR_CADA", "45") or 0)

# Al fallar se espera cada vez más, hasta este techo.
ESPERA_MAXIMA = 300

_hilo = None
_ultimo = {"cuando": None, "nuevas": 0, "error": "", "intentos": 0}


def estado():
    """Lo último que le pasó al sincronizador, para poder enseñarlo."""
    return dict(_ultimo)


def _vuelta():
    """Una pasada. Devuelve los segundos a esperar antes de la siguiente."""
    import enrolamiento  # aquí dentro: al importar aún no existe

    ok, faltan = config.configurado()
    if not ok:
        _ultimo["error"] = "faltan credenciales: " + ", ".join(faltan)
        return ESPERA_MAXIMA

    try:
        r = enrolamiento.sincronizar_marcas()
        _ultimo.update(cuando=time.strftime("%Y-%m-%d %H:%M:%S"),
                       nuevas=r.get("nuevas", 0), error="", intentos=0)
        if r.get("nuevas"):
            log.info("sincronizador: %s marcas nuevas", r["nuevas"])
        return CADA
    except Exception as e:
        _ultimo["intentos"] += 1
        _ultimo["error"] = f"{type(e).__name__}: {e}"
        espera = min(CADA * (2 ** _ultimo["intentos"]), ESPERA_MAXIMA)
        log.warning("sincronizador: falló (%s). Siguiente intento en %ss",
                    str(e)[:120], espera)
        return espera


def _bucle():
    # Un respiro antes de la primera vuelta: al arrancar el servidor ya hay
    # bastante que hacer, y una marca de hace un minuto puede esperar diez
    # segundos más.
    time.sleep(10)
    while True:
        time.sleep(max(5, _vuelta()))


def arrancar():
    """
    Pone en marcha el hilo. Llamar UNA vez, desde el arranque del servidor.

    Con SINCRONIZAR_CADA=0 no arranca: es la forma de apagarlo sin tocar
    código —útil si algún día conviene que nadie hable con yunatt—.
    """
    global _hilo
    if _hilo is not None:
        return False
    if CADA <= 0:
        log.info("sincronizador apagado (SINCRONIZAR_CADA=0)")
        return False
    _hilo = threading.Thread(target=_bucle, name="sincronizador", daemon=True)
    _hilo.start()
    log.info("sincronizador en marcha: cada %ss", CADA)
    return True
