# -*- coding: utf-8 -*-
"""
Las reglas de las solicitudes de permiso y vacaciones.

db.py guarda y lee; aquí se decide. La separación es la que ya anunciaba el
comentario de db.py — "las reglas (saldo, umbral, transiciones) viven en
solicitudes.py" — y este módulo es el que faltaba.

Las cifras no están aquí: viven en config.py, con nombre, porque son
acuerdos de la organización y no decisiones técnicas.

SEIS TIPOS, DOS NATURALEZAS
───────────────────────────
  vacaciones                    se generan por antigüedad y salen de un saldo
  personal, familiar, medico,   no tienen saldo: se piden y se aprueban
  licencia, otro

Por eso 'vacaciones' no desapareció al desglosar los permisos en cinco: no
es un permiso más, es otra cosa con reglas propias.
"""
from datetime import date as _date

import config
import db


# Se leen de db.py en vez de repetirlas: dos listas de tipos acaban
# discrepando, y la que manda es la que valida antes de escribir.
TIPOS = db.TIPOS_SOLICITUD

ETIQUETAS = {
    "vacaciones": "Vacaciones",
    "personal":   "Permiso personal",
    "familiar":   "Permiso familiar",
    "medico":     "Permiso médico",
    "licencia":   "Licencia",
    "otro":       "Otro",
}

# Qué se puede hacer desde cada estado. Lo que no está aquí, no se puede:
# es más seguro enumerar lo permitido que intentar prever lo prohibido.
#
# 'pendiente' es el visto bueno del jefe. Si la solicitud es larga, el jefe
# no la aprueba: la pasa a 'pendiente_admin', y Administración cierra.
TRANSICIONES = {
    "pendiente":       {"aprobar", "rechazar", "cancelar"},
    "pendiente_admin": {"aprobar", "rechazar", "cancelar"},
    "aprobada":        {"cancelar"},
    "rechazada":       set(),
    "cancelada":       set(),
}

ABIERTOS = ("pendiente", "pendiente_admin")


class ReglaRota(ValueError):
    """Algo que el usuario puede corregir: fechas al revés, saldo corto…"""


def dias(desde, hasta):
    """Días de calendario que abarca, ambos extremos incluidos."""
    return (_date.fromisoformat(hasta) - _date.fromisoformat(desde)).days + 1


def requiere_admin(desde, hasta):
    """
    ¿Hace falta, además del jefe, el visto bueno de Administración?

    Se mide en días CORRIDOS, no hábiles: lo que obliga a reorganizar los
    turnos de casa hogar es la ausencia seguida, cuente o no como laborable.
    """
    return dias(desde, hasta) > config.DIAS_VISTO_BUENO_ADMIN


def _aniversarios(ingreso, hasta):
    """Cuántos años cumplidos de servicio hay entre ambas fechas."""
    a = _date.fromisoformat(ingreso)
    n = 0
    while True:
        try:
            siguiente = a.replace(year=a.year + n + 1)
        except ValueError:           # 29 de febrero
            siguiente = a.replace(year=a.year + n + 1, day=28)
        if siguiente > hasta:
            return n
        n += 1


def saldo_vacaciones(personal_id, a_fecha=None):
    """
    Días de vacaciones disponibles.

    El tope se aplica a la GENERACIÓN, recorriendo los aniversarios en orden,
    no al saldo final. Toparlo al final estaría mal: alguien con 5 años y 0
    días usados daría min(60, 150) = 60, y al tomar 10 seguiría dando 60 —
    podría tomar vacaciones indefinidamente. La nota está en config.py y
    aquí se cumple.

    Devuelve None si la persona no genera vacaciones (no está en planilla) o
    no tiene fecha de ingreso: no es lo mismo "cero días" que "esto no
    aplica", y la pantalla debe poder distinguirlo.
    """
    p = db.persona_personal(personal_id)
    if not p:
        return None
    # El régimen NO está en la ficha: vive en condiciones_laborales, con
    # vigencia, porque una persona puede pasar de honorarios a planilla. Lo
    # que cuenta es el régimen de hoy, no el que tuvo al entrar.
    cond = db.condicion_vigente(personal_id)
    if not cond or cond.get("regimen") != config.REGIMEN_CON_VACACIONES:
        return None
    ingreso = str(p.get("fecha_ingreso") or "").strip()
    if not ingreso:
        return None
    try:
        _date.fromisoformat(ingreso)
    except ValueError:
        return None

    hoy = a_fecha or _date.today()
    generado = 0
    for _ in range(_aniversarios(ingreso, hoy)):
        if generado >= config.TOPE_VACACIONES:
            break                     # en el tope se DEJA de generar
        generado = min(generado + config.DIAS_VACACIONES_POR_ANIO,
                       config.TOPE_VACACIONES)

    usado = 0
    for s in db.solicitudes_de(personal_id):
        if s["tipo"] == "vacaciones" and s["estado"] in ("aprobada",) + ABIERTOS:
            usado += dias(s["desde"], s["hasta"])
    return generado - usado


def validar_nueva(personal_id, tipo, desde, hasta):
    """
    Comprueba lo que el usuario puede corregir antes de guardar.

    Lo que la base ya garantiza (tipo válido, hasta >= desde) no se repite
    aquí; lo que se comprueba es lo que la base no puede saber.
    """
    if tipo not in TIPOS:
        raise ReglaRota(f"Tipo de solicitud no reconocido: {tipo}")
    try:
        d1 = _date.fromisoformat(desde)
        d2 = _date.fromisoformat(hasta)
    except ValueError:
        raise ReglaRota("Las fechas tienen que ir en formato aaaa-mm-dd")
    if d2 < d1:
        raise ReglaRota("La fecha final no puede ser anterior a la inicial")

    # Solapamiento con otra solicitud viva de la misma persona. Dos permisos
    # encima del mismo día son casi siempre un doble envío por error.
    for s in db.solicitudes_de(personal_id):
        if s["estado"] not in ("aprobada",) + ABIERTOS:
            continue
        if s["desde"] <= hasta and desde <= s["hasta"]:
            raise ReglaRota(
                f"Ya tienes una solicitud del {s['desde']} al {s['hasta']} "
                f"que se cruza con estas fechas.")

    if tipo == "vacaciones":
        saldo = saldo_vacaciones(personal_id)
        if saldo is not None and dias(desde, hasta) > saldo:
            raise ReglaRota(
                f"Pides {dias(desde, hasta)} días y te quedan {saldo}.")


def crear(personal_id, tipo, desde, hasta, motivo=""):
    """
    Registra la solicitud ya validada y decide a quién le toca resolverla.

    El jefe sale de la ficha, no del cuerpo de la petición: si viniera de
    fuera, cualquiera podría dirigir su solicitud a quien le convenga.
    """
    validar_nueva(personal_id, tipo, desde, hasta)
    p = db.persona_personal(personal_id)
    jefe = p.get("jefe_id") if p else None
    admin = requiere_admin(desde, hasta)
    return db.crear_solicitud(personal_id, tipo, desde, hasta, motivo or "",
                              jefe_id=jefe, requiere_admin=1 if admin else 0,
                              estado="pendiente")


def _siguiente_estado(sol, accion):
    estado = sol["estado"]
    if accion not in TRANSICIONES.get(estado, set()):
        raise ReglaRota(
            f"Una solicitud {estado} no se puede {accion}.")
    if accion == "rechazar":
        return "rechazada", "resuelto_el"
    if accion == "cancelar":
        return "cancelada", "resuelto_el"
    # Aprobar. Si es larga y solo pasó por el jefe, todavía falta
    # Administración: no se da por aprobada a medias.
    if estado == "pendiente" and sol["requiere_admin"]:
        return "pendiente_admin", "aprob_jefe_el"
    return "aprobada", ("aprob_admin_el" if estado == "pendiente_admin"
                        else "aprob_jefe_el")


def resolver(id_, accion, nota=""):
    """Aprobar, rechazar o cancelar. Devuelve la solicitud ya actualizada."""
    sol = db.solicitud(id_)
    if not sol:
        raise KeyError(f"No existe la solicitud {id_}")
    estado, sello = _siguiente_estado(sol, accion)
    db.actualizar_estado_solicitud(id_, estado, nota=nota or None, sello=sello)
    return db.solicitud(id_)


def con_etiquetas(sol):
    """Añade lo que la pantalla necesita y la base no guarda."""
    s = dict(sol)
    s["tipo_etiqueta"] = ETIQUETAS.get(s.get("tipo"), s.get("tipo"))
    s["abierta"] = s.get("estado") in ABIERTOS
    s["acciones"] = sorted(TRANSICIONES.get(s.get("estado"), set()))
    return s
