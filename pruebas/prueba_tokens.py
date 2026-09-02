# -*- coding: utf-8 -*-
"""El token de sesión ya no está en la base.

Tres cosas, y la tercera es la que importa:

  1. Entrar y usar la sesión sigue funcionando.
  2. En la base NO está el valor de la cookie: está su huella.
  3. Pegarse el valor que hay en la base NO deja entrar. Sin esto, «lo
     guardo hasheado» sería un adorno.

Y una cuarta: quien ya estaba dentro antes del cambio no se queda fuera.
"""
import hashlib
import http.cookiejar
import json
import os
import pathlib
import sqlite3
import sys
import urllib.request

sys.stdout.reconfigure(encoding="utf-8")
BASE = os.environ.get("URL_PRUEBAS", "http://127.0.0.1:7801")
USUARIO = os.environ.get("USUARIO_PRUEBAS", "banco.pruebas")
CLAVE = os.environ.get("CLAVE_PRUEBAS", "banco-de-pruebas-2026")
BD = os.environ.get("DB_PATH", "")

fallos = []


def check(cond, msg):
    print(("  OK    " if cond else "  FALLO ") + msg)
    if not cond:
        fallos.append(msg)


def cliente():
    tarro = http.cookiejar.CookieJar()
    return (urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(tarro)), tarro)


def pedir(op, ruta, datos=None, cookie=None):
    req = urllib.request.Request(BASE + ruta)
    if datos is not None:
        req.data = json.dumps(datos).encode("utf-8")
        req.add_header("Content-Type", "application/json")
    if cookie:
        req.add_header("Cookie", cookie)
    try:
        with op.open(req, timeout=20) as r:
            return r.status, json.loads(r.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode("utf-8") or "{}")
        except Exception:
            return e.code, {}


print("1. Entrar sigue funcionando")
op, tarro = cliente()
estado, _ = pedir(op, "/api/login", {"usuario": USUARIO, "clave": CLAVE})
check(estado == 200, f"el login responde 200 ({estado})")
galletas = {c.name: c.value for c in tarro}
token = next((v for k, v in galletas.items() if "ses" in k.lower()), "")
check(bool(token), "llegó la cookie de sesión")
estado, cuerpo = pedir(op, "/api/sesion")
check(estado == 200 and bool(cuerpo.get("sesion")), "y la sesión vale")

print("\n2. En la base está la huella, no el token")
con = sqlite3.connect(BD)
guardados = [f[0] for f in con.execute("SELECT token FROM sesiones_usuario")]
check(bool(guardados), f"hay {len(guardados)} sesión(es) guardadas")
check(token not in guardados, "el valor de la cookie NO aparece en la base")
huella = hashlib.sha256(token.encode()).hexdigest()
check(huella in guardados, "lo que hay es su huella SHA-256")
check(all(len(g) == 64 for g in guardados), "todas son huellas de 64 caracteres")

print("\n3. Lo que hay en la base no sirve para entrar")
op2, _ = cliente()
nombre = next(k for k in galletas if "ses" in k.lower())
estado, cuerpo = pedir(op2, "/api/sesion", cookie=f"{nombre}={huella}")
entra = bool((cuerpo or {}).get("sesion"))
print(f"   con la huella pegada como cookie: sesion={entra}")
check(not entra, "pegarse la huella no deja entrar")

print("\n4. Quien ya estaba dentro no se queda fuera")
# Una sesión "vieja": guardada en claro, como se hacía antes. Tras migrar,
# la misma cookie tiene que seguir valiendo.
viejo = "token-en-claro-de-antes-del-cambio-000001"
usuario_id = con.execute(
    "SELECT usuario_id FROM sesiones_usuario LIMIT 1").fetchone()[0]
con.execute("DELETE FROM sesiones_usuario WHERE token = ?", (viejo,))
con.execute(
    "INSERT INTO sesiones_usuario (token, usuario_id, csrf) VALUES (?, ?, 'x')",
    (viejo, usuario_id))
con.commit()

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "backend"))
import auth                                        # noqa: E402
cambiados = auth.migrar_tokens()
print(f"   sesiones migradas: {cambiados}")
check(cambiados >= 1, "la migración convierte las que estaban en claro")

quedan = [f[0] for f in con.execute(
    "SELECT token FROM sesiones_usuario").fetchall()]
check(viejo not in quedan, "el token en claro ya no está")
check(hashlib.sha256(viejo.encode()).hexdigest() in quedan,
      "está su huella en su lugar")

op3, _ = cliente()
estado, cuerpo = pedir(op3, "/api/sesion", cookie=f"{nombre}={viejo}")
check(bool((cuerpo or {}).get("sesion")),
      "y la cookie de siempre sigue entrando")

print("\n" + ("FALLOS: " + str(len(fallos)) if fallos else "TOKENS EN HUELLA OK"))
for f in fallos:
    print("  - " + f)
sys.exit(1 if fallos else 0)
