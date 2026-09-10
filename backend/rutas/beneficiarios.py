# -*- coding: utf-8 -*-
"""
rutas/beneficiarios.py — Los niños acogidos: ficha, seguimiento, sesiones e incidencias.

25 rutas. Cada una valida, comprueba permisos y delega:
la lógica vive en los módulos de negocio, no aquí.
"""
import datetime
from flask import jsonify, request, send_file
import fotos
import auth
import config
import db
import personas
import construir_interfaz
from flask import Blueprint
from .apoyo import (_acompanamiento, _beneficiarios_completos, _de_quien_es, _error, _fecha_registrable, _persona_opcional, _validar_beneficiario, log)

bp = Blueprint("beneficiarios", __name__)

@bp.get("/api/beneficiarios/<int:id_>/foto")
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

@bp.get("/api/beneficiarios")
@auth.requiere("beneficiarios", "vista")
def listar_beneficiarios():
    """
    Cada ficha viene con 'faltantes': qué campos le quedan por llenar. El
    alta solo exige el nombre, así que la interfaz necesita poder decir
    qué falta sin bloquear a nadie.
    """
    return jsonify({"ok": True, "beneficiarios": _beneficiarios_completos()})

@bp.post("/api/beneficiarios")
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

@bp.put("/api/beneficiarios/<int:id_>")
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

@bp.get("/api/beneficiarios/<int:id_>/acompanamiento")
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

@bp.post("/api/beneficiarios/<int:id_>/sesiones")
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

@bp.put("/api/sesiones/<int:id_>")
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

@bp.delete("/api/sesiones/<int:id_>")
@auth.requiere("sesiones", "edicion")
def borrar_sesion_(id_):
    bid, err = _de_quien_es("sesion", id_)
    if err:
        return err
    db.borrar_sesion(id_)
    return _acompanamiento(bid)

@bp.post("/api/beneficiarios/<int:id_>/incidencias")
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

@bp.put("/api/incidencias/<int:id_>")
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

@bp.delete("/api/incidencias/<int:id_>")
@auth.requiere("incidencias", "edicion")
def borrar_incidencia_(id_):
    bid, err = _de_quien_es("incidencia", id_)
    if err:
        return err
    db.borrar_incidencia(id_)
    return _acompanamiento(bid)

@bp.delete("/api/beneficiarios/<int:id_>")
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

@bp.get("/api/beneficiarios/<int:id_>/series")
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

@bp.post("/api/beneficiarios/<int:id_>/programas")
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

@bp.put("/api/programas/<int:id_>")
@auth.requiere("beneficiarios", "edicion")
def editar_programa_(id_):
    cuerpo = request.get_json(silent=True) or {}
    datos = {c: cuerpo[c] for c in db.CAMPOS_PROGRAMA if c in cuerpo}
    if not datos:
        return _error("No llegó ningún cambio", 400)
    db.editar_programa(id_, datos)
    return jsonify({"ok": True})

@bp.delete("/api/programas/<int:id_>")
@auth.requiere("beneficiarios", "edicion")
def borrar_programa_(id_):
    db.borrar_programa(id_)
    return jsonify({"ok": True})

# ── Historial educativo ───────────────────────────────────────────────────

@bp.post("/api/beneficiarios/<int:id_>/historial")
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

@bp.put("/api/historial/<int:id_>")
@auth.requiere("beneficiarios", "edicion")
def editar_historial_(id_):
    cuerpo = request.get_json(silent=True) or {}
    datos = {c: cuerpo[c] for c in db.CAMPOS_HISTORIAL if c in cuerpo}
    if not datos:
        return _error("No llegó ningún cambio", 400)
    db.editar_historial(id_, datos)
    return jsonify({"ok": True})

@bp.delete("/api/historial/<int:id_>")
@auth.requiere("beneficiarios", "edicion")
def borrar_historial_(id_):
    db.borrar_historial(id_)
    return jsonify({"ok": True})

# ── Seguimiento social ────────────────────────────────────────────────────

@bp.post("/api/beneficiarios/<int:id_>/seguimiento")
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

@bp.put("/api/seguimiento/<int:id_>")
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

@bp.delete("/api/seguimiento/<int:id_>")
@auth.requiere("beneficiarios", "edicion")
def borrar_seguimiento_(id_):
    db.borrar_seguimiento(id_)
    return jsonify({"ok": True})

# ── El vínculo ────────────────────────────────────────────────────────────

@bp.get("/api/beneficiarios/<int:id_>/responsables")
@auth.requiere("beneficiarios", "vista")
def responsables_del_beneficiario(id_):
    if not db.beneficiario(id_):
        return _error(f"No existe el beneficiario {id_}", 404)
    return jsonify({"ok": True, "responsables": db.responsables_de(id_)})

@bp.post("/api/beneficiarios/<int:id_>/responsables")
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

@bp.delete("/api/beneficiarios/<int:id_>/responsables/<int:rid>")
@auth.requiere("beneficiarios", "edicion")
def desvincular_responsable(id_, rid):
    db.desvincular(rid, id_)
    return jsonify({"ok": True, "responsables": db.responsables_de(id_)})

