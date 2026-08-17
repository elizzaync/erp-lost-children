# -*- coding: utf-8 -*-
"""
yunatt_client.py — capa de transporte hacia global.yunatt.com.

CÓMO FUNCIONA LA INTEGRACIÓN (importante para entender el resto)

El dispositivo Timmy TM-AI03F no acepta conexiones entrantes desde este
backend: habla ADMS, es decir, él inicia el tráfico hacia la nube de
yunatt. Nosotros nunca tocamos el equipo directamente.

Lo que hacemos es autenticarnos contra la aplicación web de yunatt.com y
usar sus endpoints internos como los usaría el panel en un navegador:
mantener una sesión con JSESSIONID y hacer POSTs con los headers que esa
aplicación espera. yunatt es quien reenvía el comando al equipo.

Consecuencia de diseño: no existe ningún webhook ni notificación de
"captura exitosa". El único modo de saber si la persona se registró es
volver a consultar el estado del dispositivo y comparar contra una foto
del estado anterior. Eso lo hace enrolamiento.py.

Este módulo es autocontenido: no toca la base de datos ni sabe nada del
flujo de negocio. Solo habla HTTP.
"""
import logging
import re
import ssl
import threading
import time

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.ssl_ import create_urllib3_context

import config

log = logging.getLogger("yunatt")


class YunattError(Exception):
    """Fallo al comunicarse con yunatt.com."""


class _AdaptadorTLS13(HTTPAdapter):
    """
    yunatt.com necesita TLS 1.3 negociado explícitamente. Dejando que
    requests negocie solo (1.2/1.3), el handshake se queda colgado hasta
    agotar el timeout en Windows con OpenSSL 3.x.

    La verificación del certificado se mantiene en su valor por defecto
    (check_hostname=True, CERT_REQUIRED). Desactivarla abriría la puerta a
    un intermediario que capture las credenciales de yunatt y las fotos
    faciales del personal, que es justo lo que viaja por aquí.
    """

    def init_poolmanager(self, *args, **kwargs):
        ctx = create_urllib3_context()
        ctx.minimum_version = ssl.TLSVersion.TLSv1_3
        ctx.maximum_version = ssl.TLSVersion.TLSv1_3
        kwargs["ssl_context"] = ctx
        super().init_poolmanager(*args, **kwargs)


class ClienteYunatt:
    """
    Sesión con yunatt.com. Login perezoso: no se autentica al arrancar el
    servidor, sino la primera vez que hace falta de verdad.

    Esto importa durante la transición: cuantas menos sesiones abiertas
    simultáneas con la misma cuenta, menos riesgo de que yunatt invalide la
    sesión del ERP anterior que sigue en producción.
    """

    # Espera progresiva tras un login fallido, para no entrar en un bucle
    # de reintentos que pelee con la sesión del ERP anterior.
    ESPERAS_BACKOFF = (0, 5, 15, 45)

    def __init__(self):
        self._sesion = None
        self._lock = threading.RLock()
        self._fallos_login = 0
        self._proximo_intento = 0.0
        self._ultimo_error = ""
        self._dept_id = None      # resuelto por nombre, ver resolver_departamento()

    # ── Sesión ────────────────────────────────────────────────────────────

    def _nueva_sesion(self):
        s = requests.Session()
        s.headers.update(
            {
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/120.0.0.0 Safari/537.36"
                )
            }
        )
        s.mount("https://", _AdaptadorTLS13())
        return s

    def _login(self):
        """
        Autentica contra yunatt. Devuelve True/False y guarda el motivo del
        fallo en self._ultimo_error para que la interfaz lo muestre.
        """
        ok, faltan = config.configurado()
        if not ok:
            self._ultimo_error = (
                "Faltan variables en backend/.env: " + ", ".join(faltan)
            )
            return False

        ahora = time.time()
        if ahora < self._proximo_intento:
            self._ultimo_error = (
                f"Esperando {int(self._proximo_intento - ahora)}s antes de "
                "reintentar el login (espera progresiva)"
            )
            return False

        s = self._nueva_sesion()
        try:
            # La URL del formulario de login se descubre leyendo la portada:
            # yunatt la ha movido entre versiones, así que no la fijamos.
            portada = s.get(config.YUNATT_BASE + "/", timeout=15, allow_redirects=True)
            m = re.search(
                r'<form[^>]+action=["\']([^"\']*(?:login|Login)[^"\']*)["\']',
                portada.text,
                re.IGNORECASE,
            )
            destino = (
                config.YUNATT_BASE + m.group(1)
                if m
                else config.YUNATT_BASE + "/login/emailLogin"
            )
            s.headers["Referer"] = portada.url

            r = s.post(
                destino,
                data={
                    "email": config.YUNATT_EMAIL,
                    "password": config.YUNATT_PASSWORD,
                },
                allow_redirects=True,
                timeout=20,
            )

            # yunatt entrega JSESSIONID incluso con credenciales incorrectas,
            # así que la cookie no sirve para confirmar nada. Lo que confirma
            # el login es que la respuesta ya NO sea la página de login.
            if "JSESSIONID" in s.cookies and "login-layout" not in r.text:
                self._sesion = s
                self._fallos_login = 0
                self._proximo_intento = 0.0
                self._ultimo_error = ""
                log.info("yunatt: login correcto")
                return True

            m = re.search(r'id="error-msg"[^>]*>([^<]*)<', r.text)
            motivo = (
                m.group(1).strip()
                if m and m.group(1).strip()
                else "yunatt devolvió la página de login tras el POST "
                "(credenciales incorrectas o sesión rechazada)"
            )
            self._registrar_fallo(motivo)
            return False

        except Exception as e:
            self._registrar_fallo(f"error de red: {e}")
            return False

    def _registrar_fallo(self, motivo):
        self._fallos_login += 1
        idx = min(self._fallos_login, len(self.ESPERAS_BACKOFF) - 1)
        espera = self.ESPERAS_BACKOFF[idx]
        self._proximo_intento = time.time() + espera
        self._ultimo_error = motivo
        log.warning(f"yunatt: login fallido — {motivo} (próximo intento en {espera}s)")

    def _obtener_sesion(self):
        with self._lock:
            if self._sesion is None:
                self._login()
            return self._sesion

    def cerrar_sesion(self):
        with self._lock:
            self._sesion = None

    # ── POST con reintento por sesión expirada ────────────────────────────

    def _post(self, ruta, datos, referer="/staff/index", timeout=25):
        """
        POST autenticado. Si yunatt responde HTML en vez de JSON es que la
        sesión caducó (típico cuando el ERP anterior se ha logueado con la
        misma cuenta): re-loguea una vez y reintenta.

        Devuelve el dict decodificado, o lanza YunattError.
        """
        with self._lock:
            s = self._obtener_sesion()
            if s is None:
                raise YunattError(self._ultimo_error or "Sin sesión con yunatt.com")

            headers = {
                "X-Requested-With": "XMLHttpRequest",
                "Referer": config.YUNATT_BASE + referer,
            }

            for intento in (0, 1):
                try:
                    r = s.post(
                        config.YUNATT_BASE + ruta,
                        data=datos,
                        headers=headers,
                        timeout=timeout,
                    )
                except Exception as e:
                    raise YunattError(f"error de red en {ruta}: {e}")

                if r.status_code != 200:
                    raise YunattError(f"{ruta} respondió HTTP {r.status_code}")

                try:
                    return r.json()
                except ValueError:
                    if intento == 0:
                        log.info(f"yunatt: sesión expirada en {ruta}, re-login")
                        self._sesion = None
                        if self._login():
                            s = self._sesion
                            continue
                    raise YunattError(
                        "la sesión con yunatt expiró y no se pudo renovar "
                        f"({self._ultimo_error or 'motivo desconocido'})"
                    )
        raise YunattError(f"{ruta}: sin respuesta utilizable")

    # ── Consultas ─────────────────────────────────────────────────────────

    def staff_en_nube(self):
        """Todo el staff dado de alta en la cuenta de yunatt."""
        d = self._post("/staff/query", {"limit": 5000, "offset": 0})
        return d.get("rows", []) or []

    def staff_en_dispositivo(self):
        """
        Usuarios registrados FÍSICAMENTE en el Timmy, con los biométricos
        que tienen tomados. Cada fila trae enrollid, name y backupnums.

        Esta es la consulta clave del enrolamiento: 'backupnums' es lo que
        cambia cuando la persona termina de registrar su rostro o huella en
        el equipo, y por tanto lo que nos dice que la captura funcionó.
        """
        d = self._post(
            "/attenceMachine/queryStaff",
            # [UN SOLO DISPOSITIVO] ver el bloque de config.py
            {"attenceMachineId": str(config.DEVICE_ID)},
        )
        return d.get("rows", []) or []

    def estado_en_dispositivo(self, staff_number):
        """
        Estado biométrico actual de un staffNumber concreto.
        Devuelve dict con en_dispositivo / backupnums / rostro / huella / foto.
        """
        sn = str(staff_number)
        fila = next(
            (d for d in self.staff_en_dispositivo() if str(d.get("enrollid")) == sn),
            None,
        )
        nums = (fila or {}).get("backupnums") or []

        foto = ""
        if fila:
            en_nube = next(
                (s for s in self.staff_en_nube() if str(s.get("staffNumber")) == sn),
                None,
            )
            foto = (en_nube or {}).get("photo") or ""

        return {
            "en_dispositivo": fila is not None,
            "backupnums": nums,
            "rostro": config.tiene_rostro(nums),
            "huella": config.tiene_huella(nums),
            "foto": foto,
        }

    # ── Escrituras (todas validan el rango reservado) ─────────────────────

    def alta_staff(self, staff_number, nombre):
        """
        Da de alta a la persona en la cuenta de yunatt, dentro del
        departamento nuevo, y la asigna al dispositivo.

        Sin este paso el comando de enrolamiento no tiene a quién apuntar.
        """
        sn = config.validar_rango(staff_number)
        dept_id = self.resolver_departamento()

        datos = {
            "id": "",
            "longid": "10",
            "enrollid": str(sn),
            "staffNumber": str(sn),
            "name": str(nombre)[:50],
            "sex": "0",
            "departmentId": dept_id,
            "department": str(config.DEPT_NAME),
            "staffDate": time.strftime("%Y-%m-%d"),
            "staffStatus": "1",
            "idNumber": "",
            "icCard": "",
            "punchPwd": "",
            "mobile": "",
            "email": "",
            "address": "",
            "imgSrc": "",
            "punch": "1",
            # [UN SOLO DISPOSITIVO] el alta se asigna siempre a este equipo
            "attenceMachineId": str(config.DEVICE_ID),
            "attenceMachineIds": str(config.DEVICE_ID),
        }

        with self._lock:
            s = self._obtener_sesion()
            if s is None:
                raise YunattError(self._ultimo_error or "Sin sesión con yunatt.com")
            headers = {
                "X-Requested-With": "XMLHttpRequest",
                "Referer": config.YUNATT_BASE + "/staff/addUI",
            }
            # /staff/add responde HTML de la página en el caso correcto, no
            # JSON — por eso no pasa por _post(). El fallo se detecta por la
            # presencia del marcador de error en el cuerpo.
            for intento in (0, 1):
                try:
                    r = s.post(
                        config.YUNATT_BASE + "/staff/add",
                        data=datos,
                        files={},
                        headers=headers,
                        timeout=30,
                    )
                except Exception as e:
                    raise YunattError(f"error de red al dar de alta {sn}: {e}")

                if r.status_code == 200 and '"result":false' not in r.text:
                    log.info(f"yunatt: alta de staffNumber {sn} ({nombre}) correcta")
                    return True

                if intento == 0:
                    self._sesion = None
                    if self._login():
                        s = self._sesion
                        continue
                raise YunattError(
                    f"yunatt rechazó el alta de {sn}: {r.text[:120]}"
                )
        return False

    def comando_enrolar(self, staff_number, nombre, backup):
        """
        Envía el comando 'remoteadduser' — esto es lo que hace que el
        dispositivo cambie SOLO a modo registro y se quede esperando a la
        persona frente a la cámara o el lector.

        backup: "50" rostro, "0" huella (ver config.BACKUP_*).
        """
        sn = config.validar_rango(staff_number)

        d = self._post(
            "/staff/remoteadduser",
            {
                "adduserenrollid": str(sn),
                "addusername": str(nombre)[:50],
                "adduserbackups": str(backup),
                # [UN SOLO DISPOSITIVO] el comando va siempre a este equipo
                "attenceMachineId": str(config.DEVICE_ID),
            },
            timeout=15,
        )
        if d.get("result"):
            log.info(f"yunatt: comando de enrolamiento enviado — {sn} backup={backup}")
            return True
        raise YunattError(
            d.get("errorMsg") or "yunatt rechazó el comando de enrolamiento"
        )

    def actualizar_staff(self, staff_number, nombre):
        """
        Cambia el nombre de una persona ya dada de alta en yunatt (es el que
        muestra el terminal al marcar).

        yunatt no tiene endpoint de actualización: se reutiliza /staff/add
        con el 'id' interno relleno. Por eso hay que reenviar TODOS los
        campos partiendo de la fila existente — mandar uno vacío lo borra.
        """
        sn = config.validar_rango(staff_number)
        fila = next(
            (s for s in self.staff_en_nube() if str(s.get("staffNumber")) == str(sn)),
            None,
        )
        if fila is None:
            raise YunattError(f"staffNumber {sn} no está en yunatt")

        def campo(clave, defecto=""):
            valor = fila.get(clave)
            return "" if valor is None else str(valor) or defecto

        datos = {
            "id": str(fila.get("id", "")),
            "longid": campo("longId", "10"),
            "enrollid": campo("enrollId", str(sn)),
            "staffNumber": str(sn),
            "name": str(nombre)[:50],
            "sex": campo("sex", "0"),
            "departmentId": campo("departmentId") or self.resolver_departamento(),
            "department": campo("department", str(config.DEPT_NAME)),
            "staffDate": campo("staffDate")[:10] or time.strftime("%Y-%m-%d"),
            "staffStatus": campo("staffStatus", "1"),
            "idNumber": campo("idNumber"),
            "icCard": campo("icCard"),
            "punchPwd": campo("punchPwd"),
            "mobile": campo("mobile"),
            "email": campo("email"),
            "address": campo("address"),
            "imgSrc": campo("imgSrc"),
            "punch": campo("punch", "1"),
            # [UN SOLO DISPOSITIVO]
            "attenceMachineId": str(config.DEVICE_ID),
        }

        with self._lock:
            s = self._obtener_sesion()
            if s is None:
                raise YunattError(self._ultimo_error or "Sin sesión con yunatt.com")
            headers = {
                "X-Requested-With": "XMLHttpRequest",
                "Referer": config.YUNATT_BASE + "/staff/addUI",
            }
            try:
                r = s.post(
                    config.YUNATT_BASE + "/staff/add",
                    data=datos,
                    files={},
                    headers=headers,
                    timeout=25,
                )
            except Exception as e:
                raise YunattError(f"error de red al renombrar {sn}: {e}")

            if r.status_code == 200 and '"result":false' not in r.text:
                log.info(f"yunatt: staffNumber {sn} renombrado a '{nombre}'")
                return True
            raise YunattError(f"yunatt rechazó el cambio de nombre: {r.text[:120]}")

    def borrar_de_nube(self, ids_internos):
        """
        Borra staff de la cuenta de yunatt. ids_internos son el campo 'id' de
        /staff/query, NO el staffNumber.

        yunatt acepta la lista con dos serializaciones según la versión
        ('ids' repetido o 'ids[]' estilo jQuery); se prueban ambas.
        """
        if not ids_internos:
            return True
        ids = [str(i) for i in ids_internos]
        ultimo = ""
        for sufijo in ("", "[]"):
            d = self._post("/staff/batchRemove", {f"ids{sufijo}": ids})
            if d and d.get("result"):
                log.info(f"yunatt: staff borrado de la nube ids={ids}")
                return True
            ultimo = (d or {}).get("errorMsg", "sin respuesta")
        raise YunattError(f"yunatt no borró el staff {ids}: {ultimo}")

    def borrar_del_dispositivo(self, ids_internos):
        """Quita usuarios del equipo. ids_internos = campo 'id' de staff/query."""
        if not ids_internos:
            return True
        d = self._post(
            "/staff/removeInMachine",
            {
                "ids": [str(i) for i in ids_internos],
                # [UN SOLO DISPOSITIVO]
                "attenceMachineIds": [str(config.DEVICE_ID)],
            },
        )
        return bool(d.get("result"))

    # ── Marcas de asistencia ──────────────────────────────────────────────

    def meses_disponibles(self):
        """
        Meses que yunatt tiene abiertos, como [(id, "AAAA-MM"), ...], el más
        reciente primero.

        yunatt agrupa las marcas por 'monthDataId' y no expone ningún
        endpoint para consultarlo: el dato vive en el HTML del informe
        mensual, dentro de un <select name="monthDataId"> cuyos <option>
        llevan el id en el value y el mes como texto.
        """
        with self._lock:
            s = self._obtener_sesion()
            if s is None:
                raise YunattError(self._ultimo_error or "Sin sesión con yunatt.com")
            try:
                r = s.get(
                    config.YUNATT_BASE + "/cardRecord/monthIndex",
                    timeout=20,
                    allow_redirects=True,
                )
            except Exception as e:
                raise YunattError(f"error de red al leer el informe mensual: {e}")

            if "login" in r.url.lower():
                self._sesion = None
                raise YunattError("la sesión expiró al leer el informe mensual")
            html = r.text

        bloque = re.search(
            r'<select[^>]*name=["\']monthDataId["\'][^>]*>(.*?)</select>',
            html,
            re.S | re.I,
        )
        if bloque:
            opciones = re.findall(
                r'<option[^>]*value=["\'](\d+)["\'][^>]*>\s*([^<]*?)\s*</option>',
                bloque.group(1),
                re.I,
            )
            if opciones:
                return [(int(v), t) for v, t in opciones]

        # Respaldos por si yunatt cambia la plantilla y deja de usar el select
        for patron in (
            r'"monthDataId"\s*:\s*(\d+)',
            r"monthDataId\s*=\s*['\"]?(\d+)",
            r'monthDataId[^0-9]{0,80}?(\d{4,8})',
        ):
            m = re.search(patron, html, re.I)
            if m:
                log.warning("yunatt: monthDataId obtenido por respaldo, no por el <select>")
                return [(int(m.group(1)), "")]

        raise YunattError(
            "no se encontró monthDataId en el informe de yunatt "
            "(la página del informe mensual cambió de formato)"
        )

    def _id_mes(self, mes=None):
        """
        id del mes pedido ("AAAA-MM"); por defecto el mes en curso. Si ese
        mes todavía no existe en yunatt, se usa el más reciente disponible.
        """
        meses = self.meses_disponibles()
        objetivo = mes or time.strftime("%Y-%m")

        for mid, etiqueta in meses:
            if etiqueta.strip() == objetivo:
                return mid

        mid, etiqueta = meses[0]
        log.info(
            f"yunatt: no hay informe para {objetivo}; se usa el más reciente "
            f"({etiqueta or mid})"
        )
        return mid

    def marcas_del_mes(self, limite=500, mes=None):
        """
        Descarga las marcas del mes ("AAAA-MM"; por defecto el actual).

        Devuelve solo filas dentro del rango reservado: las marcas de las
        personas del ERP anterior se descartan aquí, para que este sistema
        no absorba asistencia que no le corresponde.
        """
        mes = self._id_mes(mes)
        d = self._post(
            "/cardRecord/queryForMonth",
            {"order": "asc", "offset": 0, "limit": limite, "monthDataId": mes},
        )
        filas = d.get("rows", []) or []
        propias = [f for f in filas if config.en_rango(f.get("staffNumber"))]
        log.info(
            f"yunatt: {len(filas)} filas recibidas, "
            f"{len(propias)} dentro del rango reservado"
        )
        return propias

    # ── Departamentos ─────────────────────────────────────────────────────

    def listar_departamentos(self):
        """
        Departamentos de la cuenta, aplanados desde el árbol que devuelve
        yunatt. Cada uno: {"id": int, "nombre": str, "padre": id|""}.

        POST /department/list responde una LISTA (no el {"rows": [...]} del
        resto de endpoints) y anida los hijos en la clave "children", así
        que se recorre en profundidad.
        """
        with self._lock:
            s = self._obtener_sesion()
            if s is None:
                raise YunattError(self._ultimo_error or "Sin sesión con yunatt.com")
            try:
                r = s.post(
                    config.YUNATT_BASE + "/department/list",
                    data={},
                    headers={
                        "X-Requested-With": "XMLHttpRequest",
                        "Referer": config.YUNATT_BASE + "/staff/index",
                    },
                    timeout=20,
                )
            except Exception as e:
                raise YunattError(f"error de red al listar departamentos: {e}")

            if r.status_code != 200:
                raise YunattError(f"/department/list respondió HTTP {r.status_code}")
            try:
                arbol = r.json()
            except ValueError:
                self._sesion = None
                raise YunattError("la sesión expiró al listar departamentos")

        planos = []

        def recorrer(nodos):
            for n in nodos or []:
                if not isinstance(n, dict):
                    continue
                planos.append(
                    {
                        "id": n.get("id"),
                        "nombre": (n.get("name") or "").strip(),
                        "padre": n.get("parentId", ""),
                    }
                )
                recorrer(n.get("children"))

        recorrer(arbol if isinstance(arbol, list) else [arbol])
        return planos

    def resolver_departamento(self, refrescar=False):
        """
        Devuelve el id numérico del departamento donde se dan de alta las
        personas de este sistema.

        El id no aparece por ningún lado en la interfaz web de yunatt, así
        que se busca por nombre (YUNATT_DEPT_NAME). Si YUNATT_DEPT_ID está
        puesto en el .env, ese valor manda y no se consulta nada.
        """
        if config.DEPT_ID:
            return str(config.DEPT_ID)

        if self._dept_id and not refrescar:
            return self._dept_id

        objetivo = (config.DEPT_NAME or "").strip().casefold()
        if not objetivo:
            raise YunattError(
                "Falta YUNATT_DEPT_NAME en backend/.env: sin nombre no se "
                "puede localizar el departamento."
            )

        departamentos = self.listar_departamentos()
        encontrado = next(
            (d for d in departamentos if d["nombre"].casefold() == objetivo), None
        )

        if encontrado is None:
            disponibles = ", ".join(f"'{d['nombre']}'" for d in departamentos) or "ninguno"
            raise YunattError(
                f"No existe un departamento llamado '{config.DEPT_NAME}' en "
                f"yunatt. Los que hay son: {disponibles}. Créalo en el panel "
                f"con ese nombre exacto, o corrige YUNATT_DEPT_NAME."
            )

        self._dept_id = str(encontrado["id"])
        log.info(
            f"yunatt: departamento '{config.DEPT_NAME}' resuelto a id {self._dept_id}"
        )
        return self._dept_id

    def descargar_foto(self, ruta_foto):
        """
        Descarga la foto que el equipo tomó al registrar el rostro. La sirve
        yunatt en /TimmyFile/... sin exigir sesión.
        """
        if not ruta_foto:
            return None
        try:
            r = self._nueva_sesion().get(
                config.YUNATT_BASE + ruta_foto, timeout=20
            )
            if r.status_code == 200 and r.content[:3] == b"\xff\xd8\xff":
                return r.content
        except Exception as e:
            log.warning(f"yunatt: no se pudo descargar la foto {ruta_foto}: {e}")
        return None

    # ── Diagnóstico ───────────────────────────────────────────────────────

    def estado(self):
        ok, faltan = config.configurado()
        return {
            "configurado": ok,
            "faltan": faltan,
            "sesion_activa": self._sesion is not None,
            "ultimo_error": self._ultimo_error,
            "dispositivo": str(config.DEVICE_ID) if config.DEVICE_ID else "",
            "departamento": str(config.DEPT_NAME),
            # Sin forzar la resolución: este endpoint no debe provocar un
            # login solo por consultarse.
            "departamento_id": self._dept_id or (str(config.DEPT_ID) if config.DEPT_ID else ""),
            "departamento_fijado_a_mano": bool(config.DEPT_ID),
        }


# Instancia única — una sola sesión por proceso, deliberadamente.
cliente = ClienteYunatt()
