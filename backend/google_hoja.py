# -*- coding: utf-8 -*-
"""
google_hoja.py — leer la hoja de respuestas del formulario de tutores.

POR QUÉ NO SE USAN LAS LIBRERÍAS DE GOOGLE

Este equipo comparte su Python con el ERP anterior, que sigue en
producción; requirements.txt lo dice y por eso ni siquiera fija versiones.
Instalar google-api-python-client arrastra protobuf, httplib2 y media
docena más de paquetes en ese mismo intérprete, para hacer dos peticiones
HTTP.

Lo que hace falta de verdad es poco: firmar un JWT con la clave privada de
la cuenta de servicio, cambiarlo por un token, y pedir un rango de celdas.
La firma la hace 'cryptography', que ya estaba instalado, y las peticiones
'requests', que también. Cero dependencias nuevas.

QUÉ PUEDE Y QUÉ NO

Solo lee. El permiso pedido es spreadsheets.readonly, y en la hoja la
cuenta figura como Lector: aunque este archivo tuviera un fallo, no puede
modificar lo que las familias enviaron.
"""
import base64
import json
import time

import requests
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

import config

TOKEN_URI = "https://oauth2.googleapis.com/token"
# Solo lectura. Con este alcance, Google rechazaría cualquier escritura
# aunque se le pidiera.
ALCANCE = "https://www.googleapis.com/auth/spreadsheets.readonly"
API = "https://sheets.googleapis.com/v4/spreadsheets"

# Un token de Google dura una hora; se pide de nuevo un poco antes para no
# quedarse con uno recién caducado a mitad de una lectura.
MARGEN_SEGUNDOS = 60

_token = {"valor": "", "caduca": 0}


class GoogleError(Exception):
    """No se pudo leer la hoja. El mensaje es para quien lo lee, no un volcado."""


def _credencial():
    if not config.credencial_lista():
        raise GoogleError(
            "No está la llave de Google. Debería estar en "
            f"{config.FORM_CREDENCIAL or 'data/credenciales/'} — se genera en "
            "console.cloud.google.com, en la cuenta de servicio.")
    with open(config.FORM_CREDENCIAL, encoding="utf-8") as fh:
        d = json.load(fh)
    faltan = [k for k in ("client_email", "private_key", "token_uri") if not d.get(k)]
    if faltan:
        raise GoogleError(f"La llave de Google está incompleta: falta {', '.join(faltan)}.")
    return d


def _b64(datos):
    """base64 de URL y sin relleno, que es como lo quiere un JWT."""
    return base64.urlsafe_b64encode(datos).rstrip(b"=")


def _jwt_firmado(cred):
    ahora = int(time.time())
    cabecera = {"alg": "RS256", "typ": "JWT"}
    cuerpo = {
        "iss": cred["client_email"],
        "scope": ALCANCE,
        "aud": cred.get("token_uri") or TOKEN_URI,
        "iat": ahora,
        "exp": ahora + 3600,
    }
    sin_firma = (_b64(json.dumps(cabecera).encode())
                 + b"." + _b64(json.dumps(cuerpo).encode()))
    clave = serialization.load_pem_private_key(
        cred["private_key"].encode(), password=None)
    firma = clave.sign(sin_firma, padding.PKCS1v15(), hashes.SHA256())
    return (sin_firma + b"." + _b64(firma)).decode()


def token():
    """
    Un token de acceso válido, reutilizado mientras dure.

    Se guarda en memoria del proceso: pedirlo en cada lectura sería una
    ida y vuelta a Google por cada consulta, y Google los da por horas.
    """
    if _token["valor"] and time.time() < _token["caduca"] - MARGEN_SEGUNDOS:
        return _token["valor"]

    cred = _credencial()
    try:
        r = requests.post(cred.get("token_uri") or TOKEN_URI, timeout=20, data={
            "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
            "assertion": _jwt_firmado(cred),
        })
    except requests.RequestException as e:
        raise GoogleError(f"No se pudo contactar con Google: {e}")

    if r.status_code != 200:
        detalle = ""
        try:
            d = r.json()
            detalle = d.get("error_description") or d.get("error") or ""
        except ValueError:
            detalle = r.text[:120]
        if "invalid_grant" in detalle:
            detalle += (". Suele significar que la hora del equipo está "
                        "desfasada, o que la llave fue revocada.")
        raise GoogleError(f"Google rechazó la llave: {detalle}")

    d = r.json()
    _token["valor"] = d["access_token"]
    _token["caduca"] = time.time() + int(d.get("expires_in") or 3600)
    return _token["valor"]


def _pedir(ruta, params=None):
    hoja = (config.FORM_HOJA_ID or "").strip()
    if not hoja:
        raise GoogleError("No está configurada la hoja de respuestas "
                          "(FORM_HOJA_ID en backend/.env).")
    try:
        r = requests.get(f"{API}/{hoja}{ruta}", timeout=25,
                         headers={"Authorization": "Bearer " + token()},
                         params=params or {})
    except requests.RequestException as e:
        raise GoogleError(f"No se pudo contactar con Google: {e}")

    if r.status_code == 403:
        # Un 403 puede ser dos cosas muy distintas: la hoja no está
        # compartida, o la API no está habilitada en ese proyecto. Adivinar
        # una de las dos manda a buscar donde no es, así que se enseña lo
        # que dice Google —que además trae el enlace para arreglarlo— y se
        # añade la pista propia solo cuando encaja.
        motivo = ""
        try:
            err = r.json().get("error", {})
            motivo = err.get("message") or ""
        except ValueError:
            motivo = r.text[:200]
        if "has not been used in project" in motivo or "SERVICE_DISABLED" in r.text:
            raise GoogleError("Falta habilitar la API de Google Sheets en el "
                              "proyecto de la cuenta de servicio. " + motivo)
        raise GoogleError(
            "Google no deja leer esa hoja: " + (motivo or "sin detalle") +
            " · Suele ser que no esté compartida con la cuenta de servicio "
            "como Lector.")
    if r.status_code == 404:
        raise GoogleError("No existe esa hoja, o el identificador está mal copiado.")
    if r.status_code != 200:
        raise GoogleError(f"Google respondió {r.status_code}: {r.text[:120]}")
    return r.json()


def comprobar():
    """
    ¿La llave abre la hoja? Devuelve un resumen para enseñar, sin datos
    de nadie: solo el título, las pestañas y cuántas filas hay.
    """
    d = _pedir("", {"fields": "properties.title,sheets.properties"})
    pestanas = [s["properties"]["title"] for s in d.get("sheets", [])]
    filas = 0
    if pestanas:
        v = _pedir(f"/values/{requests.utils.quote(pestanas[0])}!A:A",
                   {"majorDimension": "COLUMNS"})
        columna = (v.get("values") or [[]])[0]
        # La primera fila son los encabezados que pone Google Forms.
        filas = max(0, len(columna) - 1)
    return {"titulo": d.get("properties", {}).get("title", ""),
            "pestanas": pestanas, "respuestas": filas}


def filas(pestana=None):
    """
    Todas las respuestas, como lista de diccionarios {encabezado: valor}.

    Se devuelven en crudo, tal y como Google las entrega: normalizarlas es
    trabajo de quien las ingresa, y la bandeja guarda además el original.
    """
    if not pestana:
        d = _pedir("", {"fields": "sheets.properties.title"})
        hojas = [s["properties"]["title"] for s in d.get("sheets", [])]
        if not hojas:
            return []
        pestana = hojas[0]
    v = _pedir(f"/values/{requests.utils.quote(pestana)}")
    valores = v.get("values") or []
    if len(valores) < 2:
        return []
    encabezados = [str(c).strip() for c in valores[0]]
    salida = []
    for fila in valores[1:]:
        # Google recorta las celdas vacías del final de cada fila.
        fila = list(fila) + [""] * (len(encabezados) - len(fila))
        salida.append(dict(zip(encabezados, fila)))
    return salida
