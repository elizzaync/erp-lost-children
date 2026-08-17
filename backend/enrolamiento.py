# -*- coding: utf-8 -*-
"""
enrolamiento.py — máquina de estados de la captura biométrica.

POR QUÉ ESTO EXISTE

yunatt no avisa de nada. Cuando mandamos el comando al dispositivo, este
abre la pantalla de registro y se queda esperando a la persona, pero nadie
nos notifica si acabó bien, si se canceló o si nadie se acercó.

La única forma de saberlo es tomar una foto del estado biométrico ANTES de
mandar el comando y luego volver a consultarlo hasta ver que cambió. Eso es
lo que hace este módulo: guarda ese estado base por sesión de enrolamiento
y resuelve el resultado comparando contra él.

"AMBOS" VA EN DOS FASES

El dispositivo solo registra una modalidad por comando. Cuando se piden
rostro y huella, primero se manda el comando de rostro; al confirmarse, el
backend manda solo el de huella y la interfaz pasa a "Paso 2 de 2".
"""
import logging
import threading
import time

import config
import db
from yunatt_client import cliente, YunattError

log = logging.getLogger("enrolamiento")

# Cuánto espera el dispositivo a la persona antes de darlo por fallido.
# Mismo valor que usa el ERP anterior: dos minutos por fase.
TIEMPO_LIMITE = 120

# Mínimo entre consultas reales a yunatt. La interfaz puede sondear cada
# 1,5 s para sentirse viva, pero solo cada 4 s se golpea de verdad la cuenta
# compartida — el resto se responde desde esta caché.
CACHE_SONDEO = 4.0

# metodo del formulario -> secuencia de fases a ejecutar
SECUENCIAS = {
    "facial": ["rostro"],
    "huella": ["huella"],
    "ambos": ["rostro", "huella"],
}

BACKUP_DE_FASE = {
    "rostro": config.BACKUP_ROSTRO,
    "huella": config.BACKUP_HUELLA,
}

ETIQUETA_FASE = {"rostro": "rostro", "huella": "huella"}

_sesiones = {}
_lock = threading.RLock()


def _clave_biometrica(estado):
    """
    Huella digital del estado biométrico, para detectar cambios.
    Incluye la foto porque al re-registrar un rostro ya existente los
    backupnums no cambian pero la foto sí.
    """
    return (tuple(sorted(estado.get("backupnums") or [])), estado.get("foto") or "")


class SesionEnrolamiento:
    def __init__(self, staff_number, nombre, fases):
        self.staff_number = staff_number
        self.nombre = nombre
        self.fases = fases
        self.indice = 0
        self.estado = "esperando"          # esperando | ok | error | cancelado
        self.detalle = ""
        # Del estado base guardamos solo la clave de comparación (una tupla,
        # inmutable) y no el dict devuelto por el cliente: así el baseline no
        # puede quedar acoplado a una estructura que alguien mute después.
        self.base_clave = None
        self.base_en_dispositivo = False
        self.inicio_fase = 0.0
        self.logrado = {"rostro": False, "huella": False}
        self._cache = None
        self._cache_ts = 0.0

    @property
    def fase(self):
        if self.indice < len(self.fases):
            return self.fases[self.indice]
        return None

    def resumen(self):
        restante = 0
        if self.estado == "esperando" and self.inicio_fase:
            restante = max(0, int(TIEMPO_LIMITE - (time.time() - self.inicio_fase)))
        return {
            "staff_number": self.staff_number,
            "nombre": self.nombre,
            "estado": self.estado,
            "detalle": self.detalle,
            "fase": self.fase,
            "fase_etiqueta": ETIQUETA_FASE.get(self.fase, ""),
            "paso": min(self.indice + 1, len(self.fases)),
            "total_pasos": len(self.fases),
            "segundos_restantes": restante,
            "tiene_rostro": self.logrado["rostro"],
            "tiene_huella": self.logrado["huella"],
        }


def _lanzar_fase(sesion):
    """Toma el estado base y manda el comando de la fase actual al equipo.

    [UN SOLO DISPOSITIVO] No se elige terminal: el cliente manda siempre
    al configurado. Con dos equipos habrá que decidir en cuál se enrola y
    tomar el estado base de ese mismo. Ver el bloque en config.py.
    """
    fase = sesion.fase
    if fase is None:
        return

    base = cliente.estado_en_dispositivo(sesion.staff_number)
    sesion.base_clave = _clave_biometrica(base)
    sesion.base_en_dispositivo = bool(base.get("en_dispositivo"))

    cliente.comando_enrolar(
        sesion.staff_number, sesion.nombre, BACKUP_DE_FASE[fase]
    )

    sesion.inicio_fase = time.time()
    sesion._cache = None
    sesion._cache_ts = 0.0
    log.info(
        f"enrolamiento: {sesion.staff_number} — fase '{fase}' "
        f"({sesion.indice + 1}/{len(sesion.fases)}) lanzada"
    )


def iniciar(tipo, titular_id, metodo):
    """
    Arranca la captura para una persona QUE YA EXISTE (en personal o en
    beneficiarios): le reserva un staffNumber, la da de alta en yunatt y
    pone el dispositivo en modo registro.

    Antes este módulo creaba también a la persona, y eso obligaba a
    escribir su nombre por segunda vez y dejaba dos copias del mismo dato.
    Ahora la ficha es la fuente única y esto solo añade su identidad
    biométrica.
    """
    if tipo not in ("personal", "beneficiario"):
        raise ValueError(f"Tipo no reconocido: {tipo!r}")

    titular = (db.persona_personal(titular_id) if tipo == "personal"
               else next((b for b in db.beneficiarios() if b["id"] == int(titular_id)), None))
    if not titular:
        raise KeyError(f"No existe {tipo} con id {titular_id}")

    ya = db.identidad_de(tipo, titular_id)
    if ya:
        raise ValueError(
            f"{titular['nombre']} ya está enrolada con el ID {ya['staff_number']}. "
            "Quítala del terminal antes de volver a enrolarla."
        )

    metodo = (metodo or "facial").strip()
    fases = SECUENCIAS.get(metodo)
    if not fases:
        raise ValueError(f"Método no reconocido: {metodo!r}")

    # Solo aplica si se configura un terminal SIN lector de huella. El
    # TM-AI03F actual sí lo tiene (ver config.SOPORTA_HUELLA).
    if "huella" in fases and not config.SOPORTA_HUELLA:
        raise ValueError(
            "El terminal configurado no tiene lector de huella. Usa el "
            "método 'Rostro', o activa SOPORTA_HUELLA si el equipo sí lo lee."
        )

    ok, faltan = config.configurado()
    if not ok:
        raise YunattError("Falta configurar backend/.env: " + ", ".join(faltan))

    nombre = titular["nombre"]

    # Reservar el número mirando local + nube, para no chocar con nada
    # creado a mano desde el panel de yunatt.
    usados = [f.get("staffNumber") for f in cliente.staff_en_nube()]
    sn = db.siguiente_staff_number(usados)
    config.validar_rango(sn)

    db.crear_identidad(sn, tipo, titular_id, metodo)

    try:
        cliente.alta_staff(sn, nombre)
        sesion = SesionEnrolamiento(sn, nombre, list(fases))
        with _lock:
            _sesiones[sn] = sesion
        _lanzar_fase(sesion)
        return sesion.resumen()
    except Exception as e:
        db.actualizar_identidad(sn, "error", detalle=str(e))
        raise


def estado(staff_number):
    """
    Consulta el avance. Es lo que sondea la interfaz.

    Resuelve la fase actual comparando el estado biométrico del dispositivo
    contra el estado base tomado antes de mandar el comando.
    """
    sn = int(staff_number)
    with _lock:
        sesion = _sesiones.get(sn)

    if sesion is None:
        ident = db.identidad(sn)
        if ident:
            return {
                "staff_number": sn,
                "nombre": ident["nombre"],
                "estado": ident["estado"],
                "detalle": ident["detalle"],
                "fase": None,
                "fase_etiqueta": "",
                "paso": 1,
                "total_pasos": 1,
                "segundos_restantes": 0,
                "tiene_rostro": bool(ident["tiene_rostro"]),
                "tiene_huella": bool(ident["tiene_huella"]),
            }
        raise KeyError(f"No hay enrolamiento para staffNumber {sn}")

    if sesion.estado != "esperando":
        return sesion.resumen()

    ahora = time.time()

    # Caché: la interfaz puede sondear rápido sin castigar la cuenta.
    if sesion._cache is not None and (ahora - sesion._cache_ts) < CACHE_SONDEO:
        actual = sesion._cache
    else:
        try:
            actual = cliente.estado_en_dispositivo(sn)
            sesion._cache = actual
            sesion._cache_ts = ahora
        except YunattError as e:
            # Un fallo puntual de red no debe tumbar el enrolamiento: se
            # informa y se sigue esperando hasta agotar el tiempo límite.
            log.warning(f"enrolamiento: sondeo de {sn} falló — {e}")
            resumen = sesion.resumen()
            resumen["detalle"] = f"Reintentando la consulta a yunatt: {e}"
            return resumen

    fase = sesion.fase
    objetivo_presente = actual["rostro"] if fase == "rostro" else actual["huella"]

    if not sesion.base_en_dispositivo:
        # No estaba en el equipo antes: basta con que aparezca ya registrado.
        logrado = actual["en_dispositivo"] and objetivo_presente
    else:
        # Ya estaba: exigimos además que algo haya cambiado, para no dar por
        # buena una captura vieja.
        logrado = objetivo_presente and (
            _clave_biometrica(actual) != sesion.base_clave
        )

    if logrado:
        sesion.logrado[fase] = True
        sesion.indice += 1
        log.info(f"enrolamiento: {sn} — fase '{fase}' completada")

        if sesion.fase is None:
            sesion.estado = "ok"
            sesion.detalle = _mensaje_exito(sesion)
            db.actualizar_identidad(
                sn,
                "enrolado",
                rostro=sesion.logrado["rostro"],
                huella=sesion.logrado["huella"],
                detalle=sesion.detalle,
            )
        else:
            # Encadenar la segunda fase de "ambos" sin intervención.
            try:
                _lanzar_fase(sesion)
                sesion.detalle = (
                    "Rostro capturado. Ahora coloca el dedo en el lector."
                )
            except YunattError as e:
                sesion.estado = "error"
                sesion.detalle = f"No se pudo iniciar la captura de huella: {e}"
                db.actualizar_identidad(
                    sn,
                    "error",
                    rostro=sesion.logrado["rostro"],
                    detalle=sesion.detalle,
                )
        return sesion.resumen()

    # Red de seguridad: pedimos huella y el equipo registró un ROSTRO. Pasa
    # en terminales sin lector, que ignoran adduserbackups="0" y abren la
    # pantalla facial. Sin esto el operador se come los 120 s de espera y un
    # "no se completó" que no explica nada.
    if fase == "huella" and not objetivo_presente and actual["rostro"]:
        if _clave_biometrica(actual) != sesion.base_clave:
            sesion.estado = "error"
            sesion.detalle = (
                "El terminal registró un ROSTRO en lugar de una huella: este "
                "equipo no tiene lector de huella. Repite el enrolamiento con "
                "el método 'Rostro'."
            )
            db.actualizar_identidad(
                sn, "error", rostro=True, huella=False, detalle=sesion.detalle
            )
            log.warning(
                f"enrolamiento: {sn} — se pidió huella y el equipo registró rostro; "
                "el terminal no tiene lector de huella"
            )
            return sesion.resumen()

    if (ahora - sesion.inicio_fase) > TIEMPO_LIMITE:
        sesion.estado = "error"
        sesion.detalle = (
            f"No se completó la captura de {ETIQUETA_FASE.get(fase, fase)} — "
            "se canceló en el dispositivo o nadie se acercó a tiempo. "
            "Puedes reintentar cuando quieras."
        )
        db.actualizar_identidad(
            sn,
            "error",
            rostro=sesion.logrado["rostro"],
            huella=sesion.logrado["huella"],
            detalle=sesion.detalle,
        )
        log.info(f"enrolamiento: {sn} — fase '{fase}' agotó el tiempo límite")

    return sesion.resumen()


def _mensaje_exito(sesion):
    if sesion.logrado["rostro"] and sesion.logrado["huella"]:
        return "Rostro y huella capturados correctamente"
    if sesion.logrado["huella"]:
        return "Huella capturada correctamente"
    return "Rostro capturado correctamente"


def reintentar(staff_number):
    """Vuelve a mandar el comando de la fase pendiente sin gastar otro
    staffNumber: se reutiliza la identidad que ya existe."""
    sn = int(staff_number)
    ident = db.identidad(sn)
    if not ident:
        raise KeyError(f"No existe la identidad {sn}")

    fases = SECUENCIAS.get(ident["metodo"], ["rostro"])
    pendientes = [
        f
        for f in fases
        if not (
            ident["tiene_rostro"] if f == "rostro" else ident["tiene_huella"]
        )
    ]
    if not pendientes:
        pendientes = list(fases)

    sesion = SesionEnrolamiento(sn, ident["nombre"], pendientes)
    sesion.logrado["rostro"] = bool(ident["tiene_rostro"])
    sesion.logrado["huella"] = bool(ident["tiene_huella"])
    with _lock:
        _sesiones[sn] = sesion
    db.actualizar_identidad(sn, "esperando", detalle="")
    _lanzar_fase(sesion)
    return sesion.resumen()


def olvidar(staff_number):
    """
    Descarta la sesión de sondeo, sin tocar la base. La usa personas.borrar()
    para que no quede un hilo consultando a yunatt por alguien que ya no
    existe.
    """
    with _lock:
        _sesiones.pop(int(staff_number), None)


def cancelar(staff_number):
    """
    Deja de esperar. No hay comando de cancelación en yunatt: el dispositivo
    cierra solo la pantalla de registro por inactividad.
    """
    sn = int(staff_number)
    with _lock:
        sesion = _sesiones.get(sn)
        if sesion and sesion.estado == "esperando":
            sesion.estado = "cancelado"
            sesion.detalle = "Captura cancelada desde el sistema"
    db.actualizar_identidad(sn, "error", detalle="Captura cancelada desde el sistema")
    return {"ok": True}


def sincronizar_marcas():
    """
    Descarga las marcas del mes desde yunatt y guarda las del rango
    reservado. Se dispara a mano desde la interfaz, no en segundo plano.
    """
    import re
    from datetime import datetime

    filas = cliente.marcas_del_mes()
    nuevas = 0

    for fila in filas:
        sn = fila.get("staffNumber")
        if not config.en_rango(sn):
            continue
        for clave, valor in fila.items():
            if not str(clave).startswith("day-") or not valor:
                continue
            dia = str(clave)[4:]
            # yunatt junta varias marcas del día separadas por <br>
            for parte in re.split(r"<br\s*/?>|\n|\|", str(valor), flags=re.I):
                parte = parte.strip()
                if not parte:
                    continue
                try:
                    datetime.strptime(f"{dia} {parte}", "%Y-%m-%d %H:%M")
                except ValueError:
                    continue
                nuevas += db.guardar_marca(sn, dia, parte)

    return {"ok": True, "filas": len(filas), "nuevas": nuevas}
