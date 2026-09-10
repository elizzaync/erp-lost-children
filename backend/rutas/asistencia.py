# -*- coding: utf-8 -*-
"""
rutas/asistencia.py — Fichajes por los dos canales, y el enrolamiento biométrico.

16 rutas. Cada una valida, comprueba permisos y delega:
la lógica vive en los módulos de negocio, no aquí.
"""
import datetime
import json
import os
from datetime import date
from flask import jsonify, request, send_file
import documento_permiso
import fotos
import lugares
import auth
import config
import db
import enrolamiento
import personas
from yunatt_client import YunattError
import construir_interfaz
from flask import Blueprint
from .apoyo import (_distancia, _error, _sesion_con_csrf, _validar_descriptor, _yo, log)

bp = Blueprint("asistencia", __name__)

# ── La foto del responsable ───────────────────────────────────────────
# Tres operaciones y una sola forma de entrar: fotos.aceptar(). El día que
# la foto llegue del formulario público, ese origen llama a lo mismo.

@bp.post("/api/enrolamiento/revisar")
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

@bp.get("/api/marca/<nombre>")
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

@bp.post("/api/rostro-web")
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

@bp.delete("/api/rostro-web")
def borrar_rostro_web_():
    """Quitar el propio rostro sin revocar el consentimiento."""
    pid, err = _yo()
    if err:
        return err
    db.borrar_rostro_web(pid)
    return jsonify({"ok": True})

@bp.get("/api/asistencia/mias")
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

@bp.post("/api/asistencia/marcar")
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

@bp.get("/api/identidades")
@auth.requiere("asistencia", "vista")
def listar_identidades():
    """Quiénes están enrolados en el terminal, sean personal o beneficiarios."""
    return jsonify({"ok": True, "identidades": db.identidades()})

@bp.delete("/api/identidades/<int:staff_number>")
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

@bp.post("/api/enrolamiento")
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

@bp.get("/api/enrolamiento/<int:staff_number>/estado")
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

@bp.post("/api/enrolamiento/<int:staff_number>/reintentar")
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

@bp.post("/api/enrolamiento/<int:staff_number>/cancelar")
@auth.requiere("asistencia", "edicion")
def cancelar_enrolamiento(staff_number):
    try:
        return jsonify(enrolamiento.cancelar(staff_number))
    except Exception as e:
        return _error(e, 500)

@bp.get("/api/asistencia")
@auth.requiere("asistencia", "vista")
def asistencia():
    fecha = request.args.get("fecha") or date.today().isoformat()
    return jsonify({"ok": True, "fecha": fecha, "filas": db.marcas_de(fecha)})

@bp.get("/api/asistencia/resumen")
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

@bp.get("/api/asistencia/rango")
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

@bp.post("/api/asistencia/sync")
@auth.requiere("asistencia", "edicion")
def sincronizar():
    try:
        return jsonify(enrolamiento.sincronizar_marcas())
    except YunattError as e:
        return _error(e, 502)
    except Exception as e:
        log.exception("fallo al sincronizar marcas")
        return _error(e, 500)

