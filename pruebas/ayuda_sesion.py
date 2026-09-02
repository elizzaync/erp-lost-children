# -*- coding: utf-8 -*-
"""
Una sesión para las pruebas que hablan con la API.

Desde que LOGIN_ESTRICTO está activo, ningún endpoint con @auth.requiere
atiende a quien no se identifica: las suites que usaban el cliente de Flask
a pelo reciben 401 en todo. Antes pasaban porque el modo convivencia daba
permisos completos a quien no traía sesión — que era justo el agujero que
se cerró.

Esto crea una cuenta de Director EN LA COPIA que la suite ya está usando, y
devuelve un cliente identificado y con el token CSRF puesto, como lo tendría
un navegador de verdad.

    import ayuda_sesion
    cli = ayuda_sesion.cliente(A.app)      # A = el módulo app ya importado

La cuenta vive solo en esa copia y se va con ella.
"""
import db
import auth

USUARIO = "prueba.sesion"
CLAVE = "clave-de-la-prueba-2026"


def _rol_director():
    rol = db.rol_por_clave("director")
    if rol:
        return rol["id"]
    # Una base recién creada por la propia prueba puede no traerlo.
    rid = db.crear_rol("Director", "director", "Acceso completo", es_sistema=1)
    db.guardar_permisos_rol(rid, {m[0]: "edicion" for m in __import__("config").MODULOS})
    return rid


def crear_cuenta(nombre="Prueba De Sesion"):
    """La ficha y la cuenta con la que se va a entrar. Devuelve su ficha."""
    ya = db.usuario_por_nombre(USUARIO)
    if ya:
        return ya["personal_id"]
    pid = db.crear_personal({"nombre": nombre, "cargo": "Cuenta de pruebas",
                             "estado": "activo"})
    db.crear_usuario(pid, USUARIO, auth.hashear(CLAVE), _rol_director(),
                     debe_cambiar=0)
    return pid


def cliente(app, nombre="Prueba De Sesion"):
    """
    Un cliente ya identificado, con el CSRF puesto.

    El token va en environ_base para que lo lleven TODAS las peticiones: sin
    él, las escrituras se rechazan con 403 aunque la sesión sea válida.
    """
    crear_cuenta(nombre)
    app.config["TESTING"] = True
    cli = app.test_client()
    r = cli.post("/api/login", json={"usuario": USUARIO, "clave": CLAVE})
    if r.status_code != 200:
        raise RuntimeError(
            f"no se pudo entrar con la cuenta de pruebas: {r.status_code} "
            f"{(r.get_json() or {}).get('error', '')}")
    d = r.get_json() or {}
    csrf = (d.get("sesion") or {}).get("csrf") or d.get("csrf") or ""
    cli.environ_base["HTTP_X_CSRF_TOKEN"] = csrf
    return cli
