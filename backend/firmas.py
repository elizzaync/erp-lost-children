# -*- coding: utf-8 -*-
"""
firmas.py — la firma dibujada de una persona.

QUÉ ES Y QUÉ NO ES

Es una firma gráfica: el trazo que alguien dibuja con el ratón o con el
dedo. NO es firma digital certificada —eso exige un certificado acreditado
por RENIEC— y no convierte el documento en prueba plena.

Lo que da valor a la aprobación no es el dibujo: es que el sistema sepa
quién la hizo, desde qué cuenta y cuándo, y eso ya se guarda en la propia
solicitud. La firma sirve para que el papel se parezca al papel que se
firmaba a mano, y para que quien lo archive reconozca de un vistazo quién
autorizó.

POR QUÉ NO ESTÁ EN fotos.py

Una foto de persona se endereza por EXIF y se reduce a 1024 px porque
viene de una cámara. Una firma llega de un lienzo del navegador: no tiene
EXIF, es línea negra sobre fondo transparente, y lo que hay que hacerle es
justo lo contrario —ponerle fondo blanco y recortar el aire alrededor, que
es casi todo el lienzo—. Mezclar los dos tratamientos obligaría a que cada
llamada dijera cuál quiere.

QUÉ SE LE HACE

  · Se recorta el aire. Quien firma usa un tercio del lienzo; sin recortar,
    la firma sale diminuta en un rectángulo enorme.
  · Se pone sobre blanco. El PDF incrusta JPEG, que no tiene transparencia:
    sin este paso el fondo saldría negro.
  · Se reduce a 600 px de ancho. Es más de lo que cualquier papel necesita
    y pesa unos pocos kilobytes.
"""
import base64
import binascii
import io
import logging
import os
import secrets

from PIL import Image

import config

log = logging.getLogger(__name__)

# Un trazo son unos pocos KB. Este techo es para que un envío raro no
# llegue nunca a PIL, no para acotar firmas de verdad.
MAX_BYTES = 2 * 1024 * 1024

ANCHO_MAX = 600
CALIDAD = 90

# Margen que se deja alrededor del trazo al recortar, en píxeles.
AIRE = 12


class FirmaError(ValueError):
    """Motivo que se le puede enseñar a quien firmó."""


def _carpeta():
    ruta = getattr(config, "FIRMAS_DIR", None)
    if not ruta:
        ruta = os.path.join(os.path.dirname(config.FOTOS_DIR), "firmas")
    os.makedirs(ruta, exist_ok=True)
    return ruta


def _bytes_de(dato_url):
    """Los bytes de un data: URL de imagen, o FirmaError."""
    texto = str(dato_url or "").strip()
    if not texto.startswith("data:image/"):
        raise FirmaError("Eso no parece una firma dibujada.")
    if "," not in texto:
        raise FirmaError("La firma llegó incompleta.")
    cabecera, cuerpo = texto.split(",", 1)
    if "base64" not in cabecera:
        raise FirmaError("La firma llegó en un formato que no se entiende.")
    if len(cuerpo) > MAX_BYTES * 2:
        raise FirmaError("La firma es demasiado grande.")
    try:
        return base64.b64decode(cuerpo, validate=True)
    except (binascii.Error, ValueError):
        raise FirmaError("La firma llegó dañada.")


def aceptar(dato_url):
    """
    Recorta, aplana sobre blanco y guarda. Devuelve el nombre interno.

    Se levanta FirmaError con un motivo entendible si el lienzo llegó en
    blanco: guardar una firma vacía es peor que no tener firma, porque el
    documento saldría con un hueco donde debería haber un trazo y nadie
    sabría si falló el guardado o la persona no firmó.
    """
    datos = _bytes_de(dato_url)
    if len(datos) > MAX_BYTES:
        raise FirmaError("La firma es demasiado grande.")
    try:
        im = Image.open(io.BytesIO(datos))
        im.load()
    except Exception:
        raise FirmaError("No se pudo leer la firma.")

    # El lienzo llega en RGBA: el trazo tiene alfa y el resto no.
    if im.mode != "RGBA":
        im = im.convert("RGBA")
    caja = im.getchannel("A").getbbox()
    if caja is None:
        raise FirmaError("No se dibujó ninguna firma.")

    izq, arr, der, aba = caja
    if (der - izq) < 8 or (aba - arr) < 4:
        raise FirmaError("El trazo es demasiado pequeño para ser una firma.")
    izq, arr = max(0, izq - AIRE), max(0, arr - AIRE)
    der, aba = min(im.width, der + AIRE), min(im.height, aba + AIRE)
    im = im.crop((izq, arr, der, aba))

    if im.width > ANCHO_MAX:
        alto = max(1, round(im.height * ANCHO_MAX / im.width))
        im = im.resize((ANCHO_MAX, alto), Image.LANCZOS)

    # Sobre blanco: el PDF incrusta JPEG y el JPEG no tiene transparencia.
    fondo = Image.new("RGB", im.size, (255, 255, 255))
    fondo.paste(im, (0, 0), im)

    interno = secrets.token_hex(16) + ".jpg"
    ruta = os.path.join(_carpeta(), interno)
    fondo.save(ruta, "JPEG", quality=CALIDAD, optimize=True)
    return interno


def ruta_de(interno):
    """Ruta absoluta de una firma guardada, o None si no está.

    Se comprueba que quede dentro de la carpeta: aunque el nombre salga de
    nuestra base, un valor corrupto no debe poder leer de otro sitio.
    """
    if not interno:
        return None
    carpeta = os.path.abspath(_carpeta())
    ruta = os.path.abspath(os.path.join(carpeta, str(interno)))
    if os.path.commonpath([carpeta, ruta]) != carpeta:
        return None
    return ruta if os.path.isfile(ruta) else None


def datos_de(interno):
    """Los bytes de la firma, o None. Es lo que necesita el PDF."""
    ruta = ruta_de(interno)
    if not ruta:
        return None
    try:
        with open(ruta, "rb") as f:
            return f.read()
    except OSError as e:
        log.warning("no se pudo leer la firma %s: %s", interno, e)
        return None


def borrar(interno):
    """Quita el archivo. Devuelve True si ya no está."""
    ruta = ruta_de(interno)
    if not ruta:
        return True
    try:
        os.remove(ruta)
        return True
    except OSError as e:
        log.warning("no se pudo borrar la firma %s: %s", interno, e)
        return False
