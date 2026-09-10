# -*- coding: utf-8 -*-
"""
rutas/personal.py — Las fichas del equipo y su expediente: documentos, sueldos, formación.

26 rutas. Cada una valida, comprueba permisos y delega:
la lógica vive en los módulos de negocio, no aquí.
"""
import datetime
from datetime import date
from flask import jsonify, request, send_file
import archivos
import firmas
import fotos
import auth
import config
import db
import personas
from yunatt_client import YunattError
import construir_interfaz
from flask import Blueprint
from .apoyo import (_cuerpo_documento, _error, _sin_permiso_doc, _validar_fechas, _yo, log)

bp = Blueprint("personal", __name__)

@bp.get("/api/personal")
@auth.requiere("personal", "vista")
def listar_personal():
    """Hoja de Vida: fichas del personal con su estado biométrico."""
    return jsonify({"ok": True, "personal": db.personal(
        incluir_inactivos=request.args.get("todos") == "1")})

@bp.post("/api/personal")
@auth.requiere("personal", "edicion")
def crear_personal_():
    try:
        return jsonify({"ok": True, **personas.crear_personal(request.get_json(silent=True) or {})})
    except ValueError as e:
        return _error(e, 400)
    except Exception as e:
        log.exception("fallo al crear la ficha")
        return _error(e, 500)

@bp.put("/api/personal/<int:id_>")
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

@bp.delete("/api/personal/<int:id_>")
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

@bp.get("/api/personal/<int:id_>/documentos")
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

@bp.post("/api/personal/<int:id_>/documentos")
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

@bp.get("/api/personal/<int:id_>/foto")
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

@bp.get("/api/documentos/<int:id_>/archivo")
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

@bp.post("/api/documentos/<int:id_>/archivo")
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

@bp.delete("/api/documentos/<int:id_>/archivo")
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

@bp.put("/api/documentos/<int:id_>")
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

@bp.delete("/api/documentos/<int:id_>")
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

@bp.get("/api/personal/<int:id_>/condiciones")
@auth.requiere("condiciones", "vista")
def condiciones_persona(id_):
    if not db.persona_personal(id_):
        return _error(f"No existe la persona {id_}", 404)
    return jsonify({
        "ok": True,
        "vigente": db.condicion_vigente(id_),
        "historial": db.condiciones_de(id_),
    })

@bp.post("/api/personal/<int:id_>/condiciones")
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

@bp.delete("/api/condiciones/<int:id_>")
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

@bp.get("/api/documentos")
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

# ══════════════════════════════════════════════════════════════════════════
#  HOJA DE VIDA: FORMACIÓN Y EXPERIENCIA
#
#  Cuelgan de 'personal', así que el permiso es el mismo: quien puede ver una
#  ficha ve su trayectoria, y quien puede editarla la modifica. No hacía falta
#  un módulo de permisos propio para esto.
# ══════════════════════════════════════════════════════════════════════════

@bp.get("/api/personal/<int:id_>/trayectoria")
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

@bp.post("/api/personal/<int:id_>/formacion")
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

@bp.put("/api/formacion/<int:id_>")
@auth.requiere("personal", "edicion")
def editar_formacion_(id_):
    cuerpo = request.get_json(silent=True) or {}
    datos = {c: cuerpo[c] for c in db.CAMPOS_FORMACION if c in cuerpo}
    if not datos:
        return _error("No llegó ningún cambio", 400)
    db.editar_formacion(id_, datos)
    return jsonify({"ok": True})

@bp.delete("/api/formacion/<int:id_>")
@auth.requiere("personal", "edicion")
def borrar_formacion_(id_):
    db.borrar_formacion(id_)
    return jsonify({"ok": True})

@bp.post("/api/personal/<int:id_>/experiencia")
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

@bp.put("/api/experiencia/<int:id_>")
@auth.requiere("personal", "edicion")
def editar_experiencia_(id_):
    cuerpo = request.get_json(silent=True) or {}
    datos = {c: cuerpo[c] for c in db.CAMPOS_EXPERIENCIA if c in cuerpo}
    if not datos:
        return _error("No llegó ningún cambio", 400)
    db.editar_experiencia(id_, datos)
    return jsonify({"ok": True})

@bp.delete("/api/experiencia/<int:id_>")
@auth.requiere("personal", "edicion")
def borrar_experiencia_(id_):
    db.borrar_experiencia(id_)
    return jsonify({"ok": True})

@bp.get("/api/personal/<int:id_>/firma")
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

@bp.get("/api/personas/resumen")
@auth.requiere("personal", "vista")
def resumen_personas():
    """
    Los números del panel, calculados en el servidor.

    Se hace aquí y no en la pantalla porque hay que recorrer las tres tablas
    y decidir qué cuenta como ficha incompleta; si eso viviera en el
    navegador, cada vista tendría su propia idea de lo que significa.
    """
    return jsonify({"ok": True, "resumen": db.resumen_personas()})

@bp.get("/api/candidatos")
@auth.requiere("asistencia", "vista")
def listar_candidatos():
    """
    Personas que aún no tienen identidad biométrica. Alimenta el selector de
    "Agregar registro", que ahora ELIGE en vez de crear.
    """
    return jsonify({"ok": True, "candidatos": db.sin_enrolar()})

