"""
yunatt_sync.py  —  Sincroniza marcas de asistencia desde global.yunatt.com
hacia MySQL (tablas zkteco_logs y asistencia).

El Timmy TM-AI03F ya envía las marcas a global.yunatt.com correctamente.
Este módulo las descarga desde ahí y las mete al ERP.

Dependencia extra:  pip install requests
"""

import re
import ssl
import logging
import threading
from datetime import datetime, date

import requests
import mysql.connector
from requests.adapters import HTTPAdapter
from urllib3.util.ssl_ import create_urllib3_context

log = logging.getLogger("yunatt")

from config import env

BASE     = "https://global.yunatt.com"
EMAIL    = env("YUNATT_EMAIL")
PASSWORD = env("YUNATT_PASSWORD")

DB_CONFIG = {
    "host":      "localhost",
    "user":      "root",
    "password":  "",
    "database":  "erp_lost_children",
    "charset":   "utf8mb4",
    "use_unicode": True,
}

_session     = None          # requests.Session autenticada
_last_sync   = None          # datetime del último sync exitoso
_last_result = {}            # resultado del último sync
_sync_lock   = threading.Lock()


# ─── DB ────────────────────────────────────────────────────────────────────────

def _db():
    return mysql.connector.connect(**DB_CONFIG)


# ─── TLS FIX ───────────────────────────────────────────────────────────────────

class _TLS13Adapter(HTTPAdapter):
    def init_poolmanager(self, *args, **kwargs):
        ctx = create_urllib3_context()
        ctx.minimum_version = ssl.TLSVersion.TLSv1_3
        ctx.maximum_version = ssl.TLSVersion.TLSv1_3
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        kwargs["ssl_context"] = ctx
        super().init_poolmanager(*args, **kwargs)


def _new_session():
    s = requests.Session()
    s.headers.update({
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        ),
    })
    s.mount("https://", _TLS13Adapter())
    return s


# ─── AUTH ──────────────────────────────────────────────────────────────────────

def _login():
    global _session
    s = _new_session()
    try:
        # Paso 1: GET la página raíz para descubrir la URL del form de login
        r0 = s.get(BASE + "/", timeout=15, allow_redirects=True)
        login_page_url = r0.url
        log.info(f"yunatt: página inicial → {login_page_url}")

        # Paso 2: Buscar el action del formulario en el HTML
        html = r0.text
        m = re.search(
            r'<form[^>]+action=["\']([^"\']*(?:login|Login)[^"\']*)["\']',
            html, re.IGNORECASE
        )
        if m:
            action = m.group(1)
            login_url = action if action.startswith("http") else BASE + action
            log.info(f"yunatt: form action descubierta: {login_url}")
        else:
            # Fallback: probar URLs comunes
            login_url = None
            for candidate in [
                f"{BASE}/index/toLogin",
                f"{BASE}/toLogin",
                f"{BASE}/login",
            ]:
                try:
                    rp = s.get(candidate, timeout=10, allow_redirects=True)
                    if rp.status_code == 200 and "email" in rp.text.lower():
                        mp = re.search(
                            r'<form[^>]+action=["\']([^"\']*)["\']',
                            rp.text, re.IGNORECASE
                        )
                        if mp:
                            act = mp.group(1)
                            login_url = act if act.startswith("http") else BASE + act
                            log.info(f"yunatt: form action en {candidate}: {login_url}")
                            break
                except Exception:
                    pass

            if not login_url:
                # Último recurso: usar URL del login page con sufijo de acción común
                base_path = "/".join(login_page_url.rstrip("/").split("/")[:-1])
                login_url = base_path + "/emailLogin"
                log.info(f"yunatt: usando URL inferida: {login_url}")

        # Paso 3: POST con credenciales
        s.headers["Referer"] = login_page_url
        r = s.post(
            login_url,
            data={"email": EMAIL, "password": PASSWORD},
            allow_redirects=True,
            timeout=20,
        )
        log.info(f"yunatt: POST login → status={r.status_code}  url={r.url}  cookies={dict(s.cookies)}")

        if "JSESSIONID" in s.cookies:
            _session = s
            log.info("yunatt: login OK ✓")
            return True

        log.error(f"yunatt: login fallido — no hay JSESSIONID tras POST a {login_url}")
        return False
    except Exception as e:
        log.error(f"yunatt: login error: {e}")
        return False


def _ensure_session():
    """Devuelve sesión activa, re-haciendo login si expiró."""
    global _session
    if _session is None:
        _login()
    return _session


def _session_valid(s):
    """Comprueba si la sesión sigue activa (GET a página protegida)."""
    try:
        r = s.get(f"{BASE}/index/index", timeout=10, allow_redirects=False)
        return r.status_code == 200
    except Exception:
        return False


# ─── OBTENER MONTH DATA ID ─────────────────────────────────────────────────────

def _get_month_data_id():
    """
    Obtiene el monthDataId del mes actual scrapeando la página de registros.
    Si no lo encuentra ahí, prueba el endpoint de lista de meses.
    """
    global _session
    s = _ensure_session()
    if not s:
        return None

    for intento in range(2):
        try:
            r = s.get(f"{BASE}/cardRecord/monthIndex", timeout=20, allow_redirects=True)

            # Detectar redirección a login → sesión expirada
            if "login" in r.url.lower() or r.status_code in (302, 401, 403):
                if intento == 0:
                    _session = None
                    s = _ensure_session()
                    continue
                return None

            html = r.text

            # Patrones en orden de confiabilidad
            patterns = [
                r'"monthDataId"\s*:\s*(\d+)',
                r"monthDataId\s*=\s*['\"]?(\d+)",
                r'name=["\']monthDataId["\'][^>]*value=["\'](\d+)["\']',
                r'value=["\'](\d+)["\'][^>]*selected',
                r'monthDataId[^0-9]*(\d{4,6})',
            ]
            for pat in patterns:
                m = re.search(pat, html, re.IGNORECASE)
                if m:
                    mid = int(m.group(1))
                    log.info(f"yunatt: monthDataId={mid}")
                    return mid

            # Intentar endpoint de lista de meses (distintas rutas posibles)
            for path in ("/cardRecord/queryMonthData", "/cardRecord/monthDataList",
                         "/cardRecord/listMonth", "/cardRecord/queryMonth"):
                try:
                    r2 = s.post(f"{BASE}{path}",
                                data={"limit": 6, "offset": 0, "order": "desc"},
                                timeout=10)
                    if r2.status_code == 200:
                        data = r2.json()
                        rows = data.get("rows", data.get("data", data.get("list", [])))
                        if rows and isinstance(rows, list):
                            first = rows[0]
                            mid = int(first.get("id", first.get("monthDataId", 0)))
                            if mid:
                                log.info(f"yunatt: monthDataId={mid} (via {path})")
                                return mid
                except Exception:
                    pass

            log.warning(
                "yunatt: no se encontró monthDataId — "
                f"fragmento HTML: {html[2000:2500]}"
            )
            return None

        except Exception as e:
            log.error(f"yunatt: _get_month_data_id intento {intento}: {e}")
            if intento == 0:
                _session = None
                s = _ensure_session()

    return None


# ─── DESCARGAR REGISTROS ───────────────────────────────────────────────────────

def _fetch_rows(month_data_id, limit=500):
    """Descarga filas de asistencia para el mes dado."""
    s = _ensure_session()
    if not s:
        return []
    try:
        r = s.post(
            f"{BASE}/cardRecord/queryForMonth",
            data={
                "order":       "asc",
                "offset":      0,
                "limit":       limit,
                "monthDataId": month_data_id,
            },
            timeout=20,
        )
        if r.status_code == 200:
            data = r.json()
            rows = data.get("rows", [])
            log.info(f"yunatt: {len(rows)} filas recibidas (total={data.get('total',0)})")
            return rows
        log.error(f"yunatt: queryForMonth status={r.status_code}")
        return []
    except Exception as e:
        log.error(f"yunatt: _fetch_rows error: {e}")
        return []


# ─── PARSEAR → REGISTROS ───────────────────────────────────────────────────────

def _parse(rows):
    """
    Convierte filas yunatt en lista de dicts {user_id, timestamp, nombre}.

    Cada campo "day-YYYY-MM-DD" puede tener:
      - Un solo valor:       "08:45"
      - Múltiples marcas:    "08:45<br>17:30"   (varias entradas/salidas)
      - Hora sospechosa:     "01:24"             (dispositivo sin hora correcta)

    Se generan registros para TODAS las marcas del día.
    Las marcas con hora entre 00:00-05:00 se marcan como sospechosas pero
    se guardan igual — podrían ser turno nocturno real.
    """
    records = []
    for row in rows:
        uid  = str(row.get("staffNumber", "")).strip()
        name = str(row.get("staffName",   "")).strip()
        if not uid:
            continue

        for key, val in row.items():
            if not key.startswith("day-") or not val:
                continue

            day_str  = key[4:]              # "2026-07-11"
            raw      = str(val).strip()

            # yunatt puede devolver varias marcas separadas por <br> o saltos
            time_parts = re.split(r"<br\s*/?>|\n|\|", raw, flags=re.IGNORECASE)

            for time_str in time_parts:
                time_str = time_str.strip()
                if not time_str:
                    continue
                try:
                    ts = datetime.strptime(f"{day_str} {time_str}", "%Y-%m-%d %H:%M")
                    hora = ts.hour

                    # Hora entre 00:00-05:00 puede ser dispositivo sin hora correcta
                    if hora < 5:
                        log.warning(
                            f"yunatt: marca sospechosa (hora device incorrecta?) "
                            f"uid={uid} nombre={name!r} ts={ts} — se guarda igual"
                        )

                    records.append({
                        "user_id":   uid,
                        "nombre":    name,
                        "timestamp": ts,
                        "tipo":      "entrada",
                        "metodo":    "facial",
                    })
                except ValueError:
                    log.warning(f"yunatt: no se pudo parsear hora uid={uid} day={day_str!r} val={time_str!r}")

    log.info(f"yunatt: {len(records)} registros parseados de {len(rows)} filas")
    return records


# ─── GUARDAR EN MySQL ──────────────────────────────────────────────────────────

def _save(records):
    """
    Inserta en zkteco_logs y reconcilia con tabla asistencia.

    Lógica de reconciliación:
    - Si la persona NO está marcada presente: la marca como presente con la hora recibida.
    - Si ya está presente PERO la hora guardada es sospechosa (00:00-05:00) y la nueva
      hora es más razonable (>= 05:00): actualiza la hora con el valor correcto.
      Esto soluciona el caso donde el dispositivo tenía hora incorrecta y luego
      el usuario la corrigió y volvió a marcar.
    """
    if not records:
        return 0
    conn = _db()
    cur  = conn.cursor()
    saved = 0
    try:
        for rec in records:
            uid  = rec["user_id"]
            ts   = rec["timestamp"]
            hora = ts.time()
            fecha = ts.date()

            # Insertar log (IGNORE evita duplicados exactos por (user_id, timestamp))
            cur.execute("""
                INSERT IGNORE INTO zkteco_logs
                    (zk_user_id, timestamp, tipo, metodo, dispositivo)
                VALUES (%s, %s, %s, %s, 'TIMMY-CLOUD')
            """, (uid, ts, rec["tipo"], rec["metodo"]))

            if cur.rowcount:
                saved += 1

            # ─── Reconciliar con tabla asistencia ────────────────────────────
            # Garantizar que exista fila para esta fecha (puede no existir si el
            # servidor no corrió ese día o la persona se registró tarde)
            cur.execute("""
                INSERT IGNORE INTO asistencia
                    (persona_id, fecha, presente, metodo, zk_user_id)
                SELECT id, %s, FALSE, '—', CAST(id AS CHAR)
                FROM personas
                WHERE CAST(id AS CHAR) = %s AND estado = 'activo'
            """, (fecha, uid))

            # Caso 1: No está presente → marcar presente
            cur.execute("""
                UPDATE asistencia
                SET presente   = TRUE,
                    hora       = %s,
                    metodo     = 'facial',
                    zk_user_id = %s
                WHERE fecha  = %s
                  AND presente = FALSE
                  AND (zk_user_id = %s OR CAST(persona_id AS CHAR) = %s)
            """, (hora, uid, fecha, uid, uid))

            # Caso 2: Ya está presente con hora sospechosa (00:00-05:00) y
            # la nueva marca tiene hora razonable (>= 05:00) → actualizar hora
            if hora.hour >= 5:
                cur.execute("""
                    UPDATE asistencia
                    SET hora   = %s,
                        metodo = 'facial'
                    WHERE fecha    = %s
                      AND presente = TRUE
                      AND hora     < '05:00:00'
                      AND (zk_user_id = %s OR CAST(persona_id AS CHAR) = %s)
                """, (hora, fecha, uid, uid))
                if cur.rowcount:
                    log.info(
                        f"yunatt: corregida hora sospechosa para uid={uid} "
                        f"fecha={fecha} nueva_hora={hora}"
                    )

        conn.commit()
    finally:
        cur.close()
        conn.close()
    return saved


# ─── SYNC PÚBLICO ──────────────────────────────────────────────────────────────

def sync():
    """
    Ciclo completo: login → monthDataId → registros → MySQL.
    Seguro para llamar desde múltiples threads.
    Retorna dict con resultado.
    """
    global _last_sync, _last_result

    if not _sync_lock.acquire(blocking=False):
        return {"ok": True, "estado": "ya_en_curso", **_last_result}

    try:
        mid = _get_month_data_id()
        if not mid:
            _last_result = {"ok": False, "error": "No se pudo obtener monthDataId de yunatt.com"}
            return _last_result

        rows    = _fetch_rows(mid)
        records = _parse(rows)
        nuevas  = _save(records)

        _last_sync   = datetime.now()
        _last_result = {
            "ok":          True,
            "monthDataId": mid,
            "total":       len(records),
            "nuevas":      nuevas,
            "ultimo_sync": _last_sync.strftime("%Y-%m-%d %H:%M:%S"),
        }
        log.info(
            f"yunatt sync OK — monthDataId={mid}  "
            f"marcas={len(records)}  nuevas={nuevas}"
        )
        return _last_result

    except Exception as e:
        log.exception("yunatt sync error")
        _last_result = {"ok": False, "error": str(e)}
        return _last_result
    finally:
        _sync_lock.release()


def status():
    """Estado actual del sync (para el endpoint /yunatt/status)."""
    return {
        "sesion_activa": _session is not None,
        "ultimo_sync":   _last_sync.strftime("%Y-%m-%d %H:%M:%S") if _last_sync else None,
        **_last_result,
    }
