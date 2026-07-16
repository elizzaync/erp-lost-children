"""
timmy_direct.py — Conexión directa al Timmy TM-AI03F via ZKTeco SDK (pyzk)
y como fallback via la interfaz web local del dispositivo.

Por qué directo: yunatt.com no enlaza usuarios al dispositivo (attenceMachineIds
queda vacío a pesar de enviar attenceMachineId en /staff/add).

El Timmy sigue enviando marcas de asistencia a yunatt (ADMS), lo que es correcto.
Solo usamos esta conexión directa para GESTIÓN de usuarios (add/delete/PIN).

Uso:
    from timmy_direct import agregar_usuario, listar_usuarios, probar_conexion

Requisito: pip install pyzk
"""

import logging
import socket
import time

log = logging.getLogger("timmy-direct")

TIMMY_IP   = "192.168.18.145"
TIMMY_PORT = 4370          # Puerto ZK estándar (UDP/TCP)
TIMMY_PWD  = 0             # Contraseña del dispositivo (0 = sin contraseña)
TIMEOUT    = 8
TCP_CHECK_TIMEOUT = 2      # Timeout para pre-check TCP antes de intentar ZK


def _port_open(ip, port, timeout=TCP_CHECK_TIMEOUT):
    """Verifica rápidamente si el puerto TCP está abierto."""
    try:
        s = socket.create_connection((ip, port), timeout=timeout)
        s.close()
        return True
    except Exception:
        return False


def _get_zk():
    """Obtiene conexión ZKTeco. Lanza excepción si pyzk no está instalado."""
    try:
        from zk import ZK
    except ImportError:
        raise RuntimeError("pyzk no instalado. Ejecuta: pip install pyzk")
    zk = ZK(TIMMY_IP, port=TIMMY_PORT, timeout=TIMEOUT, password=TIMMY_PWD,
            force_udp=False, ommit_ping=False)
    return zk


_ZK_NOT_SUPPORTED_MSG = (
    "El TM-AI03F usa protocolo ADMS (conexión saliente). "
    "No expone el SDK ZK clásico (puerto 4370). "
    "El enrollment debe hacerse físicamente en el dispositivo: "
    "Menú Admin → Gestión de usuarios → Nuevo usuario."
)


def probar_conexion():
    """
    Verifica si el Timmy responde en la red local.
    Retorna {"ok": True/False, "metodo": "zk"|"ping", "info": {...}}
    """
    # 1. Ping TCP rápido — verifica que el dispositivo está en red
    ping_ok = _port_open(TIMMY_IP, 4370, timeout=2) or _port_open(TIMMY_IP, 23, timeout=2)
    if not ping_ok:
        # Último intento: ICMP no disponible en Python puro; usamos socket a cualquier puerto
        ping_ok = _port_open(TIMMY_IP, 5005, timeout=2)

    if not ping_ok:
        return {
            "ok":    False,
            "error": f"No se puede alcanzar {TIMMY_IP}. "
                     "Verifica que el ERP esté en la misma red WiFi que el Timmy.",
        }

    # 2. El dispositivo está en red pero puerto 4370 no está abierto
    if not _port_open(TIMMY_IP, TIMMY_PORT, timeout=2):
        return {
            "ok":    False,
            "ip":    TIMMY_IP,
            "aviso": _ZK_NOT_SUPPORTED_MSG,
            "error": _ZK_NOT_SUPPORTED_MSG,
        }

    # 3. Puerto 4370 abierto — intentar conexión ZK real
    try:
        zk   = _get_zk()
        conn = zk.connect()
        info = conn.get_device_info() if hasattr(conn, "get_device_info") else {}
        conn.disconnect()
        return {"ok": True, "metodo": "zk", "ip": TIMMY_IP, "info": str(info)}
    except Exception as e:
        return {
            "ok":    False,
            "ip":    TIMMY_IP,
            "error": f"Puerto 4370 abierto pero ZK SDK falló: {e}",
        }


def agregar_usuario(uid, nombre, pin="0000", privilegio=0):
    """
    Agrega o actualiza un usuario en el Timmy directamente via ZK SDK.

    Returns:
        {"ok": True/False, "accion": "creado"|"actualizado"|"error", ...}
    """
    # Pre-check: ¿está el puerto 4370 abierto? Falla rápido si no.
    if not _port_open(TIMMY_IP, TIMMY_PORT, timeout=2):
        return {"ok": False, "error": _ZK_NOT_SUPPORTED_MSG, "uid": uid, "nombre": nombre}

    try:
        from zk import ZK
        from zk.user import User
    except ImportError:
        return {"ok": False, "error": "pyzk no instalado. pip install pyzk"}

    zk = ZK(TIMMY_IP, port=TIMMY_PORT, timeout=TIMEOUT, password=TIMMY_PWD,
            force_udp=False, ommit_ping=False)
    conn = None
    try:
        conn = zk.connect()
        conn.disable_device()

        # Revisar si ya existe
        users      = conn.get_users()
        uid_int    = int(uid)
        existentes = {int(u.uid): u for u in users}
        accion     = "actualizado" if uid_int in existentes else "creado"

        # Crear/actualizar usuario
        user = User(
            uid        = uid_int,
            name       = nombre[:24],
            privilege  = privilegio,
            password   = str(pin)[:8],
            group_id   = "",
            user_id    = str(uid_int),
        )
        conn.set_user(
            uid       = uid_int,
            name      = nombre[:24],
            privilege = privilegio,
            password  = str(pin)[:8],
            group_id  = "",
            user_id   = str(uid_int),
        )

        conn.enable_device()
        conn.disconnect()
        log.info(f"timmy-direct: usuario {uid_int} '{nombre}' {accion} con PIN {pin}")
        return {
            "ok":     True,
            "accion": accion,
            "uid":    uid_int,
            "nombre": nombre,
            "pin":    pin,
            "nota":   "Usuario en el dispositivo. Para cara: la persona debe acercarse al Timmy una vez.",
        }
    except Exception as e:
        if conn:
            try:
                conn.enable_device()
                conn.disconnect()
            except Exception:
                pass
        log.error(f"timmy-direct: error al agregar {uid}: {e}")
        return {"ok": False, "error": str(e), "uid": uid, "nombre": nombre}


def listar_usuarios():
    """
    Lista todos los usuarios registrados en el Timmy via ZK SDK.
    Retorna {"ok": True, "usuarios": [...]} o {"ok": False, "error": ...}
    """
    if not _port_open(TIMMY_IP, TIMMY_PORT, timeout=2):
        return {"ok": False, "error": _ZK_NOT_SUPPORTED_MSG, "usuarios": []}

    try:
        from zk import ZK
    except ImportError:
        return {"ok": False, "error": "pyzk no instalado. pip install pyzk"}

    zk   = ZK(TIMMY_IP, port=TIMMY_PORT, timeout=TIMEOUT, password=TIMMY_PWD,
              force_udp=False, ommit_ping=False)
    conn = None
    try:
        conn  = zk.connect()
        users = conn.get_users()
        conn.disconnect()
        result = []
        for u in users:
            result.append({
                "uid":       u.uid,
                "user_id":   u.user_id,
                "nombre":    u.name,
                "privilegio": u.privilege,
                "tiene_pin": bool(u.password),
                "tiene_cara": False,  # pyzk no expone cara
            })
        return {"ok": True, "total": len(result), "usuarios": result}
    except Exception as e:
        if conn:
            try:
                conn.disconnect()
            except Exception:
                pass
        return {"ok": False, "error": str(e)}


def eliminar_usuario(uid):
    """Elimina un usuario del Timmy por su uid."""
    if not _port_open(TIMMY_IP, TIMMY_PORT, timeout=2):
        return {"ok": False, "error": _ZK_NOT_SUPPORTED_MSG}

    try:
        from zk import ZK
    except ImportError:
        return {"ok": False, "error": "pyzk no instalado. pip install pyzk"}

    zk   = ZK(TIMMY_IP, port=TIMMY_PORT, timeout=TIMEOUT, password=TIMMY_PWD,
              force_udp=False, ommit_ping=False)
    conn = None
    try:
        conn = zk.connect()
        conn.disable_device()
        conn.delete_user(uid=int(uid))
        conn.enable_device()
        conn.disconnect()
        return {"ok": True, "uid": uid}
    except Exception as e:
        if conn:
            try:
                conn.enable_device()
                conn.disconnect()
            except Exception:
                pass
        return {"ok": False, "error": str(e)}
