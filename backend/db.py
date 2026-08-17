# -*- coding: utf-8 -*-
"""
db.py — almacenamiento local en SQLite.

Deliberadamente independiente: este sistema no comparte base de datos con
el ERP anterior ni con nada más. Un archivo en data/rrhh.db, creado solo al
arrancar. sqlite3 viene en la librería estándar, no hay servidor que
instalar.

MODELO

    personal ──┐
               ├──► identidades ──► marcas
  beneficiarios┘   (staffNumber,     (fecha, hora)
                    biométricos)

'personal' y 'beneficiarios' son entidades separadas: un colaborador tiene
cargo, área y contrato; un niño tiene casa, sala y grado. No comparten
campos y forzarlos a una sola tabla con un campo 'tipo' llenaría cada fila
de columnas vacías.

Lo que SÍ es idéntico para ambos es marcar en el terminal, así que eso vive
una sola vez en 'identidades': el staffNumber, el estado biométrico y las
marcas. Las marcas apuntan a la identidad, NO a la persona, y por eso el
enrolamiento y la sincronización funcionan igual sin saber quién hay
detrás.

Por qué dos claves anulables y no un par (tipo, titular_id): con el patrón
polimórfico SQLite no puede validar nada — 'titular_id' no admite clave
foránea y un 'tipo' mal escrito pasa desapercibido hasta que hay datos
corruptos. Así, en cambio, el motor valida ambas FK, el CHECK garantiza
exactamente un titular y los UNIQUE impiden identidades duplicadas.
"""
import json
import os
from datetime import date as _date
import sqlite3
import threading

import config

_lock = threading.Lock()

ESQUEMA = """
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS personal (
    id            INTEGER PRIMARY KEY,
    nombre        TEXT NOT NULL,
    documento     TEXT DEFAULT '',
    cargo         TEXT DEFAULT '',
    area          TEXT DEFAULT '',
    sede          TEXT DEFAULT '',
    ambito        TEXT DEFAULT 'min',      -- 'adm' | 'min': pestaña de Asistencia
    vinculo       TEXT DEFAULT 'staff',    -- 'staff' | 'voluntario'
    contrato      TEXT DEFAULT '',
    fecha_ingreso TEXT DEFAULT '',
    fecha_nac     TEXT DEFAULT '',
    jefe_id       INTEGER REFERENCES personal(id) ON DELETE SET NULL,
    nivel         INTEGER DEFAULT 0,       -- profundidad en el organigrama
    estado        TEXT DEFAULT 'activo',
    -- Datos de contacto. El de emergencia es obligatorio en la práctica
    -- para quien trabaja con menores, aunque el esquema no lo fuerce:
    -- muchas fichas vienen migradas y quedarían bloqueadas.
    email              TEXT DEFAULT '',
    telefono           TEXT DEFAULT '',
    direccion          TEXT DEFAULT '',
    emergencia_nombre  TEXT DEFAULT '',
    emergencia_telefono TEXT DEFAULT ''
);

-- Niños, niñas y adolescentes acogidos.
--
-- DATOS SENSIBLES DE MENORES. Viven solo en este SQLite local y NUNCA se
-- envían a yunatt ni al terminal biométrico. Lo que hoy NO hay, y está
-- pendiente de decidir antes de cargar datos reales: cifrado del archivo,
-- control de acceso por rol (hay un solo login compartido) y registro de
-- quién consulta qué. Los respaldos son copias del .db sin cifrar.
--
-- Solo 'nombre' es obligatorio: un niño puede llegar de noche por
-- derivación sin que se sepa aún su lengua materna, y bloquear el alta
-- lleva a que se inventen datos. La ficha se marca como incompleta y dice
-- qué le falta.
CREATE TABLE IF NOT EXISTS beneficiarios (
    id            INTEGER PRIMARY KEY,
    nombre        TEXT NOT NULL,
    documento     TEXT DEFAULT '',
    fecha_nac     TEXT DEFAULT '',
    casa          TEXT DEFAULT '',
    sala          TEXT DEFAULT '',
    grado         TEXT DEFAULT '',
    anio_ingreso  TEXT DEFAULT '',
    estado        TEXT DEFAULT 'activo',

    -- Datos personales y de ingreso
    procedencia         TEXT DEFAULT '',
    lengua_materna      TEXT DEFAULT '',
    via_ingreso         TEXT DEFAULT '',
    expediente_judicial TEXT DEFAULT '',
    situacion_legal     TEXT DEFAULT '',
    referente_familiar  TEXT DEFAULT '',
    regimen_visitas     TEXT DEFAULT '',

    -- Educación ('grado' ya está arriba, no se duplica)
    institucion_educativa TEXT DEFAULT '',
    rendimiento           TEXT DEFAULT '',
    refuerzo_escolar      TEXT DEFAULT '',

    -- Salud
    seguro         TEXT DEFAULT '',
    alergias       TEXT DEFAULT '',
    control_medico TEXT DEFAULT '',
    tratamiento    TEXT DEFAULT '',

    -- Acompañamiento. Tutor y psicóloga son colaboradores que YA existen:
    -- clave foránea y no texto libre, o acabarían conviviendo "José Puma",
    -- "J. Puma" y "jose puma" como si fueran tres personas.
    tutor_id     INTEGER REFERENCES personal(id) ON DELETE SET NULL,
    psicologo_id INTEGER REFERENCES personal(id) ON DELETE SET NULL,
    plan_vida    TEXT DEFAULT ''
);

-- Capa compartida: lo único que personal y beneficiarios tienen en común.
CREATE TABLE IF NOT EXISTS identidades (
    staff_number    INTEGER PRIMARY KEY,   -- el ID en yunatt/terminal, >= 9000
    personal_id     INTEGER REFERENCES personal(id)      ON DELETE CASCADE,
    beneficiario_id INTEGER REFERENCES beneficiarios(id) ON DELETE CASCADE,
    metodo          TEXT DEFAULT 'facial',   -- facial | huella | ambos
    estado          TEXT DEFAULT 'pendiente',-- pendiente | esperando | enrolado | error
    tiene_rostro    INTEGER DEFAULT 0,
    tiene_huella    INTEGER DEFAULT 0,
    detalle         TEXT DEFAULT '',
    creado          TEXT DEFAULT (datetime('now','localtime')),
    CHECK ((personal_id IS NOT NULL) + (beneficiario_id IS NOT NULL) = 1),
    UNIQUE (personal_id),
    UNIQUE (beneficiario_id)
);

-- [UN SOLO DISPOSITIVO] no se guarda de qué terminal vino cada marca.
-- Al añadir el segundo equipo hará falta una columna 'dispositivo'.
CREATE TABLE IF NOT EXISTS marcas (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_number INTEGER NOT NULL REFERENCES identidades(staff_number) ON DELETE CASCADE,
    fecha        TEXT NOT NULL,
    hora         TEXT NOT NULL,
    metodo       TEXT DEFAULT 'facial',
    UNIQUE (staff_number, fecha, hora)
);

-- Documentos y contratos del personal. Una sola tabla con 'tipo' porque
-- comparten todos los campos (nombre, emisión, vencimiento, estado) y solo
-- cambia cómo se agrupan en la ficha.
CREATE TABLE IF NOT EXISTS documentos (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    personal_id INTEGER NOT NULL REFERENCES personal(id) ON DELETE CASCADE,
    tipo        TEXT NOT NULL DEFAULT 'documento',  -- documento | contrato
    nombre      TEXT NOT NULL,
    emitido     TEXT DEFAULT '',
    vence       TEXT DEFAULT '',
    nota        TEXT DEFAULT '',
    creado      TEXT DEFAULT (datetime('now','localtime')),
    -- El archivo real (PDF, Word, imagen escaneada). El sistema NO genera
    -- documentos: guarda el que la organización ya tiene. 'archivo' es el
    -- nombre interno con el que se guardó en disco (nunca el que subió el
    -- usuario, que va aparte y solo sirve para devolverlo al descargar).
    archivo        TEXT DEFAULT '',
    archivo_nombre TEXT DEFAULT '',
    archivo_mime   TEXT DEFAULT '',
    archivo_tam    INTEGER DEFAULT 0,
    CHECK (tipo IN ('documento','contrato'))
);
CREATE INDEX IF NOT EXISTS idx_documentos_persona ON documentos(personal_id, tipo);

-- Cuánto cobra cada persona. Con historial (vigente_desde/hasta) en vez de
-- un campo suelto en 'personal': si a alguien le suben el sueldo en marzo,
-- la boleta de febrero tiene que seguir mostrando el sueldo viejo. Un campo
-- único reescribiría el pasado cada vez que cambia una condición.
-- Solo una fila por persona puede tener vigente_hasta NULL (la vigente).
CREATE TABLE IF NOT EXISTS condiciones_laborales (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    personal_id   INTEGER NOT NULL REFERENCES personal(id) ON DELETE CASCADE,
    regimen       TEXT NOT NULL DEFAULT 'planilla',  -- planilla | honorarios | sin_pago
    sueldo_base   REAL NOT NULL DEFAULT 0,           -- soles, mensual
    jornada_horas REAL NOT NULL DEFAULT 8,
    vigente_desde TEXT NOT NULL,                     -- 'YYYY-MM-DD'
    vigente_hasta TEXT DEFAULT NULL,                 -- NULL = vigente hoy
    nota          TEXT DEFAULT '',
    creado        TEXT DEFAULT (datetime('now','localtime')),
    CHECK (regimen IN ('planilla','honorarios','sin_pago')),
    CHECK (sueldo_base >= 0),
    CHECK (jornada_horas > 0)
);
CREATE INDEX IF NOT EXISTS idx_cond_persona
    ON condiciones_laborales(personal_id, vigente_desde);

-- El resultado del mes. En 'borrador' los números se recalculan desde las
-- marcas cada vez que se consulta; al cerrar se congelan aquí para que una
-- marca sincronizada tarde no altere un mes ya pagado.
--
-- dias_incompletos y detalle son la regla de negocio hecha dato: el día con
-- entrada y sin salida CUENTA como presente (no se le quita el pago a nadie
-- por un olvido del marcador) pero queda registrado cuál fue, para poder
-- auditarlo después.
CREATE TABLE IF NOT EXISTS boletas (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    personal_id      INTEGER NOT NULL REFERENCES personal(id) ON DELETE CASCADE,
    periodo          TEXT NOT NULL,            -- 'YYYY-MM'
    regimen          TEXT NOT NULL DEFAULT 'planilla',
    sueldo_base      REAL NOT NULL DEFAULT 0,
    dias_habiles     INTEGER NOT NULL DEFAULT 0,
    dias_marcados    INTEGER NOT NULL DEFAULT 0,
    dias_incompletos INTEGER NOT NULL DEFAULT 0,
    horas            REAL NOT NULL DEFAULT 0,
    bruto            REAL NOT NULL DEFAULT 0,
    descuentos       REAL NOT NULL DEFAULT 0,
    neto             REAL NOT NULL DEFAULT 0,
    estado           TEXT NOT NULL DEFAULT 'borrador',  -- borrador|cerrada|pagada
    cerrada_el       TEXT DEFAULT '',
    detalle          TEXT DEFAULT '',          -- JSON con los días incompletos
    CHECK (estado IN ('borrador','cerrada','pagada')),
    -- El error más caro del módulo sería pagar dos veces el mismo mes.
    UNIQUE (personal_id, periodo)
);
CREATE INDEX IF NOT EXISTS idx_boletas_periodo ON boletas(periodo, estado);

-- Vacaciones, permisos y licencias. Dos niveles de aprobación: el jefe
-- directo siempre, y Administración además cuando pasa del umbral de días
-- corridos (config.DIAS_VISTO_BUENO_ADMIN).
--
-- Los DÍAS NO SE GUARDAN: se derivan de desde/hasta. Guardarlos crearía una
-- segunda verdad que se desincroniza en cuanto alguien corrige una fecha,
-- el mismo error que evitamos con el estado de los documentos.
--
-- 'jefe_id' y 'requiere_admin' SÍ se congelan al crear: si la persona
-- cambia de jefe o si mañana se cambia el umbral, una solicitud ya
-- tramitada debe seguir mostrando quién la aprobó y con qué regla.
--
-- No hay campo con_goce/sin_goce a propósito: hoy ninguna solicitud
-- descuenta del sueldo. Cuando se quieran distinguir licencias sin goce
-- será una columna nueva, no un rediseño.
CREATE TABLE IF NOT EXISTS solicitudes (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    personal_id    INTEGER NOT NULL REFERENCES personal(id) ON DELETE CASCADE,
    tipo           TEXT NOT NULL DEFAULT 'vacaciones', -- vacaciones|permiso|licencia
    desde          TEXT NOT NULL,          -- 'YYYY-MM-DD'
    hasta          TEXT NOT NULL,
    motivo         TEXT DEFAULT '',
    estado         TEXT NOT NULL DEFAULT 'pendiente',
        -- pendiente | pendiente_admin | aprobada | rechazada | cancelada
    requiere_admin INTEGER NOT NULL DEFAULT 0,
    jefe_id        INTEGER REFERENCES personal(id) ON DELETE SET NULL,
    aprob_jefe_el  TEXT DEFAULT '',
    aprob_admin_el TEXT DEFAULT '',
    resuelto_el    TEXT DEFAULT '',
    nota           TEXT DEFAULT '',        -- motivo del rechazo o comentario
    creado         TEXT DEFAULT (datetime('now','localtime')),
    CHECK (tipo IN ('vacaciones','permiso','licencia')),
    CHECK (estado IN ('pendiente','pendiente_admin','aprobada','rechazada','cancelada')),
    CHECK (hasta >= desde)
);
CREATE INDEX IF NOT EXISTS idx_solicitudes_persona ON solicitudes(personal_id, desde);
CREATE INDEX IF NOT EXISTS idx_solicitudes_estado  ON solicitudes(estado, desde);

-- Sesiones de acompañamiento de un beneficiario.
--
-- DATOS SENSIBLES DE MENORES: ver la nota de la tabla 'beneficiarios'.
-- Las notas de una sesión pueden contener información de salud mental y
-- de situación familiar, y hoy NO hay control de acceso por rol.
--
-- Al borrar la ficha del niño se van con ella (CASCADE). Si quien la hizo
-- deja la ONG, la sesión SE CONSERVA y queda sin responsable asignado:
-- borrar el registro de un acompañamiento porque alguien renunció sería
-- perder historia del menor.
CREATE TABLE IF NOT EXISTS sesiones_acompanamiento (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    beneficiario_id INTEGER NOT NULL REFERENCES beneficiarios(id) ON DELETE CASCADE,
    fecha           TEXT NOT NULL,          -- 'YYYY-MM-DD'
    realizada_por   INTEGER REFERENCES personal(id) ON DELETE SET NULL,
    tipo            TEXT NOT NULL DEFAULT 'individual',
    notas           TEXT DEFAULT '',
    creado          TEXT DEFAULT (datetime('now','localtime')),
    CHECK (tipo IN ('individual','grupal','familiar','escolar','otra'))
);
CREATE INDEX IF NOT EXISTS idx_sesiones_benef
    ON sesiones_acompanamiento(beneficiario_id, fecha);

-- Incidencias de un beneficiario.
--
-- LA TABLA MÁS SENSIBLE DEL SISTEMA. Registra hechos sobre un menor que
-- pueden acabar en un informe al juzgado. Hoy CUALQUIERA que entre al
-- sistema puede leerlas y escribirlas: hay un solo login compartido, sin
-- roles y sin registro de quién consulta qué. Se construyó asumiendo ese
-- riesgo de forma consciente y queda pendiente resolverlo (ver LEEME,
-- sección de protección).
CREATE TABLE IF NOT EXISTS incidencias (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    beneficiario_id INTEGER NOT NULL REFERENCES beneficiarios(id) ON DELETE CASCADE,
    fecha           TEXT NOT NULL,
    gravedad        TEXT NOT NULL DEFAULT 'leve',
    descripcion     TEXT NOT NULL,
    reportada_por   INTEGER REFERENCES personal(id) ON DELETE SET NULL,
    seguimiento     TEXT DEFAULT '',
    creado          TEXT DEFAULT (datetime('now','localtime')),
    CHECK (gravedad IN ('leve','moderada','grave'))
);
CREATE INDEX IF NOT EXISTS idx_incidencias_benef
    ON incidencias(beneficiario_id, fecha);

-- ══════════════════════════════════════════════════════════════════════
--  IDENTIDAD Y PERMISOS
-- ══════════════════════════════════════════════════════════════════════

-- Cargos reutilizables. 'clave' es el nombre normalizado (minúsculas, sin
-- tildes ni espacios sobrantes) y es lo que lleva el UNIQUE: así
-- "Teen Leader", "teen leader" y " Teen  Leader " colapsan en el mismo
-- rol en vez de convivir como tres.
CREATE TABLE IF NOT EXISTS roles (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre      TEXT NOT NULL,
    clave       TEXT NOT NULL UNIQUE,
    descripcion TEXT DEFAULT '',
    es_sistema  INTEGER NOT NULL DEFAULT 0,   -- director y rrhh: no se borran
    creado      TEXT DEFAULT (datetime('now','localtime'))
);

-- Una cuenta por persona. NO duplica la ficha: el nombre, el cargo y el
-- área siguen viniendo de 'personal'. Esto es solo la capa de acceso,
-- igual que 'identidades' es solo la capa del terminal.
CREATE TABLE IF NOT EXISTS usuarios (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    personal_id   INTEGER NOT NULL UNIQUE REFERENCES personal(id) ON DELETE CASCADE,
    usuario       TEXT NOT NULL UNIQUE,       -- 'jramirez', sin correo
    clave_hash    TEXT NOT NULL,              -- algoritmo$iteraciones$salt$hash
    rol_id        INTEGER NOT NULL REFERENCES roles(id),
    estado        TEXT NOT NULL DEFAULT 'activo',
    debe_cambiar  INTEGER NOT NULL DEFAULT 1, -- clave provisional
    ultimo_acceso TEXT DEFAULT '',
    creado        TEXT DEFAULT (datetime('now','localtime')),
    CHECK (estado IN ('activo','suspendido'))
);

-- Los permisos viven en el ROL, no en el usuario: con ~20 personas y ~6
-- cargos, dos Teen Leaders deben tener lo mismo por construcción. Si algún
-- día hace falta una excepción individual, se añade 'permisos_usuario' con
-- esta misma forma y la resolución pasa a ser "excepción, si no el rol";
-- es una adición, no un rediseño.
CREATE TABLE IF NOT EXISTS permisos_rol (
    rol_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    modulo TEXT NOT NULL,
    nivel  TEXT NOT NULL DEFAULT 'ninguno',
    PRIMARY KEY (rol_id, modulo),
    CHECK (nivel IN ('ninguno','vista','edicion'))
);

-- Sesiones en tabla y no en cookie firmada: así se puede cerrar la sesión
-- de alguien desde el servidor (suspenderlo lo echa en el acto) y se ve
-- quién está conectado. Con cookie firmada habría que esperar a que
-- caduque sola.
CREATE TABLE IF NOT EXISTS sesiones_usuario (
    token      TEXT PRIMARY KEY,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    csrf       TEXT NOT NULL,
    ip         TEXT DEFAULT '',
    agente     TEXT DEFAULT '',
    creada     TEXT DEFAULT (datetime('now','localtime')),
    ultima     TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_sesiones_usuario ON sesiones_usuario(usuario_id);

-- Intentos fallidos, por usuario Y por IP. Solo por usuario, probar cinco
-- claves contra cien usuarios distintos no costaría nada.
-- NUNCA se guarda la contraseña probada, ni siquiera fallida.
CREATE TABLE IF NOT EXISTS intentos_login (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario  TEXT DEFAULT '',
    ip       TEXT DEFAULT '',
    cuando   TEXT DEFAULT (datetime('now','localtime')),
    exito    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_intentos ON intentos_login(usuario, ip, cuando);

-- Registro de accesos. Con identidad ya se puede saber QUIÉN abrió qué.
-- Es lo que permite auditar una consulta a incidencias.
CREATE TABLE IF NOT EXISTS accesos (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    usuario    TEXT DEFAULT '',      -- copia del nombre: sobrevive al borrado
    modulo     TEXT DEFAULT '',
    accion     TEXT DEFAULT '',      -- vista | edicion
    metodo     TEXT DEFAULT '',
    ruta       TEXT DEFAULT '',
    resultado  INTEGER DEFAULT 0,    -- código HTTP
    ip         TEXT DEFAULT '',
    cuando     TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_accesos_cuando ON accesos(cuando);
CREATE INDEX IF NOT EXISTS idx_accesos_modulo ON accesos(modulo, cuando);

-- Datos institucionales del sistema. Clave-valor porque son pocos, sueltos
-- y de naturaleza distinta entre sí; una tabla con una columna por dato
-- obligaría a migrar el esquema cada vez que se añada uno.
CREATE TABLE IF NOT EXISTS parametros (
    clave       TEXT PRIMARY KEY,
    valor       TEXT DEFAULT '',
    actualizado TEXT DEFAULT (datetime('now','localtime'))
);

-- Aplana la resolución del titular para que Asistencia y el enrolamiento
-- no tengan que ramificar según el tipo.
CREATE VIEW IF NOT EXISTS v_identidades AS
SELECT i.staff_number, i.metodo, i.estado, i.tiene_rostro, i.tiene_huella,
       i.detalle, i.creado, i.personal_id, i.beneficiario_id,
       CASE WHEN i.personal_id IS NOT NULL THEN 'personal' ELSE 'beneficiario' END AS tipo,
       COALESCE(p.nombre, b.nombre)       AS nombre,
       COALESCE(p.documento, b.documento) AS documento,
       CASE WHEN i.beneficiario_id IS NOT NULL THEN 'ninos'
            WHEN p.vinculo = 'voluntario'  THEN NULL     -- solo aparece en General
            ELSE p.ambito END              AS ambito,
       p.vinculo, p.cargo, p.area, p.sede,
       b.casa, b.sala, b.grado
  FROM identidades i
  LEFT JOIN personal      p ON p.id = i.personal_id
  LEFT JOIN beneficiarios b ON b.id = i.beneficiario_id;
"""


def _conectar():
    os.makedirs(os.path.dirname(config.DB_PATH), exist_ok=True)
    con = sqlite3.connect(config.DB_PATH, timeout=10)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    return con


def consultar(sql, params=()):
    with _lock, _conectar() as con:
        return [dict(f) for f in con.execute(sql, params).fetchall()]


def ejecutar(sql, params=()):
    with _lock, _conectar() as con:
        cur = con.execute(sql, params)
        con.commit()
        return cur.rowcount


def _tabla_existe(con, nombre):
    return con.execute(
        "SELECT 1 FROM sqlite_master WHERE type IN ('table','view') AND name = ?",
        (nombre,),
    ).fetchone() is not None


# Columnas añadidas después de que la tabla ya existiera en bases reales.
# 'CREATE TABLE IF NOT EXISTS' no toca una tabla que ya está, así que sin
# esto el esquema nuevo solo se aplicaría en instalaciones desde cero.
_COLUMNAS_NUEVAS = {
    "personal": {
        "email":               "TEXT DEFAULT ''",
        "telefono":            "TEXT DEFAULT ''",
        "direccion":           "TEXT DEFAULT ''",
        "emergencia_nombre":   "TEXT DEFAULT ''",
        "emergencia_telefono": "TEXT DEFAULT ''",
    },
    "documentos": {
        "archivo":        "TEXT DEFAULT ''",
        "archivo_nombre": "TEXT DEFAULT ''",
        "archivo_mime":   "TEXT DEFAULT ''",
        "archivo_tam":    "INTEGER DEFAULT 0",
    },
    # SQLite admite ADD COLUMN con REFERENCES siempre que el valor por
    # defecto sea NULL, que es el caso de tutor_id y psicologo_id.
    "beneficiarios": {
        "procedencia":           "TEXT DEFAULT ''",
        "lengua_materna":        "TEXT DEFAULT ''",
        "via_ingreso":           "TEXT DEFAULT ''",
        "expediente_judicial":   "TEXT DEFAULT ''",
        "situacion_legal":       "TEXT DEFAULT ''",
        "referente_familiar":    "TEXT DEFAULT ''",
        "regimen_visitas":       "TEXT DEFAULT ''",
        "institucion_educativa": "TEXT DEFAULT ''",
        "rendimiento":           "TEXT DEFAULT ''",
        "refuerzo_escolar":      "TEXT DEFAULT ''",
        "seguro":                "TEXT DEFAULT ''",
        "alergias":              "TEXT DEFAULT ''",
        "control_medico":        "TEXT DEFAULT ''",
        "tratamiento":           "TEXT DEFAULT ''",
        "tutor_id":              "INTEGER REFERENCES personal(id) ON DELETE SET NULL",
        "psicologo_id":          "INTEGER REFERENCES personal(id) ON DELETE SET NULL",
        "plan_vida":             "TEXT DEFAULT ''",
    },
}


def _asegurar_columnas(con):
    """Añade las columnas que falten, sin tocar los datos que ya hay."""
    for tabla, columnas in _COLUMNAS_NUEVAS.items():
        if not _tabla_existe(con, tabla):
            continue
        actuales = {f["name"] for f in con.execute(f"PRAGMA table_info({tabla})")}
        for nombre, definicion in columnas.items():
            if nombre not in actuales:
                con.execute(f"ALTER TABLE {tabla} ADD COLUMN {nombre} {definicion}")


def iniciar():
    with _lock, _conectar() as con:
        # 'marcas' existía antes apuntando a la tabla 'personas'. Si está la
        # versión vieja, se conserva su contenido para reconstruirla después
        # con la clave foránea hacia identidades.
        marcas_viejas = []
        if _tabla_existe(con, "marcas") and not _tabla_existe(con, "identidades"):
            marcas_viejas = [dict(f) for f in con.execute(
                "SELECT staff_number, fecha, hora, metodo FROM marcas")]
            con.execute("DROP TABLE marcas")

        con.executescript(ESQUEMA)
        _asegurar_columnas(con)
        _sembrar_personal(con)
        _migrar_personas(con)

        for m in marcas_viejas:
            # Solo las de identidades que existan: si una persona quedó fuera
            # de la migración, sus marcas no tienen a quién pertenecer.
            con.execute(
                """INSERT OR IGNORE INTO marcas (staff_number, fecha, hora, metodo)
                   SELECT ?, ?, ?, ? WHERE EXISTS
                   (SELECT 1 FROM identidades WHERE staff_number = ?)""",
                (m["staff_number"], m["fecha"], m["hora"], m["metodo"], m["staff_number"]),
            )
        con.commit()


def _sembrar_personal(con):
    """
    Carga las 20 personas de la maqueta como registros reales editables, una
    sola vez. Sin documento: lo completa el usuario al editar cada ficha.
    """
    if con.execute("SELECT COUNT(*) FROM personal").fetchone()[0]:
        return
    semilla = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                           "_semilla_personal.json")
    try:
        with open(semilla, "r", encoding="utf-8") as fh:
            gente = json.load(fh)
    except (FileNotFoundError, ValueError):
        return

    for g in gente:
        con.execute(
            """INSERT INTO personal
               (id, nombre, documento, cargo, area, sede, ambito, vinculo,
                contrato, fecha_ingreso, fecha_nac, jefe_id, nivel, estado)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'activo')""",
            (g.get("id"), g.get("n", ""), "", g.get("c", ""), g.get("area", ""),
             g.get("sede", ""), g.get("br") or "min", "staff", g.get("cont", ""),
             g.get("ing", ""), g.get("nac", ""), g.get("jefe"), g.get("d", 0)),
        )


# Cómo se traducen los roles del formulario viejo al modelo nuevo
_VINCULO_DE_ROL = {"vol": ("voluntario", "min"), "colab": ("staff", "min"),
                   "adm": ("staff", "adm"), "benef": ("staff", "min")}


def _migrar_personas(con):
    """
    Traslada la tabla 'personas' del modelo anterior (una sola entidad que
    mezclaba identidad y biometría) a personal + identidades, conservando
    staffNumber y estado biométrico. Se ejecuta una vez.
    """
    if not _tabla_existe(con, "personas"):
        return
    if con.execute("SELECT COUNT(*) FROM identidades").fetchone()[0]:
        return

    filas = [dict(f) for f in con.execute("SELECT * FROM personas ORDER BY staff_number")]
    for f in filas:
        vinculo, ambito = _VINCULO_DE_ROL.get(f.get("rol") or "colab", ("staff", "min"))
        cur = con.execute(
            """INSERT INTO personal
               (nombre, documento, cargo, area, sede, ambito, vinculo, estado)
               VALUES (?,?,?,?,?,?,?,'activo')""",
            (f["nombre"], f.get("documento") or "", "", "", "", ambito, vinculo),
        )
        con.execute(
            """INSERT INTO identidades
               (staff_number, personal_id, metodo, estado, tiene_rostro,
                tiene_huella, detalle)
               VALUES (?,?,?,?,?,?,?)""",
            (f["staff_number"], cur.lastrowid, f.get("metodo") or "facial",
             f.get("estado") or "pendiente", f.get("tiene_rostro") or 0,
             f.get("tiene_huella") or 0, f.get("detalle") or ""),
        )
    con.execute("ALTER TABLE personas RENAME TO personas_migrada")


# ── Documentos y contratos ────────────────────────────────────────────────

def documentos_de(personal_id, tipo=None):
    """
    Documentos o contratos de una persona, con el estado de vigencia
    calculado a partir de la fecha de vencimiento.
    """
    sql = "SELECT * FROM documentos WHERE personal_id = ?"
    params = [int(personal_id)]
    if tipo:
        sql += " AND tipo = ?"
        params.append(tipo)
    filas = consultar(sql + " ORDER BY vence, nombre", tuple(params))

    hoy = _date.today()
    for f in filas:
        f["estado"] = "sin_vencimiento"
        f["dias"] = None
        if f["vence"]:
            try:
                vence = _date.fromisoformat(f["vence"])
            except ValueError:
                continue
            f["dias"] = (vence - hoy).days
            f["estado"] = ("vencido" if f["dias"] < 0
                           else "por_vencer" if f["dias"] <= 30
                           else "vigente")
    return filas


def todos_documentos(tipo):
    """
    Todos los documentos (o contratos) de todas las personas, con el nombre
    de su titular. Es la misma tabla que lee la ficha: aquí solo se agrupa
    de otra forma, no se duplica nada.
    """
    filas = consultar(
        """SELECT d.*, p.nombre AS persona, p.cargo, p.area
             FROM documentos d
             JOIN personal p ON p.id = d.personal_id
            WHERE d.tipo = ?
            ORDER BY (d.vence = '') , d.vence""",
        (tipo,),
    )
    hoy = _date.today()
    for f in filas:
        f["estado"] = "sin_vencimiento"
        f["dias"] = None
        if f["vence"]:
            try:
                f["dias"] = (_date.fromisoformat(f["vence"]) - hoy).days
            except ValueError:
                continue
            f["estado"] = ("vencido" if f["dias"] < 0
                           else "por_vencer" if f["dias"] <= 30
                           else "vigente")
    return filas


def crear_documento(personal_id, tipo, nombre, emitido="", vence="", nota="",
                    adjunto=None):
    """
    'adjunto' son los metadatos que devuelve archivos.guardar(), o nada:
    registrar el vencimiento sin tener aún el papel escaneado es válido.
    """
    if tipo not in ("documento", "contrato"):
        raise ValueError(f"Tipo no reconocido: {tipo!r}")
    a = adjunto or {}
    with _lock, _conectar() as con:
        cur = con.execute(
            """INSERT INTO documentos
                   (personal_id, tipo, nombre, emitido, vence, nota,
                    archivo, archivo_nombre, archivo_mime, archivo_tam)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (int(personal_id), tipo, nombre, emitido or "", vence or "", nota or "",
             a.get("archivo", ""), a.get("archivo_nombre", ""),
             a.get("archivo_mime", ""), int(a.get("archivo_tam", 0) or 0)),
        )
        con.commit()
        return cur.lastrowid


def actualizar_archivo_documento(id_, adjunto):
    """Cambia solo los campos del adjunto; no toca nombre ni vencimiento."""
    a = adjunto or {}
    return ejecutar(
        """UPDATE documentos
              SET archivo = ?, archivo_nombre = ?, archivo_mime = ?, archivo_tam = ?
            WHERE id = ?""",
        (a.get("archivo", ""), a.get("archivo_nombre", ""),
         a.get("archivo_mime", ""), int(a.get("archivo_tam", 0) or 0), id_),
    )


def documento(id_):
    filas = consultar("SELECT * FROM documentos WHERE id = ?", (int(id_),))
    return filas[0] if filas else None


def actualizar_documento(id_, nombre=None, emitido=None, vence=None, nota=None):
    """
    Corrige un documento ya cargado. El estado NO se toca: se recalcula
    solo a partir de 'vence'. Poder forzarlo a mano vaciaría de sentido la
    alerta de vencimientos.
    """
    campos, valores = [], []
    for col, val in (("nombre", nombre), ("emitido", emitido),
                     ("vence", vence), ("nota", nota)):
        if val is not None:
            campos.append(f"{col} = ?")
            valores.append(val)
    if not campos:
        return 0
    valores.append(int(id_))
    return ejecutar(f"UPDATE documentos SET {', '.join(campos)} WHERE id = ?", tuple(valores))


def borrar_documento(id_):
    return ejecutar("DELETE FROM documentos WHERE id = ?", (int(id_),))


def resumen_vencimientos():
    """
    Cuántos documentos y contratos están vencidos o por vencer, para las
    alertas del Dashboard. Devuelve también a quién pertenece el más
    urgente, que es a donde debe llevar el enlace.
    """
    resumen = {}
    for tipo in ("documento", "contrato"):
        filas = [f for f in consultar(
            "SELECT * FROM documentos WHERE tipo = ? AND vence <> ''", (tipo,))]
        hoy = _date.today()
        criticos = []
        for f in filas:
            try:
                dias = (_date.fromisoformat(f["vence"]) - hoy).days
            except ValueError:
                continue
            if dias <= 30:
                criticos.append({**f, "dias": dias})
        criticos.sort(key=lambda x: x["dias"])
        resumen[tipo] = {
            "total": len(criticos),
            "persona_id": criticos[0]["personal_id"] if criticos else None,
            "nombre": criticos[0]["nombre"] if criticos else "",
        }
    return resumen


# ── Parámetros del sistema ────────────────────────────────────────────────

# Qué se puede guardar. Lista blanca a propósito: sin ella, cualquier clave
# que llegue por la API acabaría en la tabla.
CLAVES_PARAMETRO = ("organizacion", "fecha_fundacion", "ciudad",
                    "descuento_planilla", "descuento_honorarios",
                    # Quién da el visto bueno de Administración en las
                    # solicitudes largas. Es un personal_id, no un rol: no
                    # hay sistema de permisos y no vale la pena inventarlo.
                    "aprobador_admin")

# Placeholders hasta que un contador confirme las cifras reales. Se editan
# desde Configuración, no hace falta tocar código.
DESCUENTO_POR_DEFECTO = {"planilla": 12.0, "honorarios": 8.0, "sin_pago": 0.0}


def parametros():
    filas = consultar("SELECT clave, valor, actualizado FROM parametros")
    return {f["clave"]: f["valor"] for f in filas}


def parametro(clave, defecto=""):
    filas = consultar("SELECT valor FROM parametros WHERE clave = ?", (clave,))
    return filas[0]["valor"] if filas and filas[0]["valor"] else defecto


def guardar_parametro(clave, valor):
    if clave not in CLAVES_PARAMETRO:
        raise ValueError(f"Parámetro no reconocido: {clave!r}")
    return ejecutar(
        """INSERT INTO parametros (clave, valor, actualizado)
           VALUES (?, ?, datetime('now','localtime'))
           ON CONFLICT(clave) DO UPDATE
             SET valor = excluded.valor, actualizado = excluded.actualizado""",
        (clave, str(valor)),
    )


# ── Personal ──────────────────────────────────────────────────────────────

def personal(incluir_inactivos=False):
    donde = "" if incluir_inactivos else "WHERE p.estado = 'activo'"
    return consultar(
        f"""SELECT p.*, i.staff_number, i.estado AS estado_biometrico,
                   i.metodo, i.tiene_rostro, i.tiene_huella
              FROM personal p
              LEFT JOIN identidades i ON i.personal_id = p.id
              {donde}
             ORDER BY p.nivel, p.id"""
    )


def persona_personal(id_):
    filas = consultar(
        """SELECT p.*, i.staff_number, i.estado AS estado_biometrico,
                  i.metodo, i.tiene_rostro, i.tiene_huella
             FROM personal p
             LEFT JOIN identidades i ON i.personal_id = p.id
            WHERE p.id = ?""",
        (int(id_),),
    )
    return filas[0] if filas else None


CAMPOS_PERSONAL = ("nombre", "documento", "cargo", "area", "sede", "ambito",
                   "vinculo", "contrato", "fecha_ingreso", "fecha_nac",
                   "jefe_id", "estado",
                   "email", "telefono", "direccion",
                   "emergencia_nombre", "emergencia_telefono")


def crear_personal(datos):
    campos = [c for c in CAMPOS_PERSONAL if c in datos]
    marcas_ = ", ".join("?" for _ in campos)
    with _lock, _conectar() as con:
        cur = con.execute(
            f"INSERT INTO personal ({', '.join(campos)}) VALUES ({marcas_})",
            tuple(datos[c] for c in campos),
        )
        con.commit()
        return cur.lastrowid


def actualizar_personal(id_, datos):
    campos = [c for c in CAMPOS_PERSONAL if c in datos]
    if not campos:
        return 0
    asignaciones = ", ".join(f"{c} = ?" for c in campos)
    return ejecutar(
        f"UPDATE personal SET {asignaciones} WHERE id = ?",
        tuple(datos[c] for c in campos) + (int(id_),),
    )


def borrar_personal(id_):
    """Borra la ficha; identidad y marcas caen por cascada."""
    return ejecutar("DELETE FROM personal WHERE id = ?", (int(id_),))


# ── Beneficiarios ─────────────────────────────────────────────────────────

CAMPOS_BENEFICIARIO = ("nombre", "documento", "fecha_nac", "casa", "sala",
                       "grado", "anio_ingreso", "estado",
                       "procedencia", "lengua_materna", "via_ingreso",
                       "expediente_judicial", "situacion_legal",
                       "referente_familiar", "regimen_visitas",
                       "institucion_educativa", "rendimiento", "refuerzo_escolar",
                       "seguro", "alergias", "control_medico", "tratamiento",
                       "tutor_id", "psicologo_id", "plan_vida")

# Lo que hace falta para considerar la ficha completa. No bloquea el alta:
# solo sirve para decir qué falta, con el mismo criterio que "sin jefe
# asignado" o "sin condiciones laborales".
CAMPOS_FICHA_COMPLETA = (
    ("documento", "Documento"),
    ("fecha_nac", "Fecha de nacimiento"),
    ("casa", "Casa"),
    ("sala", "Sala"),
    ("grado", "Grado"),
    ("anio_ingreso", "Año de ingreso"),
    ("procedencia", "Procedencia"),
    ("via_ingreso", "Vía de ingreso"),
    ("situacion_legal", "Situación legal"),
    ("institucion_educativa", "Institución educativa"),
    ("seguro", "Seguro"),
    ("alergias", "Alergias"),
    ("tutor_id", "Tutor asignado"),
)


def faltantes_beneficiario(b):
    """Qué campos le faltan a una ficha para estar completa."""
    return [etiqueta for campo, etiqueta in CAMPOS_FICHA_COMPLETA
            if not str(b.get(campo) or "").strip()]


def beneficiarios(incluir_inactivos=False):
    donde = "" if incluir_inactivos else "WHERE b.estado = 'activo'"
    return consultar(
        f"""SELECT b.*, i.staff_number, i.estado AS estado_biometrico,
                   i.metodo, i.tiene_rostro, i.tiene_huella
              FROM beneficiarios b
              LEFT JOIN identidades i ON i.beneficiario_id = b.id
              {donde}
             ORDER BY b.nombre"""
    )


def beneficiario(id_):
    filas = consultar("SELECT * FROM beneficiarios WHERE id = ?", (id_,))
    return filas[0] if filas else None


def actualizar_beneficiario(id_, datos):
    """Actualiza solo los campos que llegan; el resto queda como estaba."""
    campos = [c for c in CAMPOS_BENEFICIARIO if c in datos]
    if not campos:
        return 0
    asignaciones = ", ".join(f"{c} = ?" for c in campos)
    return ejecutar(
        f"UPDATE beneficiarios SET {asignaciones} WHERE id = ?",
        tuple(datos[c] for c in campos) + (id_,),
    )


def borrar_beneficiario(id_):
    """
    Borra la ficha del niño. La cascada se lleva su identidad biométrica y
    sus marcas; quitarlo del terminal físico es responsabilidad de quien
    llama, igual que con el personal.
    """
    return ejecutar("DELETE FROM beneficiarios WHERE id = ?", (id_,))


def crear_beneficiario(datos):
    campos = [c for c in CAMPOS_BENEFICIARIO if c in datos]
    marcas_ = ", ".join("?" for _ in campos)
    with _lock, _conectar() as con:
        cur = con.execute(
            f"INSERT INTO beneficiarios ({', '.join(campos)}) VALUES ({marcas_})",
            tuple(datos[c] for c in campos),
        )
        con.commit()
        return cur.lastrowid


# ── Identidades biométricas ───────────────────────────────────────────────

def identidades():
    return consultar("SELECT * FROM v_identidades ORDER BY staff_number")


def identidad(staff_number):
    filas = consultar("SELECT * FROM v_identidades WHERE staff_number = ?",
                      (int(staff_number),))
    return filas[0] if filas else None


def identidad_de(tipo, titular_id):
    columna = "personal_id" if tipo == "personal" else "beneficiario_id"
    filas = consultar(f"SELECT * FROM v_identidades WHERE {columna} = ?",
                      (int(titular_id),))
    return filas[0] if filas else None


def crear_identidad(staff_number, tipo, titular_id, metodo):
    """
    Reserva el staffNumber para una persona que YA existe. El CHECK de la
    tabla garantiza que solo se rellene una de las dos claves.
    """
    sn = config.validar_rango(staff_number)
    columna = "personal_id" if tipo == "personal" else "beneficiario_id"
    ejecutar(
        f"""INSERT OR REPLACE INTO identidades
            (staff_number, {columna}, metodo, estado)
            VALUES (?, ?, ?, 'esperando')""",
        (sn, int(titular_id), metodo or "facial"),
    )
    return sn


def actualizar_identidad(staff_number, estado, rostro=None, huella=None, detalle=None):
    campos = ["estado = ?"]
    valores = [estado]
    if rostro is not None:
        campos.append("tiene_rostro = ?")
        valores.append(1 if rostro else 0)
    if huella is not None:
        campos.append("tiene_huella = ?")
        valores.append(1 if huella else 0)
    if detalle is not None:
        campos.append("detalle = ?")
        valores.append(detalle)
    valores.append(int(staff_number))
    return ejecutar(
        f"UPDATE identidades SET {', '.join(campos)} WHERE staff_number = ?",
        tuple(valores),
    )


def borrar_identidad(staff_number):
    """Quita la identidad y sus marcas; la ficha de la persona se conserva."""
    sn = config.validar_rango(staff_number)
    return ejecutar("DELETE FROM identidades WHERE staff_number = ?", (sn,))


def sin_enrolar():
    """
    Quiénes pueden enrolarse todavía: personal y beneficiarios activos que
    aún no tienen identidad biométrica. Es lo que alimenta el desplegable de
    "Agregar registro".
    """
    filas = consultar(
        """SELECT 'personal' AS tipo, p.id, p.nombre, p.cargo AS detalle,
                  p.vinculo, p.ambito
             FROM personal p
             LEFT JOIN identidades i ON i.personal_id = p.id
            WHERE p.estado = 'activo' AND i.staff_number IS NULL
            UNION ALL
           SELECT 'beneficiario' AS tipo, b.id, b.nombre, b.casa AS detalle,
                  NULL AS vinculo, 'ninos' AS ambito
             FROM beneficiarios b
             LEFT JOIN identidades i ON i.beneficiario_id = b.id
            WHERE b.estado = 'activo' AND i.staff_number IS NULL
            ORDER BY nombre"""
    )
    return filas


def siguiente_staff_number(usados_en_yunatt=()):
    """
    Asigna el siguiente staffNumber libre DENTRO DEL RANGO RESERVADO.

    Mira dos fuentes a la vez: lo que ya tenemos en local y lo que existe en
    la cuenta de yunatt. Lo segundo es lo que evita chocar con algo que se
    creara desde el panel de yunatt a mano, fuera de este sistema.
    """
    base = config.STAFF_NUMBER_BASE
    mayor = base - 1

    filas = consultar("SELECT MAX(staff_number) AS m FROM identidades")
    if filas and filas[0]["m"]:
        mayor = max(mayor, int(filas[0]["m"]))

    for sn in usados_en_yunatt:
        try:
            n = int(sn)
        except (TypeError, ValueError):
            continue
        if n >= base:
            mayor = max(mayor, n)

    return mayor + 1


# ── Marcas ────────────────────────────────────────────────────────────────

def guardar_marca(staff_number, fecha, hora, metodo="facial"):
    if not config.en_rango(staff_number):
        return 0
    return ejecutar(
        """INSERT OR IGNORE INTO marcas (staff_number, fecha, hora, metodo)
           SELECT ?, ?, ?, ? WHERE EXISTS
           (SELECT 1 FROM identidades WHERE staff_number = ?)""",
        (int(staff_number), fecha, hora, metodo, int(staff_number)),
    )


def marcas_de(fecha):
    """
    Marcas de un día, agregadas por identidad: primera entrada, última
    salida, horas trabajadas y total de marcas.

    El terminal registra marcas sueltas, no pares entrada/salida. Con una
    sola marca del día no se puede saber la hora de salida: se deja vacía en
    vez de repetir la de entrada, que daría a entender que ya se fue.
    """
    filas = consultar(
        """SELECT v.staff_number, v.nombre, v.documento, v.tipo, v.ambito,
                  v.vinculo, v.metodo, v.estado, v.tiene_rostro, v.tiene_huella,
                  MIN(m.hora) AS entrada,
                  MAX(m.hora) AS salida,
                  COUNT(m.id) AS total
             FROM v_identidades v
             LEFT JOIN marcas m
               ON m.staff_number = v.staff_number AND m.fecha = ?
            GROUP BY v.staff_number
            ORDER BY v.staff_number""",
        (fecha,),
    )
    for f in filas:
        if (f["total"] or 0) < 2:
            f["salida"] = None
            f["horas"] = None
        else:
            f["horas"] = _diferencia_horas(f["entrada"], f["salida"])
    return filas


def marcas_rango(desde, hasta):
    """
    Marcas entre dos fechas, agrupadas por identidad y día. Alimenta las
    vistas semanal y de calendario, que necesitan varios días de una vez.
    """
    filas = consultar(
        """SELECT v.staff_number, v.nombre, v.tipo, v.ambito, v.vinculo,
                  v.metodo, v.estado, v.personal_id, m.fecha,
                  MIN(m.hora) AS entrada,
                  MAX(m.hora) AS salida,
                  COUNT(m.id)  AS total
             FROM v_identidades v
             LEFT JOIN marcas m
               ON m.staff_number = v.staff_number
              AND m.fecha BETWEEN ? AND ?
            GROUP BY v.staff_number, m.fecha
            ORDER BY v.staff_number, m.fecha""",
        (desde, hasta),
    )

    gente = {}
    for f in filas:
        sn = f["staff_number"]
        p = gente.setdefault(sn, {
            "staff_number": sn, "nombre": f["nombre"], "tipo": f["tipo"],
            "ambito": f["ambito"], "vinculo": f["vinculo"],
            # Planillas necesita saber a qué ficha corresponde la identidad.
            "personal_id": f["personal_id"],
            "metodo": f["metodo"], "estado": f["estado"], "dias": {},
        })
        # El LEFT JOIN produce una fila con fecha nula cuando no marcó ningún
        # día del rango: no es un día, es la ausencia de ellos.
        if not f["fecha"]:
            continue
        total = f["total"] or 0
        p["dias"][f["fecha"]] = {
            "entrada": f["entrada"],
            "salida": f["salida"] if total >= 2 else None,
            "horas": _diferencia_horas(f["entrada"], f["salida"]) if total >= 2 else None,
            "total": total,
        }
    return list(gente.values())


def _diferencia_horas(entrada, salida):
    """'08:12' y '17:03' -> '8:51'. None si algo no encaja."""
    try:
        h1, m1 = (int(x) for x in str(entrada).split(":")[:2])
        h2, m2 = (int(x) for x in str(salida).split(":")[:2])
    except (ValueError, AttributeError):
        return None
    minutos = (h2 * 60 + m2) - (h1 * 60 + m1)
    if minutos < 0:          # turno de noche: cruzó la medianoche
        minutos += 24 * 60
    return f"{minutos // 60}:{minutos % 60:02d}"


# ── Condiciones laborales ─────────────────────────────────────────────────
#
# Una persona puede tener varias filas a lo largo del tiempo; solo una queda
# abierta (vigente_hasta NULL). Registrar una condición nueva NO borra la
# anterior: la cierra. Así las boletas viejas siguen cuadrando.

def condicion_vigente(personal_id, en_fecha=None):
    """La condición que rige en una fecha dada (hoy si no se indica)."""
    f = en_fecha or _date.today().isoformat()
    filas = consultar(
        """SELECT * FROM condiciones_laborales
            WHERE personal_id = ?
              AND vigente_desde <= ?
              AND (vigente_hasta IS NULL OR vigente_hasta >= ?)
            ORDER BY vigente_desde DESC LIMIT 1""",
        (personal_id, f, f),
    )
    return filas[0] if filas else None


def condiciones_de(personal_id):
    """Historial completo, de la más reciente a la más antigua."""
    return consultar(
        """SELECT * FROM condiciones_laborales
            WHERE personal_id = ?
            ORDER BY vigente_desde DESC, id DESC""",
        (personal_id,),
    )


def crear_condicion(personal_id, regimen, sueldo_base, jornada_horas=8,
                    vigente_desde=None, nota=""):
    """
    Registra una condición nueva y cierra la que estuviera abierta el día
    anterior. Ambas cosas en la misma transacción: si se cerrara una sin
    abrir la otra, la persona quedaría sin sueldo.
    """
    if regimen not in ("planilla", "honorarios", "sin_pago"):
        raise ValueError(f"Régimen no reconocido: {regimen!r}")
    sueldo = float(sueldo_base or 0)
    if sueldo < 0:
        raise ValueError("El sueldo no puede ser negativo")
    jornada = float(jornada_horas or 8)
    if jornada <= 0:
        raise ValueError("La jornada debe ser mayor que cero")
    desde = vigente_desde or _date.today().isoformat()

    with _lock, _conectar() as con:
        abiertas = con.execute(
            """SELECT id, vigente_desde FROM condiciones_laborales
                WHERE personal_id = ? AND vigente_hasta IS NULL""",
            (personal_id,),
        ).fetchall()
        for a in abiertas:
            if a["vigente_desde"] >= desde:
                # La nueva empieza antes (o el mismo día) que la abierta:
                # cerrarla dejaría un rango invertido. Se descarta la vieja.
                con.execute("DELETE FROM condiciones_laborales WHERE id = ?", (a["id"],))
            else:
                con.execute(
                    """UPDATE condiciones_laborales
                          SET vigente_hasta = date(?, '-1 day')
                        WHERE id = ?""",
                    (desde, a["id"]),
                )
        cur = con.execute(
            """INSERT INTO condiciones_laborales
                   (personal_id, regimen, sueldo_base, jornada_horas,
                    vigente_desde, nota)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (personal_id, regimen, sueldo, jornada, desde, nota or ""),
        )
        con.commit()
        return cur.lastrowid


def borrar_condicion(id_):
    """
    Quita una condición del historial y reabre la anterior si esta era la
    vigente, para no dejar a la persona sin condición abierta.
    """
    with _lock, _conectar() as con:
        fila = con.execute(
            "SELECT personal_id, vigente_hasta FROM condiciones_laborales WHERE id = ?",
            (id_,),
        ).fetchone()
        if fila is None:
            return 0
        con.execute("DELETE FROM condiciones_laborales WHERE id = ?", (id_,))
        if fila["vigente_hasta"] is None:
            previa = con.execute(
                """SELECT id FROM condiciones_laborales
                    WHERE personal_id = ?
                    ORDER BY vigente_desde DESC, id DESC LIMIT 1""",
                (fila["personal_id"],),
            ).fetchone()
            if previa:
                con.execute(
                    "UPDATE condiciones_laborales SET vigente_hasta = NULL WHERE id = ?",
                    (previa["id"],),
                )
        con.commit()
        return 1


def personal_sin_condicion(en_fecha=None):
    """
    Quién no tiene condición vigente. Se muestran aparte en Planillas, con
    el mismo criterio que 'sin jefe asignado' en el organigrama: no se
    esconden ni se les inventa un sueldo.
    """
    f = en_fecha or _date.today().isoformat()
    return consultar(
        """SELECT p.id, p.nombre, p.cargo, p.area, p.vinculo
             FROM personal p
            WHERE p.estado = 'activo'
              AND NOT EXISTS (
                  SELECT 1 FROM condiciones_laborales c
                   WHERE c.personal_id = p.id
                     AND c.vigente_desde <= ?
                     AND (c.vigente_hasta IS NULL OR c.vigente_hasta >= ?))
            ORDER BY p.nivel, p.id""",
        (f, f),
    )


# ── Boletas ───────────────────────────────────────────────────────────────

def boletas_de(periodo):
    """Las boletas guardadas de un período, por persona."""
    filas = consultar(
        """SELECT b.*, p.nombre, p.cargo, p.area, p.vinculo
             FROM boletas b
             JOIN personal p ON p.id = b.personal_id
            WHERE b.periodo = ?""",
        (periodo,),
    )
    return {f["personal_id"]: f for f in filas}


def boleta(personal_id, periodo):
    filas = consultar(
        """SELECT b.*, p.nombre, p.cargo, p.area, p.vinculo
             FROM boletas b
             JOIN personal p ON p.id = b.personal_id
            WHERE b.personal_id = ? AND b.periodo = ?""",
        (personal_id, periodo),
    )
    return filas[0] if filas else None


def guardar_boleta(datos):
    """Inserta o reemplaza la boleta de una persona en un período."""
    campos = ("personal_id", "periodo", "regimen", "sueldo_base", "dias_habiles",
              "dias_marcados", "dias_incompletos", "horas", "bruto",
              "descuentos", "neto", "estado", "cerrada_el", "detalle")
    valores = [datos.get(c) for c in campos]
    with _lock, _conectar() as con:
        con.execute(
            f"""INSERT INTO boletas ({', '.join(campos)})
                VALUES ({', '.join('?' * len(campos))})
                ON CONFLICT(personal_id, periodo) DO UPDATE SET
                    {', '.join(f'{c} = excluded.{c}' for c in campos[2:])}""",
            valores,
        )
        con.commit()


def cambiar_estado_boleta(personal_id, periodo, estado):
    if estado not in ("borrador", "cerrada", "pagada"):
        raise ValueError(f"Estado no reconocido: {estado!r}")
    return ejecutar(
        "UPDATE boletas SET estado = ? WHERE personal_id = ? AND periodo = ?",
        (estado, personal_id, periodo),
    )


def borrar_boletas(periodo):
    """Reabrir un período: se descartan los valores congelados."""
    return ejecutar("DELETE FROM boletas WHERE periodo = ?", (periodo,))


def periodos_con_boletas():
    return [f["periodo"] for f in consultar(
        "SELECT DISTINCT periodo FROM boletas ORDER BY periodo DESC")]


# ── Solicitudes ───────────────────────────────────────────────────────────
#
# Vacaciones, permisos y licencias. Aquí solo está el acceso a datos; las
# reglas (saldo, umbral, transiciones) viven en solicitudes.py.
#
# Los días de cada solicitud se DERIVAN de desde/hasta, no se guardan.

_SOL_ESTADOS = ("pendiente", "pendiente_admin", "aprobada", "rechazada", "cancelada")


def _dias_corridos(desde, hasta):
    """Días de calendario que abarca el rango, ambos extremos incluidos."""
    d1 = _date.fromisoformat(desde)
    d2 = _date.fromisoformat(hasta)
    return (d2 - d1).days + 1


def _con_dias(fila):
    fila = dict(fila)
    try:
        fila["dias"] = _dias_corridos(fila["desde"], fila["hasta"])
    except (ValueError, TypeError, KeyError):
        fila["dias"] = 0
    return fila


def solicitudes(estado=None, desde=None, hasta=None, personal_id=None):
    """
    Solicitudes con el nombre de la persona y de su jefe ya resueltos.
    Todos los filtros son opcionales y se combinan.
    """
    donde, params = [], []
    if estado:
        if isinstance(estado, str):
            estado = (estado,)
        donde.append(f"s.estado IN ({', '.join('?' * len(estado))})")
        params.extend(estado)
    if personal_id:
        donde.append("s.personal_id = ?")
        params.append(personal_id)
    # Solapamiento con el rango pedido, no contención: una solicitud que
    # empieza antes y termina dentro también toca ese rango.
    if desde and hasta:
        donde.append("s.desde <= ? AND s.hasta >= ?")
        params.extend([hasta, desde])
    sql = """SELECT s.*, p.nombre, p.cargo, p.area, p.vinculo,
                    j.nombre AS jefe_nombre
               FROM solicitudes s
               JOIN personal p ON p.id = s.personal_id
               LEFT JOIN personal j ON j.id = s.jefe_id"""
    if donde:
        sql += "\n WHERE " + " AND ".join(donde)
    sql += "\n ORDER BY s.desde DESC, s.id DESC"
    return [_con_dias(f) for f in consultar(sql, tuple(params))]


def solicitud(id_):
    filas = consultar(
        """SELECT s.*, p.nombre, p.cargo, p.area, p.vinculo,
                  j.nombre AS jefe_nombre
             FROM solicitudes s
             JOIN personal p ON p.id = s.personal_id
             LEFT JOIN personal j ON j.id = s.jefe_id
            WHERE s.id = ?""",
        (id_,),
    )
    return _con_dias(filas[0]) if filas else None


def solicitudes_de(personal_id):
    return solicitudes(personal_id=personal_id)


def solicitudes_aprobadas_en(desde, hasta):
    """
    Las aprobadas que tocan un rango de fechas. Es lo que Asistencia y
    Planillas consultan para saber si un día sin marca está justificado.
    """
    return solicitudes(estado="aprobada", desde=desde, hasta=hasta)


def crear_solicitud(personal_id, tipo, desde, hasta, motivo="",
                    jefe_id=None, requiere_admin=0, estado="pendiente"):
    if tipo not in ("vacaciones", "permiso", "licencia"):
        raise ValueError(f"Tipo de solicitud no reconocido: {tipo!r}")
    if estado not in _SOL_ESTADOS:
        raise ValueError(f"Estado no reconocido: {estado!r}")
    if hasta < desde:
        raise ValueError("La fecha final no puede ser anterior a la inicial")
    with _lock, _conectar() as con:
        cur = con.execute(
            """INSERT INTO solicitudes
                   (personal_id, tipo, desde, hasta, motivo, estado,
                    requiere_admin, jefe_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (personal_id, tipo, desde, hasta, motivo or "", estado,
             1 if requiere_admin else 0, jefe_id),
        )
        con.commit()
        return cur.lastrowid


def actualizar_estado_solicitud(id_, estado, nota=None, sello=None):
    """
    Cambia el estado y, si corresponde, deja el sello de fecha del nivel
    que acaba de resolver. 'sello' es el nombre de la columna de fecha.
    """
    if estado not in _SOL_ESTADOS:
        raise ValueError(f"Estado no reconocido: {estado!r}")
    if sello and sello not in ("aprob_jefe_el", "aprob_admin_el", "resuelto_el"):
        raise ValueError(f"Sello no reconocido: {sello!r}")
    campos = ["estado = ?"]
    params = [estado]
    if sello:
        campos.append(f"{sello} = datetime('now','localtime')")
    if nota is not None:
        campos.append("nota = ?")
        params.append(nota)
    params.append(id_)
    return ejecutar(
        f"UPDATE solicitudes SET {', '.join(campos)} WHERE id = ?", tuple(params))


def borrar_solicitud(id_):
    return ejecutar("DELETE FROM solicitudes WHERE id = ?", (id_,))


def resumen_solicitudes():
    """Cuántas hay en cada estado. Alimenta el contador del menú lateral."""
    filas = consultar(
        "SELECT estado, COUNT(*) AS n FROM solicitudes GROUP BY estado")
    conteo = {e: 0 for e in _SOL_ESTADOS}
    for f in filas:
        conteo[f["estado"]] = f["n"]
    conteo["por_resolver"] = conteo["pendiente"] + conteo["pendiente_admin"]
    return conteo


# ── Sesiones de acompañamiento e incidencias ──────────────────────────────
#
# Ambas cuelgan de un beneficiario. Aquí solo está el acceso a datos; las
# reglas de quién puede verlas están sin resolver (no hay roles todavía).

TIPOS_SESION = ("individual", "grupal", "familiar", "escolar", "otra")
GRAVEDADES = ("leve", "moderada", "grave")


def sesiones_de(beneficiario_id):
    """Sesiones de un beneficiario, de la más reciente a la más antigua."""
    return consultar(
        """SELECT s.*, p.nombre AS responsable
             FROM sesiones_acompanamiento s
             LEFT JOIN personal p ON p.id = s.realizada_por
            WHERE s.beneficiario_id = ?
            ORDER BY s.fecha DESC, s.id DESC""",
        (beneficiario_id,),
    )


def crear_sesion(beneficiario_id, fecha, tipo="individual",
                 realizada_por=None, notas=""):
    if tipo not in TIPOS_SESION:
        raise ValueError(f"Tipo de sesión no reconocido: {tipo!r}")
    with _lock, _conectar() as con:
        cur = con.execute(
            """INSERT INTO sesiones_acompanamiento
                   (beneficiario_id, fecha, tipo, realizada_por, notas)
               VALUES (?, ?, ?, ?, ?)""",
            (beneficiario_id, fecha, tipo, realizada_por, notas or ""),
        )
        con.commit()
        return cur.lastrowid


def borrar_sesion(id_):
    return ejecutar("DELETE FROM sesiones_acompanamiento WHERE id = ?", (id_,))


def sesiones_del_anio(beneficiario_id, anio=None):
    """
    Cuántas sesiones tiene este año. Alimenta el contador 'Sesiones del
    año' del expediente, que antes era un número fijo de la maqueta.
    """
    a = str(anio or _date.today().year)
    return consultar(
        """SELECT COUNT(*) AS n FROM sesiones_acompanamiento
            WHERE beneficiario_id = ? AND substr(fecha, 1, 4) = ?""",
        (beneficiario_id, a),
    )[0]["n"]


def incidencias_de(beneficiario_id):
    return consultar(
        """SELECT i.*, p.nombre AS reportante
             FROM incidencias i
             LEFT JOIN personal p ON p.id = i.reportada_por
            WHERE i.beneficiario_id = ?
            ORDER BY i.fecha DESC, i.id DESC""",
        (beneficiario_id,),
    )


def crear_incidencia(beneficiario_id, fecha, descripcion, gravedad="leve",
                     reportada_por=None, seguimiento=""):
    if gravedad not in GRAVEDADES:
        raise ValueError(f"Gravedad no reconocida: {gravedad!r}")
    if not str(descripcion or "").strip():
        raise ValueError("La descripción es obligatoria")
    with _lock, _conectar() as con:
        cur = con.execute(
            """INSERT INTO incidencias
                   (beneficiario_id, fecha, gravedad, descripcion,
                    reportada_por, seguimiento)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (beneficiario_id, fecha, gravedad, str(descripcion).strip(),
             reportada_por, seguimiento or ""),
        )
        con.commit()
        return cur.lastrowid


def borrar_incidencia(id_):
    return ejecutar("DELETE FROM incidencias WHERE id = ?", (id_,))


# ── Usuarios, roles y permisos ────────────────────────────────────────────

def roles():
    """Los roles con cuántos usuarios tiene cada uno."""
    return consultar(
        """SELECT r.*, (SELECT COUNT(*) FROM usuarios u WHERE u.rol_id = r.id) AS usuarios
             FROM roles r ORDER BY r.es_sistema DESC, r.nombre"""
    )


def rol(id_):
    filas = consultar("SELECT * FROM roles WHERE id = ?", (id_,))
    return filas[0] if filas else None


def rol_por_clave(clave):
    filas = consultar("SELECT * FROM roles WHERE clave = ?", (clave,))
    return filas[0] if filas else None


def crear_rol(nombre, clave, descripcion="", es_sistema=0):
    with _lock, _conectar() as con:
        cur = con.execute(
            """INSERT INTO roles (nombre, clave, descripcion, es_sistema)
               VALUES (?, ?, ?, ?)""",
            (nombre, clave, descripcion or "", 1 if es_sistema else 0),
        )
        con.commit()
        return cur.lastrowid


def borrar_rol(id_):
    return ejecutar("DELETE FROM roles WHERE id = ? AND es_sistema = 0", (id_,))


def permisos_rol(rol_id):
    return {f["modulo"]: f["nivel"] for f in consultar(
        "SELECT modulo, nivel FROM permisos_rol WHERE rol_id = ?", (rol_id,))}


def guardar_permisos_rol(rol_id, mapa):
    """Reemplaza la matriz completa del rol."""
    with _lock, _conectar() as con:
        con.execute("DELETE FROM permisos_rol WHERE rol_id = ?", (rol_id,))
        con.executemany(
            "INSERT INTO permisos_rol (rol_id, modulo, nivel) VALUES (?, ?, ?)",
            [(rol_id, m, n) for m, n in mapa.items()],
        )
        con.commit()


def usuarios():
    """Cuentas con el nombre de la persona y su rol ya resueltos."""
    return consultar(
        """SELECT u.id, u.usuario, u.estado, u.debe_cambiar, u.ultimo_acceso,
                  u.creado, u.personal_id, u.rol_id,
                  p.nombre, p.cargo, p.area,
                  r.clave AS rol, r.nombre AS rol_nombre
             FROM usuarios u
             JOIN personal p ON p.id = u.personal_id
             JOIN roles r    ON r.id = u.rol_id
            ORDER BY p.nombre"""
    )


def usuario(id_):
    filas = consultar(
        """SELECT u.*, p.nombre, p.cargo, r.clave AS rol, r.nombre AS rol_nombre
             FROM usuarios u
             JOIN personal p ON p.id = u.personal_id
             JOIN roles r    ON r.id = u.rol_id
            WHERE u.id = ?""",
        (id_,),
    )
    return filas[0] if filas else None


def usuario_por_nombre(nombre):
    filas = consultar(
        """SELECT u.*, p.nombre, r.clave AS rol, r.nombre AS rol_nombre
             FROM usuarios u
             JOIN personal p ON p.id = u.personal_id
             JOIN roles r    ON r.id = u.rol_id
            WHERE lower(u.usuario) = lower(?)""",
        (str(nombre or "").strip(),),
    )
    return filas[0] if filas else None


def crear_usuario(personal_id, usuario_, clave_hash, rol_id, debe_cambiar=1):
    with _lock, _conectar() as con:
        cur = con.execute(
            """INSERT INTO usuarios
                   (personal_id, usuario, clave_hash, rol_id, debe_cambiar)
               VALUES (?, ?, ?, ?, ?)""",
            (personal_id, usuario_, clave_hash, rol_id, 1 if debe_cambiar else 0),
        )
        con.commit()
        return cur.lastrowid


def actualizar_usuario(id_, campos):
    permitidos = ("usuario", "clave_hash", "rol_id", "estado", "debe_cambiar")
    usar = [c for c in permitidos if c in campos]
    if not usar:
        return 0
    return ejecutar(
        f"UPDATE usuarios SET {', '.join(f'{c} = ?' for c in usar)} WHERE id = ?",
        tuple(campos[c] for c in usar) + (id_,),
    )


def borrar_usuario(id_):
    return ejecutar("DELETE FROM usuarios WHERE id = ?", (id_,))


def directores_activos(excluir_id=None):
    """
    Cuántos Directores activos quedan. El sistema no puede quedarse sin
    ninguno: sería imposible volver a administrarlo desde la interfaz.
    """
    sql = """SELECT COUNT(*) AS n FROM usuarios u
               JOIN roles r ON r.id = u.rol_id
              WHERE r.clave = 'director' AND u.estado = 'activo'"""
    params = ()
    if excluir_id:
        sql += " AND u.id <> ?"
        params = (excluir_id,)
    return consultar(sql, params)[0]["n"]


def personal_sin_usuario():
    """Quién todavía no tiene cuenta. Alimenta el selector del alta."""
    return consultar(
        """SELECT p.id, p.nombre, p.cargo, p.area
             FROM personal p
            WHERE p.estado = 'activo'
              AND NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.personal_id = p.id)
            ORDER BY p.nivel, p.id"""
    )


def accesos(limite=200, modulo=None, usuario_id=None):
    donde, params = [], []
    if modulo:
        donde.append("modulo = ?"); params.append(modulo)
    if usuario_id:
        donde.append("usuario_id = ?"); params.append(usuario_id)
    sql = "SELECT * FROM accesos"
    if donde:
        sql += " WHERE " + " AND ".join(donde)
    sql += " ORDER BY id DESC LIMIT ?"
    params.append(int(limite))
    return consultar(sql, tuple(params))
