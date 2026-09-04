# -*- coding: utf-8 -*-
"""Que una base con el esquema ANTIGUO se repare sola al arrancar.

POR QUÉ EXISTE
──────────────
El 04/09/2026 el contenedor de Coolify arrancaba «healthy» y aun así
/api/personal y /api/beneficiarios devolvían 500:

    sqlite3.OperationalError: no such column: i.responsable_id

Su volumen tenía una base creada por el despliegue del 17/08, cuando
'identidades' solo contemplaba dos entidades (personal y beneficiarios).
La columna responsable_id llegó después, y no se puede añadir con un ALTER
porque la tabla lleva un CHECK que SQLite no deja alterar.

Existía backend/migrar_identidades.py, pero había que lanzarlo A MANO. El
contenedor nunca lo hacía, así que la base se quedaba rota para siempre y
el único aviso era un 500 en dos pantallas.

Ahora db.iniciar() lo detecta y reconstruye la tabla solo.

EL PELIGRO QUE VIGILA ESTA PRUEBA
─────────────────────────────────
'marcas' cuelga de identidades(staff_number) con ON DELETE CASCADE. La
reconstrucción tiene que hacer un DROP TABLE de en medio: con las claves
foráneas activas, ese DROP SE LLEVA TODOS LOS FICHAJES. Ya pasó dos veces
en este proyecto por otras vías. Por eso aquí se cuentan las marcas antes y
después, y no se da por buena la migración si falta una sola.
"""
import os
import pathlib
import shutil
import sqlite3
import sys
import tempfile

sys.stdout.reconfigure(encoding="utf-8")
RAIZ = pathlib.Path(__file__).resolve().parent.parent

fallos = []


def check(c, m):
    print(("  OK    " if c else "  FALLO ") + m)
    if not c:
        fallos.append(m)


# ── La tabla tal y como era antes de que existieran los tutores ─────────
TABLA_VIEJA = """
CREATE TABLE identidades (
    staff_number    INTEGER PRIMARY KEY,
    personal_id     INTEGER REFERENCES personal(id)      ON DELETE CASCADE,
    beneficiario_id INTEGER REFERENCES beneficiarios(id) ON DELETE CASCADE,
    metodo          TEXT DEFAULT 'facial',
    estado          TEXT DEFAULT 'pendiente',
    tiene_rostro    INTEGER DEFAULT 0,
    tiene_huella    INTEGER DEFAULT 0,
    detalle         TEXT DEFAULT '',
    creado          TEXT DEFAULT (datetime('now','localtime')),
    CHECK ((personal_id IS NOT NULL) + (beneficiario_id IS NOT NULL) = 1),
    UNIQUE (personal_id),
    UNIQUE (beneficiario_id)
);
"""

tmp = pathlib.Path(tempfile.mkdtemp())
base = tmp / "rrhh.db"

try:
    # ── 1. Fabricar una base con el esquema de hoy y luego envejecerla ──
    print("1. Se prepara una base con el esquema antiguo")
    os.environ["DB_PATH"] = str(base)
    sys.path.insert(0, str(RAIZ / "backend"))
    os.chdir(RAIZ)

    import config                                    # noqa: E402
    config._cache = {}
    config._ENV_PATH = str(tmp / "no-existe.env")
    config.DB_PATH = str(base)

    import db                                        # noqa: E402
    db.iniciar()

    # Envejecerla: cambiar 'identidades' por la versión de dos entidades y
    # meter datos —identidades y marcas— como los tendría una base real.
    con = sqlite3.connect(base, isolation_level=None)
    con.execute("PRAGMA foreign_keys = OFF")
    con.execute("DROP VIEW IF EXISTS v_identidades")
    con.execute("DROP TABLE identidades")
    con.execute(TABLA_VIEJA)
    # Gente propia: la semilla de maqueta se retiró del repositorio en
    # el commit 8a37e78, así que una base nueva viene vacía.
    ids = []
    for n in range(3):
        cur = con.execute(
            "INSERT INTO personal (nombre, documento, cargo, estado) "
            "VALUES (?,?,?,'activo')",
            ("Persona de prueba %d" % n, "PRB%05d" % n, "Cargo"))
        ids.append(cur.lastrowid)
    for n, pid in enumerate(ids):
        con.execute("INSERT INTO identidades (staff_number, personal_id, "
                    "estado, tiene_rostro) VALUES (?,?,?,1)",
                    (9100 + n, pid, "enrolado"))
    for n in range(len(ids)):
        for h in ("08:0%d:00" % n, "17:0%d:00" % n):
            con.execute("INSERT INTO marcas (staff_number, fecha, hora, metodo) "
                        "VALUES (?,?,?,?)", (9100 + n, "2026-08-20", h, "facial"))

    cols = {r[1] for r in con.execute("PRAGMA table_info(identidades)")}
    identidades_antes = con.execute("SELECT COUNT(*) FROM identidades").fetchone()[0]
    marcas_antes = con.execute("SELECT COUNT(*) FROM marcas").fetchone()[0]
    con.close()

    check("responsable_id" not in cols, "la base queda SIN responsable_id")
    check(identidades_antes == 3, f"{identidades_antes} identidades")
    check(marcas_antes == 6, f"{marcas_antes} marcas")

    # ── 2. Arrancar el sistema contra ella ─────────────────────────────
    print("\n2. Se arranca el sistema contra esa base")
    db.iniciar()

    con = sqlite3.connect(base)
    cols = {r[1] for r in con.execute("PRAGMA table_info(identidades)")}
    identidades_despues = con.execute("SELECT COUNT(*) FROM identidades").fetchone()[0]
    marcas_despues = con.execute("SELECT COUNT(*) FROM marcas").fetchone()[0]
    rotas = list(con.execute("PRAGMA foreign_key_check"))
    con.close()

    check("responsable_id" in cols, "ahora la tabla tiene responsable_id")

    print("\n3. No se perdió nada por el camino")
    check(identidades_despues == identidades_antes,
          f"identidades: {identidades_antes} antes, {identidades_despues} después")
    check(marcas_despues == marcas_antes,
          f"marcas: {marcas_antes} antes, {marcas_despues} después"
          + ("" if marcas_despues == marcas_antes
             else "  ← el DROP se las llevó en cascada"))
    check(not rotas, f"sin claves foráneas rotas ({len(rotas)})")

    # ── 4. Lo que se caía, ahora responde ──────────────────────────────
    print("\n4. Las rutas que devolvían 500 ya responden")
    config.LOGIN_ESTRICTO = False
    import app as modulo_app                          # noqa: E402
    modulo_app.app.config["PROPAGATE_EXCEPTIONS"] = False
    cliente = modulo_app.app.test_client()
    for ruta in ("/api/personal", "/api/beneficiarios", "/api/usuarios"):
        r = cliente.get(ruta)
        check(r.status_code == 200, f"{ruta} → {r.status_code}")

    # ── 5. Segunda pasada: no debe volver a tocar nada ──────────────────
    print("\n5. Arrancar otra vez no vuelve a reconstruir")
    con = sqlite3.connect(base)
    antes = con.execute("SELECT COUNT(*) FROM marcas").fetchone()[0]
    con.close()
    db.iniciar()
    con = sqlite3.connect(base)
    despues = con.execute("SELECT COUNT(*) FROM marcas").fetchone()[0]
    sobra = con.execute("SELECT 1 FROM sqlite_master WHERE "
                        "name='identidades_nueva'").fetchone()
    con.close()
    check(despues == antes, f"las marcas siguen ahí ({despues})")
    check(sobra is None, "no queda la tabla intermedia identidades_nueva")

finally:
    try:
        shutil.rmtree(tmp, ignore_errors=True)
    except Exception:
        pass

print()
if fallos:
    print(f"FALLA: {len(fallos)}")
    for f in fallos:
        print("   ·", f)
    sys.exit(1)
print("TODO BIEN")
