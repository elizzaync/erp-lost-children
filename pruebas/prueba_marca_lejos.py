# -*- coding: utf-8 -*-
"""Marcar desde donde sea ENTRA, y queda escrito DÓNDE.

LA REGLA
────────
La ubicación de una marca no tiene nada que ver con la de la casa hogar.
Lo que hay que ver es dónde estaba la persona —«Bocanegra, Callao»— y ya.
Ni metros, ni cerca, ni lejos, ni radio.

Esta suite nació comprobando lo contrario: que pasado un radio el servidor
devolvía 403 y la marca no existía. Ese cerco se retiró el 31/08/2026 por
decisión de la ONG, en dos pasos —primero dejó de rechazar, después dejó de
medir— y la suite pasa a fijar la regla nueva para que no reaparezca.

QUÉ SE COMPRUEBA
────────────────
  1. Una marca a 5 km entra, como cualquier otra.
  2. Queda con sus coordenadas y con el NOMBRE del sitio.
  3. Una marca sin ubicación también entra.
  4. El servidor no devuelve «lejos» ni «sin_ubicacion» en ningún caso.
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

sys.path.insert(0, os.path.join(
    os.environ.get("RAIZ", os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "backend"))
import db  # noqa: E402

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
    req = urllib.request.Request(BASE + ruta, method=metodo, headers=cab,
        data=json.dumps(cuerpo).encode() if cuerpo is not None else None)
    try:
        with op.open(req, timeout=30) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.load(e)
        except Exception:
            return e.code, {}


pide("/api/login", "POST", {"usuario": USUARIO, "clave": CLAVE})
_, ses = pide("/api/sesion")
CSRF["v"] = (ses.get("sesion") or {}).get("csrf", "")
YO = (ses.get("sesion") or {}).get("personal_id")

print("1. No hay sede que configurar: el concepto ya no existe")
SEDE = (-11.9391, -77.0619)
_, d = pide("/api/asistencia/mias")
check("radio" not in d and "exigeUbicacion" not in d,
      "la API ya no habla de radio ni de exigir ubicación")

# Rostro de referencia: sin él la marca se para antes de llegar a la
# ubicación, y esta prueba no mide eso.
DESC = [0.01] * 128
# El aviso va PRIMERO: sin consentimiento vigente el rostro no se guarda,
# y hace bien — es un dato biométrico.
cod, _ = pide("/api/consentimiento/rostro", "POST", {"acepto": True})
print(f"   aviso aceptado: {cod}")
cod, _ = pide("/api/rostro-web", "POST",
              {"descriptor": DESC, "modelo": "prueba-lejos"})
print(f"   rostro de referencia: {cod}")

print("\n2. Una marca a 5 km ENTRA")
# 0.045 grados de latitud son unos 5 km. Muy fuera de 200 m.
cod, d = pide("/api/asistencia/marcar", "POST",
              {"descriptor": DESC, "modelo": "prueba-lejos",
               "lat": SEDE[0] + 0.045, "lon": SEDE[1], "precision": 9})
print(f"   respuesta {cod} · {json.dumps(d, ensure_ascii=False)[:150]}")
check(cod == 200, f"la marca entra aunque esté lejos ({cod})")
check(d.get("motivo") != "lejos", "y no se la rechaza por la distancia")

print("\n3. Queda con sus coordenadas y con el nombre del sitio")
fila = db.consultar(
    "SELECT lat, lon, lugar FROM marcas WHERE staff_number IN "
    "(SELECT staff_number FROM identidades WHERE personal_id = ?) "
    "ORDER BY id DESC LIMIT 1", (YO,))
print(f"   {dict(fila[0]) if fila else 'sin filas'}")
check(bool(fila) and fila[0]["lat"] is not None,
      "las coordenadas quedan guardadas")
check(bool(fila) and (fila[0]["lugar"] or "").strip(),
      f"y el NOMBRE del sitio ({(fila[0]['lugar'] if fila else '')!r})")

print("\n4. La lista del día le entrega el SITIO a RRHH")
import datetime
hoy = datetime.date.today().isoformat()
cod, d = pide(f"/api/asistencia?fecha={hoy}")
check("radio" not in d, "la lista ya no lleva radio")
con_sitio = [f for f in d.get("filas", []) if (f.get("lugar") or "").strip()]
print(f"   filas con nombre de sitio: {len(con_sitio)}")
check(len(con_sitio) >= 1, "y sí lleva el nombre del sitio")

print("\n5. Sin ubicación también entra")
db.ejecutar("UPDATE marcas SET hora = '06:30' WHERE staff_number IN "
            "(SELECT staff_number FROM identidades WHERE personal_id = ?)", (YO,))
cod, d = pide("/api/asistencia/marcar", "POST",
              {"descriptor": DESC, "modelo": "prueba-lejos"})
print(f"   respuesta {cod} · {json.dumps(d, ensure_ascii=False)[:120]}")
check(cod == 200, f"se marca sin coordenadas ({cod})")
check(d.get("motivo") != "sin_ubicacion", "y no se exige la ubicación")

print(f"\n  {len(fallos)} FALLOS" if fallos else "\n  MARCAR LEJOS OK")
sys.exit(1 if fallos else 0)
