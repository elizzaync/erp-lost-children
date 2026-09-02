# -*- coding: utf-8 -*-
"""Corregir lo ya escrito, en los siete sitios donde se puede escribir.

Antes solo se podía añadir o borrar. Borrar no es corregir: pierde cuándo
se registró y quién lo anotó, que en el expediente de un niño es
justamente lo que hay que poder demostrar.

Se comprueba contra la API, que es donde de verdad queda el dato: se crea
una fila, se corrige un campo y se vuelve a leer.
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


def check(cond, msg):
    print(("  OK    " if cond else "  FALLO ") + msg)
    if not cond:
        fallos.append(msg)


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


cod, _ = pide("/api/login", "POST", {"usuario": USUARIO, "clave": CLAVE})
_, ses = pide("/api/sesion")
CSRF["v"] = (ses.get("sesion") or {}).get("csrf", "")
print(f"entrada: {cod}")

print("\n1. Una persona y un niño para trabajar")
_, d = pide("/api/personal", "POST", {"nombre": "Zzz Corregir Persona",
                                      "cargo": "QA"})
PID = d.get("id") or (d.get("personal") or {}).get("id")
_, d = pide("/api/beneficiarios", "POST", {"nombre": "Zzz Corregir Nino"})
BID = d.get("id") or (d.get("beneficiario") or {}).get("id")
check(bool(PID and BID), f"fichas creadas (persona {PID}, niño {BID})")

CASOS = [
    # (rótulo, ruta de alta, cuerpo, ruta de listado, clave de la lista,
    #  campo a corregir, valor nuevo, tipo para el PUT)
    ("formación", f"/api/personal/{PID}/formacion",
     {"institucion": "Instituto Zzz", "carrera": "Enfermería",
      "anio_inicio": "2019"},
     f"/api/personal/{PID}/trayectoria", "formacion",
     "carrera", "Enfermería técnica", "formacion"),
    ("experiencia", f"/api/personal/{PID}/experiencia",
     {"empresa": "Zzz SAC", "cargo": "Auxilair"},
     f"/api/personal/{PID}/trayectoria", "experiencia",
     "cargo", "Auxiliar", "experiencia"),
    ("programa", f"/api/beneficiarios/{BID}/programas",
     {"programa": "Refuezo escolar", "fecha_ingreso": "2026-03-01"},
     f"/api/beneficiarios/{BID}/series", "programas",
     "programa", "Refuerzo escolar", "programas"),
    ("año escolar", f"/api/beneficiarios/{BID}/historial",
     {"anio": "2026", "institucion": "IE Zzz", "grado": "4to"},
     f"/api/beneficiarios/{BID}/series", "historial",
     "grado", "5to", "historial"),
    ("seguimiento", f"/api/beneficiarios/{BID}/seguimiento",
     {"fecha": "2026-08-01", "situacion": "Falta a clases"},
     f"/api/beneficiarios/{BID}/series", "seguimiento",
     "situacion", "Faltó dos días a clases", "seguimiento"),
    ("sesión", f"/api/beneficiarios/{BID}/sesiones",
     {"fecha": "2026-08-02", "tipo": "individual", "notas": "Prmera sesión"},
     f"/api/beneficiarios/{BID}/acompanamiento", "sesiones",
     "notas", "Primera sesión", "sesiones"),
    ("incidencia", f"/api/beneficiarios/{BID}/incidencias",
     {"fecha": "2026-08-03", "gravedad": "leve",
      "descripcion": "Se cayo en el patio"},
     f"/api/beneficiarios/{BID}/acompanamiento", "incidencias",
     "descripcion", "Se cayó en el patio", "incidencias"),
]

print("\n2. Crear, corregir y volver a leer")
for rot, alta, cuerpo, listado, clave, campo, nuevo, tipo in CASOS:
    cod, d = pide(alta, "POST", cuerpo)
    if cod != 200:
        check(False, f"{rot}: no se pudo crear ({cod} · {d.get('error','')[:60]})")
        continue
    cod, lista = pide(listado)
    filas = (lista.get(clave) or [])
    if not filas:
        check(False, f"{rot}: la lista vino vacía tras crear")
        continue
    fila = filas[-1]
    fid = fila.get("id")
    cod, d = pide(f"/api/{tipo}/{fid}", "PUT", {campo: nuevo})
    if cod != 200:
        check(False, f"{rot}: el servidor no aceptó la corrección "
                     f"({cod} · {d.get('error','')[:60]})")
        continue
    cod, lista = pide(listado)
    tras = next((f for f in (lista.get(clave) or []) if f.get("id") == fid), {})
    check(tras.get(campo) == nuevo,
          f"{rot}: «{cuerpo.get(campo, '')}» → «{nuevo}» "
          f"(quedó «{tras.get(campo)}»)")

print("\n3. La limpieza")
for ruta in (f"/api/beneficiarios/{BID}", f"/api/personal/{PID}"):
    pide(ruta, "DELETE")
_, d = pide("/api/personal")
queda = [p for p in (d.get("personal") or []) if p["nombre"].startswith("Zzz Corregir")]
check(not queda, "las fichas de prueba se retiran")

print("\n" + ("FALLOS: " + str(len(fallos)) if fallos else "CORREGIR OK"))
for f in fallos:
    print("  - " + f)
sys.exit(1 if fallos else 0)
