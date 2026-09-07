# -*- coding: utf-8 -*-
"""Que el respaldo sea de verdad restaurable, y que no lleve la llave dentro.

POR QUÉ EXISTE
──────────────
El 07/09/2026 había 17 copias de la base... las 17 en el mismo disco que la
base. Protegían de un borrado tonto —que ya pasó dos veces— pero no de que
el disco se rompa. herramientas/respaldo.py hace una copia completa y
llevable.

Un respaldo que nadie ha probado a restaurar no es un respaldo, es una
suposición. Y este tiene dos formas de salir mal en silencio:

  1. Copiar el .db como archivo mientras el servidor escribe da una copia a
     medias que ABRE BIEN y tiene datos incompletos. Por eso se usa la API
     de respaldo de sqlite, y por eso aquí se comprueban los recuentos.

  2. Meter data/credenciales/ dentro. Convertiría cada copia en un secreto
     que custodiar, y estas copias están pensadas para llevárselas en un
     pendrive. La llave se regenera en Google en cinco minutos; el riesgo de
     pasearla no compensa.

QUÉ COMPRUEBA
─────────────
Monta una base de mentira con datos y archivos, hace el respaldo, y luego lo
RESTAURA en otro sitio para verificar que lo restaurado es igual a lo
original — que es la única pregunta que importa.
"""
import pathlib
import shutil
import sqlite3
import sys
import tempfile
import zipfile

sys.stdout.reconfigure(encoding="utf-8")
RAIZ = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "backend"))
sys.path.insert(0, str(RAIZ / "herramientas"))

fallos = []


def check(c, m):
    print(("  OK    " if c else "  FALLO ") + m)
    if not c:
        fallos.append(m)


tmp = pathlib.Path(tempfile.mkdtemp())
try:
    # ── 1. Una instalación de mentira, con datos y archivos ────────────
    print("1. Se monta un sistema de prueba con datos")
    datos = tmp / "data"
    datos.mkdir()
    base = datos / "rrhh.db"

    import config                                     # noqa: E402
    config._cache = {}
    config._ENV_PATH = str(tmp / "no-existe.env")
    config.DB_PATH = str(base)

    import db                                         # noqa: E402
    db.iniciar()

    con = sqlite3.connect(base, isolation_level=None)
    for n in range(5):
        con.execute("INSERT INTO personal (nombre, documento, cargo, estado) "
                    "VALUES (?,?,?,'activo')",
                    (f"Persona {n}", f"DOC{n:05d}", "Cargo"))
    ids = [f[0] for f in con.execute("SELECT id FROM personal")]
    for n, pid in enumerate(ids):
        con.execute("INSERT INTO identidades (staff_number, personal_id, estado) "
                    "VALUES (?,?,'enrolado')", (9200 + n, pid))
        for h in ("08:00:00", "17:00:00"):
            con.execute("INSERT INTO marcas (staff_number, fecha, hora, metodo) "
                        "VALUES (?,?,?,'facial')", (9200 + n, "2026-09-01", h))
    con.close()

    # Archivos del equipo, y la llave que NO debe viajar.
    for carpeta, cuantos in (("archivos", 3), ("fotos", 2), ("firmas", 1)):
        d = datos / carpeta
        d.mkdir()
        for i in range(cuantos):
            (d / f"{carpeta}-{i}.bin").write_bytes(b"contenido " + bytes([i]))
    (datos / "credenciales").mkdir()
    (datos / "credenciales" / "google-hoja-respuestas.json").write_text(
        '{"private_key": "ESTO-NO-DEBE-SALIR-NUNCA"}', encoding="utf-8")

    esperado = {}
    con = sqlite3.connect(base)
    for t in ("personal", "identidades", "marcas"):
        esperado[t] = con.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
    con.close()
    print(f"   {esperado['personal']} personas · {esperado['identidades']} "
          f"identidades · {esperado['marcas']} marcas · 6 archivos")

    # ── 2. El respaldo ────────────────────────────────────────────────
    print("\n2. Se hace el respaldo")
    import respaldo                                   # noqa: E402
    zip_final = respaldo.hacer(str(tmp / "salida"))
    check(zip_final.is_file(), f"se creó el archivo ({zip_final.name})")

    # ── 3. La llave NO puede estar dentro ─────────────────────────────
    print("\n3. La llave de Google se queda fuera")
    with zipfile.ZipFile(zip_final) as z:
        nombres = z.namelist()
        crudo = b"".join(z.read(n) for n in nombres)
    check(not any("credencial" in n.lower() for n in nombres),
          "ningún archivo de credenciales en el zip")
    check(b"ESTO-NO-DEBE-SALIR-NUNCA" not in crudo,
          "la clave privada no aparece por ningún lado dentro")

    # ── 4. Restaurar en otro sitio y comparar ─────────────────────────
    print("\n4. Se RESTAURA en otro sitio y se compara")
    restaurado = tmp / "restaurado"
    with zipfile.ZipFile(zip_final) as z:
        z.extractall(restaurado)

    bd = restaurado / "rrhh.db"
    check(bd.is_file(), "la base está en el respaldo")

    con = sqlite3.connect(bd)
    check(con.execute("PRAGMA integrity_check").fetchone()[0] == "ok",
          "la base restaurada pasa el control de integridad")
    for t, n in esperado.items():
        v = con.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
        check(v == n, f"{t}: {n} originales, {v} restauradas")
    con.close()

    print("\n5. Los archivos del equipo también volvieron")
    for carpeta, cuantos in (("archivos", 3), ("fotos", 2), ("firmas", 1)):
        hay = len(list((restaurado / carpeta).glob("*"))) \
            if (restaurado / carpeta).is_dir() else 0
        check(hay == cuantos, f"{carpeta}: {cuantos} originales, {hay} restaurados")

    print("\n6. Lleva instrucciones para quien lo tenga que restaurar")
    with zipfile.ZipFile(zip_final) as z:
        leeme = z.read("LEEME.txt").decode("utf-8")
    check("credenciales" in leeme, "el LEEME avisa de que la llave no está")
    check("data/" in leeme, "el LEEME dice dónde va todo")

finally:
    shutil.rmtree(tmp, ignore_errors=True)

print()
if fallos:
    print(f"FALLA: {len(fallos)}")
    for f in fallos:
        print("   ·", f)
    sys.exit(1)
print("TODO BIEN")
