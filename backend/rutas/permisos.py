# -*- coding: utf-8 -*-
"""
rutas/permisos.py — Solicitudes de permiso y vacaciones.

10 rutas. Cada una valida, comprueba permisos y delega:
la lógica vive en los módulos de negocio, no aquí.
"""
import datetime
import io
from flask import jsonify, request, send_file
import archivos
import documento_permiso
import auth
import config
import db
import solicitudes as reglas_permisos
import construir_interfaz
from flask import Blueprint
from .apoyo import (_error, _firma_de, _resolver, _sesion_con_csrf, _sol_visible, _yo)

bp = Blueprint("permisos", __name__)

@bp.get("/api/permisos/tipos")
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

@bp.get("/api/permisos")
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

@bp.get("/api/permisos/mios")
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

@bp.post("/api/permisos")
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

@bp.post("/api/permisos/<int:id_>/sustento")
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

@bp.get("/api/permisos/<int:id_>/documento.pdf")
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

@bp.get("/api/permisos/<int:id_>/sustento")
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

@bp.post("/api/permisos/<int:id_>/aprobar")
@auth.requiere("permisos", "edicion")
def aprobar_permiso(id_):
    """
    Aprobar. Si la solicitud es larga y solo pasó por la jefatura, no queda
    aprobada: pasa a esperar el visto bueno de Administración.
    """
    return _resolver(id_, "aprobar")

@bp.post("/api/permisos/<int:id_>/rechazar")
@auth.requiere("permisos", "edicion")
def rechazar_permiso(id_):
    """Rechazar. La nota es el motivo, y se guarda: el trabajador la lee."""
    cuerpo = request.get_json(silent=True) or {}
    if not (cuerpo.get("nota") or "").strip():
        return _error("Escribe el motivo del rechazo: quien la pidió tiene "
                      "derecho a saber por qué.", 400)
    return _resolver(id_, "rechazar")

@bp.post("/api/permisos/<int:id_>/cancelar")
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

