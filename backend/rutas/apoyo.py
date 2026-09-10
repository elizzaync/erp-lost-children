# -*- coding: utf-8 -*-
"""
apoyo.py — lo que comparten todas las rutas.

Aquí viven los ayudantes que usaban las 131 rutas cuando vivían en
un solo archivo: la respuesta de error normalizada, quién es el que
pregunta, de quién es una ficha. No hay ninguna ruta en este módulo.

Se separó de app.py el 02/09/2026, al partir las rutas en
blueprints.
"""
import datetime
import logging
import os
from datetime import date
from flask import Flask, jsonify, request
import archivos
import firmas
import formulario as form
import auth
import config
import db
import solicitudes as reglas_permisos
import construir_interfaz

log = logging.getLogger("rrhh")
# De config, no calculada con dirname(): este archivo está en
# backend/rutas/, y contar carpetas hacia arriba se rompe en cuanto
# el módulo cambia de sitio. Pasó al partir app.py en blueprints.
RAIZ = config.RAIZ_PROYECTO
INTERFAZ = "ERP RRHH - Lost Children Peru.dc.html"

# Los pocos archivos que la página puede pedir como hermanos suyos. Es una
# lista blanca a propósito: cualquier otra cosa del disco NO se sirve.
PUBLICABLES = ("support.js", "image-slot.js")
PREFIJOS_PUBLICABLES = ("_ds/", "web/")

# De qué tabla sale cada cosa. Se escribe aquí y no se recibe de fuera: el
# nombre de una tabla no puede venir de una petición.
_TABLA_ACOMP = {
    "sesion": ("sesiones_acompanamiento", "la sesión"),
    "incidencia": ("incidencias", "la incidencia"),
}

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

def _cuerpo_documento():
    """
    Los campos y el adjunto, venga la petición como JSON o como multipart.
    Un solo endpoint para los dos casos evita tener dos rutas que hagan
    casi lo mismo y se desincronicen.
    """
    if request.files:
        return request.form.to_dict(), request.files.get("archivo")
    return (request.get_json(silent=True) or {}), None

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

def _firma_de(personal_id):
    """Los bytes de la firma de una persona, o None si no tiene."""
    if not personal_id:
        return None
    p = db.persona_personal(personal_id)
    return firmas.datos_de(p.get("firma")) if p else None

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

def _distancia(a, b):
    """Distancia euclídea. Sin numpy: son 128 números una vez por marca."""
    return sum((x - y) ** 2 for x, y in zip(a, b)) ** 0.5

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

