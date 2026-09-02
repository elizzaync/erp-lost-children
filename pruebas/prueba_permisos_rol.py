# -*- coding: utf-8 -*-
"""
Un trabajador no puede aprobarse sus propios permisos.

Esto empezó como un descuido real: al rol Trabajador se le dio
'permisos: edicion' para que pudiera PEDIR permisos, sin ver que ese mismo
nivel es el que autoriza a APROBARLOS. Con él, un trabajador se firmaba sus
propias vacaciones y leía las licencias médicas de todo el equipo.

La separación que se comprueba aquí:

  · pedir y ver LO SUYO   -> basta con tener sesión
  · ver y resolver LO DE TODOS -> hace falta 'permisos: edicion'

Se prueba sobre una COPIA, entrando de verdad con cada cuenta.
"""
import os
import sys, os, shutil, sqlite3, tempfile, pathlib
sys.stdout.reconfigure(encoding="utf-8")

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RAIZ, "backend"))

COPIA = pathlib.Path(tempfile.mkdtemp()) / "roles.db"
shutil.copy2(os.path.join(RAIZ, "data", "rrhh.db"), COPIA)
os.environ["DB_PATH"] = str(COPIA)
import config
config.DB_PATH = str(COPIA)
import db
db.config.DB_PATH = str(COPIA)
db.iniciar()

import migrar_tipos_permiso as MIG
info = MIG.analizar(str(COPIA))
if not info["ya_migrada"]:
    MIG.ejecutar(str(COPIA), info)

import crear_pruebas
import app as A
A.app.config["TESTING"] = True

fallos = []
def check(c, m):
    print(("  OK    " if c else "  FALLO ") + m)
    if not c:
        fallos.append(m)


print("0. Dos cuentas: una de RRHH y una de trabajador")
jefa = db.crear_personal({"nombre": "Zzz Rol Jefa", "cargo": "Coordinadora"})
obrera = db.crear_personal({"nombre": "Zzz Rol Trabajadora", "cargo": "Educadora",
                            "jefe_id": jefa})

# La clave del rol es única: si van las dos vacías, la segunda choca.
rol_trab = db.crear_rol("Zzz Rol Trabajador", "zzz_rol_trab")
db.guardar_permisos_rol(rol_trab, crear_pruebas.PERMISOS_TRABAJADOR)
rol_rrhh = db.crear_rol("Zzz Rol RRHH", "zzz_rol_rrhh")
db.guardar_permisos_rol(rol_rrhh, {"permisos": "edicion", "personal": "edicion"})

# crear_usuario recibe el HASH, no la clave en claro, y en este orden.
import auth
db.crear_usuario(obrera, "zzz.trab", auth.hashear("clave-trab"), rol_trab,
                 debe_cambiar=0)
db.crear_usuario(jefa, "zzz.jefa", auth.hashear("clave-jefa"), rol_rrhh,
                 debe_cambiar=0)
print(f"   trabajadora {obrera} · jefa {jefa}")
check(True, "cuentas creadas")

print("\n1. El rol Trabajador no incluye 'permisos'")
print("   " + str(crear_pruebas.PERMISOS_TRABAJADOR))
check("permisos" not in crear_pruebas.PERMISOS_TRABAJADOR,
      "el módulo de permisos NO está en el rol: nace cerrado")


def entrar(cli, usuario, clave):
    """Entra y deja puesto el token CSRF, como hace el navegador."""
    r = cli.post("/api/login", json={"usuario": usuario, "clave": clave})
    d = r.get_json() or {}
    csrf = (d.get("sesion") or {}).get("csrf") or d.get("csrf") or ""
    cli.environ_base["HTTP_X_CSRF_TOKEN"] = csrf
    return r.status_code == 200, d


print("\n2. La trabajadora entra y pide un permiso")
trab = A.app.test_client()
ok, d = entrar(trab, "zzz.trab", "clave-trab")
check(ok, f"entra con su cuenta ({d.get('error', '')})")

r = trab.post("/api/permisos", json={"tipo": "medico", "desde": "2026-09-14",
                                     "hasta": "2026-09-15", "motivo": "control"})
check(r.status_code == 200, f"puede pedir un permiso SIN el módulo ({r.status_code})")
sid = (r.get_json() or {}).get("id")
check(bool(sid), "y queda registrado")

r = trab.get("/api/permisos/mios")
mios = (r.get_json() or {}).get("solicitudes", [])
check(r.status_code == 200, "puede ver las suyas")
check(len(mios) == 1 and mios[0]["id"] == sid, "y solo salen las suyas")

print("\n3. Lo que NO puede hacer")
r = trab.post(f"/api/permisos/{sid}/aprobar", json={})
check(r.status_code == 403,
      f"NO puede aprobar su propia solicitud ({r.status_code})")
check(db.solicitud(sid)["estado"] == "pendiente",
      "y la solicitud sigue pendiente, no se coló el cambio")

r = trab.post(f"/api/permisos/{sid}/rechazar", json={"nota": "x"})
check(r.status_code == 403, f"tampoco rechazar ({r.status_code})")

r = trab.get("/api/permisos")
check(r.status_code == 403,
      f"ni leer la bandeja con las solicitudes de todos ({r.status_code})")

print("\n4. Lo que SÍ puede: cancelar lo suyo")
r = trab.post(f"/api/permisos/{sid}/cancelar", json={})
check(r.status_code == 200, f"cancela su propia solicitud ({r.status_code})")
check(db.solicitud(sid)["estado"] == "cancelada", "y queda cancelada")

print("\n5. La jefatura sí resuelve")
otra = A.app.test_client()
ok, d = entrar(otra, "zzz.trab", "clave-trab")
r2 = otra.post("/api/permisos", json={"tipo": "personal", "desde": "2026-10-05",
                                      "hasta": "2026-10-06"})
sid2 = (r2.get_json() or {}).get("id")

jefa_cli = A.app.test_client()
ok, d = entrar(jefa_cli, "zzz.jefa", "clave-jefa")
check(ok, f"la jefa entra ({d.get('error','')})")
r = jefa_cli.get("/api/permisos")
check(r.status_code == 200, "ella sí ve la bandeja")
r = jefa_cli.post(f"/api/permisos/{sid2}/aprobar", json={})
check(r.status_code == 200, f"y aprueba ({r.status_code})")
check(db.solicitud(sid2)["estado"] == "aprobada", "la solicitud queda aprobada")

print("\n6. Sin sesión no se llega a nada")
anon = A.app.test_client()
check(anon.get("/api/permisos/mios").status_code == 401,
      "el autoservicio pide identificarse")
check(anon.post("/api/permisos", json={"tipo": "otro", "desde": "2027-01-01",
                                       "hasta": "2027-01-02"}).status_code == 401,
      "y no deja pedir a ciegas")

print("\n6b. Sin token CSRF no se escribe, ni en el autoservicio")
# El CSRF vivía dentro del decorador de permisos, así que los endpoints de
# autoservicio —que no lo llevan— escribían sin comprobarlo: otra web podía
# hacer que tu navegador pidiera un permiso con tu sesión abierta.
sin_token = A.app.test_client()
entrar(sin_token, "zzz.trab", "clave-trab")
sin_token.environ_base.pop("HTTP_X_CSRF_TOKEN", None)
r = sin_token.post("/api/permisos", json={"tipo": "otro", "desde": "2027-03-01",
                                          "hasta": "2027-03-02"})
check(r.status_code == 403, f"pedir un permiso sin token se rechaza ({r.status_code})")
check((r.get_json() or {}).get("motivo") == "csrf", "y dice que fue por el token")
# Leer sí se puede: no cambia nada.
check(sin_token.get("/api/permisos/mios").status_code == 200,
      "pero leer lo suyo sigue funcionando")

print("\n7. La base real ni se abrió")
real = sqlite3.connect(os.path.join(RAIZ, "data", "rrhh.db"))
n = real.execute("SELECT COUNT(*) FROM personal WHERE nombre LIKE 'Zzz Rol%'").fetchone()[0]
real.close()
check(n == 0, f"ninguna ficha de esta prueba llegó a la base real ({n})")

print("\n" + (f"  {len(fallos)} FALLOS" if fallos else "  SEPARACIÓN DE ROLES OK (sobre copia)"))
for f in fallos:
    print("   -", f)
sys.exit(1 if fallos else 0)
