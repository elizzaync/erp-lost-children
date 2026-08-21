# -*- coding: utf-8 -*-
"""
auth.py — identidad, sesiones y permisos.

QUÉ RESUELVE

Hasta la Fase 1 el login era decorativo: comprobaba que los dos campos no
estuvieran vacíos y entraba. Los 48 endpoints estaban abiertos a quien
llegara al puerto. Esto construye la autenticación por primera vez.

DÓNDE SE APLICA DE VERDAD

En el backend, con el decorador @requiere. Esconder botones en la interfaz
es comodidad, no seguridad: el frontend corre en el navegador de cada
persona y cualquiera puede llamar a la API directamente. Si solo hiciéramos
lo segundo, el sistema parecería protegido sin estarlo.

CONTRASEÑAS

pbkdf2_hmac de la librería estándar — sin dependencias nuevas, coherente
con el resto del proyecto. Salt aleatorio por usuario. El algoritmo y las
iteraciones van DENTRO del hash, así que subirlas dentro de unos años no
invalida las claves ya guardadas.

Una contraseña no se registra nunca: ni en logs, ni en la tabla de
intentos, ni al fallar.
"""
import base64
import functools
import hashlib
import logging
import re
import secrets
import unicodedata
from datetime import datetime, timedelta

from flask import g, jsonify, request

import config
import db

log = logging.getLogger("auth")


# ── Contraseñas ───────────────────────────────────────────────────────────

def hashear(clave):
    """'clave' -> 'pbkdf2_sha256$240000$<salt>$<hash>'."""
    if len(str(clave or "")) < config.CLAVE_MINIMA:
        raise ValueError(f"La contraseña debe tener al menos {config.CLAVE_MINIMA} caracteres")
    salt = secrets.token_bytes(16)
    it = config.PBKDF2_ITERACIONES
    dk = hashlib.pbkdf2_hmac("sha256", str(clave).encode("utf-8"), salt, it)
    b64 = lambda x: base64.b64encode(x).decode("ascii")
    return f"pbkdf2_sha256${it}${b64(salt)}${b64(dk)}"


def verificar(clave, guardado):
    """
    Comparación en tiempo constante. Con '==' el tiempo de respuesta
    delataría cuántos bytes del hash coinciden.
    """
    try:
        algoritmo, it, salt_b64, hash_b64 = str(guardado).split("$")
        if algoritmo != "pbkdf2_sha256":
            return False
        dk = hashlib.pbkdf2_hmac("sha256", str(clave or "").encode("utf-8"),
                                 base64.b64decode(salt_b64), int(it))
        return secrets.compare_digest(dk, base64.b64decode(hash_b64))
    except (ValueError, TypeError, AttributeError):
        return False


# ── Nombres de usuario y claves de rol ────────────────────────────────────

def _sin_tildes(texto):
    return "".join(c for c in unicodedata.normalize("NFKD", str(texto or ""))
                   if not unicodedata.combining(c))


def normalizar_clave_rol(nombre):
    """
    'Teen Leader', ' teen  leader ' y 'Teen-Leader' -> 'teen_leader'.
    Es lo que impide que el mismo cargo entre tres veces escrito distinto.
    """
    base = _sin_tildes(nombre).lower().strip()
    base = re.sub(r"[^a-z0-9]+", "_", base).strip("_")
    return base or "rol"


def sugerir_usuario(nombre_completo, ya_usados=()):
    """
    'Ps. Josué Ramírez Vega' -> 'jramirez'. Con choque, añade número.
    Se ignoran los tratamientos (Ps., Lic., Dr.) al buscar el nombre.
    """
    limpio = _sin_tildes(nombre_completo).lower()
    limpio = re.sub(r"\b(ps|lic|dr|dra|sr|sra|mg|ing)\.?\s+", " ", limpio)
    partes = [p for p in re.split(r"[^a-z0-9]+", limpio) if p]
    if not partes:
        base = "usuario"
    elif len(partes) == 1:
        base = partes[0]
    else:
        base = partes[0][0] + partes[1]
    base = base[:20]
    usados = {str(u).lower() for u in ya_usados}
    if base not in usados:
        return base
    n = 2
    while f"{base}{n}" in usados:
        n += 1
    return f"{base}{n}"


# ── Bloqueo por intentos fallidos ─────────────────────────────────────────

def _desde():
    return (datetime.now() - timedelta(minutes=config.LOGIN_BLOQUEO_MIN)
            ).strftime("%Y-%m-%d %H:%M:%S")


def esta_bloqueado(usuario, ip):
    """
    ¿Hay demasiados fallos recientes de este usuario o desde esta IP?
    Devuelve los minutos que faltan, o 0 si puede intentar.
    """
    limite = config.LOGIN_MAX_INTENTOS
    filas = db.consultar(
        """SELECT MAX(cuando) AS ultimo, COUNT(*) AS n FROM intentos_login
            WHERE exito = 0 AND cuando >= ? AND (usuario = ? OR ip = ?)""",
        (_desde(), str(usuario or "").lower(), str(ip or "")),
    )
    if not filas or (filas[0]["n"] or 0) < limite:
        return 0
    try:
        ultimo = datetime.strptime(filas[0]["ultimo"], "%Y-%m-%d %H:%M:%S")
    except (ValueError, TypeError):
        return config.LOGIN_BLOQUEO_MIN
    faltan = (ultimo + timedelta(minutes=config.LOGIN_BLOQUEO_MIN) - datetime.now())
    return max(0, int(faltan.total_seconds() // 60) + 1)


def anotar_intento(usuario, ip, exito):
    db.ejecutar(
        "INSERT INTO intentos_login (usuario, ip, exito) VALUES (?, ?, ?)",
        (str(usuario or "").lower(), str(ip or ""), 1 if exito else 0),
    )
    if exito:
        # Un ingreso correcto limpia el contador: si no, quien acertó a la
        # sexta seguiría bloqueado.
        db.ejecutar(
            "DELETE FROM intentos_login WHERE exito = 0 AND (usuario = ? OR ip = ?)",
            (str(usuario or "").lower(), str(ip or "")),
        )


# ── Sesiones ──────────────────────────────────────────────────────────────

def abrir_sesion(usuario_id, ip="", agente=""):
    """Crea la sesión y devuelve (token, csrf)."""
    token = secrets.token_urlsafe(32)
    csrf = secrets.token_urlsafe(32)
    db.ejecutar(
        """INSERT INTO sesiones_usuario (token, usuario_id, csrf, ip, agente)
           VALUES (?, ?, ?, ?, ?)""",
        (token, usuario_id, csrf, str(ip or "")[:60], str(agente or "")[:200]),
    )
    db.ejecutar(
        "UPDATE usuarios SET ultimo_acceso = datetime('now','localtime') WHERE id = ?",
        (usuario_id,),
    )
    return token, csrf


def cerrar_sesion(token):
    return db.ejecutar("DELETE FROM sesiones_usuario WHERE token = ?", (token,))


def cerrar_sesiones_de(usuario_id):
    """Suspender a alguien tiene que echarlo en el acto, no al caducar."""
    return db.ejecutar("DELETE FROM sesiones_usuario WHERE usuario_id = ?", (usuario_id,))


def purgar_sesiones():
    """Quita las caducadas por tope absoluto o por inactividad."""
    return db.ejecutar(
        """DELETE FROM sesiones_usuario
            WHERE creada <= datetime('now','localtime', ?)
               OR ultima <= datetime('now','localtime', ?)""",
        (f"-{config.SESION_HORAS} hours",
         f"-{config.SESION_INACTIVIDAD_MIN} minutes"),
    )


def sesion_de(token):
    """
    La sesión viva de ese token, con su usuario, rol y permisos, o None.
    Renueva 'ultima' para que la inactividad se cuente desde ahora.
    """
    if not token:
        return None
    purgar_sesiones()
    filas = db.consultar(
        """SELECT s.token, s.csrf, s.creada, s.ultima,
                  u.id AS usuario_id, u.usuario, u.estado, u.debe_cambiar,
                  u.personal_id, r.clave AS rol, r.nombre AS rol_nombre,
                  p.nombre AS nombre
             FROM sesiones_usuario s
             JOIN usuarios u ON u.id = s.usuario_id
             JOIN roles r    ON r.id = u.rol_id
             LEFT JOIN personal p ON p.id = u.personal_id
            WHERE s.token = ?""",
        (token,),
    )
    if not filas:
        return None
    ses = filas[0]
    if ses["estado"] != "activo":
        cerrar_sesiones_de(ses["usuario_id"])
        return None
    db.ejecutar(
        "UPDATE sesiones_usuario SET ultima = datetime('now','localtime') WHERE token = ?",
        (token,),
    )
    ses["permisos"] = permisos_de_rol(ses["rol"])
    return ses


# ── Permisos ──────────────────────────────────────────────────────────────

def permisos_de_rol(clave_rol):
    """
    {modulo: nivel} para todos los módulos del catálogo. Los que no tengan
    fila valen 'ninguno': un módulo nuevo nace cerrado, no abierto.
    """
    mapa = {m: "ninguno" for m in config.CLAVES_MODULO}
    for f in db.consultar(
        """SELECT pr.modulo, pr.nivel FROM permisos_rol pr
             JOIN roles r ON r.id = pr.rol_id
            WHERE r.clave = ?""",
        (clave_rol,),
    ):
        if f["modulo"] in mapa:
            mapa[f["modulo"]] = f["nivel"]
    # El Director lo puede todo por definición; si no, un permiso mal
    # guardado podría dejar al sistema sin nadie capaz de arreglarlo.
    if clave_rol == config.ROL_DIRECTOR:
        mapa = {m: "edicion" for m in config.CLAVES_MODULO}
    return mapa


def puede(sesion, modulo, nivel="vista"):
    if not sesion:
        return False
    return config.nivel_alcanza((sesion.get("permisos") or {}).get(modulo, "ninguno"),
                                nivel)


# ── Registro de accesos ───────────────────────────────────────────────────

def anotar_acceso(sesion, modulo, accion, resultado):
    """
    Quién tocó qué. 'usuario' se guarda como texto además del id para que
    el registro siga siendo legible aunque la cuenta se borre después.
    """
    try:
        db.ejecutar(
            """INSERT INTO accesos
                   (usuario_id, usuario, modulo, accion, metodo, ruta, resultado, ip)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            ((sesion or {}).get("usuario_id"),
             (sesion or {}).get("usuario", "(sin sesión)"),
             modulo, accion, request.method, request.path, int(resultado),
             (request.headers.get("X-Forwarded-For") or request.remote_addr or "")[:60]),
        )
    except Exception:
        # El registro no puede tumbar la operación que estaba auditando.
        log.exception("no se pudo anotar el acceso")


# ── El decorador ──────────────────────────────────────────────────────────

def csrf_valido(sesion):
    """
    ¿Trae esta petición el token CSRF de su sesión?

    Vivía dentro del decorador 'requiere', así que solo protegía a los
    endpoints que piden permiso de módulo. Los de autoservicio no lo piden
    —trabajan sobre la persona de la sesión— y se quedaban escribiendo sin
    esta comprobación: otra web podía hacer que tu navegador pidiera un
    permiso, o cancelara el tuyo, aprovechando tu sesión abierta.

    Las lecturas no lo necesitan: no cambian nada.
    """
    if request.method not in ("POST", "PUT", "PATCH", "DELETE"):
        return True
    if not sesion:
        return True          # sin sesión no hay nada de lo que aprovecharse
    enviado = request.headers.get("X-CSRF-Token", "")
    return secrets.compare_digest(str(enviado), str(sesion.get("csrf") or ""))


def sesion_actual():
    """La sesión de esta petición, cacheada en 'g' para no repetir consulta."""
    if not hasattr(g, "_sesion"):
        g._sesion = sesion_de(request.cookies.get(config.COOKIE_NOMBRE))
    return g._sesion


def requiere(modulo, nivel="vista"):
    """
    Protege un endpoint. Sin sesión -> 401; con sesión sin permiso -> 403.

    Mientras LOGIN_ESTRICTO sea False, quien no traiga sesión pasa con
    permisos completos: es la fase de convivencia, para que nadie se quede
    fuera mientras se reparten las cuentas. Con True, sin cuenta no se
    entra.
    """
    if modulo not in config.CLAVES_MODULO:
        raise ValueError(f"Módulo desconocido: {modulo!r}")
    if nivel not in config.NIVELES:
        raise ValueError(f"Nivel desconocido: {nivel!r}")

    def envoltura(fn):
        @functools.wraps(fn)
        def dentro(*args, **kwargs):
            ses = sesion_actual()

            if ses is None:
                if config.LOGIN_ESTRICTO:
                    anotar_acceso(None, modulo, nivel, 401)
                    return jsonify({"ok": False, "error": "Inicia sesión para continuar",
                                    "motivo": "sin_sesion"}), 401
                # Convivencia: se deja pasar, pero queda anotado.
                anotar_acceso(None, modulo, nivel, 200)
                return fn(*args, **kwargs)

            if not puede(ses, modulo, nivel):
                anotar_acceso(ses, modulo, nivel, 403)
                return jsonify({"ok": False,
                                "error": f"Tu rol «{ses['rol_nombre']}» no tiene "
                                         f"permiso de {nivel} en este módulo",
                                "motivo": "sin_permiso"}), 403

            # Con sesión, las peticiones que ESCRIBEN exigen el token CSRF:
            # sin esto, otra web podría hacer que tu navegador enviara
            # peticiones al sistema aprovechando tu sesión abierta.
            if not csrf_valido(ses):
                anotar_acceso(ses, modulo, nivel, 403)
                return jsonify({"ok": False,
                                "error": "Petición sin token de seguridad válido",
                                "motivo": "csrf"}), 403

            anotar_acceso(ses, modulo, nivel, 200)
            return fn(*args, **kwargs)
        return dentro
    return envoltura


def solo_director(fn):
    """
    Solo un Director puede crear o tocar a otro Director. RRHH gestiona
    todo lo demás, pero no puede otorgar ese rol —ni a nadie ni a sí
    mismo—, o el límite no serviría de nada.
    """
    @functools.wraps(fn)
    def dentro(*args, **kwargs):
        ses = sesion_actual()
        if ses is None and not config.LOGIN_ESTRICTO:
            return fn(*args, **kwargs)
        if not ses or ses.get("rol") != config.ROL_DIRECTOR:
            return jsonify({"ok": False,
                            "error": "Solo un Director puede realizar esta acción",
                            "motivo": "solo_director"}), 403
        return fn(*args, **kwargs)
    return dentro
