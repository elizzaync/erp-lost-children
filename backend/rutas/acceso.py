# -*- coding: utf-8 -*-
"""
rutas/acceso.py — Entrar, salir, y quién puede hacer qué: usuarios, roles e invitaciones.

18 rutas. Cada una valida, comprueba permisos y delega:
la lógica vive en los módulos de negocio, no aquí.
"""
import datetime
from flask import jsonify, request
import firmas
import invitaciones as invi
import auth
import config
import db
import construir_interfaz
from flask import Blueprint
from .apoyo import (_cookie_sesion, _error, _es_director, _ip, _puede_tocar_director, _resumen_sesion, _sesion_con_csrf, _yo, log)

bp = Blueprint("acceso", __name__)

@bp.post("/api/login")
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

@bp.post("/api/logout")
def logout():
    token = request.cookies.get(config.COOKIE_NOMBRE)
    if token:
        auth.cerrar_sesion(token)
    r = jsonify({"ok": True})
    r.delete_cookie(config.COOKIE_NOMBRE, path="/")
    return r

@bp.get("/api/sesion")
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

@bp.post("/api/cambiar-clave")
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

# ── Invitaciones al formulario público ────────────────────────────────
# Los enlaces se crean y se anulan aquí. Lo que llega del formulario NO
# entra por estos endpoints: eso es el paso 3, y pasa por la bandeja.

@bp.get("/api/invitaciones")
@auth.requiere("responsables", "vista")
def listar_invitaciones():
    return jsonify({
        "ok": True,
        "invitaciones": invi.listar(),
        # Sin esto la pantalla no puede explicar por qué no hay enlaces.
        "configurado": bool(config.FORM_URL_PRELLENADO),
    })

@bp.post("/api/invitaciones")
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

@bp.post("/api/invitaciones/<int:id_>/anular")
@auth.requiere("responsables", "edicion")
def anular_invitacion_api(id_):
    d = request.get_json(silent=True) or {}
    try:
        fila = invi.anular(id_, d.get("motivo") or "")
    except invi.InvitacionError as e:
        return _error(e, 404)
    return jsonify({"ok": True, "invitacion": fila,
                    "invitaciones": invi.listar()})

@bp.get("/api/mi-firma")
def mi_firma():
    """Si quien está conectado tiene firma guardada, y cuál."""
    pid, error = _yo()
    if error:
        return error
    p = db.persona_personal(pid)
    return jsonify({"ok": True, "tiene": bool(p and p.get("firma")),
                    "url": f"/api/personal/{pid}/firma" if (p and p.get("firma"))
                           else None})

@bp.post("/api/mi-firma")
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

@bp.delete("/api/mi-firma")
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

@bp.get("/api/usuarios")
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

@bp.post("/api/usuarios")
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

@bp.put("/api/usuarios/<int:id_>")
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

@bp.delete("/api/usuarios/<int:id_>")
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

@bp.post("/api/roles")
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

@bp.get("/api/roles/<int:id_>/permisos")
@auth.requiere("usuarios", "vista")
def permisos_de_rol_(id_):
    r = db.rol(id_)
    if not r:
        return _error(f"No existe el rol {id_}", 404)
    mapa = {m: "ninguno" for m in config.CLAVES_MODULO}
    mapa.update(db.permisos_rol(id_))
    return jsonify({"ok": True, "rol": r, "permisos": mapa})

@bp.put("/api/roles/<int:id_>/permisos")
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

@bp.delete("/api/roles/<int:id_>")
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

