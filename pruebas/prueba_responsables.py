# -*- coding: utf-8 -*-
"""El esquema nuevo, probado sobre una COPIA antes de tocar la base real."""
import os
import sys, os, shutil, sqlite3, tempfile, pathlib
sys.stdout.reconfigure(encoding="utf-8")
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RAIZ, "backend"))

copia = pathlib.Path(tempfile.mkdtemp()) / "resp.db"
shutil.copy2(os.path.join(RAIZ, "data", "rrhh.db"), copia)
os.environ["DB_PATH"] = str(copia)
import config; config.DB_PATH = str(copia)
import db; db.config.DB_PATH = str(copia)
db.iniciar()

fallos = []
def check(c, m):
    print(("  OK    " if c else "  FALLO ") + m)
    if not c: fallos.append(m)

con = sqlite3.connect(copia); con.row_factory = sqlite3.Row
tablas = [r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")]
check("responsables" in tablas, "existe la tabla responsables")
check("responsable_beneficiario" in tablas, "existe la tabla de vínculo")

cols = [r[1] for r in con.execute("PRAGMA table_info(responsables)")]
print("   responsables:", len(cols), "columnas")
for c in ("nombre","documento","telefono","ocupacion","origen","origen_personal_id"):
    check(c in cols, f"responsables tiene '{c}'")
check("tutor_id" in [r[1] for r in con.execute("PRAGMA table_info(beneficiarios)")],
      "tutor_id SIGUE en beneficiarios: la migración aún no se ha hecho")

print("\nEl vínculo funciona en las dos direcciones")
con.execute("PRAGMA foreign_keys = ON")
b1 = con.execute("INSERT INTO beneficiarios (nombre) VALUES ('Zzz Nino A')").lastrowid
b2 = con.execute("INSERT INTO beneficiarios (nombre) VALUES ('Zzz Nino B')").lastrowid
r1 = con.execute("INSERT INTO responsables (nombre) VALUES ('Zzz Madre')").lastrowid
r2 = con.execute("INSERT INTO responsables (nombre) VALUES ('Zzz Abuela')").lastrowid
con.execute("INSERT INTO responsable_beneficiario (responsable_id,beneficiario_id,parentesco,es_principal,es_legal) VALUES (?,?,'Madre',1,1)", (r1,b1))
con.execute("INSERT INTO responsable_beneficiario (responsable_id,beneficiario_id,parentesco,puede_recoger) VALUES (?,?,'Abuela',1)", (r2,b1))
con.execute("INSERT INTO responsable_beneficiario (responsable_id,beneficiario_id,parentesco,es_principal) VALUES (?,?,'Madre',1)", (r1,b2))
con.commit()
n = con.execute("SELECT COUNT(*) FROM responsable_beneficiario WHERE beneficiario_id=?", (b1,)).fetchone()[0]
check(n == 2, f"un beneficiario admite varios responsables ({n})")
n = con.execute("SELECT COUNT(*) FROM responsable_beneficiario WHERE responsable_id=?", (r1,)).fetchone()[0]
check(n == 2, f"un responsable admite varios beneficiarios ({n})")

try:
    con.execute("INSERT INTO responsable_beneficiario (responsable_id,beneficiario_id) VALUES (?,?)", (r1,b1))
    con.commit(); check(False, "el duplicado debería rechazarse")
except sqlite3.IntegrityError:
    con.rollback(); check(True, "no deja repetir el mismo par dos veces")

try:
    con.execute("INSERT INTO responsable_beneficiario (responsable_id,beneficiario_id) VALUES (9999,?)", (b1,))
    con.commit(); check(False, "debería rechazar un responsable inexistente")
except sqlite3.IntegrityError:
    con.rollback(); check(True, "rechaza vincular a un responsable que no existe")

con.execute("DELETE FROM responsables WHERE id=?", (r1,)); con.commit()
n = con.execute("SELECT COUNT(*) FROM responsable_beneficiario WHERE responsable_id=?", (r1,)).fetchone()[0]
check(n == 0, "al borrar un responsable se van sus vínculos, no quedan huérfanos")
check(con.execute("SELECT COUNT(*) FROM beneficiarios WHERE id=?", (b1,)).fetchone()[0] == 1,
      "pero el beneficiario NO se borra con él")
con.close()

real = sqlite3.connect(os.path.join(RAIZ, "data", "rrhh.db"))
t = [r[0] for r in real.execute("SELECT name FROM sqlite_master WHERE type='table'")]
real.close()
print(f"\nbase REAL: responsables presente = {'responsables' in t}")

# ── Las consultas de db.py ───────────────────────────────────────────────
print("")
print("Las consultas de db.py sobre la copia")
rid = db.crear_responsable({"nombre": "Zzz Rosa Madre", "documento": "ZZ1",
                            "telefono": "999", "ocupacion": "Comerciante"})
bid = db.crear_beneficiario({"nombre": "Zzz Nino C"})
bid2 = db.crear_beneficiario({"nombre": "Zzz Nino D"})
check(db.responsable(rid)["nombre"] == "Zzz Rosa Madre", "crear y leer una ficha")

db.vincular(rid, bid, {"parentesco": "Madre", "es_principal": 1, "es_legal": 1})
db.vincular(rid, bid2, {"parentesco": "Madre", "puede_recoger": 1})
check(len(db.beneficiarios_de(rid)) == 2, "un responsable con dos beneficiarios")
r = db.responsables_de(bid)
check(len(r) == 1 and r[0]["parentesco"] == "Madre", "y el vinculo se lee desde el nino")
check(r[0]["telefono"] == "999", "trae el contacto del responsable, sin duplicarlo")

# Idempotencia: volver a vincular corrige, no revienta contra el UNIQUE
db.vincular(rid, bid, {"parentesco": "Madrastra"})
r = db.responsables_de(bid)
check(len(r) == 1, "vincular dos veces no duplica la fila")
check(r[0]["parentesco"] == "Madrastra", "sino que corrige el parentesco")
check(r[0]["es_legal"] == 1, "y no pisa los campos que no se mandaron")

fila = db.responsables(texto="ZZ1")
check(len(fila) == 1 and fila[0]["beneficiarios"] == 2,
      "el buscador encuentra por documento y trae el conteo")
check(len(db.responsables(texto="noexiste")) == 0, "y no inventa resultados")

db.editar_responsable(rid, {"telefono": "888"})
check(db.responsable(rid)["telefono"] == "888", "editar guarda")

db.desvincular(rid, bid2)
check(len(db.beneficiarios_de(rid)) == 1, "desvincular quita solo ese vinculo")
db.borrar_responsable(rid)
check(db.responsable(rid) is None, "borrar la ficha")
check(len(db.responsables_de(bid)) == 0, "y con ella sus vinculos")
check(db.beneficiario(bid) is not None, "el beneficiario sigue existiendo")

print("\n" + (f"  {len(fallos)} FALLOS" if fallos else "  ESQUEMA DE RESPONSABLES OK"))
sys.exit(1 if fallos else 0)
