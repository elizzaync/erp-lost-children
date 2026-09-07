# -*- coding: utf-8 -*-
"""
respaldo.py — una copia de seguridad completa, comprobada, en un solo archivo.

POR QUÉ EXISTE
──────────────
El 07/09/2026 había 17 respaldos de la base... los 17 en el mismo disco que
la base. Eso protege de un borrado tonto, que ya ha pasado dos veces en este
proyecto, pero no protege de lo único que no tiene vuelta atrás: que el disco
se rompa o el portátil se pierda. Ahí se va todo a la vez.

Esto hace un archivo .zip que se puede llevar a otro sitio —un pendrive, un
disco externo, la nube que se decida— y que contiene todo lo necesario para
volver a levantar el sistema.

QUÉ SE GUARDA
─────────────
  · la base entera (rrhh.db)
  · data/archivos/    contratos y documentos subidos
  · data/fotos/       fotos de ficha
  · data/firmas/      firmas de los permisos
  · data/marcas/      capturas del terminal
  · los .json de datos sembrados, si están

QUÉ NO SE GUARDA, A PROPÓSITO
─────────────────────────────
  · data/credenciales/ — la llave de Google. Es una clave privada: si viaja
    dentro de cada respaldo, cada copia pasa a ser un secreto que hay que
    custodiar, y acaban en pendrives por ahí. Se regenera en cinco minutos
    desde console.cloud.google.com, así que no compensa el riesgo.
  · los rrhh.db.*.bak antiguos — son historia, no hacen falta para volver a
    levantar el sistema, y multiplicarían el tamaño.

CÓMO SE HACE LA COPIA DE LA BASE
────────────────────────────────
Con la API de respaldo de sqlite, NO copiando el archivo. Copiar un .db
mientras el servidor lo está usando puede dar una copia a medias —con una
escritura por la mitad— que parece correcta y no lo es. La API de sqlite
sabe hacerlo en caliente y de forma consistente.

Y después se comprueba: se vuelve a abrir el zip, se saca la base, se le pasa
un integrity_check y se cuentan las filas para compararlas con las de la base
de verdad. Un respaldo que no se ha comprobado no es un respaldo.

USO
───
    py herramientas/respaldo.py              hace la copia
    py herramientas/respaldo.py --donde D:\  la deja en otra unidad
"""
import os
import pathlib
import shutil
import sqlite3
import sys
import tempfile
import zipfile
from datetime import datetime

for _f in (sys.stdout, sys.stderr):
    try:
        _f.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

RAIZ = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "backend"))
import config  # noqa: E402

# Carpetas de data/ que entran en el respaldo.
CARPETAS = ("archivos", "fotos", "firmas", "marcas")

# Las tablas cuyo recuento se compara entre la base y la copia. No es una
# lista exhaustiva: son las que duelen si se pierden.
TABLAS = ("personal", "beneficiarios", "responsables", "identidades",
          "marcas", "usuarios", "solicitudes", "documentos")

LEEME = """RESPALDO DEL MÓDULO RRHH — Lost Children Perú
{sello}

QUÉ ES ESTO
Una copia completa del sistema: la base de datos y los archivos que ha
subido el equipo (contratos, fotos, firmas y capturas del terminal).

CÓMO SE VUELVE A LEVANTAR
 1. Descomprimir este archivo.
 2. Copiar rrhh.db y las carpetas a la carpeta data/ del sistema.
 3. Arrancar. El sistema pone al día el esquema solo.

LO QUE NO ESTÁ AQUÍ
La llave de Google (data/credenciales/). Se deja fuera a propósito: es una
clave privada y no debe viajar en cada copia. Se genera de nuevo en
console.cloud.google.com, en la cuenta de servicio, y se vuelve a poner.

CONTENIDO COMPROBADO AL CREARLO
{recuento}
"""


def _copia_consistente(origen, destino):
    """Copia la base con la API de sqlite: segura aunque esté en uso."""
    con_origen = sqlite3.connect(f"file:{origen}?mode=ro", uri=True)
    con_destino = sqlite3.connect(destino)
    try:
        con_origen.backup(con_destino)
    finally:
        con_destino.close()
        con_origen.close()


def _contar(bd):
    """Filas por tabla. Las que no existan se dan por 0, no rompen."""
    con = sqlite3.connect(f"file:{bd}?mode=ro", uri=True)
    fuera = {}
    for t in TABLAS:
        try:
            fuera[t] = con.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
        except sqlite3.OperationalError:
            fuera[t] = None
    con.close()
    return fuera


def _integridad(bd):
    con = sqlite3.connect(f"file:{bd}?mode=ro", uri=True)
    r = con.execute("PRAGMA integrity_check").fetchone()[0]
    con.close()
    return r


def hacer(donde=None):
    base = pathlib.Path(config.DB_PATH)
    if not base.is_file():
        raise SystemExit(f"No está la base: {base}")

    carpeta_datos = base.parent
    sello = datetime.now().strftime("%Y%m%d-%H%M%S")
    destino_dir = pathlib.Path(donde) if donde else (RAIZ / "respaldos")
    destino_dir.mkdir(parents=True, exist_ok=True)
    zip_final = destino_dir / f"rrhh-{sello}.zip"

    print("=" * 68)
    print("  RESPALDO DEL MÓDULO RRHH")
    print("=" * 68)
    print(f"  base    {base}")
    print(f"  destino {zip_final}")
    print()

    tmp = pathlib.Path(tempfile.mkdtemp())
    try:
        # ── 1. La base, en caliente y consistente ──────────────────────
        print("1. Copiando la base (API de sqlite, no copia de archivo)")
        copia = tmp / "rrhh.db"
        _copia_consistente(str(base), str(copia))
        print(f"   {copia.stat().st_size:,} bytes")

        estado = _integridad(str(copia))
        print(f"   integridad: {estado}")
        if estado != "ok":
            raise SystemExit("   la copia NO pasa el control de integridad")

        antes = _contar(str(base))
        despues = _contar(str(copia))
        print()
        print("2. La copia tiene lo mismo que la base")
        lineas = []
        for t in TABLAS:
            a, d = antes[t], despues[t]
            if a is None:
                continue
            igual = "OK  " if a == d else "NO  "
            print(f"   {igual}{t:16} {a}")
            lineas.append(f"  {t:16} {a}")
            if a != d:
                raise SystemExit(f"   {t}: {a} en la base, {d} en la copia")

        # ── 2. El zip ──────────────────────────────────────────────────
        print()
        print("3. Empaquetando")
        with zipfile.ZipFile(zip_final, "w", zipfile.ZIP_DEFLATED) as z:
            z.write(copia, "rrhh.db")

            for nombre in CARPETAS:
                carpeta = carpeta_datos / nombre
                if not carpeta.is_dir():
                    continue
                n = 0
                for f in carpeta.rglob("*"):
                    if f.is_file():
                        z.write(f, f"{nombre}/{f.relative_to(carpeta)}")
                        n += 1
                print(f"   {nombre:12} {n} archivo(s)")

            for j in carpeta_datos.glob("*.json"):
                z.write(j, j.name)

            z.writestr("LEEME.txt", LEEME.format(
                sello=datetime.now().strftime("%d/%m/%Y %H:%M"),
                recuento="\n".join(lineas)))

        # ── 3. Comprobar el zip ya escrito ─────────────────────────────
        print()
        print("4. Comprobando el respaldo ya escrito")
        with zipfile.ZipFile(zip_final) as z:
            roto = z.testzip()
            if roto:
                raise SystemExit(f"   archivo dañado dentro del zip: {roto}")
            print(f"   {len(z.namelist())} archivo(s), ninguno dañado")
            z.extract("rrhh.db", tmp / "verificar")

        vuelta = tmp / "verificar" / "rrhh.db"
        estado = _integridad(str(vuelta))
        print(f"   la base del zip: integridad {estado}")
        if estado != "ok":
            raise SystemExit("   la base DENTRO del zip no está bien")
        if _contar(str(vuelta)) != antes:
            raise SystemExit("   los recuentos del zip no cuadran")
        print("   los recuentos cuadran con la base de verdad")

    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    mb = zip_final.stat().st_size / (1024 * 1024)
    print()
    print("=" * 68)
    print(f"  LISTO  ·  {zip_final}  ·  {mb:.1f} MB")
    print("=" * 68)
    print()
    print("  ESTO TODAVÍA ESTÁ EN EL MISMO DISCO QUE LA BASE.")
    print("  Cópialo a otro sitio —un pendrive, un disco externo, la nube—")
    print("  o no protege de lo único de lo que tiene que proteger.")
    return zip_final


if __name__ == "__main__":
    donde = None
    if "--donde" in sys.argv:
        donde = sys.argv[sys.argv.index("--donde") + 1]
    hacer(donde)
