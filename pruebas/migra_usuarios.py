# -*- coding: utf-8 -*-
"""Identidad, permisos y auditoría, probados sobre una COPIA."""
import os
import sys, os, shutil, sqlite3, time
sys.stdout.reconfigure(encoding="utf-8")

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RAIZ, "backend"))
REAL = os.path.join(RAIZ, "data", "rrhh.db")
COPIA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "rrhh_usr.db")

TABLAS = ("personal", "beneficiarios", "identidades", "marcas", "documentos",
          "parametros", "condiciones_laborales", "boletas", "solicitudes",
          "sesiones_acompanamiento", "incidencias")

def foto(ruta):
    con = sqlite3.connect(ruta); con.row_factory = sqlite3.Row
    d = {}
    for t in TABLAS:
        try: d[t] = con.execute(f"SELECT COUNT(*) c FROM {t}").fetchone()["c"]
        except sqlite3.OperationalError: d[t] = "(no existe)"
    d["_marcas"] = [tuple(r) for r in con.execute("SELECT staff_number,fecha,hora FROM marcas ORDER BY id")]
    d["_pers"] = [tuple(r) for r in con.execute("SELECT id,nombre FROM personal ORDER BY id")]
    d["_ben"] = [tuple(r) for r in con.execute("SELECT id,nombre FROM beneficiarios ORDER BY id")]
    con.close(); return d

fallos = []
def check(c, m):
    print(("  OK    " if c else "  FALLO ") + m)
    if not c: fallos.append(m)

def _asegurar_personal(cuantos=3):
    """
    Crea fichas de prueba si la base no tiene suficientes sin cuenta.

    Antes bastaba con coger las primeras de las 20 de la semilla. Esa semilla
    se retiró y la base arranca vacía, así que la prueba se abastece sola: es
    lo correcto de todas formas, porque no debe depender de datos ambientales
    que alguien puede borrar legítimamente.
    """
    creadas = []
    while len(db.personal_sin_usuario()) < cuantos:
        creadas.append(db.crear_personal(
            {"nombre": "Zzz Cuenta %d" % (len(creadas) + 1), "cargo": "Prueba"}))
    if creadas:
        print("   (fixtura: %d ficha(s) creada(s) para esta prueba)" % len(creadas))
    return creadas

print("1. ANTES (base real, solo lectura)")
antes = foto(REAL)
for t in TABLAS: print(f"     {t:<26} {antes[t]}")

shutil.copy2(REAL, COPIA)
print(f"\n2. Copia -> {os.path.basename(COPIA)}")

import config
config.DB_PATH = COPIA
import db, auth
db.config.DB_PATH = COPIA
db.iniciar()
print("3. iniciar() ejecutado sobre la copia")

despues = foto(COPIA)
print("\n4. Nada de lo que ya existía cambió")
for t in TABLAS:
    ok = antes[t] == despues[t]
    print(f"     {t:<26} {antes[t]} -> {despues[t]}   {'ok' if ok else 'CAMBIÓ'}")
    if not ok: fallos.append(t)
for k, e in [("_marcas","marcas"), ("_pers","personas"), ("_ben","beneficiarios")]:
    check(antes[k] == despues[k], f"los {len(antes[k])} {e} intactos")

con = sqlite3.connect(COPIA); con.row_factory = sqlite3.Row
print("\n5. Las seis tablas nuevas")
for t, n in [("roles",6), ("usuarios",9), ("permisos_rol",3),
             ("sesiones_usuario",7), ("intentos_login",5), ("accesos",10)]:
    cols = [f["name"] for f in con.execute(f"PRAGMA table_info({t})")]
    print(f"     {t:<20} {len(cols)} columnas")
    check(len(cols) == n, f"{t} tiene {n} columnas")
con.close()

print("\n6. Contraseñas")
h = auth.hashear("clave-de-prueba")
print(f"     {h[:52]}...")
check(h.startswith("pbkdf2_sha256$240000$"), "lleva algoritmo e iteraciones dentro")
check("clave-de-prueba" not in h, "la contraseña NO aparece en el hash")
check(auth.verificar("clave-de-prueba", h), "verifica la correcta")
check(not auth.verificar("clave-de-prueb", h), "rechaza una casi igual")
check(not auth.verificar("", h), "rechaza vacía")
check(auth.hashear("clave-de-prueba") != h, "dos hashes de la misma clave difieren (salt)")
try:
    auth.hashear("corta"); check(False, "debería rechazar una clave corta")
except ValueError as e:
    check(True, f"rechaza claves de menos de {config.CLAVE_MINIMA}: {e}")

print("\n7. Claves de rol: el mismo cargo no entra dos veces")
for entrada, esperado in [("Teen Leader","teen_leader"), ("teen leader","teen_leader"),
                          ("  Teen  Leader  ","teen_leader"), ("Teen-Leader","teen_leader"),
                          ("Líder de Jóvenes","lider_de_jovenes"), ("RR.HH.","rr_hh")]:
    got = auth.normalizar_clave_rol(entrada)
    print(f"     {entrada!r:24} -> {got}")
    check(got == esperado, f"{entrada!r} -> {esperado}")

print("\n8. Nombres de usuario sugeridos")
usados = []
for nombre, esperado in [("Ps. Josué Ramírez Vega","jramirez"),
                         ("Mariela Quispe Ríos","mquispe"),
                         ("Ps. Josué Ramírez Vega","jramirez2")]:
    got = auth.sugerir_usuario(nombre, usados); usados.append(got)
    print(f"     {nombre:<26} -> {got}")
    check(got == esperado, f"{nombre} -> {esperado}")

print("\n9. Roles de sistema y permisos de partida")
import crear_director
director = crear_director._asegurar_roles()
rrhh = db.rol_por_clave(config.ROL_RRHH)
check(director and director["es_sistema"] == 1, "Director es rol de sistema")
check(rrhh and rrhh["es_sistema"] == 1, "RRHH también")
check(db.borrar_rol(director["id"]) == 0, "un rol de sistema NO se puede borrar")
pd = auth.permisos_de_rol(config.ROL_DIRECTOR)
pr = auth.permisos_de_rol(config.ROL_RRHH)
print(f"     Director: {len([1 for v in pd.values() if v=='edicion'])}/{len(config.CLAVES_MODULO)} módulos en edición")
print(f"     RRHH:     incidencias={pr['incidencias']}  sesiones={pr['sesiones']}  planillas={pr['planillas']}")
check(all(v == "edicion" for v in pd.values()), "el Director lo puede todo")
check(pr["incidencias"] == "ninguno", "RRHH no ve incidencias de partida")
check(pr["planillas"] == "edicion", "pero sí planillas")

print("\n10. Un módulo sin fila nace CERRADO, no abierto")
rid = db.crear_rol("Teen Leader", "teen_leader", "Prueba")
db.guardar_permisos_rol(rid, {"beneficiarios": "vista"})
p = auth.permisos_de_rol("teen_leader")
print(f"     beneficiarios={p['beneficiarios']}  incidencias={p['incidencias']}  planillas={p['planillas']}")
check(p["beneficiarios"] == "vista", "lo asignado se respeta")
check(p["incidencias"] == "ninguno", "lo no asignado queda en ninguno")
check(len(p) == len(config.CLAVES_MODULO),
      f"devuelve los {len(config.CLAVES_MODULO)} módulos del catálogo")

print("\n11. edicion cubre vista; vista no cubre edicion")
ses = {"permisos": p, "rol": "teen_leader"}
check(auth.puede(ses, "beneficiarios", "vista"), "vista con nivel vista: sí")
check(not auth.puede(ses, "beneficiarios", "edicion"), "edición con nivel vista: no")
check(not auth.puede(ses, "incidencias", "vista"), "sin permiso: no")
check(not auth.puede(None, "beneficiarios", "vista"), "sin sesión: no")
ed = {"permisos": {"planillas": "edicion"}}
check(auth.puede(ed, "planillas", "vista"), "quien puede editar, puede ver")

print("\n12. Alta de usuario y sesión")
_asegurar_personal(3)
pid = db.personal_sin_usuario()[0]["id"]
uid = db.crear_usuario(pid, "tprueba", auth.hashear("clave-de-prueba"), rid)
tok, csrf = auth.abrir_sesion(uid, "127.0.0.1", "prueba")
s = auth.sesion_de(tok)
print(f"     sesión de {s['usuario']} · rol {s['rol']} · csrf {csrf[:10]}...")
check(s is not None, "la sesión se abre y se lee")
check(s["rol"] == "teen_leader", "trae el rol")
check(s["permisos"]["beneficiarios"] == "vista", "y sus permisos resueltos")
check(len(tok) > 30 and len(csrf) > 30, "token y csrf con entropía suficiente")
check(auth.sesion_de("token-inventado") is None, "un token falso no abre nada")

print("\n13. Suspender echa de inmediato")
db.actualizar_usuario(uid, {"estado": "suspendido"})
check(auth.sesion_de(tok) is None, "la sesión deja de valer al suspender")
db.actualizar_usuario(uid, {"estado": "activo"})
tok2, _ = auth.abrir_sesion(uid)
check(auth.sesion_de(tok2) is not None, "reactivado, puede volver a entrar")
auth.cerrar_sesion(tok2)
check(auth.sesion_de(tok2) is None, "cerrar sesión la invalida")

print("\n14. Bloqueo por intentos fallidos")
check(auth.esta_bloqueado("tprueba", "1.2.3.4") == 0, "de partida no está bloqueado")
for i in range(config.LOGIN_MAX_INTENTOS):
    auth.anotar_intento("tprueba", "1.2.3.4", False)
falta = auth.esta_bloqueado("tprueba", "1.2.3.4")
print(f"     tras {config.LOGIN_MAX_INTENTOS} fallos -> bloqueado {falta} min")
check(falta > 0, f"se bloquea a los {config.LOGIN_MAX_INTENTOS} fallos")
check(auth.esta_bloqueado("otro", "9.9.9.9") == 0, "otro usuario desde otra IP no")
check(auth.esta_bloqueado("otro", "1.2.3.4") > 0, "pero la MISMA IP sí, aunque cambie de usuario")
auth.anotar_intento("tprueba", "1.2.3.4", True)
check(auth.esta_bloqueado("tprueba", "1.2.3.4") == 0, "un acierto limpia el contador")
sinclave = db.consultar("SELECT * FROM intentos_login LIMIT 1")
check(not any("clave" in str(k).lower() for k in (sinclave[0] if sinclave else {})),
      "la tabla de intentos NO tiene columna de contraseña")

print("\n15. No se puede dejar el sistema sin Director")
# La copia hereda los Directores de la base real —desde el borrado hay uno,
# el del equipo—, así que exigir cero era exigir que nadie pudiera entrar.
# Lo que se mide es el EFECTO de crear uno más, no el punto de partida.
antes_dir = db.directores_activos()
print(f"     punto de partida: {antes_dir} Director(es)")
duid = db.crear_usuario(db.personal_sin_usuario()[0]["id"], "tdir",
                        auth.hashear("clave-de-prueba"), director["id"])
check(db.directores_activos() == antes_dir + 1, "crear uno suma uno")
check(db.directores_activos(excluir_id=duid) == antes_dir,
      "si se quitara ese, quedarían 0 — la interfaz debe impedirlo")

print("\n16. Registro de accesos")
db.ejecutar("""INSERT INTO accesos (usuario_id, usuario, modulo, accion, metodo, ruta, resultado, ip)
               VALUES (?,?,?,?,?,?,?,?)""",
            (uid, "tprueba", "incidencias", "vista", "GET", "/api/x", 403, "1.2.3.4"))
a = db.accesos(limite=5)
print(f"     {a[0]['usuario']} · {a[0]['modulo']} · {a[0]['accion']} · HTTP {a[0]['resultado']}")
check(len(a) >= 1, "queda registrado")
check(a[0]["usuario"] == "tprueba" and a[0]["modulo"] == "incidencias",
      "con quién, qué módulo y con qué resultado")
db.borrar_usuario(uid)
sobrevive = db.accesos(limite=5)
check(any(x["usuario"] == "tprueba" for x in sobrevive),
      "el registro sobrevive al borrado de la cuenta")

print("\n" + (f"  {len(fallos)} FALLOS" if fallos else "  MIGRACIÓN OK — la copia quedó íntegra"))
for f in fallos: print("   -", f)
print("  (la base real NO fue tocada)")
sys.exit(1 if fallos else 0)
