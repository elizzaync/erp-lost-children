# -*- coding: utf-8 -*-
"""Anotar una asistencia a mano: cuándo se puede y cuándo no.

Es la salida para los días en que ni el terminal ni el celular sirven. Y
justo por eso hay que apretarla: una marca que nadie comprueba, si además
admite cualquier fecha y no dice quién la escribió, deja de ser un
registro y pasa a ser una opinión.

Se comprueba lo que puede salir mal:

  · fecha futura            -> no
  · hora imposible          -> no
  · hoy pero más tarde      -> no
  · sin motivo              -> no
  · repetida                -> no duplica
  · bien puesta             -> queda, con quién y por qué

Contra la API, que es donde de verdad se aplican las reglas: comprobarlo
llamando a db.guardar_marca() se saltaría todas.
"""
import http.cookiejar
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

sys.stdout.reconfigure(encoding="utf-8")
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RAIZ, "backend"))

BASE = os.environ.get("BASE_PRUEBAS", "http://127.0.0.1:7802")

fallos = []


def check(c, m):
    print(("  OK    " if c else "  FALLO ") + m)
    if not c:
        fallos.append(m)


tarro = http.cookiejar.CookieJar()
abridor = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(tarro))
CSRF = {"v": ""}


def pedir(ruta, datos=None, metodo=None):
    """Devuelve (codigo, cuerpo). No lanza: el código es parte de la prueba."""
    cab = {"Content-Type": "application/json"}
    if CSRF["v"]:
        cab["X-CSRF-Token"] = CSRF["v"]
    cuerpo = json.dumps(datos).encode() if datos is not None else None
    req = urllib.request.Request(BASE + ruta, data=cuerpo, headers=cab,
                                 method=metodo or ("POST" if datos else "GET"))
    try:
        with abridor.open(req, timeout=25) as r:
            return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode() or "{}")
        except Exception:
            return e.code, {}


print("0. Entrar")
cod, d = pedir("/api/login", {"usuario": os.environ.get("USUARIO_PRUEBAS", "banco.pruebas"),
                              "clave": os.environ.get("CLAVE_PRUEBAS", "pruebas")})
# El token viaja DENTRO de 'sesion', no en la raíz de la respuesta.
if cod == 200:
    CSRF["v"] = d.get("csrf") or (d.get("sesion") or {}).get("csrf") or ""
check(cod in (200, 404), f"login responde ({cod})")

# A quién se le anota. Cualquier persona activa sirve.
cod, d = pedir("/api/personal")
gente = (d or {}).get("personal") or []
if not gente:
    print("   no hay personal en el banco; nada que probar")
    sys.exit(0)
alguien = gente[0]
print(f"   se anotará a: {alguien['nombre']}")

HOY = time.strftime("%Y-%m-%d")
MANANA = time.strftime("%Y-%m-%d", time.localtime(time.time() + 86400))

print("\n1. Lo que NO debe dejar")
cod, d = pedir("/api/asistencia/manual",
               {"tipo": "personal", "titular_id": alguien["id"],
                "fecha": MANANA, "hora": "08:00", "motivo": "prueba"})
check(cod == 400, f"fecha futura rechazada ({cod})")

cod, d = pedir("/api/asistencia/manual",
               {"tipo": "personal", "titular_id": alguien["id"],
                "fecha": HOY, "hora": "25:99", "motivo": "prueba"})
check(cod == 400, f"hora imposible rechazada ({cod})")

cod, d = pedir("/api/asistencia/manual",
               {"tipo": "personal", "titular_id": alguien["id"],
                "fecha": HOY, "hora": "23:59", "motivo": "prueba"})
check(cod == 400, f"una hora de hoy que aún no llegó, rechazada ({cod})")

cod, d = pedir("/api/asistencia/manual",
               {"tipo": "personal", "titular_id": alguien["id"],
                "fecha": "2026-08-20", "hora": "08:00", "motivo": ""})
check(cod == 400, f"sin motivo, rechazada ({cod})")
check("motivo" in json.dumps(d).lower() or "inventada" in json.dumps(d).lower(),
      "y el mensaje explica por qué hace falta el motivo")

cod, d = pedir("/api/asistencia/manual",
               {"tipo": "personal", "titular_id": 999999,
                "fecha": "2026-08-20", "hora": "08:00", "motivo": "no existe"})
check(cod == 404, f"persona inexistente rechazada ({cod})")

print("\n2. Lo que SÍ debe dejar")
cod, d = pedir("/api/asistencia/manual",
               {"tipo": "personal", "titular_id": alguien["id"],
                "fecha": "2026-08-20", "hora": "08:07",
                "motivo": "El terminal estuvo caído toda la mañana"})
check(cod == 200 and d.get("registrada"), f"una marca pasada bien puesta entra ({cod})")
check(d.get("hora") == "08:07", "con la hora que se dijo")

print("\n3. No duplica")
cod, d = pedir("/api/asistencia/manual",
               {"tipo": "personal", "titular_id": alguien["id"],
                "fecha": "2026-08-20", "hora": "08:07",
                "motivo": "El terminal estuvo caído toda la mañana"})
check(cod == 200 and d.get("repetida"), "la segunda vez avisa en vez de duplicar")

print("\n4. Queda quién la anotó y por qué")
import config          # noqa: E402
import db              # noqa: E402
fila = db.consultar(
    """SELECT m.* FROM marcas m
        JOIN identidades i ON i.staff_number = m.staff_number
       WHERE i.personal_id = ? AND m.fecha = '2026-08-20' AND m.hora = '08:07'""",
    (alguien["id"],))
check(len(fila) == 1, "la marca está en la base")
if fila:
    check(fila[0]["canal"] == "manual", "marcada como manual, no como del terminal")
    check(bool(fila[0]["motivo"]), f"con su motivo: {fila[0]['motivo'][:40]}")
    check(fila[0]["registrada_por"] is not None,
          "y con quién la anotó — es lo que la hace revisable")

print()
print(("FALLOS: " + str(len(fallos))) if fallos else "ASISTENCIA MANUAL OK")
for f in fallos:
    print("  - " + f)
sys.exit(1 if fallos else 0)
