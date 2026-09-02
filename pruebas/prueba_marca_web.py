# -*- coding: utf-8 -*-
"""
El canal web, atacado por la API con LOGIN_ESTRICTO=1 y sobre una COPIA.

Lo que de verdad importa probar:
  · sin consentimiento NO se guarda ningún descriptor
  · el descriptor de otro modelo se rechaza en vez de compararse a ciegas
  · un rostro que no coincide no marca
  · nadie puede marcar por otra persona pasando un id
  · la marca cae en la misma tabla, con canal='web'
"""
import os
import sys, os, shutil, json, subprocess, time, atexit, socket, random
import http.cookiejar, urllib.request, urllib.error
sys.stdout.reconfigure(encoding="utf-8")

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(RAIZ, "backend"))

COPIA = os.path.join(AQUI, "rrhh_web.db")
# Cuántos rostros hay en la base REAL antes de empezar. Al final se
# comprueba que siguen siendo los mismos. La invariante NO es «cero»: desde
# el 26/08 hay gente registrada de verdad, y darlo por vacío convertía un
# uso legítimo del sistema en un fallo de las pruebas.
import sqlite3 as _sq
_r = _sq.connect(os.path.join(RAIZ, "data", "rrhh.db"))
ANTES_ROSTROS = _r.execute("SELECT COUNT(*) FROM rostros_web").fetchone()[0]
_r.close()

shutil.copy2(os.path.join(RAIZ, "data", "rrhh.db"), COPIA)
os.environ["DB_PATH"] = COPIA

import config
config.DB_PATH = COPIA
import db, auth, crear_director
db.config.DB_PATH = COPIA
db.iniciar()

fallos = []
def check(c, m):
    print(("  OK    " if c else "  FALLO ") + m)
    if not c: fallos.append(m)

PUERTO = 7807
CLAVE = "clave-de-prueba-web"
DIM = config.ROSTRO_WEB_DIMENSION


def vector(semilla, ruido=0.0):
    r = random.Random(semilla)
    v = [r.uniform(-1, 1) for _ in range(DIM)]
    if ruido:
        v = [x + r.uniform(-ruido, ruido) for x in v]
    return v


# ── Dos trabajadores en la copia ─────────────────────────────────────────
crear_director._asegurar_roles()
rid = db.crear_rol("Trabajador Web", "trabajador_web", "prueba")
db.guardar_permisos_rol(rid, {"asistencia": "vista", "permisos": "edicion"})

p1 = db.crear_personal({"nombre": "Zzz Web Uno", "cargo": "Prueba"})
p2 = db.crear_personal({"nombre": "Zzz Web Dos", "cargo": "Prueba"})
db.crear_identidad(9601, "personal", p1, "facial")
db.actualizar_identidad(9601, "enrolado", rostro=1)
db.crear_usuario(p1, "zzweb1", auth.hashear(CLAVE), rid, debe_cambiar=0)
db.crear_usuario(p2, "zzweb2", auth.hashear(CLAVE), rid, debe_cambiar=0)
print(f"copia lista · personal {p1} y {p2}\n")


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


entorno = dict(os.environ, PUERTO=str(PUERTO), DB_PATH=COPIA, LOGIN_ESTRICTO="1")
pr = subprocess.Popen([sys.executable, os.path.join(RAIZ, "backend", "app.py")],
                      env=entorno, cwd=RAIZ,
                      stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
atexit.register(pr.terminate)
for _ in range(50):
    time.sleep(0.4)
    try:
        socket.create_connection(("127.0.0.1", PUERTO), 0.5).close(); break
    except OSError:
        pass

uno = Cliente()
c, _ = uno.entrar("zzweb1")
check(c == 200, f"el trabajador entra ({c})")

print("\n1. Sin sesión no hay autoservicio")
anon = Cliente()
cod, d = anon.pide("/api/consentimiento/rostro")
check(cod == 401 and d.get("motivo") == "sin_sesion",
      f"el consentimiento exige sesión ({cod})")
cod, _ = anon.pide("/api/asistencia/marcar", "POST", {"descriptor": vector(1)})
check(cod == 401, f"y marcar también ({cod})")

print("\n2. El consentimiento se ofrece antes de nada")
cod, d = uno.pide("/api/consentimiento/rostro")
check(cod == 200, "se puede leer el aviso")
check(d.get("aceptado") is False, "todavía no lo aceptó")
check(len(d.get("texto") or "") > 300, "el texto viene completo, no un resumen")
# Empieza frase, así que va con mayúscula: la comparación ignora el caso.
check("no es una fotograf" in (d.get("texto") or "").lower(),
      "y dice explícitamente que no se guarda una foto")
# El texto viene con saltos de línea, y "se / descarta" cae partido en dos:
# se normalizan los espacios antes de buscar.
_plano = " ".join((d.get("texto") or "").lower().split())
check("se descarta" in _plano,
      "y que la imagen se descarta en el propio teléfono")
check("no llega al servidor" in _plano, "y que no llega al servidor")
check(d.get("version") == config.CONSENTIMIENTO_ROSTRO_VERSION,
      "con su versión, para saber a qué redacción dijo sí")

print("\n3. SIN consentimiento no se guarda ningún descriptor")
cod, d = uno.pide("/api/rostro-web", "POST",
                  {"descriptor": vector(1), "modelo": "prueba-v1"})
check(cod == 403 and d.get("motivo") == "sin_consentimiento",
      f"se rechaza el enrolamiento ({cod} · {d.get('motivo')})")
check(db.rostro_web(p1) is None, "y en la base no quedó nada")

print("\n4. Se acepta el aviso")
cod, _ = uno.pide("/api/consentimiento/rostro", "POST", {"acepto": True})
check(cod == 200, "queda registrado")
guardado = db.consentimiento_vigente(p1, "rostro_web")
check(guardado is not None, "hay consentimiento vigente")
check(guardado["texto"] == config.CONSENTIMIENTO_ROSTRO_TEXTO,
      "con una copia del texto exacto que leyó")
check((guardado["ip"] or "") != "", "y con la IP desde la que aceptó")

print("\n5. Ahora sí se registra el rostro")
REF = vector(42)
cod, _ = uno.pide("/api/rostro-web", "POST", {"descriptor": REF, "modelo": "prueba-v1"})
check(cod == 200, "el descriptor se guarda")
r = db.rostro_web(p1)
check(r is not None and r["dimension"] == DIM, "con su longitud")
check("foto" not in json.dumps(dict(r)).lower(), "y sin ninguna imagen dentro")

print("\n6. Un descriptor de otro modelo se rechaza, no se compara a ciegas")
cod, d = uno.pide("/api/rostro-web", "POST",
                  {"descriptor": vector(7)[:64], "modelo": "otro"})
check(cod == 400 and "otro modelo" in (d.get("error") or ""),
      f"avisa de la longitud distinta ({cod})")

print("\n7. Marcar con un rostro que NO coincide")
cod, d = uno.pide("/api/asistencia/marcar", "POST",
                  {"descriptor": vector(999), "modelo": "prueba-v1",
                   "lat": -11.9391, "lon": -77.0619, "precision": 9})
check(cod == 401 and d.get("motivo") == "no_coincide",
      f"no marca ({cod} · distancia {d.get('distancia')})")

print("\n8. Marcar con el rostro correcto")
casi = [x + 0.001 for x in REF]        # el mismo rostro, con ruido mínimo
cod, d = uno.pide("/api/asistencia/marcar", "POST",
                  {"descriptor": casi, "modelo": "prueba-v1",
                   "lat": -11.9391, "lon": -77.0619, "precision": 9})
check(cod == 200, f"marca ({cod})")
# La respuesta de /marcar no repite el canal; se comprueba abajo, en
# la tabla, que es donde importa.
filas = db.consultar("SELECT * FROM marcas WHERE staff_number = 9601")
check(len(filas) == 1, f"queda UNA marca en la misma tabla ({len(filas)})")
check(filas[0]["canal"] == "web", "marcada como canal 'web'")
check(filas[0]["metodo"] == "facial", "y método facial")

print("\n9. El segundo toque es la SALIDA, no un duplicado")
# Un doble toque en el mismo minuto NO deja dos marcas: la tabla lo impide
# y el servidor lo dice sin drama.
cod, d = uno.pide("/api/asistencia/marcar", "POST",
                  {"descriptor": casi, "modelo": "prueba-v1",
                   "lat": -11.9391, "lon": -77.0619, "precision": 9})
check(cod == 200 and d.get("repetida") is True,
      f"el doble toque no duplica ({cod} · repetida={d.get('repetida')})")
check(len(db.consultar("SELECT * FROM marcas WHERE staff_number = 9601")) == 1,
      "sigue habiendo una sola")

# Un minuto después sí es otra marca: la salida. Se atrasa la entrada en
# vez de esperar de verdad.
db.ejecutar("UPDATE marcas SET hora = '07:00' WHERE staff_number = 9601")
cod, d = uno.pide("/api/asistencia/marcar", "POST",
                  {"descriptor": casi, "modelo": "prueba-v1",
                   "lat": -11.9391, "lon": -77.0619, "precision": 9})
check(cod == 200, f"la segunda marca entra, y es la salida ({cod})")
_dos = db.consultar("SELECT * FROM marcas WHERE staff_number = 9601")
check(len(_dos) == 2, f"quedan dos: entrada y salida ({len(_dos)})")
# Y la tercera no: una entrada y una salida al día, nada más.
cod, d = uno.pide("/api/asistencia/marcar", "POST",
                  {"descriptor": casi, "modelo": "prueba-v1",
                   "lat": -11.9391, "lon": -77.0619, "precision": 9})
check(cod == 409 and d.get("motivo") == "completo",
      f"la tercera se rechaza ({cod} · {d.get('motivo')})")
check(len(db.consultar("SELECT * FROM marcas WHERE staff_number = 9601")) == 2,
      "y siguen siendo dos")

print("\n10. Nadie puede marcar por otra persona")
dos = Cliente()
dos.entrar("zzweb2")
# zzweb2 no tiene rostro ni consentimiento: intenta pasar el id del otro
cod, d = dos.pide("/api/asistencia/marcar", "POST",
                  {"descriptor": casi, "personal_id": p1, "staff_number": 9601})
# Se le para por no tener rostro suyo, que es lo correcto: el servidor
# mira SU sesión, no el id que venga en el cuerpo. Lo que importa es que no
# aparezca una marca en la ficha del otro.
check(cod in (403, 409) and d.get("motivo") in ("sin_rostro", "sin_consentimiento"),
      f"el personal_id del cuerpo se ignora ({cod} · {d.get('motivo')})")
check(len(db.consultar("SELECT * FROM marcas WHERE staff_number = 9601")) == 2,
      "y no apareció ninguna marca extra en la ficha del otro")

print("\n11. Retirar el permiso borra el rostro y conserva la constancia")
cod, _ = uno.pide("/api/consentimiento/rostro", "DELETE")
check(cod == 200, "se puede revocar")
check(db.rostro_web(p1) is None, "el descriptor se elimina")
hist = db.consentimientos_de(p1, "rostro_web")
check(len(hist) >= 1, f"pero el histórico se conserva ({len(hist)} registro(s))")
check(db.consentimiento_vigente(p1, "rostro_web") is None, "y ya no hay vigente")
# Se limpian sus marcas del día: si no, el tope de dos por día le pararía
# antes y la prueba no llegaría a comprobar lo que quiere comprobar.
db.ejecutar("DELETE FROM marcas WHERE staff_number = 9601")
cod, d = uno.pide("/api/asistencia/marcar", "POST",
                  {"descriptor": casi, "modelo": "prueba-v1",
                   "lat": -11.9391, "lon": -77.0619, "precision": 9})
check(cod in (403, 409) and d.get("motivo") == "sin_rostro",
      f"sin permiso ya no se puede marcar ({cod} · {d.get('motivo')})")

# Aquí se comprobaba GET /api/rostro-web/pendientes, la lista de quién
# no había registrado su rostro para el celular. Esa puerta y su bloque
# de pantalla se retiraron el 31/08/2026: marcar en el terminal o por el
# celular es una elección de cada quien, no un trámite pendiente, y la
# lista lo presentaba como una falta.

print("\n13. La base real no se tocó")
import sqlite3
real = sqlite3.connect(os.path.join(RAIZ, "data", "rrhh.db"))
n = real.execute("SELECT COUNT(*) FROM rostros_web").fetchone()[0]
real.close()
check(n == ANTES_ROSTROS,
      f"los rostros de la base real siguen igual ({ANTES_ROSTROS} → {n})")

print("\n" + (f"  {len(fallos)} FALLOS" if fallos else "  CANAL WEB OK"))
for f in fallos: print("   -", f)
sys.exit(1 if fallos else 0)
