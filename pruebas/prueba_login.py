# -*- coding: utf-8 -*-
"""
La interfaz de la Fase 2, probada en un navegador de verdad.

Levanta DOS servidores sobre una COPIA de la base —uno en convivencia y
otro estricto— y conduce la pantalla con CDP. La base real no se toca.

Lo que mide:
  · convivencia: se ve el aviso y la puerta de "Entrar sin cuenta"
  · estricto: esa puerta NO existe, y una contraseña mala no entra
  · login real, con la sesión reflejada en el pie de la barra
  · el menú esconde lo que el cargo no alcanza
  · en 'solo ver' no aparecen los botones de crear
  · el cambio de contraseña obligatorio corta el paso
"""
import os
import sys, os, shutil, json, subprocess, time, atexit, socket
sys.stdout.reconfigure(encoding="utf-8")

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(RAIZ, "backend"))

COPIA = os.path.join(AQUI, "rrhh_login.db")
# Foto del estado real ANTES de nada; al final se comprueba que no cambió.
import sqlite3 as _sq
_r = _sq.connect(os.path.join(RAIZ, "data", "rrhh.db"))
ANTES_US = _r.execute("SELECT COUNT(*) FROM usuarios").fetchone()[0]
ANTES_RO = _r.execute("SELECT COUNT(*) FROM roles").fetchone()[0]
_r.close()
shutil.copy2(os.path.join(RAIZ, "data", "rrhh.db"), COPIA)

import config
config.DB_PATH = COPIA
import db, auth, crear_director
db.config.DB_PATH = COPIA
db.iniciar()

fallos = []
def check(c, m):
    print(("  OK    " if c else "  FALLO ") + m)
    if not c: fallos.append(m)

# ── Datos de prueba, en la COPIA ─────────────────────────────────────────
crear_director._asegurar_roles()
rol_dir = db.rol_por_clave("director")

# Un cargo que solo llega a Asistencia, y solo para mirar.
rid = db.crear_rol("Voluntario Prueba", "voluntario_prueba", "solo mira asistencia")
db.guardar_permisos_rol(rid, {"dashboard": "vista", "asistencia": "vista",
                              "personal": "vista"})

# La copia hereda la base vacía, así que la prueba se abastece sola: tres
# fichas, una por cada cuenta que va a crear.
while len(db.personal_sin_usuario()) < 3:
    _n = len(db.personal_sin_usuario()) + 1
    db.crear_personal({"nombre": f"Zzz Cuenta {_n}", "cargo": "Prueba",
                       "area": "Prueba"})
gente = db.personal_sin_usuario()
db.crear_usuario(gente[0]["id"], "zzdir", auth.hashear("clave-de-prueba"),
                 rol_dir["id"], debe_cambiar=0)
db.crear_usuario(gente[1]["id"], "zzvol", auth.hashear("clave-de-prueba"),
                 rid, debe_cambiar=0)
# Este entra con una clave que le pusieron: tiene que topar con el cambio.
db.crear_usuario(gente[2]["id"], "zznuevo", auth.hashear("clave-de-prueba"),
                 rid, debe_cambiar=1)
NOMBRE_DIR = db.usuario_por_nombre("zzdir")["personal_id"]
NOMBRE_DIR = db.persona_personal(NOMBRE_DIR)["nombre"]
print(f"copia lista · Director de prueba: {NOMBRE_DIR}\n")

# ── Dos servidores sobre la copia ────────────────────────────────────────
def arrancar(puerto, estricto):
    entorno = dict(os.environ, PUERTO=str(puerto), DB_PATH=COPIA,
                   LOGIN_ESTRICTO="1" if estricto else "0")
    pr = subprocess.Popen([sys.executable, os.path.join(RAIZ, "backend", "app.py")],
                          env=entorno, cwd=RAIZ,
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    atexit.register(pr.terminate)
    for _ in range(50):
        time.sleep(0.4)
        try:
            with socket.create_connection(("127.0.0.1", puerto), 0.5):
                return pr
        except OSError:
            pass
    raise SystemExit(f"el servidor del puerto {puerto} no arrancó")

arrancar(7803, False)   # convivencia
arrancar(7804, True)    # estricto
print("servidores en 7803 (convivencia) y 7804 (estricto)\n")

# ── El navegador ─────────────────────────────────────────────────────────
r = subprocess.run(["node", os.path.join(AQUI, "prueba_login.js")],
                   capture_output=True, text=True, encoding="utf-8", timeout=300)
print(r.stdout)
if r.returncode != 0:
    print(r.stderr[-3000:])
    fallos.append("el guion del navegador falló")

# ── La base real, intacta ────────────────────────────────────────────────
import sqlite3
real = sqlite3.connect(os.path.join(RAIZ, "data", "rrhh.db"))
n_us = real.execute("SELECT COUNT(*) FROM usuarios").fetchone()[0]
n_ro = real.execute("SELECT COUNT(*) FROM roles").fetchone()[0]
real.close()
print("")
print(f"base REAL: usuarios={n_us} (antes {ANTES_US}) · roles={n_ro} (antes {ANTES_RO})")
# Antes se exigía que estuviera VACÍA. Dejó de valer en cuanto el equipo
# creó su primera cuenta de verdad: lo que se prueba es que esta suite no
# la toca, no que no haya nadie dentro.
check(n_us == ANTES_US and n_ro == ANTES_RO, "la base real quedó sin tocar")

print("\n" + (f"  {len(fallos)} FALLOS" if fallos else "  INTERFAZ FASE 2 OK"))
for f in fallos: print("   -", f)
sys.exit(1 if fallos else 0)
