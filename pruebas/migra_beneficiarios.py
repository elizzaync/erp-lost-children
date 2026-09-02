# -*- coding: utf-8 -*-
"""Los 17 campos nuevos de 'beneficiarios', probados sobre una COPIA."""
import os
import sys, os, shutil, sqlite3
sys.stdout.reconfigure(encoding="utf-8")

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RAIZ, "backend"))
REAL = os.path.join(RAIZ, "data", "rrhh.db")
COPIA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "rrhh_ben.db")

TABLAS = ("personal", "beneficiarios", "identidades", "marcas", "documentos",
          "parametros", "condiciones_laborales", "boletas", "solicitudes")

NUEVOS = ["procedencia", "lengua_materna", "via_ingreso", "expediente_judicial",
          "situacion_legal", "referente_familiar", "regimen_visitas",
          "institucion_educativa", "rendimiento", "refuerzo_escolar",
          "seguro", "alergias", "control_medico", "tratamiento",
          "tutor_id", "psicologo_id", "plan_vida"]

def foto(ruta):
    con = sqlite3.connect(ruta); con.row_factory = sqlite3.Row
    d = {}
    for t in TABLAS:
        try: d[t] = con.execute(f"SELECT COUNT(*) c FROM {t}").fetchone()["c"]
        except sqlite3.OperationalError: d[t] = "(no existe)"
    d["_marcas"] = [tuple(r) for r in con.execute("SELECT staff_number, fecha, hora FROM marcas ORDER BY id")]
    d["_personas"] = [tuple(r) for r in con.execute("SELECT id, nombre, cargo FROM personal ORDER BY id")]
    d["_docs"] = [tuple(r) for r in con.execute("SELECT id, personal_id, nombre, archivo FROM documentos ORDER BY id")]
    con.close()
    return d

fallos = []
def check(c, m):
    print(("  OK    " if c else "  FALLO ") + m)
    if not c: fallos.append(m)

print("1. ANTES (base real, solo lectura)")
antes = foto(REAL)
for t in TABLAS: print(f"     {t:<22} {antes[t]}")

shutil.copy2(REAL, COPIA)
print(f"\n2. Copia hecha -> {os.path.basename(COPIA)}")

import config
config.DB_PATH = COPIA
import db
db.config.DB_PATH = COPIA
db.iniciar()
print("3. iniciar() ejecutado sobre la copia")

despues = foto(COPIA)
print("\n4. Nada de lo que ya existía cambió")
for t in TABLAS:
    igual = antes[t] == despues[t]
    print(f"     {t:<22} {antes[t]} -> {despues[t]}   {'ok' if igual else 'CAMBIÓ'}")
    if not igual: fallos.append(t)
for clave, etq in [("_marcas","marcas"), ("_personas","personas"), ("_docs","documentos")]:
    check(antes[clave] == despues[clave], f"los {len(antes[clave])} {etq} están intactos")

con = sqlite3.connect(COPIA); con.row_factory = sqlite3.Row
con.execute("PRAGMA foreign_keys = ON")
cols = {f["name"]: f for f in con.execute("PRAGMA table_info(beneficiarios)")}
print(f"\n5. beneficiarios pasa de 9 a {len(cols)} columnas")
faltan = [c for c in NUEVOS if c not in cols]
print(f"     añadidas: {', '.join(NUEVOS)}")
check(not faltan, f"están los 17 campos nuevos{'' if not faltan else ' — faltan ' + str(faltan)}")
check(cols["nombre"]["notnull"] == 1, "'nombre' sigue siendo el único obligatorio")
check(all(cols[c]["notnull"] == 0 for c in NUEVOS), "ningún campo nuevo bloquea el alta")

print("\n6. Las claves foráneas de tutor y psicóloga funcionan")
fks = {f["from"]: f["table"] for f in con.execute("PRAGMA foreign_key_list(beneficiarios)")}
print(f"     {fks}")
check(fks.get("tutor_id") == "personal", "tutor_id apunta a personal")
check(fks.get("psicologo_id") == "personal", "psicologo_id apunta a personal")

# Si la base está vacía —lo normal desde que se retiró la semilla— se
# crea una ficha mínima para poder probar las claves ajenas.
if con.execute("SELECT COUNT(*) FROM personal").fetchone()[0] == 0:
    con.execute("INSERT INTO personal (nombre, cargo, estado) "
                "VALUES (?, ?, 'activo')", ("Zzz Vinculo", "Prueba"))
    con.commit()
pid = con.execute("SELECT id FROM personal LIMIT 1").fetchone()["id"]
con.execute("INSERT INTO beneficiarios (nombre, tutor_id) VALUES ('Beneficiario de prueba', ?)", (pid,))
con.commit()
check(True, "acepta un tutor que existe")
try:
    con.execute("INSERT INTO beneficiarios (nombre, tutor_id) VALUES ('X', 999999)")
    con.commit()
    check(False, "un tutor inexistente debería rechazarse")
except sqlite3.IntegrityError:
    check(True, "rechaza un tutor que no existe en personal")

print("\n7. Si el tutor se va de la ONG, la ficha del niño no se borra")
bid = con.execute("SELECT id FROM beneficiarios WHERE nombre='Beneficiario de prueba'").fetchone()["id"]
con.execute("DELETE FROM personal WHERE id = ?", (pid,)); con.commit()
fila = con.execute("SELECT id, tutor_id FROM beneficiarios WHERE id = ?", (bid,)).fetchone()
print(f"     ficha {bid} -> tutor_id = {fila['tutor_id']}")
check(fila is not None, "la ficha del beneficiario sigue existiendo")
check(fila["tutor_id"] is None, "el tutor queda sin asignar (ON DELETE SET NULL), no borra al niño")
con.execute("DELETE FROM beneficiarios WHERE id = ?", (bid,)); con.commit()
con.close()

print("\n8. Alta con todos los campos")
datos = {
    "nombre": "Beneficiario de prueba", "documento": "", "fecha_nac": "2015-01-01",
    "casa": "Casa Lima", "sala": "Sala A", "grado": "4.º primaria", "anio_ingreso": "2023",
    "procedencia": "—", "lengua_materna": "—", "via_ingreso": "—",
    "expediente_judicial": "", "situacion_legal": "—", "referente_familiar": "—",
    "regimen_visitas": "—", "institucion_educativa": "—", "rendimiento": "—",
    "refuerzo_escolar": "—", "seguro": "—", "alergias": "—", "control_medico": "—",
    "tratamiento": "—", "plan_vida": "—",
}
nuevo = db.crear_beneficiario(datos)
b = db.beneficiario(nuevo)
# 'expediente_judicial' se manda vacío a propósito: no todos tienen uno.
texto = [c for c in NUEVOS if c not in ("tutor_id", "psicologo_id")]
esperados = [c for c in texto if datos.get(c)]
guardados = [c for c in texto if b.get(c)]
print(f"     campos de texto guardados: {len(guardados)}/{len(esperados)} "
      f"(de {len(texto)}; 'expediente_judicial' iba vacío)")
check(guardados == esperados, "se guarda cada campo que se mandó con valor")
check(not b["expediente_judicial"], "y el que iba vacío queda vacío, no inventado")
check(b["nombre"] == "Beneficiario de prueba", "y el nombre")

print("\n9. Qué le falta a una ficha para estar completa")
vacia = db.crear_beneficiario({"nombre": "Beneficiario de prueba 2"})
faltan_v = db.faltantes_beneficiario(db.beneficiario(vacia))
print(f"     ficha vacía: faltan {len(faltan_v)} -> {', '.join(faltan_v[:5])}...")
check(len(faltan_v) >= 12, "una ficha solo con nombre sale como incompleta")
faltan_c = db.faltantes_beneficiario(b)
print(f"     ficha del punto 8: faltan {len(faltan_c)} -> {faltan_c}")
check("Documento" in faltan_c, "detecta el documento vacío")
check("Tutor asignado" in faltan_c, "y el tutor sin asignar")
check("Alergias" not in faltan_c, "no marca como faltante lo que sí está")

db.ejecutar("DELETE FROM beneficiarios")
print("\n" + (f"  {len(fallos)} FALLOS" if fallos else "  MIGRACIÓN OK — la copia quedó íntegra"))
for f in fallos: print("   -", f)
print("  (la base real NO fue tocada)")
sys.exit(1 if fallos else 0)
