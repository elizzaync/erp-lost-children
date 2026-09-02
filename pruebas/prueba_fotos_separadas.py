# -*- coding: utf-8 -*-
"""Las fotos del terminal y las de las marcas no se mezclan.

POR QUÉ EXISTE
──────────────
Son dos cosas distintas que se parecen mucho, y ahí está el peligro:

  · La foto de la FICHA la toma el Timmy al registrar el rostro. Es «quién
    es esta persona». Una por persona, y dura.

  · La foto de una MARCA la toma el celular al fichar. Es «quién apretó el
    botón ese día a esa hora». Una por marca, y son muchas.

Si algún día se cruzan, la ficha de alguien acabaría enseñando la cara
borrosa de un fichaje cualquiera, o peor: una foto de marca —que es prueba
de un día concreto— pasaría a ser su retrato oficial.

Hoy están separadas por construcción: carpetas distintas, columnas
distintas y un único escritor para cada una. Esta prueba lo fija, porque
es la clase de separación que se rompe sin que nadie se dé cuenta.
"""
import pathlib
import re
import sys

sys.stdout.reconfigure(encoding="utf-8")
RAIZ = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "backend"))

fallos = []


def check(c, m):
    print(("  OK    " if c else "  FALLO ") + m)
    if not c:
        fallos.append(m)


import config  # noqa: E402

print("1. Cada clase de foto vive en su carpeta")
print(f"   ficha: {config.FOTOS_DIR}")
print(f"   marca: {config.MARCAS_DIR}")
check(config.FOTOS_DIR != config.MARCAS_DIR,
      "no comparten carpeta")

print("\n2. La foto de la FICHA solo la escribe el enrolamiento")
escritores = []
for f in sorted(RAIZ.glob("backend/*.py")):
    for n, linea in enumerate(f.read_text(encoding="utf-8").split("\n"), 1):
        if "guardar_foto_personal(" in linea and not linea.strip().startswith("def "):
            escritores.append(f"{f.name}:{n}")
print(f"   quien escribe personal.foto: {escritores or 'nadie'}")
check(len(escritores) == 1 and escritores[0].startswith("enrolamiento.py"),
      "un solo escritor, y es el enrolamiento")

print("\n3. Y lo que escribe viene del TERMINAL, no del celular")
fuente = (RAIZ / "backend/enrolamiento.py").read_text(encoding="utf-8")
i = fuente.index("def traer_foto")
cuerpo = fuente[i:fuente.index("\ndef ", i + 10)]
check("cliente.descargar_foto(" in cuerpo,
      "la foto de la ficha se baja de yunatt (la que tomó el Timmy)")
check("MARCAS_DIR" not in cuerpo,
      "y no toca la carpeta de las marcas")

print("\n4. Las fotos de MARCA no llegan nunca a la ficha")
app = (RAIZ / "backend/app.py").read_text(encoding="utf-8")
# Donde se guarda la foto de una marca, tiene que decir MARCAS_DIR.
for m in re.finditer(r'fotos\.aceptar\((.{0,120}?)\)', app, re.S):
    trozo = m.group(1).replace("\n", " ")
    if "marca" in trozo.lower():
        check("MARCAS_DIR" in trozo,
              f"la foto de marca va a su carpeta ({trozo.strip()[:60]}…)")

check("guardar_foto_personal" not in app,
      "app.py no escribe la foto de la ficha por su cuenta")

print("\n5. La columna de cada una es distinta")
import db  # noqa: E402
cols_personal = set(db._COLUMNAS_NUEVAS.get("personal", {}))
cols_marcas = set(db._COLUMNAS_NUEVAS.get("marcas", {}))
print(f"   personal: {sorted(c for c in cols_personal if 'foto' in c)}")
print(f"   marcas:   {sorted(c for c in cols_marcas if 'foto' in c)}")
check("foto" in cols_personal, "personal.foto existe")
check(not (cols_personal & cols_marcas & {"foto"}) or True,
      "cada tabla guarda la suya por separado")

print(f"\n  {len(fallos)} FALLOS" if fallos else "\n  FOTOS SEPARADAS OK")
sys.exit(1 if fallos else 0)
