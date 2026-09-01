# -*- coding: utf-8 -*-
"""
Convierte unas coordenadas en el nombre de un sitio.

POR QUÉ EXISTE
──────────────
«A 1000 metros de la sede» no dice dónde está nadie. Si alguien fichó desde
China, lo que hace falta leer es «China», no una distancia. Y unas
coordenadas —«-12.0210, -77.1040»— tampoco: nadie las lee.

El nombre de un lugar no está en las coordenadas. Hay que preguntárselo a
alguien que tenga el mapa.

A QUIÉN SE LE PREGUNTA, Y QUÉ SE LE CUENTA
──────────────────────────────────────────
A Nominatim, el servicio de OpenStreetMap. Es de una fundación sin ánimo
de lucro, es gratuito y no pide registro ni clave.

Pero conviene ser claro sobre el precio real: CADA CONSULTA LE DICE A UN
TERCERO DÓNDE ESTUVO UNA PERSONA DE LA CASA. No su nombre —solo van las
coordenadas— pero sí el lugar y el momento.

Por eso:

  · Solo se consulta al GUARDAR una marca, una vez. Nunca al mirar la
    lista: si se hiciera al pintar la pantalla, abrir el Registro de
    Asistencia mandaría fuera la ubicación de todo el equipo cada vez.

  · El nombre se guarda con la marca. Si mañana el servicio desaparece o
    se decide dejar de usarlo, lo ya registrado sigue ahí.

  · Se redondean las coordenadas antes de consultar y se recuerda la
    respuesta. Diez personas fichando en la misma puerta son UNA consulta,
    no diez.

  · Si no contesta en tres segundos, se sigue sin nombre. Una marca no se
    pierde nunca por esto.

CÓMO SE APAGA
─────────────
Poniendo LUGARES_ACTIVO=0 en el entorno. Se deja de preguntar y las marcas
nuevas se guardan sin nombre; nada más deja de funcionar.
"""
import json
import logging
import os
import threading
import time
import urllib.parse
import urllib.request

log = logging.getLogger("rrhh.lugares")

SERVICIO = "https://nominatim.openstreetmap.org/reverse"

# La política de uso de Nominatim EXIGE identificarse y no pasar de una
# consulta por segundo. Cumplirlo no es cortesía: es la condición para
# poder usarlo.
AGENTE = "ModuloRRHH-LostChildrenPeru/1.0 (ONG; asistencia interna)"
ESPERA_MINIMA = 1.1          # segundos entre consultas
TIEMPO_LIMITE = 3            # nunca se hace esperar más a quien marca

# Redondeo a cuatro decimales: unos 11 metros. Suficiente para que la misma
# puerta sea siempre la misma clave, y para no acumular un rastro más fino
# del que hace falta.
DECIMALES = 4

_cache = {}
_lock = threading.Lock()
_ultima = [0.0]


def activo():
    return os.environ.get("LUGARES_ACTIVO", "1") not in ("0", "no", "false")


def _clave(lat, lon):
    return (round(float(lat), DECIMALES), round(float(lon), DECIMALES))


def _resumir(datos):
    """
    De la respuesta larga de Nominatim, la línea que una persona leería.

    Se arma de lo fino a lo grueso y se cortan las tres primeras piezas que
    haya: «Comas, Lima, Perú» dice mucho más que la dirección postal
    completa con código y todo, que no cabe en una fila de tabla.
    """
    d = (datos or {}).get("address") or {}
    piezas = []
    for clave in ("road", "neighbourhood", "suburb", "city_district",
                  "town", "city", "county", "state", "country"):
        v = d.get(clave)
        if v and v not in piezas:
            piezas.append(v)
    if not piezas:
        return (datos or {}).get("display_name", "")[:120]
    return ", ".join(piezas[:3])


def nombre_de(lat, lon):
    """
    El nombre del sitio, o cadena vacía si no se pudo saber.

    Nunca levanta: quien llama está guardando una marca y esa marca tiene
    que entrar pase lo que pase.
    """
    if lat is None or lon is None or not activo():
        return ""
    try:
        clave = _clave(lat, lon)
    except (TypeError, ValueError):
        return ""

    with _lock:
        if clave in _cache:
            return _cache[clave]

    url = SERVICIO + "?" + urllib.parse.urlencode({
        "lat": clave[0], "lon": clave[1], "format": "jsonv2",
        "zoom": 16, "accept-language": "es",
    })
    try:
        with _lock:
            # El minuto de cortesía con Nominatim, cumplido de verdad.
            espera = ESPERA_MINIMA - (time.time() - _ultima[0])
            if espera > 0:
                time.sleep(min(espera, ESPERA_MINIMA))
            _ultima[0] = time.time()
        pedido = urllib.request.Request(url, headers={"User-Agent": AGENTE})
        with urllib.request.urlopen(pedido, timeout=TIEMPO_LIMITE) as r:
            datos = json.loads(r.read().decode("utf-8"))
        nombre = _resumir(datos)
    except Exception as e:
        log.warning("no se pudo nombrar %s: %s", clave, e)
        nombre = ""

    if nombre:
        with _lock:
            _cache[clave] = nombre
    return nombre
