# -*- coding: utf-8 -*-
"""
La reconstrucción de 'identidades', sobre una COPIA de la base real.

Lo que importa comprobar:
  · sin --ejecutar no escribe absolutamente nada
  · las identidades que ya existían sobreviven con su mismo staff_number
  · después, un responsable SÍ puede enrolarse
  · una identidad con dos dueños o sin dueño se sigue rechazando
  · las marcas no se tocan y no queda ninguna clave foránea rota
  · repetirla no hace nada (es idempotente)
  · la base REAL no se toca
"""
import os
import sys, os, shutil, sqlite3, tempfile, pathlib, io, contextlib
sys.stdout.reconfigure(encoding="utf-8")

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RAIZ, "backend"))

COPIA = pathlib.Path(tempfile.mkdtemp()) / "identidades.db"
shutil.copy2(os.path.join(RAIZ, "data", "rrhh.db"), COPIA)
os.environ["DB_PATH"] = str(COPIA)
import config
config.DB_PATH = str(COPIA)
import migrar_identidades as M

fallos = []
def check(c, m):
    print(("  OK    " if c else "  FALLO ") + m)
    if not c:
        fallos.append(m)

def con():
    c = sqlite3.connect(COPIA)
    c.execute("PRAGMA foreign_keys = ON")
    return c


# ── Se rehace el punto de partida ────────────────────────────────────────
# La copia trae la tabla YA migrada desde que la migración se ejecutó sobre
# la base real. Para probar la migración hay que volver a dejarla como
# estaba: una prueba que solo funciona antes de aplicar lo que prueba deja
# de servir justo cuando más falta hace, al repetirla.
TABLA_VIEJA = """
CREATE TABLE identidades_previa (
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

VISTA_VIEJA = """
CREATE VIEW v_identidades AS
SELECT i.staff_number, i.metodo, i.estado, i.tiene_rostro, i.tiene_huella,
       i.detalle, i.creado, i.personal_id, i.beneficiario_id,
       CASE WHEN i.personal_id IS NOT NULL THEN 'personal' ELSE 'beneficiario' END AS tipo,
       COALESCE(p.nombre, b.nombre)       AS nombre,
       COALESCE(p.documento, b.documento) AS documento,
       CASE WHEN i.beneficiario_id IS NOT NULL THEN 'ninos'
            WHEN p.vinculo = 'voluntario'  THEN NULL
            ELSE p.ambito END              AS ambito,
       p.vinculo, p.cargo, p.area, p.sede,
       b.casa, b.sala, b.grado
  FROM identidades i
  LEFT JOIN personal      p ON p.id = i.personal_id
  LEFT JOIN beneficiarios b ON b.id = i.beneficiario_id
"""

_c = sqlite3.connect(COPIA, isolation_level=None)
_cols = {r[1] for r in _c.execute("PRAGMA table_info(identidades)")}
if "responsable_id" in _cols:
    _c.execute("PRAGMA foreign_keys = OFF")
    _c.execute("BEGIN")
    _c.execute("DROP VIEW IF EXISTS v_identidades")
    _c.execute(TABLA_VIEJA)
    _c.execute("INSERT INTO identidades_previa "
               "(staff_number, personal_id, beneficiario_id, metodo, estado, "
               " tiene_rostro, tiene_huella, detalle, creado) "
               "SELECT staff_number, personal_id, beneficiario_id, metodo, estado, "
               "       tiene_rostro, tiene_huella, detalle, creado "
               "  FROM identidades WHERE responsable_id IS NULL")
    # Y sus marcas se van con ellas. Antes no: quedaban marcas apuntando a
    # un staffNumber que la tabla vieja ya no contenía, un estado roto que
    # en la realidad no ocurre —cuando la tabla era de dos entidades, un
    # responsable no podía tener marcas porque no podía enrolarse—. La
    # migración detectaba esa inconsistencia y se negaba a seguir, que es
    # exactamente lo que debe hacer; la fabricaba esta preparación.
    _c.execute("DELETE FROM marcas WHERE staff_number IN "
               "(SELECT staff_number FROM identidades "
               "  WHERE responsable_id IS NOT NULL)")
    _c.execute("DROP TABLE identidades")
    _c.execute("ALTER TABLE identidades_previa RENAME TO identidades")
    _c.execute(VISTA_VIEJA)
    _c.execute("COMMIT")
    print("punto de partida rehecho: la copia vuelve a la tabla de dos entidades")
_c.close()


print("0. Punto de partida")
c = con()
# Una identidad de cada tipo, para que la copia tenga algo que conservar.
pid = c.execute("INSERT INTO personal (nombre, estado) VALUES ('Zzz Ident Personal','activo')").lastrowid
bid = c.execute("INSERT INTO beneficiarios (nombre, estado) VALUES ('Zzz Ident Benef','activo')").lastrowid
rid = c.execute("INSERT INTO responsables (nombre) VALUES ('Zzz Ident Tutor')").lastrowid
c.execute("INSERT INTO identidades (staff_number, personal_id, metodo, estado) VALUES (9801,?,'facial','enrolado')", (pid,))
c.execute("INSERT INTO identidades (staff_number, beneficiario_id, metodo, estado) VALUES (9802,?,'huella','enrolado')", (bid,))
c.execute("INSERT INTO marcas (staff_number, fecha, hora, metodo) VALUES (9801,'2026-08-01','08:00','facial')")
c.commit()
antes = c.execute("SELECT COUNT(*) FROM identidades").fetchone()[0]
antes_sn = sorted(r[0] for r in c.execute("SELECT staff_number FROM identidades"))
antes_marcas = c.execute("SELECT COUNT(*) FROM marcas").fetchone()[0]
c.close()
print(f"   identidades {antes} · marcas {antes_marcas}")
check(antes >= 2, "hay identidades que conservar")

print("\n1. Antes de migrar, un responsable NO puede enrolarse")
c = con()
try:
    c.execute("INSERT INTO identidades (staff_number, responsable_id) VALUES (9803,?)", (rid,))
    check(False, "debía rechazarlo y lo aceptó")
except sqlite3.OperationalError as e:
    check("responsable_id" in str(e), f"no existe ni la columna ({e})")
except sqlite3.IntegrityError as e:
    check(True, f"lo rechaza el CHECK ({str(e)[:40]}…)")
c.close()

print("\n2. En simulación no escribe nada")
info = M.analizar(str(COPIA))
salida = io.StringIO()
with contextlib.redirect_stdout(salida):
    M.imprimir_plan(str(COPIA), info)
texto = salida.getvalue()
check("RECONSTRUCCIÓN" in texto, "enseña el plan")
check("9801" in texto, "nombra las filas que va a conservar")
c = con()
cols = {r[1] for r in c.execute("PRAGMA table_info(identidades)")}
c.close()
check("responsable_id" not in cols, "y la tabla sigue intacta")

print("\n3. Al ejecutar")
copiadas, respaldo = M.ejecutar(str(COPIA), info)
print(f"   {copiadas} filas · respaldo {os.path.basename(respaldo)}")
check(copiadas == antes, f"conserva las {antes} filas")
check(os.path.exists(respaldo), "deja copia de seguridad antes de tocar nada")

c = con()
sn = sorted(r[0] for r in c.execute("SELECT staff_number FROM identidades"))
check(sn == antes_sn, f"los staff_number son los mismos ({sn})")
check(c.execute("SELECT COUNT(*) FROM marcas").fetchone()[0] == antes_marcas,
      "las marcas no se tocaron")
check(list(c.execute("PRAGMA foreign_key_check")) == [],
      "ninguna clave foránea quedó rota")
c.close()

print("\n4. Ahora un responsable SÍ puede enrolarse")
c = con()
try:
    c.execute("INSERT INTO identidades (staff_number, responsable_id, metodo) VALUES (9803,?,'facial')", (rid,))
    c.commit()
    check(True, "se acepta la identidad de un tutor")
except Exception as e:
    check(False, f"seguía rechazándolo: {e}")
c.close()

print("\n5. Lo que debe seguir rechazándose")
c = con()
def rechaza(sql, params, que):
    try:
        c.execute(sql, params)
        check(False, f"aceptó {que} y no debía")
    except sqlite3.IntegrityError:
        check(True, f"rechaza {que}")
rechaza("INSERT INTO identidades (staff_number, personal_id, responsable_id) VALUES (?,?,?)",
        (9804, pid, rid), "una identidad con DOS dueños")
rechaza("INSERT INTO identidades (staff_number) VALUES (?)", (9805,),
        "una identidad sin dueño")
rechaza("INSERT INTO identidades (staff_number, responsable_id) VALUES (?,?)",
        (9806, rid), "un segundo enrolamiento del mismo tutor")
c.rollback(); c.close()

print("\n6. Al borrar al tutor, su identidad se va con él")
c = con()
c.execute("DELETE FROM responsables WHERE id = ?", (rid,))
c.commit()
queda = c.execute("SELECT COUNT(*) FROM identidades WHERE staff_number = 9803").fetchone()[0]
check(queda == 0, f"la identidad desaparece en cascada ({queda})")
c.close()

print("\n7. Repetirla no hace nada")
info2 = M.analizar(str(COPIA))
check(info2["ya_migrada"] is True, "reconoce que ya está migrada")
salida = io.StringIO()
with contextlib.redirect_stdout(salida):
    hay = M.imprimir_plan(str(COPIA), info2)
check(hay is False, "y avisa de que no hay nada que hacer")

print("\n8. La verificación propia del script pasa")
c = con()
n = c.execute("SELECT COUNT(*) FROM identidades").fetchone()[0]
c.close()
propios = M.verificar(str(COPIA), n)
print("   " + (str(propios) if propios else "sin objeciones"))
check(not propios, "el script se da por bueno a sí mismo")

print("\n9. La base real ni se abrió")
# Ya no se exige que la real esté sin migrar —lo está desde que se ejecutó—,
# sino que esta prueba no haya dejado nada suyo dentro.
real = sqlite3.connect(os.path.join(RAIZ, "data", "rrhh.db"))
intrusos = real.execute(
    "SELECT COUNT(*) FROM personal WHERE nombre LIKE 'Zzz Ident%'").fetchone()[0]
intrusos += real.execute(
    "SELECT COUNT(*) FROM responsables WHERE nombre LIKE 'Zzz Ident%'").fetchone()[0]
real.close()
check(intrusos == 0,
      f"ninguna ficha de esta prueba llegó a la base real ({intrusos})")

print("\n" + (f"  {len(fallos)} FALLOS" if fallos else "  RECONSTRUCCIÓN DE IDENTIDADES OK (sobre copia)"))
for f in fallos:
    print("   -", f)
sys.exit(1 if fallos else 0)
