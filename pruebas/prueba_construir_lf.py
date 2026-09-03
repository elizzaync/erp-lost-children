# -*- coding: utf-8 -*-
"""Que la interfaz se construya igual con LF que con CRLF.

POR QUÉ EXISTE
──────────────
El 03/09/2026, con el contenedor ya arrancando bien, el dominio servía una
página EN BLANCO. El HTML llegaba —200, 49 KB— pero era el esqueleto de
base.html con los marcadores `<!--@PANTALLA:x-->` sin rellenar. Ni un error
en el registro, ni en la consola del navegador.

La causa: `construir_interfaz.py` partía las piezas por "\r\n" a secas.

Esta máquina guarda los archivos con CRLF, así que aquí funciona. Pero git
tiene `core.autocrlf=true`: convierte al sacarlos aquí y **los guarda con
LF**. Los 67 archivos de interfaz/ están con LF en el repositorio. Cuando
Coolify clona en Linux salen con LF, el split no encuentra ninguna línea,
ningún marcador se sustituye, y el archivo generado sale de 837 KB a 46 KB.

Es un fallo que no se puede ver desde aquí: en esta máquina el resultado es
correcto siempre. Solo se ve construyendo con los archivos como los deja
Linux, que es lo que hace esta prueba.

QUÉ COMPRUEBA
─────────────
Construye dos veces sobre copias de interfaz/ —una con CRLF y otra con LF—
y exige que salga EL MISMO archivo, byte a byte. Y de paso que ninguna de
las dos salga sospechosamente pequeña, por si algún día el fallo cambia de
forma.
"""
import pathlib
import shutil
import subprocess
import sys
import tempfile

sys.stdout.reconfigure(encoding="utf-8")
RAIZ = pathlib.Path(__file__).resolve().parent.parent
SALIDA = "ERP RRHH - Lost Children Peru.dc.html"

# Por debajo de esto es que los marcadores no se rellenaron: base.html sola
# pesa unos 46 KB y el archivo completo pasa de 800 KB.
MINIMO = 400_000

fallos = []


def check(c, m):
    print(("  OK    " if c else "  FALLO ") + m)
    if not c:
        fallos.append(m)


def construye_con(final_de_linea, carpeta):
    """Copia interfaz/ y el constructor, fuerza el fin de línea, y construye."""
    carpeta.mkdir(parents=True, exist_ok=True)
    shutil.copy(RAIZ / "construir_interfaz.py", carpeta)
    shutil.copytree(RAIZ / "interfaz", carpeta / "interfaz")

    for p in (carpeta / "interfaz").rglob("*"):
        if not p.is_file():
            continue
        b = p.read_bytes().replace(b"\r\n", b"\n")
        if final_de_linea == "CRLF":
            b = b.replace(b"\n", b"\r\n")
        p.write_bytes(b)

    r = subprocess.run([sys.executable, "construir_interfaz.py"],
                       cwd=carpeta, capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    if r.returncode != 0:
        return None, (r.stdout or "") + (r.stderr or "")
    return (carpeta / SALIDA).read_bytes(), ""


tmp = pathlib.Path(tempfile.mkdtemp())
try:
    print("1. Se construye con los archivos como los tiene Windows (CRLF)")
    crlf, err = construye_con("CRLF", tmp / "crlf")
    check(crlf is not None, f"construye sin error{'' if crlf else ': ' + err}")

    print("\n2. Se construye con los archivos como los deja Linux (LF)")
    lf, err = construye_con("LF", tmp / "lf")
    check(lf is not None, f"construye sin error{'' if lf else ': ' + err}")

    print("\n3. Sale el mismo archivo en los dos casos")
    if crlf is None or lf is None:
        check(False, "no se pudo comparar: alguna construcción falló")
    else:
        print(f"   CRLF: {len(crlf):,} bytes")
        print(f"   LF:   {len(lf):,} bytes")
        check(crlf == lf,
              "idénticos byte a byte"
              if crlf == lf else
              f"DISTINTOS ({len(crlf):,} vs {len(lf):,}) — con LF los "
              f"marcadores no se están rellenando")

        print("\n4. Ninguno sale recortado")
        check(len(crlf) > MINIMO, f"CRLF pasa de {MINIMO:,} bytes")
        check(len(lf) > MINIMO, f"LF pasa de {MINIMO:,} bytes")

    print("\n5. El archivo que hay en el repositorio está al día")
    r = subprocess.run([sys.executable, "construir_interfaz.py", "--comprobar"],
                       cwd=RAIZ, capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    check(r.returncode == 0,
          "el .dc.html coincide con lo que sale de interfaz/"
          if r.returncode == 0 else
          "el .dc.html NO coincide — regenéralo con «python construir_interfaz.py»")
finally:
    shutil.rmtree(tmp, ignore_errors=True)

print()
if fallos:
    print(f"FALLA: {len(fallos)}")
    for f in fallos:
        print("   ·", f)
    sys.exit(1)
print("TODO BIEN")
