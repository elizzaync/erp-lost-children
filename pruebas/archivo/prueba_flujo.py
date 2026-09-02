# -*- coding: utf-8 -*-
"""
Prueba de la máquina de estados de enrolamiento con un dispositivo
simulado. No toca yunatt ni el dispositivo real: sustituye el cliente por
un doble que imita cómo responde el equipo.

Verifica lo que de verdad importa antes de la prueba con hardware:
  - el staffNumber cae SIEMPRE en el rango reservado
  - el comando lleva el backup correcto (50 rostro / 0 huella)
  - "ambos" encadena las dos fases solo
  - el éxito se detecta comparando contra el estado base
  - el tiempo límite marca error
  - la guarda de rango bloquea IDs de producción
"""
import os
import sys
import tempfile
import time

RAIZ = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend")
sys.path.insert(0, RAIZ)

os.environ["YUNATT_EMAIL"] = "prueba@local"
os.environ["YUNATT_PASSWORD"] = "prueba"
os.environ["YUNATT_DEVICE_ID"] = "1"
os.environ["YUNATT_DEPT_ID"] = "1"
# Simula un terminal CON lector de huella, para seguir probando esa rama.
os.environ["SOPORTA_HUELLA"] = "1"

import config

config.DB_PATH = os.path.join(tempfile.mkdtemp(), "prueba.db")

import db
import enrolamiento
import yunatt_client

db.iniciar()

fallos = []


def crear_ficha(nombre):
    """Crea la ficha de personal y devuelve su id: enrolamiento ya no crea
    personas, solo les añade identidad biométrica."""
    return db.crear_personal({"nombre": nombre, "ambito": "min", "vinculo": "staff"})


def check(cond, msg):
    print(("  OK    " if cond else "  FALLO ") + msg)
    if not cond:
        fallos.append(msg)


class DispositivoSimulado:
    """Imita al Timmy: guarda backupnums por enrollid y registra comandos."""

    def __init__(self):
        self.registrados = {}
        self.comandos = []
        self.altas = []

    def staff_en_nube(self):
        return [{"staffNumber": str(sn), "id": 100 + int(sn), "photo": ""}
                for sn in self.registrados]

    def alta_staff(self, sn, nombre):
        config.validar_rango(sn)
        self.altas.append((int(sn), nombre))
        self.registrados.setdefault(str(sn), [])
        return True

    def comando_enrolar(self, sn, nombre, backup):
        config.validar_rango(sn)
        self.comandos.append((int(sn), str(backup)))
        return True

    def estado_en_dispositivo(self, sn):
        nums = self.registrados.get(str(sn))
        # Copia, igual que el cliente real: cada respuesta de yunatt se
        # decodifica desde JSON y produce listas nuevas.
        return {
            "en_dispositivo": nums is not None,
            "backupnums": list(nums) if nums is not None else [],
            "rostro": config.tiene_rostro(nums),
            "huella": config.tiene_huella(nums),
            "foto": "",
        }

    # -- simulación de la persona frente al equipo --
    def capta_rostro(self, sn):
        self.registrados.setdefault(str(sn), []).append(50)

    def capta_huella(self, sn):
        self.registrados.setdefault(str(sn), []).append(0)


sim = DispositivoSimulado()
enrolamiento.cliente = sim
yunatt_client.cliente = sim

print("\n1. Rango reservado")
try:
    config.validar_rango(11)
    check(False, "un ID de produccion deberia ser rechazado")
except config.RangoReservadoError:
    check(True, "la guarda rechaza el ID 11 (pertenece al ERP anterior)")
check(config.validar_rango(9001) == 9001, "acepta 9001 (rango propio)")

print("\n2. Enrolamiento solo rostro")
r = enrolamiento.iniciar("personal", crear_ficha("Ana Quispe"), "facial")
sn = r["staff_number"]
check(sn >= config.STAFF_NUMBER_BASE, f"staffNumber asignado en rango: {sn}")
check(r["estado"] == "esperando", "queda esperando a la persona")
check(r["total_pasos"] == 1, "una sola fase")
check(sim.comandos[-1] == (sn, "50"), "comando enviado con backup 50 (rostro)")
check(sim.altas[-1][1] == "Ana Quispe", "alta en yunatt con el nombre correcto")

est = enrolamiento.estado(sn)
check(est["estado"] == "esperando", "sigue esperando antes de la captura")

sim.capta_rostro(sn)
enrolamiento._sesiones[sn]._cache_ts = 0  # saltar la cache del sondeo
est = enrolamiento.estado(sn)
check(est["estado"] == "ok", "detecta la captura de rostro")
check(est["tiene_rostro"] and not est["tiene_huella"], "marca solo rostro")
check(db.identidad(sn)["estado"] == "enrolado", "persistido como enrolado")

print("\n3. Enrolamiento 'ambos' — dos fases encadenadas")
r = enrolamiento.iniciar("personal", crear_ficha("Luis Mamani"), "ambos")
sn2 = r["staff_number"]
check(sn2 == sn + 1, f"el siguiente numero es correlativo: {sn2}")
check(r["total_pasos"] == 2 and r["paso"] == 1, "arranca en el paso 1 de 2")
check(sim.comandos[-1] == (sn2, "50"), "fase 1 pide rostro (backup 50)")

sim.capta_rostro(sn2)
enrolamiento._sesiones[sn2]._cache_ts = 0
est = enrolamiento.estado(sn2)
check(est["estado"] == "esperando", "sigue abierto tras el rostro")
check(est["paso"] == 2, "pasa al paso 2")
check(est["fase"] == "huella", "la fase 2 es huella")
check(sim.comandos[-1] == (sn2, "0"), "fase 2 pide huella (backup 0) sin intervencion")

sim.capta_huella(sn2)
enrolamiento._sesiones[sn2]._cache_ts = 0
est = enrolamiento.estado(sn2)
check(est["estado"] == "ok", "cierra en exito tras las dos fases")
check(est["tiene_rostro"] and est["tiene_huella"], "marca rostro y huella")
p = db.identidad(sn2)
check(p["tiene_rostro"] == 1 and p["tiene_huella"] == 1, "persistido con ambos")

print("\n4. Tiempo límite")
r = enrolamiento.iniciar("personal", crear_ficha("Nadie Aparece"), "facial")
sn3 = r["staff_number"]
ses = enrolamiento._sesiones[sn3]
ses.inicio_fase = time.time() - (enrolamiento.TIEMPO_LIMITE + 1)
ses._cache_ts = 0
est = enrolamiento.estado(sn3)
check(est["estado"] == "error", "marca error al agotarse el tiempo")
check("no se complet" in est["detalle"].lower(), "explica el motivo al usuario")

print("\n5. Reintento sobre la misma persona")
r = enrolamiento.reintentar(sn3)
check(r["staff_number"] == sn3, "reintenta con el MISMO staffNumber")
check(sim.comandos[-1] == (sn3, "50"), "reenvia el comando de rostro")
usados = len(set(a[0] for a in sim.altas))
check(usados == 3, f"no consume numeros extra del rango (altas unicas: {usados})")

print("\n6. Cache del sondeo")
r = enrolamiento.iniciar("personal", crear_ficha("Cache Test"), "facial")
sn4 = r["staff_number"]
llamadas = {"n": 0}
orig = sim.estado_en_dispositivo


def contando(x):
    llamadas["n"] += 1
    return orig(x)


sim.estado_en_dispositivo = contando
for _ in range(6):
    enrolamiento.estado(sn4)
check(llamadas["n"] <= 1, f"6 sondeos seguidos -> {llamadas['n']} consulta(s) reales a yunatt")
sim.estado_en_dispositivo = orig

print("\n7. Filtro de marcas ajenas")
db.guardar_marca(11, "2026-08-12", "08:00")
db.guardar_marca(9000, "2026-08-12", "08:05")
filas = db.consultar("SELECT staff_number FROM marcas")
check(all(f["staff_number"] >= 9000 for f in filas),
      "descarta marcas de staffNumber ajeno al rango")

print()
if fallos:
    print(f"  {len(fallos)} FALLOS")
    sys.exit(1)
print("  TODAS LAS COMPROBACIONES OK")
