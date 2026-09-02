# -*- coding: utf-8 -*-
"""«Enrolado» significa lo que el terminal confirmó, y nada más.

Esta suite existe por un fallo concreto: la fila de identidad se crea al
PEDIR el enrolamiento, y todo lo que la leía sin mirar más daba por
enrolada a esa persona. Cuatro personas quedaron fuera de la cola sin que
nadie lo notara, y una figuraba como enrolada en Asistencia sin estarlo.

Se prueba sobre una COPIA, reproduciendo los tres casos que existían de
verdad en la base: uno confirmado, uno cancelado y uno esperando.
"""
import os, shutil, sys, tempfile, pathlib
sys.stdout.reconfigure(encoding="utf-8")
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RAIZ, "backend"))

carpeta = pathlib.Path(tempfile.mkdtemp())
copia = carpeta / "enrol.db"
shutil.copy2(os.path.join(RAIZ, "data", "rrhh.db"), copia)
os.environ["DB_PATH"] = str(copia)
import config; config.DB_PATH = str(copia)
import db; db.config.DB_PATH = str(copia)
db.iniciar()
import enrolamiento

fallos = []
def check(c, m):
    print(("  OK    " if c else "  FALLO ") + m)
    if not c: fallos.append(m)


print("0. Tres personas y tres desenlaces distintos")
confirmada = db.crear_responsable({"nombre": "Zzz Enrolada De Verdad", "documento": "ZE-1",
                                   "telefono": "977000001"})
cancelada = db.crear_responsable({"nombre": "Zzz Captura Cancelada", "documento": "ZE-2",
                                  "telefono": "977000002"})
esperando = db.crear_responsable({"nombre": "Zzz Dejado A Medias", "documento": "ZE-3",
                                  "telefono": "977000003"})
# Números LIBRES, no fijos.
#
# Antes usaba STAFF_NUMBER_BASE + 501, 502 y 503, que en un banco copiado
# de la base real pertenecen a personas de verdad. Funcionaba solo porque
# crear_identidad hacía INSERT OR REPLACE: le robaba el número al dueño
# legítimo y, de paso, borraba sus marcas por la cascada. Desde que eso se
# arregló (01/09/2026) la colisión salta como error, que es lo correcto.
sn1 = db.siguiente_staff_number()
db.crear_identidad(sn1, "responsable", confirmada, "facial")
db.actualizar_identidad(sn1, "enrolado", rostro=1, detalle="Rostro capturado")
sn2 = db.siguiente_staff_number()
db.crear_identidad(sn2, "responsable", cancelada, "facial")
db.actualizar_identidad(sn2, "error", detalle="Captura cancelada desde el sistema")
sn3 = db.siguiente_staff_number()
db.crear_identidad(sn3, "responsable", esperando, "huella")   # se queda esperando
check(True, "creadas: una confirmada, una cancelada y una esperando")

print("\n1. La vista distingue las tres")
v = {f["staff_number"]: f for f in db.identidades()}
check(v[sn1]["enrolado"] == 1, "la confirmada cuenta como enrolada")
check(v[sn2]["enrolado"] == 0, "la cancelada NO")
check(v[sn3]["enrolado"] == 0, "la que espera tampoco")

print("\n2. La cola de enrolamiento recupera a quien quedó a medias")
cola = {c["nombre"] for c in db.sin_enrolar()}
check("Zzz Captura Cancelada" in cola, "la cancelada vuelve a estar en la cola")
check("Zzz Dejado A Medias" in cola, "la que espera, también")
check("Zzz Enrolada De Verdad" not in cola, "y la confirmada no aparece")

print("\n3. La cola cuenta en qué quedó el intento anterior")
fila = [c for c in db.sin_enrolar() if c["nombre"] == "Zzz Captura Cancelada"][0]
check(fila["intento_estado"] == "error", f"dice el estado ({fila['intento_estado']})")
check("cancelada" in (fila["intento_detalle"] or "").lower(),
      "y el motivo, para no repetir el mismo paso a ciegas")
nueva = [c for c in db.sin_enrolar() if c["nombre"] == "Zzz Enrolada De Verdad"]
check(not nueva, "la confirmada sigue fuera")

print("\n4. Asistencia solo cuenta a quien puede marcar")
hoy = __import__("datetime").date.today().isoformat()
nombres = {f["nombre"] for f in db.marcas_de(hoy)}
check("Zzz Enrolada De Verdad" in nombres, "la confirmada aparece")
check("Zzz Captura Cancelada" not in nombres, "la cancelada no figura como presente ni ausente")
check("Zzz Dejado A Medias" not in nombres, "la que espera, tampoco")
sem = {f["nombre"] for f in db.marcas_rango("2026-08-17", "2026-08-23")}
check("Zzz Dejado A Medias" not in sem, "ni en la vista semanal")

print("\n5. Reintentar ya no choca contra un mensaje falso")
# El motor habla con el terminal; aquí solo interesa la comprobación
# previa, así que se sustituye la parte que sale a la red.
class ClienteFalso:
    def staff_en_nube(self): return []
    def alta_staff(self, sn, nombre): return True
enrolamiento.cliente = ClienteFalso()
enrolamiento._lanzar_fase = lambda s: None

try:
    r = enrolamiento.iniciar("responsable", cancelada, "facial")
    check(True, "deja reintentar a quien canceló")
    check(r["staff_number"] == sn2,
          f"y reaprovecha su número, sin dejar filas sueltas ({r['staff_number']})")
except Exception as e:
    check(False, f"debería dejar reintentar, pero dijo: {e}")

cuantas = db.consultar(
    "SELECT COUNT(*) n FROM identidades WHERE responsable_id = ?", (cancelada,))[0]["n"]
check(cuantas == 1, f"esa persona sigue teniendo una sola identidad ({cuantas})")

print("\n6. Y a la que sí está enrolada se la sigue frenando")
try:
    enrolamiento.iniciar("responsable", confirmada, "facial")
    check(False, "no debería dejar")
except ValueError as e:
    print("   dice:", str(e)[:90])
    check("ya está enrolada" in str(e), "con el mensaje correcto, que ahora sí es cierto")

print("\n7. Limpieza")
for r in (confirmada, cancelada, esperando):
    db.ejecutar("DELETE FROM identidades WHERE responsable_id = ?", (r,))
    db.ejecutar("DELETE FROM responsables WHERE id = ?", (r,))
check(True, "retiradas las tres fichas de prueba")

print()
print("FALLOS: " + str(len(fallos)) if fallos else "DEFINICIÓN DE ENROLADO OK")
for f in fallos: print("  - " + f)
shutil.rmtree(carpeta, ignore_errors=True)
sys.exit(1 if fallos else 0)
