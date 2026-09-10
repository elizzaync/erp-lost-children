# -*- coding: utf-8 -*-
"""Que el botón de copia de seguridad de Configuración funcione de verdad.

POR QUÉ EXISTE
──────────────
Hasta el 10/09/2026 la copia se hacía escribiendo un comando en una
terminal. Eso significa que la hace quien sabe escribirlo y cuando se
acuerda: en la práctica, casi nunca. La usuaria pidió un botón.

Un botón de respaldo tiene una forma silenciosa de ser inútil: decir que
todo fue bien y no haber guardado nada, o guardar un archivo que no se
puede volver a abrir. Por eso aquí no se comprueba que la ruta responda
200 — se comprueba que apareció un archivo NUEVO, que se abre, y que dentro
está la base con los datos.

Y se comprueba lo que más importa de la respuesta: que dice la verdad sobre
si la copia salió de esta máquina. Callarlo dejaría a quien pulsa el botón
creyendo que está cubierto contra un disco roto cuando solo lo está contra
un borrado por error.
"""
import os
import pathlib
import shutil
import sqlite3
import sys
import tempfile
import zipfile

sys.stdout.reconfigure(encoding="utf-8")
RAIZ = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "backend"))
sys.path.insert(0, str(RAIZ / "pruebas"))

fallos = []


def check(c, m):
    print(("  OK    " if c else "  FALLO ") + m)
    if not c:
        fallos.append(m)


tmp = pathlib.Path(tempfile.mkdtemp())
datos = tmp / "data"
datos.mkdir()
base = datos / "rrhh.db"

# Que los respaldos de la prueba NO caigan en la carpeta de verdad.
respaldos_prueba = tmp / "respaldos"

try:
    print("1. Se monta un sistema de prueba con datos")
    os.environ["DB_PATH"] = str(base)
    os.environ["RRHH_ENV_PATH"] = str(tmp / "no-existe.env")

    import config                                     # noqa: E402
    config._cache = {}
    config._ENV_PATH = str(tmp / "no-existe.env")
    config.DB_PATH = str(base)
    config.LOGIN_ESTRICTO = True

    import db                                         # noqa: E402
    db.iniciar()

    con = sqlite3.connect(base, isolation_level=None)
    for n in range(4):
        con.execute("INSERT INTO personal (nombre, documento, cargo, estado) "
                    "VALUES (?,?,?,'activo')",
                    (f"Persona {n}", f"DOC{n:05d}", "Cargo"))
    cuantas = con.execute("SELECT COUNT(*) FROM personal").fetchone()[0]
    con.close()
    print(f"   {cuantas} personas en la base de prueba")

    # La herramienta escribe en RAIZ/respaldos. Se la desvía a la carpeta
    # temporal para no ensuciar —ni podar— las copias de verdad.
    import respaldos as mod_respaldos                 # noqa: E402
    herramienta = mod_respaldos._herramienta("respaldo")
    herramienta.RAIZ = tmp
    mod_respaldos.CARPETA = respaldos_prueba

    # El envío al servidor se SIMULA. Una prueba no manda archivos a la
    # máquina de producción: ensuciaría las copias de verdad y podría
    # podar una buena para hacerle sitio a una de mentira. Se comprueban
    # las dos vías —que salga y que no— sin tocar nada real.
    fuera = mod_respaldos._herramienta("respaldo_fuera")

    def envio_finge_bien(z, hablar=None):
        return "huella-de-mentira"

    def envio_finge_mal(z, hablar=None):
        raise RuntimeError("no hay conexión con el servidor (simulado)")

    fuera.enviar_zip = envio_finge_bien

    import app as A                                   # noqa: E402
    A.app.config["PROPAGATE_EXCEPTIONS"] = False
    import ayuda_sesion                               # noqa: E402
    cli = ayuda_sesion.cliente(A.app)

    # El ayudante de sesión crea su propia ficha de personal, así que el
    # recuento bueno es este, tomado después de crearla.
    con = sqlite3.connect(base)
    cuantas = con.execute("SELECT COUNT(*) FROM personal").fetchone()[0]
    con.close()
    print(f"   {cuantas} personas cuando se pulsa el botón")

    print("\n2. Antes de pulsar no hay ninguna copia")
    r = cli.get("/api/respaldo")
    check(r.status_code == 200, f"/api/respaldo responde {r.status_code}")
    d = r.get_json()
    check(d.get("cuantas") == 0, f"cuantas = {d.get('cuantas')}")
    check(d.get("ultima") is None, "no hay última copia")

    print("\n3. Se pulsa el botón")
    r = cli.post("/api/respaldo")
    check(r.status_code == 200, f"responde {r.status_code}")
    d = r.get_json() or {}
    check(d.get("ok") is True, f"ok = {d.get('ok')}")
    check(bool(d.get("archivo")), f"dice qué archivo hizo: {d.get('archivo')}")
    check((d.get("bytes") or 0) > 1000, f"pesa algo: {d.get('bytes')} bytes")

    print("\n4. Dice la verdad sobre si salió de esta máquina")
    check("fuera" in d, "la respuesta incluye 'fuera'")
    if d.get("fuera"):
        print("   (salió al servidor)")
    else:
        check(bool(d.get("motivo")),
              f"si no salió, explica por qué: {str(d.get('motivo'))[:60]}")

    print("\n5. El archivo existe y se puede volver a abrir")
    zips = list(respaldos_prueba.glob("*.zip"))
    check(len(zips) == 1, f"hay {len(zips)} archivo(s) de respaldo")
    if zips:
        z = zips[0]
        check(z.name == d.get("archivo"), "es el que dijo la respuesta")
        with zipfile.ZipFile(z) as f:
            check(f.testzip() is None, "el zip no está dañado")
            check("rrhh.db" in f.namelist(), "lleva la base dentro")
            f.extract("rrhh.db", tmp / "abierto")

        con = sqlite3.connect(tmp / "abierto" / "rrhh.db")
        check(con.execute("PRAGMA integrity_check").fetchone()[0] == "ok",
              "la base del respaldo pasa el control de integridad")
        n = con.execute("SELECT COUNT(*) FROM personal").fetchone()[0]
        check(n == cuantas, f"están las {cuantas} personas ({n} encontradas)")
        con.close()

    print("\n6. Ahora el estado dice que sí hay copia")
    d2 = cli.get("/api/respaldo").get_json()
    check(d2.get("cuantas") == 1, f"cuantas = {d2.get('cuantas')}")
    check((d2.get("ultima") or {}).get("archivo") == d.get("archivo"),
          "la última es la que se acaba de hacer")
    check(d2.get("dias") == 0, f"se hizo hoy (dias = {d2.get('dias')})")

    print("\n7. Si no se puede enviar fuera, lo dice y no miente")
    fuera.enviar_zip = envio_finge_mal
    d3 = cli.post("/api/respaldo").get_json() or {}
    check(d3.get("ok") is True, "la copia se hace igual")
    check(d3.get("fuera") is False, "avisa de que NO salió de la máquina")
    check("simulado" in str(d3.get("motivo", "")),
          f"dice el motivo: {d3.get('motivo')}")
    check(len(list(respaldos_prueba.glob("*.zip"))) == 2,
          "y el archivo local existe igualmente")

    print("\n8. Sin sesión no se puede tocar")
    limpio = A.app.test_client()
    check(limpio.get("/api/respaldo").status_code == 401,
          "leer el estado pide sesión")
    check(limpio.post("/api/respaldo").status_code == 401,
          "hacer una copia pide sesión")

finally:
    shutil.rmtree(tmp, ignore_errors=True)

print()
if fallos:
    print(f"FALLA: {len(fallos)}")
    for f in fallos:
        print("   ·", f)
    sys.exit(1)
print("TODO BIEN")
