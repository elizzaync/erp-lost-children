"""
yunatt_staff_sync.py — Sincroniza personas del ERP → staff de yunatt.com

Lógica:
  1. Lee personas activas desde MySQL
  2. Obtiene staff registrado en yunatt.com
  3. Para cada persona no registrada → la agrega en yunatt.com
     usando staffNumber = persona.id  (así el sync de marcas la reconoce)
  4. Opcionalmente la asigna al dispositivo TM-AI03F para registro remoto

Endpoint en server.py:
  POST /yunatt/sync-staff           → sincroniza todas las personas
  GET  /yunatt/staff                → lista staff actual en yunatt.com
  POST /yunatt/sync-staff/<id>      → sincroniza una sola persona
"""

import logging
import re
import ssl
import threading
from datetime import date

import mysql.connector
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.ssl_ import create_urllib3_context

log = logging.getLogger("yunatt-staff")

from config import env

BASE        = "https://global.yunatt.com"
DEPT_ID     = 38015          # departamento "Elizabeth" en yunatt.com
DEPT_NAME   = "Elizabeth"
DEVICE_ID   = 22952          # attenceMachineId del TM-AI03F
EMAIL       = env("YUNATT_EMAIL")
PASSWORD    = env("YUNATT_PASSWORD")

DB_CONFIG = {
    "host":      env("DB_HOST", "localhost"),
    "user":      env("DB_USER", "root"),
    "password":  env("DB_PASSWORD", ""),
    "database":  env("DB_NAME", "erp_lost_children"),
    "charset":   "utf8mb4",
    "use_unicode": True,
}

_session     = None
_sync_lock   = threading.Lock()
_last_result = {}


# ─── TLS FIX ──────────────────────────────────────────────────────────────────
# yunatt.com requiere TLS 1.3 explícito; la negociación automática de requests
# (TLS 1.2/1.3) produce timeout de handshake en Windows con OpenSSL 3.x.
# La verificación del certificado se deja en su valor por defecto
# (check_hostname=True, verify_mode=CERT_REQUIRED): desactivarla permitiría un
# MITM que capture credenciales de yunatt y fotos faciales del personal.

class _TLS13Adapter(HTTPAdapter):
    def init_poolmanager(self, *args, **kwargs):
        ctx = create_urllib3_context()
        ctx.minimum_version = ssl.TLSVersion.TLSv1_3
        ctx.maximum_version = ssl.TLSVersion.TLSv1_3
        kwargs["ssl_context"] = ctx
        super().init_poolmanager(*args, **kwargs)


def _new_session():
    s = requests.Session()
    s.headers.update({"User-Agent": "Mozilla/5.0"})
    adapter = _TLS13Adapter()
    s.mount("https://", adapter)
    return s


# ─── AUTH ─────────────────────────────────────────────────────────────────────

def _login():
    global _session
    s = _new_session()
    try:
        r0  = s.get(BASE + "/", timeout=15, allow_redirects=True)
        html = r0.text
        m   = re.search(r'<form[^>]+action=["\']([^"\']*(?:login|Login)[^"\']*)["\']', html, re.IGNORECASE)
        url = (BASE + m.group(1)) if m else (BASE + "/login/emailLogin")
        s.headers["Referer"] = r0.url
        r = s.post(url, data={"email": EMAIL, "password": PASSWORD},
                   allow_redirects=True, timeout=20)
        if "JSESSIONID" in s.cookies:
            _session = s
            log.info("yunatt-staff: login OK")
            return True
        log.error("yunatt-staff: login fallido")
        return False
    except Exception as e:
        log.error(f"yunatt-staff: login error: {e}")
        return False


def _get_session():
    global _session
    if _session is None:
        _login()
    return _session


# ─── STAFF EN YUNATT ──────────────────────────────────────────────────────────

def get_yunatt_staff():
    """Devuelve todos los staff registrados en yunatt.com como lista de dicts."""
    s = _get_session()
    if not s:
        return []
    try:
        r = s.post(BASE + "/staff/query",
                   data={"limit": 5000, "offset": 0}, timeout=20)
        if r.status_code == 200:
            return r.json().get("rows", [])
    except Exception as e:
        log.error(f"yunatt-staff: get_yunatt_staff error: {e}")
    return []


def get_device_staff():
    """
    Usuarios registrados FÍSICAMENTE en el Timmy, con sus biométricos reales.
    POST /attenceMachine/queryStaff → rows con enrollid, name, backupnums.
    backupnums: 50=cara AI, 0-9=huella, 10=PIN, 11=tarjeta IC.
    """
    s = _get_session()
    if not s:
        return []
    hdrs = {"X-Requested-With": "XMLHttpRequest", "Referer": BASE + "/staff/index"}
    for intento in range(2):
        try:
            r = s.post(BASE + "/attenceMachine/queryStaff",
                       data={"attenceMachineId": str(DEVICE_ID)},
                       headers=hdrs, timeout=20)
            if r.status_code == 200:
                try:
                    return r.json().get("rows", [])
                except ValueError:
                    # Sesión expirada → HTML de login; re-login y reintento
                    if intento == 0 and _login():
                        s = _session
                        continue
                    return []
        except Exception as e:
            log.error(f"yunatt-staff: get_device_staff error: {e}")
            return []
    return []


def descargar_foto(photo_path):
    """
    Descarga la foto capturada por el Timmy desde yunatt (/TimmyFile/...).
    Es pública — no requiere sesión. Retorna bytes o None.
    """
    if not photo_path:
        return None
    try:
        s = _new_session()
        r = s.get(BASE + photo_path, timeout=20)
        if r.status_code == 200 and r.content[:3] == b"\xff\xd8\xff":
            return r.content
    except Exception as e:
        log.error(f"yunatt-staff: descargar_foto {photo_path} error: {e}")
    return None


def _post_json(path, data, referer="/staff/index"):
    """POST con manejo de sesión expirada (re-login + 1 reintento). Retorna dict o None."""
    s = _get_session()
    if not s:
        return None
    hdrs = {"X-Requested-With": "XMLHttpRequest", "Referer": BASE + referer}
    for intento in range(2):
        try:
            r = s.post(BASE + path, data=data, headers=hdrs, timeout=25)
            if r.status_code != 200:
                return {"result": False, "errorMsg": f"HTTP {r.status_code}"}
            try:
                return r.json()
            except ValueError:
                if intento == 0 and _login():
                    s = _session
                    continue
                return {"result": False, "errorMsg": "SESSION_EXPIRED"}
        except Exception as e:
            log.error(f"yunatt-staff: POST {path} error: {e}")
            return {"result": False, "errorMsg": str(e)}
    return None


def _post_con_ids(path, ids, extra_key=None, extra_val=None):
    """
    POST que envía listas probando ambos estilos de serialización
    ('ids' repetido y 'ids[]' estilo jQuery). Retorna (ok, errorMsg).
    """
    ids = [str(i) for i in ids]
    for sufijo in ("", "[]"):
        data = {f"ids{sufijo}": ids}
        if extra_key:
            data[f"{extra_key}{sufijo}"] = extra_val
        d = _post_json(path, data)
        if d and d.get("result"):
            return True, ""
        err = (d or {}).get("errorMsg", "sin respuesta")
        log.warning(f"yunatt-staff: {path} (estilo '{sufijo or 'plano'}') fallo: {err}")
    return False, err


def remove_from_device(yunatt_ids):
    """
    Envía comando ADMS para BORRAR usuarios del dispositivo Timmy.
    yunatt_ids: lista de IDs INTERNOS de yunatt (campo 'id' de staff/query).
    """
    if not yunatt_ids:
        return True, "sin usuarios que borrar"
    ok, err = _post_con_ids("/staff/removeInMachine", yunatt_ids,
                            extra_key="attenceMachineIds", extra_val=[str(DEVICE_ID)])
    if ok:
        log.info(f"yunatt-staff: removeInMachine OK ids={yunatt_ids}")
    return ok, err


def remove_from_cloud(yunatt_ids):
    """Borra staff de yunatt.com (nube). yunatt_ids: IDs internos de yunatt."""
    if not yunatt_ids:
        return True, "sin staff que borrar"
    ok, err = _post_con_ids("/staff/batchRemove", yunatt_ids)
    if ok:
        log.info(f"yunatt-staff: batchRemove OK ids={yunatt_ids}")
    return ok, err


def eliminar_persona_completo(persona_id):
    """
    Borra a UNA persona del dispositivo Timmy (comando ADMS) y de la nube
    yunatt, buscándola por staffNumber (= persona_id del ERP).
    Retorna dict resumen. Nunca toca superAdmins.
    """
    sid = str(persona_id)
    row = next((r for r in get_yunatt_staff()
                if str(r.get("staffNumber")) == sid and not r.get("superAdmin")), None)
    if not row:
        return {"ok": True, "en_yunatt": False,
                "aviso": f"staffNumber {sid} no está en yunatt — nada que borrar"}
    dev_ok, dev_err     = remove_from_device([row["id"]])
    cloud_ok, cloud_err = remove_from_cloud([row["id"]])
    return {
        "ok":        dev_ok and cloud_ok,
        "en_yunatt": True,
        "device_ok": dev_ok,
        "cloud_ok":  cloud_ok,
        "errores":   [e for e in (dev_err, cloud_err) if e],
    }


def limpiar_todo(proteger_admins=True):
    """
    Limpieza total: borra usuarios del dispositivo Timmy (comando ADMS) y
    luego el staff de la nube yunatt. Protege por defecto a los superAdmin
    (la cuenta 'eli' que administra yunatt).
    Retorna resumen dict.
    """
    rows = get_yunatt_staff()
    if not rows:
        return {"ok": True, "device": 0, "cloud": 0, "aviso": "yunatt ya está vacío"}

    borrables = [r for r in rows if not (proteger_admins and r.get("superAdmin"))]
    ids = [r["id"] for r in borrables]
    protegidos = [r.get("name") for r in rows if r not in borrables]

    dev_ok, dev_err     = remove_from_device(ids)
    cloud_ok, cloud_err = remove_from_cloud(ids)

    return {
        "ok":         dev_ok and cloud_ok,
        "device":     len(ids) if dev_ok else 0,
        "cloud":      len(ids) if cloud_ok else 0,
        "protegidos": protegidos,
        "errores":    [e for e in (dev_err, cloud_err) if e and "sin" not in e],
    }


def enroll_status(enrollid):
    """
    Estado real de un enrollid en el dispositivo: si está y qué biométricos tiene.
    Retorna {"en_dispositivo": bool, "backupnums": [...], "tiene_cara": bool,
             "tiene_huella": bool, "foto": "/TimmyFile/..." | ""}.
    """
    sid = str(enrollid)
    dev = next((d for d in get_device_staff() if str(d.get("enrollid")) == sid), None)
    nums = (dev or {}).get("backupnums") or []
    foto = ""
    if dev:
        srow = next((s for s in get_yunatt_staff() if str(s.get("staffNumber")) == sid), None)
        foto = (srow or {}).get("photo") or ""
    return {
        "en_dispositivo": dev is not None,
        "backupnums":     nums,
        "tiene_cara":     50 in nums,
        "tiene_huella":   any(0 <= n <= 9 for n in nums),
        "foto":           foto,
    }


def _staff_numbers_en_yunatt():
    """Devuelve set de staffNumbers ya registrados en yunatt.com."""
    rows = get_yunatt_staff()
    return {str(r.get("staffNumber", "")) for r in rows}


# ─── AGREGAR PERSONA A YUNATT ─────────────────────────────────────────────────

def agregar_persona(persona_id, nombre, assign_device=True):
    """
    Agrega una persona a yunatt.com con staffNumber = persona_id.
    Si assign_device=True, la asigna al dispositivo TM-AI03F para
    que aparezca en Remote Add (el dispositivo puede registrarla luego).

    Retorna: {"ok": True/False, "accion": "creado"/"ya_existe"/"error", ...}
    """
    global _session
    s = _get_session()
    if not s:
        return {"ok": False, "accion": "error", "error": "No hay sesión con yunatt.com"}

    staff_id_str = str(persona_id)

    # Verificar si ya existe
    existing = _staff_numbers_en_yunatt()
    if staff_id_str in existing:
        return {"ok": True, "accion": "ya_existe", "staffNumber": staff_id_str, "nombre": nombre}

    data = {
        "id":           "",
        "longid":       "10",
        "enrollid":     staff_id_str,
        "staffNumber":  staff_id_str,
        "name":         nombre[:50],
        "sex":          "0",
        "departmentId": str(DEPT_ID),
        "department":   DEPT_NAME,
        "staffDate":    date.today().isoformat(),
        "staffStatus":  "1",
        "idNumber":     "",
        "icCard":       "",
        "punchPwd":     "",
        "mobile":       "",
        "email":        "",
        "address":      "",
        "imgSrc":       "",
        "punch":        "1",    # yunatt solo acepta 0/1; TM-AI03F usa cara igual
    }
    if assign_device:
        data["attenceMachineId"]  = str(DEVICE_ID)
        data["attenceMachineIds"] = str(DEVICE_ID)

    hdrs = {
        "X-Requested-With": "XMLHttpRequest",
        "Referer": BASE + "/staff/addUI",
    }

    try:
        r = s.post(BASE + "/staff/add", data=data, files={}, headers=hdrs, timeout=20)
        # Éxito: responde con HTML de la página (no JSON de error)
        if r.status_code == 200 and '"result":false' not in r.text:
            log.info(f"yunatt-staff: persona {staff_id_str} '{nombre}' agregada OK")
            return {"ok": True, "accion": "creado", "staffNumber": staff_id_str, "nombre": nombre}
        else:
            # Reintentar con sesión nueva
            _session = None
            s2 = _get_session()
            if s2:
                r2 = s2.post(BASE + "/staff/add", data=data, files={}, headers=hdrs, timeout=20)
                if r2.status_code == 200 and '"result":false' not in r2.text:
                    log.info(f"yunatt-staff: persona {staff_id_str} '{nombre}' agregada OK (reintento)")
                    return {"ok": True, "accion": "creado", "staffNumber": staff_id_str, "nombre": nombre}
            log.warning(f"yunatt-staff: fallo al agregar {staff_id_str}: {r.text[:100]}")
            return {"ok": False, "accion": "error", "error": r.text[:100],
                    "staffNumber": staff_id_str, "nombre": nombre}
    except Exception as e:
        log.error(f"yunatt-staff: agregar_persona {staff_id_str} error: {e}")
        return {"ok": False, "accion": "error", "error": str(e),
                "staffNumber": staff_id_str, "nombre": nombre}


# ─── HABILITAR STAFF DESHABILITADO ────────────────────────────────────────────

def habilitar_todos():
    """
    Recorre todos los staff en yunatt.com y activa los que tienen staffStatus != '1'.
    Retorna {"habilitados": N, "errores": N}
    """
    s = _get_session()
    if not s:
        return {"habilitados": 0, "errores": 0}

    rows = get_yunatt_staff()
    habilitados = 0
    errores     = 0

    hdrs = {
        "X-Requested-With": "XMLHttpRequest",
        "Referer": BASE + "/staff/addUI",
    }

    for row in rows:
        if str(row.get("staffStatus", "1")) == "1":
            continue  # ya habilitado

        staff_id    = str(row.get("id", ""))
        staff_num   = str(row.get("staffNumber", ""))
        nombre      = row.get("name", "")

        data = {
            "id":           staff_id,
            "longid":       str(row.get("longId", "10")),
            "enrollid":     str(row.get("enrollId", staff_num)),
            "staffNumber":  staff_num,
            "name":         nombre,
            "sex":          str(row.get("sex", "0")),
            "departmentId": str(row.get("departmentId", DEPT_ID)),
            "department":   str(row.get("department", DEPT_NAME)),
            "staffDate":    str(row.get("staffDate", date.today().isoformat()))[:10],
            "staffStatus":  "1",
            "idNumber":     str(row.get("idNumber", "")),
            "icCard":       str(row.get("icCard", "")),
            "punchPwd":     str(row.get("punchPwd", "")),
            "mobile":       str(row.get("mobile", "")),
            "email":        str(row.get("email", "")),
            "address":      str(row.get("address", "")),
            "imgSrc":       str(row.get("imgSrc", "")),
            "punch":        str(row.get("punch", "15")),
            "attenceMachineId": str(DEVICE_ID),
        }

        try:
            # yunatt usa el mismo /staff/add con id interno relleno para actualizar
            r = s.post(BASE + "/staff/add", data=data, files={}, headers=hdrs, timeout=20)
            if r.status_code == 200 and '"result":false' not in r.text:
                log.info(f"yunatt-staff: habilitado staffNumber={staff_num} '{nombre}'")
                habilitados += 1
            else:
                log.warning(f"yunatt-staff: error habilitando {staff_num}: {r.text[:120]}")
                errores += 1
        except Exception as e:
            log.error(f"yunatt-staff: habilitar_todos {staff_num} error: {e}")
            errores += 1

    log.info(f"yunatt-staff: habilitar_todos → habilitados={habilitados} errores={errores}")
    return {"habilitados": habilitados, "errores": errores}


# ─── SYNC COMPLETO ERP → YUNATT ───────────────────────────────────────────────

def sync_all(solo_tipo=None, assign_device=True):
    """
    Sincroniza TODAS las personas activas del ERP a yunatt.com.

    Args:
        solo_tipo: si se especifica ('nino','misionero','voluntario','staff'),
                   solo sincroniza ese tipo. None = todos.
        assign_device: si True, asigna cada persona al dispositivo TM-AI03F.

    Retorna dict con resumen.
    """
    global _last_result
    if not _sync_lock.acquire(blocking=False):
        return {"ok": True, "estado": "ya_en_curso", **_last_result}

    try:
        # 1. Obtener personas del ERP
        conn = mysql.connector.connect(**DB_CONFIG)
        cur  = conn.cursor(dictionary=True)
        if solo_tipo:
            cur.execute("SELECT id, nombre, tipo FROM personas WHERE estado='activo' AND tipo=%s ORDER BY id",
                        (solo_tipo,))
        else:
            cur.execute("SELECT id, nombre, tipo FROM personas WHERE estado='activo' ORDER BY id")
        personas = cur.fetchall()
        cur.close()
        conn.close()
        log.info(f"yunatt-staff: {len(personas)} personas a sincronizar")

        # 2. Obtener set de staffNumbers ya en yunatt
        existing = _staff_numbers_en_yunatt()
        log.info(f"yunatt-staff: {len(existing)} ya registrados en yunatt.com")

        # 3. Agregar las que faltan
        creados   = []
        ya_existen = []
        errores   = []

        for p in personas:
            sid = str(p["id"])
            if sid in existing:
                ya_existen.append({"staffNumber": sid, "nombre": p["nombre"]})
                continue

            res = agregar_persona(p["id"], p["nombre"], assign_device=assign_device)
            if res["ok"] and res["accion"] == "creado":
                creados.append(res)
            elif res["ok"] and res["accion"] == "ya_existe":
                ya_existen.append(res)
            else:
                errores.append(res)

        # Habilitar automáticamente los que quedaron con staffStatus=0
        hab = habilitar_todos()

        _last_result = {
            "ok":              True,
            "total_erp":       len(personas),
            "creados":         len(creados),
            "ya_existen":      len(ya_existen),
            "errores":         len(errores),
            "habilitados":     hab["habilitados"],
            "detalle_creados": creados,
            "detalle_errores": errores,
        }
        log.info(
            f"yunatt-staff sync OK — "
            f"creados={len(creados)} ya_existían={len(ya_existen)} "
            f"habilitados={hab['habilitados']} errores={len(errores)}"
        )
        return _last_result

    except Exception as e:
        log.exception("yunatt-staff sync error")
        _last_result = {"ok": False, "error": str(e)}
        return _last_result
    finally:
        _sync_lock.release()


def sync_one(persona_id, nombre, assign_device=True):
    """Sincroniza una sola persona. Útil al crear o actualizar en el ERP."""
    return agregar_persona(persona_id, nombre, assign_device=assign_device)


# ─── ENROLAR EN TIMMY ─────────────────────────────────────────────────────────

# yunatt.com solo acepta punch=0 o punch=1.
# El TM-AI03F es face-only: usa cara independientemente de este valor.
# Para PIN: la contraseña se envía en punchPwd; punch sigue siendo "1".
_PUNCH = {
    "cara":       "1",
    "contrasena": "1",
    "cualquiera": "1",
}

def _remoteadduser(session, enrollid, nombre, backup="50"):
    """
    Envía comando ADMS 'remoteadduser' al Timmy vía yunatt.
    El dispositivo muestra pantalla de registro — la persona debe acercarse y registrar cara/huella.
    backup: "50"=AI face (TM-AI03F), "0"-"9"=huella, "10"=PIN.
    Retorna (ok: bool, mensaje: str).
    """
    try:
        hdrs = {
            "X-Requested-With": "XMLHttpRequest",
            "Referer": BASE + "/staff/index",
        }
        r = session.post(BASE + "/staff/remoteadduser", data={
            "adduserenrollid": str(enrollid),
            "addusername":     str(nombre)[:50],
            "adduserbackups":  str(backup),
            "attenceMachineId": str(DEVICE_ID),
        }, headers=hdrs, timeout=15)
        if r.status_code == 200:
            try:
                d = r.json()
            except ValueError:
                # No es JSON → la sesión expiró y yunatt devolvió el HTML de login
                return False, "SESSION_EXPIRED"
            if d.get("result"):
                log.info(f"yunatt-staff: remoteadduser OK enrollid={enrollid} '{nombre}' backup={backup}")
                return True, ""
            else:
                err = d.get("errorMsg", r.text[:80])
                log.warning(f"yunatt-staff: remoteadduser fallido {enrollid}: {err}")
                return False, err
        return False, f"HTTP {r.status_code}"
    except Exception as e:
        log.error(f"yunatt-staff: remoteadduser {enrollid} error: {e}")
        return False, str(e)


def remoteadduser(enrollid, nombre, backup="50"):
    """
    Wrapper con manejo de sesión: re-loguea automáticamente si la sesión expiró.
    Retorna (ok: bool, mensaje: str).
    """
    s = _get_session()
    if not s:
        return False, "Sin sesión yunatt"
    ok, msg = _remoteadduser(s, enrollid, nombre, backup)
    if not ok and msg == "SESSION_EXPIRED":
        log.info("yunatt-staff: sesión expirada, re-login y reintento")
        if _login():
            ok, msg = _remoteadduser(_session, enrollid, nombre, backup)
        else:
            return False, "No se pudo renovar sesión yunatt"
    return ok, msg



def enrolar_en_timmy(persona_id, nombre, metodo="cara", password="", foto_bytes=None, foto_url=""):
    """
    Registra una persona en yunatt.com y la asigna al Timmy TM-AI03F.

    foto_bytes: bytes JPEG de la foto del rostro (capturada desde el ERP).
                yunatt la incluye en el sync al dispositivo como BIOPHOTO.
                El Timmy procesa la foto y genera su propia plantilla facial.
    foto_url:   URL pública de la foto (fallback si foto_bytes no aplica).
    """
    global _session
    s = _get_session()
    if not s:
        return {"ok": False, "error": "Sin sesión con yunatt.com"}

    if not password:
        # PIN aleatorio de 6 dígitos por persona (antes era "0000" fijo para
        # todo el mundo — un PIN público, trivial y compartido para marcar
        # por teclado como alternativa a la biometría).
        import secrets as _secrets
        password = "".join(_secrets.choice("0123456789") for _ in range(6))

    punch_val = _PUNCH.get(metodo, "1")
    staff_id_str = str(persona_id)

    hdrs = {
        "X-Requested-With": "XMLHttpRequest",
        "Referer": BASE + "/staff/addUI",
    }

    # Buscar si ya existe en yunatt para obtener su id interno
    rows = get_yunatt_staff()
    existing = {str(r.get("staffNumber", "")): r for r in rows}
    existing_row = existing.get(staff_id_str)
    yunatt_internal_id = str(existing_row["id"]) if existing_row else ""

    data = {
        "id":               yunatt_internal_id,
        "longid":           "10",
        "enrollid":         staff_id_str,
        "staffNumber":      staff_id_str,
        "name":             nombre[:50],
        "sex":              "0",
        "departmentId":     str(DEPT_ID),
        "department":       DEPT_NAME,
        "staffDate":        date.today().isoformat(),
        "staffStatus":      "1",
        "idNumber":         "",
        "icCard":           "",
        "punchPwd":         str(password)[:8],
        "mobile":           "",
        "email":            "",
        "address":          "",
        "imgSrc":           "",   # No enviar URL local — yunatt no puede acceder a ella
        "punch":            punch_val,
        # Probar ambas variantes del campo para asegurar que yunatt enlace el dispositivo
        "attenceMachineId":  str(DEVICE_ID),
        "attenceMachineIds": str(DEVICE_ID),
    }

    # Preparar foto para multipart (yunatt la empuja al Timmy como BIOPHOTO)
    files_payload = {}
    if foto_bytes:
        files_payload["img"] = ("face.jpg", foto_bytes, "image/jpeg")

    # NOTA: el TM-AI03F usa ADMS (tráfico saliente del dispositivo hacia yunatt).
    # yunatt NO puede empujar usuarios al dispositivo — attenceMachineIds siempre queda vacío.
    # El enrollment real requiere presencia física en el Timmy (Menú Admin → Nuevo usuario).
    instruccion_fisica = (
        f"Ve al Timmy → Menú Admin → Gestión de usuarios. "
        f"Busca o crea el ID {staff_id_str} ({nombre}). "
        f"Registra la cara mirando a la cámara. "
        f"Desde ese momento puede marcar con su cara cada día."
    )

    # ── Si YA existe en yunatt: enviar remoteadduser directamente ───────────────
    if yunatt_internal_id:
        log.info(f"yunatt-staff: {staff_id_str} ya existe en yunatt (id={yunatt_internal_id}), enviando remoteadduser")
        remote_ok, remote_err = _remoteadduser(s, staff_id_str, nombre)
        return {
            "ok":          remote_ok,
            "accion":      "ya_registrado",
            "staffNumber": staff_id_str,
            "nombre":      nombre,
            "metodo":      metodo,
            "remote_ok":   remote_ok,
            "aviso":       (
                f"Comando enviado al Timmy. {nombre} debe acercarse al dispositivo "
                "y registrar su cara/huella cuando aparezca la pantalla de registro."
            ) if remote_ok else remote_err,
        }

    # ── Persona NUEVA: agregar en yunatt y luego enviar remoteadduser ────────────
    try:
        r = s.post(BASE + "/staff/add", data=data, files=files_payload, headers=hdrs, timeout=30)
        ok = r.status_code == 200 and '"result":false' not in r.text

        if not ok:
            _session = None
            s2 = _get_session()
            if s2:
                r = s2.post(BASE + "/staff/add", data=data, files=files_payload, headers=hdrs, timeout=30)
                ok = r.status_code == 200 and '"result":false' not in r.text

        if ok:
            log.info(f"yunatt-staff: registrado en nube {staff_id_str} '{nombre}'")
            remote_ok, remote_err = _remoteadduser(s, staff_id_str, nombre)
            return {
                "ok":          True,
                "accion":      "creado",
                "staffNumber": staff_id_str,
                "nombre":      nombre,
                "metodo":      metodo,
                "punch":       punch_val,
                "remote_ok":   remote_ok,
                "aviso":       (
                    f"Registrado en yunatt. Comando enviado al Timmy — {nombre} debe "
                    "acercarse al dispositivo para registrar su cara/huella."
                ) if remote_ok else (
                    f"Registrado en yunatt. Para activar en el Timmy: {instruccion_fisica}"
                ),
            }
        else:
            log.warning(f"yunatt-staff: error al crear {staff_id_str}: {r.text[:120]}")
            return {"ok": False, "error": f"yunatt error: {r.text[:80]}",
                    "staffNumber": staff_id_str, "nombre": nombre}

    except Exception as e:
        log.error(f"yunatt-staff: enrolar_en_timmy {staff_id_str} error: {e}")
        return {"ok": False, "error": str(e)}


def status():
    """Estado del último sync."""
    return {
        "staff_en_yunatt": len(get_yunatt_staff()),
        **_last_result,
    }
