# -*- coding: utf-8 -*-
"""Migración de Solicitudes probada sobre una COPIA de la base real."""
import os
import sys, os, shutil, sqlite3
sys.stdout.reconfigure(encoding="utf-8")

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RAIZ, "backend"))
REAL = os.path.join(RAIZ, "data", "rrhh.db")
COPIA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "rrhh_sol.db")

TABLAS = ("personal", "beneficiarios", "identidades", "marcas", "documentos",
          "parametros", "condiciones_laborales", "boletas")

def foto(ruta):
    con = sqlite3.connect(ruta); con.row_factory = sqlite3.Row
    d = {}
    for t in TABLAS:
        try:
            d[t] = con.execute(f"SELECT COUNT(*) c FROM {t}").fetchone()["c"]
        except sqlite3.OperationalError:
            d[t] = "(no existe)"
    d["_marcas"] = [tuple(r) for r in con.execute(
        "SELECT staff_number, fecha, hora FROM marcas ORDER BY id")]
    d["_personas"] = [tuple(r) for r in con.execute(
        "SELECT id, nombre, cargo FROM personal ORDER BY id")]
    try:
        d["_cond"] = [tuple(r) for r in con.execute(
            "SELECT personal_id, sueldo_base, vigente_desde FROM condiciones_laborales ORDER BY id")]
    except sqlite3.OperationalError:
        d["_cond"] = []
    con.close()
    return d

fallos = []
def check(c, m):
    print(("  OK    " if c else "  FALLO ") + m)
    if not c: fallos.append(m)

print("1. ANTES (base real, solo lectura)")
antes = foto(REAL)
for k in TABLAS:
    print(f"     {k:<22} {antes[k]}")

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
for k in TABLAS:
    igual = antes[k] == despues[k]
    print(f"     {k:<22} {antes[k]} -> {despues[k]}   {'ok' if igual else 'CAMBIÓ'}")
    if not igual: fallos.append(k)
for clave, etq in [("_marcas", "marcas"), ("_personas", "personas"), ("_cond", "condiciones")]:
    check(antes[clave] == despues[clave], f"las {len(antes[clave])} {etq} están intactas")

con = sqlite3.connect(COPIA); con.row_factory = sqlite3.Row
con.execute("PRAGMA foreign_keys = ON")
cols = [r["name"] for r in con.execute("PRAGMA table_info(solicitudes)")]
print(f"\n5. Tabla nueva: solicitudes ({len(cols)} columnas)")
print("     " + ", ".join(cols))
check(len(cols) >= 14, "tiene todas las columnas")
check("dias" not in cols, "NO guarda los días: se derivan de desde/hasta")
check("con_goce" not in cols, "NO tiene con_goce/sin_goce (decisión aplazada)")

print("\n6. Las restricciones hacen su trabajo")
def debe_fallar(sql, motivo):
    try:
        con.execute(sql); con.commit()
        print(f"     FALLO  {motivo}: la base lo aceptó"); fallos.append(motivo)
    except sqlite3.IntegrityError:
        print(f"     ok     {motivo}: rechazado")

debe_fallar("INSERT INTO solicitudes (personal_id,tipo,desde,hasta) VALUES (1,'fiesta','2026-09-01','2026-09-05')",
            "tipo inventado")
debe_fallar("INSERT INTO solicitudes (personal_id,tipo,desde,hasta,estado) VALUES (1,'vacaciones','2026-09-01','2026-09-05','raro')",
            "estado inventado")
debe_fallar("INSERT INTO solicitudes (personal_id,tipo,desde,hasta) VALUES (1,'vacaciones','2026-09-10','2026-09-01')",
            "hasta anterior a desde")
debe_fallar("INSERT INTO solicitudes (personal_id,tipo,desde,hasta) VALUES (99999,'vacaciones','2026-09-01','2026-09-05')",
            "persona inexistente")
con.close()

print("\n7. Los días se derivan bien")
for d1, d2, esperado in [("2026-09-01", "2026-09-01", 1),
                         ("2026-09-01", "2026-09-07", 7),
                         ("2026-09-01", "2026-09-30", 30),
                         ("2026-02-27", "2026-03-02", 4)]:
    n = db._dias_corridos(d1, d2)
    print(f"     {d1} a {d2} -> {n} días")
    check(n == esperado, f"{d1}..{d2} son {esperado} días corridos")

# La copia de la base ya trae solicitudes del equipo, así que los
# totales absolutos no dicen nada. Se guarda el ANTES y se comprueba
# la diferencia.
ANTES = db.resumen_solicitudes()

print("\n8. Alta y consulta")
# La base arranca vacía desde que se retiró la semilla: la prueba crea a
# quien necesita en vez de contar con que ya haya alguien.
# La persona se crea SIEMPRE, no solo si la base está vacía: tomar «el
# primero que haya» tropezaba con alguien que ya tenía solicitudes suyas de
# antes, y entonces contar «las dos» daba cuatro.
_j = db.crear_personal({"nombre": "Zzz Jefe", "cargo": "Prueba"})
pid = db.crear_personal({"nombre": "Zzz Solicitante", "cargo": "Prueba",
                         "jefe_id": _j})
jefe = _j
s1 = db.crear_solicitud(pid, "vacaciones", "2026-09-01", "2026-09-05",
                        motivo="Descanso", jefe_id=jefe, requiere_admin=0)
s2 = db.crear_solicitud(pid, "vacaciones", "2026-10-01", "2026-10-20",
                        motivo="Bloque largo", jefe_id=jefe, requiere_admin=1)
todas = db.solicitudes_de(pid)
for s in todas:
    print(f"     #{s['id']} {s['tipo']:<11} {s['desde']} a {s['hasta']}  {s['dias']:>2}d  "
          f"{s['estado']:<15} admin={s['requiere_admin']}")
check(len(todas) == 2, "guarda y devuelve las dos")
check(todas[0]["dias"] == 20 and todas[1]["dias"] == 5, "calcula los días de cada una")
check(all(s["nombre"] for s in todas), "resuelve el nombre de la persona")

print("\n9. El filtro por rango detecta solapamiento, no contención")
#  s1 = 09-01..09-05   s2 = 10-01..10-20
casos = [("2026-09-03", "2026-09-04", 1, "rango dentro de la solicitud"),
         ("2026-08-28", "2026-09-02", 1, "rango que empieza antes"),
         ("2026-09-04", "2026-09-30", 1, "rango que termina después (solo toca s1)"),
         ("2026-09-01", "2026-10-31", 2, "rango que abarca las dos"),
         ("2026-09-05", "2026-09-05", 1, "el último día de la solicitud cuenta"),
         ("2026-09-06", "2026-09-30", 0, "el día siguiente ya no"),
         ("2026-11-01", "2026-11-30", 0, "rango sin nada")]
db.actualizar_estado_solicitud(s1, "aprobada", sello="resuelto_el")
db.actualizar_estado_solicitud(s2, "aprobada", sello="resuelto_el")
# Se cuentan SOLO las de esta prueba. `solicitudes_aprobadas_en` mira la
# base entera, y en la corrida completa el banco lo comparten todas las
# suites: cualquier otra que apruebe una solicitud de esas fechas hacía
# fallar estos conteos sin que nada estuviera roto.
for d1, d2, esperado, etq in casos:
    n = len([x for x in db.solicitudes_aprobadas_en(d1, d2)
             if x["personal_id"] == pid])
    print(f"     {d1}..{d2} -> {n}   ({etq})")
    check(n == esperado, etq)

print("\n10. Transiciones de estado y sellos")
# 'permiso' a secas dejó de existir al desglosarlo en cinco tipos; lo que
# esta prueba mide son las transiciones de estado, que no dependen del tipo.
s3 = db.crear_solicitud(pid, "personal", "2026-12-01", "2026-12-02", jefe_id=jefe)
db.actualizar_estado_solicitud(s3, "pendiente_admin", sello="aprob_jefe_el")
r = db.solicitud(s3)
print(f"     estado={r['estado']}  jefe_el={r['aprob_jefe_el'][:10]}  admin_el={r['aprob_admin_el'] or '(vacío)'}")
check(r["estado"] == "pendiente_admin", "pasa a pendiente de Administración")
check(bool(r["aprob_jefe_el"]), "queda sellada la fecha del jefe")
check(not r["aprob_admin_el"], "la de Administración sigue vacía")
db.actualizar_estado_solicitud(s3, "rechazada", nota="No hay cobertura de turno", sello="resuelto_el")
r = db.solicitud(s3)
check(r["estado"] == "rechazada" and r["nota"], "el rechazo guarda su motivo")

print("\n11. Resumen para el contador del menú")
print("     " + str(db.resumen_solicitudes()))
res = db.resumen_solicitudes()
check(res["aprobada"] - ANTES.get("aprobada", 0) == 2
      and res["rechazada"] - ANTES.get("rechazada", 0) == 1,
      "cuenta por estado (dos aprobadas y una rechazada más)")
check(res["por_resolver"] - ANTES.get("por_resolver", 0) == 0,
      "por_resolver suma pendiente + pendiente_admin")

print("\n12. La lista blanca de parámetros")
# Aquí se probaba «aprobador_admin», retirado el 31/08/2026: quién cierra
# una solicitud larga lo decide el ROL, no un nombre elegido a mano, y ese
# parámetro no lo leía nadie. Lo que sí hay que seguir garantizando es que
# la lista blanca funciona: es lo que impide que un error de tecleo cree un
# parámetro fantasma que nadie lee nunca.
db.guardar_parametro("meta_semanal", "48")
check(db.parametro("meta_semanal") == "48", "una clave conocida se guarda")
try:
    db.guardar_parametro("rol_inventado", "x")
    check(False, "una clave fuera de la lista blanca debería fallar")
except ValueError:
    check(True, "la lista blanca sigue rechazando claves nuevas")

print("\n13. Las constantes acordadas están con nombre")
print(f"     umbral admin {config.DIAS_VISTO_BUENO_ADMIN} d · "
      f"{config.DIAS_VACACIONES_POR_ANIO} d/año · tope {config.TOPE_VACACIONES} d · "
      f"aviso a {config.AVISO_CERCA_DEL_TOPE} d · régimen '{config.REGIMEN_CON_VACACIONES}'")
check(config.DIAS_VISTO_BUENO_ADMIN == 7, "umbral de 7 días")
check(config.TOPE_VACACIONES == 60, "tope de 60 días (2 años)")
check(config.DIAS_VACACIONES_POR_ANIO == 30, "30 días por año")

print("\n" + (f"  {len(fallos)} FALLOS" if fallos else "  MIGRACIÓN OK — la copia quedó íntegra"))
for f in fallos: print("   -", f)
print("  (la base real NO fue tocada)")
sys.exit(1 if fallos else 0)
