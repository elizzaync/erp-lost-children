# -*- coding: utf-8 -*-
"""
sondeo_formulario.py — mirar la hoja cada tanto, sin que nadie pulse nada.

POR QUÉ

El botón «Traer respuestas» sirve cuando alguien está delante. Pero una
familia responde un sábado por la noche, y esa ficha debería estar en la
bandeja el lunes por la mañana sin que nadie se acuerde de ir a buscarla.

QUÉ NO HACE

No ingresa nada. Trae a la bandeja, exactamente igual que el botón, y ahí
se queda esperando a una persona. El sondeo no cambia el trato.

CUÁNDO NO ARRANCA

  · si no hay llave de Google o no hay hoja configurada
  · si el intervalo se pone en 0
  · en las suites de prueba, que corren contra copias y no deben salir a
    internet: lo arranca servidor.py, no el import de app.py

CÓMO FALLA

Sin ruido y sin morirse. Un corte de internet, Google caído o la llave
revocada dejan un aviso en el registro y el hilo sigue vivo, esperando al
siguiente intento. Si falla varias veces seguidas espacia los intentos:
insistir cada minuto contra algo que no está no arregla nada y llena el
registro de lo mismo.
"""
import logging
import threading
import time

import config

log = logging.getLogger("rrhh")

# Tras varios fallos seguidos se espera más entre intentos, hasta este tope.
ESPERA_MAXIMA = 30 * 60

_hilo = None

# La última vuelta: cuándo fue y cómo acabó. Se enseña en la pantalla de
# la bandeja para que se pueda ver si esto está vivo.
ultimo = {"cuando": "", "resultado": "todavía no ha mirado", "ok": True}


def _una_vuelta():
    """Un intento. Devuelve True si salió bien."""
    # Se importan aquí y no arriba: así este módulo se puede cargar sin
    # arrastrar la base ni el cliente de Google cuando no se va a usar.
    import formulario

    r = formulario.traer()
    if r["nuevas"]:
        log.info("formulario: %s respuesta(s) nueva(s) en la bandeja", r["nuevas"])
    return r


def _bucle(minutos):
    espera = minutos * 60
    fallos = 0
    # Un respiro antes del primer intento: al arrancar, el servidor tiene
    # cosas más urgentes que hacer que hablar con Google.
    time.sleep(30)
    while True:
        try:
            r = _una_vuelta()
            ultimo.update(
                cuando=time.strftime("%Y-%m-%d %H:%M:%S"),
                ok=True,
                resultado=("sin novedades" if not r["nuevas"]
                           else ("1 respuesta nueva" if r["nuevas"] == 1
                                 else f"{r['nuevas']} respuestas nuevas")))
            fallos = 0
            espera = minutos * 60
        except Exception as e:
            ultimo.update(cuando=time.strftime("%Y-%m-%d %H:%M:%S"), ok=False,
                          resultado="no se pudo mirar: " + str(e)[:90])
            fallos += 1
            # Un solo aviso por fallo, sin volcado: el detalle no ayuda a
            # quien mira el registro y sí lo llena.
            log.warning("formulario: no se pudo traer (%s intento seguido): %s",
                        fallos, str(e)[:140])
            espera = min(ESPERA_MAXIMA, espera * 2)
        time.sleep(espera)


def arrancar():
    """
    Pone en marcha el sondeo si procede. Devuelve qué se hizo, para que el
    arranque del servidor pueda decirlo por pantalla.
    """
    global _hilo

    minutos = int(getattr(config, "FORM_MINUTOS_SONDEO", 0) or 0)
    ultimo["cada"] = minutos
    if minutos <= 0:
        ultimo["resultado"] = "desactivado"
        return "desactivado (FORM_MINUTOS_SONDEO=0)"
    if not config.credencial_lista():
        return "sin llave de Google: no se sondea"
    if not (config.FORM_HOJA_ID or "").strip():
        return "sin hoja configurada: no se sondea"
    if _hilo and _hilo.is_alive():
        return "ya estaba en marcha"

    _hilo = threading.Thread(target=_bucle, args=(minutos,),
                             name="sondeo-formulario", daemon=True)
    _hilo.start()
    return f"cada {minutos} min"
