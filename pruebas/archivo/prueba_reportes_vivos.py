# -*- coding: utf-8 -*-
"""¿Responden los reportes de todos los módulos, y salen PDFs de verdad?

Un botón que descarga un archivo roto es peor que uno que no existe: se
descubre al abrirlo, normalmente delante de quien lo pidió.
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

req = urllib.request.Request(BASE + "/api/login",
    data=json.dumps({"usuario": USUARIO, "clave": CLAVE}).encode(),
    headers={"Content-Type": "application/json"})
with op.open(req, timeout=20) as r:
    print("login:", r.status)

MODULOS = ["personal", "beneficiarios", "responsables", "permisos",
           "asistencia", "usuarios", "respuestas"]

fallos = []
print()
print("  módulo          estado  tipo                 tamaño   PDF válido")
for m in MODULOS:
    ruta = f"/api/reportes/{m}.pdf"
    try:
        with op.open(BASE + ruta, timeout=60) as r:
            datos = r.read()
            cod, tipo = r.status, r.headers.get("Content-Type", "")
    except urllib.error.HTTPError as e:
        datos, cod, tipo = e.read(), e.code, e.headers.get("Content-Type", "")
    ok_pdf = datos[:5] == b"%PDF-" and datos.rstrip()[-5:] == b"%%EOF"
    print(f"  {m:14}  {cod:>5}  {tipo[:20]:20} {len(datos):>7}   {'sí' if ok_pdf else 'NO'}")
    if cod != 200 or not ok_pdf:
        fallos.append(f"{m} (estado {cod}, pdf {'sí' if ok_pdf else 'no'})")
        if cod != 200:
            try:
                print("       " + json.loads(datos).get("error", "")[:90])
            except Exception:
                pass

print()
print("FALLOS: " + (", ".join(fallos) if fallos else "ninguno"))
sys.exit(1 if fallos else 0)
