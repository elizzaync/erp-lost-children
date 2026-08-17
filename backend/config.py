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
LOGIN_ESTRICTO = env("LOGIN_ESTRICTO", "0").strip().lower() in ("1", "true", "si", "sí")

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
    ("planillas",     "Planillas",              "Operación"),
    ("solicitudes",   "Bandeja de Solicitudes", "Operación"),
    ("beneficiarios", "Beneficiarios",          "Beneficiarios"),
    ("sesiones",      "Sesiones de acompañamiento", "Beneficiarios"),
    ("incidencias",   "Incidencias",            "Beneficiarios"),
    ("voluntarios",   "Voluntarios",            "Otros"),
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

# ── Archivos adjuntos ─────────────────────────────────────────────────────
#
# El sistema NO genera documentos ni contratos: guarda el archivo que la
# organización ya tiene (el escaneado, el Word firmado). Se almacenan en
# disco, no dentro de SQLite: un PDF de varios MB por fila haría la base
# lenta de copiar y de respaldar, y aquí los respaldos se hacen copiando
# el .db a mano.
ARCHIVOS_DIR = os.path.join(RAIZ_PROYECTO, "data", "archivos")

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
