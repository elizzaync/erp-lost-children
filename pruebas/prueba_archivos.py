# -*- coding: utf-8 -*-
"""Subida, descarga y borrado de adjuntos, contra el servidor real."""
import os
import sys, os, json, io, urllib.request, urllib.error, uuid
sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend"))

import os as _os
# El 7801 es del equipo y ninguna prueba lo toca. Esta hablaba con él
# directamente: escribía archivos en la base real. Ahora va al banco.
B = _os.environ.get("URL_PRUEBAS") or "http://127.0.0.1:7802"
fallos = []
def check(c, m):
    print(("  OK    " if c else "  FALLO ") + m)
    if not c: fallos.append(m)

# ── Sesión ────────────────────────────────────────────────────────────────
# Con login obligatorio, un visitante no ve ni la lista de personal. Esta
# prueba es anterior a eso: se le añade la cookie de sesión y el token que
# el servidor exige en todo lo que cambia datos.
import http.cookiejar  # noqa: E402

_TARRO = http.cookiejar.CookieJar()
_OP = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(_TARRO))
_CSRF = {"v": ""}


def pide(ruta, metodo="GET", cuerpo=None):
    cabeceras = {"Content-Type": "application/json"}
    if metodo in ("POST", "PUT", "PATCH", "DELETE") and _CSRF["v"]:
        cabeceras["X-CSRF-Token"] = _CSRF["v"]
    req = urllib.request.Request(B + ruta, method=metodo,
        data=json.dumps(cuerpo).encode() if cuerpo is not None else None,
        headers=cabeceras)
    try:
        with _OP.open(req, timeout=15) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        try: return e.code, json.load(e)
        except Exception: return e.code, {}


def _entrar():
    u = os.environ.get("USUARIO_PRUEBAS", "banco.pruebas")
    k = os.environ.get("CLAVE_PRUEBAS", "banco-de-pruebas-2026")
    cod, _ = pide("/api/login", "POST", {"usuario": u, "clave": k})
    if cod != 200:
        raise SystemExit(f"no se pudo entrar como {u}: {cod}")
    _, ses = pide("/api/sesion")
    _CSRF["v"] = (ses.get("sesion") or {}).get("csrf", "")
    print(f"identificada como {u}")

def sube(ruta, campos, nombre_archivo, contenido, metodo="POST"):
    """multipart/form-data a mano, sin dependencias."""
    lim = "----" + uuid.uuid4().hex
    cuerpo = b""
    for k, v in campos.items():
        cuerpo += (f"--{lim}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n").encode()
    if nombre_archivo is not None:
        cuerpo += (f"--{lim}\r\nContent-Disposition: form-data; name=\"archivo\"; "
                   f"filename=\"{nombre_archivo}\"\r\n"
                   f"Content-Type: application/octet-stream\r\n\r\n").encode()
        cuerpo += contenido + b"\r\n"
    cuerpo += f"--{lim}--\r\n".encode()
    # La subida también cambia datos: va con cookie y con token, como el
    # resto. Sin esto el servidor la rechaza y la prueba lo leía como que
    # subir archivos estaba roto.
    cabeceras = {"Content-Type": f"multipart/form-data; boundary={lim}"}
    if _CSRF["v"]:
        cabeceras["X-CSRF-Token"] = _CSRF["v"]
    req = urllib.request.Request(B + ruta, data=cuerpo, method=metodo,
        headers=cabeceras)
    try:
        with _OP.open(req, timeout=30) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        try: return e.code, json.load(e)
        except Exception: return e.code, {}

def bruto(ruta):
    # Con la sesión: descargar un adjunto exige estar identificado, que es
    # lo correcto — son documentos de personas.
    try:
        with _OP.open(B + ruta, timeout=15) as r:
            return r.status, r.read(), dict(r.headers)
    except urllib.error.HTTPError as e:
        return e.code, b"", {}

# Persona de prueba. Primero se barren las de tandas anteriores: crear otra
# con el mismo nombre dejaba un duplicado que la limpieza final no tocaba,
# porque solo borra la que ella misma creó.
_entrar()
_, _pers = pide("/api/personal")
for _p in _pers.get("personal", []):
    if _p["nombre"] == "Zzz Archivo Prueba":
        pide(f"/api/personal/{_p['id']}", "DELETE")
_, d = pide("/api/personal", "POST", {"nombre": "Zzz Archivo Prueba", "cargo": "QA"})
PID = d.get("id") or d.get("personal", {}).get("id")
if not PID:
    _, dd = pide("/api/personal")
    PID = [p for p in dd["personal"] if p["nombre"] == "Zzz Archivo Prueba"][0]["id"]
print(f"persona de prueba: id {PID}")

# La carpeta puede tener adjuntos legítimos de antes de esta prueba: todo se
# cuenta contra ese punto de partida, no contra cero. Exigir la carpeta
# vacía hacía fallar la prueba por datos que no son suyos.
import config as _cfg
os.makedirs(_cfg.ARCHIVOS_DIR, exist_ok=True)
BASE_ARCHIVOS = set(os.listdir(_cfg.ARCHIVOS_DIR))
mios = lambda: sorted(set(os.listdir(_cfg.ARCHIVOS_DIR)) - BASE_ARCHIVOS)
print(f"adjuntos ya presentes al empezar: {len(BASE_ARCHIVOS)}\n")

PDF = b"%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n"

print("1. Subir un PDF real junto con los metadatos")
c, r = sube(f"/api/personal/{PID}/documentos",
            {"tipo": "documento", "nombre": "Copia de DNI", "vence": "2027-01-31"},
            "dni escaneado.pdf", PDF)
check(c == 200, "acepta la subida")
doc = r.get("documento", {})
DOC_ID = doc.get("id")
print(f"   guardado como {doc.get('archivo')!r} · original {doc.get('archivo_nombre')!r} "
      f"· {doc.get('archivo_mime')} · {doc.get('archivo_tam')} bytes")
check(bool(doc.get("archivo")), "guarda un nombre interno")
check(doc.get("archivo") != "dni escaneado.pdf", "NO usa el nombre que subió el usuario")
check(doc.get("archivo_nombre") == "dni escaneado.pdf", "conserva el nombre original para descargar")
check(doc.get("archivo_mime") == "application/pdf", "detecta el tipo")
check(doc.get("archivo_tam") == len(PDF), "guarda el tamaño real")
check(doc.get("vence") == "2027-01-31", "los metadatos se guardaron igual")

print("\n2. Descargarlo devuelve el archivo intacto")
c, datos, cab = bruto(f"/api/documentos/{DOC_ID}/archivo")
check(c == 200, "responde 200")
check(datos == PDF, "el contenido es byte a byte el que se subió")
print(f"   Content-Type: {cab.get('Content-Type')}")
check("pdf" in (cab.get("Content-Type") or ""), "lo sirve como PDF")

print("\n3. El archivo está en disco, con nombre generado")
import config
ruta = os.path.join(config.ARCHIVOS_DIR, doc["archivo"])
check(os.path.isfile(ruta), "existe en data/archivos/")
check(doc["archivo"].endswith(".pdf"), "conserva la extensión")
check(len(doc["archivo"]) > 30, "el nombre interno es un identificador, no el original")

print("\n4. Registrar SIN archivo sigue permitido")
c, r = pide(f"/api/personal/{PID}/documentos", "POST",
            {"tipo": "documento", "nombre": "Certificado pendiente de escanear", "vence": "2027-06-30"})
check(c == 200, "acepta solo metadatos")
SIN_ID = r["documento"]["id"]
check(not r["documento"]["archivo"], "queda sin adjunto")

print("\n5. Adjuntar después a un registro que ya existía")
c, r = sube(f"/api/documentos/{SIN_ID}/archivo", {}, "constancia.png", b"\x89PNG\r\n\x1a\n" + b"x" * 50)
check(c == 200, "acepta el adjunto tardío")
check(r["documento"]["archivo_mime"] == "image/png", "detecta que es una imagen")

print("\n6. Reemplazar el archivo borra el anterior del disco")
antes = r["documento"]["archivo"]
c, r2 = sube(f"/api/documentos/{SIN_ID}/archivo", {}, "constancia v2.png", b"\x89PNG\r\n\x1a\n" + b"y" * 60)
nuevo = r2["documento"]["archivo"]
check(nuevo != antes, "el nombre interno cambia")
check(not os.path.isfile(os.path.join(config.ARCHIVOS_DIR, antes)), "el anterior ya no está en disco")

print("\n7. Lo que no se debe aceptar")
for nombre, contenido, motivo in [
        ("virus.exe", b"MZ", "ejecutable"),
        ("script.js", b"alert(1)", "javascript"),
        ("sinextension", b"abc", "sin extensión"),
        ("vacio.pdf", b"", "archivo vacío")]:
    c, r = sube(f"/api/personal/{PID}/documentos",
                {"tipo": "documento", "nombre": "Intento " + motivo}, nombre, contenido)
    print(f"   {motivo:15} -> {c} {str(r.get('error',''))[:56]}")
    check(c == 400, f"rechaza {motivo}")

c, r = sube(f"/api/personal/{PID}/documentos",
            {"tipo": "documento", "nombre": "Demasiado grande"},
            "enorme.pdf", b"%PDF" + b"z" * (16 * 1024 * 1024))
print(f"   {'16 MB':15} -> {c} {str(r.get('error',''))[:56]}")
check(c == 400, "rechaza lo que pasa del tope de 15 MB")

print("\n8. Un rechazo no deja basura en disco")
n = len(mios())
print(f"   archivos creados por esta prueba: {n}")
check(n == 2, "solo quedan los 2 adjuntos válidos")

print("\n9. Quitar el adjunto conserva el registro")
c, r = pide(f"/api/documentos/{SIN_ID}/archivo", "DELETE")
check(c == 200, "quita el adjunto")
check(not r["documento"]["archivo"], "el registro se queda sin archivo")
check(r["documento"]["vence"] == "2027-06-30", "pero conserva su vencimiento")
check(not os.path.isfile(os.path.join(config.ARCHIVOS_DIR, nuevo)), "y el archivo se fue del disco")

print("\n10. Borrar el documento se lleva su archivo")
c, _ = pide(f"/api/documentos/{DOC_ID}", "DELETE")
check(c == 200, "borra el documento")
check(not os.path.isfile(ruta), "el archivo ya no está en disco")
c, _, _ = bruto(f"/api/documentos/{DOC_ID}/archivo")
check(c == 404, "descargarlo ahora da 404")

print("\n11. Descargar algo sin adjunto da un error claro")
c, r = pide(f"/api/personal/{PID}/documentos", "POST", {"tipo": "contrato", "nombre": "Sin archivo"})
c2, _, _ = bruto(f"/api/documentos/{r['documento']['id']}/archivo")
check(c2 == 404, "404 en vez de romperse")

print("\n12. Alta de beneficiario: tabla y campos propios")
c, r = pide("/api/beneficiarios", "POST", {
    "nombre": "Zzz Nino Prueba", "documento": "12345678", "fecha_nac": "2015-03-12",
    "casa": "Casa Lima", "sala": "Sala A", "grado": "5.º primaria", "anio_ingreso": "2022"})
check(c == 200, "crea el beneficiario")
b = [x for x in r["beneficiarios"] if x["nombre"] == "Zzz Nino Prueba"]
check(len(b) == 1, "queda en la tabla 'beneficiarios'")
if b:
    print("   " + json.dumps({k: b[0][k] for k in ("nombre","casa","sala","grado","anio_ingreso")}, ensure_ascii=False))
    check(b[0]["casa"] == "Casa Lima" and b[0]["grado"] == "5.º primaria", "guarda los campos de un niño")
_, pers = pide("/api/personal")
check(not any(p["nombre"] == "Zzz Nino Prueba" for p in pers["personal"]),
      "NO se coló en 'personal'")

print("\n13. Validaciones del beneficiario")
for cuerpo, motivo in [({}, "sin nombre"),
                       ({"nombre": "X", "fecha_nac": "12/03/2015"}, "fecha mal formada"),
                       ({"nombre": "X", "fecha_nac": "2030-01-01"}, "nacimiento futuro"),
                       ({"nombre": "X", "anio_ingreso": "abcd"}, "año no numérico")]:
    c, r = pide("/api/beneficiarios", "POST", cuerpo)
    print(f"   {motivo:20} -> {c} {str(r.get('error',''))[:50]}")
    check(c == 400, f"rechaza {motivo}")

print("\n14. Borrar la persona se lleva sus archivos del disco")
# Se deja un adjunto VIVO a propósito: si a estas alturas no quedara
# ninguno, la comprobación pasaría sin comprobar nada.
c, r = sube(f"/api/personal/{PID}/documentos",
            {"tipo": "documento", "nombre": "Queda colgando"}, "suelto.pdf", PDF)
colgante = os.path.join(config.ARCHIVOS_DIR, r["documento"]["archivo"])
check(os.path.isfile(colgante), "el adjunto existe antes de borrar la ficha")
pide(f"/api/personal/{PID}", "DELETE")
check(not os.path.isfile(colgante),
      "al borrar la ficha, su archivo desaparece del disco (la cascada de "
      "SQLite no llega ahí)")

print("\n15. Limpieza")
import db
db.ejecutar("DELETE FROM beneficiarios WHERE nombre = ?", ("Zzz Nino Prueba",))
_, pers = pide("/api/personal")
check(not any(p["nombre"] == "Zzz Archivo Prueba" for p in pers["personal"]), "persona de prueba eliminada")
sobran = mios()
print(f"   archivos de la prueba que quedan: {len(sobran)} {sobran}")
check(len(sobran) == 0, "la prueba no dejó basura en data/archivos/")

print("\n" + (f"  {len(fallos)} FALLOS" if fallos else "  ARCHIVOS Y BENEFICIARIOS OK"))
for f in fallos: print("   -", f)
sys.exit(1 if fallos else 0)
