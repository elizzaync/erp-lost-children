# -*- coding: utf-8 -*-
"""
Los permisos se aplican en el BACKEND, no escondiendo botones.

Esta prueba llama a la API directamente, saltándose la interfaz por
completo: es exactamente lo que haría alguien que quisiera pasar por
encima de los permisos. Si el sistema solo escondiera botones, todo esto
devolvería 200.

Corre contra el servidor real, con LOGIN_ESTRICTO forzado a True para
probar el estado final; al terminar lo deja como estaba.
"""
import os
import sys, os, json, http.cookiejar, urllib.request, urllib.error
sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend"))

PUERTO = 7802
B = f"http://127.0.0.1:{PUERTO}"
fallos = []
def check(c, m):
    print(("  OK    " if c else "  FALLO ") + m)
    if not c: fallos.append(m)


class Cliente:
    """Un navegador de mentira: guarda cookies y manda el token CSRF."""
    def __init__(self):
        self.cj = http.cookiejar.CookieJar()
        self.op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.cj))
        self.csrf = ""

    def pide(self, ruta, metodo="GET", cuerpo=None, con_csrf=True):
        datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
        req = urllib.request.Request(B + ruta, data=datos, method=metodo)
        req.add_header("Content-Type", "application/json")
        if con_csrf and self.csrf:
            req.add_header("X-CSRF-Token", self.csrf)
        try:
            with self.op.open(req, timeout=20) as r:
                return r.status, json.load(r)
        except urllib.error.HTTPError as e:
            try:
                return e.code, json.load(e)
            except Exception:
                return e.code, {}

    def entrar(self, usuario, clave):
        c, d = self.pide("/api/login", "POST", {"usuario": usuario, "clave": clave})
        if c == 200:
            self.csrf = d["sesion"]["csrf"]
        return c, d


import config, db, auth

# ── Preparar: rol restringido + dos usuarios de prueba ───────────────────
def limpiar():
    for u in db.usuarios():
        if u["usuario"].startswith("zz"):
            db.borrar_usuario(u["id"])
    for r in db.roles():
        if r["clave"].startswith("zz_"):
            db.borrar_rol(r["id"])
    for p in db.personal(incluir_inactivos=True):
        if p["nombre"].startswith("Zzz Permiso"):
            db.ejecutar("DELETE FROM personal WHERE id = ?", (p["id"],))

limpiar()
# Marca de dónde arranca el registro: al limpiar solo se borra lo que
# generó esta prueba. Borrarlo entero destruiría la auditoría real el día
# que existan cuentas de verdad, que es justo lo que no debe pasar.
_ACCESOS_ANTES = (db.consultar("SELECT MAX(id) AS m FROM accesos")[0]["m"] or 0)
_INTENTOS_ANTES = (db.consultar("SELECT MAX(id) AS m FROM intentos_login")[0]["m"] or 0)
import crear_director
crear_director._asegurar_roles()
rol_director = db.rol_por_clave(config.ROL_DIRECTOR)

# Rol restringido: ve beneficiarios pero NO incidencias ni planillas
rid = db.crear_rol("Zz Tutor Prueba", "zz_tutor_prueba", "Solo lectura de beneficiarios")
db.guardar_permisos_rol(rid, {"dashboard": "vista", "beneficiarios": "vista",
                              "sesiones": "vista"})

p1 = db.crear_personal({"nombre": "Zzz Permiso Tutor", "cargo": "Prueba"})
p2 = db.crear_personal({"nombre": "Zzz Permiso Jefe", "cargo": "Prueba"})
db.crear_usuario(p1, "zztutor", auth.hashear("clave-de-prueba"), rid, debe_cambiar=0)
db.crear_usuario(p2, "zzdir", auth.hashear("clave-de-prueba"), rol_director["id"],
                 debe_cambiar=0)

# La prueba arranca SU PROPIO servidor con LOGIN_ESTRICTO=1, en otro puerto.
# Contra el de convivencia no mediría nada: sin sesión se pasa con permisos
# completos, así que cerrar sesión daría MÁS acceso que estar dentro con un
# rol limitado. Lo que hay que probar es el estado final, el del corte.
import subprocess, time, atexit
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(config.__file__)))
entorno = dict(os.environ, LOGIN_ESTRICTO="1", PUERTO=str(PUERTO))
servidor = subprocess.Popen([sys.executable, os.path.join(RAIZ, "backend", "app.py")],
                            env=entorno, cwd=RAIZ,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
atexit.register(servidor.terminate)

listo = False
for _ in range(40):
    time.sleep(0.5)
    try:
        _c, _d = Cliente().pide("/api/sesion")
        if _c == 200:
            listo = _d.get("estricto") is True
            break
    except Exception:
        pass
print(f"servidor estricto en el puerto {PUERTO}: " + ("listo" if listo else "NO ARRANCO"))
if not listo:
    sys.exit(1)
print("(esta prueba mide el comportamiento CON sesión, que es igual en ambos)\n")

# ── 1. Login ─────────────────────────────────────────────────────────────
print("1. Login real")
anon = Cliente()
c, d = anon.pide("/api/login", "POST", {"usuario": "zztutor", "clave": "equivocada"})
print(f"   clave mal -> {c} {d.get('error','')}")
check(c == 401, "rechaza la contraseña incorrecta")
c, d = anon.pide("/api/login", "POST", {"usuario": "noexiste", "clave": "loquesea"})
check(c == 401, "y un usuario inexistente")
check(d.get("error") == "Usuario o contraseña incorrectos",
      "con el MISMO mensaje: no revela qué usuarios existen")

tutor = Cliente()
c, d = tutor.entrar("zztutor", "clave-de-prueba")
print(f"   login correcto -> {c} · rol {d.get('sesion',{}).get('rol_nombre')}")
check(c == 200, "acepta la correcta")
check(bool(tutor.csrf), "devuelve el token CSRF")
check(d["sesion"]["permisos"]["beneficiarios"] == "vista", "trae sus permisos")
check(d["sesion"]["permisos"]["incidencias"] == "ninguno", "y lo que NO puede")

# ── 2. Lo que puede ──────────────────────────────────────────────────────
print("\n2. El tutor accede a lo suyo")
for ruta, etq in [("/api/beneficiarios", "beneficiarios"), ("/api/alertas", "dashboard")]:
    c, _ = tutor.pide(ruta)
    print(f"   GET {ruta:<28} -> {c}")
    check(c == 200, f"puede ver {etq}")

# ── 3. Lo que NO puede, llamando directo a la API ────────────────────────
print("\n3. Lo que NO puede — saltándose la interfaz por completo")
prohibidos = [
    ("GET", "/api/planillas", None, "planillas (sueldos de todos)"),
    ("GET", "/api/personal/1/condiciones", None, "condiciones (sueldo de una persona)"),
    ("GET", "/api/usuarios", None, "usuarios y permisos"),
    ("GET", "/api/accesos", None, "registro de accesos"),
    ("GET", "/api/asistencia", None, "asistencia"),
]
for metodo, ruta, cuerpo, etq in prohibidos:
    c, d = tutor.pide(ruta, metodo, cuerpo)
    print(f"   {metodo} {ruta:<32} -> {c} {str(d.get('error',''))[:44]}")
    check(c == 403, f"403 en {etq}")

print("\n4. Tampoco puede ESCRIBIR donde solo tiene vista")
c, d = tutor.pide("/api/beneficiarios", "POST", {"nombre": "Zzz Intento"})
print(f"   POST /api/beneficiarios -> {c} {str(d.get('error',''))[:52]}")
check(c == 403, "vista no alcanza para crear")
check(d.get("motivo") == "sin_permiso", "y lo dice claramente")

c, d = tutor.pide("/api/beneficiarios/1/incidencias", "POST",
                  {"fecha": "2026-08-01", "descripcion": "x"})
print(f"   POST incidencias -> {c}")
check(c == 403, "no puede registrar una incidencia")

# ── 5. El filtrado dentro de un endpoint mixto ───────────────────────────
print("\n5. El acompañamiento se filtra por permiso, no se bloquea entero")
bens = db.beneficiarios()
if bens:
    bid = bens[0]["id"]
    c, d = tutor.pide(f"/api/beneficiarios/{bid}/acompanamiento")
    print(f"   GET acompanamiento -> {c} · sesiones={d.get('puede_sesiones')} "
          f"incidencias={d.get('puede_incidencias')}")
    check(c == 200, "puede entrar (tiene 'sesiones')")
    check(d.get("puede_sesiones") is True, "ve las sesiones")
    check(d.get("puede_incidencias") is False, "pero NO las incidencias")
    check(d.get("incidencias") == [], "que llegan vacías, no filtradas a medias")
else:
    print("   (sin beneficiarios en la base, se omite)")

# ── 6. CSRF ──────────────────────────────────────────────────────────────
print("\n6. Sin token CSRF no se puede escribir")
director = Cliente()
director.entrar("zzdir", "clave-de-prueba")
c, d = director.pide("/api/beneficiarios", "POST", {"nombre": "Zzz Sin CSRF"},
                     con_csrf=False)
print(f"   POST sin token -> {c} {str(d.get('error',''))[:50]}")
check(c == 403 and d.get("motivo") == "csrf", "se rechaza por CSRF")
c, d = director.pide("/api/beneficiarios", "POST", {"nombre": "Zzz Con CSRF"})
check(c == 200, "con token sí pasa")
if c == 200:
    for b in db.beneficiarios():
        if b["nombre"] == "Zzz Con CSRF":
            db.borrar_beneficiario(b["id"])

# ── 7. Solo un Director toca a otro Director ─────────────────────────────
print("\n7. Solo un Director puede otorgar el rol Director")
rrhh = db.rol_por_clave(config.ROL_RRHH)
p3 = db.crear_personal({"nombre": "Zzz Permiso RRHH", "cargo": "Prueba"})
db.crear_usuario(p3, "zzrrhh", auth.hashear("clave-de-prueba"), rrhh["id"],
                 debe_cambiar=0)
gestor = Cliente()
gestor.entrar("zzrrhh", "clave-de-prueba")

c, d = gestor.pide("/api/usuarios")
check(c == 200, "RRHH sí administra usuarios")

p4 = db.crear_personal({"nombre": "Zzz Permiso Nuevo", "cargo": "Prueba"})
c, d = gestor.pide("/api/usuarios", "POST",
                   {"personal_id": p4, "rol_id": rol_director["id"],
                    "usuario": "zznuevodir", "clave": "clave-de-prueba"})
print(f"   RRHH intenta crear un Director -> {c} {str(d.get('error',''))[:52]}")
check(c == 403 and d.get("motivo") == "solo_director", "RRHH NO puede crear Directores")

c, d = gestor.pide("/api/usuarios", "POST",
                   {"personal_id": p4, "rol_id": rid,
                    "usuario": "zznuevo", "clave": "clave-de-prueba"})
print(f"   RRHH crea un usuario normal -> {c}")
check(c == 200, "pero sí usuarios de otros roles")

# RRHH tampoco puede ascenderse a sí mismo
yo = [u for u in db.usuarios() if u["usuario"] == "zzrrhh"][0]
c, d = gestor.pide(f"/api/usuarios/{yo['id']}", "PUT", {"rol_id": rol_director["id"]})
print(f"   RRHH intenta ascenderse -> {c} {str(d.get('error',''))[:44]}")
check(c == 403, "ni puede ascenderse a sí mismo")

c, d = director.pide("/api/usuarios", "POST",
                     {"personal_id": p4 + 0, "rol_id": rol_director["id"],
                      "usuario": "zzotrodir", "clave": "clave-de-prueba"})
# p4 ya tiene cuenta: se espera 400 por duplicado, no 403 por permiso
print(f"   Director intenta lo mismo -> {c} {str(d.get('error',''))[:46]}")
check(c != 403, "un Director SÍ tiene permiso (falla por otra razón, no por rol)")

# ── 8. No se puede dejar el sistema sin Director ─────────────────────────
print("\n8. El sistema no se queda sin Director")
dirs = [u for u in db.usuarios() if u["rol"] == config.ROL_DIRECTOR]
if len(dirs) == 1:
    c, d = director.pide(f"/api/usuarios/{dirs[0]['id']}", "PUT",
                         {"estado": "suspendido"})
    print(f"   suspender al único Director -> {c} {str(d.get('error',''))[:56]}")
    check(c == 400, "no deja suspender al único Director")
    c, d = director.pide(f"/api/usuarios/{dirs[0]['id']}", "DELETE")
    check(c == 400, "ni borrarlo")
else:
    print(f"   ({len(dirs)} Directores, se omite)")

# ── 9. Cambiar permisos cierra las sesiones abiertas ─────────────────────
print("\n9. Cambiar los permisos de un rol echa a quien lo tenga")
c, _ = tutor.pide("/api/beneficiarios")
check(c == 200, "el tutor tiene sesión viva antes")
director.pide(f"/api/roles/{rid}/permisos", "PUT",
              {"permisos": {"dashboard": "vista"}})
c, d = tutor.pide("/api/beneficiarios")
print(f"   tras cambiarle los permisos -> {c} {d.get('motivo','')}")
check(c == 401, "su sesión deja de valer y tiene que volver a entrar")

# ── 10. El rol Director no se puede recortar ─────────────────────────────
print("\n10. El rol Director no se puede recortar")
c, d = director.pide(f"/api/roles/{rol_director['id']}/permisos", "PUT",
                     {"permisos": {"dashboard": "vista"}})
print(f"   -> {c} {str(d.get('error',''))[:66]}")
check(c == 400, "se rechaza: dejaría al sistema sin quien lo arregle")

# ── 11. Logout ───────────────────────────────────────────────────────────
print("\n11. Cerrar sesión")
c, _ = director.pide("/api/logout", "POST")
check(c == 200, "cierra la sesión")
c, d = director.pide("/api/usuarios")
print(f"   tras salir -> {c} {d.get('motivo','')}")
check(c == 401, "ya no puede entrar a lo protegido")

# ── 12. El registro de accesos guardó los intentos ───────────────────────
print("\n12. Todo quedó registrado")
negados = [a for a in db.accesos(limite=400) if a["resultado"] == 403]
print(f"   accesos con 403 registrados: {len(negados)}")
if negados:
    a = negados[0]
    print(f"   ejemplo: {a['usuario']} · {a['modulo']} · {a['accion']} · {a['ruta']}")
check(len(negados) >= 5, "los intentos denegados quedan registrados")
check(any(a["usuario"] == "zztutor" for a in negados), "con el nombre de quien lo intentó")

# ── Limpieza ─────────────────────────────────────────────────────────────
limpiar()
for p in db.personal(incluir_inactivos=True):
    if p["nombre"].startswith("Zzz Permiso"):
        db.ejecutar("DELETE FROM personal WHERE id = ?", (p["id"],))
db.ejecutar("DELETE FROM accesos WHERE id > ?", (_ACCESOS_ANTES,))
db.ejecutar("DELETE FROM intentos_login WHERE id > ?", (_INTENTOS_ANTES,))
# Los roles de sistema los creó esta prueba: si no quedó ninguna cuenta,
# se van también. Dejar la base como se encontró.
if not db.usuarios():
    db.ejecutar("DELETE FROM permisos_rol")
    db.ejecutar("DELETE FROM roles")
print(f"\n   limpieza -> usuarios {len(db.usuarios())} · roles de prueba "
      f"{len([r for r in db.roles() if r['clave'].startswith('zz_')])}")

print("\n" + (f"  {len(fallos)} FALLOS" if fallos else "  PERMISOS APLICADOS DE VERDAD"))
for f in fallos: print("   -", f)
sys.exit(1 if fallos else 0)
