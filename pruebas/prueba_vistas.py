# -*- coding: utf-8 -*-
"""
Las dos vistas de prueba, comparadas de verdad: qué ve cada una y qué le
niega la API.

Corre contra su propio servidor con LOGIN_ESTRICTO=1 y sobre una COPIA. En
convivencia no mediría nada: sin sesión se pasa con permisos completos.
"""
import os
import sys, os, shutil, json, subprocess, time, atexit, socket, pathlib
import http.cookiejar, urllib.request, urllib.error
sys.stdout.reconfigure(encoding="utf-8")

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(RAIZ, "backend"))

COPIA = os.path.join(AQUI, "rrhh_vistas.db")
shutil.copy2(os.path.join(RAIZ, "data", "rrhh.db"), COPIA)
os.environ["DB_PATH"] = COPIA

import config
config.DB_PATH = COPIA
import db, auth
db.config.DB_PATH = COPIA
db.iniciar()

fallos = []
def check(c, m):
    print(("  OK    " if c else "  FALLO ") + m)
    if not c: fallos.append(m)

PUERTO = 7806
CLAVE = "prueba-2026-rrhh"


class Cliente:
    def __init__(self):
        self.cj = http.cookiejar.CookieJar()
        self.op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.cj))
        self.csrf = ""

    def pide(self, ruta, metodo="GET", cuerpo=None):
        datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
        req = urllib.request.Request(f"http://127.0.0.1:{PUERTO}{ruta}", data=datos, method=metodo)
        req.add_header("Content-Type", "application/json")
        if self.csrf:
            req.add_header("X-CSRF-Token", self.csrf)
        try:
            with self.op.open(req, timeout=20) as r:
                return r.status, json.load(r)
        except urllib.error.HTTPError as e:
            try:
                return e.code, json.load(e)
            except Exception:
                return e.code, {}

    def entrar(self, usuario):
        c, d = self.pide("/api/login", "POST", {"usuario": usuario, "clave": CLAVE})
        if c == 200:
            self.csrf = d["sesion"]["csrf"]
        return c, d


# ── Las cuentas tienen que existir en la copia ───────────────────────────
# Las cuentas se crean AQUÍ, en la copia. Antes se daban por existentes
# porque alguien las había creado a mano en la base real; el borrado total
# se las llevó y la suite empezó a fallar sin que nada estuviera roto.
import crear_pruebas
# La clave va por el entorno: sin ella, crear() la pide por teclado y la
# suite se queda esperando para siempre sin decir por qué.
os.environ["CLAVE_PRUEBAS"] = CLAVE
crear_pruebas.crear()

print("1. Las dos cuentas de prueba existen")
for u in ("prueba.rrhh", "prueba.trabajador"):
    check(db.usuario_por_nombre(u) is not None, f"«{u}» está creada")
trab = db.usuario_por_nombre("prueba.trabajador")
check(trab and trab["rol"] == "trabajador", "la segunda tiene el rol Trabajador")

perm = db.permisos_rol(trab["rol_id"]) if trab else {}
abiertos = {m: n for m, n in perm.items() if n != "ninguno"}
print("   alcance del Trabajador: " + json.dumps(abiertos, ensure_ascii=False))
# 'permisos' salió del rol a propósito. Se le había dado para que pudiera
# PEDIR permisos, sin ver que ese mismo nivel autoriza a APROBARLOS: con él,
# un trabajador se firmaba sus propias vacaciones y leía las licencias
# médicas del equipo. El autoservicio no lo necesita — trabaja sobre la
# persona de la sesión— y lo que ese permiso abre es la bandeja de revisión.
check(set(abiertos) == {"asistencia"},
      "solo llega a asistencia")
check("permisos" not in abiertos,
      "NO tiene 'permisos': ese módulo es la bandeja de revisión, "
      "y con él podría aprobar sus propias solicitudes")
check("personal" not in abiertos,
      "NO tiene 'personal': con permisos por módulo eso le abriría el directorio entero")
check("dashboard" not in abiertos, "ni el Dashboard General, que es administrativo")
check("beneficiarios" not in abiertos, "ni las fichas de beneficiarios")

# ── El servidor estricto ─────────────────────────────────────────────────
entorno = dict(os.environ, PUERTO=str(PUERTO), DB_PATH=COPIA, LOGIN_ESTRICTO="1")
pr = subprocess.Popen([sys.executable, os.path.join(RAIZ, "backend", "app.py")],
                      env=entorno, cwd=RAIZ,
                      stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
atexit.register(pr.terminate)
for _ in range(50):
    time.sleep(0.4)
    try:
        socket.create_connection(("127.0.0.1", PUERTO), 0.5).close()
        break
    except OSError:
        pass

print("\n2. La cuenta RRHH entra y alcanza los módulos administrativos")
rrhh = Cliente()
c, d = rrhh.entrar("prueba.rrhh")
check(c == 200, f"entra ({c})")
for ruta, nombre in [("/api/personal", "el directorio"),
                     ("/api/beneficiarios", "los beneficiarios"),
                     ("/api/planillas", "planillas")]:
    cod, _ = rrhh.pide(ruta)
    check(cod == 200, f"RRHH alcanza {nombre} ({cod})")

print("\n3. La cuenta Trabajador entra pero NO ve a nadie más")
tra = Cliente()
c, d = tra.entrar("prueba.trabajador")
check(c == 200, f"entra ({c})")
for ruta, nombre in [("/api/personal", "el directorio del equipo"),
                     ("/api/beneficiarios", "las fichas de beneficiarios"),
                     ("/api/planillas", "las planillas"),
                     ("/api/usuarios", "la administración de usuarios"),
                     ("/api/accesos", "el registro de accesos")]:
    cod, _ = tra.pide(ruta)
    check(cod == 403, f"se le niega {nombre} ({cod})")

cod, _ = tra.pide("/api/asistencia?fecha=2026-08-12")
check(cod == 200, f"pero sí alcanza su asistencia ({cod})")

print("\n4. Y no puede escribir donde solo mira")
cod, _ = tra.pide("/api/asistencia/sync", "POST", {})
check(cod == 403, f"sincronizar el terminal se le niega ({cod})")
cod, _ = tra.pide("/api/personal", "POST", {"nombre": "Zzz Colado"})
check(cod == 403, f"crear una ficha de personal, también ({cod})")

print("\n5. La base real no se tocó")
import sqlite3
real = sqlite3.connect(os.path.join(RAIZ, "data", "rrhh.db"))
n = real.execute("SELECT COUNT(*) FROM personal WHERE nombre = 'Zzz Colado'").fetchone()[0]
real.close()
check(n == 0, "nada de esta prueba llegó a la base real")

print("\n" + (f"  {len(fallos)} FALLOS" if fallos else "  VISTAS RRHH Y TRABAJADOR OK"))
for f in fallos: print("   -", f)
sys.exit(1 if fallos else 0)
