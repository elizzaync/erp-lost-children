# -*- coding: utf-8 -*-
"""Asignar un jefe, por la API. ¿Se guarda o no?

La suite de organigrama dice que tras elegir un jefe y guardar, la ficha
sigue con jefe_id nulo. Antes de tocar la pantalla hay que saber de qué
lado está el fallo: si la API guarda, el problema es de la interfaz o de
la prueba; si no guarda, es del backend y afecta a cualquiera que lo use.
"""
import http.cookiejar
import json
import os
import sys
import urllib.error
import urllib.request

sys.stdout.reconfigure(encoding="utf-8")
BASE = os.environ.get("URL_PRUEBAS", "http://127.0.0.1:7801")
USUARIO = os.environ.get("USUARIO_PRUEBAS", "banco.pruebas")
CLAVE = os.environ.get("CLAVE_PRUEBAS", "banco-de-pruebas-2026")

tarro = http.cookiejar.CookieJar()
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(tarro))
CSRF = {"v": ""}
fallos = []


def check(c, m):
    print(("  OK    " if c else "  FALLO ") + m)
    if not c:
        fallos.append(m)


def pide(ruta, metodo="GET", cuerpo=None):
    cab = {"Content-Type": "application/json"}
    if metodo != "GET" and CSRF["v"]:
        cab["X-CSRF-Token"] = CSRF["v"]
    req = urllib.request.Request(BASE + ruta, method=metodo,
        data=json.dumps(cuerpo).encode() if cuerpo is not None else None,
        headers=cab)
    try:
        with op.open(req, timeout=25) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.load(e)
        except Exception:
            return e.code, {}


pide("/api/login", "POST", {"usuario": USUARIO, "clave": CLAVE})
_, ses = pide("/api/sesion")
CSRF["v"] = (ses.get("sesion") or {}).get("csrf", "")

print("1. Dos fichas: una manda y la otra no tiene jefe")
_, d = pide("/api/personal", "POST", {"nombre": "Zzz Jefe", "cargo": "QA"})
JEFE = d.get("id") or (d.get("personal") or {}).get("id")
_, d = pide("/api/personal", "POST", {"nombre": "Zzz Suelto", "cargo": "QA"})
SUELTO = d.get("id") or (d.get("personal") or {}).get("id")
check(bool(JEFE and SUELTO), f"creadas (jefe {JEFE}, suelto {SUELTO})")


def jefe_de(pid):
    _, d = pide("/api/personal")
    f = next((p for p in d.get("personal", []) if p["id"] == pid), None)
    return f.get("jefe_id") if f else "no está"


check(jefe_de(SUELTO) is None, "empieza sin jefe")

print("\n2. Se le pone jefe")
cod, d = pide(f"/api/personal/{SUELTO}", "PUT", {"jefe_id": JEFE})
print(f"   PUT jefe_id={JEFE} -> {cod} {json.dumps(d)[:160]}")
ahora = jefe_de(SUELTO)
print(f"   jefe_id ahora: {ahora}")
check(ahora == JEFE, "la API guarda el jefe")

print("\n3. Se le quita")
cod, d = pide(f"/api/personal/{SUELTO}", "PUT", {"jefe_id": None})
print(f"   PUT jefe_id=null -> {cod}")
check(jefe_de(SUELTO) is None, "y la API sabe quitarlo")

print("\n4. Con el resto de la ficha, como manda la pantalla")
# La pantalla no manda solo jefe_id: manda la ficha entera. Si el campo se
# perdiera al ir acompañado, la API sola no lo delataría.
cod, d = pide(f"/api/personal/{SUELTO}", "PUT",
              {"nombre": "Zzz Suelto", "cargo": "QA", "area": "Pruebas",
               "estado": "activo", "jefe_id": JEFE, "sin_dato": ""})
print(f"   PUT ficha completa -> {cod}")
check(jefe_de(SUELTO) == JEFE, "también se guarda dentro de la ficha entera")

for pid in (SUELTO, JEFE):
    pide(f"/api/personal/{pid}", "DELETE")

print(f"\n  {len(fallos)} FALLOS" if fallos else "\n  JEFE POR API OK")
sys.exit(1 if fallos else 0)
