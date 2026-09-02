# -*- coding: utf-8 -*-
"""
archivos.py — adjuntos de documentos y contratos.

QUÉ HACE Y QUÉ NO

El sistema NO genera documentos: no arma un contrato en PDF desde cero.
Guarda el archivo que la organización YA tiene — el DNI escaneado, el
contrato firmado en Word, la constancia en PDF — y lo devuelve cuando se
pide. Registrar un documento sin adjunto sigue siendo válido: a veces se
sabe que existe y su vencimiento antes de tener el papel a mano.

DÓNDE SE GUARDAN

En data/archivos/, no dentro de SQLite. Un PDF de varios MB por fila haría
la base pesada de copiar, y aquí los respaldos se hacen copiando el .db.

CÓMO SE NOMBRAN

Con un nombre generado (uuid + extensión), nunca con el que trae el
usuario. El nombre original se guarda aparte, en la base, y solo se usa
para devolverlo al descargar. Aceptar el nombre de quien sube el archivo
permitiría rutas tipo '../../algo' y colisiones entre dos personas que
suben 'dni.pdf'.
"""
import os
import re
import unicodedata
import uuid

import config


class ArchivoError(Exception):
    """El adjunto no se puede aceptar. El mensaje es para el usuario."""


def _carpeta():
    os.makedirs(config.ARCHIVOS_DIR, exist_ok=True)
    return config.ARCHIVOS_DIR


def extension_de(nombre):
    _, ext = os.path.splitext(str(nombre or "").lower())
    return ext


def validar(nombre_original, tam_bytes):
    """Comprueba extensión y tamaño ANTES de escribir nada en disco."""
    ext = extension_de(nombre_original)
    if not ext:
        raise ArchivoError("El archivo no tiene extensión; no se puede identificar su tipo.")
    if ext not in config.ARCHIVO_EXTENSIONES:
        permitidas = ", ".join(sorted(config.ARCHIVO_EXTENSIONES))
        raise ArchivoError(f"Tipo de archivo no admitido ({ext}). Se aceptan: {permitidas}")
    if tam_bytes is not None and tam_bytes > config.ARCHIVO_MAX_BYTES:
        tope = config.ARCHIVO_MAX_BYTES // (1024 * 1024)
        raise ArchivoError(f"El archivo supera el máximo de {tope} MB.")
    if tam_bytes is not None and tam_bytes == 0:
        raise ArchivoError("El archivo está vacío.")
    return ext


def nombre_visible(nombre_original):
    """
    Limpia el nombre que se mostrará y se usará al descargar. No es el
    nombre con el que se guarda: eso es un uuid.
    """
    base = os.path.basename(str(nombre_original or "").replace("\\", "/"))
    base = unicodedata.normalize("NFKD", base).encode("ascii", "ignore").decode()
    base = re.sub(r"[^A-Za-z0-9._ -]", "", base).strip() or "archivo"
    return base[:120]


def guardar(fichero, nombre_original):
    """
    Escribe el adjunto y devuelve sus metadatos. 'fichero' es el objeto de
    Werkzeug (request.files[...]).

    Se lee en memoria para medir el tamaño real: el Content-Length que
    manda el navegador es un dato del cliente y no se puede creer.
    """
    datos = fichero.read()
    ext = validar(nombre_original, len(datos))

    interno = uuid.uuid4().hex + ext
    destino = os.path.join(_carpeta(), interno)
    with open(destino, "wb") as fh:
        fh.write(datos)

    return {
        "archivo": interno,
        "archivo_nombre": nombre_visible(nombre_original),
        "archivo_mime": config.ARCHIVO_EXTENSIONES[ext],
        "archivo_tam": len(datos),
    }


def ruta_de(interno):
    """
    Ruta absoluta de un adjunto ya guardado, o None si no está.

    Se comprueba que el resultado siga dentro de la carpeta de archivos:
    aunque 'interno' salga de nuestra base y no del usuario, un valor
    corrupto no debe poder leer nada de fuera.
    """
    if not interno:
        return None
    carpeta = os.path.abspath(_carpeta())
    ruta = os.path.abspath(os.path.join(carpeta, os.path.basename(str(interno))))
    if os.path.commonpath([carpeta, ruta]) != carpeta:
        return None
    return ruta if os.path.isfile(ruta) else None


def borrar(interno):
    """Quita el adjunto del disco. Silencioso si ya no estaba."""
    ruta = ruta_de(interno)
    if not ruta:
        return False
    try:
        os.remove(ruta)
        return True
    except OSError:
        return False


