# -*- coding: utf-8 -*-
"""
El esquema del canal web, sobre una COPIA.

Lo que importa comprobar:
  · las marcas viejas quedan como 'terminal', no como nulas
  · el descriptor se guarda y no hay ningún sitio donde quepa una foto
  · el consentimiento sobrevive al borrado del rostro
"""
import os
import sys, os, shutil, sqlite3, tempfile, pathlib, json
sys.stdout.reconfigure(encoding="utf-8")

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RAIZ, "backend"))

COPIA = pathlib.Path(tempfile.mkdtemp()) / "canal.db"
shutil.copy2(os.path.join(RAIZ, "data", "rrhh.db"), COPIA)
os.environ["DB_PATH"] = str(COPIA)
import config
config.DB_PATH = str(COPIA)
import db
db.config.DB_PATH = str(COPIA)

# Una marca ANTERIOR a la columna, para probar la migración de verdad
con = sqlite3.connect(COPIA)
con.execute("PRAGMA foreign_keys = OFF")
try:
    con.execute("ALTER TABLE marcas DROP COLUMN canal")
except sqlite3.OperationalError:
    pass
pid = con.execute("INSERT INTO personal (nombre, estado) VALUES ('Zzz Canal', 'activo')").lastrowid
# El número NO va a mano: el 9500 se lo quedaron las personas de prueba
# sembradas el 25/08 y la copia las trae. Se toma el primero libre.
usados = [f[0] for f in con.execute("SELECT staff_number FROM identidades")]
SN = next(n for n in range(9700, 9800) if n not in usados)
con.execute("INSERT INTO identidades (staff_number, personal_id, metodo, estado) VALUES (?, ?, 'facial', 'enrolado')", (SN, pid))
con.execute("INSERT INTO marcas (staff_number, fecha, hora, metodo) VALUES (?, '2026-08-01', '08:00', 'facial')", (SN,))
con.commit(); con.close()

db.iniciar()   # aquí se añade la columna

fallos = []
def check(c, m):
    print(("  OK    " if c else "  FALLO ") + m)
    if not c: fallos.append(m)

con = sqlite3.connect(COPIA); con.row_factory = sqlite3.Row

print("1. La columna 'canal' llega a una base que ya existía")
cols = [r[1] for r in con.execute("PRAGMA table_info(marcas)")]
check("canal" in cols, "marcas tiene 'canal'")
vieja = con.execute("SELECT canal FROM marcas WHERE staff_number = ?", (SN,)).fetchone()
check(vieja["canal"] == "terminal",
      f"la marca anterior queda como 'terminal', no nula ({vieja['canal']!r})")

print("\n2. Las dos tablas nuevas")
tablas = [r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")]
check("rostros_web" in tablas, "existe rostros_web")
check("consentimientos" in tablas, "existe consentimientos")

print("\n3. En rostros_web no cabe una foto")
cols_r = [r[1] for r in con.execute("PRAGMA table_info(rostros_web)")]
print("   columnas: " + ", ".join(cols_r))
check(not any(x in cols_r for x in ("foto", "imagen", "archivo", "blob")),
      "ninguna columna guarda imágenes")
check("descriptor" in cols_r and "modelo" in cols_r,
      "solo el descriptor y con qué modelo se generó")

print("\n4. Guardar y leer un descriptor")
vector = [round(i * 0.01, 4) for i in range(128)]
con.execute("""INSERT INTO rostros_web (personal_id, descriptor, dimension, modelo)
               VALUES (?, ?, ?, ?)""",
            (pid, json.dumps(vector), len(vector), "prueba-v1"))
con.commit()
r = con.execute("SELECT * FROM rostros_web WHERE personal_id = ?", (pid,)).fetchone()
check(json.loads(r["descriptor"]) == vector, "el vector se recupera igual")
check(r["dimension"] == 128, "con su longitud, para poder validar antes de comparar")

print("\n5. Un rostro por persona, no un montón")
try:
    con.execute("INSERT INTO rostros_web (personal_id, descriptor) VALUES (?, '[]')", (pid,))
    con.commit(); check(False, "debería rechazar el segundo")
except sqlite3.IntegrityError:
    con.rollback(); check(True, "la clave primaria impide dos rostros de la misma persona")

print("\n6. El consentimiento sobrevive al borrado del rostro")
con.execute("PRAGMA foreign_keys = ON")
con.execute("""INSERT INTO consentimientos (personal_id, tipo, aceptado, version, texto)
               VALUES (?, 'rostro_web', 1, 'v1', 'Texto que la persona leyó')""", (pid,))
con.commit()
con.execute("DELETE FROM rostros_web WHERE personal_id = ?", (pid,))
con.commit()
n = con.execute("SELECT COUNT(*) FROM consentimientos WHERE personal_id = ?", (pid,)).fetchone()[0]
check(n == 1, "borrar el rostro NO borra la constancia de que se pidió permiso")
c = con.execute("SELECT * FROM consentimientos WHERE personal_id = ?", (pid,)).fetchone()
check(c["texto"] == "Texto que la persona leyó",
      "y se conserva el texto exacto que aceptó, no solo un 'sí'")

print("\n7. Un rechazo también queda registrado")
con.execute("""INSERT INTO consentimientos (personal_id, tipo, aceptado, version)
               VALUES (?, 'rostro_web', 0, 'v1')""", (pid,))
con.commit()
n = con.execute("SELECT COUNT(*) FROM consentimientos WHERE personal_id = ? AND aceptado = 0",
                (pid,)).fetchone()[0]
check(n == 1, "un 'no acepto' se guarda igual que un sí")

print("\n8. Al borrar la persona se van sus datos biométricos")
con.execute("INSERT INTO rostros_web (personal_id, descriptor) VALUES (?, '[]')", (pid,))
con.commit()
con.execute("DELETE FROM personal WHERE id = ?", (pid,))
con.commit()
check(con.execute("SELECT COUNT(*) FROM rostros_web WHERE personal_id=?", (pid,)).fetchone()[0] == 0,
      "el descriptor se va con la ficha")
check(con.execute("SELECT COUNT(*) FROM consentimientos WHERE personal_id=?", (pid,)).fetchone()[0] == 0,
      "y también sus consentimientos: sin persona no hay nada que amparar")
con.close()

print("\n9. La base real no se tocó")
real = sqlite3.connect(os.path.join(RAIZ, "data", "rrhh.db"))
t = [r[0] for r in real.execute("SELECT name FROM sqlite_master WHERE type='table'")]
n = real.execute("SELECT COUNT(*) FROM personal WHERE nombre='Zzz Canal'").fetchone()[0]
real.close()
check(n == 0, "nada de esta prueba llegó a la base real")

print("\n" + (f"  {len(fallos)} FALLOS" if fallos else "  ESQUEMA DEL CANAL WEB OK"))
for f in fallos: print("   -", f)
sys.exit(1 if fallos else 0)
