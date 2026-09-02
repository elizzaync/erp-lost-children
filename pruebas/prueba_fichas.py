# -*- coding: utf-8 -*-
"""
El esquema de las fichas completas, sobre una COPIA.

Lo que importa: que las columnas lleguen a una base que YA tiene datos sin
perder nada, y que las tablas de series se comporten como series.
"""
import os
import sys, os, shutil, sqlite3, tempfile, pathlib
sys.stdout.reconfigure(encoding="utf-8")

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RAIZ, "backend"))

COPIA = pathlib.Path(tempfile.mkdtemp()) / "fichas.db"
shutil.copy2(os.path.join(RAIZ, "data", "rrhh.db"), COPIA)
os.environ["DB_PATH"] = str(COPIA)
import config
config.DB_PATH = str(COPIA)
import db
db.config.DB_PATH = str(COPIA)

# Datos ANTES de migrar, para comprobar que sobreviven
con = sqlite3.connect(COPIA)
pid = con.execute("INSERT INTO personal (nombre, cargo, estado) VALUES ('Zzz Ficha', 'Tutor', 'activo')").lastrowid
bid = con.execute("INSERT INTO beneficiarios (nombre, casa, grado) VALUES ('Zzz Benef Ficha', 'Casa Lima', '3ro')").lastrowid
con.commit(); con.close()

db.iniciar()   # aquí se añaden las columnas y tablas

fallos = []
def check(c, m):
    print(("  OK    " if c else "  FALLO ") + m)
    if not c: fallos.append(m)

con = sqlite3.connect(COPIA); con.row_factory = sqlite3.Row

print("1. Las columnas llegan sin perder lo que había")
b = con.execute("SELECT * FROM beneficiarios WHERE id = ?", (bid,)).fetchone()
check(b["nombre"] == "Zzz Benef Ficha", "el nombre sobrevive")
check(b["casa"] == "Casa Lima" and b["grado"] == "3ro", "y los datos que ya tenía")
cols_b = [r[1] for r in con.execute("PRAGMA table_info(beneficiarios)")]
print(f"   beneficiarios: {len(cols_b)} columnas")
for c in ("codigo", "sexo", "distrito", "nivel_educativo", "tipo_seguro",
          "con_quien_vive", "domicilio_del_responsable", "emergencia_telefono"):
    check(c in cols_b, f"beneficiarios tiene '{c}'")

cols_p = [r[1] for r in con.execute("PRAGMA table_info(personal)")]
print(f"   personal: {len(cols_p)} columnas")
for c in ("sexo", "jornada", "estado_laboral", "distrito"):
    check(c in cols_p, f"personal tiene '{c}'")

print("\n2. Las cinco tablas de series")
tablas = [r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")]
for t in ("historial_educativo", "seguimiento", "programas_beneficiario",
          "formacion", "experiencia"):
    check(t in tablas, f"existe {t}")

print("\n3. Se comportan como series: varios registros por persona")
con.execute("PRAGMA foreign_keys = ON")
for anio, sit in (("2024", "aprobado"), ("2025", "repitió"), ("2026", "aprobado")):
    con.execute("""INSERT INTO historial_educativo
                   (beneficiario_id, anio, grado, situacion) VALUES (?,?,?,?)""",
                (bid, anio, "3ro", sit))
con.commit()
h = con.execute("""SELECT anio, situacion FROM historial_educativo
                    WHERE beneficiario_id = ? ORDER BY anio""", (bid,)).fetchall()
check(len(h) == 3, f"tres años de historial ({len(h)})")
check([x["situacion"] for x in h] == ["aprobado", "repitió", "aprobado"],
      "en orden, y se ve que repitió un año")

for i in range(2):
    con.execute("""INSERT INTO seguimiento
                   (beneficiario_id, fecha, responsable_id, tipo, situacion, accion)
                   VALUES (?,?,?,?,?,?)""",
                (bid, f"2026-0{i+1}-15", pid, "visita", "situación detectada", "acción"))
con.commit()
sg = con.execute("SELECT * FROM seguimiento WHERE beneficiario_id = ?", (bid,)).fetchall()
check(len(sg) == 2, "dos visitas de seguimiento")
check(sg[0]["responsable_id"] == pid, "cada una con quién la hizo, por clave foránea")

con.execute("""INSERT INTO formacion (personal_id, nivel, institucion, carrera)
               VALUES (?, 'universitario', 'UNSA', 'Psicología')""", (pid,))
con.execute("""INSERT INTO formacion (personal_id, nivel, institucion)
               VALUES (?, 'curso', 'Salvaguarda infantil')""", (pid,))
con.execute("""INSERT INTO experiencia (personal_id, empresa, cargo, desde)
               VALUES (?, 'ONG anterior', 'Tutor', '2020')""", (pid,))
con.commit()
check(len(con.execute("SELECT * FROM formacion WHERE personal_id=?", (pid,)).fetchall()) == 2,
      "formación y cursos caben en la misma tabla")
check(len(con.execute("SELECT * FROM experiencia WHERE personal_id=?", (pid,)).fetchall()) == 1,
      "y la experiencia en la suya")

print("\n4. Al borrar la ficha se van sus series")
con.execute("DELETE FROM beneficiarios WHERE id = ?", (bid,)); con.commit()
for t in ("historial_educativo", "seguimiento", "programas_beneficiario"):
    n = con.execute(f"SELECT COUNT(*) FROM {t} WHERE beneficiario_id = ?", (bid,)).fetchone()[0]
    check(n == 0, f"{t} queda sin huérfanos")
check(con.execute("SELECT COUNT(*) FROM personal WHERE id=?", (pid,)).fetchone()[0] == 1,
      "y el responsable de las visitas NO se borra con el beneficiario")

con.execute("DELETE FROM personal WHERE id = ?", (pid,)); con.commit()
for t in ("formacion", "experiencia"):
    n = con.execute(f"SELECT COUNT(*) FROM {t} WHERE personal_id = ?", (pid,)).fetchone()[0]
    check(n == 0, f"{t} se va con la ficha de personal")
con.close()

print("\n5. La base real no se tocó")
real = sqlite3.connect(os.path.join(RAIZ, "data", "rrhh.db"))
n = real.execute("SELECT COUNT(*) FROM beneficiarios WHERE nombre='Zzz Benef Ficha'").fetchone()[0]
real.close()
check(n == 0, "nada de esta prueba llegó a la base real")

print("\n" + (f"  {len(fallos)} FALLOS" if fallos else "  ESQUEMA DE FICHAS OK"))
for f in fallos: print("   -", f)
sys.exit(1 if fallos else 0)
