# -*- coding: utf-8 -*-
"""
rutas/sistema.py — Salud, novedades, parámetros y lo que sirve la propia interfaz.

12 rutas. Cada una valida, comprueba permisos y delega:
la lógica vive en los módulos de negocio, no aquí.
"""
import datetime
import io
import os
from datetime import date
from flask import Flask, jsonify, request, send_file, send_from_directory
import archivos
import reportes
import auth
import config
import db
import enrolamiento
from yunatt_client import cliente, YunattError
import construir_interfaz
from flask import Blueprint
from .apoyo import (INTERFAZ, RAIZ, _error, _servible, log)

bp = Blueprint("sistema", __name__)

# ══════════════════════════════════════════════════════════════════════════
#  INTERFAZ ESTÁTICA
# ══════════════════════════════════════════════════════════════════════════

@bp.get("/")
def interfaz():
    return send_from_directory(RAIZ, INTERFAZ)

@bp.get("/<path:ruta>")
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

@bp.get("/api/health")
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

@bp.get("/api/yunatt/estado")
@auth.requiere("asistencia", "vista")
def yunatt_estado():
    return jsonify({"ok": True, **cliente.estado()})

@bp.get("/api/yunatt/departamentos")
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

@bp.get("/api/parametros")
@auth.requiere("dashboard", "vista")
def leer_parametros():
    """Datos institucionales: nombre de la organización, fundación, ciudad."""
    return jsonify({"ok": True, "parametros": db.parametros()})

@bp.put("/api/parametros")
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

@bp.get("/api/alertas")
@auth.requiere("dashboard", "vista")
def alertas():
    """
    Lo que requiere atención, calculado de la base. Cada alerta dice a qué
    persona y a qué pestaña de su ficha hay que ir, para que el enlace del
    Dashboard aterrice en el problema y no en una página general.
    """
    venc = db.resumen_vencimientos()
    return jsonify({"ok": True, "vencimientos": venc})

@bp.get("/api/reportes/<modulo>.pdf")
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

@bp.get("/api/campos-requeridos")
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

@bp.get("/api/novedades")
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

@bp.get("/api/accesos")
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

