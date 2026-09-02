# -*- coding: utf-8 -*-
"""
Las tres series del expediente de beneficiario, sobre una COPIA.

Programas, historial educativo y seguimiento social: hasta ahora las tablas
existían pero nadie podía leerlas ni escribirlas. Se comprueba el viaje
completo —API, base y de vuelta— y las dos cosas que se pueden hacer mal:
escribir en el expediente de otro, y dejar filas huérfanas al borrar la ficha.
"""
import os
import sys, os, shutil, tempfile, pathlib, json
sys.stdout.reconfigure(encoding="utf-8")

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RAIZ, "backend"))

COPIA = pathlib.Path(tempfile.mkdtemp()) / "series.db"
shutil.copy2(os.path.join(RAIZ, "data", "rrhh.db"), COPIA)
os.environ["DB_PATH"] = str(COPIA)
import config
config.DB_PATH = str(COPIA)
import db
db.config.DB_PATH = str(COPIA)
db.iniciar()
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


print("0. Fixtura")
ben = db.crear_beneficiario({"nombre": "Zzz Beneficiario Series"})
otro = db.crear_beneficiario({"nombre": "Zzz Beneficiario Ajeno"})
tutor = db.crear_personal({"nombre": "Zzz Tutora Seguimiento", "cargo": "Trabajadora social"})
print(f"   beneficiario {ben} · ajeno {otro} · personal {tutor}")
check(bool(ben and otro and tutor), "se crean las fichas de prueba")

print("\n1. Las tres series empiezan vacías")
d = js(cli.get(f"/api/beneficiarios/{ben}/series"))
check(d.get("ok") is True, "el endpoint responde")
for k in ("programas", "historial", "seguimiento"):
    check(d.get(k) == [], f"{k}: vacía")

print("\n2. Un beneficiario que no existe da 404, no una lista vacía")
r = cli.get("/api/beneficiarios/999999/series")
check(r.status_code == 404, f"404 y no 200 con nada dentro ({r.status_code})")

print("\n3. Programas")
r = cli.post(f"/api/beneficiarios/{ben}/programas",
             json={"programa": "Refuerzo escolar", "fecha_ingreso": "2026-03-01",
                   "estado": "activo", "nota": "Dos tardes por semana"})
check(r.status_code == 200, f"se crea ({r.status_code})")
progs = js(r).get("programas", [])
check(len(progs) == 1 and progs[0]["programa"] == "Refuerzo escolar",
      "vuelve en la respuesta, sin tener que pedirla otra vez")

r = cli.post(f"/api/beneficiarios/{ben}/programas", json={"programa": ""})
check(r.status_code == 400, f"un programa sin nombre se rechaza ({r.status_code})")

r = cli.post(f"/api/beneficiarios/{ben}/programas",
             json={"programa": "Comedor", "fecha_ingreso": "2025-01-10",
                   "fecha_salida": "2025-12-20", "estado": "cerrado"})
progs = js(r).get("programas", [])
check(len(progs) == 2, "se puede tener más de uno")
check(progs[0]["estado"] == "activo",
      "el activo va primero, que es lo que se busca al abrir la ficha")

pid_prog = progs[1]["id"]
r = cli.put(f"/api/programas/{pid_prog}", json={"nota": "Cerrado por mudanza"})
check(r.status_code == 200, "se edita")
check(db.programas_de(ben)[1]["nota"] == "Cerrado por mudanza", "y el cambio queda")

print("\n4. Historial educativo")
r = cli.post(f"/api/beneficiarios/{ben}/historial",
             json={"anio": "2025", "institucion": "I.E. 40052", "nivel": "Primaria",
                   "grado": "5to", "seccion": "B", "situacion": "aprobado"})
check(r.status_code == 200, f"se crea ({r.status_code})")
r = cli.post(f"/api/beneficiarios/{ben}/historial",
             json={"anio": "2026", "institucion": "I.E. 40052", "nivel": "Primaria",
                   "grado": "6to", "situacion": "en curso"})
hist = js(r).get("historial", [])
check(len(hist) == 2, "dos años")
check(hist[0]["anio"] == "2026", "el año más reciente arriba")

r = cli.post(f"/api/beneficiarios/{ben}/historial", json={"nota": "sin año ni colegio"})
check(r.status_code == 400, f"sin año ni institución se rechaza ({r.status_code})")

print("\n5. Seguimiento social")
r = cli.post(f"/api/beneficiarios/{ben}/seguimiento",
             json={"fecha": "2026-08-10", "responsable_id": tutor,
                   "tipo": "visita", "situacion": "Falta a clases los lunes",
                   "accion": "Se conversó con la familia",
                   "compromisos": "Acompañamiento matinal",
                   "proxima_fecha": "2026-09-10"})
check(r.status_code == 200, f"se crea ({r.status_code})")
seg = js(r).get("seguimiento", [])
check(len(seg) == 1, "queda registrado")
check(seg[0]["responsable_nombre"] == "Zzz Tutora Seguimiento",
      "trae el nombre de quien lo hizo, no solo el id")

r = cli.post(f"/api/beneficiarios/{ben}/seguimiento", json={"situacion": "algo"})
check(r.status_code == 400, f"sin fecha se rechaza ({r.status_code})")
r = cli.post(f"/api/beneficiarios/{ben}/seguimiento", json={"fecha": "2026-08-11"})
check(r.status_code == 400, f"sin situación se rechaza ({r.status_code})")

print("\n6. Si se borra a quien lo hizo, el seguimiento no se pierde")
db.borrar_personal(tutor)
seg = db.seguimiento_de(ben)
check(len(seg) == 1, "el registro sigue ahí")
check(seg[0]["responsable_id"] is None, "el vínculo queda en nulo")
check(not seg[0]["responsable_nombre"], "y el nombre sale vacío, sin reventar")
check(seg[0]["situacion"] == "Falta a clases los lunes",
      "lo que se escribió no se toca: es el historial del niño, no del adulto")

print("\n7. Cada expediente es suyo")
d = js(cli.get(f"/api/beneficiarios/{otro}/series"))
check(d.get("programas") == [] and d.get("historial") == []
      and d.get("seguimiento") == [],
      "el otro beneficiario no ve nada de este")

print("\n8. Al borrar la ficha se lleva sus series")
antes = (len(db.programas_de(ben)), len(db.historial_de(ben)), len(db.seguimiento_de(ben)))
print(f"   antes: {antes}")
check(antes == (2, 2, 1), "hay algo que borrar")
db.borrar_beneficiario(ben)
despues = (len(db.programas_de(ben)), len(db.historial_de(ben)), len(db.seguimiento_de(ben)))
print(f"   después: {despues}")
check(despues == (0, 0, 0), "no quedan filas huérfanas")
r = cli.get(f"/api/beneficiarios/{ben}/series")
check(r.status_code == 404, f"y el expediente ya no existe ({r.status_code})")

print("\n9. La base real no se tocó")
import sqlite3
real = sqlite3.connect(os.path.join(RAIZ, "data", "rrhh.db"))
n = real.execute("SELECT COUNT(*) FROM beneficiarios WHERE nombre LIKE 'Zzz %'").fetchone()[0]
real.close()
check(n == 0, f"ni una fila de esta prueba llegó a la base real ({n})")

print("\n" + (f"  {len(fallos)} FALLOS" if fallos else "  SERIES DEL BENEFICIARIO OK (sobre copia)"))
for f in fallos:
    print("   -", f)
sys.exit(1 if fallos else 0)
