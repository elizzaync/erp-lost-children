# -*- coding: utf-8 -*-
"""
invitaciones.py — el enlace que se le entrega a cada familia.

QUÉ ES UN TOKEN AQUÍ, Y QUÉ NO ES

Es una etiqueta secreta que viaja dentro del enlace del formulario. Cuando
la respuesta vuelve, dice de quién es sin tener que pedirle el documento
dos veces y sin confiar en que dos personas no se llamen igual.

Lo que NO es: una contraseña. Google Forms sin sesión no puede impedir que
alguien borre o cambie ese campo del formulario, así que un token correcto
no demuestra que quien responde sea quien creemos. Por eso:

  · el token sirve para ATAR una respuesta a una familia, no para dar
    acceso a nada;
  · una respuesta con token desconocido, caducado o ya usado no se tira a
    la basura: entra a la bandeja marcada, y decide una persona;
  · nada de lo que llega escribe en la base sin que alguien lo apruebe.

POR QUÉ CADUCAN

Un enlace se reenvía por WhatsApp, se queda en un grupo y sigue ahí meses
después. Con fecha de fin, una copia perdida deja de servir sola.
"""
import secrets
from datetime import datetime, timedelta

import config
import db

# Cuántos caracteres tiene el token. 24 bytes son ~32 caracteres: no se
# adivina probando, y sigue cabiendo en un enlace de WhatsApp sin partirse.
BYTES_TOKEN = 24


class InvitacionError(Exception):
    """No se puede crear o usar la invitación. El mensaje es para quien lo lee."""


def _hoy():
    return datetime.now()


def nuevo_token():
    """Un token que no se repite y no se adivina."""
    return secrets.token_urlsafe(BYTES_TOKEN)


def enlace_de(token):
    """
    El enlace listo para entregar.

    Sale de la dirección prerrellenada que dio Google, sustituyendo la
    palabra de plantilla por el token. Se hace así —y no armando la
    dirección a mano— porque el número de campo del formulario
    (entry.1103863268) lo asigna Google y cambia si se rehace la pregunta:
    copiar su enlace es la única forma de no depender de ese número.
    """
    base = (config.FORM_URL_PRELLENADO or "").strip()
    if not base:
        raise InvitacionError(
            "Todavía no está configurada la dirección del formulario. "
            "Se pone en backend/.env, en FORM_URL_PRELLENADO.")
    marca = config.FORM_MARCA_TOKEN or "PLANTILLA"
    if marca not in base:
        raise InvitacionError(
            f"La dirección del formulario no contiene «{marca}», así que no se "
            "sabe dónde va el código. Vuelve a copiar el enlace prerrellenado.")
    return base.replace(marca, token)


def crear(responsable_id=None, etiqueta="", dias=None, usuario_id=None, nota=""):
    """
    Una invitación nueva y su enlace.

    'responsable_id' cuando la ficha ya existe y esto es para actualizarla;
    'etiqueta' cuando todavía no existe y solo se sabe a quién se le dio.
    Sin una cosa ni la otra no se crea: una invitación anónima no se podría
    reclamar a nadie después.
    """
    etiqueta = str(etiqueta or "").strip()
    if not responsable_id and not etiqueta:
        raise InvitacionError(
            "Hay que decir a quién se le entrega: elige una ficha existente o "
            "escribe un nombre para reconocerla (por ejemplo, «Familia Quispe»).")
    if responsable_id and not db.responsable(responsable_id):
        raise InvitacionError(f"No existe el responsable {responsable_id}.")

    try:
        dias = int(dias or config.FORM_DIAS_VIGENCIA or 30)
    except (TypeError, ValueError):
        # Sin esto, un valor que no es número revienta con un 500 y la
        # pantalla enseña un error incomprensible.
        raise InvitacionError("La vigencia tiene que ser un número de días.")
    if dias < 1:
        raise InvitacionError("La vigencia tiene que ser de al menos un día.")
    if dias > 365:
        # Un enlace que vale un año no caduca en la práctica, y la
        # caducidad es lo único que protege una copia reenviada.
        raise InvitacionError("La vigencia máxima es de 365 días.")

    token = nuevo_token()
    # Se comprueba el enlace ANTES de guardar: si la configuración está
    # incompleta, mejor no dejar invitaciones que no se pueden entregar.
    enlace = enlace_de(token)

    caduca = (_hoy() + timedelta(days=dias)).strftime("%Y-%m-%d %H:%M:%S")
    fila = db.crear_invitacion({
        "token": token,
        "responsable_id": responsable_id or None,
        "etiqueta": etiqueta,
        "creada_por": usuario_id,
        "caduca": caduca,
        "nota": str(nota or "").strip(),
    })
    return con_enlace(fila)


def situacion(fila):
    """
    En qué estado está de verdad, mirando también la fecha.

    El estado guardado no puede saber por sí solo que hoy es más tarde que
    su caducidad; por eso se calcula al leer en vez de dejar una tarea que
    tenga que pasar cada noche marcando filas.
    """
    if not fila:
        return "desconocida"
    if fila.get("estado") == "anulada":
        return "anulada"
    if fila.get("estado") == "usada" or (fila.get("usada") or "").strip():
        return "usada"
    caduca = (fila.get("caduca") or "").strip()
    if caduca and caduca < _hoy().strftime("%Y-%m-%d %H:%M:%S"):
        return "caducada"
    return "vigente"


def con_enlace(fila):
    """La invitación con su enlace y su situación al día, para enseñarla."""
    if not fila:
        return None
    d = dict(fila)
    d["situacion"] = situacion(fila)
    try:
        d["enlace"] = enlace_de(fila["token"])
    except InvitacionError:
        d["enlace"] = ""
    return d


def listar(incluir_cerradas=True):
    filas = [con_enlace(f) for f in db.invitaciones()]
    if incluir_cerradas:
        return filas
    return [f for f in filas if f["situacion"] == "vigente"]


def resolver(token):
    """
    A quién corresponde un token que volvió con una respuesta.

    Devuelve siempre algo: si el token no existe o ya no vale, lo dice en
    'situacion' en vez de levantar un error. Quien importa la respuesta la
    guarda igual y marca el problema para que lo mire una persona; tirar
    una respuesta porque su token caducó sería perder lo que una familia
    ya se tomó el trabajo de escribir.
    """
    token = str(token or "").strip()
    if not token:
        return {"invitacion": None, "situacion": "sin token"}
    fila = db.invitacion_por_token(token)
    if not fila:
        return {"invitacion": None, "situacion": "desconocido"}
    return {"invitacion": con_enlace(fila), "situacion": situacion(fila)}


def marcar_usada(id_):
    db.actualizar_invitacion(id_, {
        "estado": "usada",
        "usada": _hoy().strftime("%Y-%m-%d %H:%M:%S"),
    })
    return con_enlace(db.invitacion(id_))


def anular(id_, motivo=""):
    """Deja el enlace sin efecto sin borrar el rastro de que se entregó."""
    fila = db.invitacion(id_)
    if not fila:
        raise InvitacionError(f"No existe la invitación {id_}.")
    nota = str(motivo or "").strip()
    db.actualizar_invitacion(id_, {
        "estado": "anulada",
        "nota": (fila.get("nota") or "") + (("\n" + nota) if nota else ""),
    })
    return con_enlace(db.invitacion(id_))
