# -*- coding: utf-8 -*-
"""Sesiones de acompañamiento e incidencias, probadas sobre una COPIA."""
import os
import sys, os, shutil, sqlite3
sys.stdout.reconfigure(encoding="utf-8")

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RAIZ, "backend"))
REAL = os.path.join(RAIZ, "data", "rrhh.db")
COPIA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "rrhh_ses.db")

TABLAS = ("personal", "beneficiarios", "identidades", "marcas", "documentos",
          "parametros", "condiciones_laborales", "boletas", "solicitudes")

def foto(ruta):
    con = sqlite3.connect(ruta); con.row_factory = sqlite3.Row
    d = {}
    for t in TABLAS:
        try: d[t] = con.execute(f"SELECT COUNT(*) c FROM {t}").fetchone()["c"]
        except sqlite3.OperationalError: d[t] = "(no existe)"
    d["_marcas"] = [tuple(r) for r in con.execute("SELECT staff_number, fecha, hora FROM marcas ORDER BY id")]
    d["_pers"] = [tuple(r) for r in con.execute("SELECT id, nombre FROM personal ORDER BY id")]
    con.close(); return d

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
check(antes["_marcas"] == despues["_marcas"], f"las {len(antes['_marcas'])} marcas intactas")
check(antes["_pers"] == despues["_pers"], f"las {len(antes['_pers'])} personas intactas")

con = sqlite3.connect(COPIA); con.row_factory = sqlite3.Row
con.execute("PRAGMA foreign_keys = ON")
print("\n5. Las dos tablas nuevas")
for t, esperadas in [("sesiones_acompanamiento", 7), ("incidencias", 8)]:
    cols = [f["name"] for f in con.execute(f"PRAGMA table_info({t})")]
    print(f"     {t}: {', '.join(cols)}")
    check(len(cols) == esperadas, f"{t} tiene {esperadas} columnas")

print("\n6. Restricciones")
bid = con.execute("INSERT INTO beneficiarios (nombre) VALUES ('Beneficiario de prueba') RETURNING id").fetchone()["id"]
# Si la base está vacía —lo normal desde que se retiró la semilla— se
# crea una ficha mínima para poder probar las claves ajenas.
if con.execute("SELECT COUNT(*) FROM personal").fetchone()[0] == 0:
    con.execute("INSERT INTO personal (nombre, cargo, estado) "
                "VALUES (?, ?, 'activo')", ("Zzz Vinculo", "Prueba"))
    con.commit()
pid = con.execute("SELECT id FROM personal LIMIT 1").fetchone()["id"]
con.commit()

def debe_fallar(sql, params, motivo):
    try:
        con.execute(sql, params); con.commit()
        print(f"     FALLO  {motivo}: aceptado"); fallos.append(motivo)
    except sqlite3.IntegrityError:
        print(f"     ok     {motivo}: rechazado")

debe_fallar("INSERT INTO sesiones_acompanamiento (beneficiario_id, fecha, tipo) VALUES (?,?,?)",
            (bid, "2026-08-01", "inventado"), "tipo de sesión inventado")
debe_fallar("INSERT INTO sesiones_acompanamiento (beneficiario_id, fecha) VALUES (?,?)",
            (999999, "2026-08-01"), "sesión de un beneficiario inexistente")
debe_fallar("INSERT INTO incidencias (beneficiario_id, fecha, gravedad, descripcion) VALUES (?,?,?,?)",
            (bid, "2026-08-01", "catastrofica", "x"), "gravedad inventada")
debe_fallar("INSERT INTO incidencias (beneficiario_id, fecha, descripcion) VALUES (?,?,?)",
            (999999, "2026-08-01", "x"), "incidencia de un beneficiario inexistente")
con.close()

print("\n7. Alta y consulta")
s1 = db.crear_sesion(bid, "2026-08-10", "individual", pid, "Sesión de prueba")
s2 = db.crear_sesion(bid, "2026-07-05", "grupal", pid, "")
s3 = db.crear_sesion(bid, "2025-03-01", "familiar", pid, "")
i1 = db.crear_incidencia(bid, "2026-08-11", "Registro de prueba", "moderada", pid, "Sin seguimiento")
ses = db.sesiones_de(bid)
inc = db.incidencias_de(bid)
for x in ses: print(f"     sesión  {x['fecha']}  {x['tipo']:<11} {x['responsable']}")
for x in inc: print(f"     incid.  {x['fecha']}  {x['gravedad']:<9} {x['reportante']}")
check(len(ses) == 3, "guarda las tres sesiones")
check(ses[0]["fecha"] == "2026-08-10", "las devuelve de la más reciente a la más antigua")
check(bool(ses[0]["responsable"]), "resuelve el nombre de quien la hizo")
check(len(inc) == 1 and inc[0]["reportante"], "la incidencia guarda quién la reportó")

print("\n8. El contador 'Sesiones del año' cuenta de verdad")
n2026 = db.sesiones_del_anio(bid, 2026)
n2025 = db.sesiones_del_anio(bid, 2025)
print(f"     2026 -> {n2026}   2025 -> {n2025}")
check(n2026 == 2, "cuenta solo las de 2026")
check(n2025 == 1, "y las de 2025 aparte")

print("\n9. Si quien la hizo deja la ONG, la sesión NO se borra")
db.ejecutar("DELETE FROM personal WHERE id = ?", (pid,))
ses2 = db.sesiones_de(bid); inc2 = db.incidencias_de(bid)
print(f"     sesiones tras borrar al responsable: {len(ses2)}  responsable -> {ses2[0]['realizada_por']}")
check(len(ses2) == 3, "las tres sesiones siguen ahí")
check(ses2[0]["realizada_por"] is None, "quedan sin responsable asignado, no borradas")
check(len(inc2) == 1 and inc2[0]["reportada_por"] is None, "la incidencia igual")

print("\n10. Al borrar la ficha del niño, se van con ella")
db.ejecutar("DELETE FROM beneficiarios WHERE id = ?", (bid,))
check(len(db.sesiones_de(bid)) == 0, "las sesiones se borran en cascada")
check(len(db.incidencias_de(bid)) == 0, "las incidencias también")

print("\n11. Validaciones desde Python")
bid2 = db.crear_beneficiario({"nombre": "Beneficiario de prueba 2"})
for fn, args, motivo in [
        (db.crear_sesion, (bid2, "2026-08-01", "raro"), "tipo de sesión inválido"),
        (db.crear_incidencia, (bid2, "2026-08-01", "x", "raro"), "gravedad inválida"),
        (db.crear_incidencia, (bid2, "2026-08-01", "   "), "descripción vacía")]:
    try:
        fn(*args); check(False, f"{motivo} debería rechazarse")
    except ValueError as e:
        print(f"     {motivo:26} -> {e}")
        check(True, f"rechaza {motivo}")
db.ejecutar("DELETE FROM beneficiarios")

print("\n" + (f"  {len(fallos)} FALLOS" if fallos else "  MIGRACIÓN OK — la copia quedó íntegra"))
for f in fallos: print("   -", f)
print("  (la base real NO fue tocada)")
sys.exit(1 if fallos else 0)
