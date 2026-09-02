# -*- coding: utf-8 -*-
"""
Los endpoints de Gestión de Permisos, sobre una COPIA.

Lo que importa comprobar:
  · el circuito completo: pedir → aprobar / rechazar / cancelar
  · el doble visto bueno: una solicitud larga no queda aprobada de una
  · el saldo de vacaciones, y que 'no aplica' no sea lo mismo que cero
  · lo que NO se puede hacer: solaparse, pedir más saldo del que hay,
    rechazar sin motivo, resolver dos veces
  · el autoservicio actúa sobre quien está en la sesión y sobre nadie más
"""
import os
import sys, os, shutil, sqlite3, tempfile, pathlib
sys.stdout.reconfigure(encoding="utf-8")

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RAIZ, "backend"))

COPIA = pathlib.Path(tempfile.mkdtemp()) / "permisos.db"
shutil.copy2(os.path.join(RAIZ, "data", "rrhh.db"), COPIA)
os.environ["DB_PATH"] = str(COPIA)
import config
config.DB_PATH = str(COPIA)
import db
db.config.DB_PATH = str(COPIA)
db.iniciar()

# La tabla de la copia puede ser la vieja (tres tipos). Se migra sobre la
# copia para probar contra el esquema que va a haber, no contra el que hubo.
import migrar_tipos_permiso as MIG
info = MIG.analizar(str(COPIA))
if not info["ya_migrada"]:
    MIG.ejecutar(str(COPIA), info)

import solicitudes as R
import app as A
# Con LOGIN_ESTRICTO activo, la API no atiende a quien no se identifica:
# esta prueba recibía 401 en todo. El ayudante crea una cuenta en la
# COPIA y devuelve un cliente ya dentro, con su token CSRF.
import ayuda_sesion
cli = ayuda_sesion.cliente(A.app)

fallos = []
def check(c, m):
    print(("  OK    " if c else "  FALLO ") + m)
    if not c:
        fallos.append(m)

def js(r):
    try:
        return r.get_json() or {}
    except Exception:
        return {}


print("0. Fixtura: una trabajadora en planilla con tres años de casa")
jefa = db.crear_personal({"nombre": "Zzz Permisos Jefa", "cargo": "Coordinadora"})
yo = db.crear_personal({"nombre": "Zzz Permisos Trabajadora", "cargo": "Educadora",
                        "fecha_ingreso": "2023-01-15", "jefe_id": jefa})
db.crear_condicion(yo, "planilla", 2500.0, 8, "2023-01-15")
otra = db.crear_personal({"nombre": "Zzz Permisos Ajena", "cargo": "Cocinera"})
print(f"   jefa {jefa} · trabajadora {yo} · ajena {otra}")
check(bool(jefa and yo and otra), "se crean las fichas")

print("\n1. El saldo de vacaciones se genera por antigüedad")
saldo = R.saldo_vacaciones(yo)
print(f"   saldo de la trabajadora: {saldo}")
check(saldo == 90 or saldo == 60,
      f"tres años cumplidos, topado en {config.TOPE_VACACIONES} ({saldo})")
check(saldo == config.TOPE_VACACIONES,
      "el tope corta la generación, no el saldo final")
check(R.saldo_vacaciones(otra) is None,
      "quien no está en planilla no genera: devuelve None, no 0")

print("\n2. Reglas antes de guardar")
try:
    R.validar_nueva(yo, "vacaciones", "2026-09-10", "2026-09-01")
    check(False, "aceptó fechas al revés")
except R.ReglaRota:
    check(True, "rechaza la fecha final anterior a la inicial")
try:
    R.validar_nueva(yo, "inventado", "2026-09-01", "2026-09-02")
    check(False, "aceptó un tipo inventado")
except R.ReglaRota:
    check(True, "rechaza un tipo que no existe")
try:
    R.validar_nueva(yo, "vacaciones", "2026-09-01", "2027-06-01")
    check(False, "aceptó más días de los que tiene")
except R.ReglaRota as e:
    check("quedan" in str(e), f"rechaza pedir más saldo del que hay ({e})")

print("\n3. Una solicitud corta la resuelve la jefatura sola")
corta = R.crear(yo, "medico", "2026-09-01", "2026-09-02", "control anual")
sol = db.solicitud(corta)
check(sol["estado"] == "pendiente", "nace pendiente")
check(sol["requiere_admin"] == 0,
      f"2 días no pasan el umbral de {config.DIAS_VISTO_BUENO_ADMIN}")
check(sol["jefe_id"] == jefa, "se dirige a la jefa de su ficha, no a quien se pida")

sol = R.resolver(corta, "aprobar")
check(sol["estado"] == "aprobada", "una aprobación basta")
check(bool(sol["aprob_jefe_el"]), "y queda el sello de cuándo")

print("\n4. Una solicitud larga necesita las dos firmas")
larga = R.crear(yo, "personal", "2026-10-01", "2026-10-20", "asunto familiar")
sol = db.solicitud(larga)
check(sol["requiere_admin"] == 1,
      f"20 días pasan el umbral de {config.DIAS_VISTO_BUENO_ADMIN}")
sol = R.resolver(larga, "aprobar")
check(sol["estado"] == "pendiente_admin",
      "la jefatura NO la deja aprobada: pasa a Administración")
check(bool(sol["aprob_jefe_el"]), "con el sello de la jefatura")
check(not sol["aprob_admin_el"], "y sin el de Administración todavía")
sol = R.resolver(larga, "aprobar")
check(sol["estado"] == "aprobada", "la segunda firma la cierra")
check(bool(sol["aprob_admin_el"]), "y deja su sello")

print("\n5. No se resuelve dos veces")
try:
    R.resolver(larga, "aprobar")
    check(False, "dejó aprobar una solicitud ya aprobada")
except R.ReglaRota as e:
    check(True, f"una aprobada no se vuelve a aprobar ({e})")
try:
    R.resolver(larga, "rechazar")
    check(False, "dejó rechazar una ya aprobada")
except R.ReglaRota:
    check(True, "ni se rechaza")
sol = R.resolver(larga, "cancelar")
check(sol["estado"] == "cancelada", "pero sí se puede cancelar")

print("\n6. No se pueden solapar dos solicitudes vivas")
# «familiar» dejó de existir el 27/08/2026: los tipos son los diez del
# formato en papel de la ONG, y ese se traduce a «personal».
R.crear(yo, "personal", "2026-11-05", "2026-11-06")
try:
    R.crear(yo, "otro", "2026-11-06", "2026-11-08")
    check(False, "aceptó una solicitud encima de otra")
except R.ReglaRota as e:
    check("se cruza" in str(e), f"detecta el cruce de fechas ({e})")
# Una cancelada ya no estorba.
R.crear(yo, "otro", "2026-12-01", "2026-12-02")
cancelada = db.solicitudes_de(yo)[0]["id"]
R.resolver(cancelada, "cancelar")
try:
    R.crear(yo, "otro", "2026-12-01", "2026-12-02")
    check(True, "una cancelada libera sus fechas")
except R.ReglaRota as e:
    check(False, f"la cancelada seguía bloqueando ({e})")

print("\n7. Los endpoints de revisión")
r = cli.get("/api/permisos")
d = js(r)
check(r.status_code == 200, f"lista las pendientes ({r.status_code})")
abiertas = d.get("solicitudes", [])
check(all(s["estado"] in R.ABIERTOS for s in abiertas),
      "sin filtro devuelve solo lo que hay que resolver")
check("resumen" in d and d["resumen"].get("por_resolver") == len(abiertas),
      "y el resumen cuadra con la lista")
check(all(s.get("persona") for s in abiertas),
      "cada una dice de quién es, no solo su id")
check(all("dias" in s for s in abiertas), "y cuántos días abarca")

r = cli.get("/api/permisos?estado=todas")
check(len(js(r).get("solicitudes", [])) > len(abiertas),
      "con estado=todas salen también las resueltas")

print("\n8. Rechazar exige motivo")
pend = [s for s in db.solicitudes_de(yo) if s["estado"] in R.ABIERTOS][0]["id"]
r = cli.post(f"/api/permisos/{pend}/rechazar", json={})
check(r.status_code == 400, f"sin motivo se rechaza el rechazo ({r.status_code})")
r = cli.post(f"/api/permisos/{pend}/rechazar",
             json={"nota": "Coincide con la semana de campamento"})
check(r.status_code == 200, "con motivo sí")
check(db.solicitud(pend)["nota"] == "Coincide con la semana de campamento",
      "y el motivo queda guardado para que ella lo lea")

print("\n9. Resolver algo que no existe")
r = cli.post("/api/permisos/999999/aprobar", json={})
check(r.status_code == 404, f"404 y no un error feo ({r.status_code})")

print("\n10. Tipos que ofrece la API")
r = cli.get("/api/permisos/tipos")
tipos = [t["valor"] for t in js(r).get("tipos", [])]
print("   " + str(tipos))
# Diez desde el 27/08/2026: son las diez casillas del formato en papel de
# la ONG, ni una más ni una menos. Si aparece una que el papel no tiene, la
# solicitud impresa no se puede marcar.
DIEZ = ("personal", "comision", "medico", "capacitacion", "permanencia",
        "recuperacion", "vacaciones", "libres", "transferencia", "otro")
check(len(tipos) == 10, f"diez tipos ({len(tipos)})")
check(sorted(tipos) == sorted(DIEZ),
      "y son exactamente los del papel")
check("permiso" not in tipos, "y no el viejo cajón de sastre")

print("\n11. El autoservicio sin sesión no adivina de quién es")
# Un cliente aparte, sin entrar: el de arriba ya tiene sesión, y con él
# esta comprobación medía lo contrario de lo que dice.
cli = A.app.test_client()
r = cli.get("/api/permisos/mios")
check(r.status_code == 401, f"pide identificarse ({r.status_code})")
check(js(r).get("motivo") == "sin_sesion", "y dice por qué")
r = cli.post("/api/permisos", json={"tipo": "otro", "desde": "2027-01-01",
                                    "hasta": "2027-01-02"})
check(r.status_code == 401, "tampoco deja crear a ciegas")

print("\n12. La base real ni se abrió")
real = sqlite3.connect(os.path.join(RAIZ, "data", "rrhh.db"))
n = real.execute("SELECT COUNT(*) FROM personal WHERE nombre LIKE 'Zzz Permisos%'").fetchone()[0]
real.close()
check(n == 0, f"ninguna ficha de esta prueba llegó a la base real ({n})")

print("\n" + (f"  {len(fallos)} FALLOS" if fallos else "  ENDPOINTS DE PERMISOS OK (sobre copia)"))
for f in fallos:
    print("   -", f)
sys.exit(1 if fallos else 0)
