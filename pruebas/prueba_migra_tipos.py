# -*- coding: utf-8 -*-
"""
RETIRADA el 27/08/2026 — no la ejecuta el corredor.

Comprobaba la migración a SEIS tipos de permiso. Ese mismo día la
ONG decidió adoptar los DIEZ del formato en papel, así que sus
afirmaciones dejaron de ser ciertas: aquí «licencia» se conserva y
en el sistema de hoy «licencia» no existe (pasó a «Otros», que es la
casilla que el papel le da).

Se conserva el archivo porque documenta cómo era la migración
anterior. Lo vigente lo cubre prueba_dos_firmas.
"""

# ── Cabecera original ──
import os
import sys, os, shutil, sqlite3, tempfile, pathlib, io, contextlib
sys.stdout.reconfigure(encoding="utf-8")

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RAIZ, "backend"))

COPIA = pathlib.Path(tempfile.mkdtemp()) / "tipos.db"
shutil.copy2(os.path.join(RAIZ, "data", "rrhh.db"), COPIA)
os.environ["DB_PATH"] = str(COPIA)
import config
config.DB_PATH = str(COPIA)
import migrar_tipos_permiso as M

fallos = []
def check(c, m):
    print(("  OK    " if c else "  FALLO ") + m)
    if not c:
        fallos.append(m)

def con():
    c = sqlite3.connect(COPIA, isolation_level=None)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys = ON")
    return c


# ── Se rehace el punto de partida ────────────────────────────────────────
# La copia trae la tabla YA migrada desde que la migración se ejecutó sobre
# la base real. Para probar la migración hay que devolverla a como estaba:
# una prueba que solo funciona antes de aplicar lo que prueba deja de servir
# justo cuando más falta hace, al repetirla.
TABLA_PREVIA = """
CREATE TABLE solicitudes_previa (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    personal_id    INTEGER NOT NULL REFERENCES personal(id) ON DELETE CASCADE,
    tipo           TEXT NOT NULL DEFAULT 'vacaciones',
    desde          TEXT NOT NULL,
    hasta          TEXT NOT NULL,
    motivo         TEXT DEFAULT '',
    estado         TEXT NOT NULL DEFAULT 'pendiente',
    requiere_admin INTEGER NOT NULL DEFAULT 0,
    jefe_id        INTEGER REFERENCES personal(id) ON DELETE SET NULL,
    aprob_jefe_el  TEXT DEFAULT '',
    aprob_admin_el TEXT DEFAULT '',
    resuelto_el    TEXT DEFAULT '',
    nota           TEXT DEFAULT '',
    creado         TEXT DEFAULT (datetime('now','localtime')),
    CHECK (tipo IN ('vacaciones','permiso','licencia')),
    CHECK (estado IN ('pendiente','pendiente_admin','aprobada','rechazada','cancelada')),
    CHECK (hasta >= desde)
);
"""

_c = sqlite3.connect(COPIA, isolation_level=None)
_sql = _c.execute("SELECT sql FROM sqlite_master WHERE name='solicitudes'").fetchone()
if _sql and "'medico'" in (_sql[0] or ""):
    _c.execute("PRAGMA foreign_keys = OFF")
    _c.execute("BEGIN")
    _c.execute(TABLA_PREVIA)
    # Solo las filas que el esquema viejo admite; hoy la tabla está vacía.
    # Se nombran las columnas del esquema VIEJO en vez de usar «*»: la
    # tabla de hoy tiene más (horas, sustento), y el asterisco las
    # arrastraría a una tabla que no las tiene.
    _viejas = ("id, personal_id, tipo, desde, hasta, motivo, estado, "
               "requiere_admin, jefe_id, aprob_jefe_el, aprob_admin_el, "
               "resuelto_el, nota, creado")
    _c.execute(f"INSERT INTO solicitudes_previa ({_viejas}) "
               f"SELECT {_viejas} FROM solicitudes "
               "WHERE tipo IN ('vacaciones','licencia')")
    _c.execute("DROP TABLE solicitudes")
    _c.execute("ALTER TABLE solicitudes_previa RENAME TO solicitudes")
    _c.execute("CREATE INDEX IF NOT EXISTS idx_solicitudes_persona "
               "ON solicitudes(personal_id, desde)")
    _c.execute("CREATE INDEX IF NOT EXISTS idx_solicitudes_estado "
               "ON solicitudes(estado, desde)")
    _c.execute("COMMIT")
    print("punto de partida rehecho: la copia vuelve a los tres tipos viejos")
_c.close()


print("0. Se siembran solicitudes de los tres tipos viejos")
c = con()
pid = c.execute("INSERT INTO personal (nombre, estado) "
                "VALUES ('Zzz Tipos Persona','activo')").lastrowid
jefe = c.execute("INSERT INTO personal (nombre, estado) "
                 "VALUES ('Zzz Tipos Jefe','activo')").lastrowid
siembra = [
    ("vacaciones", "2026-01-10", "2026-01-20", "aprobada",   1),
    ("permiso",    "2026-02-03", "2026-02-03", "pendiente",  0),
    ("permiso",    "2026-03-05", "2026-03-06", "rechazada",  0),
    ("licencia",   "2026-04-01", "2026-04-30", "pendiente_admin", 1),
]
for tipo, d, h, estado, admin in siembra:
    c.execute("INSERT INTO solicitudes (personal_id, tipo, desde, hasta, "
              "motivo, estado, requiere_admin, jefe_id) VALUES (?,?,?,?,?,?,?,?)",
              (pid, tipo, d, h, "motivo " + tipo, estado, admin, jefe))
antes = [dict(r) for r in
         c.execute("SELECT id,tipo,desde,hasta,estado,motivo,jefe_id "
                   "FROM solicitudes ORDER BY id")]
c.close()
print(f"   sembradas {len(antes)}")
check(len(antes) == 4, "hay cuatro solicitudes que conservar")

print("\n1. Antes de migrar, un tipo nuevo NO entra")
c = con()
try:
    c.execute("INSERT INTO solicitudes (personal_id, tipo, desde, hasta) "
              "VALUES (?,?,?,?)", (pid, "medico", "2026-05-01", "2026-05-02"))
    check(False, "debía rechazarlo y lo aceptó")
except sqlite3.IntegrityError:
    check(True, "el CHECK rechaza 'medico'")
c.close()

print("\n2. En simulación no escribe nada")
info = M.analizar(str(COPIA))
salida = io.StringIO()
with contextlib.redirect_stdout(salida):
    M.imprimir_plan(str(COPIA), info)
texto = salida.getvalue()
check("RECONSTRUCCIÓN" in texto, "enseña el plan")
check("2 de tipo 'permiso'" in texto or "2 de tipo 'permiso'  ->  otro" in texto,
      "cuenta las filas por tipo y dice a qué se traducen")
check("vacaciones' SE CONSERVA" in texto or "SE CONSERVA" in texto,
      "explica por qué se queda 'vacaciones'")
c = con()
sql = c.execute("SELECT sql FROM sqlite_master WHERE name='solicitudes'").fetchone()[0]
c.close()
check("'medico'" not in sql, "y la tabla sigue intacta")

print("\n3. Al ejecutar")
copiadas, respaldo = M.ejecutar(str(COPIA), info)
print(f"   {copiadas} filas · respaldo {os.path.basename(respaldo)}")
check(copiadas == len(antes), f"conserva las {len(antes)} filas")
check(os.path.exists(respaldo), "deja copia de seguridad antes de tocar nada")

c = con()
despues = [dict(r) for r in
           c.execute("SELECT id,tipo,desde,hasta,estado,motivo,jefe_id "
                     "FROM solicitudes ORDER BY id")]
c.close()
check([f["id"] for f in despues] == [f["id"] for f in antes],
      "los id no cambian")
check([f["estado"] for f in despues] == [f["estado"] for f in antes],
      "los estados se conservan")
check([f["desde"] for f in despues] == [f["desde"] for f in antes],
      "y las fechas")
check([f["jefe_id"] for f in despues] == [f["jefe_id"] for f in antes],
      "y el jefe que debía aprobarlas")

print("\n4. La traducción de tipos")
tipos = [f["tipo"] for f in despues]
print("   " + str(list(zip([f['tipo'] for f in antes], tipos))))
check(tipos[0] == "vacaciones", "'vacaciones' se queda como estaba")
check(tipos[1] == "otro" and tipos[2] == "otro",
      "los 'permiso' genéricos pasan a 'otro'")
check(tipos[3] == "licencia", "'licencia' se queda como estaba")
check("personal" not in tipos and "familiar" not in tipos and "medico" not in tipos,
      "no se inventa ningún tipo que no constaba")

print("\n5. Ahora entran los seis y nada más")
c = con()
def cabe(tipo, debe, etiqueta):
    try:
        c.execute("INSERT INTO solicitudes (personal_id, tipo, desde, hasta) "
                  "VALUES (?,?,?,?)", (pid, tipo, "2026-09-01", "2026-09-02"))
        paso = True
    except sqlite3.IntegrityError:
        paso = False
    check(paso == debe, etiqueta)
for t in ("vacaciones", "personal", "familiar", "medico", "licencia", "otro"):
    cabe(t, True, f"entra '{t}'")
cabe("permiso", False, "ya NO entra el viejo 'permiso' genérico")
cabe("loquesea", False, "ni un tipo inventado")

print("\n6. Las otras reglas siguen vivas")
try:
    c.execute("INSERT INTO solicitudes (personal_id, tipo, desde, hasta) "
              "VALUES (?,?,?,?)", (pid, "otro", "2026-09-10", "2026-09-01"))
    check(False, "aceptó una solicitud que termina antes de empezar")
except sqlite3.IntegrityError:
    check(True, "sigue rechazando 'hasta' anterior a 'desde'")
try:
    c.execute("INSERT INTO solicitudes (personal_id, tipo, desde, hasta, estado) "
              "VALUES (?,?,?,?,?)", (pid, "otro", "2026-09-01", "2026-09-02", "inventado"))
    check(False, "aceptó un estado inventado")
except sqlite3.IntegrityError:
    check(True, "y sigue rechazando estados que no existen")
c.close()

print("\n7. Los índices volvieron")
c = con()
idx = {r[0] for r in c.execute(
    "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='solicitudes'")}
c.close()
print("   " + str(sorted(x for x in idx if not x.startswith("sqlite_"))))
check("idx_solicitudes_persona" in idx and "idx_solicitudes_estado" in idx,
      "el RENAME no se los llevó por delante")

print("\n8. Al borrar a la persona, sus solicitudes se van con ella")
c = con()
c.execute("DELETE FROM personal WHERE id = ?", (pid,))
quedan = c.execute("SELECT COUNT(*) FROM solicitudes WHERE personal_id = ?",
                   (pid,)).fetchone()[0]
c.close()
check(quedan == 0, f"cascada intacta ({quedan})")

print("\n9. Repetirla no hace nada")
info2 = M.analizar(str(COPIA))
check(info2["ya_migrada"] is True, "reconoce que ya está migrada")
salida = io.StringIO()
with contextlib.redirect_stdout(salida):
    hay = M.imprimir_plan(str(COPIA), info2)
check(hay is False, "y avisa de que no hay nada que hacer")

print("\n10. La verificación propia del script pasa")
c = con()
n = c.execute("SELECT COUNT(*) FROM solicitudes").fetchone()[0]
c.close()
propios = M.verificar(str(COPIA), n)
print("   " + (str(propios) if propios else "sin objeciones"))
check(not propios, "el script se da por bueno a sí mismo")

print("\n11. La base real ni se abrió")
real = sqlite3.connect(os.path.join(RAIZ, "data", "rrhh.db"))
sql_real = real.execute(
    "SELECT sql FROM sqlite_master WHERE name='solicitudes'").fetchone()[0]
real.close()
# Ya no se exige que la real esté sin migrar —lo está desde que se ejecutó—,
# sino que esta prueba no haya dejado nada suyo dentro.
intrusos = sqlite3.connect(os.path.join(RAIZ, "data", "rrhh.db"))
n_intrusos = intrusos.execute(
    "SELECT COUNT(*) FROM personal WHERE nombre LIKE 'Zzz Tipos%'").fetchone()[0]
intrusos.close()
check(n_intrusos == 0,
      f"ninguna ficha de esta prueba llegó a la base real ({n_intrusos})")

print("\n" + (f"  {len(fallos)} FALLOS" if fallos else "  TIPOS DE PERMISO OK (sobre copia)"))
for f in fallos:
    print("   -", f)
sys.exit(1 if fallos else 0)
