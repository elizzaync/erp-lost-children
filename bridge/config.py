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


def db_config():
    """
    Credenciales de MySQL centralizadas — antes cada script (seed_*.py,
    update_precios.py, yunatt_sync.py, yunatt_staff_sync.py) las copiaba y
    pegaba por su cuenta; si algún día se le pone contraseña a MySQL había
    que acordarse de tocar 6 archivos en vez de uno. Compatible con
    pymysql y mysql.connector (ambos aceptan estas mismas claves).
    """
    return {
        "host":     env("DB_HOST", "localhost"),
        "user":     env("DB_USER", "root"),
        "password": env("DB_PASSWORD", ""),
        "database": env("DB_NAME", "erp_lost_children"),
        "charset":  "utf8mb4",
    }
