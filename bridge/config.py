# -*- coding: utf-8 -*-
"""
Carga variables de configuración desde bridge/.env (no versionado en git).
Sin dependencias externas — parser simple de líneas CLAVE=valor.
Prioridad: variable de entorno del sistema > .env > default.
"""
import os

_ENV_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
_cache = None


def _cargar():
    global _cache
    if _cache is not None:
        return _cache
    _cache = {}
    try:
        with open(_ENV_PATH, "r", encoding="utf-8") as fh:
            for linea in fh:
                linea = linea.strip()
                if not linea or linea.startswith("#") or "=" not in linea:
                    continue
                clave, _, valor = linea.partition("=")
                _cache[clave.strip()] = valor.strip().strip('"').strip("'")
    except FileNotFoundError:
        pass
    return _cache


def env(clave, default=""):
    """Devuelve la variable: entorno del sistema > bridge/.env > default."""
    return os.environ.get(clave) or _cargar().get(clave) or default
