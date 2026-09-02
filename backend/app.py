# -*- coding: utf-8 -*-
"""
app.py — servidor del Módulo RRHH Lost Children Perú.

Un solo proceso sirve DOS cosas en el mismo origen:

  /            → el propio ERP RRHH - Lost Children Peru.dc.html
  /api/...     → la API de enrolamiento biométrico

Servirlo todo desde el mismo origen elimina CORS de raíz, en vez de
parchearlo con cabeceras permisivas. Por eso la interfaz se abre en
http://127.0.0.1:7801/ y no haciendo doble click en el .dc.html.

Arranque:  python backend/app.py      (o iniciar.bat)
"""
import datetime
import io
import json
import logging
import os
import sys
import webbrowser
from datetime import date

from flask import Flask, jsonify, request, send_file, send_from_directory

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# La consola de Windows usa cp1252: sin esto, cualquier acento en un log
# (y los hay, todos los mensajes están en español) revienta el proceso con
# UnicodeEncodeError en mitad de una operación.
for _flujo in (sys.stdout, sys.stderr):
    try:
        _flujo.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

import archivos
import documento_permiso
import firmas
import reportes
import fotos
import lugares
import invitaciones as invi
import formulario as form
import auth
import config
import db
import enrolamiento
import solicitudes as reglas_permisos
import personas
import planillas
from yunatt_client import cliente, YunattError

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("rrhh")

RAIZ = config.RAIZ_PROYECTO
INTERFAZ = "ERP RRHH - Lost Children Peru.dc.html"

# El .dc.html es un archivo GENERADO desde interfaz/ (ver construir_interfaz.py
# y PLAN-MANANA.md). Se reconstruye a cada arranque para que editar una pieza
# y recargar el navegador baste — sin acordarse de ningún paso extra. Si
# falta una pieza o un módulo, esto revienta el arranque a propósito: servir
# la versión vieja en silencio sería peor que no arrancar.
sys.path.insert(0, RAIZ)
import construir_interfaz
construir_interfaz.escribir()
log.info("interfaz reconstruida desde interfaz/")

app = Flask(__name__, static_folder=None)


# ══════════════════════════════════════════════════════════════════════════
#  INTERFAZ ESTÁTICA
# ══════════════════════════════════════════════════════════════════════════

@app.get("/")
def interfaz():
    return send_from_directory(RAIZ, INTERFAZ)


# Lo único que la página pide del disco, aparte de ella misma. Es una
# lista de lo PERMITIDO, no de lo prohibido: una lista de prohibidos nunca
# está completa, y lo que se olvide se publica. Aquí lo que se olvide
# simplemente no se sirve, que es el fallo correcto.
PUBLICABLES = ("support.js", "image-slot.js")
PREFIJOS_PUBLICABLES = ("_ds/", "web/")


def _servible(ruta):
    """¿Es este uno de los pocos archivos que la página necesita?"""
    limpia = ruta.replace("\\", "/").lstrip("/")
    if ".." in limpia.split("/"):
        return False
    if limpia in PUBLICABLES or limpia == INTERFAZ:
        return True
    if limpia.startswith(PREFIJOS_PUBLICABLES):
        return True
    # La imagen de la portada vive suelta en la raíz.
    if "/" not in limpia and limpia.lower().endswith((".png", ".jpg", ".ico")):
        return True
    return False


@app.get("/<path:ruta>")
def estatico(ruta):
    """
    Sirve support.js, image-slot.js y _ds/** como rutas hermanas del HTML,
    igual que cuando el archivo se abría desde el disco.

    Y sirve la interfaz para las rutas de pantalla —/bandeja, /personal—,
    que no son archivos: así se puede recargar estando en una de ellas sin
    llevarse un «no encontrado». El enrutado del navegador decide qué
    pintar cuando la página ya está cargada.

    Las rutas /api/... se excluyen a mano. Flask ya da prioridad a lo
    declarado, pero si un endpoint mal escrito recibiera la página entera
    en vez de un error en JSON, quien la llamó creería que fue bien.
    """
    if ruta.startswith("api/"):
        return _error(f"No existe {request.path}", 404)
    if _servible(ruta):
        return send_from_directory(RAIZ, ruta)
    if os.path.isfile(os.path.join(RAIZ, ruta)):
        # Existe, pero no es de los que se publican. Se responde igual que
        # si no existiera: decir «prohibido» confirmaría que está ahí.
        log.warning("se pidió un archivo no publicable: %s", ruta)
        return _error(f"No existe {request.path}", 404)
    return send_from_directory(RAIZ, INTERFAZ)


# ══════════════════════════════════════════════════════════════════════════
#  ERRORES DE LA API
# ══════════════════════════════════════════════════════════════════════════
#
# Lo que el sistema rechaza a propósito ya sale en JSON. Estos son los que
# genera Flask por su cuenta: una ruta que no existe, un método que esa
# ruta no acepta, o algo que reventó sin capturar.
#
# Sin esto, la interfaz recibe una página HTML donde espera JSON y enseña
# «Unexpected token '<'», que no le dice nada a nadie. El comodín de
# archivos estáticos es solo GET, así que cualquier POST a una dirección
# equivocada caía justo aquí.

def _es_api():
    return request.path.startswith("/api/")


@app.errorhandler(404)
def _no_existe(e):
    if _es_api():
        return jsonify({"ok": False,
                        "error": f"No existe la dirección {request.path}"}), 404
    return e


@app.errorhandler(405)
def _metodo_no_admitido(e):
    if _es_api():
        return jsonify({"ok": False,
                        "error": f"{request.method} no está permitido en {request.path}"}), 405
    return e


@app.errorhandler(500)
def _reventon(e):
    if _es_api():
        # El detalle va al registro, no a la respuesta: puede llevar rutas
        # del servidor o fragmentos de consulta.
        app.logger.exception("error no capturado en %s", request.path)
        return jsonify({"ok": False,
                        "error": "Algo falló en el servidor. Quedó anotado en el registro."}), 500
    return e


# ══════════════════════════════════════════════════════════════════════════
#  API
# ══════════════════════════════════════════════════════════════════════════

def _error(mensaje, codigo=400):
    return jsonify({"ok": False, "error": str(mensaje)}), codigo


# ══════════════════════════════════════════════════════════════════════════
#  SESIÓN
# ══════════════════════════════════════════════════════════════════════════
#
#  Estos cuatro NO pueden exigir sesión: son los que la crean o la
#  consultan. El resto de la API pasa por @requiere.

def _ip():
    return (request.headers.get("X-Forwarded-For") or request.remote_addr or "")[:60]


def _cookie_sesion(respuesta, token):
    respuesta.set_cookie(
        config.COOKIE_NOMBRE, token,
        httponly=True,                      # inalcanzable desde JavaScript
        secure=config.COOKIE_SECURE,        # solo HTTPS cuando se despliegue
        samesite="Lax",                     # primera barrera contra CSRF
        max_age=config.SESION_HORAS * 3600,
        path="/",
    )
    return respuesta


@app.post("/api/login")
def login():
    """
    Antes de esto el login era decorativo: comprobaba que los campos no
    estuvieran vacíos y entraba. Ahora verifica de verdad.
    """
    cuerpo = request.get_json(silent=True) or {}
    usuario = str(cuerpo.get("usuario") or "").strip()
    clave = str(cuerpo.get("clave") or "")
    ip = _ip()

    if not usuario or not clave:
        return _error("Escribe tu usuario y tu contraseña", 400)

    faltan = auth.esta_bloqueado(usuario, ip)
    if faltan:
        return jsonify({"ok": False, "motivo": "bloqueado",
                        "error": f"Demasiados intentos fallidos. Vuelve a intentarlo "
                                 f"en {faltan} minuto(s)."}), 429

    u = db.usuario_por_nombre(usuario)
    # Se verifica el hash aunque el usuario no exista, contra un hash
    # descartable: si no, el tiempo de respuesta delataría qué nombres
    # están registrados.
    hash_guardado = u["clave_hash"] if u else (
        "pbkdf2_sha256$240000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")
    correcta = auth.verificar(clave, hash_guardado)

    if not u or not correcta or u["estado"] != "activo":
        auth.anotar_intento(usuario, ip, False)
        # Mismo mensaje en los tres casos: decir "ese usuario no existe"
        # regalaría la mitad de la credencial.
        log.info(f"login fallido para '{usuario}' desde {ip}")
        return _error("Usuario o contraseña incorrectos", 401)

    auth.anotar_intento(usuario, ip, True)
    token, csrf = auth.abrir_sesion(u["id"], ip, request.headers.get("User-Agent", ""))
    log.info(f"login de '{u['usuario']}' desde {ip}")
    r = jsonify({"ok": True, "sesion": _resumen_sesion(auth.sesion_de(token))})
    return _cookie_sesion(r, token)


@app.post("/api/logout")
def logout():
    token = request.cookies.get(config.COOKIE_NOMBRE)
    if token:
        auth.cerrar_sesion(token)
    r = jsonify({"ok": True})
    r.delete_cookie(config.COOKIE_NOMBRE, path="/")
    return r


def _resumen_sesion(ses):
    """Lo que la interfaz necesita saber de quién está conectado."""
    if not ses:
        return None
    return {
        "usuario": ses["usuario"], "nombre": ses["nombre"],
        "rol": ses["rol"], "rol_nombre": ses["rol_nombre"],
        "personal_id": ses["personal_id"],
        "debe_cambiar": bool(ses["debe_cambiar"]),
        "permisos": ses["permisos"],
        "csrf": ses["csrf"],
    }


@app.get("/api/sesion")
def sesion_actual_():
    """
    Quién está conectado y qué puede hacer. Con LOGIN_ESTRICTO en False y
    sin sesión devuelve 'convivencia': la interfaz muestra todo, como
    antes, mientras se reparten las cuentas.
    """
    ses = auth.sesion_actual()
    if ses:
        return jsonify({"ok": True, "autenticado": True,
                        "sesion": _resumen_sesion(ses),
                        "estricto": config.LOGIN_ESTRICTO})
    return jsonify({"ok": True, "autenticado": False, "sesion": None,
                    "estricto": config.LOGIN_ESTRICTO,
                    "convivencia": not config.LOGIN_ESTRICTO,
                    "modulos": [{"clave": c, "nombre": n, "grupo": g}
                                for c, n, g in config.MODULOS]})


@app.post("/api/cambiar-clave")
def cambiar_clave():
    """
    Cambio de la propia contraseña. Exige la actual: si no, quien encuentre
    una sesión abierta podría dejar fuera al dueño de la cuenta.
    """
    ses = auth.sesion_actual()
    if not ses:
        return _error("Inicia sesión para cambiar tu contraseña", 401)
    cuerpo = request.get_json(silent=True) or {}
    actual = str(cuerpo.get("actual") or "")
    nueva = str(cuerpo.get("nueva") or "")

    u = db.usuario(ses["usuario_id"])
    if not auth.verificar(actual, u["clave_hash"]):
        return _error("La contraseña actual no es correcta", 400)
    if actual == nueva:
        return _error("La contraseña nueva tiene que ser distinta de la actual", 400)
    try:
        nuevo_hash = auth.hashear(nueva)
    except ValueError as e:
        return _error(e, 400)

    db.actualizar_usuario(u["id"], {"clave_hash": nuevo_hash, "debe_cambiar": 0})
    # Se cierran las demás sesiones y se abre una limpia: si alguien tenía
    # la clave vieja y una sesión, deja de servirle.
    auth.cerrar_sesiones_de(u["id"])
    token, _ = auth.abrir_sesion(u["id"], _ip(), request.headers.get("User-Agent", ""))
    log.info(f"'{u['usuario']}' cambió su contraseña")
    r = jsonify({"ok": True, "sesion": _resumen_sesion(auth.sesion_de(token))})
    return _cookie_sesion(r, token)


@app.get("/api/health")
def health():
    ok, faltan = config.configurado()
    return jsonify(
        {
            "ok": True,
            "servicio": "Módulo RRHH — enrolamiento biométrico",
            "configurado": ok,
            "faltan": faltan,
            "rango_reservado": {
                "base": config.STAFF_NUMBER_BASE,
                "estricto": config.RANGO_ESTRICTO,
            },
            # La interfaz usa esto para no ofrecer métodos que el terminal
            # instalado no puede ejecutar.
            "metodos_disponibles": config.metodos_disponibles(),
            "soporta_huella": config.SOPORTA_HUELLA,
        }
    )


@app.get("/api/yunatt/estado")
@auth.requiere("asistencia", "vista")
def yunatt_estado():
    return jsonify({"ok": True, **cliente.estado()})


@app.get("/api/yunatt/departamentos")
@auth.requiere("asistencia", "vista")
def yunatt_departamentos():
    """
    Diagnóstico: qué departamentos ve el sistema y a cuál se resolvió el
    nombre configurado. Útil cuando el alta falla por no encontrarlo.
    """
    try:
        departamentos = cliente.listar_departamentos()
        resuelto = cliente.resolver_departamento()
        return jsonify(
            {
                "ok": True,
                "buscando": config.DEPT_NAME,
                "resuelto_a": resuelto,
                "departamentos": departamentos,
            }
        )
    except YunattError as e:
        return _error(e, 502)
    except Exception as e:
        log.exception("fallo al listar departamentos")
        return _error(e, 500)


@app.get("/api/parametros")
@auth.requiere("dashboard", "vista")
def leer_parametros():
    """Datos institucionales: nombre de la organización, fundación, ciudad."""
    return jsonify({"ok": True, "parametros": db.parametros()})


@app.put("/api/parametros")
@auth.requiere("configuracion", "edicion")
def guardar_parametros():
    """
    Guarda solo las claves de la lista blanca de db.CLAVES_PARAMETRO.

    La fecha de fundación se valida aparte: es el dato del que cuelga el
    cálculo de años del Dashboard, y una fecha imposible daría una cifra
    absurda sin que nadie se entere.
    """
    cuerpo = request.get_json(silent=True) or {}
    try:
        for clave, valor in cuerpo.items():
            if clave not in db.CLAVES_PARAMETRO:
                return _error(f"Parámetro no reconocido: {clave}", 400)
            if clave == "fecha_fundacion" and valor:
                try:
                    fundacion = date.fromisoformat(str(valor))
                except ValueError:
                    return _error("La fecha de fundación debe tener el formato AAAA-MM-DD", 400)
                if fundacion > date.today():
                    return _error("La fecha de fundación no puede estar en el futuro", 400)
                if fundacion.year < 1900:
                    return _error("La fecha de fundación parece incorrecta (anterior a 1900)", 400)
            # De estos cuelga el neto de todas las boletas: un valor absurdo
            # daría sueldos absurdos sin que salte nada.
            if clave in ("descuento_planilla", "descuento_honorarios") and valor != "":
                try:
                    pct = float(valor)
                except (TypeError, ValueError):
                    return _error("El descuento debe ser un número", 400)
                if not 0 <= pct <= 100:
                    return _error("El descuento debe estar entre 0 y 100", 400)
            db.guardar_parametro(clave, valor)
        return jsonify({"ok": True, "parametros": db.parametros()})
    except ValueError as e:
        return _error(e, 400)
    except Exception as e:
        log.exception("fallo al guardar parámetros")
        return _error(e, 500)


@app.get("/api/personal")
@auth.requiere("personal", "vista")
def listar_personal():
    """Hoja de Vida: fichas del personal con su estado biométrico."""
    return jsonify({"ok": True, "personal": db.personal(
        incluir_inactivos=request.args.get("todos") == "1")})


@app.post("/api/personal")
@auth.requiere("personal", "edicion")
def crear_personal_():
    try:
        return jsonify({"ok": True, **personas.crear_personal(request.get_json(silent=True) or {})})
    except ValueError as e:
        return _error(e, 400)
    except Exception as e:
        log.exception("fallo al crear la ficha")
        return _error(e, 500)


@app.put("/api/personal/<int:id_>")
@auth.requiere("personal", "edicion")
def editar_personal_(id_):
    """Edita la ficha. El nombre se propaga al terminal si está enrolada."""
    try:
        return jsonify({"ok": True, **personas.editar_personal(id_, request.get_json(silent=True) or {})})
    except KeyError as e:
        return _error(e.args[0] if e.args else e, 404)
    except ValueError as e:
        return _error(e, 400)
    except YunattError as e:
        return _error(e, 502)
    except Exception as e:
        log.exception("fallo al editar la ficha")
        return _error(e, 500)


@app.delete("/api/personal/<int:id_>")
@auth.requiere("personal", "edicion")
def borrar_personal_(id_):
    """
    Borra la ficha. Si estaba enrolada, primero la quita del terminal: la
    cascada de SQLite no llega al dispositivo físico.
    """
    try:
        return jsonify({"ok": True, **personas.borrar_personal(id_)})
    except KeyError as e:
        return _error(e.args[0] if e.args else e, 404)
    except config.RangoReservadoError as e:
        return _error(e, 409)
    except YunattError as e:
        return _error(e, 502)
    except Exception as e:
        log.exception("fallo al borrar la ficha")
        return _error(e, 500)


@app.get("/api/personal/<int:id_>/documentos")
@auth.requiere("documentos", "vista")
def documentos_persona(id_):
    """Documentos y contratos de una ficha, con su vigencia calculada."""
    if not db.persona_personal(id_):
        return _error(f"No existe la persona {id_}", 404)
    return jsonify({
        "ok": True,
        "documentos": db.documentos_de(id_, "documento"),
        "contratos": db.documentos_de(id_, "contrato"),
    })


def _modulo_doc(tipo):
    """
    Documentos y contratos viven en la MISMA tabla y comparten endpoints,
    pero son módulos distintos a efectos de permiso. Se decide por el
    'tipo' pedido en vez de exigir siempre 'documentos': si no, quien
    tuviera permiso de contratos y no de documentos no podría tocar nada.
    """
    return "contratos" if str(tipo or "").strip() == "contrato" else "documentos"


def _sin_permiso_doc(tipo, nivel):
    """Devuelve la respuesta de error si no alcanza, o None si puede."""
    ses = auth.sesion_actual()
    if ses is None and not config.LOGIN_ESTRICTO:
        return None                      # convivencia
    modulo = _modulo_doc(tipo)
    if not auth.puede(ses, modulo, nivel):
        auth.anotar_acceso(ses, modulo, nivel, 403)
        return jsonify({"ok": False, "motivo": "sin_permiso",
                        "error": f"Sin permiso de {nivel} en {modulo}"}), 403
    auth.anotar_acceso(ses, modulo, nivel, 200)
    return None


@app.post("/api/personal/<int:id_>/documentos")
def crear_documento_persona(id_):
    """
    Registra un documento o contrato, con el archivo real si se adjunta.

    Acepta JSON (solo metadatos) o multipart (metadatos + archivo). El
    adjunto es opcional a propósito: a veces se conoce el vencimiento
    antes de tener el papel escaneado a mano, y bloquear el registro por
    eso haría que no se registre nada.
    """
    if not db.persona_personal(id_):
        return _error(f"No existe la persona {id_}", 404)

    cuerpo, fichero = _cuerpo_documento()
    negado = _sin_permiso_doc(cuerpo.get("tipo"), "edicion")
    if negado:
        return negado
    # El resto de escrituras pasan por _yo(), que comprueba el token; esta
    # no, porque va por _sin_permiso_doc. Hoy lo salva que la cookie sea
    # SameSite=Lax, pero eso es una defensa del navegador, no nuestra.
    ses = auth.sesion_actual()
    if ses is not None and not auth.csrf_valido(ses):
        return _error("Petición sin token de seguridad válido", 403)
    nombre = str(cuerpo.get("nombre") or "").strip()
    if not nombre:
        return _error("El nombre del documento es obligatorio", 400)
    err = _validar_fechas(cuerpo)
    if err:
        return _error(err, 400)

    adjunto = {}
    try:
        if fichero is not None and fichero.filename:
            adjunto = archivos.guardar(fichero, fichero.filename)
    except archivos.ArchivoError as e:
        return _error(e, 400)
    except Exception as e:
        log.exception("fallo al guardar el adjunto")
        return _error("No se pudo guardar el archivo", 500)

    try:
        nuevo = db.crear_documento(
            id_, cuerpo.get("tipo") or "documento", nombre,
            cuerpo.get("emitido") or "", cuerpo.get("vence") or "",
            cuerpo.get("nota") or "", adjunto,
        )
        return jsonify({"ok": True, "id": nuevo, "documento": db.documento(nuevo)})
    except ValueError as e:
        # Si la fila no llegó a crearse, el archivo quedaría huérfano.
        archivos.borrar(adjunto.get("archivo"))
        return _error(e, 400)
    except Exception as e:
        archivos.borrar(adjunto.get("archivo"))
        log.exception("fallo al crear documento")
        return _error(e, 500)


def _cuerpo_documento():
    """
    Los campos y el adjunto, venga la petición como JSON o como multipart.
    Un solo endpoint para los dos casos evita tener dos rutas que hagan
    casi lo mismo y se desincronicen.
    """
    if request.files:
        return request.form.to_dict(), request.files.get("archivo")
    return (request.get_json(silent=True) or {}), None


# ── Las respuestas del formulario ─────────────────────────────────────
# Traer NO es ingresar. Esto deja las respuestas en la bandeja; llevarlas
# a una ficha es otra decisión, de una persona, y otro endpoint.

@app.get("/api/formulario/respuestas")
@auth.requiere("responsables", "vista")
def bandeja_formulario():
    import sondeo_formulario
    return jsonify({"ok": True,
                    "respuestas": form.bandeja(request.args.get("estado") or None),
                    "hay_credencial": config.credencial_lista(),
                    # Para que la pantalla pueda decir si el sondeo está vivo
                    # y cuándo miró por última vez.
                    "sondeo": dict(sondeo_formulario.ultimo)})


@app.post("/api/formulario/traer")
@auth.requiere("responsables", "edicion")
def traer_formulario():
    """Lee la hoja y guarda en la bandeja lo que aún no estaba."""
    try:
        r = form.traer()
    except form.google_hoja.GoogleError as e:
        # El motivo de Google se enseña tal cual: adivinar la causa manda a
        # buscar donde no es.
        return _error(e, 502)
    return jsonify({"ok": True, "resumen": r, "respuestas": form.bandeja()})


@app.post("/api/formulario/respuestas/<int:id_>/ingresar")
@auth.requiere("responsables", "edicion")
def ingresar_respuesta(id_):
    """Lleva una respuesta a la ficha del tutor, con las correcciones que traiga."""
    d = request.get_json(silent=True) or {}
    ses = auth.sesion_actual()
    try:
        r = form.ingresar(id_, d.get("cambios") or {},
                          usuario_id=(ses or {}).get("usuario_id"))
    except form.FormularioError as e:
        return _error(e, 400)
    return jsonify({"ok": True, **r, "respuestas": form.bandeja(),
                    "responsables": db.responsables()})


@app.post("/api/formulario/respuestas/<int:id_>/descartar")
@auth.requiere("responsables", "edicion")
def descartar_respuesta(id_):
    d = request.get_json(silent=True) or {}
    ses = auth.sesion_actual()
    try:
        form.descartar(id_, d.get("motivo") or "",
                       usuario_id=(ses or {}).get("usuario_id"))
    except form.FormularioError as e:
        return _error(e, 400)
    return jsonify({"ok": True, "respuestas": form.bandeja()})


# ── Invitaciones al formulario público ────────────────────────────────
# Los enlaces se crean y se anulan aquí. Lo que llega del formulario NO
# entra por estos endpoints: eso es el paso 3, y pasa por la bandeja.

@app.get("/api/invitaciones")
@auth.requiere("responsables", "vista")
def listar_invitaciones():
    return jsonify({
        "ok": True,
        "invitaciones": invi.listar(),
        # Sin esto la pantalla no puede explicar por qué no hay enlaces.
        "configurado": bool(config.FORM_URL_PRELLENADO),
    })


@app.post("/api/invitaciones")
@auth.requiere("responsables", "edicion")
def crear_invitacion_api():
    d = request.get_json(silent=True) or {}
    ses = auth.sesion_actual()
    try:
        fila = invi.crear(
            responsable_id=d.get("responsable_id") or None,
            etiqueta=d.get("etiqueta") or "",
            dias=d.get("dias"),
            usuario_id=(ses or {}).get("usuario_id"),
            nota=d.get("nota") or "")
    except invi.InvitacionError as e:
        return _error(e, 400)
    return jsonify({"ok": True, "invitacion": fila,
                    "invitaciones": invi.listar()})


@app.post("/api/invitaciones/<int:id_>/anular")
@auth.requiere("responsables", "edicion")
def anular_invitacion_api(id_):
    d = request.get_json(silent=True) or {}
    try:
        fila = invi.anular(id_, d.get("motivo") or "")
    except invi.InvitacionError as e:
        return _error(e, 404)
    return jsonify({"ok": True, "invitacion": fila,
                    "invitaciones": invi.listar()})


# ── La foto del responsable ───────────────────────────────────────────
# Tres operaciones y una sola forma de entrar: fotos.aceptar(). El día que
# la foto llegue del formulario público, ese origen llama a lo mismo.

@app.post("/api/enrolamiento/revisar")
@auth.requiere("asistencia", "edicion")
def revisar_enrolamientos():
    """
    Pone al día las identidades que se quedaron a medias.

    El seguimiento de un enrolamiento vive en la memoria del proceso: en
    cuanto la pantalla deja de sondear —se cierra, se agota el tiempo, se
    reinicia el servidor— nadie vuelve a preguntarle al equipo, y la ficha
    se queda en «esperando» aunque el terminal ya la haya capturado.
    Recargar no ayudaba: recargar lee la base, y la base no se había
    enterado. Esto es lo que le vuelve a preguntar.
    """
    try:
        return jsonify(enrolamiento.revisar_pendientes())
    except YunattError as e:
        return _error(e, 502)
    except Exception as e:
        log.exception("fallo al revisar enrolamientos")
        return _error(e, 500)


@app.get("/api/personal/<int:id_>/foto")
@auth.requiere("personal", "vista")
def foto_personal(id_):
    """
    La foto de la ficha. La toma el terminal al registrar el rostro.

    Igual que la de los responsables, que llegó antes por el formulario de
    tutores: mismo almacén, mismas comprobaciones y la misma respuesta
    cuando no hay.
    """
    r = db.persona_personal(id_)
    if not r:
        return _error(f"No existe la persona {id_}", 404)
    ruta = fotos.ruta_de(r.get("foto"))
    if not ruta:
        return _error("Esa ficha no tiene foto", 404)
    return send_file(ruta, mimetype=r.get("foto_mime") or "image/jpeg",
                     as_attachment=False, download_name="foto.jpg")


@app.get("/api/beneficiarios/<int:id_>/foto")
@auth.requiere("beneficiarios", "vista")
def foto_beneficiario(id_):
    """
    La foto del niño, la que tomó el terminal al registrar su rostro.

    Exige permiso de VISTA sobre beneficiarios, como el resto de su
    expediente: es la cara de un menor y no puede quedar accesible a quien
    no tenga por qué verla.
    """
    b = db.beneficiario(id_)
    if not b:
        return _error(f"No existe el beneficiario {id_}", 404)
    ruta = fotos.ruta_de(b.get("foto"))
    if not ruta:
        return _error("Esa ficha no tiene foto", 404)
    return send_file(ruta, mimetype=b.get("foto_mime") or "image/jpeg",
                     as_attachment=False, download_name="foto.jpg")


@app.get("/api/responsables/<int:id_>/foto")
@auth.requiere("responsables", "vista")
def foto_responsable(id_):
    r = db.responsable(id_)
    if not r:
        return _error(f"No existe el responsable {id_}", 404)
    ruta = fotos.ruta_de(r.get("foto"))
    if not ruta:
        return _error("Esa ficha no tiene foto", 404)
    # as_attachment=False: la foto se mira en la ficha, no se descarga.
    return send_file(ruta, mimetype=r.get("foto_mime") or "image/jpeg",
                     as_attachment=False, download_name="foto.jpg")


@app.post("/api/responsables/<int:id_>/foto")
@auth.requiere("responsables", "edicion")
def subir_foto_responsable(id_):
    """Pone o reemplaza la foto. La anterior se borra del disco."""
    if not db.responsable(id_):
        return _error(f"No existe el responsable {id_}", 404)
    try:
        meta = fotos.desde_fichero(request.files.get("foto"))
    except fotos.FotoError as e:
        return _error(e, 400)
    except Exception:
        app.logger.exception("foto de responsable %s", id_)
        return _error("No se pudo guardar la foto", 500)
    anterior = db.actualizar_foto_responsable(id_, meta)
    if anterior and anterior != meta["foto"] and not fotos.borrar(anterior):
        # La foto nueva quedó bien guardada; esto solo deja constancia de
        # que la vieja sigue ocupando sitio.
        app.logger.warning("foto huérfana en disco: %s (responsable %s)", anterior, id_)
    return jsonify({"ok": True, "responsable": db.responsable(id_),
                    "responsables": db.responsables()})


@app.delete("/api/responsables/<int:id_>/foto")
@auth.requiere("responsables", "edicion")
def quitar_foto_responsable(id_):
    """Quita la foto y conserva la ficha entera."""
    if not db.responsable(id_):
        return _error(f"No existe el responsable {id_}", 404)
    anterior = db.actualizar_foto_responsable(id_, None)
    if anterior and not fotos.borrar(anterior):
        app.logger.warning("foto huérfana en disco: %s (responsable %s)", anterior, id_)
    return jsonify({"ok": True, "responsable": db.responsable(id_),
                    "responsables": db.responsables()})


@app.get("/api/documentos/<int:id_>/archivo")
@auth.requiere("documentos", "vista")
def descargar_documento(id_):
    """Devuelve el adjunto con su nombre original."""
    d = db.documento(id_)
    if not d:
        return _error(f"No existe el documento {id_}", 404)
    ruta = archivos.ruta_de(d.get("archivo"))
    if not ruta:
        return _error("Ese registro no tiene archivo adjunto", 404)
    # as_attachment=False para que el navegador muestre los PDF e imágenes
    # en vez de descargarlos siempre; el nombre se conserva igual.
    return send_file(ruta, mimetype=d.get("archivo_mime") or None,
                     as_attachment=False,
                     download_name=d.get("archivo_nombre") or "documento")


@app.post("/api/documentos/<int:id_>/archivo")
@auth.requiere("documentos", "edicion")
def adjuntar_a_documento(id_):
    """Añade o reemplaza el archivo de un registro que ya existe."""
    d = db.documento(id_)
    if not d:
        return _error(f"No existe el documento {id_}", 404)
    fichero = request.files.get("archivo")
    if fichero is None or not fichero.filename:
        return _error("No llegó ningún archivo", 400)
    try:
        adjunto = archivos.guardar(fichero, fichero.filename)
    except archivos.ArchivoError as e:
        return _error(e, 400)
    anterior = d.get("archivo")
    db.actualizar_archivo_documento(id_, adjunto)
    if anterior and anterior != adjunto["archivo"]:
        archivos.borrar(anterior)      # el viejo ya no lo referencia nadie
    return jsonify({"ok": True, "documento": db.documento(id_)})


@app.delete("/api/documentos/<int:id_>/archivo")
@auth.requiere("documentos", "edicion")
def quitar_adjunto(id_):
    """Quita el archivo pero conserva el registro y su vencimiento."""
    d = db.documento(id_)
    if not d:
        return _error(f"No existe el documento {id_}", 404)
    archivos.borrar(d.get("archivo"))
    db.actualizar_archivo_documento(id_, {"archivo": "", "archivo_nombre": "",
                                          "archivo_mime": "", "archivo_tam": 0})
    return jsonify({"ok": True, "documento": db.documento(id_)})


def _validar_fechas(cuerpo):
    """La fecha de vencimiento manda sobre el estado, así que se valida."""
    for campo in ("emitido", "vence"):
        valor = cuerpo.get(campo)
        if valor:
            try:
                date.fromisoformat(str(valor))
            except ValueError:
                return f"La fecha de {campo} debe tener el formato AAAA-MM-DD"
    return None


@app.put("/api/documentos/<int:id_>")
@auth.requiere("documentos", "edicion")
def editar_documento(id_):
    """Corrige un documento. El estado se recalcula solo desde la fecha."""
    if not db.documento(id_):
        return _error(f"No existe el documento {id_}", 404)
    cuerpo = request.get_json(silent=True) or {}
    if "nombre" in cuerpo and not str(cuerpo["nombre"]).strip():
        return _error("El nombre del documento no puede quedar vacío", 400)
    err = _validar_fechas(cuerpo)
    if err:
        return _error(err, 400)
    try:
        db.actualizar_documento(
            id_,
            nombre=str(cuerpo["nombre"]).strip() if "nombre" in cuerpo else None,
            emitido=cuerpo.get("emitido"), vence=cuerpo.get("vence"),
            nota=cuerpo.get("nota"))
        return jsonify({"ok": True, "documento": db.documento(id_)})
    except Exception as e:
        log.exception("fallo al editar documento")
        return _error(e, 500)


@app.delete("/api/documentos/<int:id_>")
@auth.requiere("documentos", "edicion")
def borrar_documento_(id_):
    d = db.documento(id_)
    if not d:
        return _error(f"No existe el documento {id_}", 404)
    db.borrar_documento(id_)
    # La fila se va; el archivo del disco también, o quedaría huérfano
    # ocupando espacio sin que nada lo referencie.
    archivos.borrar(d.get("archivo"))
    return jsonify({"ok": True, "nombre": d["nombre"]})


# ── Condiciones laborales ─────────────────────────────────────────────────
#
# El sueldo es un atributo de la persona, no de Planillas: se edita en su
# ficha y Planillas solo lo lee. Así hay una sola pantalla donde cambiarlo.

@app.get("/api/personal/<int:id_>/condiciones")
@auth.requiere("condiciones", "vista")
def condiciones_persona(id_):
    if not db.persona_personal(id_):
        return _error(f"No existe la persona {id_}", 404)
    return jsonify({
        "ok": True,
        "vigente": db.condicion_vigente(id_),
        "historial": db.condiciones_de(id_),
    })


@app.post("/api/personal/<int:id_>/condiciones")
@auth.requiere("condiciones", "edicion")
def crear_condicion_persona(id_):
    """
    Registra una condición nueva y cierra la anterior. No edita la vigente:
    cambiar un sueldo es un hecho con fecha, no una corrección.
    """
    if not db.persona_personal(id_):
        return _error(f"No existe la persona {id_}", 404)
    cuerpo = request.get_json(silent=True) or {}

    desde = str(cuerpo.get("vigente_desde") or "").strip()
    if not desde:
        return _error("La fecha desde la que rige es obligatoria", 400)
    try:
        date.fromisoformat(desde)
    except ValueError:
        return _error("La fecha debe tener el formato AAAA-MM-DD", 400)

    regimen = str(cuerpo.get("regimen") or "planilla").strip()
    try:
        sueldo = float(cuerpo.get("sueldo_base") or 0)
        jornada = float(cuerpo.get("jornada_horas") or 8)
    except (TypeError, ValueError):
        return _error("El sueldo y la jornada deben ser números", 400)
    # Sin pago y con sueldo es contradictorio: se avisa en vez de guardarlo.
    if regimen == "sin_pago" and sueldo:
        return _error("El régimen 'sin pago' no admite sueldo", 400)

    try:
        nuevo = db.crear_condicion(id_, regimen, sueldo, jornada, desde,
                                   str(cuerpo.get("nota") or "").strip())
        return jsonify({"ok": True, "id": nuevo,
                        "vigente": db.condicion_vigente(id_),
                        "historial": db.condiciones_de(id_)})
    except ValueError as e:
        return _error(e, 400)
    except Exception as e:
        log.exception("fallo al crear condicion laboral")
        return _error(e, 500)


@app.delete("/api/condiciones/<int:id_>")
@auth.requiere("condiciones", "edicion")
def borrar_condicion_(id_):
    filas = db.consultar(
        "SELECT personal_id FROM condiciones_laborales WHERE id = ?", (id_,))
    if not filas:
        return _error(f"No existe la condición {id_}", 404)
    pid = filas[0]["personal_id"]
    db.borrar_condicion(id_)
    return jsonify({"ok": True, "vigente": db.condicion_vigente(pid),
                    "historial": db.condiciones_de(pid)})


# ── Planillas ─────────────────────────────────────────────────────────────
#
# Las boletas en borrador se recalculan en cada consulta desde las marcas;
# las cerradas se leen congeladas. Ver planillas.py para las reglas.

@app.get("/api/planillas")
@auth.requiere("planillas", "vista")
def listar_planilla():
    periodo = (request.args.get("periodo") or "").strip() or planillas.periodo_actual()
    if not planillas.periodo_valido(periodo):
        return _error("El período debe tener el formato AAAA-MM", 400)
    try:
        datos = planillas.planilla(periodo)
        datos["ok"] = True
        datos["periodos"] = planillas.periodos_disponibles()
        return jsonify(datos)
    except Exception as e:
        log.exception("fallo al calcular la planilla")
        return _error(e, 500)


@app.get("/api/planillas/<periodo>/<int:personal_id>")
@auth.requiere("planillas", "vista")
def detalle_boleta(periodo, personal_id):
    if not planillas.periodo_valido(periodo):
        return _error("El período debe tener el formato AAAA-MM", 400)
    d = planillas.detalle(periodo=periodo, personal_id=personal_id)
    if not d:
        return _error("Esa persona no tiene boleta en este período", 404)
    return jsonify({"ok": True, "boleta": d})


@app.post("/api/planillas/<periodo>/cerrar")
@auth.requiere("planillas", "edicion")
def cerrar_planilla(periodo):
    if not planillas.periodo_valido(periodo):
        return _error("El período debe tener el formato AAAA-MM", 400)
    try:
        return jsonify({"ok": True, **planillas.cerrar(periodo)})
    except ValueError as e:
        return _error(e, 400)
    except Exception as e:
        log.exception("fallo al cerrar la planilla")
        return _error(e, 500)


@app.post("/api/planillas/<periodo>/reabrir")
@auth.requiere("planillas", "edicion")
def reabrir_planilla(periodo):
    if not planillas.periodo_valido(periodo):
        return _error("El período debe tener el formato AAAA-MM", 400)
    try:
        return jsonify({"ok": True, **planillas.reabrir(periodo)})
    except ValueError as e:
        return _error(e, 400)
    except Exception as e:
        log.exception("fallo al reabrir la planilla")
        return _error(e, 500)


@app.post("/api/planillas/<periodo>/<int:personal_id>/pagar")
@auth.requiere("planillas", "edicion")
def pagar_boleta(periodo, personal_id):
    if not planillas.periodo_valido(periodo):
        return _error("El período debe tener el formato AAAA-MM", 400)
    try:
        return jsonify({"ok": True, **planillas.pagar(personal_id, periodo)})
    except ValueError as e:
        return _error(e, 400)
    except Exception as e:
        log.exception("fallo al marcar el pago")
        return _error(e, 500)


@app.post("/api/planillas/<periodo>/<int:personal_id>/revertir")
@auth.requiere("planillas", "edicion")
def revertir_pago_boleta(periodo, personal_id):
    if not planillas.periodo_valido(periodo):
        return _error("El período debe tener el formato AAAA-MM", 400)
    try:
        return jsonify({"ok": True, **planillas.revertir_pago(personal_id, periodo)})
    except ValueError as e:
        return _error(e, 400)
    except Exception as e:
        log.exception("fallo al revertir el pago")
        return _error(e, 500)


@app.get("/api/documentos")
def listar_documentos():
    """
    Vista consolidada: documentos o contratos de todo el personal. Lee de la
    misma tabla que la ficha; solo cambia el agrupamiento.
    """
    tipo = request.args.get("tipo") or "documento"
    if tipo not in ("documento", "contrato"):
        return _error("El tipo debe ser 'documento' o 'contrato'", 400)
    negado = _sin_permiso_doc(tipo, "vista")
    if negado:
        return negado
    return jsonify({"ok": True, "tipo": tipo, "documentos": db.todos_documentos(tipo)})


@app.get("/api/alertas")
@auth.requiere("dashboard", "vista")
def alertas():
    """
    Lo que requiere atención, calculado de la base. Cada alerta dice a qué
    persona y a qué pestaña de su ficha hay que ir, para que el enlace del
    Dashboard aterrice en el problema y no en una página general.
    """
    venc = db.resumen_vencimientos()
    return jsonify({"ok": True, "vencimientos": venc})


def _beneficiarios_completos():
    """
    La lista con 'faltantes' y los nombres de tutor y psicóloga resueltos.

    Vive en una función porque la devuelven TRES sitios (listar, crear,
    borrar): la primera versión solo decoraba el listado, y una ficha
    recién creada aparecía como completa hasta recargar la página.
    """
    filas = db.beneficiarios()
    porId = {p["id"]: p["nombre"] for p in db.personal()}
    for b in filas:
        b["faltantes"] = db.faltantes_beneficiario(b)
        b["tutor_nombre"] = porId.get(b.get("tutor_id"), "")
        b["psicologo_nombre"] = porId.get(b.get("psicologo_id"), "")
    return filas


@app.get("/api/beneficiarios")
@auth.requiere("beneficiarios", "vista")
def listar_beneficiarios():
    """
    Cada ficha viene con 'faltantes': qué campos le quedan por llenar. El
    alta solo exige el nombre, así que la interfaz necesita poder decir
    qué falta sin bloquear a nadie.
    """
    return jsonify({"ok": True, "beneficiarios": _beneficiarios_completos()})


@app.post("/api/beneficiarios")
@auth.requiere("beneficiarios", "edicion")
def crear_beneficiario_():
    """
    Alta de un niño o adolescente acogido. Tabla y formulario propios: un
    beneficiario tiene casa, sala y grado, no cargo ni área, y por eso NO
    comparte el alta con 'personal'.
    """
    datos, error = _validar_beneficiario(request.get_json(silent=True) or {})
    if error:
        return _error(error, 400)
    datos.setdefault("estado", "activo")
    try:
        nuevo = db.crear_beneficiario(datos)
        return jsonify({"ok": True, "id": nuevo,
                        "beneficiario": db.beneficiario(nuevo),
                        "beneficiarios": _beneficiarios_completos()})
    except Exception as e:
        log.exception("fallo al crear beneficiario")
        return _error(e, 500)


def _validar_beneficiario(cuerpo, exigir_nombre=True):
    """
    Valida y normaliza los campos de un beneficiario. La comparten el alta
    y la edición: tener dos copias de estas reglas garantizaba que una se
    quedara atrás.

    Devuelve (datos, None) o (None, "mensaje de error").
    """
    nombre = str(cuerpo.get("nombre") or "").strip()
    if exigir_nombre and not nombre:
        return None, "El nombre es obligatorio"
    if "nombre" in cuerpo and not nombre:
        return None, "El nombre no puede quedar vacío"

    fecha_nac = str(cuerpo.get("fecha_nac") or "").strip()
    if fecha_nac:
        try:
            nacimiento = date.fromisoformat(fecha_nac)
        except ValueError:
            return None, "La fecha de nacimiento debe tener el formato AAAA-MM-DD"
        if nacimiento > date.today():
            return None, "La fecha de nacimiento no puede estar en el futuro"

    anio = str(cuerpo.get("anio_ingreso") or "").strip()
    if anio and (not anio.isdigit() or not 1900 <= int(anio) <= date.today().year):
        return None, "El año de ingreso no parece correcto"

    datos = {}
    for c in db.CAMPOS_BENEFICIARIO:
        if c not in cuerpo:
            continue
        if c in ("tutor_id", "psicologo_id"):
            # Son colaboradores que ya existen. Se valida aquí para poder
            # decir cuál falla; SQLite lo rechazaría igual, pero con un
            # mensaje que no le sirve a nadie.
            v = cuerpo.get(c)
            if v in (None, "", 0, "0"):
                datos[c] = None
                continue
            try:
                v = int(v)
            except (TypeError, ValueError):
                return None, f"{c} debe ser el id de una persona"
            if not db.persona_personal(v):
                return None, (f"No existe la persona {v} para asignar como "
                              + ("tutor" if c == "tutor_id" else "psicólogo/a"))
            datos[c] = v
        else:
            datos[c] = str(cuerpo.get(c) or "").strip()
    if nombre:
        datos["nombre"] = nombre
    return datos, None


@app.put("/api/beneficiarios/<int:id_>")
@auth.requiere("beneficiarios", "edicion")
def editar_beneficiario_(id_):
    """
    Corrige la ficha de un beneficiario. Actualiza la que ya existe: el
    formulario es el mismo del alta, precargado, y guardar NO debe crear
    una segunda ficha del mismo niño.
    """
    if not db.beneficiario(id_):
        return _error(f"No existe el beneficiario {id_}", 404)
    datos, error = _validar_beneficiario(request.get_json(silent=True) or {},
                                         exigir_nombre=False)
    if error:
        return _error(error, 400)
    if not datos:
        return _error("No llegó ningún campo que cambiar", 400)
    try:
        db.actualizar_beneficiario(id_, datos)
        return jsonify({"ok": True, "id": id_,
                        "beneficiario": db.beneficiario(id_),
                        "beneficiarios": _beneficiarios_completos()})
    except Exception as e:
        log.exception("fallo al editar beneficiario")
        return _error(e, 500)


# ── Sesiones de acompañamiento e incidencias ──────────────────────────────
#
# CUIDADO: ambas guardan información sensible de un menor y hoy NO hay
# control de acceso — un solo login compartido, sin roles ni registro de
# consultas. Se construyó asumiendo ese riesgo a sabiendas; resolverlo es
# la conversación de protección de datos que quedó pendiente.

@app.get("/api/beneficiarios/<int:id_>/acompanamiento")
def acompanamiento_de(id_):
    """Sesiones e incidencias de un beneficiario, con su contador anual."""
    if not db.beneficiario(id_):
        return _error(f"No existe el beneficiario {id_}", 404)
    ses = auth.sesion_actual()
    libre = ses is None and not config.LOGIN_ESTRICTO      # convivencia

    # Devuelve cada lista SOLO si el permiso alcanza. Exigir los dos
    # módulos dejaría sin ver las sesiones a quien no pueda ver
    # incidencias, que es justo la separación que se quería.
    ve_ses = libre or auth.puede(ses, "sesiones", "vista")
    ve_inc = libre or auth.puede(ses, "incidencias", "vista")
    if not ve_ses and not ve_inc:
        auth.anotar_acceso(ses, "sesiones", "vista", 403)
        return jsonify({"ok": False, "motivo": "sin_permiso",
                        "error": "Sin permiso para ver el acompañamiento"}), 403
    auth.anotar_acceso(ses, "sesiones" if ve_ses else "incidencias", "vista", 200)
    return jsonify({
        "ok": True,
        "sesiones": db.sesiones_de(id_) if ve_ses else [],
        "incidencias": db.incidencias_de(id_) if ve_inc else [],
        "sesiones_anio": db.sesiones_del_anio(id_) if ve_ses else 0,
        "puede_sesiones": ve_ses,
        "puede_incidencias": ve_inc,
        # Las tres series del expediente. Van aquí y no en peticiones
        # aparte porque se miran a la vez que lo demás, y porque el
        # permiso que las cubre es el mismo: quien ve el expediente.
        "programas": db.programas_de(id_),
        "historial": db.historial_de(id_),
        "seguimiento": db.seguimiento_de(id_),
    })


def _persona_opcional(cuerpo, campo, etiqueta):
    """Valida una FK a personal que puede venir vacía."""
    v = cuerpo.get(campo)
    if v in (None, "", 0, "0"):
        return None, None
    try:
        v = int(v)
    except (TypeError, ValueError):
        return None, f"{etiqueta} debe ser el id de una persona"
    if not db.persona_personal(v):
        return None, f"No existe la persona {v} para asignar como {etiqueta}"
    return v, None


# Sesiones e incidencias son cosas distintas —una es acompañamiento
# planificado y la otra algo que pasó— pero viven en la misma pantalla y se
# guardan igual. Lo que sigue es lo que tenían en común, escrito una vez.

# De qué tabla sale cada cosa. Se escribe aquí y no se recibe de fuera: el
# nombre de una tabla no puede venir de una petición.
_TABLA_ACOMP = {
    "sesion": ("sesiones_acompanamiento", "la sesión"),
    "incidencia": ("incidencias", "la incidencia"),
}


def _acompanamiento(bid, **extra):
    """
    Lo que ve la pantalla del expediente después de cualquier cambio.

    Las tres listas van siempre juntas: al corregir una sesión cambia el
    recuento del año, y devolver solo la lista tocada dejaba el resto de la
    pantalla enseñando números viejos hasta que alguien recargara.
    """
    return jsonify({"ok": True, "sesiones": db.sesiones_de(bid),
                    "incidencias": db.incidencias_de(bid),
                    "sesiones_anio": db.sesiones_del_anio(bid), **extra})


def _de_quien_es(que, id_):
    """
    A qué beneficiario pertenece esa fila. Devuelve (bid, error).

    Hace falta en las cuatro puertas que corrigen o borran: la fila se
    identifica sola, pero la respuesta es siempre el expediente entero del
    niño, y para eso hay que saber de quién es.
    """
    tabla, etiqueta = _TABLA_ACOMP[que]
    filas = db.consultar(
        f"SELECT beneficiario_id FROM {tabla} WHERE id = ?", (id_,))
    if not filas:
        return None, _error(f"No existe {etiqueta} {id_}", 404)
    return filas[0]["beneficiario_id"], None


def _fecha_registrable(cuerpo, que):
    """
    La fecha del cuerpo, validada. Devuelve (fecha, error).

    Ni vacía, ni con otro formato, ni futura: registrar un acompañamiento
    que todavía no ha ocurrido convierte el expediente en una intención en
    vez de un registro de lo que pasó.
    """
    fecha = str(cuerpo.get("fecha") or "").strip()
    if not fecha:
        return None, _error("La fecha es obligatoria", 400)
    try:
        f = date.fromisoformat(fecha)
    except ValueError:
        return None, _error("La fecha debe tener el formato AAAA-MM-DD", 400)
    if f > date.today():
        return None, _error(f"{que} no puede registrarse con fecha futura", 400)
    return fecha, None


@app.post("/api/beneficiarios/<int:id_>/sesiones")
@auth.requiere("sesiones", "edicion")
def crear_sesion_(id_):
    if not db.beneficiario(id_):
        return _error(f"No existe el beneficiario {id_}", 404)
    cuerpo = request.get_json(silent=True) or {}
    fecha, err = _fecha_registrable(cuerpo, "Una sesión")
    if err:
        return err
    quien, err = _persona_opcional(cuerpo, "realizada_por", "responsable")
    if err:
        return _error(err, 400)
    try:
        nuevo = db.crear_sesion(id_, fecha, cuerpo.get("tipo") or "individual",
                                quien, cuerpo.get("notas") or "")
        return _acompanamiento(id_, id=nuevo)
    except ValueError as e:
        return _error(e, 400)
    except Exception as e:
        log.exception("fallo al crear sesión")
        return _error(e, 500)


@app.put("/api/sesiones/<int:id_>")
@auth.requiere("sesiones", "edicion")
def editar_sesion_(id_):
    """
    Corrige una sesión ya registrada.

    Existía el alta y el borrado, pero no esto: una fecha o una nota mal
    escritas solo se arreglaban borrando la sesión entera, y con ella se
    iba la constancia de que ese acompañamiento ocurrió.
    """
    bid, err = _de_quien_es("sesion", id_)
    if err:
        return err
    try:
        cambiadas = db.editar_sesion(id_, request.get_json(silent=True) or {})
    except ValueError as e:
        return _error(e, 400)
    if not cambiadas:
        return _error("No llegó ningún cambio", 400)
    return _acompanamiento(bid)


@app.delete("/api/sesiones/<int:id_>")
@auth.requiere("sesiones", "edicion")
def borrar_sesion_(id_):
    bid, err = _de_quien_es("sesion", id_)
    if err:
        return err
    db.borrar_sesion(id_)
    return _acompanamiento(bid)


@app.post("/api/beneficiarios/<int:id_>/incidencias")
@auth.requiere("incidencias", "edicion")
def crear_incidencia_(id_):
    if not db.beneficiario(id_):
        return _error(f"No existe el beneficiario {id_}", 404)
    cuerpo = request.get_json(silent=True) or {}
    fecha, err = _fecha_registrable(cuerpo, "Una incidencia")
    if err:
        return err
    if not str(cuerpo.get("descripcion") or "").strip():
        return _error("La descripción es obligatoria", 400)
    quien, err = _persona_opcional(cuerpo, "reportada_por", "quien reporta")
    if err:
        return _error(err, 400)
    try:
        nuevo = db.crear_incidencia(id_, fecha, cuerpo.get("descripcion"),
                                    cuerpo.get("gravedad") or "leve", quien,
                                    cuerpo.get("seguimiento") or "")
        return _acompanamiento(id_, id=nuevo)
    except ValueError as e:
        return _error(e, 400)
    except Exception as e:
        log.exception("fallo al crear incidencia")
        return _error(e, 500)


@app.put("/api/incidencias/<int:id_>")
@auth.requiere("incidencias", "edicion")
def editar_incidencia_(id_):
    """
    Corrige una incidencia ya registrada. Misma razón que las sesiones: lo
    que se escribió mal se arregla, no se borra.
    """
    bid, err = _de_quien_es("incidencia", id_)
    if err:
        return err
    try:
        cambiadas = db.editar_incidencia(id_, request.get_json(silent=True) or {})
    except ValueError as e:
        return _error(e, 400)
    if not cambiadas:
        return _error("No llegó ningún cambio", 400)
    return _acompanamiento(bid)


@app.delete("/api/incidencias/<int:id_>")
@auth.requiere("incidencias", "edicion")
def borrar_incidencia_(id_):
    bid, err = _de_quien_es("incidencia", id_)
    if err:
        return err
    db.borrar_incidencia(id_)
    return _acompanamiento(bid)


@app.delete("/api/beneficiarios/<int:id_>")
@auth.requiere("beneficiarios", "edicion")
def borrar_beneficiario_(id_):
    """
    Quita la ficha de un beneficiario. Poder crear sin poder deshacer
    convierte cualquier error de tecleo en un registro permanente de un
    menor, así que el alta y la baja van juntas.

    Si estaba enrolado se le quita antes del terminal: la cascada de
    SQLite no llega al dispositivo físico.
    """
    b = db.beneficiario(id_)
    if not b:
        return _error(f"No existe el beneficiario {id_}", 404)
    avisos = []
    ident = db.identidad_de("beneficiario", id_)
    if ident:
        try:
            r = personas.desenrolar(ident["staff_number"])
            avisos = r.get("avisos", [])
        except Exception as e:
            log.exception("fallo al desenrolar beneficiario")
            return _error(f"No se pudo quitar del terminal: {e}", 502)
    db.borrar_beneficiario(id_)
    return jsonify({"ok": True, "nombre": b["nombre"], "avisos": avisos,
                    "beneficiarios": _beneficiarios_completos()})


# ══════════════════════════════════════════════════════════════════════════
#  HOJA DE VIDA: FORMACIÓN Y EXPERIENCIA
#
#  Cuelgan de 'personal', así que el permiso es el mismo: quien puede ver una
#  ficha ve su trayectoria, y quien puede editarla la modifica. No hacía falta
#  un módulo de permisos propio para esto.
# ══════════════════════════════════════════════════════════════════════════

@app.get("/api/personal/<int:id_>/trayectoria")
@auth.requiere("personal", "vista")
def trayectoria(id_):
    """
    Las dos series de una vez: la hoja de vida las muestra juntas y pedirlas
    por separado serían dos viajes para pintar una sola pantalla.
    """
    if not db.persona_personal(id_):
        return _error(f"No existe la persona {id_}", 404)
    return jsonify({"ok": True,
                    "formacion": db.formacion_de(id_),
                    "experiencia": db.experiencia_de(id_)})


@app.post("/api/personal/<int:id_>/formacion")
@auth.requiere("personal", "edicion")
def crear_formacion_(id_):
    if not db.persona_personal(id_):
        return _error(f"No existe la persona {id_}", 404)
    cuerpo = request.get_json(silent=True) or {}
    if not str(cuerpo.get("institucion") or "").strip() \
            and not str(cuerpo.get("carrera") or "").strip():
        return _error("Pon al menos la institución o la carrera", 400)
    datos = {c: cuerpo[c] for c in db.CAMPOS_FORMACION if c in cuerpo}
    fid = db.crear_formacion(id_, datos)
    return jsonify({"ok": True, "id": fid, "formacion": db.formacion_de(id_)})


@app.put("/api/formacion/<int:id_>")
@auth.requiere("personal", "edicion")
def editar_formacion_(id_):
    cuerpo = request.get_json(silent=True) or {}
    datos = {c: cuerpo[c] for c in db.CAMPOS_FORMACION if c in cuerpo}
    if not datos:
        return _error("No llegó ningún cambio", 400)
    db.editar_formacion(id_, datos)
    return jsonify({"ok": True})


@app.delete("/api/formacion/<int:id_>")
@auth.requiere("personal", "edicion")
def borrar_formacion_(id_):
    db.borrar_formacion(id_)
    return jsonify({"ok": True})


@app.post("/api/personal/<int:id_>/experiencia")
@auth.requiere("personal", "edicion")
def crear_experiencia_(id_):
    if not db.persona_personal(id_):
        return _error(f"No existe la persona {id_}", 404)
    cuerpo = request.get_json(silent=True) or {}
    if not str(cuerpo.get("empresa") or "").strip() \
            and not str(cuerpo.get("cargo") or "").strip():
        return _error("Pon al menos la empresa o el cargo", 400)
    datos = {c: cuerpo[c] for c in db.CAMPOS_EXPERIENCIA if c in cuerpo}
    eid = db.crear_experiencia(id_, datos)
    return jsonify({"ok": True, "id": eid, "experiencia": db.experiencia_de(id_)})


@app.put("/api/experiencia/<int:id_>")
@auth.requiere("personal", "edicion")
def editar_experiencia_(id_):
    cuerpo = request.get_json(silent=True) or {}
    datos = {c: cuerpo[c] for c in db.CAMPOS_EXPERIENCIA if c in cuerpo}
    if not datos:
        return _error("No llegó ningún cambio", 400)
    db.editar_experiencia(id_, datos)
    return jsonify({"ok": True})


@app.delete("/api/experiencia/<int:id_>")
@auth.requiere("personal", "edicion")
def borrar_experiencia_(id_):
    db.borrar_experiencia(id_)
    return jsonify({"ok": True})


# ══════════════════════════════════════════════════════════════════════════
#  SERIES DEL EXPEDIENTE DE BENEFICIARIO
#
#  Programas, historial educativo y seguimiento social. Van bajo el permiso
#  de 'beneficiarios', no bajo uno propio: son partes del mismo expediente, y
#  quien puede abrirlo puede ver lo que contiene.
#
#  Las tres siguen la misma forma: un GET que las trae juntas, y por cada una
#  un POST colgado del beneficiario más un PUT y un DELETE colgados de la
#  fila. El id del beneficiario va en la ruta del POST para que no se pueda
#  colar por el cuerpo y escribir en el expediente de otro.
# ══════════════════════════════════════════════════════════════════════════

# ══════════════════════════════════════════════════════════════════════════
#  PANEL DE GESTIÓN DE PERSONAS
# ══════════════════════════════════════════════════════════════════════════

# ══════════════════════════════════════════════════════════════════════════
#  GESTIÓN DE PERMISOS
#
#  Dos caminos sobre los mismos datos:
#
#    · AUTOSERVICIO — /api/permisos/mios y el POST de alta. Actúan sobre
#      quien está en la sesión y sobre nadie más. El personal_id sale de
#      auth.sesion_actual(), NUNCA del cuerpo: si viniera de fuera,
#      cualquiera podría pedir permisos a nombre de otro.
#
#    · REVISIÓN — el listado completo y las tres acciones. Piden permiso de
#      edición sobre 'permisos', que es lo que tiene la jefatura.
#
#  Las reglas (saldo, umbral de días, transiciones) no están aquí: viven en
#  solicitudes.py. Esto solo traduce entre HTTP y esas reglas.
# ══════════════════════════════════════════════════════════════════════════

def _sol_visible(s):
    """La solicitud con lo que la pantalla necesita y la base no guarda."""
    d = reglas_permisos.con_etiquetas(s)
    d["dias"] = reglas_permisos.dias(d["desde"], d["hasta"])
    persona = db.persona_personal(d["personal_id"])
    d["persona"] = persona["nombre"] if persona else "(ficha eliminada)"
    d["cargo"] = (persona or {}).get("cargo") or ""
    jefe = db.persona_personal(d["jefe_id"]) if d.get("jefe_id") else None
    d["jefe"] = jefe["nombre"] if jefe else ""
    return d


@app.get("/api/mi-firma")
def mi_firma():
    """Si quien está conectado tiene firma guardada, y cuál."""
    pid, error = _yo()
    if error:
        return error
    p = db.persona_personal(pid)
    return jsonify({"ok": True, "tiene": bool(p and p.get("firma")),
                    "url": f"/api/personal/{pid}/firma" if (p and p.get("firma"))
                           else None})


@app.post("/api/mi-firma")
def guardar_mi_firma():
    """
    Guarda el trazo que la persona acaba de dibujar.

    Solo la propia: nadie puede subir la firma de otro, ni siquiera quien
    administra. Una firma que alguien más puede poner no vale como firma.
    """
    pid, error = _yo()
    if error:
        return error
    ses, err_csrf = _sesion_con_csrf()
    if err_csrf:
        return err_csrf
    cuerpo = request.get_json(silent=True) or {}
    try:
        interno = firmas.aceptar(cuerpo.get("imagen"))
    except firmas.FirmaError as e:
        return _error(e, 400)
    p = db.persona_personal(pid)
    anterior = p.get("firma") if p else None
    db.guardar_firma(pid, interno)
    if anterior and anterior != interno:
        firmas.borrar(anterior)
    return jsonify({"ok": True, "url": f"/api/personal/{pid}/firma"})


@app.delete("/api/mi-firma")
def borrar_mi_firma():
    """Quita la firma propia. Los documentos ya firmados no se tocan."""
    pid, error = _yo()
    if error:
        return error
    ses, err_csrf = _sesion_con_csrf()
    if err_csrf:
        return err_csrf
    p = db.persona_personal(pid)
    anterior = p.get("firma") if p else None
    db.guardar_firma(pid, None)
    if anterior:
        firmas.borrar(anterior)
    return jsonify({"ok": True})


@app.get("/api/personal/<int:id_>/firma")
def ver_firma(id_):
    """
    El trazo, para pintarlo en la vista previa.

    Lo ve la propia persona y quien pueda ver permisos: son quienes ya ven
    esa firma estampada en el documento. Para el resto no existe.
    """
    ses = auth.sesion_actual()
    mia = bool(ses) and ses.get("personal_id") == id_
    if not mia and not auth.puede(ses, "permisos", "vista"):
        return _error("No tienes permiso para ver esa firma.", 403)
    p = db.persona_personal(id_)
    ruta = firmas.ruta_de(p.get("firma") if p else None)
    if not ruta:
        return _error("Esa persona no tiene firma registrada", 404)
    return send_file(ruta, mimetype="image/jpeg")


@app.get("/api/reportes/<modulo>.pdf")
def reporte_pdf(modulo):
    """
    El listado de un módulo, en PDF, con los filtros que traiga la
    dirección. Ver reportes.py.
    """
    if modulo not in reportes.MODULOS:
        return _error(f"No hay reporte para «{modulo}»", 404)
    _, permiso = reportes.MODULOS[modulo]
    ses = auth.sesion_actual()
    if not auth.puede(ses, permiso, "vista"):
        auth.anotar_acceso(ses, permiso, "vista", 403)
        return _error("No tienes permiso para ver este módulo.", 403)

    par = db.parametros() or {}
    try:
        datos = reportes.armar(
            modulo,
            {k: v for k, v in request.args.items()},
            quien=(ses or {}).get("nombre") or "",
            organizacion=par.get("organizacion") or "Lost Children Perú")
    except KeyError as e:
        return _error(e, 404)
    auth.anotar_acceso(ses, permiso, "vista", 200)
    hoy = date.today().isoformat()
    return send_file(io.BytesIO(datos), mimetype="application/pdf",
                     as_attachment=False,
                     download_name=f"{modulo}-{hoy}.pdf")


@app.get("/api/marca/<nombre>")
def marca(nombre):
    """El logo y la filigrana del formato, para la vista previa.

    Lista cerrada: es una carpeta del servidor y aceptar cualquier nombre
    sería dejar leer lo que haya alrededor.
    """
    if nombre not in ("logo.jpg", "filigrana.jpg"):
        return _error("No existe esa imagen", 404)
    ruta = os.path.join(documento_permiso.MARCA, nombre)
    if not os.path.exists(ruta):
        return _error("No existe esa imagen", 404)
    return send_file(ruta, mimetype="image/jpeg")


@app.get("/api/permisos/tipos")
@auth.requiere("permisos", "vista")
def tipos_permiso():
    """
    Los tipos y sus etiquetas, para que la pantalla no los tenga escritos.
    Si mañana cambia la lista, cambia en un sitio.
    """
    return jsonify({
        "ok": True,
        "tipos": [{"valor": t, "etiqueta": reglas_permisos.ETIQUETAS[t]}
                  for t in reglas_permisos.TIPOS],
        "dias_visto_bueno_admin": config.DIAS_VISTO_BUENO_ADMIN,
        # El formato de papel, para que la vista previa enseñe exactamente
        # lo que se va a imprimir. Sale de quien imprime el PDF: una copia
        # escrita en el HTML acabaría diciendo otra cosa.
        "formato": {
            "casillas": [{"numero": n, "etiqueta": e}
                         for n, e in documento_permiso.TIPOS],
            "casilla_de": documento_permiso.CASILLA,
        },
    })


@app.get("/api/permisos")
@auth.requiere("permisos", "vista")
def listar_permisos():
    """
    Todas las solicitudes, con filtro opcional por estado.

    Sin filtro devuelve las que están por resolver, que es lo que la
    pantalla de revisión necesita al abrirse.
    """
    estado = (request.args.get("estado") or "").strip()
    if estado == "todas":
        filas = db.solicitudes()
    elif estado:
        filas = db.solicitudes(estado=estado)
    else:
        filas = [s for s in db.solicitudes()
                 if s["estado"] in reglas_permisos.ABIERTOS]
    return jsonify({"ok": True,
                    "solicitudes": [_sol_visible(s) for s in filas],
                    "resumen": db.resumen_solicitudes()})


@app.get("/api/permisos/mios")
def mis_permisos():
    """Las solicitudes de quien está conectado, y su saldo de vacaciones."""
    pid, error = _yo()
    if error:
        return error
    filas = db.solicitudes_de(pid)
    return jsonify({
        "ok": True,
        "solicitudes": [_sol_visible(s) for s in filas],
        # None significa "esto no aplica" (no está en planilla, o no tiene
        # fecha de ingreso), que no es lo mismo que cero días.
        "saldo_vacaciones": reglas_permisos.saldo_vacaciones(pid),
        "dias_visto_bueno_admin": config.DIAS_VISTO_BUENO_ADMIN,
        "tipos": [{"valor": t, "etiqueta": reglas_permisos.ETIQUETAS[t]}
                  for t in reglas_permisos.TIPOS],
        # Los datos de la persona que el formato imprime en su cabecera.
        # La pantalla los necesita para la vista previa; sacarlos del rol
        # de usuario sería enseñar «Director» donde el papel pide el
        # puesto, que no es lo mismo.
        # Los periodos a los que se pueden cargar días, calculados sobre
        # la fecha de ingreso de esta persona. Ver solicitudes.periodos().
        "periodos": reglas_permisos.periodos(pid),
        "yo": (lambda p: {
            "nombre": p.get("nombre") or "",
            "cargo": p.get("cargo") or "",
            "area": p.get("area") or "",
            "jefe": p.get("jefe_nombre") or "",
        } if p else {})(db.persona_personal(pid)),
        # El formato de papel, para que la vista previa sea el documento.
        "formato": {
            "casillas": [{"numero": n, "etiqueta": e}
                         for n, e in documento_permiso.TIPOS],
            "casilla_de": documento_permiso.CASILLA,
        },
    })


@app.post("/api/permisos")
def crear_permiso():
    """
    Alta desde el autoservicio. Siempre a nombre de quien está en la sesión.
    """
    pid, error = _yo()
    if error:
        return error
    cuerpo = request.get_json(silent=True) or {}
    try:
        sid = reglas_permisos.crear(
            pid,
            (cuerpo.get("tipo") or "").strip(),
            (cuerpo.get("desde") or "").strip(),
            (cuerpo.get("hasta") or "").strip(),
            (cuerpo.get("motivo") or "").strip(),
            hora_desde=(cuerpo.get("hora_desde") or "").strip(),
            hora_hasta=(cuerpo.get("hora_hasta") or "").strip(),
            periodo=(cuerpo.get("periodo") or "").strip(),
        )
    except reglas_permisos.ReglaRota as e:
        return _error(e, 400)
    except ValueError as e:
        return _error(e, 400)
    return jsonify({"ok": True, "id": sid,
                    "solicitud": _sol_visible(db.solicitud(sid))})


@app.post("/api/permisos/<int:id_>/sustento")
def adjuntar_sustento(id_):
    """
    El documento que respalda un permiso: una constancia médica, una
    citación. Solo puede adjuntarlo quien pidió la solicitud, y solo
    mientras esté sin resolver — después ya no cambiaría nada y sí podría
    alterar lo que alguien firmó.
    """
    pid, error = _yo()
    if error:
        return error
    sol = db.solicitud(id_)
    if not sol:
        return _error(f"No existe la solicitud {id_}", 404)
    if sol["personal_id"] != pid:
        return _error("Esa solicitud no es tuya.", 403)
    if not str(sol["estado"]).startswith("pendiente"):
        return _error("Esa solicitud ya está resuelta; su sustento no se puede cambiar.", 409)

    fichero = request.files.get("archivo")
    if fichero is None or not fichero.filename:
        return _error("No llegó ningún archivo", 400)
    try:
        adjunto = archivos.guardar(fichero, fichero.filename)
    except archivos.ArchivoError as e:
        return _error(e, 400)
    anterior = sol.get("archivo")
    db.adjuntar_a_solicitud(id_, adjunto)
    if anterior and anterior != adjunto["archivo"]:
        archivos.borrar(anterior)
    return jsonify({"ok": True, "solicitud": _sol_visible(db.solicitud(id_))})


def _firma_de(personal_id):
    """Los bytes de la firma de una persona, o None si no tiene."""
    if not personal_id:
        return None
    p = db.persona_personal(personal_id)
    return firmas.datos_de(p.get("firma")) if p else None


@app.get("/api/permisos/<int:id_>/documento.pdf")
def documento_pdf(id_):
    """
    El permiso en papel. Lo baja quien lo pidió o quien revisa permisos:
    para el primero es su comprobante, para el segundo es lo que archiva.
    """
    sol = db.solicitud(id_)
    if not sol:
        return _error(f"No existe la solicitud {id_}", 404)
    ses = auth.sesion_actual()
    mio = bool(ses) and ses.get("personal_id") == sol["personal_id"]
    if not mio and not auth.puede(ses, "permisos", "vista"):
        return _error("No tienes permiso para ver este documento.", 403)

    par = db.parametros() or {}
    datos = documento_permiso.armar(
        reglas_permisos.con_etiquetas(sol),
        organizacion=par.get("organizacion") or "Lost Children Perú",
        firma_colaborador=_firma_de(sol.get("personal_id")),
        # La de jefatura solo si aprobó: estamparla en una pendiente o en
        # una rechazada sería firmar algo que nadie firmó. Y sale de QUIEN
        # RESOLVIÓ, no de 'jefe_id': ese se copia de la ficha al crear y
        # está vacío mientras nadie tenga jefe asignado, así que el papel
        # salía con la firma del colaborador y la otra línea en blanco.
        firma_jefe=(_firma_de(sol.get("resuelta_por") or sol.get("jefe_id"))
                    if sol.get("estado") == "aprobada" else None))
    limpio = "".join(c for c in str(sol.get("nombre") or "permiso")
                     if c.isalnum() or c in " -_").strip() or "permiso"
    return send_file(io.BytesIO(datos), mimetype="application/pdf",
                     as_attachment=False,
                     download_name=f"Permiso {id_} - {limpio}.pdf")


@app.get("/api/permisos/<int:id_>/sustento")
@auth.requiere("permisos", "vista")
def ver_sustento(id_):
    """El documento, para quien revisa la solicitud."""
    sol = db.solicitud(id_)
    if not sol:
        return _error(f"No existe la solicitud {id_}", 404)
    ruta = archivos.ruta_de(sol.get("archivo"))
    if not ruta:
        return _error("Esa solicitud no tiene documento de sustento", 404)
    return send_file(ruta, mimetype=sol.get("archivo_mime") or None,
                     as_attachment=False,
                     download_name=sol.get("archivo_nombre") or "sustento")


def _resolver(id_, accion):
    cuerpo = request.get_json(silent=True) or {}
    # Quién resuelve sale de la SESIÓN, no del cuerpo de la petición: si
    # viniera de fuera, cualquiera podría firmar como otro. De aquí sale la
    # firma de jefatura del documento.
    ses = auth.sesion_actual()
    quien = (ses or {}).get("personal_id")
    try:
        sol = reglas_permisos.resolver(id_, accion,
                                       (cuerpo.get("nota") or "").strip(),
                                       resuelta_por=quien)
    except KeyError as e:
        return _error(e, 404)
    except reglas_permisos.ReglaRota as e:
        return _error(e, 409)
    return jsonify({"ok": True, "solicitud": _sol_visible(sol)})


@app.post("/api/permisos/<int:id_>/aprobar")
@auth.requiere("permisos", "edicion")
def aprobar_permiso(id_):
    """
    Aprobar. Si la solicitud es larga y solo pasó por la jefatura, no queda
    aprobada: pasa a esperar el visto bueno de Administración.
    """
    return _resolver(id_, "aprobar")


@app.post("/api/permisos/<int:id_>/rechazar")
@auth.requiere("permisos", "edicion")
def rechazar_permiso(id_):
    """Rechazar. La nota es el motivo, y se guarda: el trabajador la lee."""
    cuerpo = request.get_json(silent=True) or {}
    if not (cuerpo.get("nota") or "").strip():
        return _error("Escribe el motivo del rechazo: quien la pidió tiene "
                      "derecho a saber por qué.", 400)
    return _resolver(id_, "rechazar")


@app.post("/api/permisos/<int:id_>/cancelar")
def cancelar_permiso(id_):
    """
    Cancelar. Lo puede hacer quien la pidió —es suya— o la jefatura.

    Se comprueba aquí y no con un decorador porque la regla depende de la
    fila: sin sesión no se puede saber si es tuya, y con permiso de edición
    da igual de quién sea.
    """
    sol = db.solicitud(id_)
    if not sol:
        return _error(f"No existe la solicitud {id_}", 404)
    ses, err_csrf = _sesion_con_csrf()
    if err_csrf:
        return err_csrf
    mia = bool(ses) and ses.get("personal_id") == sol["personal_id"]
    if not mia and not auth.puede(ses, "permisos", "edicion"):
        return _error("Solo puedes cancelar tus propias solicitudes.", 403)
    return _resolver(id_, "cancelar")


@app.get("/api/campos-requeridos")
def campos_requeridos():
    """
    Qué campos exige cada ficha, y con qué nombre mostrarlos.

    La pantalla los pide en vez de tenerlos escritos: si estuvieran en los
    dos sitios acabarían discrepando, y el formulario pediría cosas que el
    servidor no exige o al revés. No lleva permiso porque no revela ningún
    dato: es la forma de las fichas, no su contenido.
    """
    return jsonify({
        "ok": True,
        "personal":     [{"campo": c, "etiqueta": e} for c, e in db.CAMPOS_PERSONAL_COMPLETO],
        "beneficiario": [{"campo": c, "etiqueta": e} for c, e in db.CAMPOS_FICHA_COMPLETA],
        "responsable":  [{"campo": c, "etiqueta": e} for c, e in db.CAMPOS_RESPONSABLE_COMPLETO],
    })


@app.get("/api/personas/resumen")
@auth.requiere("personal", "vista")
def resumen_personas():
    """
    Los números del panel, calculados en el servidor.

    Se hace aquí y no en la pantalla porque hay que recorrer las tres tablas
    y decidir qué cuenta como ficha incompleta; si eso viviera en el
    navegador, cada vista tendría su propia idea de lo que significa.
    """
    return jsonify({"ok": True, "resumen": db.resumen_personas()})


@app.get("/api/beneficiarios/<int:id_>/series")
@auth.requiere("beneficiarios", "vista")
def series_beneficiario(id_):
    """
    Las tres de una vez: el expediente las muestra en pestañas del mismo
    bloque, y pedirlas por separado serían tres viajes para pintar una sola
    pantalla.
    """
    if not db.beneficiario(id_):
        return _error(f"No existe el beneficiario {id_}", 404)
    return jsonify({"ok": True,
                    "programas": db.programas_de(id_),
                    "historial": db.historial_de(id_),
                    "seguimiento": db.seguimiento_de(id_)})


# ── Programas ─────────────────────────────────────────────────────────────

@app.post("/api/beneficiarios/<int:id_>/programas")
@auth.requiere("beneficiarios", "edicion")
def crear_programa_(id_):
    if not db.beneficiario(id_):
        return _error(f"No existe el beneficiario {id_}", 404)
    cuerpo = request.get_json(silent=True) or {}
    if not str(cuerpo.get("programa") or "").strip():
        return _error("El programa no puede quedar vacío", 400)
    datos = {c: cuerpo[c] for c in db.CAMPOS_PROGRAMA if c in cuerpo}
    pid = db.crear_programa(id_, datos)
    return jsonify({"ok": True, "id": pid, "programas": db.programas_de(id_)})


@app.put("/api/programas/<int:id_>")
@auth.requiere("beneficiarios", "edicion")
def editar_programa_(id_):
    cuerpo = request.get_json(silent=True) or {}
    datos = {c: cuerpo[c] for c in db.CAMPOS_PROGRAMA if c in cuerpo}
    if not datos:
        return _error("No llegó ningún cambio", 400)
    db.editar_programa(id_, datos)
    return jsonify({"ok": True})


@app.delete("/api/programas/<int:id_>")
@auth.requiere("beneficiarios", "edicion")
def borrar_programa_(id_):
    db.borrar_programa(id_)
    return jsonify({"ok": True})


# ── Historial educativo ───────────────────────────────────────────────────

@app.post("/api/beneficiarios/<int:id_>/historial")
@auth.requiere("beneficiarios", "edicion")
def crear_historial_(id_):
    if not db.beneficiario(id_):
        return _error(f"No existe el beneficiario {id_}", 404)
    cuerpo = request.get_json(silent=True) or {}
    if not str(cuerpo.get("anio") or "").strip() \
            and not str(cuerpo.get("institucion") or "").strip():
        return _error("Pon al menos el año o la institución", 400)
    datos = {c: cuerpo[c] for c in db.CAMPOS_HISTORIAL if c in cuerpo}
    hid = db.crear_historial(id_, datos)
    return jsonify({"ok": True, "id": hid, "historial": db.historial_de(id_)})


@app.put("/api/historial/<int:id_>")
@auth.requiere("beneficiarios", "edicion")
def editar_historial_(id_):
    cuerpo = request.get_json(silent=True) or {}
    datos = {c: cuerpo[c] for c in db.CAMPOS_HISTORIAL if c in cuerpo}
    if not datos:
        return _error("No llegó ningún cambio", 400)
    db.editar_historial(id_, datos)
    return jsonify({"ok": True})


@app.delete("/api/historial/<int:id_>")
@auth.requiere("beneficiarios", "edicion")
def borrar_historial_(id_):
    db.borrar_historial(id_)
    return jsonify({"ok": True})


# ── Seguimiento social ────────────────────────────────────────────────────

@app.post("/api/beneficiarios/<int:id_>/seguimiento")
@auth.requiere("beneficiarios", "edicion")
def crear_seguimiento_(id_):
    if not db.beneficiario(id_):
        return _error(f"No existe el beneficiario {id_}", 404)
    cuerpo = request.get_json(silent=True) or {}
    if not str(cuerpo.get("fecha") or "").strip():
        return _error("Un seguimiento sin fecha no sirve para nada", 400)
    if not str(cuerpo.get("situacion") or "").strip():
        return _error("Escribe qué se detectó", 400)
    datos = {c: cuerpo[c] for c in db.CAMPOS_SEGUIMIENTO if c in cuerpo}
    # El responsable llega como texto desde un <select>; la columna es un id.
    if "responsable_id" in datos:
        datos["responsable_id"] = int(datos["responsable_id"] or 0) or None
    sid = db.crear_seguimiento(id_, datos)
    return jsonify({"ok": True, "id": sid, "seguimiento": db.seguimiento_de(id_)})


@app.put("/api/seguimiento/<int:id_>")
@auth.requiere("beneficiarios", "edicion")
def editar_seguimiento_(id_):
    cuerpo = request.get_json(silent=True) or {}
    datos = {c: cuerpo[c] for c in db.CAMPOS_SEGUIMIENTO if c in cuerpo}
    if not datos:
        return _error("No llegó ningún cambio", 400)
    if "responsable_id" in datos:
        datos["responsable_id"] = int(datos["responsable_id"] or 0) or None
    db.editar_seguimiento(id_, datos)
    return jsonify({"ok": True})


@app.delete("/api/seguimiento/<int:id_>")
@auth.requiere("beneficiarios", "edicion")
def borrar_seguimiento_(id_):
    db.borrar_seguimiento(id_)
    return jsonify({"ok": True})


# ══════════════════════════════════════════════════════════════════════════
#  CANAL WEB DE MARCACIÓN FACIAL
#
#  Todo esto es AUTOSERVICIO: cada endpoint actúa sobre la persona de la
#  sesión y sobre nadie más. El personal_id sale de auth.sesion_actual(),
#  NUNCA del cuerpo de la petición — si viniera de fuera, cualquiera podría
#  enrolar un rostro ajeno o marcar por un compañero pasando otro id.
#
#  Esto además cierra el hueco de "ver solo lo mío": aquí no hace falta
#  filtrar por permisos de módulo, porque el propio endpoint no sabe hablar
#  de otra persona que no sea la que está conectada.
# ══════════════════════════════════════════════════════════════════════════

def _sesion_con_csrf():
    """
    La sesión, si trae el token de seguridad. Devuelve (sesión, error).

    Las puertas de módulo comprueban el token dentro de @auth.requiere.
    Estas no llevan decorador —«mi firma», «cancelar mi permiso»: son cosas
    de uno mismo, no de un módulo— y lo comprobaban a mano, con las mismas
    tres líneas copiadas cuatro veces. Escrito una vez, la próxima puerta de
    este tipo que se olvide de llamarlo canta a la vista.
    """
    ses = auth.sesion_actual()
    if not auth.csrf_valido(ses):
        return None, _error("Petición sin token de seguridad válido", 403)
    return ses, None


def _yo():
    """
    La ficha de personal de quien está conectado, o un error listo para
    devolver. En convivencia no hay sesión: el autoservicio no puede
    funcionar sin saber quién eres, y decirlo claro es mejor que adivinar.
    """
    ses = auth.sesion_actual()
    if not ses:
        return None, (jsonify({
            "ok": False, "motivo": "sin_sesion",
            "error": "Para marcar desde el navegador tienes que entrar con tu "
                     "usuario: el sistema necesita saber quién eres."}), 401)
    # Las escrituras del autoservicio no pasan por @auth.requiere, así que
    # el CSRF se exige aquí: es el punto por el que pasan todas.
    if not auth.csrf_valido(ses):
        return None, (jsonify({
            "ok": False, "motivo": "csrf",
            "error": "Petición sin token de seguridad válido"}), 403)
    pid = ses.get("personal_id")
    if not pid:
        return None, (jsonify({
            "ok": False, "motivo": "sin_ficha",
            "error": "Tu cuenta no está vinculada a una ficha de personal. "
                     "Avisa a RRHH."}), 400)
    return pid, None


@app.get("/api/consentimiento/rostro")
def consentimiento_rostro():
    """El texto que hay que aceptar, y si esta persona ya lo aceptó."""
    pid, err = _yo()
    if err:
        return err
    vigente = db.consentimiento_vigente(pid, "rostro_web")
    return jsonify({
        "ok": True,
        "version": config.CONSENTIMIENTO_ROSTRO_VERSION,
        "texto": config.CONSENTIMIENTO_ROSTRO_TEXTO,
        "aceptado": vigente is not None,
        # Si aceptó una versión anterior del texto, tiene que volver a
        # aceptar: no se le puede dar por consentida una redacción que no vio.
        "version_aceptada": (vigente or {}).get("version", ""),
        "al_dia": bool(vigente) and vigente["version"] == config.CONSENTIMIENTO_ROSTRO_VERSION,
        "tiene_rostro": db.rostro_web(pid) is not None,
    })


@app.post("/api/consentimiento/rostro")
def aceptar_consentimiento_rostro():
    """
    Registra la decisión, sea sí o no. Un rechazo también se guarda: hace
    falta poder demostrar que se preguntó y qué contestó.
    """
    pid, err = _yo()
    if err:
        return err
    cuerpo = request.get_json(silent=True) or {}
    acepta = bool(cuerpo.get("acepto"))
    db.registrar_consentimiento(
        pid, acepta,
        config.CONSENTIMIENTO_ROSTRO_VERSION,
        config.CONSENTIMIENTO_ROSTRO_TEXTO,
        tipo="rostro_web", ip=_ip(),
        agente=request.headers.get("User-Agent", "")[:200],
    )
    if not acepta:
        # Si ya tenía rostro y ahora dice que no, el dato biométrico se va.
        db.borrar_rostro_web(pid)
        db.revocar_consentimiento(pid, "rostro_web")
    log.info(f"consentimiento de rostro web: personal {pid} → "
             f"{'aceptado' if acepta else 'rechazado'}")
    return jsonify({"ok": True, "aceptado": acepta})


@app.delete("/api/consentimiento/rostro")
def revocar_consentimiento_rostro():
    """Retirar el permiso. Se borra el rostro; la constancia se conserva."""
    pid, err = _yo()
    if err:
        return err
    db.revocar_consentimiento(pid, "rostro_web")
    db.borrar_rostro_web(pid)
    log.info(f"consentimiento de rostro web revocado: personal {pid}")
    return jsonify({"ok": True, "revocado": True})


def _validar_descriptor(cuerpo):
    """
    Un descriptor válido o un error. Se comprueba la longitud porque comparar
    vectores de modelos distintos no da un resultado malo: da un resultado
    sin significado.
    """
    d = cuerpo.get("descriptor")
    if not isinstance(d, list) or not d:
        return None, "No llegó el descriptor del rostro"
    if len(d) != config.ROSTRO_WEB_DIMENSION:
        return None, (f"El descriptor tiene {len(d)} valores y se esperaban "
                      f"{config.ROSTRO_WEB_DIMENSION}: el navegador está usando "
                      f"otro modelo del que generó la referencia")
    try:
        vector = [float(x) for x in d]
    except (TypeError, ValueError):
        return None, "El descriptor tiene valores que no son números"
    return vector, None


@app.post("/api/rostro-web")
def guardar_rostro_web_():
    """
    Guarda el rostro de referencia del canal web.

    Exige consentimiento vigente ANTES de escribir. No es una comprobación
    de cortesía: sin ella el sistema podría acabar guardando un dato
    biométrico que nadie autorizó.
    """
    pid, err = _yo()
    if err:
        return err

    vigente = db.consentimiento_vigente(pid, "rostro_web")
    if vigente is None:
        return jsonify({
            "ok": False, "motivo": "sin_consentimiento",
            "error": "Antes de registrar tu rostro tienes que aceptar el aviso "
                     "de tratamiento de datos."}), 403
    if vigente["version"] != config.CONSENTIMIENTO_ROSTRO_VERSION:
        return jsonify({
            "ok": False, "motivo": "consentimiento_antiguo",
            "error": "El aviso cambió desde que lo aceptaste. Léelo de nuevo "
                     "y vuelve a aceptarlo."}), 403

    cuerpo = request.get_json(silent=True) or {}
    vector, problema = _validar_descriptor(cuerpo)
    if problema:
        return _error(problema, 400)

    ses = auth.sesion_actual()
    db.guardar_rostro_web(
        pid, json.dumps(vector), len(vector),
        str(cuerpo.get("modelo") or "")[:60],
        registrado_por=(ses or {}).get("usuario_id"))
    log.info(f"rostro web registrado para personal {pid}")
    return jsonify({"ok": True, "registrado": True})


@app.delete("/api/rostro-web")
def borrar_rostro_web_():
    """Quitar el propio rostro sin revocar el consentimiento."""
    pid, err = _yo()
    if err:
        return err
    db.borrar_rostro_web(pid)
    return jsonify({"ok": True})


# Aquí estaba GET /api/rostro-web/pendientes, que alimentaba el bloque
# «Rostro para marcar por el celular» de Gestión Biométrica. Ese bloque
# se retiró el 31/08/2026 —marcar en el terminal o por el celular es una
# elección de cada quien, no un trámite pendiente— y la puerta se quedó
# sirviendo a nadie. Con ella se fue db.rostros_web_registrados(), que
# no tenía otro uso.


# Aquí vivían _sede_configurada() y _metros_entre(). Sostenían el punto
# de sede y el cálculo de metros: primero para rechazar a quien marcara
# lejos, y después para señalarlo en la lista. Las dos cosas se
# retiraron el 31/08/2026 por decisión de la ONG — la ubicación de una
# marca no tiene que ver con la de la casa; lo que hay que ver es DÓNDE
# estaba la persona, y eso lo dice el nombre del sitio.


def _distancia(a, b):
    """Distancia euclídea. Sin numpy: son 128 números una vez por marca."""
    return sum((x - y) ** 2 for x, y in zip(a, b)) ** 0.5


@app.get("/api/asistencia/mias")
def mis_marcas_de_hoy():
    """Lo que esta persona ha marcado hoy, para su propia pantalla."""
    pid, err = _yo()
    if err:
        return err
    hoy = date.today().isoformat()
    ident = db.identidad_de("personal", pid)
    marcas = []
    if ident:
        marcas = [dict(m) for m in db.marcas_del_staff(ident["staff_number"], hoy)]
    par = db.parametros() or {}
    try:
        # 48 h: la jornada máxima en Perú. Es el valor que la ONG fijó el
        # 27/08/2026 como referencia; sigue siendo un dato PUESTO A MANO, no
        # algo que el sistema deduzca del horario de nadie.
        meta = float(par.get("meta_semanal") or 48)
    except (TypeError, ValueError):
        meta = 40.0

    # ── La semana, de lunes a viernes ────────────────────────────────────
    hoy_d = date.today()
    lunes = hoy_d.fromordinal(hoy_d.toordinal() - hoy_d.weekday())
    viernes = lunes.fromordinal(lunes.toordinal() + 4)
    semana = []
    # La semana se dibuja siempre, tenga o no identidad: cinco días vacíos
    # son la respuesta correcta para quien aún no ha marcado nunca. Antes
    # se devolvía una lista vacía y el gráfico quedaba en blanco sin decir
    # por qué.
    detalle = {}
    if ident:
        for f in db.marcas_rango(lunes.isoformat(), viernes.isoformat()):
            if dict(f).get("staff_number") == ident["staff_number"]:
                detalle = dict(f).get("dias") or {}
                break
    if True:
        for i in range(5):
            d = lunes.fromordinal(lunes.toordinal() + i)
            m = detalle.get(d.isoformat()) or {}
            semana.append({
                "fecha": d.isoformat(),
                "dia": ["Lun", "Mar", "Mié", "Jue", "Vie"][i],
                "entrada": m.get("entrada"), "salida": m.get("salida"),
                "horas": m.get("horas"),
                "hoy": d == hoy_d,
            })

    return jsonify({"ok": True, "fecha": hoy, "marcas": marcas, "puede": True,
                    # La hora del SERVIDOR: el reloj no puede salir del
                    # teléfono, que cualquiera puede cambiar.
                    "ahora": datetime.datetime.now().strftime("%H:%M:%S"),
                    "semana": semana, "meta": meta,
                    # Sin rostro de referencia no se puede comparar nada, así
                    # que la pantalla tiene que poder pedirlo antes de marcar.
                    "rostro": db.rostro_web(pid) is not None,
                    "consintio": db.consentimiento_vigente(pid, "rostro_web") is not None})


@app.post("/api/asistencia/marcar")
def marcar_desde_el_movil():
    """
    Marca de asistencia desde el navegador del propio trabajador.

    Este es el canal «web» de los dos que hay: el otro es el terminal de
    la puerta. No exige enrolamiento —ese es el punto: sirve para quien
    todavía no pasó por el Timmy—, pero sí exige haber entrado con su
    cuenta, que es lo único que dice QUIÉN está marcando.
    """
    pid, err = _yo()
    if err:
        return err
    ses, err_csrf = _sesion_con_csrf()
    if err_csrf:
        return err_csrf

    persona = db.persona_personal(pid)
    if not persona:
        return _error("Tu cuenta no está vinculada a una ficha de personal. "
                      "Avisa a RRHH: sin ficha no hay a quién atribuir la marca.", 409)

    ident = db.identidad_de("personal", pid)
    if not ident:
        # Sin número de terminal no se puede guardar la marca. Se le crea
        # uno marcado como web; el día que se enrole en el Timmy, el motor
        # de enrolamiento reutiliza este mismo número.
        usados = [r["staff_number"] for r in db.identidades()] \
            if hasattr(db, "identidades") else []
        sn = db.siguiente_staff_number(usados)
        config.validar_rango(sn)
        db.crear_identidad(sn, "personal", pid, "web")
        ident = db.identidad_de("personal", pid)

    # ── Una entrada y una salida al día, y nada más ──────────────────────
    # La primera marca del día es la entrada y la segunda la salida. Una
    # tercera dejaría el día sin lectura única: ¿cuál de las tres cuenta?
    # Se corta AQUÍ y no solo en la pantalla, porque la pantalla se puede
    # saltar. Corregir un día ya cerrado es cosa de RRHH, no de un botón.
    hoy = datetime.date.today().isoformat()
    del_dia = db.consultar(
        """SELECT hora FROM marcas WHERE staff_number = ? AND fecha = ?
            ORDER BY hora""", (ident["staff_number"], hoy))
    if len(del_dia) >= 2:
        return jsonify({
            "ok": False, "motivo": "completo",
            "entrada": del_dia[0]["hora"], "salida": del_dia[-1]["hora"],
            "error": f"Hoy ya marcaste entrada ({del_dia[0]['hora']}) y "
                     f"salida ({del_dia[-1]['hora']}). Solo se marca una vez "
                     f"cada una; si hay algo que corregir, lo hace RRHH.",
        }), 409

    cuerpo = request.get_json(silent=True) or {}

    # ── La ubicación ─────────────────────────────────────────────────────
    lat = lon = precision = None
    try:
        lat = float(cuerpo.get("lat"))
        lon = float(cuerpo.get("lon"))
        precision = float(cuerpo.get("precision") or 0) or None
    except (TypeError, ValueError):
        lat = lon = None

    # No se mide ninguna distancia.
    #
    # Hubo un rato un punto de sede, un radio y un cálculo de metros: primero
    # para rechazar a quien marcara lejos —retirado— y después para señalarlo
    # en la lista. Las dos cosas se fueron el 31/08/2026 por decisión de la
    # ONG: la ubicación de una marca no tiene que ver con la de la casa. Lo
    # que hay que ver es DÓNDE estaba la persona, y eso lo dice el nombre del
    # sitio, no una cifra en metros.

    # ── El rostro ────────────────────────────────────────────────────────
    # Aquí es donde la marca deja de ser «alguien con esta cuenta apretó un
    # botón» y pasa a ser «alguien con esta cara apretó un botón». El
    # descriptor lo calcula el navegador con el modelo que sirve este mismo
    # servidor; la COMPARACIÓN se hace aquí, porque si la decidiera el
    # navegador bastaría con mandar {"coincide": true} desde la consola.
    guardado = db.rostro_web(pid)
    if not guardado:
        return jsonify({
            "ok": False, "motivo": "sin_rostro",
            "error": "Todavía no registraste tu rostro de referencia. "
                     "Regístralo una vez y después podrás marcar.",
        }), 409

    vector, problema = _validar_descriptor(cuerpo)
    if problema:
        return jsonify({"ok": False, "motivo": "sin_descriptor",
                        "error": problema}), 400

    referencia = json.loads(guardado["descriptor"])
    if len(referencia) != len(vector):
        return jsonify({
            "ok": False, "motivo": "modelo_distinto",
            "error": "Tu rostro de referencia se generó con otro modelo. "
                     "Hay que volver a registrarlo.",
        }), 409

    dist = _distancia(referencia, vector)
    if dist > config.ROSTRO_WEB_UMBRAL:
        log.info("marca rechazada para personal %s: distancia %.3f", pid, dist)
        return jsonify({
            "ok": False, "motivo": "no_coincide", "distancia": round(dist, 4),
            "error": "No pudimos confirmar que eres tú. Ponte de frente, con "
                     "luz, sin gorra ni mascarilla, y vuelve a intentarlo. "
                     "Si sigue sin reconocerte, marca en el terminal.",
        }), 401

    # ── La foto ──────────────────────────────────────────────────────────
    # Pasa por el mismo camino que las de ficha: se reduce y se le quitan
    # los metadatos, incluida la ubicación que trae la cámara. La ubicación
    # que vale es la que declara el navegador, no la escondida en el archivo.
    nombre_foto = None
    dato = cuerpo.get("foto") or ""
    if dato.startswith("data:image/"):
        try:
            import base64
            crudo = base64.b64decode(dato.split(",", 1)[1], validate=True)
            os.makedirs(config.MARCAS_DIR, exist_ok=True)
            meta = fotos.aceptar(crudo, "marca.jpg",
                                 carpeta=config.MARCAS_DIR)
            nombre_foto = meta.get("foto")
        except Exception as e:
            log.warning("no se pudo guardar la foto de la marca: %s", e)

    ahora = datetime.datetime.now()
    hoy = ahora.date().isoformat()
    hora = ahora.strftime("%H:%M")
    # metodo='facial' y canal='web': el CÓMO se identificó y el POR DÓNDE
    # marcó son dos cosas distintas. Antes ponía 'web' en las dos, de cuando
    # la marca por celular era solo una foto; desde que compara el rostro,
    # decir 'web' en el método escondía que hubo reconocimiento facial.
    # El NOMBRE del sitio, resuelto una sola vez, aquí. No al pintar la
    # pantalla: si se hiciera al mirar, abrir el Registro de Asistencia
    # mandaría a un servicio de fuera la ubicación de todo el equipo cada
    # vez que alguien entra. Si no se puede saber, la marca entra igual.
    lugar = lugares.nombre_de(lat, lon)

    puesta = db.guardar_marca(ident["staff_number"], hoy, hora, "facial", "web",
                              foto=nombre_foto, lat=lat, lon=lon,
                              precision_m=precision,
                              lugar=lugar)
    if not puesta:
        # INSERT OR IGNORE: ya había una marca en ese mismo minuto.
        return jsonify({"ok": True, "repetida": True, "hora": hora,
                        "aviso": "Ya habías marcado en este minuto."})

    log.info("marca web de %s (%s) a las %s desde %s · rostro %.3f",
             persona.get("nombre"), ident["staff_number"], hora,
             request.headers.get("X-Forwarded-For") or request.remote_addr,
             dist)
    return jsonify({"ok": True, "hora": hora, "fecha": hoy,
                    # El nombre del sitio: es lo único que se dice de la
                    # ubicación. Ni distancia ni radio, que se retiraron
                    # el 31/08/2026 con el resto del cerco.
                    "lugar": lugar,
                    "conFoto": bool(nombre_foto)})


# ══════════════════════════════════════════════════════════════════════════
#  Aquí vivía POST /api/asistencia/web: una SEGUNDA puerta para marcar con
#  rostro, de cuando el reconocimiento estaba a medias. Ninguna pantalla la
#  usaba desde que /api/asistencia/marcar hace lo mismo —y mejor: exige
#  también la foto, la ubicación y el tope de dos marcas al día—.
#
#  Se retiró el 30/08/2026. Dos entradas a la misma tabla con reglas
#  distintas son una invitación a que una de las dos se quede atrás; ya
#  había pasado con el tope de marcas, que hubo que añadir dos veces.
# ══════════════════════════════════════════════════════════════════════════

# ══════════════════════════════════════════════════════════════════════════
#  RESPONSABLES / TUTORES
#
#  Entidad propia: el responsable de un niño casi nunca trabaja en la ONG.
#  Se registra una vez y se vincula a los beneficiarios que corresponda.
# ══════════════════════════════════════════════════════════════════════════

@app.get("/api/responsables")
@auth.requiere("responsables", "vista")
def listar_responsables():
    return jsonify({
        "ok": True,
        "responsables": db.responsables(
            incluir_inactivos=request.args.get("todos") == "1",
            texto=(request.args.get("q") or "").strip()),
    })


@app.get("/api/responsables/<int:id_>")
@auth.requiere("responsables", "vista")
def ver_responsable(id_):
    r = db.responsable(id_)
    if not r:
        return _error(f"No existe el responsable {id_}", 404)
    return jsonify({"ok": True, "responsable": r,
                    "beneficiarios": db.beneficiarios_de(id_)})


@app.post("/api/responsables")
@auth.requiere("responsables", "edicion")
def crear_responsable_():
    cuerpo = request.get_json(silent=True) or {}
    nombre = str(cuerpo.get("nombre") or "").strip()
    if not nombre:
        return _error("El nombre es obligatorio", 400)
    datos = {c: cuerpo[c] for c in db.CAMPOS_RESPONSABLE if c in cuerpo}
    datos["nombre"] = nombre
    # El origen lo fija el servidor: 'manual' aquí siempre. La migración usa
    # su propia ruta y marca 'migrado', que es lo que permite distinguir
    # después qué fichas hay que revisar a mano.
    datos["origen"] = "manual"
    datos.pop("origen_personal_id", None)
    rid = db.crear_responsable(datos)
    return jsonify({"ok": True, "id": rid, "responsable": db.responsable(rid)})


@app.put("/api/responsables/<int:id_>")
@auth.requiere("responsables", "edicion")
def editar_responsable_(id_):
    if not db.responsable(id_):
        return _error(f"No existe el responsable {id_}", 404)
    cuerpo = request.get_json(silent=True) or {}
    if "nombre" in cuerpo and not str(cuerpo["nombre"]).strip():
        return _error("El nombre no puede quedar vacío", 400)
    datos = {c: cuerpo[c] for c in db.CAMPOS_RESPONSABLE if c in cuerpo}
    datos.pop("origen", None)
    datos.pop("origen_personal_id", None)
    if not datos:
        return _error("No llegó ningún cambio", 400)
    db.editar_responsable(id_, datos)
    return jsonify({"ok": True, "responsable": db.responsable(id_)})


@app.delete("/api/responsables/<int:id_>")
@auth.requiere("responsables", "edicion")
def borrar_responsable_(id_):
    r = db.responsable(id_)
    if not r:
        return _error(f"No existe el responsable {id_}", 404)
    vinculos = db.beneficiarios_de(id_)
    db.borrar_responsable(id_)
    log.info(f"responsable '{r['nombre']}' eliminado ({len(vinculos)} vínculo(s))")
    return jsonify({"ok": True, "vinculos_retirados": len(vinculos)})


# ── El vínculo ────────────────────────────────────────────────────────────

@app.get("/api/beneficiarios/<int:id_>/responsables")
@auth.requiere("beneficiarios", "vista")
def responsables_del_beneficiario(id_):
    if not db.beneficiario(id_):
        return _error(f"No existe el beneficiario {id_}", 404)
    return jsonify({"ok": True, "responsables": db.responsables_de(id_)})


@app.post("/api/beneficiarios/<int:id_>/responsables")
@auth.requiere("beneficiarios", "edicion")
def vincular_responsable(id_):
    """
    Vincula un responsable que YA existe. No se crea aquí una ficha nueva a
    partir de un nombre suelto: sería la puerta de entrada a tener tres
    'Rosa Huamán' distintas, que es justo lo que la entidad propia evita.
    """
    if not db.beneficiario(id_):
        return _error(f"No existe el beneficiario {id_}", 404)
    cuerpo = request.get_json(silent=True) or {}
    try:
        rid = int(cuerpo.get("responsable_id") or 0)
    except (TypeError, ValueError):
        return _error("Falta el responsable", 400)
    if not db.responsable(rid):
        return _error("Ese responsable no existe. Regístralo primero en "
                      "Responsables / Tutores", 400)

    datos = {c: cuerpo[c] for c in db.CAMPOS_VINCULO if c in cuerpo}
    for bandera in ("es_principal", "es_legal", "puede_recoger", "es_emergencia"):
        if bandera in datos:
            datos[bandera] = 1 if datos[bandera] else 0

    # Un solo responsable principal por beneficiario: si se marca uno nuevo,
    # el anterior deja de serlo. Dos "principales" no significan nada.
    if datos.get("es_principal"):
        for otro in db.responsables_de(id_):
            if otro["responsable_id"] != rid and otro["es_principal"]:
                db.vincular(otro["responsable_id"], id_, {"es_principal": 0})

    db.vincular(rid, id_, datos)
    return jsonify({"ok": True, "responsables": db.responsables_de(id_)})


@app.delete("/api/beneficiarios/<int:id_>/responsables/<int:rid>")
@auth.requiere("beneficiarios", "edicion")
def desvincular_responsable(id_, rid):
    db.desvincular(rid, id_)
    return jsonify({"ok": True, "responsables": db.responsables_de(id_)})


@app.get("/api/identidades")
@auth.requiere("asistencia", "vista")
def listar_identidades():
    """Quiénes están enrolados en el terminal, sean personal o beneficiarios."""
    return jsonify({"ok": True, "identidades": db.identidades()})


@app.get("/api/candidatos")
@auth.requiere("asistencia", "vista")
def listar_candidatos():
    """
    Personas que aún no tienen identidad biométrica. Alimenta el selector de
    "Agregar registro", que ahora ELIGE en vez de crear.
    """
    return jsonify({"ok": True, "candidatos": db.sin_enrolar()})


@app.delete("/api/identidades/<int:staff_number>")
@auth.requiere("asistencia", "edicion")
def desenrolar_(staff_number):
    """
    Quita la identidad del dispositivo físico, de yunatt y de la base local.
    La ficha de la persona se conserva.

    Destructivo y sobre recursos COMPARTIDOS con el ERP anterior: la
    interfaz pide confirmación explícita antes de llamar aquí.
    """
    try:
        return jsonify({"ok": True, **personas.desenrolar(staff_number)})
    except KeyError as e:
        return _error(e.args[0] if e.args else e, 404)
    except config.RangoReservadoError as e:
        return _error(e, 409)
    except YunattError as e:
        return _error(e, 502)
    except Exception as e:
        log.exception("fallo al desenrolar")
        return _error(e, 500)


@app.post("/api/enrolamiento")
@auth.requiere("asistencia", "edicion")
def crear_enrolamiento():
    """
    Arranca la captura: reserva el staffNumber, da de alta en yunatt y pone
    el dispositivo en modo registro.

    Body: {tipo: personal|beneficiario, titular_id, metodo: facial|huella|ambos}
    """
    cuerpo = request.get_json(silent=True) or {}
    try:
        resumen = enrolamiento.iniciar(
            cuerpo.get("tipo"),
            cuerpo.get("titular_id"),
            cuerpo.get("metodo"),
        )
        return jsonify({"ok": True, **resumen})
    except KeyError as e:
        return _error(e.args[0] if e.args else e, 404)
    except ValueError as e:
        return _error(e, 400)
    except config.RangoReservadoError as e:
        return _error(e, 409)
    except YunattError as e:
        return _error(e, 502)
    except Exception as e:
        log.exception("fallo al iniciar el enrolamiento")
        return _error(e, 500)


@app.get("/api/enrolamiento/<int:staff_number>/estado")
@auth.requiere("asistencia", "vista")
def estado_enrolamiento(staff_number):
    try:
        return jsonify({"ok": True, **enrolamiento.estado(staff_number)})
    except KeyError as e:
        # str(KeyError) añade comillas al mensaje; el usuario ve el texto plano
        return _error(e.args[0] if e.args else e, 404)
    except Exception as e:
        log.exception("fallo al consultar el estado del enrolamiento")
        return _error(e, 500)


@app.post("/api/enrolamiento/<int:staff_number>/reintentar")
@auth.requiere("asistencia", "edicion")
def reintentar_enrolamiento(staff_number):
    try:
        return jsonify({"ok": True, **enrolamiento.reintentar(staff_number)})
    except KeyError as e:
        # str(KeyError) añade comillas al mensaje; el usuario ve el texto plano
        return _error(e.args[0] if e.args else e, 404)
    except YunattError as e:
        return _error(e, 502)
    except Exception as e:
        log.exception("fallo al reintentar el enrolamiento")
        return _error(e, 500)


@app.post("/api/enrolamiento/<int:staff_number>/cancelar")
@auth.requiere("asistencia", "edicion")
def cancelar_enrolamiento(staff_number):
    try:
        return jsonify(enrolamiento.cancelar(staff_number))
    except Exception as e:
        return _error(e, 500)


@app.get("/api/asistencia")
@auth.requiere("asistencia", "vista")
def asistencia():
    fecha = request.args.get("fecha") or date.today().isoformat()
    return jsonify({"ok": True, "fecha": fecha, "filas": db.marcas_de(fecha)})


@app.get("/api/asistencia/resumen")
@auth.requiere("asistencia", "vista")
def resumen_asistencia():
    """
    Los números del panel de Asistencia, de una sola llamada.

    'esperados' son las personas enroladas en el terminal: son las únicas de
    las que puede haber marca. Alguien con ficha pero sin enrolar no está
    ausente — es que todavía no puede marcar, y por eso se cuenta aparte.

    No se calcula 'tardanzas': haría falta el horario de cada persona, que
    hoy no se guarda en ninguna parte. Se omite en vez de inventarlo.
    """
    fecha = request.args.get("fecha") or date.today().isoformat()
    filas = db.marcas_de(fecha)

    presentes = [f for f in filas if f.get("entrada")]
    completas = [f for f in filas if f.get("salida")]
    sin_marcar = [f for f in filas if not f.get("entrada")]
    candidatos = db.sin_enrolar()

    permisos_hoy = [
        s for s in db.solicitudes(estado="aprobada")
        if s["desde"] <= fecha <= s["hasta"]
    ]
    por_resolver = db.resumen_solicitudes().get("por_resolver", 0)

    return jsonify({
        "ok": True,
        "fecha": fecha,
        "esperados": len(filas),
        "presentes": len(presentes),
        "jornada_cerrada": len(completas),
        "sin_marcar": len(sin_marcar),
        # Quien tiene ficha y todavía no puede marcar. No es una ausencia.
        "sin_enrolar": len(candidatos),
        "con_permiso": len(permisos_hoy),
        "permisos_por_resolver": por_resolver,
    })


@app.get("/api/asistencia/rango")
@auth.requiere("asistencia", "vista")
def asistencia_rango():
    """
    Marcas entre dos fechas, por persona y día. Lo consumen la vista semanal
    y el calendario mensual, que necesitan varios días de una sola consulta.
    """
    desde = request.args.get("desde")
    hasta = request.args.get("hasta")
    if not desde or not hasta:
        return _error("Faltan los parámetros 'desde' y 'hasta' (AAAA-MM-DD)", 400)
    if desde > hasta:
        return _error("'desde' no puede ser posterior a 'hasta'", 400)
    return jsonify(
        {"ok": True, "desde": desde, "hasta": hasta, "personas": db.marcas_rango(desde, hasta)}
    )


@app.get("/api/novedades")
@auth.requiere("asistencia", "vista")
def novedades():
    """
    Un par de números que cambian cuando cambia algo. Nada más.

    Es lo que sondean las pantallas para saber si tienen que recargarse.
    Tiene que ser BARATO: se pide cada pocos segundos y por cada persona
    que tenga el sistema abierto. Dos MAX() sobre índices primarios no
    tocan disco de forma apreciable.

    No devuelve datos, solo señales: quien vea que cambiaron pide entonces
    lo que necesite. Así una pantalla abierta y quieta no cuesta casi nada.
    """
    fila = db.consultar(
        """SELECT (SELECT COALESCE(MAX(id), 0) FROM marcas)          AS marcas,
                  (SELECT COUNT(*) FROM identidades)                 AS identidades,
                  (SELECT COALESCE(MAX(estado), '') FROM identidades) AS estados"""
    )[0]
    return jsonify({"ok": True,
                    "marcas": fila["marcas"],
                    "identidades": fila["identidades"],
                    # El estado biométrico cambia sin que cambien los
                    # conteos: alguien que pasa de «esperando» a
                    # «enrolado» no añade filas, y hay que enterarse.
                    "sello": f"{fila['marcas']}·{fila['identidades']}·{fila['estados']}"})


@app.post("/api/asistencia/sync")
@auth.requiere("asistencia", "edicion")
def sincronizar():
    try:
        return jsonify(enrolamiento.sincronizar_marcas())
    except YunattError as e:
        return _error(e, 502)
    except Exception as e:
        log.exception("fallo al sincronizar marcas")
        return _error(e, 500)


# ══════════════════════════════════════════════════════════════════════════

def main():
    db.iniciar()
    # Los tokens que quedaran en claro pasan a huella. Nadie se queda fuera.
    pasados = auth.migrar_tokens()
    if pasados:
        log.info("sesiones migradas a huella: %s", pasados)

    # Trae las marcas del terminal solo, cada pocos segundos. Va aquí y no
    # al importar el módulo a propósito: las suites de prueba importan
    # `app` muchas veces, y no deben abrir hilos hablando con yunatt de
    # verdad. Ver backend/sincronizador.py.
    import sincronizador
    sincronizador.arrancar()

    ok, faltan = config.configurado()
    url = f"http://127.0.0.1:{config.PUERTO}/"

    print()
    print("  Módulo RRHH — Lost Children Perú")
    print("  " + "-" * 58)
    print(f"  Interfaz         {url}")
    print(f"  Rango reservado  staffNumber >= {config.STAFF_NUMBER_BASE}"
          f"{'  (estricto)' if config.RANGO_ESTRICTO else '  (SIN restricción)'}")
    print(f"  Departamento     {config.DEPT_NAME or '(sin definir)'}")
    import sondeo_formulario
    print(f"  Formulario       {sondeo_formulario.arrancar()}")
    if ok:
        print("  Yunatt           credenciales cargadas")
    else:
        print("  Yunatt           SIN CONFIGURAR — falta: " + ", ".join(faltan))
        print("                   copia backend/.env.example a backend/.env")
    print("  " + "-" * 58)
    print()

    if os.environ.get("WERKZEUG_RUN_MAIN") != "true":
        try:
            webbrowser.open(url)
        except Exception:
            pass

    app.run(host="127.0.0.1", port=config.PUERTO, debug=False, threaded=True)


# ══════════════════════════════════════════════════════════════════════════
#  USUARIOS, ROLES Y PERMISOS
# ══════════════════════════════════════════════════════════════════════════

def _es_director(rol_id):
    r = db.rol(rol_id)
    return bool(r) and r["clave"] == config.ROL_DIRECTOR


def _puede_tocar_director(rol_id_destino):
    """
    Solo un Director puede crear o modificar a otro Director. RRHH gestiona
    todo lo demás pero no puede otorgar ese rol —ni a nadie ni a sí
    mismo—, o el límite no serviría de nada.
    """
    if not _es_director(rol_id_destino):
        return None
    ses = auth.sesion_actual()
    if ses is None and not config.LOGIN_ESTRICTO:
        return None
    if not ses or ses.get("rol") != config.ROL_DIRECTOR:
        return jsonify({"ok": False, "motivo": "solo_director",
                        "error": "Solo un Director puede otorgar el rol Director"}), 403
    return None


@app.get("/api/usuarios")
@auth.requiere("usuarios", "vista")
def listar_usuarios():
    return jsonify({
        "ok": True,
        "usuarios": db.usuarios(),
        "roles": db.roles(),
        "sin_usuario": db.personal_sin_usuario(),
        "modulos": [{"clave": c, "nombre": n, "grupo": g} for c, n, g in config.MODULOS],
        "niveles": list(config.NIVELES),
    })


@app.post("/api/usuarios")
@auth.requiere("usuarios", "edicion")
def crear_usuario_():
    cuerpo = request.get_json(silent=True) or {}
    try:
        personal_id = int(cuerpo.get("personal_id") or 0)
        rol_id = int(cuerpo.get("rol_id") or 0)
    except (TypeError, ValueError):
        return _error("Falta la persona o el rol", 400)

    persona = db.persona_personal(personal_id)
    if not persona:
        return _error("Esa persona no existe", 400)
    if any(u["personal_id"] == personal_id for u in db.usuarios()):
        return _error(f"{persona['nombre']} ya tiene una cuenta", 400)
    if not db.rol(rol_id):
        return _error("Ese rol no existe", 400)

    negado = _puede_tocar_director(rol_id)
    if negado:
        return negado

    nombre = str(cuerpo.get("usuario") or "").strip().lower()
    if not nombre:
        nombre = auth.sugerir_usuario(persona["nombre"],
                                      [u["usuario"] for u in db.usuarios()])
    if db.usuario_por_nombre(nombre):
        return _error(f"El usuario «{nombre}» ya existe", 400)

    try:
        clave_hash = auth.hashear(str(cuerpo.get("clave") or ""))
    except ValueError as e:
        return _error(e, 400)

    uid = db.crear_usuario(personal_id, nombre, clave_hash, rol_id, debe_cambiar=1)
    log.info(f"usuario '{nombre}' creado para {persona['nombre']}")
    return jsonify({"ok": True, "id": uid, "usuario": nombre,
                    "usuarios": db.usuarios()})


@app.put("/api/usuarios/<int:id_>")
@auth.requiere("usuarios", "edicion")
def editar_usuario_(id_):
    u = db.usuario(id_)
    if not u:
        return _error(f"No existe el usuario {id_}", 404)
    cuerpo = request.get_json(silent=True) or {}
    campos = {}

    if "rol_id" in cuerpo:
        try:
            rol_id = int(cuerpo["rol_id"])
        except (TypeError, ValueError):
            return _error("Rol no válido", 400)
        if not db.rol(rol_id):
            return _error("Ese rol no existe", 400)
        # Hay que ser Director tanto para otorgar el rol como para
        # quitárselo a quien ya lo tiene.
        for destino in (rol_id, u["rol_id"]):
            negado = _puede_tocar_director(destino)
            if negado:
                return negado
        if u["rol"] == config.ROL_DIRECTOR and not _es_director(rol_id) \
                and db.directores_activos(excluir_id=id_) == 0:
            return _error("Es el único Director activo: el sistema quedaría "
                          "sin nadie que pueda administrarlo", 400)
        campos["rol_id"] = rol_id

    if "estado" in cuerpo:
        estado = str(cuerpo["estado"])
        if estado not in ("activo", "suspendido"):
            return _error("Estado no reconocido", 400)
        if estado == "suspendido" and u["rol"] == config.ROL_DIRECTOR \
                and db.directores_activos(excluir_id=id_) == 0:
            return _error("Es el único Director activo: no se puede suspender", 400)
        campos["estado"] = estado

    if cuerpo.get("clave"):
        negado = _puede_tocar_director(u["rol_id"])
        if negado:
            return negado
        try:
            campos["clave_hash"] = auth.hashear(str(cuerpo["clave"]))
        except ValueError as e:
            return _error(e, 400)
        campos["debe_cambiar"] = 1

    if not campos:
        return _error("No llegó ningún cambio", 400)

    db.actualizar_usuario(id_, campos)
    # Cambiar rol, clave o estado invalida lo que esté abierto: la sesión
    # lleva los permisos ya resueltos y seguiría con los de antes.
    auth.cerrar_sesiones_de(id_)
    return jsonify({"ok": True, "usuarios": db.usuarios()})


@app.delete("/api/usuarios/<int:id_>")
@auth.requiere("usuarios", "edicion")
def borrar_usuario_(id_):
    u = db.usuario(id_)
    if not u:
        return _error(f"No existe el usuario {id_}", 404)
    negado = _puede_tocar_director(u["rol_id"])
    if negado:
        return negado
    if u["rol"] == config.ROL_DIRECTOR and db.directores_activos(excluir_id=id_) == 0:
        return _error("Es el único Director activo: el sistema quedaría sin "
                      "nadie que pueda administrarlo", 400)
    auth.cerrar_sesiones_de(id_)
    db.borrar_usuario(id_)
    log.info(f"usuario '{u['usuario']}' eliminado")
    return jsonify({"ok": True, "usuarios": db.usuarios()})


@app.post("/api/roles")
@auth.requiere("usuarios", "edicion")
def crear_rol_():
    """
    Alta de un cargo reutilizable. Si ya existe uno con la misma clave
    normalizada se devuelve ese en vez de crear un duplicado: es lo que
    impide que «Teen Leader» y «teen leader» acaben siendo dos cargos.
    """
    cuerpo = request.get_json(silent=True) or {}
    nombre = str(cuerpo.get("nombre") or "").strip()
    if not nombre:
        return _error("El nombre del cargo es obligatorio", 400)
    clave = auth.normalizar_clave_rol(nombre)

    existente = db.rol_por_clave(clave)
    if existente:
        return jsonify({"ok": True, "id": existente["id"], "ya_existia": True,
                        "roles": db.roles()})

    rid = db.crear_rol(nombre, clave, str(cuerpo.get("descripcion") or ""))
    permisos = cuerpo.get("permisos") or {}
    limpios = {m: n for m, n in permisos.items()
               if m in config.CLAVES_MODULO and n in config.NIVELES}
    if limpios:
        db.guardar_permisos_rol(rid, limpios)
    return jsonify({"ok": True, "id": rid, "ya_existia": False, "roles": db.roles()})


@app.get("/api/roles/<int:id_>/permisos")
@auth.requiere("usuarios", "vista")
def permisos_de_rol_(id_):
    r = db.rol(id_)
    if not r:
        return _error(f"No existe el rol {id_}", 404)
    mapa = {m: "ninguno" for m in config.CLAVES_MODULO}
    mapa.update(db.permisos_rol(id_))
    return jsonify({"ok": True, "rol": r, "permisos": mapa})


@app.put("/api/roles/<int:id_>/permisos")
@auth.requiere("usuarios", "edicion")
def guardar_permisos_rol_(id_):
    r = db.rol(id_)
    if not r:
        return _error(f"No existe el rol {id_}", 404)
    if r["clave"] == config.ROL_DIRECTOR:
        return _error("El rol Director tiene acceso total por definición y no "
                      "se puede recortar: dejaría al sistema sin quien lo arregle",
                      400)

    cuerpo = request.get_json(silent=True) or {}
    permisos = cuerpo.get("permisos") or {}
    limpios = {}
    for m, n in permisos.items():
        if m not in config.CLAVES_MODULO:
            return _error(f"Módulo desconocido: {m}", 400)
        if n not in config.NIVELES:
            return _error(f"Nivel desconocido: {n}", 400)
        limpios[m] = n
    db.guardar_permisos_rol(id_, limpios)
    # Los permisos viajan dentro de la sesión ya resuelta: hay que cerrarlas
    # o seguirían con los de antes hasta caducar.
    for u in db.usuarios():
        if u["rol_id"] == id_:
            auth.cerrar_sesiones_de(u["id"])
    return jsonify({"ok": True, "permisos": limpios})


@app.delete("/api/roles/<int:id_>")
@auth.requiere("usuarios", "edicion")
def borrar_rol_(id_):
    r = db.rol(id_)
    if not r:
        return _error(f"No existe el rol {id_}", 404)
    if r["es_sistema"]:
        return _error(f"«{r['nombre']}» es un rol del sistema y no se puede borrar",
                      400)
    usando = [u for u in db.usuarios() if u["rol_id"] == id_]
    if usando:
        return _error(f"{len(usando)} usuario(s) tienen este cargo. Cámbiaselo "
                      f"antes de borrarlo", 400)
    db.borrar_rol(id_)
    return jsonify({"ok": True, "roles": db.roles()})


@app.get("/api/accesos")
@auth.requiere("usuarios", "vista")
def listar_accesos():
    """Registro de quién tocó qué. Con identidad ya se puede auditar."""
    try:
        limite = min(int(request.args.get("limite") or 200), 1000)
    except (TypeError, ValueError):
        limite = 200
    return jsonify({"ok": True,
                    "accesos": db.accesos(limite=limite,
                                          modulo=request.args.get("modulo"))})


if __name__ == "__main__":
    main()
