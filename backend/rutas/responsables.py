# -*- coding: utf-8 -*-
"""
rutas/responsables.py — Tutores y familiares, y el formulario por el que llegan sus datos.

15 rutas. Cada una valida, comprueba permisos y delega:
la lógica vive en los módulos de negocio, no aquí.
"""
import datetime
from flask import jsonify, request, send_file
import fotos
import formulario as form
import auth
import config
import db
import construir_interfaz
from flask import Blueprint
from .apoyo import (_error, _ip, _yo, log)

bp = Blueprint("responsables", __name__)

# ── Las respuestas del formulario ─────────────────────────────────────
# Traer NO es ingresar. Esto deja las respuestas en la bandeja; llevarlas
# a una ficha es otra decisión, de una persona, y otro endpoint.

@bp.get("/api/formulario/respuestas")
@auth.requiere("responsables", "vista")
def bandeja_formulario():
    import sondeo_formulario
    return jsonify({"ok": True,
                    "respuestas": form.bandeja(request.args.get("estado") or None),
                    "hay_credencial": config.credencial_lista(),
                    # Para que la pantalla pueda decir si el sondeo está vivo
                    # y cuándo miró por última vez.
                    "sondeo": dict(sondeo_formulario.ultimo)})

@bp.post("/api/formulario/traer")
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

@bp.post("/api/formulario/respuestas/<int:id_>/ingresar")
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

@bp.post("/api/formulario/respuestas/<int:id_>/descartar")
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

@bp.get("/api/responsables/<int:id_>/foto")
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

@bp.post("/api/responsables/<int:id_>/foto")
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

@bp.delete("/api/responsables/<int:id_>/foto")
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

@bp.get("/api/consentimiento/rostro")
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

@bp.post("/api/consentimiento/rostro")
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

@bp.delete("/api/consentimiento/rostro")
def revocar_consentimiento_rostro():
    """Retirar el permiso. Se borra el rostro; la constancia se conserva."""
    pid, err = _yo()
    if err:
        return err
    db.revocar_consentimiento(pid, "rostro_web")
    db.borrar_rostro_web(pid)
    log.info(f"consentimiento de rostro web revocado: personal {pid}")
    return jsonify({"ok": True, "revocado": True})

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

@bp.get("/api/responsables")
@auth.requiere("responsables", "vista")
def listar_responsables():
    return jsonify({
        "ok": True,
        "responsables": db.responsables(
            incluir_inactivos=request.args.get("todos") == "1",
            texto=(request.args.get("q") or "").strip()),
    })

@bp.get("/api/responsables/<int:id_>")
@auth.requiere("responsables", "vista")
def ver_responsable(id_):
    r = db.responsable(id_)
    if not r:
        return _error(f"No existe el responsable {id_}", 404)
    return jsonify({"ok": True, "responsable": r,
                    "beneficiarios": db.beneficiarios_de(id_)})

@bp.post("/api/responsables")
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

@bp.put("/api/responsables/<int:id_>")
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

@bp.delete("/api/responsables/<int:id_>")
@auth.requiere("responsables", "edicion")
def borrar_responsable_(id_):
    r = db.responsable(id_)
    if not r:
        return _error(f"No existe el responsable {id_}", 404)
    vinculos = db.beneficiarios_de(id_)
    db.borrar_responsable(id_)
    log.info(f"responsable '{r['nombre']}' eliminado ({len(vinculos)} vínculo(s))")
    return jsonify({"ok": True, "vinculos_retirados": len(vinculos)})

