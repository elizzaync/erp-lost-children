# -*- coding: utf-8 -*-
"""
fotos.py — la foto de una persona, venga de donde venga.

POR QUÉ ESTÁ SEPARADO DE archivos.py

Un adjunto de documento se guarda tal cual llegó: el contrato firmado en
PDF no se toca, que para eso es la prueba. Una foto de persona sí se toca
—se endereza, se reduce y se convierte— y se muestra en pantalla en vez de
descargarse. Mezclar ambas cosas en un módulo obligaría a que cada llamada
dijera cuál de los dos comportamientos quiere.

EL PUNTO IMPORTANTE: UNA SOLA PUERTA

Hoy la foto la sube el personal de RRHH desde la ficha. Más adelante puede
llegar desde el formulario público, descargada del Drive del tutor. Los dos
caminos entran por aceptar(): uno le pasa los bytes que subió el navegador
y el otro los que bajó de Drive, y a partir de ahí el tratamiento es el
mismo. Añadir ese segundo origen no obliga a reescribir nada de aquí, que
es justo lo que se pidió al dejar la foto fuera del formulario por ahora.

QUÉ SE LE HACE A LA IMAGEN

  · Se endereza. Las fotos de móvil vienen con la orientación en un dato
    aparte (EXIF); sin aplicarlo salen giradas en la ficha.
  · Se reduce a 1024 px de lado mayor. Una foto de 12 MP en una ficha son
    tres megas por cada vez que alguien abre la pantalla, para verse a
    200 px.
  · Se convierte a JPG. Así la ficha no depende de si el navegador de
    quien mira entiende WEBP o HEIC.
  · Se le quitan los metadatos, incluida la ubicación GPS. Una foto de
    móvil suele traer dónde se tomó; en fichas de personas eso es un dato
    que nadie pidió y que no hace falta guardar.

CUANDO NO SE PUEDE

Si el archivo no es una imagen que se pueda abrir, se rechaza con un
motivo entendible. No se guarda "algo" a medias: una foto rota en la ficha
es peor que ninguna, porque nadie sabe si el fallo es del archivo o de la
pantalla.
"""
import io
import logging
import os
import uuid

import config

log = logging.getLogger("rrhh")

try:
    from PIL import Image, ImageOps
    HAY_PILLOW = True
except ImportError:                     # pragma: sin cobertura
    HAY_PILLOW = False

# HEIC es el formato por defecto de los iPhone. Pillow no lo entiende solo:
# necesita pillow-heif. Si no está, se dice claramente en vez de aceptar el
# archivo y guardar algo que luego no se ve.
try:
    import pillow_heif
    pillow_heif.register_heif_opener()
    HAY_HEIC = True
except ImportError:
    HAY_HEIC = False


class FotoError(Exception):
    """La foto no se puede aceptar. El mensaje es para quien la sube."""


# Lo que se admite al entrar. Lo que se guarda es siempre JPG.
EXTENSIONES = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"}

# 10 MB. Una foto de móvil ronda los 3-5 MB; el tope está para que un
# archivo enorme no ocupe memoria mientras se procesa.
MAX_BYTES = 10 * 1024 * 1024

# Lado mayor de la imagen guardada.
LADO_MAX = 1024

CALIDAD = 85


def _carpeta():
    os.makedirs(config.FOTOS_DIR, exist_ok=True)
    return config.FOTOS_DIR


def _extension(nombre):
    _, ext = os.path.splitext(str(nombre or "").lower())
    return ext


def aceptar(datos, nombre_original="", carpeta=None):
    """
    Comprueba, endereza, reduce y guarda. Devuelve los metadatos para la
    ficha, o levanta FotoError con un motivo que se puede enseñar.

    'datos' son los bytes de la imagen. Se piden ya leídos —y no el objeto
    del navegador— porque el otro origen previsto (una descarga de Drive)
    no tiene ese objeto, y así los dos caminos comparten todo lo de aquí.
    """
    if not datos:
        raise FotoError("El archivo llegó vacío.")
    if len(datos) > MAX_BYTES:
        raise FotoError(f"La foto supera el máximo de {MAX_BYTES // (1024 * 1024)} MB.")

    ext = _extension(nombre_original)
    if ext and ext not in EXTENSIONES:
        admitidas = ", ".join(sorted(e.lstrip(".") for e in EXTENSIONES))
        raise FotoError(f"Ese tipo de archivo no es una foto ({ext}). Se aceptan: {admitidas}.")
    if ext in (".heic", ".heif") and not HAY_HEIC:
        raise FotoError("Las fotos HEIC de iPhone todavía no se pueden convertir en este "
                        "equipo. Guárdala como JPG desde el teléfono y vuelve a subirla.")
    if not HAY_PILLOW:
        raise FotoError("El tratamiento de imágenes no está disponible en este equipo.")

    try:
        img = Image.open(io.BytesIO(datos))
        img.load()
    except Exception:
        # No se distingue entre formatos raros y archivos corruptos: para
        # quien sube la foto el remedio es el mismo.
        raise FotoError("Ese archivo no se puede abrir como imagen. Prueba con una foto "
                        "en JPG o PNG.")

    img = ImageOps.exif_transpose(img)          # la orientación del móvil
    if img.mode not in ("RGB", "L"):
        # Los PNG con transparencia se aplanan sobre blanco: un JPG no
        # tiene canal alfa y sin esto el fondo saldría negro.
        fondo = Image.new("RGB", img.size, (255, 255, 255))
        img = img.convert("RGBA")
        fondo.paste(img, mask=img.split()[-1])
        img = fondo
    else:
        img = img.convert("RGB")

    img.thumbnail((LADO_MAX, LADO_MAX), Image.LANCZOS)

    salida = io.BytesIO()
    # Sin exif=: al no pasarlo, la copia sale limpia de metadatos.
    img.save(salida, format="JPEG", quality=CALIDAD, optimize=True)
    limpio = salida.getvalue()

    interno = uuid.uuid4().hex + ".jpg"
    # `carpeta` la usan las fotos de marca de asistencia: son muchas, se
    # acumulan por dia y no significan lo mismo que la foto de una ficha.
    destino = carpeta or _carpeta()
    os.makedirs(destino, exist_ok=True)
    with open(os.path.join(destino, interno), "wb") as fh:
        fh.write(limpio)

    return {
        "foto": interno,
        "foto_mime": "image/jpeg",
        "foto_tam": len(limpio),
        "foto_ancho": img.width,
        "foto_alto": img.height,
    }


def desde_fichero(fichero):
    """La foto que subió un navegador (request.files[...])."""
    if fichero is None or not getattr(fichero, "filename", ""):
        raise FotoError("No llegó ninguna foto.")
    return aceptar(fichero.read(), fichero.filename)


def ruta_de(interno):
    """
    Ruta absoluta de una foto guardada, o None si no está.

    Se comprueba que quede dentro de la carpeta: aunque el nombre salga de
    nuestra base y no de nadie de fuera, un valor corrupto no debe poder
    leer archivos de otro sitio.
    """
    if not interno:
        return None
    carpeta = os.path.abspath(_carpeta())
    ruta = os.path.abspath(os.path.join(carpeta, str(interno)))
    if os.path.commonpath([carpeta, ruta]) != carpeta:
        return None
    return ruta if os.path.isfile(ruta) else None


def borrar(interno):
    """
    Quita el archivo. Devuelve True si ya no está.

    Que no estuviera es un éxito: el objetivo es que no quede. Lo que sí
    se avisa es no haber podido borrarlo —bloqueado, sin permisos, disco
    de solo lectura—, porque entonces queda una foto que ya no referencia
    ninguna ficha ocupando espacio, y callarlo la vuelve invisible.
    """
    ruta = ruta_de(interno)
    if not ruta:
        return True
    try:
        os.remove(ruta)
        return True
    except OSError as e:
        log.warning("no se pudo borrar la foto %s: %s", interno, e)
        return False
