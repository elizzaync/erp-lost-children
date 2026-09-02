# -*- coding: utf-8 -*-
"""Las invitaciones al formulario, sobre una COPIA.

Lo que importa comprobar: que el enlace sale con el token dentro y el
formulario correcto, que dos invitaciones no comparten token, que una
caducada se ve como caducada sin que nadie tenga que pasar marcándolas,
que anular no borra el rastro, y que un token desconocido no revienta ni
se traga la respuesta en silencio.
"""
import os, shutil, sys, tempfile, pathlib
sys.stdout.reconfigure(encoding="utf-8")
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RAIZ, "backend"))

carpeta = pathlib.Path(tempfile.mkdtemp())
copia = carpeta / "invi.db"
shutil.copy2(os.path.join(RAIZ, "data", "rrhh.db"), copia)
os.environ["DB_PATH"] = str(copia)
import config; config.DB_PATH = str(copia)
import db; db.config.DB_PATH = str(copia)
db.iniciar()
import invitaciones as invi
import app as A
import ayuda_sesion

fallos = []
def check(c, m):
    print(("  OK    " if c else "  FALLO ") + m)
    if not c: fallos.append(m)


print("0. Las tablas existen en una base que ya estaba creada")
tablas = {r["name"] for r in db.consultar(
    "SELECT name FROM sqlite_master WHERE type='table'")}
check("invitaciones" in tablas, "tabla invitaciones")
check("respuestas_formulario" in tablas, "tabla respuestas_formulario")

print("\n1. Una invitación para una familia que todavía no tiene ficha")
a = invi.crear(etiqueta="Familia Quispe", usuario_id=None)
print("   enlace:", a["enlace"][:78] + "…")
check(a["token"] in a["enlace"], "el enlace lleva el token dentro")
check("PLANTILLA" not in a["enlace"], "y ya no lleva la palabra de plantilla")
check(a["enlace"].startswith("https://docs.google.com/forms/"),
      "apunta al formulario de Google")
check("entry.1103863268=" in a["enlace"], "en el campo del código de invitación")
check(a["situacion"] == "vigente", f"nace vigente ({a['situacion']})")
check(a["para"] == "Familia Quispe" if "para" in a else True, "se sabe a quién se le dio")

print("\n2. Dos invitaciones no comparten token")
b = invi.crear(etiqueta="Familia Ccahua")
check(a["token"] != b["token"], "tokens distintos")
check(len(a["token"]) >= 30, f"el token no se adivina probando ({len(a['token'])} caracteres)")

print("\n3. Para una ficha que ya existe, queda atada a ella")
rid = db.crear_responsable({"nombre": "Zzz Tutora Invitada", "documento": "ZZI-1",
                            "telefono": "977000555"})
c = invi.crear(responsable_id=rid)
check(c["responsable_id"] == rid, "apunta al responsable")
check(c["para"] == "Zzz Tutora Invitada", f"y se lee su nombre ({c['para']})")

print("\n4. Sin decir a quién, no se crea")
try:
    invi.crear()
    check(False, "debería haber avisado")
except invi.InvitacionError as e:
    print("   dice:", e)
    check("a quién" in str(e), "explica qué falta, sin jerga")

print("\n5. Una caducada se ve caducada sola, sin tarea nocturna")
db.actualizar_invitacion(b["id"], {"nota": "de prueba"})
db.ejecutar("UPDATE invitaciones SET caduca = '2020-01-01 00:00:00' WHERE id = ?",
            (b["id"],))
otra = invi.con_enlace(db.invitacion(b["id"]))
check(otra["situacion"] == "caducada", f"situación: {otra['situacion']}")
check(otra["estado"] == "vigente",
      "sin haber tocado la fila: la fecha manda sobre el estado guardado")

print("\n6. Usar una invitación la cierra")
usada = invi.marcar_usada(c["id"])
check(usada["situacion"] == "usada", f"situación: {usada['situacion']}")
check(bool(usada["usada"]), "queda cuándo se usó")

print("\n7. Anular deja el rastro de que se entregó")
anulada = invi.anular(a["id"], "se filtró en un grupo de WhatsApp")
check(anulada["situacion"] == "anulada", f"situación: {anulada['situacion']}")
check(db.invitacion(a["id"]) is not None, "la fila sigue existiendo")
check("WhatsApp" in (anulada["nota"] or ""), "y el motivo queda escrito")

print("\n8. Un token que vuelve se resuelve, y uno desconocido no revienta")
r = invi.resolver(c["token"])
check((r["invitacion"] or {}).get("responsable_id") == rid,
      "el token bueno dice de quién es la respuesta")
r2 = invi.resolver("esto-no-existe")
check(r2["invitacion"] is None and r2["situacion"] == "desconocido",
      f"el desconocido se marca en vez de tirarse ({r2['situacion']})")
r3 = invi.resolver("")
check(r3["situacion"] == "sin token", f"y sin token, también ({r3['situacion']})")

print("\n9. Los endpoints, como los usará la pantalla")
cli = ayuda_sesion.cliente(A.app)
res = cli.get("/api/invitaciones")
check(res.status_code == 200, f"listar responde 200 ({res.status_code})")
d = res.get_json()
check(d.get("configurado") is True, "dice que el formulario está configurado")
check(len(d.get("invitaciones") or []) >= 3, f"y devuelve las creadas ({len(d.get('invitaciones') or [])})")

res = cli.post("/api/invitaciones", json={"etiqueta": "Familia Nueva", "dias": 7})
check(res.status_code == 200, f"crear responde 200 ({res.status_code})")
nueva = (res.get_json() or {}).get("invitacion") or {}
check(bool(nueva.get("enlace")), "y devuelve el enlace listo para entregar")

res = cli.post("/api/invitaciones", json={})
check(res.status_code == 400, f"crear sin destinatario se rechaza ({res.status_code})")

res = cli.post(f"/api/invitaciones/{nueva.get('id')}/anular", json={"motivo": "prueba"})
check(res.status_code == 200, f"anular responde 200 ({res.status_code})")
check(((res.get_json() or {}).get("invitacion") or {}).get("situacion") == "anulada",
      "y queda anulada")

print("\n10. Sin configuración, se avisa en vez de dar un enlace roto")
guardado = config.FORM_URL_PRELLENADO
config.FORM_URL_PRELLENADO = ""
invi.config.FORM_URL_PRELLENADO = ""
try:
    invi.crear(etiqueta="Sin config")
    check(False, "debería haber avisado")
except invi.InvitacionError as e:
    print("   dice:", str(e)[:90])
    check("backend/.env" in str(e), "y dice dónde se arregla")
config.FORM_URL_PRELLENADO = guardado
invi.config.FORM_URL_PRELLENADO = guardado

print()
print("FALLOS: " + str(len(fallos)) if fallos else "INVITACIONES OK")
for f in fallos: print("  - " + f)
shutil.rmtree(carpeta, ignore_errors=True)
sys.exit(1 if fallos else 0)
