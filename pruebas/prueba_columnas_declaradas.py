# -*- coding: utf-8 -*-
"""Que ninguna tabla esté declarada dos veces en _COLUMNAS_NUEVAS.

POR QUÉ EXISTE
──────────────
El 31/08/2026 añadí las columnas de la foto al bloque "personal" de
_COLUMNAS_NUEVAS. El servidor arrancó sin una queja y las columnas no
aparecieron en la base.

La causa: "personal" estaba declarada DOS VECES en el mismo literal. En un
diccionario de Python la segunda gana y la primera se descarta entera, sin
aviso. Todo lo declarado en la que pierde no se crea nunca.

Eso no se ve leyendo el diccionario ya construido —ahí solo queda una— así
que hay que mirar el archivo fuente. Y no puede vivir dentro de db.py: un
módulo que se lee a sí mismo para comprobarse es peor que el fallo.

El síntoma sería «guardo un dato y no se guarda», que no apunta a este
archivo por ninguna parte. Por eso hace falta la prueba.
"""
import pathlib
import re
import sys

sys.stdout.reconfigure(encoding="utf-8")
RAIZ = pathlib.Path(__file__).resolve().parent.parent

fallos = []


def check(c, m):
    print(("  OK    " if c else "  FALLO ") + m)
    if not c:
        fallos.append(m)


fuente = (RAIZ / "backend/db.py").read_text(encoding="utf-8")

print("1. _COLUMNAS_NUEVAS no declara ninguna tabla dos veces")
ini = fuente.index("_COLUMNAS_NUEVAS = {")
fin = fuente.index("\ndef _asegurar_columnas", ini)
bloque = fuente[ini:fin]
tablas = re.findall(r'^    "([a-z_]+)": \{', bloque, re.M)
repes = sorted({t for t in tablas if tablas.count(t) > 1})
print(f"   tablas declaradas: {len(tablas)} · {', '.join(tablas)}")
check(not repes,
      f"ninguna repetida (repetidas: {', '.join(repes)})" if repes
      else "ninguna repetida")

print("\n2. Lo declarado es lo que de verdad llega a la base")
sys.path.insert(0, str(RAIZ / "backend"))
import config  # noqa: E402
import db  # noqa: E402

check(len(db._COLUMNAS_NUEVAS) == len(set(tablas)),
      f"el diccionario tiene tantas tablas como el archivo "
      f"({len(db._COLUMNAS_NUEVAS)} vs {len(set(tablas))})")

# Y que la migración las crea de verdad, sobre una base recién hecha.
import os
import sqlite3
import tempfile

carpeta = tempfile.mkdtemp(prefix="rrhh-pruebas-columnas-")
copia = os.path.join(carpeta, "rrhh-pruebas.db")
db.config.DB_PATH = copia
db.iniciar()

con = sqlite3.connect(copia)
faltan = []
for tabla, columnas in db._COLUMNAS_NUEVAS.items():
    hay = {f[1] for f in con.execute(f"PRAGMA table_info({tabla})")}
    faltan += [f"{tabla}.{c}" for c in columnas if c not in hay]
con.close()
print(f"   columnas declaradas: {sum(len(c) for c in db._COLUMNAS_NUEVAS.values())}")
check(not faltan, f"todas existen tras iniciar() (faltan: {faltan[:6]})"
      if faltan else "todas existen tras iniciar()")

# Las de la foto, por su nombre: son las que destaparon el fallo.
con = sqlite3.connect(copia)
hay = {f[1] for f in con.execute("PRAGMA table_info(personal)")}
con.close()
check({"foto", "foto_mime", "foto_tam", "foto_ancho", "foto_alto"} <= hay,
      "la ficha de personal puede guardar la foto del terminal")
check("firma" in hay, "y sigue teniendo la firma, que estaba en el bloque perdido")

import shutil
shutil.rmtree(carpeta, ignore_errors=True)

print(f"\n  {len(fallos)} FALLOS" if fallos else "\n  COLUMNAS DECLARADAS OK")
sys.exit(1 if fallos else 0)
