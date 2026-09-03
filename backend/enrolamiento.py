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
import fotos
from yunatt_client import cliente, YunattError, traducir_fallo

log = logging.getLogger("enrolamiento")

# Cuánto espera el dispositivo a la persona antes de darlo por fallido.
# Mismo valor que usa el ERP anterior: dos minutos por fase.
TIEMPO_LIMITE = 120

# Mínimo entre consultas reales a yunatt. La interfaz puede sondear cada
# 1,5 s para sentirse viva, pero solo cada 4 s se pregunta de verdad a su
# plataforma — el resto se responde desde esta caché.
# Bajado de 4 s a 1,5 s el 02/09/2026: con la plataforma oficial la
# confirmación de una captura llega por la FOTO que sube el terminal, y
# encima de esa espera —que no controlamos— había hasta 4 s más de
# caché. Enrolando a alguien se notaba.
CACHE_SONDEO = 1.5

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


def _es_caida_del_proveedor(e):
    """
    ¿Este fallo es «yunatt no responde», o es un problema de verdad?

    Se apoya en la misma tabla que usa la pantalla para explicar el estado,
    para que no puedan discrepar: si allí se dice que la culpa es del
    proveedor o de la red, aquí se encola en vez de dar error.
    """
    culpa, _frase, _solo = traducir_fallo(str(e))
    return culpa in ("proveedor", "red")


def iniciar(tipo, titular_id, metodo):
    """
    Arranca la captura para una persona QUE YA EXISTE (en personal, en
    beneficiarios o en responsables): le reserva un staffNumber, la da de
    alta en yunatt y pone el dispositivo en modo registro.

    Antes este módulo creaba también a la persona, y eso obligaba a
    escribir su nombre por segunda vez y dejaba dos copias del mismo dato.
    Ahora la ficha es la fuente única y esto solo añade su identidad
    biométrica.
    """
    if tipo not in db.COLUMNA_TITULAR:
        raise ValueError(f"Tipo no reconocido: {tipo!r}")

    if tipo == "personal":
        titular = db.persona_personal(titular_id)
    elif tipo == "beneficiario":
        titular = db.beneficiario(titular_id)
    else:
        titular = db.responsable(titular_id)
    if not titular:
        raise KeyError(f"No existe {tipo} con id {titular_id}")

    # Solo bloquea quien está enrolado DE VERDAD, es decir, con rostro o
    # huella confirmados por el terminal. Antes bastaba con que existiera
    # la fila —que se crea al pedir el enrolamiento— y eso dejaba
    # atrapado a cualquiera que cancelara la captura, con un mensaje que
    # además no era cierto.
    ya = db.identidad_de(tipo, titular_id)
    if ya and ya["enrolado"]:
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

    if ya:
        # Un intento anterior que no llegó a cuajar: se reaprovecha su
        # número. Pedir uno nuevo dejaría la fila vieja suelta apuntando a
        # la misma persona, y con dos identidades no se sabría cuál de las
        # dos marca.
        sn = ya["staff_number"]
        config.validar_rango(sn)
    else:
        # Reservar el número mirando local + nube, para no chocar con nada
        # creado a mano desde el panel de yunatt.
        try:
            usados = [f.get("staffNumber") for f in cliente.staff_en_nube()]
        except Exception as e:
            if not _es_caida_del_proveedor(e):
                raise
            # Sin nube no se ven los números creados a mano en su panel. Se
            # reserva mirando solo lo local: es lo mejor disponible, y no
            # poder enrolar porque su servidor está caído sería peor que un
            # choque de números que además casi nunca ocurre.
            log.warning("yunatt no responde: se reserva el número solo con "
                        "la base local")
            usados = []
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
        if not _es_caida_del_proveedor(e):
            db.actualizar_identidad(sn, "error", detalle=str(e))
            raise
        # El proveedor está caído. No hay nada roto y no hay nada que
        # arreglar: la persona queda creada aquí, a la espera de poder
        # mandarse. La cola se vacía sola desde revisar_pendientes(), que
        # corre al entrar en Gestión Biométrica.
        #
        # Distinguirlo de «error» importa porque cambia qué hace quien lo
        # lee: ante un error se intenta arreglar algo; ante «en cola», se
        # espera, que es lo correcto.
        _culpa, frase, _solo = traducir_fallo(str(e))
        db.actualizar_identidad(sn, "en_cola", detalle=frase)
        log.info("enrolamiento de %s encolado: yunatt no responde", nombre)
        return {
            "staff_number": sn, "nombre": nombre, "estado": "en_cola",
            "detalle": frase, "fase": None, "fase_etiqueta": "",
            "paso": 1, "total_pasos": len(fases), "segundos_restantes": 0,
            "tiene_rostro": False, "tiene_huella": False, "en_cola": True,
        }


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
            # La cara que acaba de tomar el equipo pasa a ser la de la
            # ficha. 'actual' ya trae la ruta: no cuesta otra consulta.
            if sesion.logrado["rostro"]:
                traer_foto(sn, actual.get("foto") or "")
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


def traer_foto(staff_number, ruta_foto):
    """
    Baja del terminal la foto que tomó y la deja en la ficha.

    El equipo fotografía a cada persona al registrarle el rostro. Esa foto
    estaba en yunatt y en ningún sitio más: la ficha se quedaba sin cara
    aunque el sistema tuviera la manera de traerla desde el principio.

    Nunca tumba un enrolamiento: si la descarga falla, se apunta y se
    sigue. Quedarse sin foto es un incordio; quedarse sin enrolar, no.
    """
    ident = db.identidad(staff_number)
    if not ident or not ruta_foto:
        return False

    # En el terminal se enrola a tres clases de persona y cada una guarda su
    # foto en su propia tabla.
    #
    # Los beneficiarios estuvieron fuera hasta el 31/08/2026 por ser
    # menores. Entran por decisión de la ONG, que recoge de los padres o
    # tutores un permiso firmado para compartir estos datos.
    if ident.get("personal_id"):
        guardar = lambda m: db.guardar_foto_personal(ident["personal_id"], m)
    elif ident.get("responsable_id"):
        guardar = lambda m: db.actualizar_foto_responsable(ident["responsable_id"], m)
    elif ident.get("beneficiario_id"):
        guardar = lambda m: db.guardar_foto_beneficiario(ident["beneficiario_id"], m)
    else:
        return False

    try:
        crudo = cliente.descargar_foto(ruta_foto)
        if not crudo:
            return False
        meta = fotos.aceptar(crudo, "terminal.jpg")
        guardar(meta)
        log.info(f"enrolamiento: {staff_number} — foto del terminal guardada")
        return True
    except Exception as e:
        log.warning(f"enrolamiento: {staff_number} — no se pudo traer la foto: {e}")
        return False


def revisar_pendientes():
    """
    Le pregunta al equipo por todas las identidades a medias.

    Existe porque la sesión de enrolamiento vive en la memoria del proceso:
    en cuanto la pantalla deja de sondear, nadie vuelve a preguntar y la
    ficha se queda en «esperando» aunque el terminal ya la haya capturado.
    Esto es lo que permite ponerse al día después.

    Una sola consulta al dispositivo para todas —su plataforma va justa y
    no conviene multiplicar peticiones— y el cruce se hace aquí.
    """
    pendientes = [i for i in db.identidades()
                  if i["estado"] in ("esperando", "error", "en_cola")]

    # Las encoladas nunca llegaron a crearse en yunatt —el proveedor estaba
    # caído cuando se pidieron—, así que no basta con preguntarle al equipo
    # si ya las tiene: hay que volver a mandarlas.
    for ident in [i for i in pendientes if i["estado"] == "en_cola"]:
        try:
            cliente.alta_staff(ident["staff_number"], ident["nombre"])
            db.actualizar_identidad(ident["staff_number"], "esperando",
                                    detalle="Enviada al volver la conexión")
            log.info("cola: %s enviada a yunatt", ident["nombre"])
        except Exception as e:
            log.warning("cola: %s sigue esperando (%s)",
                        ident["nombre"], str(e)[:100])
    if not pendientes:
        return {"ok": True, "revisadas": 0, "enroladas": 0, "fotos": 0,
                "nombres": []}

    en_equipo = {str(f.get("enrollid")): (f.get("backupnums") or [])
                 for f in cliente.staff_en_dispositivo()}
    fotos_por_sn = {str(s.get("staffNumber")): (s.get("photo") or "")
                    for s in cliente.staff_en_nube()}

    enroladas, con_foto, nombres = 0, 0, []
    for ident in pendientes:
        sn = str(ident["staff_number"])
        nums = en_equipo.get(sn)
        if nums is None:
            continue                       # no está en el equipo todavía
        rostro = config.tiene_rostro(nums)
        huella = config.tiene_huella(nums)
        if not (rostro or huella):
            continue                       # está dado de alta, sin biométrico
        db.actualizar_identidad(
            int(sn), "enrolado", rostro=rostro, huella=huella,
            detalle="Confirmado consultando el terminal")
        enroladas += 1
        nombres.append(ident["nombre"])
        if rostro and traer_foto(int(sn), fotos_por_sn.get(sn, "")):
            con_foto += 1
        log.info(f"enrolamiento: {sn} se confirmó como enrolado al revisar")

    return {"ok": True, "revisadas": len(pendientes), "enroladas": enroladas,
            "fotos": con_foto, "nombres": nombres}


def sincronizar_marcas():
    """
    Descarga las marcas del mes desde yunatt y guarda las del rango
    reservado. Se dispara a mano desde la interfaz, no en segundo plano.
    """
    import re
    from datetime import datetime, timedelta

    filas = cliente.marcas_del_mes()
    nuevas = 0
    descartadas = 0

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
                    cuando = datetime.strptime(f"{dia} {parte}", "%Y-%m-%d %H:%M")
                except ValueError:
                    continue

                # NADIE FICHA EN EL FUTURO.
                #
                # Si la zona horaria de la cuenta de yunatt no coincide con
                # la de aquí, sus marcas llegan adelantadas: con la cuenta
                # en Asia/Singapore, fichar a las 14:25 de Perú entraba
                # como las 03:25 del día siguiente. Se colaron siete así, y
                # quedaron duplicando fichajes reales.
                #
                # Una marca por delante del reloj es siempre un desajuste
                # de zona, nunca un fichaje. Se descarta y se avisa: es la
                # señal de que hay que revisar el timeZone de la cuenta
                # (Company Information → America/Lima).
                if cuando > datetime.now() + timedelta(minutes=5):
                    descartadas += 1
                    continue

                nuevas += db.guardar_marca(sn, dia, parte)

    if descartadas:
        log.warning(
            "sincronizar_marcas: %s marcas venían con fecha futura y se "
            "descartaron. Revisa el timeZone de la cuenta de yunatt: en "
            "Company Information debe decir America/Lima.", descartadas)

    return {"ok": True, "filas": len(filas), "nuevas": nuevas,
            "descartadas": descartadas}
