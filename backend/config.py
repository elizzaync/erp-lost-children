# -*- coding: utf-8 -*-
"""
config.py — configuración del backend del Módulo RRHH.

Lee backend/.env (no versionado). Parser simple CLAVE=valor, sin
dependencias externas. Prioridad: variable de entorno del sistema > .env.

Aquí vive también la restricción de rango de staffNumber que protege al ERP
anterior mientras ambos sistemas convivan.
"""
import os

RAIZ_BACKEND = os.path.dirname(os.path.abspath(__file__))
RAIZ_PROYECTO = os.path.dirname(RAIZ_BACKEND)
_ENV_PATH = os.path.join(RAIZ_BACKEND, ".env")

_cache = None


def _cargar():
    global _cache
    if _cache is not None:
        return _cache
    _cache = {}
    try:
        with open(_ENV_PATH, "r", encoding="utf-8") as fh:
            for linea in fh:
                linea = linea.strip()
                if not linea or linea.startswith("#") or "=" not in linea:
                    continue
                clave, _, valor = linea.partition("=")
                _cache[clave.strip()] = valor.strip().strip('"').strip("'")
    except FileNotFoundError:
        pass
    return _cache


def env(clave, default=""):
    """Devuelve la variable: entorno del sistema > backend/.env > default."""
    return os.environ.get(clave) or _cargar().get(clave) or default


# ══════════════════════════════════════════════════════════════════════════
#  RANGO DE staffNumber RESERVADO — RESTRICCIÓN DE TRANSICIÓN
# ══════════════════════════════════════════════════════════════════════════
#
#  Mientras el ERP anterior (ERP_Lost_Children) siga en producción, ambos
#  sistemas comparten la MISMA cuenta de yunatt.com. El ERP anterior usa
#  staffNumber = personas.id de su MySQL, que arranca en 1 y crece hacia
#  arriba conforme registra gente.
#
#  Este sistema solo puede tocar staffNumber >= STAFF_NUMBER_BASE. Así
#  jamás pisa una identidad del ERP anterior ni le corrompe la asistencia:
#  si ambos sistemas usaran el mismo número, el ERP viejo atribuiría las
#  marcas del equipo a la persona equivocada.
#
#  ─────────────────────────────────────────────────────────────────────
#  PARA QUITAR LA RESTRICCIÓN, el día que apagues el ERP anterior y
#  confirmes la migración completa:
#
#      STAFF_NUMBER_BASE = 1
#      RANGO_ESTRICTO    = False
#
#  No hay ningún otro lugar del código que haga esta validación. Todo el
#  backend pasa por validar_rango() antes de escribir hacia yunatt.
#  ─────────────────────────────────────────────────────────────────────
#
# ══════════════════════════════════════════════════════════════════════════
STAFF_NUMBER_BASE = 9000
RANGO_ESTRICTO = True


class RangoReservadoError(Exception):
    """Se intentó operar sobre un staffNumber fuera del rango reservado."""


def validar_rango(staff_number):
    """
    Red de seguridad de la transición. TODA operación de escritura hacia
    yunatt (alta de staff, comando de enrolamiento, borrado) pasa por aquí.

    Aunque un bug calculara mal un id, la petición nunca sale hacia la
    cuenta compartida si cae fuera del rango. Falla ruidosamente a
    propósito: es preferible un error visible a corromper en silencio la
    asistencia de producción.
    """
    if not RANGO_ESTRICTO:
        return int(staff_number)
    try:
        sn = int(staff_number)
    except (TypeError, ValueError):
        raise RangoReservadoError(
            f"staffNumber inválido: {staff_number!r} — se esperaba un número"
        )
    if sn < STAFF_NUMBER_BASE:
        raise RangoReservadoError(
            f"staffNumber {sn} está fuera del rango reservado "
            f"(>= {STAFF_NUMBER_BASE}). Pertenece al ERP anterior y este "
            f"sistema no puede tocarlo mientras RANGO_ESTRICTO esté activo."
        )
    return sn


def en_rango(staff_number):
    """Versión no lanzante de validar_rango, para filtrar listas."""
    if not RANGO_ESTRICTO:
        return True
    try:
        return int(staff_number) >= STAFF_NUMBER_BASE
    except (TypeError, ValueError):
        return False


# ── Solicitudes: vacaciones, permisos y licencias ─────────────────────────
#
# Reglas acordadas con la organización. Están aquí, con nombre, para que
# cambiarlas sea una línea y no una búsqueda por todo el backend.

# Más de estos días CORRIDOS exige, además del jefe directo, el visto bueno
# de Administración. Con un equipo de ~20 personas, hasta una semana lo
# absorbe el área; pasada la semana hay que reorganizar turnos de casa
# hogar y eso ya no es decisión de una sola jefatura.
DIAS_VISTO_BUENO_ADMIN = 7

# Días de vacaciones que genera cada año cumplido de servicio.
DIAS_VACACIONES_POR_ANIO = 30

# Tope de acumulación: dos años. Al llegar aquí se DEJA DE GENERAR; los
# días ya generados NUNCA se pierden ni caducan en una fecha de corte.
#
# OJO al implementarlo: el tope se aplica a la GENERACIÓN, recorriendo los
# aniversarios en orden, no al saldo final. Toparlo al final estaría mal —
# alguien con 5 años y 0 usados daría min(60, 150) = 60, y al tomar 10 días
# seguiría dando 60, con lo que podría tomar vacaciones indefinidamente.
TOPE_VACACIONES = 60

# Cuando falten estos días o menos para el tope, la interfaz avisa: estar
# en el tope significa que la organización no está dando vacaciones.
AVISO_CERCA_DEL_TOPE = 5

# Solo este régimen genera vacaciones. Honorarios y voluntarios no.
REGIMEN_CON_VACACIONES = "planilla"


# ══════════════════════════════════════════════════════════════════════════
#  IDENTIDAD Y PERMISOS
# ══════════════════════════════════════════════════════════════════════════
#
#  Hasta ahora el login era decorativo: comprobaba que los campos no
#  estuvieran vacíos y entraba. Los 48 endpoints estaban abiertos.
#
#  ─────────────────────────────────────────────────────────────────────
#  EL CORTE: poner LOGIN_ESTRICTO = True el día que TODOS tengan cuenta.
#
#  NO hacerlo antes de que el sistema esté servido por HTTPS: en cuanto
#  el login verifique de verdad, las contraseñas viajan por la red, y sin
#  HTTPS lo harían en claro.
#
#      False → quien no tenga cuenta entra como antes, con permisos
#              completos. Quien sí la tenga entra con la suya y ya se le
#              aplican sus permisos. Nadie se queda fuera.
#      True  → sin cuenta no se entra.
#  ─────────────────────────────────────────────────────────────────────
#  Se puede fijar también por variable de entorno (LOGIN_ESTRICTO=1), que
#  es como conviene hacer el corte en el servidor: sin editar código.
#
#  OJO con lo que implica el modo convivencia: quien NO trae sesión pasa
#  con permisos completos. Es decir, cerrar sesión da MÁS acceso que estar
#  dentro con un rol limitado. Durante la convivencia los permisos son un
#  ensayo, no una barrera — y no pueden serlo de todas formas mientras no
#  haya HTTPS, porque las contraseñas viajarían en claro. La barrera
#  empieza a existir el día del corte.
# Por defecto 1, no 0. Con 0, quien no tiene sesión ATRAVIESA el
# decorador que protege los endpoints —también los de escritura, y sin
# comprobar el token CSRF—. Que eso sea lo que pasa cuando nadie configura
# nada convierte un olvido en una puerta abierta: `.dockerignore` deja
# fuera backend/.env, así que el contenedor nunca vio el 1 de aquí.
# Quien quiera de verdad el modo sin login, que lo pida a mano.
LOGIN_ESTRICTO = env("LOGIN_ESTRICTO", "1").strip().lower() in ("1", "true", "si", "sí")

# Sesión. Pensada para celulares que se prestan y quedan desbloqueados,
# no para un PC de escritorio con un solo dueño.
SESION_HORAS = 8              # tope absoluto desde el ingreso
SESION_INACTIVIDAD_MIN = 45   # sin actividad, se cierra

# Bloqueo por intentos fallidos. Se cuenta por usuario Y por IP: sin lo
# segundo, probar 5 claves contra 100 usuarios distintos no costaría nada.
LOGIN_MAX_INTENTOS = 5
LOGIN_BLOQUEO_MIN = 15

# La cookie de sesión solo viaja por HTTPS cuando esto está activo. En
# local no hay HTTPS, así que se deja en False hasta el despliegue: con
# True, el navegador no mandaría la cookie y nadie podría entrar.
COOKIE_SECURE = env("COOKIE_SECURE", "0").strip().lower() in ("1", "true", "si", "sí")
COOKIE_NOMBRE = "rrhh_sesion"

# Coste del hash de contraseña. Va guardado dentro de cada hash, así que
# subirlo dentro de unos años no invalida las claves existentes.
PBKDF2_ITERACIONES = 240_000
CLAVE_MINIMA = 8

# ── Catálogo de módulos ───────────────────────────────────────────────────
#
# Fuente única. Si la matriz de permisos y las comprobaciones de los
# endpoints usaran listas distintas, se desincronizarían y quedaría un
# módulo sin proteger sin que nadie se diera cuenta.
#
# 'condiciones' va aparte de 'personal' porque contiene los SUELDOS, e
# 'incidencias' aparte de 'beneficiarios' porque es lo más sensible del
# sistema: quien ve la ficha de un niño no tiene por qué ver su historial
# de incidencias.
MODULOS = (
    ("dashboard",     "Dashboard",              "General"),
    ("personal",      "Personal / Directorio",  "Personal"),
    ("organigrama",   "Organigrama",            "Personal"),
    ("documentos",    "Documentos",             "Personal"),
    ("contratos",     "Contratos",              "Personal"),
    ("condiciones",   "Condiciones y sueldos",  "Personal"),
    ("asistencia",    "Asistencia",             "Operación"),
    ("permisos",      "Gestión de Permisos",    "Operación"),
    ("planillas",     "Planillas",              "Operación"),
    ("beneficiarios", "Beneficiarios",          "Beneficiarios"),
    ("responsables",  "Responsables / Tutores", "Beneficiarios"),
    ("sesiones",      "Sesiones de acompañamiento", "Beneficiarios"),
    ("incidencias",   "Incidencias",            "Beneficiarios"),
    ("capacitaciones", "Capacitaciones",        "Otros"),
    ("evaluaciones",  "Evaluación de Desempeño", "Otros"),
    ("reportes",      "Reportes",               "General"),
    ("configuracion", "Configuración",          "Sistema"),
    ("usuarios",      "Usuarios y permisos",    "Sistema"),
)

CLAVES_MODULO = tuple(m[0] for m in MODULOS)

# ninguno < vista < edicion. El orden importa: 'edicion' incluye 'vista'.
NIVELES = ("ninguno", "vista", "edicion")


def nivel_alcanza(nivel_que_tiene, nivel_requerido):
    """¿'edicion' cubre lo que pide 'vista'? Sí. Al revés, no."""
    try:
        return NIVELES.index(nivel_que_tiene) >= NIVELES.index(nivel_requerido)
    except ValueError:
        return False


# Roles que el sistema necesita para funcionar y no se pueden borrar.
ROL_DIRECTOR = "director"
ROL_RRHH = "rrhh"

# Solo un Director puede crear o modificar a otro Director. RRHH puede
# gestionar todo lo demás pero no puede otorgar ese rol —ni a nadie ni a
# sí mismo—, o el límite no serviría de nada.
ROLES_SISTEMA = (ROL_DIRECTOR, ROL_RRHH)


# ── yunatt ────────────────────────────────────────────────────────────────
YUNATT_BASE = "https://global.yunatt.com"

YUNATT_EMAIL = env("YUNATT_EMAIL")
YUNATT_PASSWORD = env("YUNATT_PASSWORD")

# ══════════════════════════════════════════════════════════════════════════
#  UN SOLO DISPOSITIVO  —  PENDIENTE PARA CUANDO SE AÑADA EL SEGUNDO
# ══════════════════════════════════════════════════════════════════════════
#  Todo el sistema asume que la cuenta de yunatt tiene UN único terminal.
#  Está previsto añadir un segundo. Lo que habrá que tocar:
#
#    config.py            DEVICE_ID y SOPORTA_HUELLA pasan a ser una lista
#                         o una tabla de dispositivos
#    yunatt_client.py      staff_en_dispositivo(), estado_en_dispositivo(),
#                         comando_enrolar(), alta_staff() y
#                         borrar_del_dispositivo() fijan attenceMachineId
#                         con este valor -> tendrán que recibirlo por
#                         parámetro
#    enrolamiento.py      hay que elegir EN QUÉ equipo se enrola, y el
#                         estado base se toma de ese equipo
#    db.py                la tabla 'marcas' no guarda de qué equipo vino
#                         cada marca; añadir columna dispositivo
#    interfaz             selector de terminal en el formulario de alta
#
#  El ERP anterior tiene un documento de diseño para esto en
#  docs/FASE2_MultiTimmy_e_Instalacion.md por si sirve de referencia.
# ══════════════════════════════════════════════════════════════════════════
DEVICE_ID = env("YUNATT_DEVICE_ID")
DEPT_ID = env("YUNATT_DEPT_ID")
DEPT_NAME = env("YUNATT_DEPT_NAME", "RRHH-Nuevo")

PUERTO = int(env("PUERTO", "7801"))

# Configurable por entorno para poder levantar el sistema contra una COPIA
# de la base y probar la interfaz sin tocar los datos reales. Sin la
# variable apunta a la de siempre.
DB_PATH = env("DB_PATH", "") or os.path.join(RAIZ_PROYECTO, "data", "rrhh.db")

# ── Canal web de marcación facial ─────────────────────────────────────────
#
# Segundo canal, además del terminal Timmy. El trabajador marca desde su
# celular cuando no puede pasar por el equipo: corte de luz, está en otra
# sede, el terminal no responde.
#
# DÓNDE PASA CADA COSA
#
#   navegador   captura la imagen y calcula el descriptor. La FOTO NO SALE
#               DEL TELÉFONO: se descarta ahí mismo.
#   servidor    recibe el descriptor —un vector, no una cara— y decide si
#               coincide con el de referencia.
#
# La comparación se hace en el SERVIDOR a propósito. Si la decidiera el
# navegador, bastaría con que alguien mandara {"coincide": true} desde la
# consola para marcar por otra persona: el servidor no tendría forma de
# comprobarlo. Mandar el descriptor en vez de la foto conserva la privacidad
# —de un vector no se reconstruye un rostro— y deja la decisión donde se
# puede confiar en ella.

# MODELO ELEGIDO: face-api.js (MIT, descriptor de 128 valores, 99.38 % en LFW).
# Se descartó InsightFace —más preciso— porque sus pesos preentrenados son solo
# para investigación no comercial, y Human porque no documenta la licencia de
# sus modelos, cabo suelto que no conviene en biometría del personal.
#
# Distancia euclídea máxima para dar por bueno un rostro. 0.6 es el umbral que
# usa face-api sobre sus 128 dimensiones: por debajo hay falsos rechazos
# molestos, por encima empiezan los falsos positivos.
#
# OJO al cambiar de modelo: ArcFace y compañía comparan por similitud coseno,
# donde MAYOR es mejor. No es solo otro número, es otra métrica.
ROSTRO_WEB_UMBRAL = float(env("ROSTRO_WEB_UMBRAL", "0.6"))

# Longitud esperada del vector. Si llega otra, el modelo del navegador no es
# el que generó la referencia y compararlos no significa nada.
ROSTRO_WEB_DIMENSION = int(env("ROSTRO_WEB_DIMENSION", "128"))

# Minutos mínimos entre dos marcas web de la misma persona. Sin esto, un
# doble toque en el botón deja dos marcas seguidas.
ROSTRO_WEB_MINUTOS_ENTRE_MARCAS = 2

CANALES_MARCA = ("terminal", "web")

# El texto del consentimiento, versionado.
#
# La versión importa: cada aceptación guarda una copia del texto que la
# persona leyó. Si este texto se cambia, hay que subir la versión, y quienes
# aceptaron la anterior tienen que volver a aceptar — no se les puede dar por
# consentida una redacción que nunca vieron.
CONSENTIMIENTO_ROSTRO_VERSION = "v2-2026-08"
CONSENTIMIENTO_ROSTRO_TEXTO = """\
Para poder marcar tu asistencia desde el celular, el sistema necesita
registrar una referencia de tu rostro.

Qué se guarda
  · Un código numérico calculado a partir de tu rostro. No es una fotografía
    y no se puede reconstruir tu cara a partir de él. Es lo que permite
    comprobar que eres tú quien marca.
  · La foto de cada marca. Cada vez que marques se guarda la foto de ese
    momento, junto con la fecha, la hora, tus coordenadas y desde qué canal
    marcaste. Es la constancia de quién fichó.

Qué NO se guarda
  · La foto con la que registras tu rostro. Esa se procesa en tu propio
    teléfono, se convierte en el código numérico y se descarta ahí mismo:
    esa imagen no llega al servidor.

Para qué se usa
  · Únicamente para confirmar tu identidad al marcar asistencia y para dejar
    constancia del fichaje. No se usa para vigilancia, no se analiza tu cara
    para ninguna otra cosa, y no se comparte con terceros.

Dónde se guarda
  · En el servidor de la organización. No se manda a ningún servicio de
    fuera, y el reconocimiento se calcula en tu propio teléfono.

Tus derechos
  · Puedes retirar este permiso cuando quieras. Al hacerlo se elimina la
    referencia de tu rostro y dejas de poder marcar por el celular; seguirás
    marcando en el terminal con normalidad.
  · Puedes pedir a RRHH que te muestre, corrija o elimine estos datos,
    incluidas las fotos de tus marcas.

Marcar por el celular es una alternativa, no una obligación: el terminal
biométrico sigue funcionando igual.
"""

# ── Archivos adjuntos ─────────────────────────────────────────────────────
#
# El sistema NO genera documentos ni contratos: guarda el archivo que la
# organización ya tiene (el escaneado, el Word firmado). Se almacenan en
# disco, no dentro de SQLite: un PDF de varios MB por fila haría la base
# lenta de copiar y de respaldar, y aquí los respaldos se hacen copiando
# el .db a mano.
# ── Dónde viven los archivos de datos ────────────────────────────────────
#
# Cuelgan del directorio de la BASE, no del proyecto. Suena a detalle y no
# lo es: las pruebas apuntan DB_PATH a una copia temporal, y con las
# carpetas clavadas al proyecto cada prueba de marcar dejaba su fotografía
# en la carpeta real del equipo. Así, una copia de la base se lleva sus
# archivos y no toca los de nadie.
#
# En una instalación normal DB_PATH es data/rrhh.db, así que esto da
# exactamente el mismo sitio de siempre.
_DATOS = os.path.dirname(os.path.abspath(DB_PATH))

ARCHIVOS_DIR = os.path.join(_DATOS, "archivos")

# Las fotos de personas van aparte de los adjuntos. Son de otra naturaleza
# —dato personal de la persona, no papeleo— y separarlas permite respaldar
# o restringir unas sin las otras.
FOTOS_DIR = os.path.join(_DATOS, "fotos")

# Las firmas dibujadas, aparte de las fotos. Son de otra naturaleza: una
# foto identifica, una firma autoriza, y quien pueda ver una cara no tiene
# por qué poder copiar un trazo que aparece en documentos aprobados.
FIRMAS_DIR = os.path.join(_DATOS, "firmas")

# Las fotos de cada marca por celular. Aparte de las fotos de ficha: son
# muchas, se acumulan por día y no significan lo mismo —una identifica a
# la persona, la otra deja constancia de un momento—.
MARCAS_DIR = os.path.join(_DATOS, "marcas")

# Hasta cuántos metros de la sede se puede marcar. Es solo el valor por
# defecto: el de verdad se configura en Parámetros, junto a las
# coordenadas. Mientras no haya coordenadas puestas NO se rechaza a nadie
# —ver el endpoint—, porque dejar al equipo sin marcar por un dato que
# falta sería peor que la trampa que se intenta evitar.
RADIO_MARCA_M = int(env("RADIO_MARCA_M", "150") or 150)

# ── El formulario público de tutores ─────────────────────────────────────
# La dirección prerrellenada que da Google, con la palabra de plantilla
# donde va el código de cada familia. No se arma a mano: el número de campo
# (entry.NNN) lo asigna Google y cambia si se rehace la pregunta.
FORM_URL_PRELLENADO = env("FORM_URL_PRELLENADO", "")
FORM_MARCA_TOKEN = env("FORM_MARCA_TOKEN", "PLANTILLA")
# La hoja donde Google deja las respuestas. De aquí las leerá el paso 3.
FORM_HOJA_ID = env("FORM_HOJA_ID", "")
# Cuánto vale un enlace entregado. Ver invitaciones.py.
FORM_DIAS_VIGENCIA = int(env("FORM_DIAS_VIGENCIA", "30") or 30)

# La llave de la cuenta de servicio que lee la hoja. Aquí solo va la
# ruta: el archivo vive fuera del repositorio (ver .gitignore).
# Cada cuánto mira el sistema la hoja por su cuenta, en minutos. En 0 se
# desactiva y solo se trae con el botón. Ver sondeo_formulario.py.
FORM_MINUTOS_SONDEO = int(env("FORM_MINUTOS_SONDEO", "10") or 0)

FORM_CREDENCIAL = env("FORM_CREDENCIAL", "")
if FORM_CREDENCIAL and not os.path.isabs(FORM_CREDENCIAL):
    FORM_CREDENCIAL = os.path.join(RAIZ_PROYECTO, FORM_CREDENCIAL)


def credencial_lista():
    """¿Está la llave donde dice la configuración?"""
    return bool(FORM_CREDENCIAL) and os.path.isfile(FORM_CREDENCIAL)

# 15 MB. Un escaneo de DNI o un contrato firmado no llega ni de lejos;
# el tope está para que un error no llene el disco.
ARCHIVO_MAX_BYTES = 15 * 1024 * 1024

# Lista blanca. Se valida por extensión Y por tipo declarado: aceptar
# cualquier cosa en una carpeta servida por el mismo proceso es pedirle
# problemas al sistema.
ARCHIVO_EXTENSIONES = {
    ".pdf":  "application/pdf",
    ".doc":  "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".odt":  "application/vnd.oasis.opendocument.text",
    ".jpg":  "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png":  "image/png",
    ".webp": "image/webp",
}


def configurado():
    """
    ¿Hay lo mínimo para hablar con yunatt? La interfaz usa esto para avisar
    en pantalla en vez de fallar con un error críptico a mitad del flujo.

    YUNATT_DEPT_ID NO se exige: el id numérico del departamento no está
    visible en el panel de yunatt, así que el backend lo resuelve solo
    buscando por YUNATT_DEPT_NAME (ver yunatt_client.resolver_departamento).
    Rellenarlo en el .env sigue valiendo como anulación manual.
    """
    faltan = [
        nombre
        for nombre, valor in (
            ("YUNATT_EMAIL", YUNATT_EMAIL),
            ("YUNATT_PASSWORD", YUNATT_PASSWORD),
            ("YUNATT_DEVICE_ID", DEVICE_ID),
            ("YUNATT_DEPT_NAME", DEPT_NAME),
        )
        if not valor
    ]
    return (len(faltan) == 0), faltan


# ── Códigos de biometría del TM-AI03F ─────────────────────────────────────
# El campo 'adduserbackups' del comando remoteadduser selecciona qué modo
# de registro abre el dispositivo, y 'backupnums' de queryStaff reporta qué
# tiene registrado cada usuario:
#     50    → rostro (AI face)
#     0..9  → huella dactilar (una por dedo)
#     10    → PIN
#     11    → tarjeta IC
BACKUP_ROSTRO = "50"
BACKUP_HUELLA = "0"

# ══════════════════════════════════════════════════════════════════════════
#  ¿EL TERMINAL TIENE LECTOR DE HUELLA?  —  SÍ LO TIENE
# ══════════════════════════════════════════════════════════════════════════
#  El TM-AI03F instalado SÍ lee huellas. Queda anotado porque en su momento
#  se concluyó lo contrario y se llegó a desactivar la opción:
#
#    - Se vio que en todo el equipo solo existían los códigos 10 (PIN) y 50
#      (rostro), y que el ERP anterior documenta "El TM-AI03F es face-only".
#    - Pero eso era ausencia de evidencia, no evidencia de ausencia: nadie
#      había completado nunca un enrolamiento de huella.
#    - Lo que lo zanjó: el enrolamiento 9001 quedó con backupnums=[0], es
#      decir SOLO huella y sin rostro, y esa persona marcó asistencia. Para
#      generar esa marca el equipo tuvo que leer una huella.
#
#  Ponerlo en False (o SOPORTA_HUELLA=0 en el .env) desactiva "Huella" y
#  "Ambos" en la interfaz y el backend los rechaza. Útil si se instala un
#  terminal sin lector.
#
#  ── SEGUNDO DISPOSITIVO ────────────────────────────────────────────────
#  Esto es un valor único para toda la cuenta. Cuando haya más de un
#  equipo, la capacidad pasa a ser POR DISPOSITIVO: uno puede tener lector
#  y otro no. Habrá que moverlo a la tabla de dispositivos.
# ══════════════════════════════════════════════════════════════════════════
SOPORTA_HUELLA = env("SOPORTA_HUELLA", "1").strip().lower() not in ("0", "false", "no")


def metodos_disponibles():
    """Métodos que este terminal puede ejecutar de verdad."""
    if SOPORTA_HUELLA:
        return ["facial", "huella", "ambos"]
    return ["facial"]


def tiene_rostro(backupnums):
    return 50 in (backupnums or [])


def tiene_huella(backupnums):
    return any(0 <= n <= 9 for n in (backupnums or []))
