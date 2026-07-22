"""
ERP Lost Children — Servidor API
=================================
API REST + servicio de archivos estáticos.
Puerto: 7793
Asistencia via yunatt.com (sync automático cada 5 min).

Endpoints principales:
    GET  /personas                  lista de personas
    GET  /asistencia/hoy            marcas del día
    GET  /yunatt/status             estado del sync en la nube
    POST /yunatt/sync               sync manual desde yunatt.com
    ...
"""

import threading
import time
import json
import re
import logging
import logging.handlers
import hashlib
import secrets
import queue
import mimetypes
from datetime import date, datetime
import os
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from werkzeug.exceptions import NotFound
from config import env, db_config

mimetypes.add_type("font/woff2", ".woff2")
mimetypes.add_type("font/woff", ".woff")

try:
    import yunatt_sync
    YUNATT_AVAILABLE = True
except ImportError:
    YUNATT_AVAILABLE = False
    print("[WARN] yunatt_sync no disponible. pip install requests")

try:
    import yunatt_staff_sync
    YUNATT_STAFF_AVAILABLE = True
except ImportError:
    YUNATT_STAFF_AVAILABLE = False
    print("[WARN] yunatt_staff_sync no disponible")

try:
    import timmy_direct
    TIMMY_DIRECT_AVAILABLE = True
except ImportError:
    TIMMY_DIRECT_AVAILABLE = False
    print("[WARN] timmy_direct no disponible")

try:
    import mysql.connector
    import mysql.connector.pooling
    MYSQL_AVAILABLE = True
except ImportError:
    MYSQL_AVAILABLE = False
    print("[WARN] mysql-connector-python no instalado.")

try:
    from flask_sock import Sock
    WS_AVAILABLE = True
except ImportError:
    WS_AVAILABLE = False
    print("[WARN] flask-sock no instalado — sin push en tiempo real. pip install flask-sock")

# ─── CONFIGURACIÓN ────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("erp-bridge")

# ─── AUDITORÍA ────────────────────────────────────────────────────────────────
# Log dedicado (rotativo) de eventos sensibles: logins, cambios de usuarios,
# borrados y acciones destructivas. Separado del log operativo para que sea
# fácil de revisar/exportar sin ruido de peticiones normales.
_LOGS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logs")
os.makedirs(_LOGS_DIR, exist_ok=True)
audit_log = logging.getLogger("erp-audit")
audit_log.setLevel(logging.INFO)
audit_log.propagate = False
if not audit_log.handlers:
    _audit_handler = logging.handlers.RotatingFileHandler(
        os.path.join(_LOGS_DIR, "audit.log"), maxBytes=5 * 1024 * 1024, backupCount=5, encoding="utf-8")
    _audit_handler.setFormatter(logging.Formatter("%(asctime)s %(message)s"))
    audit_log.addHandler(_audit_handler)


def _audit(evento, usuario=None, detalle=""):
    ip = request.remote_addr or "?"
    audit_log.info(f"evento={evento} usuario={usuario or '-'} ip={ip} {detalle}".strip())


app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024  # 10 MB — evita agotar disco con subidas grandes

# CORS_ORIGINS (bridge/.env) permite agregar orígenes de producción (p.ej. la
# IP pública del servidor) sin tocar código — antes la lista era fija y solo
# cubría localhost/127.0.0.1, lo que habría bloqueado el acceso desde
# cualquier despliegue fuera de la LAN de desarrollo.
_cors_default = ["http://localhost:7793", "http://127.0.0.1:7793",
                  "http://localhost", "http://127.0.0.1",
                  "https://localhost:7793", "https://127.0.0.1:7793",
                  "https://localhost", "https://127.0.0.1"]
_cors_extra = [o.strip() for o in env("CORS_ORIGINS", "").split(",") if o.strip()]
CORS(app, origins=_cors_default + _cors_extra)
sock = Sock(app) if WS_AVAILABLE else None

ERP_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


@app.errorhandler(413)
def _archivo_muy_grande(e):
    return jsonify({"ok": False, "error": "Archivo demasiado grande (máximo 10 MB)"}), 413


# ─── SECURITY HEADERS ─────────────────────────────────────────────────────────
# CSP permite 'unsafe-inline' porque la UI usa handlers onclick="..." inline
# en todos los módulos (reescribirlos a event-delegation es un cambio aparte,
# no de seguridad de red) — pero bloquea CUALQUIER script/estilo/frame de
# origen externo, que es el vector de XSS/clickjacking real a mitigar aquí.
@app.after_request
def _security_headers(resp):
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["X-Frame-Options"] = "DENY"
    resp.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    resp.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    resp.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline'; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: https:; "
        "connect-src 'self' ws: wss:; "
        "frame-ancestors 'none'; "
        "object-src 'none'; base-uri 'self'"
    )
    return resp

DB_CONFIG = {**db_config(), "use_unicode": True}

# ─── AUTH ─────────────────────────────────────────────────────────────────────
# Sesión deslizante: cada uso válido extiende la expiración (SESSION_IDLE_TTL),
# pero nunca más allá de SESSION_MAX_TTL desde el login — así un token robado
# que se siga usando no vive indefinidamente.
SESSION_IDLE_TTL = 2 * 3600    # inactividad máxima
SESSION_MAX_TTL  = 12 * 3600   # vida absoluta desde el login
_sessions        = {}
_login_attempts  = {}
_failed_logins   = {}          # username -> [timestamps de fallos]
_ROLES_VALIDOS   = ('admin', 'coordinador', 'voluntario')

LOGIN_LOCKOUT_THRESHOLD = 5
LOGIN_LOCKOUT_WINDOW    = 15 * 60
LOGIN_LOCKOUT_DURATION  = 15 * 60


def _get_session():
    token = request.headers.get("Authorization", "").replace("Bearer ", "").strip()
    if not token:
        # El navegador no permite mandar headers custom en el handshake de
        # WebSocket, así que /ws/asistencia manda el token por query string.
        token = request.args.get("token", "").strip()
    if not token:
        return None
    s = _sessions.get(token)
    if not s:
        return None
    now = time.time()
    if now > s.get("expires_at", 0) or now - s.get("created_at", now) > SESSION_MAX_TTL:
        _sessions.pop(token, None)
        return None
    s["expires_at"] = now + SESSION_IDLE_TTL   # renovación deslizante
    return s


def _crear_sesion(user):
    token = secrets.token_hex(32)
    now = time.time()
    _sessions[token] = {
        "user_id":    user["id"],
        "nombre":     user["nombre"],
        "rol":        user["rol"],
        "username":   user["username"],
        "created_at": now,
        "expires_at": now + SESSION_IDLE_TTL,
    }
    return token


def _invalidar_sesiones(user_id, excepto_token=None):
    """Revoca todas las sesiones de un usuario (p.ej. tras cambiar password o eliminarlo)."""
    for tok in [t for t, s in _sessions.items() if s.get("user_id") == user_id and t != excepto_token]:
        _sessions.pop(tok, None)


def _cuenta_bloqueada(username):
    fails = [t for t in _failed_logins.get(username, []) if time.time() - t < LOGIN_LOCKOUT_WINDOW]
    _failed_logins[username] = fails
    return len(fails) >= LOGIN_LOCKOUT_THRESHOLD


def _registrar_login_fallido(username):
    _failed_logins.setdefault(username, []).append(time.time())


def _password_debil(password):
    # Longitud mínima + variedad de caracteres (al menos una letra y un
    # número) — evita contraseñas triviales tipo "aaaaaaaa" sin exigir
    # símbolos/mayúsculas, que para un equipo pequeño solo generaría
    # contraseñas anotadas en un post-it.
    if len(password) < 8:
        return True
    tiene_letra = any(c.isalpha() for c in password)
    tiene_numero = any(c.isdigit() for c in password)
    return not (tiene_letra and tiene_numero)


def _require_admin():
    s = _get_session()
    return s if (s and s.get("rol") == "admin") else None


# El rol 'voluntario' solo puede marcar asistencia (ver js/auth.js _PERMISOS:
# write=['asistencia']) — antes esa restricción existía solo en el frontend
# (canWrite()), así que un token de voluntario reenviado directo a la API
# (curl/Postman) podía crear/editar/borrar personas, gastos, artículos, etc.
# _require_staff() replica esa misma regla del lado del servidor.
def _require_staff():
    s = _get_session()
    return s if (s and s.get("rol") in ("admin", "coordinador")) else None


def _hash_password(password):
    salt = secrets.token_hex(16)
    h = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 260000)
    return f"pbkdf2${salt}${h.hex()}"


def _verify_password(password, stored):
    if stored.startswith("pbkdf2$"):
        parts = stored.split("$", 2)
        if len(parts) != 3:
            return False
        _, salt, expected = parts
        h = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 260000)
        return secrets.compare_digest(h.hex(), expected)
    return secrets.compare_digest(hashlib.sha256(password.encode()).hexdigest(), stored)


def _check_rate_limit(ip, window=60, max_attempts=10):
    now = time.time()
    attempts = [t for t in _login_attempts.get(ip, []) if now - t < window]
    _login_attempts[ip] = attempts
    if len(attempts) >= max_attempts:
        return False
    _login_attempts[ip].append(now)
    return True



# Rutas que sirven el "shell" de la SPA (HTML/JS/CSS) y por lo tanto deben
# quedar accesibles sin sesión: si exigiéramos login aquí, la propia pantalla
# de login nunca podría cargar. El resto de rutas SIN extensión son API de
# negocio (JSON) y deben exigir sesión — antes esta función hacía lo contrario
# (dejaba pasar todo lo que NO tuviera extensión), lo que dejaba casi toda la
# API pública sin darse cuenta.
_PUBLIC_EXACT = ("/", "/health", "/visualizacion", "/visualizacion.html",
                  "/auth/login", "/auth/logout", "/auth/me")
_PUBLIC_EXTENSIONS = ('.html', '.js', '.css', '.png', '.jpg', '.jpeg',
                       '.ico', '.svg', '.woff', '.woff2', '.ttf', '.webp', '.gif')


@app.before_request
def _require_auth_global():
    if request.method == "OPTIONS":
        return None
    if request.path in _PUBLIC_EXACT or request.path.startswith("/static/"):
        return None
    ext = os.path.splitext(request.path)[1].lower()
    if ext in _PUBLIC_EXTENSIONS:
        return None
    # Todo lo demás (rutas de API sin extensión: /personas, /gastos, /asistencia,
    # /yunatt/*, etc.) exige sesión válida.
    if _get_session() is None:
        return jsonify({"ok": False, "error": "No autenticado"}), 401


# ─── MYSQL ────────────────────────────────────────────────────────────────────
# Pool de conexiones en vez de abrir/cerrar una conexión TCP nueva en cada
# query() — antes GET /data (5 consultas) hacía 5 handshakes a MySQL por
# petición. get_connection() reutiliza una conexión del pool y conn.close()
# (llamado en query()) la devuelve al pool en vez de cerrarla de verdad, así
# que no hace falta tocar el resto del código.
_DB_POOL = None


def _get_pool():
    global _DB_POOL
    if _DB_POOL is None:
        _DB_POOL = mysql.connector.pooling.MySQLConnectionPool(
            pool_name="erp_pool", pool_size=8, pool_reset_session=True, **DB_CONFIG)
    return _DB_POOL


def get_db():
    if not MYSQL_AVAILABLE:
        raise RuntimeError("mysql-connector-python no instalado")
    return _get_pool().get_connection()


def query(sql, params=None, fetch=True):
    conn = None
    try:
        conn = get_db()
        cur  = conn.cursor(dictionary=True)
        cur.execute(sql, params or ())
        if fetch:
            return cur.fetchall()
        conn.commit()
        return cur.lastrowid
    except Exception as e:
        log.error(f"MySQL error: {e}")
        raise
    finally:
        if conn:
            conn.close()


# ─── HEALTHCHECK (Docker/Coolify) ──────────────────────────────────────────────
@app.get("/health")
def health():
    return jsonify({"ok": True, "mysql": MYSQL_AVAILABLE})


# ─── ARCHIVOS ESTÁTICOS ───────────────────────────────────────────────────────
@app.get("/")
def serve_index():
    return send_from_directory(ERP_DIR, "index.html")


@app.get("/visualizacion")
@app.get("/visualizacion.html")
def serve_viz():
    return send_from_directory(ERP_DIR, "visualizacion.html")


@app.get("/<path:filename>")
def serve_static(filename):
    # send_from_directory() valida internamente la ruta (safe_join) y evita
    # path traversal — antes se precalculaba también os.path.join(ERP_DIR,
    # filename) sin sanitizar solo para el chequeo isfile(); esa ruta sin
    # sanitizar no se usaba para servir el archivo, pero invitaba a que un
    # refactor futuro la reutilizara para abrir el archivo directamente y
    # perdiera esa protección. Dejamos que send_from_directory sea la única
    # fuente de verdad.
    try:
        return send_from_directory(ERP_DIR, filename)
    except NotFound:
        return jsonify({"error": "Not found"}), 404


# ─── AUTH ENDPOINTS ───────────────────────────────────────────────────────────
@app.post("/auth/login")
def auth_login():
    ip = request.remote_addr or "unknown"
    if not _check_rate_limit(ip):
        _audit("login_rate_limit", detalle="ip_bloqueada")
        return jsonify({"ok": False, "error": "Demasiados intentos. Espera un minuto."}), 429
    body     = request.get_json(silent=True) or {}
    username = body.get("username", "").strip().lower()
    password = body.get("password", "")
    if not username or not password:
        return jsonify({"ok": False, "error": "Usuario y contraseña requeridos"}), 400
    if _cuenta_bloqueada(username):
        _audit("login_cuenta_bloqueada", usuario=username)
        # Mensaje genérico (no menciona "cuenta bloqueada"): distinguirlo de
        # "usuario o contraseña incorrectos" permitía a alguien que agotara
        # 5 intentos inferir si ese username existe en el sistema.
        return jsonify({"ok": False, "error": "Demasiados intentos. Espera 15 minutos e inténtalo de nuevo."}), 429
    try:
        rows = query("""
            SELECT id, nombre, rol, username, password_hash FROM usuarios_sistema
            WHERE username=%s AND activo=TRUE
        """, (username,))
    except Exception:
        return jsonify({"ok": False, "error": "Error interno"}), 500
    if not rows or not _verify_password(password, rows[0]["password_hash"]):
        _registrar_login_fallido(username)
        _audit("login_fallido", usuario=username)
        return jsonify({"ok": False, "error": "Usuario o contraseña incorrectos"}), 401
    user = rows[0]
    _failed_logins.pop(username, None)
    token = _crear_sesion(user)
    _audit("login_exitoso", usuario=username)
    log.info(f"Login: {username}")
    return jsonify({"ok": True, "token": token, "nombre": user["nombre"], "rol": user["rol"]})


@app.post("/auth/logout")
def auth_logout():
    token = request.headers.get("Authorization", "").replace("Bearer ", "").strip()
    s = _sessions.pop(token, None)
    if s:
        _audit("logout", usuario=s.get("username"))
    return jsonify({"ok": True})


@app.get("/auth/me")
def auth_me():
    s = _get_session()
    if not s:
        return jsonify({"ok": False, "error": "No autenticado"}), 401
    return jsonify({"ok": True, **s})


@app.get("/auth/usuarios")
def get_usuarios_sistema():
    if not _require_admin():
        return jsonify({"ok": False, "error": "Solo administradores"}), 403
    rows = query("SELECT id, nombre, username, rol, activo, created_at FROM usuarios_sistema ORDER BY id")
    for r in rows:
        r["activo"]     = bool(r["activo"])
        r["created_at"] = str(r["created_at"])
    return jsonify(rows)


@app.post("/auth/usuarios")
def crear_usuario_sistema():
    if not _require_admin():
        return jsonify({"ok": False, "error": "Solo administradores"}), 403
    body     = request.get_json(silent=True) or {}
    nombre   = body.get("nombre", "").strip()
    username = body.get("username", "").strip().lower()
    password = body.get("password", "").strip()
    rol      = body.get("rol", "voluntario")
    if not nombre or not username or not password:
        return jsonify({"ok": False, "error": "Nombre, usuario y contraseña son requeridos"}), 400
    if rol not in _ROLES_VALIDOS:
        return jsonify({"ok": False, "error": f"Rol inválido. Válidos: {_ROLES_VALIDOS}"}), 400
    if _password_debil(password):
        return jsonify({"ok": False, "error": "La contraseña debe tener al menos 8 caracteres"}), 400
    ph = _hash_password(password)
    try:
        query("INSERT INTO usuarios_sistema (nombre, username, password_hash, rol) VALUES (%s,%s,%s,%s)",
              (nombre, username, ph, rol), fetch=False)
        row = query("SELECT id FROM usuarios_sistema WHERE username=%s", (username,))
        _audit("usuario_creado", usuario=username, detalle=f"rol={rol}")
        return jsonify({"ok": True, "id": row[0]["id"] if row else None})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.put("/auth/usuarios/<int:id_>")
def actualizar_usuario_sistema(id_):
    if not _require_admin():
        return jsonify({"ok": False, "error": "Solo administradores"}), 403
    body     = request.get_json(silent=True) or {}
    nombre   = body.get("nombre", "").strip()
    rol      = body.get("rol", "")
    activo   = body.get("activo", None)
    password = body.get("password", "").strip()
    if rol and rol not in _ROLES_VALIDOS:
        return jsonify({"ok": False, "error": "Rol inválido"}), 400
    if password and _password_debil(password):
        return jsonify({"ok": False, "error": "La contraseña debe tener al menos 8 caracteres"}), 400
    try:
        if password:
            ph = _hash_password(password)
            query("UPDATE usuarios_sistema SET password_hash=%s WHERE id=%s", (ph, id_), fetch=False)
            # Un cambio de contraseña revoca cualquier sesión robada/abierta con la anterior.
            _invalidar_sesiones(id_)
            _audit("password_cambiado", detalle=f"target_user_id={id_}")
        if nombre:
            query("UPDATE usuarios_sistema SET nombre=%s WHERE id=%s", (nombre, id_), fetch=False)
        if rol:
            query("UPDATE usuarios_sistema SET rol=%s WHERE id=%s", (rol, id_), fetch=False)
        if activo is not None:
            query("UPDATE usuarios_sistema SET activo=%s WHERE id=%s", (bool(activo), id_), fetch=False)
            if not activo:
                _invalidar_sesiones(id_)
                _audit("usuario_desactivado", detalle=f"target_user_id={id_}")
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.delete("/auth/usuarios/<int:id_>")
def eliminar_usuario_sistema(id_):
    if not _require_admin():
        return jsonify({"ok": False, "error": "Solo administradores"}), 403
    token = request.headers.get("Authorization", "").replace("Bearer ", "").strip()
    s = _sessions.get(token)
    if s and s.get("user_id") == id_:
        return jsonify({"ok": False, "error": "No puedes eliminar tu propia cuenta"}), 400
    try:
        query("DELETE FROM usuarios_sistema WHERE id=%s", (id_,), fetch=False)
        _invalidar_sesiones(id_)
        _audit("usuario_eliminado", usuario=s.get("username") if s else None, detalle=f"target_user_id={id_}")
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


# ─── PERSONAS ─────────────────────────────────────────────────────────────────
@app.get("/personas")
def get_personas():
    try:
        rows = query("SELECT * FROM personas WHERE estado != 'inactivo' ORDER BY tipo, nombre")
        return jsonify(rows)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.post("/personas")
def crear_persona():
    if not _require_staff():
        return jsonify({"ok": False, "error": "No autorizado"}), 403
    body = request.get_json(silent=True) or {}
    try:
        id_ = query("""
            INSERT INTO personas (
                nombre, tipo, estado, edad, genero, tutor, ingreso, inicial, avatar_bg, avatar_fg,
                dni, fecha_nacimiento, nacionalidad, telefono, email, direccion, barrio,
                parentesco_tutor, telefono_tutor, situacion_familiar,
                grupo_sanguineo, alergias, condicion_medica,
                escolaridad, colegio, procedencia, motivo_ingreso, prioridad, observaciones,
                ocupacion, organizacion, pais_origen, area_servicio, tipo_vinculo,
                fecha_fin, ingreso_familiar, num_hijos_programa
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """, (
            body.get("nombre"), body.get("tipo"), body.get("estado", "activo"),
            body.get("edad"), body.get("genero"), body.get("tutor"),
            body.get("ingreso"), body.get("inicial"),
            body.get("avatar_bg", "#DDEDF1"), body.get("avatar_fg", "#1C6678"),
            body.get("dni", ""), body.get("fecha_nacimiento") or None,
            body.get("nacionalidad", ""), body.get("telefono", ""), body.get("email", ""),
            body.get("direccion", ""), body.get("barrio", ""),
            body.get("parentesco_tutor", ""), body.get("telefono_tutor", ""),
            body.get("situacion_familiar", ""),
            body.get("grupo_sanguineo", ""), body.get("alergias", ""),
            body.get("condicion_medica", ""),
            body.get("escolaridad", ""), body.get("colegio", ""),
            body.get("procedencia", ""), body.get("motivo_ingreso", ""),
            body.get("prioridad", "media"), body.get("observaciones", ""),
            body.get("ocupacion", ""), body.get("organizacion", ""),
            body.get("pais_origen", ""), body.get("area_servicio", ""),
            body.get("tipo_vinculo", ""), body.get("fecha_fin") or None,
            body.get("ingreso_familiar", ""), body.get("num_hijos_programa", 0),
        ), fetch=False)
        try:
            query("""
                INSERT IGNORE INTO asistencia (persona_id, fecha, presente, metodo)
                VALUES (%s, CURRENT_DATE, FALSE, '—')
            """, (id_,), fetch=False)
        except Exception:
            pass
        # yunatt: NO auto-sincronizar aquí — el usuario elige el método
        # desde el tab Timmy (Enrolar) para que el dispositivo active el registro correcto.
        _broadcast("cambio", recurso="personas")
        return jsonify({"ok": True, "id": id_})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.put("/personas/<int:id_>")
def actualizar_persona(id_):
    if not _require_staff():
        return jsonify({"ok": False, "error": "No autorizado"}), 403
    body = request.get_json(silent=True) or {}
    try:
        query("""
            UPDATE personas SET
                nombre=%s, tipo=%s, estado=%s, edad=%s, genero=%s,
                tutor=%s, ingreso=%s, inicial=%s, avatar_bg=%s, avatar_fg=%s,
                dni=%s, fecha_nacimiento=%s, nacionalidad=%s, telefono=%s, email=%s,
                direccion=%s, barrio=%s, parentesco_tutor=%s, telefono_tutor=%s,
                situacion_familiar=%s, grupo_sanguineo=%s, alergias=%s, condicion_medica=%s,
                escolaridad=%s, colegio=%s, procedencia=%s, motivo_ingreso=%s,
                prioridad=%s, observaciones=%s,
                ocupacion=%s, organizacion=%s, pais_origen=%s, area_servicio=%s,
                tipo_vinculo=%s, fecha_fin=%s, ingreso_familiar=%s, num_hijos_programa=%s
            WHERE id=%s
        """, (
            body.get("nombre"), body.get("tipo"), body.get("estado"),
            body.get("edad"), body.get("genero"), body.get("tutor"),
            body.get("ingreso"), body.get("inicial"),
            body.get("avatar_bg"), body.get("avatar_fg"),
            body.get("dni", ""), body.get("fecha_nacimiento") or None,
            body.get("nacionalidad", ""), body.get("telefono", ""), body.get("email", ""),
            body.get("direccion", ""), body.get("barrio", ""),
            body.get("parentesco_tutor", ""), body.get("telefono_tutor", ""),
            body.get("situacion_familiar", ""),
            body.get("grupo_sanguineo", ""), body.get("alergias", ""),
            body.get("condicion_medica", ""),
            body.get("escolaridad", ""), body.get("colegio", ""),
            body.get("procedencia", ""), body.get("motivo_ingreso", ""),
            body.get("prioridad", "media"), body.get("observaciones", ""),
            body.get("ocupacion", ""), body.get("organizacion", ""),
            body.get("pais_origen", ""), body.get("area_servicio", ""),
            body.get("tipo_vinculo", ""), body.get("fecha_fin") or None,
            body.get("ingreso_familiar", ""), body.get("num_hijos_programa", 0),
            id_
        ), fetch=False)
        _broadcast("cambio", recurso="personas")
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.delete("/personas/<int:id_>")
def eliminar_persona(id_):
    s = _require_staff()
    if not s:
        return jsonify({"ok": False, "error": "No autorizado"}), 403
    try:
        query("UPDATE personas SET estado='inactivo' WHERE id=%s", (id_,), fetch=False)
        _audit("persona_eliminada", usuario=s.get("username") if s else None, detalle=f"persona_id={id_}")
        _broadcast("cambio", recurso="personas")
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500

    # Borrar también del Timmy y de yunatt (en segundo plano, no bloquea la UI)
    if YUNATT_STAFF_AVAILABLE:
        def _borrar_remoto():
            try:
                r = yunatt_staff_sync.eliminar_persona_completo(id_)
                log.info(f"eliminar_persona {id_}: yunatt/Timmy → {r}")
            except Exception as e:
                log.warning(f"eliminar_persona {id_}: error borrado remoto: {e}")
        threading.Thread(target=_borrar_remoto, daemon=True).start()

    # Borrar foto local si existe
    try:
        fp = os.path.join(os.path.dirname(__file__), "static", "fotos", f"persona_{id_}.jpg")
        if os.path.exists(fp):
            os.remove(fp)
    except Exception:
        pass

    return jsonify({"ok": True, "remoto": YUNATT_STAFF_AVAILABLE,
                    "aviso": "Persona desactivada. Se está borrando del Timmy y yunatt."})


@app.post("/personas/<int:id_>/foto")
def actualizar_foto_persona(id_):
    if not _require_staff():
        return jsonify({"ok": False, "error": "No autorizado"}), 403
    import base64 as _b64
    body = request.get_json(silent=True) or {}
    foto_b64 = body.get("foto_b64", "")
    foto_url  = body.get("foto_url", "")
    if foto_b64:
        try:
            raw = foto_b64.split(",", 1)[-1]
            foto_bytes = _b64.b64decode(raw)
            fotos_dir = os.path.join(os.path.dirname(__file__), "static", "fotos")
            os.makedirs(fotos_dir, exist_ok=True)
            fname = f"persona_{id_}.jpg"
            with open(os.path.join(fotos_dir, fname), "wb") as fh:
                fh.write(foto_bytes)
            foto_url = f"/static/fotos/{fname}"
        except Exception as e:
            return jsonify({"ok": False, "error": str(e)}), 400
    if not foto_url:
        return jsonify({"ok": False, "error": "foto_b64 o foto_url requerido"}), 400
    try:
        query("UPDATE personas SET foto_url=%s WHERE id=%s", (foto_url, id_), fetch=False)
        return jsonify({"ok": True, "foto_url": foto_url})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


# ─── ASISTENCIA ───────────────────────────────────────────────────────────────
@app.get("/asistencia/hoy")
def get_asistencia_hoy():
    try:
        try:
            query("ALTER TABLE asistencia ADD COLUMN zk_user_id VARCHAR(20)", fetch=False)
        except Exception:
            pass

        try:
            query("""
                INSERT IGNORE INTO asistencia (persona_id, fecha, presente, metodo, zk_user_id)
                SELECT id, CURRENT_DATE, FALSE, '—', CAST(id AS CHAR)
                FROM personas WHERE estado = 'activo'
            """, fetch=False)
        except Exception as e:
            log.warning(f"INSERT asistencia hoy: {e}")

        try:
            query("""
                UPDATE asistencia a
                JOIN personas p ON p.id = a.persona_id
                SET a.zk_user_id = CAST(p.id AS CHAR)
                WHERE a.fecha = CURRENT_DATE
                  AND (a.zk_user_id IS NULL OR a.zk_user_id = '')
                  AND p.estado = 'activo'
            """, fetch=False)
        except Exception as e:
            log.warning(f"UPDATE zk_user_id: {e}")

        rows = query("""
            SELECT a.*, p.nombre, p.tipo, p.inicial, p.avatar_bg, p.avatar_fg, p.foto_url
            FROM asistencia a
            JOIN personas p ON p.id = a.persona_id
            WHERE a.fecha = CURRENT_DATE AND p.estado = 'activo'
            ORDER BY a.presente DESC,
                     FIELD(p.tipo,'nino','misionero','voluntario','staff'),
                     a.hora, p.nombre
        """)
        for r in rows:
            if r.get("hora"):
                r["hora"] = str(r["hora"])
            if r.get("fecha"):
                r["fecha"] = str(r["fecha"])
            r["presente"] = bool(r.get("presente"))

        # Marcas en zkteco_logs sin persona asignada aún
        try:
            sin_asignar = query("""
                SELECT zk_user_id,
                       MIN(TIME(timestamp)) AS hora,
                       metodo
                FROM zkteco_logs
                WHERE DATE(timestamp) = CURRENT_DATE
                  AND NOT EXISTS (
                    SELECT 1 FROM asistencia a
                    WHERE a.fecha = CURRENT_DATE
                      AND (a.zk_user_id = zkteco_logs.zk_user_id
                           OR CAST(a.persona_id AS CHAR) = zkteco_logs.zk_user_id)
                  )
                GROUP BY zk_user_id, metodo
                ORDER BY hora
            """)
            for r in sin_asignar:
                hora_str = str(r["hora"])[:5] if r.get("hora") else ""
                rows.append({
                    "sin_asignar": True,
                    "zk_user_id":  r["zk_user_id"],
                    "nombre":      f"ID-{r['zk_user_id']}",
                    "hora":        hora_str,
                    "metodo":      r.get("metodo", "facial"),
                    "tipo":        "desconocido",
                    "presente":    True,
                    "id":          None,
                    "persona_id":  None,
                    "inicial":     "?",
                    "avatar_bg":   "#FDF2D5",
                    "avatar_fg":   "#9A6B0A",
                })
        except Exception as e:
            log.warning(f"sin_asignar: {e}")

        return jsonify(rows)
    except Exception as e:
        log.error(f"GET /asistencia/hoy: {e}")
        return jsonify({"error": str(e)}), 500


# ─── WEBSOCKET: TIEMPO REAL PARA TODO EL SISTEMA ──────────────────────────────
# Bus de broadcast centralizado: cada endpoint que muta datos (personas,
# articulos, gastos, entregas, alimentacion, fondos, asistencia) llama a
# _broadcast(...) justo tras el commit, y TODOS los clientes conectados lo
# reciben al instante — sin polling, sin recargar la página. La única
# excepción es la detección de marcas que llegan del Timmy vía yunatt (eso
# ocurre en un hilo de fondo, no en una petición HTTP), para lo cual
# _asistencia_watcher() sigue revisando MySQL cada 2 s pero UNA sola vez para
# todos los clientes (antes cada conexión hacía su propio polling — con 3
# admins conectados eran 3x las consultas).
_ws_clients      = set()
_ws_clients_lock = threading.Lock()


def _ws_register():
    q = queue.Queue()
    with _ws_clients_lock:
        _ws_clients.add(q)
    return q


def _ws_unregister(q):
    with _ws_clients_lock:
        _ws_clients.discard(q)


def _broadcast(evento, **data):
    msg = json.dumps({"evento": evento, **data})
    with _ws_clients_lock:
        clientes = list(_ws_clients)
    for q in clientes:
        try:
            q.put_nowait(msg)
        except Exception:
            pass


if WS_AVAILABLE:
    @sock.route("/ws/asistencia")
    def ws_asistencia(ws):
        q = _ws_register()
        try:
            ws.send(json.dumps({"evento": "conectado"}))
            while True:
                try:
                    msg = q.get(timeout=25)
                    ws.send(msg)
                except queue.Empty:
                    ws.send(json.dumps({"evento": "ping"}))  # keep-alive
        except Exception:
            pass
        finally:
            _ws_unregister(q)


def _asistencia_watcher():
    """Único hilo de fondo que detecta marcas nuevas del Timmy (llegan vía
    yunatt_sync en otro hilo, no hay petición HTTP a la que engancharse)."""
    def _snapshot():
        try:
            a = query("""
                SELECT COUNT(*) AS total,
                       COALESCE(SUM(presente),0) AS presentes,
                       COALESCE(MAX(CONCAT(persona_id,'-',IFNULL(hora,''))),'') AS ult
                FROM asistencia WHERE fecha = CURRENT_DATE
            """)[0]
            z = query("SELECT COALESCE(MAX(id),0) AS mx FROM zkteco_logs")[0]
            return f"{a['total']}|{a['presentes']}|{a['ult']}|{z['mx']}"
        except Exception:
            return None

    last = _snapshot()
    while True:
        time.sleep(2)
        cur = _snapshot()
        if cur is not None and cur != last:
            last = cur
            _broadcast("asistencia")


@app.post("/asistencia/asignar-zk")
def asignar_zk():
    body       = request.get_json(silent=True) or {}
    zk_user_id = str(body.get("zk_user_id", "")).strip()
    persona_id = int(body.get("persona_id", 0))
    if not zk_user_id or not persona_id:
        return jsonify({"ok": False, "error": "Faltan zk_user_id o persona_id"}), 400
    try:
        logs = query("""
            SELECT MIN(TIME(timestamp)) AS hora, metodo
            FROM zkteco_logs
            WHERE zk_user_id = %s AND DATE(timestamp) = CURRENT_DATE
            GROUP BY metodo ORDER BY hora LIMIT 1
        """, (zk_user_id,))
        hora   = str(logs[0]["hora"]) if logs else None
        metodo = logs[0]["metodo"]    if logs else "facial"

        query("""
            INSERT IGNORE INTO asistencia (persona_id, fecha, presente, metodo, zk_user_id)
            VALUES (%s, CURRENT_DATE, FALSE, '—', %s)
        """, (persona_id, zk_user_id), fetch=False)

        query("""
            UPDATE asistencia
            SET zk_user_id = %s, presente = TRUE, hora = %s, metodo = %s
            WHERE persona_id = %s AND fecha = CURRENT_DATE
        """, (zk_user_id, hora, metodo, persona_id), fetch=False)

        query("""
            UPDATE zkteco_logs SET procesado = TRUE
            WHERE zk_user_id = %s AND DATE(timestamp) = CURRENT_DATE
        """, (zk_user_id,), fetch=False)

        _broadcast("asistencia")
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.put("/asistencia/<int:id_>")
def actualizar_asistencia(id_):
    body    = request.get_json(silent=True) or {}
    present = bool(body.get("presente", False))
    # metodo/hora se muestran sin escapar en el kiosko de marcado (pantalla
    # normalmente desatendida) — acotar longitud y formato acá reduce el
    # riesgo de XSS almacenado además del escape que ya hace el frontend.
    metodo  = str(body.get("metodo", "Manual"))[:50]
    hora    = body.get("hora", "")
    if not re.match(r'^\d{2}:\d{2}(:\d{2})?$', str(hora)):
        hora = datetime.now().strftime("%H:%M:%S")
    try:
        if present:
            query("""
                UPDATE asistencia SET presente=TRUE, metodo=%s, hora=%s
                WHERE id=%s AND fecha=CURRENT_DATE
            """, (metodo, hora, id_), fetch=False)
        else:
            query("""
                UPDATE asistencia SET presente=FALSE, metodo='—', hora=NULL
                WHERE id=%s AND fecha=CURRENT_DATE
            """, (id_,), fetch=False)
        _broadcast("asistencia")
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


# ─── ARTÍCULOS ────────────────────────────────────────────────────────────────
@app.get("/articulos")
def get_articulos():
    try:
        rows = query("SELECT * FROM articulos WHERE activo = TRUE ORDER BY categoria, nombre")
        for r in rows:
            if r.get("vence"):
                r["vence"] = str(r["vence"])
            r["stock"]  = float(r["stock"])
            r["minimo"] = float(r["minimo"])
        return jsonify(rows)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.post("/articulos")
def crear_articulo():
    if not _require_staff():
        return jsonify({"ok": False, "error": "No autorizado"}), 403
    body = request.get_json(silent=True) or {}
    try:
        id_ = query("""
            INSERT INTO articulos (nombre, categoria, stock, minimo, unidad, vence,
                precio, descripcion, proveedor, codigo, ubicacion)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (body.get("nombre"), body.get("categoria"), body.get("stock", 0),
              body.get("minimo", 10), body.get("unidad", "uds"),
              body.get("vence") or None,
              body.get("precio", 0), body.get("descripcion", ""),
              body.get("proveedor", ""), body.get("codigo", ""),
              body.get("ubicacion", "")), fetch=False)
        _broadcast("cambio", recurso="articulos")
        return jsonify({"ok": True, "id": id_})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.put("/articulos/<int:id_>")
def actualizar_articulo(id_):
    if not _require_staff():
        return jsonify({"ok": False, "error": "No autorizado"}), 403
    body = request.get_json(silent=True) or {}
    try:
        query("""
            UPDATE articulos SET nombre=%s, categoria=%s, stock=%s,
            minimo=%s, unidad=%s, vence=%s,
            precio=%s, descripcion=%s, proveedor=%s, codigo=%s, ubicacion=%s
            WHERE id=%s
        """, (body.get("nombre"), body.get("categoria"), body.get("stock"),
              body.get("minimo"), body.get("unidad"),
              body.get("vence") or None,
              body.get("precio", 0), body.get("descripcion", ""),
              body.get("proveedor", ""), body.get("codigo", ""),
              body.get("ubicacion", ""),
              id_), fetch=False)
        _broadcast("cambio", recurso="articulos")
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.delete("/articulos/<int:id_>")
def eliminar_articulo(id_):
    if not _require_staff():
        return jsonify({"ok": False, "error": "No autorizado"}), 403
    try:
        query("UPDATE articulos SET activo=FALSE WHERE id=%s", (id_,), fetch=False)
        _broadcast("cambio", recurso="articulos")
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.post("/articulos/<int:id_>/imagen")
def subir_imagen_articulo(id_):
    if not _require_staff():
        return jsonify({"ok": False, "error": "No autorizado"}), 403
    import uuid
    from werkzeug.utils import secure_filename
    if 'imagen' not in request.files:
        return jsonify({"ok": False, "error": "No se envió imagen"}), 400
    f = request.files['imagen']
    if not f.filename:
        return jsonify({"ok": False, "error": "Archivo vacío"}), 400
    ext = os.path.splitext(secure_filename(f.filename))[1].lower()
    if ext not in ('.jpg', '.jpeg', '.png', '.webp', '.gif'):
        return jsonify({"ok": False, "error": "Formato no soportado"}), 400
    folder = os.path.join(os.path.dirname(__file__), 'static', 'articulos')
    os.makedirs(folder, exist_ok=True)
    fname = f"{uuid.uuid4().hex}{ext}"
    f.save(os.path.join(folder, fname))
    url = f"/static/articulos/{fname}"
    try:
        query("UPDATE articulos SET imagen=%s WHERE id=%s", (url, id_), fetch=False)
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500
    return jsonify({"ok": True, "url": url})


@app.post("/articulos/<int:id_>/movimiento")
def movimiento_articulo(id_):
    if not _require_staff():
        return jsonify({"ok": False, "error": "No autorizado"}), 403
    body              = request.get_json(silent=True) or {}
    tipo              = body.get("tipo", "entrada")
    cantidad          = float(body.get("cantidad", 0))
    motivo            = body.get("motivo", "")
    origen            = body.get("origen", "compra")
    costo_total       = float(body.get("costo_total", 0))
    proveedor_donante = body.get("proveedor_donante", "")

    if cantidad <= 0:
        return jsonify({"ok": False, "error": "Cantidad debe ser mayor a 0"}), 400
    try:
        if tipo == "salida":
            rows = query("SELECT stock FROM articulos WHERE id=%s", (id_,))
            if not rows:
                return jsonify({"ok": False, "error": "Artículo no encontrado"}), 404
            if float(rows[0]["stock"]) < cantidad:
                return jsonify({"ok": False, "error": f"Stock insuficiente. Disponible: {rows[0]['stock']}"}), 400

        # Dos sentencias explícitas y 100% parametrizadas en vez de interpolar
        # el operador +/- con f-string junto a un placeholder %s: aunque hoy
        # 'tipo' solo puede producir "+" o "-" (por el if/else), mezclar
        # f-string con SQL parametrizado es un patrón frágil que invita a
        # reintroducir inyección si alguien generaliza esta función más
        # adelante sin notarlo.
        if tipo == "entrada":
            query("UPDATE articulos SET stock = stock + %s WHERE id=%s", (cantidad, id_), fetch=False)
        else:
            query("UPDATE articulos SET stock = stock - %s WHERE id=%s", (cantidad, id_), fetch=False)

        precio_unitario = None
        if tipo == "entrada" and origen == "compra" and costo_total > 0:
            precio_unitario = round(costo_total / cantidad, 4)
            query("UPDATE articulos SET precio=%s WHERE id=%s", (precio_unitario, id_), fetch=False)

        query("""
            INSERT INTO movimientos_almacen
                (articulo_id, tipo, cantidad, motivo, origen, costo_total, proveedor_donante)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        """, (id_, tipo, cantidad, motivo, origen, costo_total, proveedor_donante), fetch=False)

        if tipo == "entrada" and origen == "compra" and costo_total > 0:
            art_rows   = query("SELECT nombre, unidad FROM articulos WHERE id=%s", (id_,))
            art_nombre = art_rows[0]["nombre"] if art_rows else f"Artículo #{id_}"
            art_unidad = art_rows[0]["unidad"] if art_rows else ""
            try:
                gasto_id = query("""
                    INSERT INTO gastos (fecha, categoria, monto, proveedor, fondo, observacion,
                                       cat_bg, cat_fg, fuente_auto)
                    VALUES (CURRENT_DATE, 'Almacén', %s, %s, 'Fondo General',
                            %s, '#E0F0FF', '#015a9e', 'compra_almacen')
                """, (costo_total, proveedor_donante or 'Proveedor',
                      f"Compra {cantidad} {art_unidad} de {art_nombre}"), fetch=False)
                query("""
                    INSERT INTO fondos_movimientos
                        (tipo, monto, descripcion, categoria, fuente, referencia_id, fecha)
                    VALUES ('egreso', %s, %s, 'Almacén', 'gasto', %s, CURRENT_DATE)
                """, (costo_total, f"Compra {art_nombre}", gasto_id), fetch=False)
            except Exception:
                pass

        rows = query("SELECT stock, precio FROM articulos WHERE id=%s", (id_,))
        nuevo_stock  = float(rows[0]["stock"]) if rows else 0
        nuevo_precio = float(rows[0]["precio"] or 0) if rows else 0
        _broadcast("cambio", recurso="articulos")
        if tipo == "entrada" and origen == "compra" and costo_total > 0:
            _broadcast("cambio", recurso="gastos")
            _broadcast("cambio", recurso="fondos")
        return jsonify({"ok": True, "stock": nuevo_stock, "precio": nuevo_precio,
                        "precio_unitario": precio_unitario})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


# ─── GASTOS ───────────────────────────────────────────────────────────────────
@app.get("/gastos")
def get_gastos():
    try:
        rows = query("SELECT * FROM gastos ORDER BY fecha DESC LIMIT 200")
        for r in rows:
            if r.get("fecha"):
                r["fecha"] = str(r["fecha"])
            r["monto"] = float(r["monto"])
        return jsonify(rows)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.post("/gastos")
def crear_gasto():
    if not _require_staff():
        return jsonify({"ok": False, "error": "No autorizado"}), 403
    body = request.get_json(silent=True) or {}
    try:
        id_ = query("""
            INSERT INTO gastos (fecha, categoria, monto, proveedor, fondo, observacion, cat_bg, cat_fg)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """, (body.get("fecha"), body.get("categoria"), body.get("monto"),
              body.get("proveedor"), body.get("fondo", "Fondo General"),
              body.get("observacion"), body.get("cat_bg"), body.get("cat_fg")),
        fetch=False)
        try:
            query("""
                INSERT INTO fondos_movimientos (tipo, monto, descripcion, categoria, fuente, referencia_id, fecha)
                VALUES ('egreso', %s, %s, %s, 'gasto', %s, %s)
            """, (body.get("monto", 0), body.get("proveedor", ""),
                  body.get("categoria", "Gasto"), id_,
                  body.get("fecha", date.today().isoformat())), fetch=False)
        except Exception:
            pass
        _broadcast("cambio", recurso="gastos")
        _broadcast("cambio", recurso="fondos")
        return jsonify({"ok": True, "id": id_})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.put("/gastos/<int:id_>")
def actualizar_gasto(id_):
    if not _require_staff():
        return jsonify({"ok": False, "error": "No autorizado"}), 403
    body = request.get_json(silent=True) or {}
    try:
        query("""
            UPDATE gastos SET fecha=%s, categoria=%s, monto=%s, proveedor=%s,
                              observacion=%s, cat_bg=%s, cat_fg=%s
            WHERE id=%s
        """, (body.get("fecha"), body.get("categoria"), body.get("monto"),
              body.get("proveedor"), body.get("observacion"),
              body.get("cat_bg"), body.get("cat_fg"), id_), fetch=False)
        try:
            query("""
                UPDATE fondos_movimientos SET monto=%s, descripcion=%s, categoria=%s, fecha=%s
                WHERE fuente='gasto' AND referencia_id=%s
            """, (body.get("monto", 0), body.get("proveedor", ""),
                  body.get("categoria", "Gasto"), body.get("fecha"), id_), fetch=False)
        except Exception:
            pass
        _broadcast("cambio", recurso="gastos")
        _broadcast("cambio", recurso="fondos")
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.delete("/gastos/<int:id_>")
def eliminar_gasto(id_):
    if not _require_staff():
        return jsonify({"ok": False, "error": "No autorizado"}), 403
    try:
        query("DELETE FROM fondos_movimientos WHERE fuente='gasto' AND referencia_id=%s", (id_,), fetch=False)
        query("DELETE FROM gastos WHERE id=%s", (id_,), fetch=False)
        _broadcast("cambio", recurso="gastos")
        _broadcast("cambio", recurso="fondos")
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.post("/gastos/<int:id_>/comprobante")
def subir_comprobante(id_):
    if not _require_staff():
        return jsonify({"ok": False, "error": "No autorizado"}), 403
    import uuid
    from werkzeug.utils import secure_filename
    f = request.files.get('comprobante')
    if not f:
        return jsonify({"ok": False, "error": "No se envió archivo"}), 400
    ext = os.path.splitext(secure_filename(f.filename))[1].lower()
    if ext not in ('.jpg', '.jpeg', '.png', '.webp', '.gif', '.pdf'):
        return jsonify({"ok": False, "error": "Formato no soportado"}), 400
    folder = os.path.join(os.path.dirname(__file__), 'static', 'comprobantes')
    os.makedirs(folder, exist_ok=True)
    fname = f"{uuid.uuid4().hex}{ext}"
    f.save(os.path.join(folder, fname))
    url = f"/static/comprobantes/{fname}"
    query("UPDATE gastos SET comprobante_url=%s WHERE id=%s", (url, id_), fetch=False)
    return jsonify({"ok": True, "url": url})


# ─── ENTREGAS ─────────────────────────────────────────────────────────────────
@app.get("/entregas")
def get_entregas():
    try:
        rows = query("""
            SELECT e.*, p.nombre AS nino, p.tipo AS persona_tipo, p.inicial, p.avatar_bg, p.avatar_fg,
                   a.nombre AS articulo, a.categoria AS articulo_categoria, a.unidad,
                   c.nombre AS campana, c.bg_color, c.fg_color
            FROM entregas e
            JOIN personas  p ON p.id = e.persona_id
            JOIN articulos a ON a.id = e.articulo_id
            LEFT JOIN campanas c ON c.id = e.campana_id
            ORDER BY e.fecha DESC LIMIT 100
        """)
        for r in rows:
            if r.get("fecha"):
                r["fecha"] = str(r["fecha"])
            r["cantidad"] = float(r["cantidad"])
        return jsonify(rows)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.post("/entregas")
def crear_entrega():
    if not _require_staff():
        return jsonify({"ok": False, "error": "No autorizado"}), 403
    body = request.get_json(silent=True) or {}
    try:
        articulo_id = body.get("articulo_id")
        cantidad    = float(body.get("cantidad", 1))
        if cantidad <= 0:
            return jsonify({"ok": False, "error": "Cantidad debe ser mayor a 0"}), 400

        # Validación server-side: el frontend ya compara contra el stock en
        # memoria, pero eso no protege contra una llamada directa a la API
        # (curl/Postman). Sin esto, el stock podía quedar negativo.
        art_rows = query("SELECT stock FROM articulos WHERE id=%s", (articulo_id,))
        if not art_rows:
            return jsonify({"ok": False, "error": "Artículo no encontrado"}), 404
        if float(art_rows[0]["stock"]) < cantidad:
            return jsonify({"ok": False, "error": f"Stock insuficiente. Disponible: {art_rows[0]['stock']}"}), 400

        campana_id = None
        campana    = body.get("campana", "General")
        rows = query("SELECT id FROM campanas WHERE nombre=%s", (campana,))
        if rows:
            campana_id = rows[0]["id"]
        else:
            campana_id = query("INSERT INTO campanas (nombre) VALUES (%s)", (campana,), fetch=False)

        id_ = query("""
            INSERT INTO entregas (persona_id, articulo_id, campana_id, cantidad, fecha, notas)
            VALUES (%s, %s, %s, %s, CURRENT_DATE, %s)
        """, (body.get("persona_id"), articulo_id,
              campana_id, cantidad, body.get("notas", "")), fetch=False)

        query("UPDATE articulos SET stock = stock - %s WHERE id=%s AND stock >= %s",
              (cantidad, articulo_id, cantidad), fetch=False)
        query("""
            INSERT INTO movimientos_almacen (articulo_id, tipo, cantidad, motivo, fecha)
            VALUES (%s, 'salida', %s, 'Entrega a beneficiario', CURRENT_DATE)
        """, (articulo_id, cantidad), fetch=False)

        _broadcast("cambio", recurso="entregas")
        _broadcast("cambio", recurso="articulos")
        return jsonify({"ok": True, "id": id_})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


# ─── ALIMENTACIÓN ─────────────────────────────────────────────────────────────
@app.get("/alimentacion")
def get_alimentacion():
    try:
        rows = query("SELECT * FROM servicios_alimentacion ORDER BY fecha DESC LIMIT 30")
        for r in rows:
            if r.get("fecha"):
                r["fecha"] = str(r["fecha"])
            if r.get("costo_total"):
                r["costo_total"] = float(r["costo_total"])
        return jsonify(rows)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.post("/alimentacion")
def crear_servicio():
    if not _require_staff():
        return jsonify({"ok": False, "error": "No autorizado"}), 403
    import json as _json
    body = request.get_json(silent=True) or {}
    try:
        consumo = body.get("consumo") or []
        id_ = query("""
            INSERT INTO servicios_alimentacion
                (fecha, menu, total_raciones, ninos, misioneros, voluntarios, padres, staff,
                 insumos_desc, costo_total, costo_por_plato, descontado, consumo_json)
            VALUES (CURRENT_DATE, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, TRUE, %s)
        """, (body.get("menu", "Almuerzo"), body.get("total", 0),
              body.get("ninos", 0), body.get("misioneros", 0),
              body.get("voluntarios", 0), body.get("padres", 0), body.get("staff", 0),
              body.get("insumos", ""), body.get("costo", 0),
              body.get("costo_por_plato", 0),
              _json.dumps(consumo)), fetch=False)

        for insumo in consumo:
            art_id = insumo.get("articuloId")
            cant   = float(insumo.get("cantidad", 0))
            if art_id and cant > 0:
                query("UPDATE articulos SET stock = stock - %s WHERE id=%s AND stock >= %s",
                      (cant, art_id, cant), fetch=False)
                query("""
                    INSERT INTO movimientos_almacen (articulo_id, tipo, cantidad, motivo, fecha)
                    VALUES (%s, 'salida', %s, 'Servicio de alimentación', CURRENT_DATE)
                """, (art_id, cant), fetch=False)

        costo = float(body.get("costo", 0))
        if costo > 0:
            try:
                query("""
                    INSERT INTO fondos_movimientos (tipo, monto, descripcion, categoria, fuente, referencia_id, fecha)
                    VALUES ('egreso', %s, %s, 'Alimentación', 'alimentacion', %s, CURRENT_DATE)
                """, (costo, body.get("menu", "Servicio de almuerzo"), id_), fetch=False)
            except Exception:
                pass

        _broadcast("cambio", recurso="alimentacion")
        _broadcast("cambio", recurso="articulos")
        if costo > 0:
            _broadcast("cambio", recurso="fondos")
        return jsonify({"ok": True, "id": id_})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.get("/alimentacion/<int:id_>/consumo")
def get_consumo_servicio(id_):
    import json as _json
    try:
        rows = query("SELECT consumo_json FROM servicios_alimentacion WHERE id=%s", (id_,))
        if not rows:
            return jsonify({"ok": False, "error": "No encontrado"}), 404
        raw = rows[0].get("consumo_json") or "[]"
        return jsonify({"ok": True, "consumo": _json.loads(raw)})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


# ─── KPIs / DATA ──────────────────────────────────────────────────────────────
@app.get("/kpis")
def get_kpis():
    try:
        rows = query("""
            SELECT
                (SELECT COUNT(*) FROM personas WHERE estado='activo' AND tipo='nino')        AS ninos_activos,
                (SELECT COUNT(*) FROM personas WHERE estado='activo' AND tipo='padre')       AS padres_activos,
                (SELECT COUNT(*) FROM personas WHERE estado='activo' AND tipo='misionero')   AS misioneros_activos,
                (SELECT COUNT(*) FROM personas WHERE estado='activo' AND tipo='voluntario')  AS voluntarios_activos,
                (SELECT COUNT(*) FROM personas WHERE estado='activo' AND tipo='staff')       AS staff_activos,
                (SELECT COUNT(*) FROM asistencia WHERE fecha=CURRENT_DATE AND presente=TRUE) AS presentes_hoy,
                (SELECT COUNT(*) FROM asistencia WHERE fecha=CURRENT_DATE)                   AS total_hoy,
                (SELECT COUNT(*) FROM entregas WHERE fecha=CURRENT_DATE)                     AS entregas_hoy,
                (SELECT COALESCE(SUM(monto),0) FROM gastos
                 WHERE MONTH(fecha)=MONTH(CURRENT_DATE)
                   AND YEAR(fecha)=YEAR(CURRENT_DATE))                                       AS gasto_mes,
                (SELECT COALESCE(SUM(CASE WHEN tipo='ingreso' THEN monto ELSE -monto END),0)
                 FROM fondos_movimientos)                                                     AS balance_fondos
        """)
        kpi = rows[0] if rows else {}
        return jsonify({k: (float(v) if v is not None else 0) for k, v in kpi.items()})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.get("/data")
def get_data():
    try:
        asistencia_hoy = query("""
            SELECT a.id, a.fecha, a.presente, a.hora, a.metodo, a.zk_user_id,
                   p.nombre, p.tipo, p.inicial, p.avatar_bg, p.avatar_fg
            FROM asistencia a
            JOIN personas p ON p.id = a.persona_id
            WHERE a.fecha = CURRENT_DATE
            ORDER BY a.presente DESC, a.hora
        """)
        for r in asistencia_hoy:
            r["fecha"]    = str(r["fecha"])
            r["hora"]     = str(r["hora"]) if r.get("hora") else None
            r["presente"] = bool(r["presente"])

        historial = query("""
            SELECT a.fecha,
                   COUNT(*) AS total,
                   SUM(a.presente) AS presentes,
                   COUNT(*) - SUM(a.presente) AS ausentes
            FROM asistencia a
            JOIN personas p ON p.id = a.persona_id
            WHERE p.tipo = 'nino'
              AND a.fecha >= DATE_SUB(CURRENT_DATE, INTERVAL 30 DAY)
            GROUP BY a.fecha
            ORDER BY a.fecha DESC
        """)
        for r in historial:
            r["fecha"]     = str(r["fecha"])
            r["total"]     = int(r["total"])
            r["presentes"] = int(r["presentes"])
            r["ausentes"]  = int(r["ausentes"])
            r["pct"]       = round(r["presentes"] / r["total"] * 100, 1) if r["total"] else 0

        personas = query("""
            SELECT id, nombre, tipo, estado, edad, genero, inicial, avatar_bg, avatar_fg
            FROM personas WHERE estado = 'activo' ORDER BY tipo, nombre
        """)

        logs_timmy = query("""
            SELECT z.zk_user_id, z.timestamp, z.tipo, z.metodo, z.dispositivo, p.nombre
            FROM zkteco_logs z
            LEFT JOIN personas p ON CAST(z.zk_user_id AS UNSIGNED) = p.id
            ORDER BY z.timestamp DESC LIMIT 200
        """)
        for r in logs_timmy:
            r["timestamp"] = str(r["timestamp"])

        kpi_row = query("""
            SELECT
                (SELECT COUNT(*) FROM personas WHERE estado='activo' AND tipo='nino')   AS ninos_activos,
                (SELECT COUNT(*) FROM asistencia WHERE fecha=CURRENT_DATE AND presente=TRUE) AS presentes_hoy,
                (SELECT COUNT(*) FROM asistencia WHERE fecha=CURRENT_DATE)               AS total_ninos_hoy,
                (SELECT COUNT(*) FROM entregas WHERE fecha=CURRENT_DATE)                 AS entregas_hoy,
                (SELECT COALESCE(SUM(monto),0) FROM gastos
                 WHERE MONTH(fecha)=MONTH(CURRENT_DATE)
                   AND YEAR(fecha)=YEAR(CURRENT_DATE))                                   AS gasto_mes
        """)
        kpis = kpi_row[0] if kpi_row else {}
        for k, v in kpis.items():
            kpis[k] = float(v) if v is not None else 0

        yunatt_st = yunatt_sync.status() if YUNATT_AVAILABLE else {}

        return jsonify({
            "generado":       datetime.now().isoformat(),
            "yunatt":         yunatt_st,
            "kpis":           kpis,
            "asistencia_hoy": asistencia_hoy,
            "historial_30d":  historial,
            "personas":       personas,
            "logs_timmy":     logs_timmy,
        })
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


# ─── FONDOS ───────────────────────────────────────────────────────────────────
@app.get("/fondos/balance")
def get_fondos_balance():
    try:
        resumen = query("""
            SELECT
                COALESCE(SUM(CASE WHEN tipo='ingreso' THEN monto ELSE 0    END), 0) AS total_ingresos,
                COALESCE(SUM(CASE WHEN tipo='egreso'  THEN monto ELSE 0    END), 0) AS total_egresos,
                COALESCE(SUM(CASE WHEN tipo='ingreso' THEN monto ELSE -monto END), 0) AS balance
            FROM fondos_movimientos
        """)
        row = resumen[0] if resumen else {"total_ingresos": 0, "total_egresos": 0, "balance": 0}
        for k in row:
            row[k] = float(row[k])
        movimientos = query("""
            SELECT id, tipo, monto, descripcion, categoria, fuente, fecha
            FROM fondos_movimientos ORDER BY created_at DESC LIMIT 25
        """)
        for m in movimientos:
            m["monto"] = float(m["monto"])
            if m.get("fecha"):
                m["fecha"] = str(m["fecha"])
        return jsonify({"ok": True, **row, "movimientos": movimientos})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.post("/fondos/ingreso")
def registrar_fondo_ingreso():
    if not _require_staff():
        return jsonify({"ok": False, "error": "No autorizado"}), 403
    body = request.get_json(silent=True) or {}
    try:
        monto = float(body.get("monto", 0))
        if monto <= 0:
            return jsonify({"ok": False, "error": "El monto debe ser mayor a 0"}), 400
        id_ = query("""
            INSERT INTO fondos_movimientos (tipo, monto, descripcion, categoria, fuente, fecha)
            VALUES ('ingreso', %s, %s, %s, %s, %s)
        """, (monto, body.get("descripcion", ""),
              body.get("categoria", "Donación"),
              body.get("fuente", "donacion"),
              body.get("fecha", date.today().isoformat())), fetch=False)
        _broadcast("cambio", recurso="fondos")
        return jsonify({"ok": True, "id": id_})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.delete("/fondos/<int:id_>")
def eliminar_fondo_movimiento(id_):
    if not _require_staff():
        return jsonify({"ok": False, "error": "No autorizado"}), 403
    try:
        rows = query("SELECT fuente FROM fondos_movimientos WHERE id=%s", (id_,))
        if not rows:
            return jsonify({"ok": False, "error": "Movimiento no encontrado"}), 404
        if rows[0]["fuente"] in ("gasto", "alimentacion"):
            return jsonify({"ok": False, "error": "No se puede eliminar un egreso automático"}), 400
        query("DELETE FROM fondos_movimientos WHERE id=%s", (id_,), fetch=False)
        _broadcast("cambio", recurso="fondos")
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


# ─── DONACIONES ───────────────────────────────────────────────────────────────
@app.get("/donaciones")
def get_donaciones():
    try:
        rows = query("""
            SELECT m.*, a.nombre AS articulo, a.unidad,
                   DATE(m.creado_en) AS fecha
            FROM movimientos_almacen m
            JOIN articulos a ON a.id = m.articulo_id
            WHERE m.tipo = 'entrada' AND m.origen = 'donacion'
            ORDER BY m.creado_en DESC LIMIT 100
        """)
        for r in rows:
            if r.get("fecha"):     r["fecha"]      = str(r["fecha"])
            if r.get("creado_en"): r["creado_en"]  = str(r["creado_en"])
            r["cantidad"]    = float(r.get("cantidad", 0))
            r["costo_total"] = float(r.get("costo_total", 0))
        return jsonify(rows)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ─── YUNATT CLOUD SYNC ────────────────────────────────────────────────────────
@app.get("/yunatt/status")
def yunatt_status():
    if not YUNATT_AVAILABLE:
        return jsonify({"ok": False, "error": "yunatt_sync no disponible (pip install requests)"}), 503
    return jsonify(yunatt_sync.status())


@app.post("/yunatt/sync")
def yunatt_sync_now():
    if not _require_staff():
        return jsonify({"ok": False, "error": "No autorizado"}), 403
    if not YUNATT_AVAILABLE:
        return jsonify({"ok": False, "error": "yunatt_sync no disponible"}), 503
    result = yunatt_sync.sync()
    return jsonify(result)


# ─── YUNATT STAFF SYNC ────────────────────────────────────────────────────────

@app.get("/yunatt/staff")
def yunatt_staff_list():
    """
    Lista el staff de yunatt.com + los usuarios registrados físicamente en el
    Timmy (con sus biométricos reales en 'backupnums').
    """
    if not YUNATT_STAFF_AVAILABLE:
        return jsonify({"ok": False, "error": "yunatt_staff_sync no disponible"}), 503
    rows   = yunatt_staff_sync.get_yunatt_staff()
    device = yunatt_staff_sync.get_device_staff()
    return jsonify({"ok": True, "total": len(rows), "staff": rows, "device": device})


@app.post("/yunatt/limpiar-timmy")
def yunatt_limpiar_timmy():
    """
    Borra TODOS los usuarios del dispositivo Timmy (comando ADMS remoto) y
    del staff de yunatt.com. Protege a los superAdmin de yunatt.
    Body JSON: {"confirmar": "LIMPIAR_TIMMY"}
    """
    s = _require_admin()
    if not s:
        return jsonify({"ok": False, "error": "Solo administradores"}), 403
    if not YUNATT_STAFF_AVAILABLE:
        return jsonify({"ok": False, "error": "yunatt_staff_sync no disponible"}), 503
    body = request.get_json(silent=True) or {}
    if body.get("confirmar") != "LIMPIAR_TIMMY":
        return jsonify({"ok": False, "error": "Se requiere confirmar: 'LIMPIAR_TIMMY'"}), 400
    result = yunatt_staff_sync.limpiar_todo()
    _audit("timmy_limpiado", usuario=s.get("username"))
    _broadcast("cambio", recurso="personas")
    return jsonify(result)


@app.get("/yunatt/enroll-status/<enrollid>")
def yunatt_enroll_status(enrollid):
    """
    Estado REAL del enrolamiento en el dispositivo: si el enrollid ya está en
    el Timmy y con qué biométricos (cara/huella). Usado por el frontend para
    detectar si la persona completó o canceló el registro.
    """
    if not YUNATT_STAFF_AVAILABLE:
        return jsonify({"ok": False, "error": "yunatt_staff_sync no disponible"}), 503
    st = yunatt_staff_sync.enroll_status(enrollid)
    return jsonify({"ok": True, **st})


@app.post("/yunatt/sync-fotos")
def yunatt_sync_fotos():
    """
    Descarga las fotos que el Timmy capturó al registrar la cara (campo 'photo'
    en yunatt = /TimmyFile/...) y las guarda como foto de perfil de la persona
    del ERP (personas.foto_url). Idempotente: no re-descarga si ya está al día.
    """
    if not _require_staff():
        return jsonify({"ok": False, "error": "No autorizado"}), 403
    if not YUNATT_STAFF_AVAILABLE:
        return jsonify({"ok": False, "error": "yunatt_staff_sync no disponible"}), 503

    fotos_dir = os.path.join(os.path.dirname(__file__), "static", "fotos")
    os.makedirs(fotos_dir, exist_ok=True)
    marcador = os.path.join(fotos_dir, "_fuentes_timmy.json")
    try:
        with open(marcador, "r", encoding="utf-8") as fh:
            fuentes = json.load(fh)
    except Exception:
        fuentes = {}

    personas_ids = {str(r["id"]) for r in query("SELECT id FROM personas WHERE estado='activo'")}
    actualizadas, errores = [], []

    for s in yunatt_staff_sync.get_yunatt_staff():
        photo = s.get("photo") or ""
        sn    = str(s.get("staffNumber") or "")
        if not photo or sn not in personas_ids:
            continue
        if fuentes.get(sn) == photo:
            continue  # ya descargada esta misma foto
        contenido = yunatt_staff_sync.descargar_foto(photo)
        if not contenido:
            errores.append({"persona_id": sn, "error": "descarga fallida"})
            continue
        fname = f"persona_{sn}.jpg"
        with open(os.path.join(fotos_dir, fname), "wb") as fh:
            fh.write(contenido)
        foto_url = f"/static/fotos/{fname}"
        try:
            query("UPDATE personas SET foto_url=%s WHERE id=%s", (foto_url, int(sn)), fetch=False)
        except Exception as e:
            errores.append({"persona_id": sn, "error": str(e)})
            continue
        fuentes[sn] = photo
        actualizadas.append({"persona_id": int(sn), "foto_url": foto_url})
        log.info(f"yunatt-fotos: foto del Timmy guardada para persona {sn}")

    try:
        with open(marcador, "w", encoding="utf-8") as fh:
            json.dump(fuentes, fh)
    except Exception:
        pass

    return jsonify({"ok": True, "actualizadas": actualizadas, "errores": errores})


@app.post("/yunatt/sync-staff")
def yunatt_sync_staff_all():
    """
    Sincroniza TODAS las personas activas del ERP → yunatt.com.
    Body JSON opcional: {"tipo": "nino"|"misionero"|"voluntario"|"staff"}
    """
    if not _require_staff():
        return jsonify({"ok": False, "error": "No autorizado"}), 403
    if not YUNATT_STAFF_AVAILABLE:
        return jsonify({"ok": False, "error": "yunatt_staff_sync no disponible"}), 503
    body      = request.get_json(silent=True) or {}
    solo_tipo = body.get("tipo")
    result    = yunatt_staff_sync.sync_all(solo_tipo=solo_tipo)
    return jsonify(result)


@app.post("/yunatt/sync-staff/<int:persona_id>")
def yunatt_sync_staff_one(persona_id):
    """Sincroniza (o verifica) una sola persona hacia yunatt.com."""
    if not _require_staff():
        return jsonify({"ok": False, "error": "No autorizado"}), 403
    if not YUNATT_STAFF_AVAILABLE:
        return jsonify({"ok": False, "error": "yunatt_staff_sync no disponible"}), 503
    rows = query("SELECT id, nombre FROM personas WHERE id=%s", (persona_id,))
    if not rows:
        return jsonify({"ok": False, "error": "Persona no encontrada"}), 404
    p      = rows[0]
    result = yunatt_staff_sync.sync_one(p["id"], p["nombre"])
    return jsonify(result)


@app.post("/yunatt/habilitar-staff")
def yunatt_habilitar_staff():
    """Habilita en yunatt.com todos los staff que tengan staffStatus != 1."""
    if not _require_staff():
        return jsonify({"ok": False, "error": "No autorizado"}), 403
    if not YUNATT_STAFF_AVAILABLE:
        return jsonify({"ok": False, "error": "yunatt_staff_sync no disponible"}), 503
    result = yunatt_staff_sync.habilitar_todos()
    return jsonify({"ok": True, **result})


@app.post("/yunatt/remoteadduser-sn")
def yunatt_remoteadduser_sn():
    """Envía remoteadduser usando staffNumber directamente (no necesita persona_id del ERP)."""
    if not _require_staff():
        return jsonify({"ok": False, "error": "No autorizado"}), 403
    body    = request.get_json(silent=True) or {}
    sn      = body.get("staff_number")
    nombre  = body.get("nombre", str(sn))
    backup  = str(body.get("backup", "50"))  # 50=AI face, 0=huella
    if not sn:
        return jsonify({"ok": False, "error": "staff_number requerido"}), 400
    ok, msg = yunatt_staff_sync.remoteadduser(sn, nombre, backup)
    return jsonify({
        "ok":     ok,
        "nombre": nombre,
        "error":  msg if not ok else "",
        "aviso":  f"Comando enviado — {nombre} debe acercarse al Timmy." if ok else msg,
    })


@app.post("/yunatt/remoteadduser")
def yunatt_remoteadduser():
    """Envía comando remoteadduser al Timmy para que muestre pantalla de registro."""
    if not _require_staff():
        return jsonify({"ok": False, "error": "No autorizado"}), 403
    body    = request.get_json(silent=True) or {}
    pid     = body.get("persona_id")
    rows    = query("SELECT id, nombre FROM personas WHERE id=%s AND estado='activo'", (pid,))
    if not rows:
        return jsonify({"ok": False, "error": "Persona no encontrada o inactiva"}), 404
    p = rows[0]
    backup  = str((request.get_json(silent=True) or {}).get("backup", "50"))
    ok, err = yunatt_staff_sync.remoteadduser(p["id"], p["nombre"], backup)
    return jsonify({
        "ok":     ok,
        "nombre": p["nombre"],
        "error":  err if not ok else "",
        "aviso":  (
            f"Comando enviado. {p['nombre']} debe acercarse al Timmy para registrar cara/huella."
        ) if ok else err,
    })


@app.post("/yunatt/enrolar")
def yunatt_enrolar():
    """
    Registra una persona del ERP en yunatt.com con el método de autenticación
    indicado y la envía al Timmy TM-AI03F para activar el enrollment.

    Body JSON: {
      "persona_id": int,
      "metodo": "cara"|"contrasena"|"cualquiera",
      "password": "",
      "foto_b64": "<base64 JPEG opcional — capturada por la webcam del ERP>"
    }

    Si se incluye foto_b64, se sube junto con el staff/add para que yunatt
    la empuje al Timmy como BIOPHOTO y el dispositivo genere la plantilla facial.
    """
    if not _require_staff():
        return jsonify({"ok": False, "error": "No autorizado"}), 403
    import base64 as _b64
    if not YUNATT_STAFF_AVAILABLE:
        return jsonify({"ok": False, "error": "yunatt_staff_sync no disponible"}), 503
    body      = request.get_json(silent=True) or {}
    pid       = body.get("persona_id")
    metodo    = body.get("metodo", "cara")
    password  = body.get("password", "")
    foto_b64  = body.get("foto_b64", "")
    if not pid:
        return jsonify({"ok": False, "error": "persona_id requerido"}), 400
    rows = query("SELECT id, nombre FROM personas WHERE id=%s AND estado='activo'", (pid,))
    if not rows:
        return jsonify({"ok": False, "error": "Persona no encontrada o inactiva"}), 404
    p = rows[0]

    # Decodificar foto si se envió
    foto_bytes = None
    foto_url   = ""
    if foto_b64:
        try:
            # Quitar encabezado data:image/jpeg;base64, si lo tiene
            raw = foto_b64.split(",", 1)[-1]
            foto_bytes = _b64.b64decode(raw)

            # Guardar en bridge/static/fotos/ — Flask sirve /static/ desde ahí
            fotos_dir = os.path.join(os.path.dirname(__file__), "static", "fotos")
            os.makedirs(fotos_dir, exist_ok=True)
            foto_nombre = f"persona_{p['id']}.jpg"
            foto_path   = os.path.join(fotos_dir, foto_nombre)
            with open(foto_path, "wb") as fh:
                fh.write(foto_bytes)
            foto_url = f"/static/fotos/{foto_nombre}"
            log.info(f"yunatt-enrolar: foto guardada para persona {p['id']} ({len(foto_bytes)} bytes)")
            # Persistir URL en la persona para que el ERP la muestre
            try:
                query("UPDATE personas SET foto_url=%s WHERE id=%s", (foto_url, p["id"]), fetch=False)
            except Exception:
                pass
        except Exception as e:
            log.warning(f"yunatt-enrolar: error decodificando foto: {e}")
            foto_bytes = None

    result = yunatt_staff_sync.enrolar_en_timmy(
        p["id"], p["nombre"],
        metodo=metodo, password=password,
        foto_bytes=foto_bytes, foto_url=foto_url,
    )
    return jsonify(result)


# ─── LOGS DE ASISTENCIA ───────────────────────────────────────────────────────
@app.get("/attendance")
def get_attendance_today():
    try:
        rows = query("""
            SELECT zk_user_id AS user_id,
                   MIN(TIME(timestamp)) AS hora,
                   metodo, dispositivo
            FROM zkteco_logs
            WHERE DATE(timestamp) = CURRENT_DATE
            GROUP BY zk_user_id, metodo, dispositivo
            ORDER BY hora
        """)
        for r in rows:
            r["hora"] = str(r["hora"]) if r.get("hora") else None
        return jsonify(rows)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.get("/device/logs")
def device_logs():
    fecha   = request.args.get("fecha")
    user_id = request.args.get("user_id")
    limit   = min(int(request.args.get("limit", 1000)), 5000)
    where   = ["1=1"]
    params  = []
    if fecha:
        where.append("DATE(z.timestamp) = %s"); params.append(fecha)
    if user_id:
        where.append("z.zk_user_id = %s"); params.append(user_id)
    try:
        rows = query(f"""
            SELECT z.id, z.zk_user_id, z.timestamp, z.tipo, z.metodo,
                   z.dispositivo, z.procesado,
                   p.id AS persona_id, p.nombre, p.inicial, p.avatar_bg, p.avatar_fg,
                   p.foto_url, p.tipo AS persona_tipo,
                   (p.id IS NOT NULL AND p.estado = 'activo') AS vinculado
            FROM zkteco_logs z
            LEFT JOIN personas p ON CAST(z.zk_user_id AS UNSIGNED) = p.id
                                 AND p.estado = 'activo'
            WHERE {' AND '.join(where)}
            ORDER BY z.timestamp DESC LIMIT {limit}
        """, params or None)
        for r in rows:
            r["timestamp"] = str(r["timestamp"])
            r["procesado"] = bool(r["procesado"])
            r["vinculado"]  = bool(r["vinculado"])
        return jsonify({"total": len(rows), "registros": rows})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ─── TIMMY DIRECTO (ZKTeco SDK) ───────────────────────────────────────────────

@app.get("/timmy/ping")
def timmy_ping():
    """Verifica si el Timmy está accesible en la red local."""
    if not TIMMY_DIRECT_AVAILABLE:
        return jsonify({"ok": False, "error": "timmy_direct no disponible"}), 503
    result = timmy_direct.probar_conexion()
    return jsonify(result)


@app.get("/timmy/usuarios")
def timmy_listar_usuarios():
    """Lista todos los usuarios registrados físicamente en el Timmy."""
    if not TIMMY_DIRECT_AVAILABLE:
        return jsonify({"ok": False, "error": "timmy_direct no disponible"}), 503
    result = timmy_direct.listar_usuarios()
    return jsonify(result)


@app.post("/timmy/agregar")
def timmy_agregar_usuario():
    """
    Agrega un usuario del ERP directamente al Timmy via ZKTeco SDK.
    Body: {"persona_id": int, "pin": "<6 dígitos aleatorios si no se especifica>"}
    """
    if not _require_staff():
        return jsonify({"ok": False, "error": "No autorizado"}), 403
    if not TIMMY_DIRECT_AVAILABLE:
        return jsonify({"ok": False, "error": "timmy_direct no disponible"}), 503
    body = request.get_json(silent=True) or {}
    pid  = body.get("persona_id")
    pin  = str(body.get("pin") or str(secrets.randbelow(1000000)).zfill(6))
    if not pid:
        return jsonify({"ok": False, "error": "persona_id requerido"}), 400
    rows = query("SELECT id, nombre FROM personas WHERE id=%s AND estado='activo'", (pid,))
    if not rows:
        return jsonify({"ok": False, "error": "Persona no encontrada o inactiva"}), 404
    p      = rows[0]
    result = timmy_direct.agregar_usuario(p["id"], p["nombre"], pin=pin)
    return jsonify(result)


@app.post("/timmy/agregar-todos")
def timmy_agregar_todos():
    """
    Agrega TODAS las personas activas del ERP al Timmy directamente.
    Útil para poblar el dispositivo desde cero.
    """
    if not _require_staff():
        return jsonify({"ok": False, "error": "No autorizado"}), 403
    if not TIMMY_DIRECT_AVAILABLE:
        return jsonify({"ok": False, "error": "timmy_direct no disponible"}), 503
    personas = query("SELECT id, nombre FROM personas WHERE estado='activo' ORDER BY id")
    creados  = []
    errores  = []
    for p in personas:
        pin    = str(secrets.randbelow(1000000)).zfill(6)
        result = timmy_direct.agregar_usuario(p["id"], p["nombre"], pin=pin)
        if result.get("ok"):
            creados.append({"id": p["id"], "nombre": p["nombre"], "accion": result.get("accion")})
        else:
            errores.append({"id": p["id"], "nombre": p["nombre"], "error": result.get("error")})
    return jsonify({
        "ok":      len(errores) == 0,
        "creados": len(creados),
        "errores": len(errores),
        "detalle_creados": creados,
        "detalle_errores": errores,
    })


@app.delete("/timmy/usuarios/<int:uid>")
def timmy_eliminar_usuario(uid):
    """Elimina un usuario del Timmy por su uid (= persona.id)."""
    if not _require_staff():
        return jsonify({"ok": False, "error": "No autorizado"}), 403
    if not TIMMY_DIRECT_AVAILABLE:
        return jsonify({"ok": False, "error": "timmy_direct no disponible"}), 503
    result = timmy_direct.eliminar_usuario(uid)
    return jsonify(result)


# ─── DB RESET ─────────────────────────────────────────────────────────────────
@app.post("/db/reset")
def db_reset():
    """
    Reset del ERP. Body JSON:
      {"confirmar": "BORRAR_TODO", "limpiar_timmy": true|false}
    limpiar_timmy=true además borra los usuarios del dispositivo Timmy
    (comando ADMS remoto) y el staff de yunatt.com (protege superAdmins).
    NOTA: NO borra usuarios_sistema — los logins del ERP se conservan.
    """
    s = _require_admin()
    if not s:
        return jsonify({"ok": False, "error": "Solo administradores"}), 403
    body = request.get_json(silent=True) or {}
    if body.get("confirmar") != "BORRAR_TODO":
        return jsonify({"ok": False, "error": "Se requiere confirmar: 'BORRAR_TODO'"}), 400

    # Reautenticación: una acción destructiva e irreversible como esta no debe
    # depender solo de tener un token de sesión válido (que puede haber sido
    # robado por XSS o dejado abierto en un equipo) — se exige volver a
    # escribir la contraseña del administrador actual.
    password = (body.get("password") or "").strip()
    if not password:
        return jsonify({"ok": False, "error": "Se requiere tu contraseña para confirmar"}), 400
    user_rows = query("SELECT password_hash FROM usuarios_sistema WHERE id=%s AND activo=TRUE", (s["user_id"],))
    if not user_rows or not _verify_password(password, user_rows[0]["password_hash"]):
        return jsonify({"ok": False, "error": "Contraseña incorrecta"}), 401

    limpiar_timmy = bool(body.get("limpiar_timmy"))

    tablas = [
        "servicio_insumos", "receta_base", "servicios_alimentacion",
        "zkteco_logs", "asistencia", "entregas", "movimientos_almacen",
        "gastos", "actividad", "articulos", "campanas",
        "presupuesto_mensual", "personas", "fondos_movimientos",
    ]
    try:
        conn_db = get_db()
        cur = conn_db.cursor()
        cur.execute("SET FOREIGN_KEY_CHECKS = 0")
        for t in tablas:
            try:
                cur.execute(f"TRUNCATE TABLE `{t}`")
            except Exception as e:
                log.warning(f"TRUNCATE {t}: {e}")
        # IDs de personas nuevas desde 100 — no colisionan con staffNumbers viejos
        try:
            cur.execute("ALTER TABLE personas AUTO_INCREMENT = 100")
        except Exception:
            pass
        cur.execute("SET FOREIGN_KEY_CHECKS = 1")
        conn_db.commit()
        cur.close()
        conn_db.close()
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500

    # Borrar fotos sincronizadas y su marcador
    try:
        import glob as _glob
        fotos_dir = os.path.join(os.path.dirname(__file__), "static", "fotos")
        for f in _glob.glob(os.path.join(fotos_dir, "persona_*.jpg")):
            os.remove(f)
        marcador = os.path.join(fotos_dir, "_fuentes_timmy.json")
        if os.path.exists(marcador):
            os.remove(marcador)
    except Exception as e:
        log.warning(f"db_reset: limpiando fotos: {e}")

    # Limpiar Timmy + yunatt si se pidió
    timmy_result = None
    if limpiar_timmy and YUNATT_STAFF_AVAILABLE:
        try:
            timmy_result = yunatt_staff_sync.limpiar_todo()
        except Exception as e:
            timmy_result = {"ok": False, "error": str(e)}

    _audit("db_reset", usuario=s.get("username"), detalle=f"limpiar_timmy={limpiar_timmy}")
    for recurso in ("personas", "articulos", "gastos", "entregas", "alimentacion", "fondos", "asistencia"):
        _broadcast("cambio", recurso=recurso)

    return jsonify({
        "ok": True,
        "mensaje": "Base de datos limpiada correctamente."
                   + (" Timmy y yunatt también limpiados." if timmy_result and timmy_result.get("ok") else ""),
        "timmy": timmy_result,
    })


# ─── INICIALIZACIÓN DE TABLAS ─────────────────────────────────────────────────
def _init_usuarios():
    if not MYSQL_AVAILABLE:
        return
    try:
        query("""
            CREATE TABLE IF NOT EXISTS usuarios_sistema (
                id            INT AUTO_INCREMENT PRIMARY KEY,
                nombre        VARCHAR(100) NOT NULL,
                username      VARCHAR(50)  NOT NULL UNIQUE,
                password_hash VARCHAR(255) NOT NULL,
                rol           ENUM('admin','coordinador','voluntario') DEFAULT 'voluntario',
                activo        BOOLEAN DEFAULT TRUE,
                created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """, fetch=False)
        for alter in [
            "ALTER TABLE usuarios_sistema MODIFY rol ENUM('admin','coordinador','voluntario') DEFAULT 'voluntario'",
            "ALTER TABLE usuarios_sistema MODIFY password_hash VARCHAR(255) NOT NULL",
        ]:
            try:
                query(alter, fetch=False)
            except Exception:
                pass
        count = query("SELECT COUNT(*) AS n FROM usuarios_sistema")
        if count and count[0]["n"] == 0:
            # Contraseña aleatoria por instalación (no hardcodeada): antes esto
            # creaba admin/admin123 (y equivalentes) idénticos en cada instalación,
            # publicados en el propio repositorio — cualquiera que hubiera visto
            # el código podía loguearse como administrador.
            demos = [
                ('Administrador',   'admin',      'admin'),
                ('Coordinadora',    'coord',      'coordinador'),
                ('Voluntario Demo', 'voluntario', 'voluntario'),
            ]
            log.info("Primer arranque: creando usuarios de sistema con contraseña aleatoria —")
            for nombre, username, rol in demos:
                pw = secrets.token_urlsafe(9)
                ph = _hash_password(pw)
                query("""
                    INSERT INTO usuarios_sistema (nombre, username, password_hash, rol)
                    VALUES (%s, %s, %s, %s)
                """, (nombre, username, ph, rol), fetch=False)
                log.info(f"  {username:<12} -> {pw}  (cámbiala en el primer login)")
    except Exception as e:
        log.warning(f"_init_usuarios: {e}")


def _init_fondos():
    if not MYSQL_AVAILABLE:
        return
    try:
        query("""
            CREATE TABLE IF NOT EXISTS fondos_movimientos (
                id            INT AUTO_INCREMENT PRIMARY KEY,
                tipo          ENUM('ingreso','egreso') NOT NULL,
                monto         DECIMAL(10,2) NOT NULL,
                descripcion   VARCHAR(255) DEFAULT '',
                categoria     VARCHAR(100) DEFAULT '',
                fuente        VARCHAR(50)  DEFAULT 'manual',
                referencia_id INT          DEFAULT NULL,
                fecha         DATE         NOT NULL,
                created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
            )
        """, fetch=False)
    except Exception as e:
        log.warning(f"_init_fondos: {e}")


def _migrar_esquema():
    for sql in [
        "ALTER TABLE asistencia ADD COLUMN zk_user_id VARCHAR(20)",
        "ALTER TABLE personas MODIFY tipo ENUM('nino','misionero','voluntario','staff','padre') NOT NULL",
        "ALTER TABLE personas ADD COLUMN dni VARCHAR(30) DEFAULT ''",
        "ALTER TABLE personas ADD COLUMN fecha_nacimiento DATE",
        "ALTER TABLE personas ADD COLUMN nacionalidad VARCHAR(80) DEFAULT ''",
        "ALTER TABLE personas ADD COLUMN telefono VARCHAR(30) DEFAULT ''",
        "ALTER TABLE personas ADD COLUMN email VARCHAR(120) DEFAULT ''",
        "ALTER TABLE personas ADD COLUMN direccion TEXT",
        "ALTER TABLE personas ADD COLUMN barrio VARCHAR(100) DEFAULT ''",
        "ALTER TABLE personas ADD COLUMN parentesco_tutor VARCHAR(60) DEFAULT ''",
        "ALTER TABLE personas ADD COLUMN telefono_tutor VARCHAR(30) DEFAULT ''",
        "ALTER TABLE personas ADD COLUMN situacion_familiar VARCHAR(100) DEFAULT ''",
        "ALTER TABLE personas ADD COLUMN grupo_sanguineo VARCHAR(10) DEFAULT ''",
        "ALTER TABLE personas ADD COLUMN alergias TEXT",
        "ALTER TABLE personas ADD COLUMN condicion_medica TEXT",
        "ALTER TABLE personas ADD COLUMN escolaridad VARCHAR(100) DEFAULT ''",
        "ALTER TABLE personas ADD COLUMN colegio VARCHAR(150) DEFAULT ''",
        "ALTER TABLE personas ADD COLUMN procedencia VARCHAR(100) DEFAULT ''",
        "ALTER TABLE personas ADD COLUMN motivo_ingreso TEXT",
        "ALTER TABLE personas ADD COLUMN prioridad ENUM('alta','media','baja') DEFAULT 'media'",
        "ALTER TABLE personas ADD COLUMN observaciones TEXT",
        "ALTER TABLE personas ADD COLUMN ocupacion VARCHAR(150) DEFAULT ''",
        "ALTER TABLE personas ADD COLUMN organizacion VARCHAR(200) DEFAULT ''",
        "ALTER TABLE personas ADD COLUMN pais_origen VARCHAR(100) DEFAULT ''",
        "ALTER TABLE personas ADD COLUMN area_servicio VARCHAR(150) DEFAULT ''",
        "ALTER TABLE personas ADD COLUMN tipo_vinculo VARCHAR(100) DEFAULT ''",
        "ALTER TABLE personas ADD COLUMN fecha_fin DATE",
        "ALTER TABLE personas ADD COLUMN ingreso_familiar VARCHAR(100) DEFAULT ''",
        "ALTER TABLE personas ADD COLUMN num_hijos_programa TINYINT DEFAULT 0",
        "ALTER TABLE articulos ADD COLUMN precio DECIMAL(10,2) DEFAULT 0.00",
        "ALTER TABLE articulos ADD COLUMN descripcion TEXT",
        "ALTER TABLE articulos ADD COLUMN proveedor VARCHAR(200) DEFAULT ''",
        "ALTER TABLE articulos ADD COLUMN codigo VARCHAR(50) DEFAULT ''",
        "ALTER TABLE articulos ADD COLUMN imagen VARCHAR(255) DEFAULT ''",
        "ALTER TABLE articulos ADD COLUMN ubicacion VARCHAR(100) DEFAULT ''",
        "ALTER TABLE entregas ADD COLUMN notas TEXT",
        # Faltaba en esta lista: sin esto, POST /entregas y el registro de
        # servicios de alimentación fallaban con "Unknown column 'fecha'"
        # en cualquier base que no viniera ya con esta columna.
        "ALTER TABLE movimientos_almacen ADD COLUMN fecha DATE DEFAULT (CURRENT_DATE)",
        "ALTER TABLE movimientos_almacen ADD COLUMN origen ENUM('compra','donacion') DEFAULT 'compra'",
        "ALTER TABLE movimientos_almacen ADD COLUMN costo_total DECIMAL(10,2) DEFAULT 0.00",
        "ALTER TABLE movimientos_almacen ADD COLUMN proveedor_donante VARCHAR(200) DEFAULT ''",
        "ALTER TABLE gastos ADD COLUMN fuente_auto VARCHAR(50) DEFAULT ''",
        "ALTER TABLE servicios_alimentacion ADD COLUMN voluntarios SMALLINT DEFAULT 0",
        "ALTER TABLE servicios_alimentacion ADD COLUMN padres SMALLINT DEFAULT 0",
        "ALTER TABLE servicios_alimentacion ADD COLUMN staff SMALLINT DEFAULT 0",
        "ALTER TABLE servicios_alimentacion ADD COLUMN costo_por_plato DECIMAL(10,2) DEFAULT 0.00",
        "ALTER TABLE servicios_alimentacion ADD COLUMN consumo_json TEXT",
        "ALTER TABLE personas ADD COLUMN foto_url VARCHAR(255) DEFAULT ''",
    ]:
        try:
            query(sql, fetch=False)
        except Exception:
            pass


# ─── ASISTENCIA DIARIA ────────────────────────────────────────────────────────
def _init_asistencia_hoy():
    """
    Crea filas de asistencia para TODOS los días que faltan desde la última
    fecha registrada hasta hoy, para todas las personas activas.
    Esto garantiza que el sync de yunatt siempre encuentra filas que actualizar.
    """
    try:
        query("ALTER TABLE asistencia ADD COLUMN zk_user_id VARCHAR(20)", fetch=False)
    except Exception:
        pass

    try:
        # 1. Crear filas del día de hoy
        n = query("""
            INSERT IGNORE INTO asistencia (persona_id, fecha, presente, metodo, zk_user_id)
            SELECT id, CURRENT_DATE, FALSE, '—', CAST(id AS CHAR)
            FROM personas WHERE estado = 'activo'
        """, fetch=False)
        if n:
            log.info(f"asistencia: {n} filas creadas para hoy")

        # 2. Rellenar días sin filas de los últimos 30 días
        #    (por si el servidor no corrió esos días)
        query("""
            INSERT IGNORE INTO asistencia (persona_id, fecha, presente, metodo, zk_user_id)
            SELECT p.id, d.fecha, FALSE, '—', CAST(p.id AS CHAR)
            FROM personas p
            JOIN (
                SELECT DATE_SUB(CURRENT_DATE, INTERVAL n DAY) AS fecha
                FROM (
                    SELECT 1 AS n UNION SELECT 2 UNION SELECT 3 UNION SELECT 4
                    UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8
                    UNION SELECT 9 UNION SELECT 10 UNION SELECT 11 UNION SELECT 12
                    UNION SELECT 13 UNION SELECT 14 UNION SELECT 15 UNION SELECT 16
                    UNION SELECT 17 UNION SELECT 18 UNION SELECT 19 UNION SELECT 20
                    UNION SELECT 21 UNION SELECT 22 UNION SELECT 23 UNION SELECT 24
                    UNION SELECT 25 UNION SELECT 26 UNION SELECT 27 UNION SELECT 28
                    UNION SELECT 29 UNION SELECT 30
                ) nums
            ) d ON 1=1
            WHERE p.estado = 'activo'
        """, fetch=False)

    except Exception as e:
        log.warning(f"_init_asistencia_hoy: {e}")


# ─── YUNATT AUTO-SYNC ─────────────────────────────────────────────────────────
_last_asistencia_date = None

def _yunatt_auto_loop(interval_seconds=300):
    global _last_asistencia_date
    log.info(f"yunatt: auto-sync activo — intervalo {interval_seconds}s")
    time.sleep(15)
    while True:
        try:
            # Crear filas de asistencia si cambió el día
            from datetime import date as _date
            hoy = _date.today()
            if _last_asistencia_date != hoy:
                _init_asistencia_hoy()
                _last_asistencia_date = hoy

            yunatt_sync.sync()
        except Exception as e:
            log.error(f"yunatt auto-sync error: {e}")
        time.sleep(interval_seconds)


# ─── BOOTSTRAP ────────────────────────────────────────────────────────────────
# Inicialización de esquema + hilos de fondo. Antes vivía solo dentro de
# `if __name__ == "__main__":`, así que SOLO se ejecutaba con
# `python bridge/server.py`. Bajo un servidor WSGI de producción (gunicorn),
# el proceso importa el módulo `server` y usa el objeto `app` directamente —
# nunca ejecuta ese bloque — así que la base de datos nunca se inicializaba
# y el sync de yunatt/el watcher de asistencia nunca arrancaban. Se movió a
# una función de módulo, llamada incondicionalmente al importar, para que
# funcione igual con `python bridge/server.py` (dev en Windows) y con
# gunicorn (producción en Docker).
_bootstrap_hecho = False


def _bootstrap():
    global _bootstrap_hecho
    if _bootstrap_hecho:
        return
    _bootstrap_hecho = True

    log.info("=" * 50)
    log.info("  ERP Lost Children  — puerto 7793")
    log.info("  Asistencia: yunatt.com (sync cada 5 min)")
    log.info("=" * 50)

    _init_usuarios()
    _init_fondos()
    _migrar_esquema()
    _init_asistencia_hoy()

    if YUNATT_AVAILABLE:
        threading.Thread(target=_yunatt_auto_loop, args=(20,), daemon=True).start()
        log.info("yunatt: auto-sync iniciado en background (cada 20 s)")
    else:
        log.warning("yunatt: pip install requests para sync automático")

    if WS_AVAILABLE and MYSQL_AVAILABLE:
        threading.Thread(target=_asistencia_watcher, daemon=True).start()
        log.info("websocket: tiempo real activo en /ws/asistencia")


_bootstrap()


# ─── MAIN (solo para `python bridge/server.py` — dev en Windows) ─────────────
# gunicorn (producción/Docker) NO ejecuta este bloque: importa `app`
# directamente y maneja bind/TLS con sus propios flags (--certfile/--keyfile),
# ver Dockerfile/docker-compose.yml.
if __name__ == "__main__":
    # ─── TLS opcional ──────────────────────────────────────────────────────
    # El bridge servía en HTTP plano incluso siendo dueño de datos sensibles
    # de menores (DNI, salud, dirección) y del token de sesión — cualquiera
    # en la misma red podía capturarlos por sniffing. Se activa TLS solo si
    # hay certificado disponible en bridge/ssl/ (self-signed, CN=IP de la
    # LAN) y ENABLE_TLS no está puesto en "false" en bridge/.env — así no se
    # rompe el acceso de nadie sin que el equipo lo decida explícitamente.
    # Si el certificado no coincide con el hostname/IP que se use para
    # entrar (p.ej. cambió la IP por DHCP), el navegador mostrará una
    # advertencia adicional de "nombre no coincide" — regenerar el cert con
    # la IP/dominio correcto en ese caso.
    _ssl_dir      = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ssl")
    _cert_path    = os.path.join(_ssl_dir, "cert.pem")
    _key_path     = os.path.join(_ssl_dir, "key.pem")
    _enable_tls   = env("ENABLE_TLS", "auto").strip().lower()
    _cert_existe  = os.path.isfile(_cert_path) and os.path.isfile(_key_path)

    ssl_context = None
    if _enable_tls == "true" or (_enable_tls == "auto" and _cert_existe):
        if _cert_existe:
            ssl_context = (_cert_path, _key_path)
            log.info(f"TLS: activado (bridge/ssl/cert.pem) — servir en https://<ip-o-host>:7793")
        else:
            log.warning("ENABLE_TLS=true pero no se encontró bridge/ssl/cert.pem o key.pem — sirviendo en HTTP")
    else:
        log.warning(
            "TLS: DESACTIVADO — el tráfico (login, token de sesión, datos de menores) viaja sin cifrar "
            "en la red. Pon ENABLE_TLS=true en bridge/.env con un certificado en bridge/ssl/ para activarlo."
        )

    app.run(host="0.0.0.0", port=7793, debug=False, ssl_context=ssl_context)
