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

-- ─────────────────────────────────────────────────────────────────────────
-- RESPONSABLES / TUTORES
--
-- Entidad propia, no una fila de 'personal'. Un responsable es la madre, la
-- abuela o el hermano mayor de un beneficiario: no trabaja aquí, no cobra, no
-- marca en el terminal. Meterlo en 'personal' obligaba a inventarle cargo y
-- área, y lo hacía aparecer en el directorio del equipo.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS responsables (
    id          INTEGER PRIMARY KEY,
    codigo      TEXT DEFAULT '',
    nombre      TEXT NOT NULL,
    documento   TEXT DEFAULT '',
    fecha_nac   TEXT DEFAULT '',
    sexo        TEXT DEFAULT '',
    nacionalidad TEXT DEFAULT '',
    estado      TEXT DEFAULT 'activo',

    -- Contacto
    telefono    TEXT DEFAULT '',
    telefono_alt TEXT DEFAULT '',
    correo      TEXT DEFAULT '',
    departamento TEXT DEFAULT '',
    provincia   TEXT DEFAULT '',
    distrito    TEXT DEFAULT '',
    direccion   TEXT DEFAULT '',
    referencia  TEXT DEFAULT '',

    -- Situación laboral. Alimenta la ficha socioeconómica del beneficiario,
    -- así que vive aquí una sola vez y no repetida en cada niño.
    ocupacion         TEXT DEFAULT '',
    situacion_laboral TEXT DEFAULT '',
    centro_trabajo    TEXT DEFAULT '',
    tipo_trabajo      TEXT DEFAULT '',
    rango_ingresos    TEXT DEFAULT '',
    personas_a_cargo  INTEGER DEFAULT 0,

    nota    TEXT DEFAULT '',
    creado  TEXT DEFAULT (datetime('now','localtime')),

    -- De dónde salió esta ficha. 'migrado' marca las que vinieron de
    -- 'personal' y conviene revisar a mano; queda escrito en la propia fila
    -- para que la revisión no dependa de acordarse.
    origen  TEXT DEFAULT 'manual',
    origen_personal_id INTEGER
);
CREATE INDEX IF NOT EXISTS idx_responsables_doc ON responsables(documento);

-- El vínculo. Los campos describen la RELACIÓN, no a la persona: la misma
-- señora puede ser abuela y responsable legal de un nieto, y solo contacto de
-- emergencia de otro.
CREATE TABLE IF NOT EXISTS responsable_beneficiario (
    id              INTEGER PRIMARY KEY,
    responsable_id  INTEGER NOT NULL REFERENCES responsables(id) ON DELETE CASCADE,
    beneficiario_id INTEGER NOT NULL REFERENCES beneficiarios(id) ON DELETE CASCADE,
    parentesco      TEXT DEFAULT '',
    es_principal    INTEGER DEFAULT 0,
    es_legal        INTEGER DEFAULT 0,
    puede_recoger   INTEGER DEFAULT 0,
    es_emergencia   INTEGER DEFAULT 0,
    nota            TEXT DEFAULT '',
    creado          TEXT DEFAULT (datetime('now','localtime')),
    -- Un responsable no puede estar dos veces sobre el mismo niño.
    UNIQUE (responsable_id, beneficiario_id)
);
CREATE INDEX IF NOT EXISTS idx_rb_benef ON responsable_beneficiario(beneficiario_id);
CREATE INDEX IF NOT EXISTS idx_rb_resp  ON responsable_beneficiario(responsable_id);

-- ─────────────────────────────────────────────────────────────────────────
-- SERIES EN EL TIEMPO
--
-- Lo que no cabe en una columna porque son varios registros por persona y su
-- valor está en la secuencia, no en el último.
-- ─────────────────────────────────────────────────────────────────────────

-- Cada año escolar de un beneficiario. La ficha guarda el año en curso; aquí
-- queda la evolución, que es lo que responde "¿repitió?, ¿mejoró?".
CREATE TABLE IF NOT EXISTS historial_educativo (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    beneficiario_id INTEGER NOT NULL REFERENCES beneficiarios(id) ON DELETE CASCADE,
    anio            TEXT DEFAULT '',
    institucion     TEXT DEFAULT '',
    nivel           TEXT DEFAULT '',
    grado           TEXT DEFAULT '',
    seccion         TEXT DEFAULT '',
    situacion       TEXT DEFAULT '',   -- aprobado, repitió, retirado
    rendimiento     TEXT DEFAULT '',
    asistencia      TEXT DEFAULT '',
    nota            TEXT DEFAULT '',
    creado          TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_hist_edu ON historial_educativo(beneficiario_id, anio);

-- Seguimiento social: cada visita o intervención. Distinto de
-- 'sesiones_acompanamiento', que es el acompañamiento psicológico; esto es el
-- historial de situaciones detectadas y qué se hizo con cada una.
CREATE TABLE IF NOT EXISTS seguimiento (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    beneficiario_id INTEGER NOT NULL REFERENCES beneficiarios(id) ON DELETE CASCADE,
    fecha           TEXT NOT NULL,
    -- Quién lo hizo, apuntando a la ficha de personal: si se guardara el
    -- nombre como texto acabarían conviviendo tres formas de escribirlo.
    responsable_id  INTEGER REFERENCES personal(id) ON DELETE SET NULL,
    tipo            TEXT DEFAULT '',
    situacion       TEXT DEFAULT '',   -- qué se detectó
    accion          TEXT DEFAULT '',   -- qué se hizo
    compromisos     TEXT DEFAULT '',
    nota            TEXT DEFAULT '',
    proxima_fecha   TEXT DEFAULT '',
    creado          TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_seguimiento ON seguimiento(beneficiario_id, fecha);

-- Programas en los que participa un beneficiario. La gestión de programas
-- vivirá en su propio módulo; aquí solo se guarda el vínculo, así que el
-- nombre va como texto a propósito: todavía no hay tabla 'programas' a la que
-- apuntar, y fabricar una vacía sería adivinar su forma.
CREATE TABLE IF NOT EXISTS programas_beneficiario (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    beneficiario_id INTEGER NOT NULL REFERENCES beneficiarios(id) ON DELETE CASCADE,
    programa        TEXT NOT NULL,
    fecha_ingreso   TEXT DEFAULT '',
    fecha_salida    TEXT DEFAULT '',
    estado          TEXT DEFAULT 'activo',
    nota            TEXT DEFAULT '',
    creado          TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_prog_benef ON programas_beneficiario(beneficiario_id);

-- Formación académica del personal.
CREATE TABLE IF NOT EXISTS formacion (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    personal_id INTEGER NOT NULL REFERENCES personal(id) ON DELETE CASCADE,
    nivel       TEXT DEFAULT '',   -- secundaria, técnico, universitario…
    institucion TEXT DEFAULT '',
    carrera     TEXT DEFAULT '',
    grado       TEXT DEFAULT '',   -- bachiller, titulado, egresado
    anio_inicio TEXT DEFAULT '',
    anio_fin    TEXT DEFAULT '',
    -- Los cursos y certificaciones caben aquí mismo con nivel='curso': son la
    -- misma forma de dato y separarlos duplicaría la tabla sin ganar nada.
    nota        TEXT DEFAULT '',
    creado      TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_formacion ON formacion(personal_id);

-- Experiencia laboral anterior del personal.
CREATE TABLE IF NOT EXISTS experiencia (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    personal_id INTEGER NOT NULL REFERENCES personal(id) ON DELETE CASCADE,
    empresa     TEXT DEFAULT '',
    cargo       TEXT DEFAULT '',
    desde       TEXT DEFAULT '',
    hasta       TEXT DEFAULT '',
    funciones   TEXT DEFAULT '',
    nota        TEXT DEFAULT '',
    creado      TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_experiencia ON experiencia(personal_id);

-- Capa compartida: lo único que personal y beneficiarios tienen en común.
CREATE TABLE IF NOT EXISTS identidades (
    staff_number    INTEGER PRIMARY KEY,   -- el ID en yunatt/terminal, >= 9000
    personal_id     INTEGER REFERENCES personal(id)      ON DELETE CASCADE,
    beneficiario_id INTEGER REFERENCES beneficiarios(id) ON DELETE CASCADE,
    -- Los tutores son una entidad propia, no una fila de 'personal': no
    -- trabajan aquí. Por eso tienen columna propia en vez de colarse por la
    -- de personal. Las bases anteriores a esto se arreglan con
    -- backend/migrar_identidades.py, porque un CHECK no se puede alterar.
    responsable_id  INTEGER REFERENCES responsables(id)  ON DELETE CASCADE,
    metodo          TEXT DEFAULT 'facial',   -- facial | huella | ambos
    estado          TEXT DEFAULT 'pendiente',-- pendiente | esperando | enrolado | error
    tiene_rostro    INTEGER DEFAULT 0,
    tiene_huella    INTEGER DEFAULT 0,
    detalle         TEXT DEFAULT '',
    creado          TEXT DEFAULT (datetime('now','localtime')),
    -- Exactamente un dueño. Con cero la identidad no apunta a nadie; con
    -- dos no habría forma de saber quién marcó.
    CHECK ((personal_id     IS NOT NULL)
         + (beneficiario_id IS NOT NULL)
         + (responsable_id  IS NOT NULL) = 1),
    UNIQUE (personal_id),
    UNIQUE (beneficiario_id),
    UNIQUE (responsable_id)
);

-- [UN SOLO DISPOSITIVO] no se guarda de qué terminal vino cada marca.
-- Al añadir el segundo equipo hará falta una columna 'dispositivo'.
CREATE TABLE IF NOT EXISTS marcas (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_number INTEGER NOT NULL REFERENCES identidades(staff_number) ON DELETE CASCADE,
    fecha        TEXT NOT NULL,
    hora         TEXT NOT NULL,
    metodo       TEXT DEFAULT 'facial',
    -- De dónde vino: 'terminal' es el Timmy; 'web' es el navegador del propio
    -- trabajador. Ambos canales terminan en ESTA tabla a propósito —un solo
    -- historial— pero se puede saber cuál fue cada marca.
    canal        TEXT DEFAULT 'terminal',
    UNIQUE (staff_number, fecha, hora)
);

-- ─────────────────────────────────────────────────────────────────────────
-- CANAL WEB: ROSTRO DE REFERENCIA Y CONSENTIMIENTO
--
-- El enrolamiento del Timmy guarda su plantilla DENTRO del dispositivo y de
-- la nube de yunatt: no es legible desde aquí ni sirve para comparar en un
-- navegador. El canal web necesita su propia referencia, y por eso cada
-- trabajador pasa por dos enrolamientos.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rostros_web (
    personal_id INTEGER PRIMARY KEY REFERENCES personal(id) ON DELETE CASCADE,

    -- El descriptor: un vector de números en JSON. NO es una imagen y no se
    -- reconstruye una cara con él. La foto se procesa en el navegador del
    -- trabajador y se descarta ahí; nunca llega al servidor ni a esta tabla.
    descriptor  TEXT NOT NULL,
    dimension   INTEGER DEFAULT 0,   -- longitud del vector, para validar
    modelo      TEXT DEFAULT '',     -- qué modelo lo generó: si cambia, hay
                                     -- que reenrolar, no comparar a ciegas
    creado      TEXT DEFAULT (datetime('now','localtime')),
    actualizado TEXT DEFAULT (datetime('now','localtime')),

    -- Quién hizo el enrolamiento. En el canal web lo hace la propia persona,
    -- pero puede acompañarla RRHH en la sesión que agenden.
    registrado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL
);

-- El consentimiento. Vive aparte del rostro a propósito: si mañana se borra
-- el descriptor, la constancia de que se pidió permiso NO debe irse con él.
CREATE TABLE IF NOT EXISTS consentimientos (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    personal_id INTEGER NOT NULL REFERENCES personal(id) ON DELETE CASCADE,
    tipo        TEXT NOT NULL DEFAULT 'rostro_web',
    aceptado    INTEGER NOT NULL DEFAULT 0,   -- 0 = lo rechazó, y eso también consta

    -- El texto EXACTO que la persona leyó, copiado aquí. Si mañana se
    -- reescribe el aviso, este registro sigue diciendo a qué dijo sí.
    version     TEXT DEFAULT '',
    texto       TEXT DEFAULT '',

    cuando      TEXT DEFAULT (datetime('now','localtime')),
    ip          TEXT DEFAULT '',
    agente      TEXT DEFAULT '',
    -- Se guarda el histórico completo: revocar es un registro nuevo, no
    -- borrar el anterior.
    revocado_el TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_consent_persona
    ON consentimientos(personal_id, tipo);

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
    -- vacaciones: se generan por antigüedad y salen de un saldo.
    -- personal | familiar | medico | licencia | otro: no tienen saldo.
    -- Las bases anteriores a esto se arreglan con
    -- backend/migrar_tipos_permiso.py, porque un CHECK no se puede alterar.
    tipo           TEXT NOT NULL DEFAULT 'otro',
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
    CHECK (tipo IN ('vacaciones','personal','familiar','medico','licencia','otro')),
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
       i.detalle, i.creado,
       i.personal_id, i.beneficiario_id, i.responsable_id,
       CASE WHEN i.personal_id     IS NOT NULL THEN 'personal'
            WHEN i.beneficiario_id IS NOT NULL THEN 'beneficiario'
            ELSE 'responsable' END          AS tipo,

       -- LA definición de «enrolado», y la única.
       --
       -- No es "tiene fila": la fila se crea al pedir el enrolamiento,
       -- antes de mandarle nada al terminal. Tampoco es estado='enrolado':
       -- ese campo cuenta cómo fue la conversación con TIMMY, y una
       -- captura puede quedarse a medias sin que nadie la cierre.
       --
       -- Enrolado es lo que el terminal confirmó que guardó. Sin rostro ni
       -- huella esa persona no puede marcar, y decir lo contrario es
       -- informar en falso sobre alguien real.
       CASE WHEN i.tiene_rostro = 1 OR i.tiene_huella = 1
            THEN 1 ELSE 0 END               AS enrolado,
       COALESCE(p.nombre,    b.nombre,    r.nombre)    AS nombre,
       COALESCE(p.documento, b.documento, r.documento) AS documento,
       CASE WHEN i.beneficiario_id IS NOT NULL THEN 'ninos'
            -- Los tutores no pertenecen a ningún ámbito: no trabajan aquí.
            WHEN i.responsable_id  IS NOT NULL THEN NULL
            WHEN p.vinculo = 'voluntario'      THEN NULL  -- solo en General
            ELSE p.ambito END                 AS ambito,
       p.vinculo, p.cargo, p.area, p.sede,
       b.casa, b.sala, b.grado
  FROM identidades i
  LEFT JOIN personal      p ON p.id = i.personal_id
  LEFT JOIN beneficiarios b ON b.id = i.beneficiario_id
  LEFT JOIN responsables  r ON r.id = i.responsable_id;

-- ══════════════════════════════════════════════════════════════════════
--  El formulario público de tutores
-- ══════════════════════════════════════════════════════════════════════

-- Un enlace entregado a una familia. El token viaja dentro de la
-- dirección; al volver, dice de quién es la respuesta.
--
-- El token IDENTIFICA, no autentica: Google Forms sin sesión no puede
-- impedir que alguien borre o cambie ese campo. Por eso una respuesta con
-- token desconocido no se rechaza en silencio — entra a la bandeja
-- marcada, y decide una persona.
CREATE TABLE IF NOT EXISTS invitaciones (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    token          TEXT NOT NULL UNIQUE,

    -- A quién se le dio. Si la ficha ya existe, apunta a ella y la
    -- respuesta servirá para actualizarla. Si todavía no existe, va la
    -- etiqueta a mano ("Familia Quispe") para saber a quién se entregó.
    responsable_id INTEGER REFERENCES responsables(id) ON DELETE SET NULL,
    etiqueta       TEXT DEFAULT '',

    creada         TEXT DEFAULT (datetime('now','localtime')),
    creada_por     INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,

    -- Un enlace que se filtra deja de servir solo. Sin fecha de fin,
    -- cualquier copia reenviada seguiría abierta para siempre.
    caduca         TEXT NOT NULL,

    -- Cuándo llegó la respuesta. Una invitación usada no vuelve a servir.
    usada          TEXT DEFAULT '',

    estado         TEXT NOT NULL DEFAULT 'vigente'
                   CHECK (estado IN ('vigente','usada','anulada')),
    nota           TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_invit_token ON invitaciones(token);
CREATE INDEX IF NOT EXISTS idx_invit_resp  ON invitaciones(responsable_id);

-- Lo que llegó del formulario. NO es una ficha: es lo que alguien escribió,
-- esperando a que una persona lo revise.
CREATE TABLE IF NOT EXISTS respuestas_formulario (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    origen         TEXT NOT NULL DEFAULT 'google_forms',
    recibida       TEXT DEFAULT (datetime('now','localtime')),

    -- La fila tal y como venía, sin tocar. Si mañana se descubre que la
    -- limpieza se equivocaba en algo, el original sigue aquí.
    cruda          TEXT DEFAULT '',
    -- Lo mismo después de normalizar, que es lo que se propone guardar.
    normalizada    TEXT DEFAULT '',

    token          TEXT DEFAULT '',
    invitacion_id  INTEGER REFERENCES invitaciones(id) ON DELETE SET NULL,

    -- 1 autorizó, 0 dijo que no. Una respuesta con 0 no se puede ingresar
    -- de ninguna manera; solo descartarse.
    consentimiento INTEGER NOT NULL DEFAULT 0,

    estado         TEXT NOT NULL DEFAULT 'por_revisar'
                   CHECK (estado IN ('por_revisar','ingresada','descartada')),
    motivo         TEXT DEFAULT '',

    responsable_id INTEGER REFERENCES responsables(id) ON DELETE SET NULL,
    resuelta       TEXT DEFAULT '',
    resuelta_por   INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,

    -- Huella de la fila de origen. Evita que traer las respuestas dos
    -- veces duplique lo mismo: es la misma fila, no una respuesta nueva.
    huella         TEXT NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS idx_resp_form_estado ON respuestas_formulario(estado);
CREATE INDEX IF NOT EXISTS idx_resp_form_token  ON respuestas_formulario(token);
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
        # Ficha completa (paso 4)
        "sexo":                  "TEXT DEFAULT ''",
        "nacionalidad":          "TEXT DEFAULT ''",
        "lugar_nacimiento":      "TEXT DEFAULT ''",
        "jornada":               "TEXT DEFAULT ''",
        "estado_laboral":        "TEXT DEFAULT ''",
        "departamento":          "TEXT DEFAULT ''",
        "provincia":             "TEXT DEFAULT ''",
        "distrito":              "TEXT DEFAULT ''",
        # Fecha de alta. Las filas anteriores quedan en NULL a propósito:
        # darles la fecha de la migración las contaría como altas de ese día
        # y el panel informaría de ingresos que nunca ocurrieron.
        "creado":                "TEXT DEFAULT NULL",
        # Campos que alguien declaró «sin dato por ahora». Ver _sin_dato().
        "sin_dato":              "TEXT DEFAULT ''",
    },
    "marcas": {
        # Las marcas anteriores a esta columna vinieron todas del terminal:
        # el canal web no existía. El valor por defecto es correcto, no una
        # suposición cómoda.
        "canal": "TEXT DEFAULT 'terminal'",
    },
    "responsables": {
        "sin_dato": "TEXT DEFAULT ''",   # ver _sin_dato()
        # La foto se guarda en disco; aquí solo va su nombre interno y lo
        # que hace falta para servirla sin abrir el archivo. Ver fotos.py.
        "foto":       "TEXT DEFAULT NULL",
        "foto_mime":  "TEXT DEFAULT NULL",
        "foto_tam":   "INTEGER DEFAULT NULL",
        "foto_ancho": "INTEGER DEFAULT NULL",
        "foto_alto":  "INTEGER DEFAULT NULL",
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
        # OJO: este diccionario tenía DOS claves "beneficiarios". En Python la
        # segunda gana y la primera desaparece sin error, así que la columna
        # 'creado' que vivía en la otra nunca llegó a la base: el panel de
        # Gestión de Personas contaba altas de una columna inexistente.
        # Todo lo de esta tabla va aquí, en un solo bloque.
        "creado":                "TEXT DEFAULT NULL",   # ver personal.creado
        "sin_dato":              "TEXT DEFAULT ''",     # ver _sin_dato()
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
        # ── Ficha completa (paso 4) ──────────────────────────────────────
        # Todas son un solo valor vigente: lo que es serie en el tiempo vive
        # en sus propias tablas (historial_educativo, seguimiento…).
        "codigo":                    "TEXT DEFAULT ''",
        "sexo":                      "TEXT DEFAULT ''",
        "nacionalidad":              "TEXT DEFAULT ''",
        "lugar_nacimiento":          "TEXT DEFAULT ''",
        "departamento":              "TEXT DEFAULT ''",
        "provincia":                 "TEXT DEFAULT ''",
        "distrito":                  "TEXT DEFAULT ''",
        "direccion":                 "TEXT DEFAULT ''",
        "referencia":                "TEXT DEFAULT ''",
        "tipo_vivienda":             "TEXT DEFAULT ''",
        "servicios_basicos":         "TEXT DEFAULT ''",
        "domicilio_del_responsable": "INTEGER DEFAULT 0",
        "nivel_educativo":           "TEXT DEFAULT ''",
        "seccion":                   "TEXT DEFAULT ''",
        "turno":                     "TEXT DEFAULT ''",
        "anio_academico":            "TEXT DEFAULT ''",
        "situacion_academica":       "TEXT DEFAULT ''",
        "asistencia_escolar":        "TEXT DEFAULT ''",
        "dificultades":              "TEXT DEFAULT ''",
        "nota_educativa":            "TEXT DEFAULT ''",
        "tipo_seguro":               "TEXT DEFAULT ''",
        "centro_salud":              "TEXT DEFAULT ''",
        "discapacidad":              "TEXT DEFAULT ''",
        "necesidades_especiales":    "TEXT DEFAULT ''",
        "info_medica":               "TEXT DEFAULT ''",
        "emergencia_nombre":         "TEXT DEFAULT ''",
        "emergencia_telefono":       "TEXT DEFAULT ''",
        "nota_salud":                "TEXT DEFAULT ''",
        "integrantes_hogar":         "INTEGER DEFAULT 0",
        "hermanos":                  "INTEGER DEFAULT 0",
        "con_quien_vive":            "TEXT DEFAULT ''",
        "responsable_economico":     "TEXT DEFAULT ''",
        "tenencia_vivienda":         "TEXT DEFAULT ''",
        "rango_ingresos":            "TEXT DEFAULT ''",
        "personas_dependientes":     "INTEGER DEFAULT 0",
        "nota_socioeconomica":       "TEXT DEFAULT ''",
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

        # Las vistas se rehacen siempre. No guardan datos —son consultas
        # con nombre— y con IF NOT EXISTS una base ya creada conserva la
        # definición vieja en silencio. Así una corrección de la vista
        # llega a todas las bases sin migración aparte.
        con.execute("DROP VIEW IF EXISTS v_identidades")
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
                   i.metodo, i.tiene_rostro, i.tiene_huella, i.enrolado
              FROM personal p
              LEFT JOIN v_identidades i ON i.personal_id = p.id
              {donde}
             ORDER BY p.nivel, p.id"""
    )


def persona_personal(id_):
    filas = consultar(
        """SELECT p.*, i.staff_number, i.estado AS estado_biometrico,
                  i.metodo, i.tiene_rostro, i.tiene_huella, i.enrolado
             FROM personal p
             LEFT JOIN v_identidades i ON i.personal_id = p.id
            WHERE p.id = ?""",
        (int(id_),),
    )
    return filas[0] if filas else None


CAMPOS_PERSONAL = ("nombre", "documento", "cargo", "area", "sede", "ambito",
                   "vinculo", "contrato", "fecha_ingreso", "fecha_nac",
                   "jefe_id", "estado",
                   "email", "telefono", "direccion",
                   "emergencia_nombre", "emergencia_telefono",
                   # ── Hoja de Vida (paso 4) ────────────────────────────
                   # La antigüedad no está: se calcula de fecha_ingreso, por
                   # lo mismo que la edad del beneficiario sale de su fecha
                   # de nacimiento y no se guarda.
                   "sexo", "nacionalidad", "lugar_nacimiento",
                   "jornada", "estado_laboral",
                   "departamento", "provincia", "distrito",
                   "sin_dato")


_COLUMNAS_VISTAS = {}


def _tiene_columna(con, tabla, columna):
    """
    ¿Existe la columna? Se consulta una vez por tabla y se recuerda.

    Hace falta porque la fecha de alta es una columna añadida después: una
    base que todavía no pasó por iniciar() no la tiene, y no vale tumbar el
    alta de una persona por un dato de control. Sin columna se guarda igual,
    solo que sin fecha.
    """
    if tabla not in _COLUMNAS_VISTAS:
        _COLUMNAS_VISTAS[tabla] = {
            f[1] for f in con.execute(f"PRAGMA table_info({tabla})")}
    return columna in _COLUMNAS_VISTAS[tabla]


def crear_personal(datos):
        # La fecha de alta la pone la base, no quien llama: si viniera en
        # los datos, una importación podría fecharlo todo el mismo día.
    campos = [c for c in CAMPOS_PERSONAL if c in datos]
    marcas_ = ", ".join("?" for _ in campos)
    with _lock, _conectar() as con:
        hay = _tiene_columna(con, "personal", "creado")
        fecha_col = ", creado" if hay else ""
        fecha_val = ", datetime('now','localtime')" if hay else ""
        cur = con.execute(
            f"INSERT INTO personal ({', '.join(campos)}{fecha_col}) "
            f"VALUES ({marcas_}{fecha_val})",
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
                       "tutor_id", "psicologo_id", "plan_vida",
                       # ── Ficha completa (paso 4) ──────────────────────
                       # La EDAD no está aquí a propósito: se calcula de
                       # fecha_nac. Guardarla sería un dato que envejece mal,
                       # correcto el día que se escribe y falso al siguiente
                       # cumpleaños.
                       "codigo", "sexo", "nacionalidad", "lugar_nacimiento",
                       "departamento", "provincia", "distrito", "direccion",
                       "referencia", "tipo_vivienda", "servicios_basicos",
                       "domicilio_del_responsable",
                       "nivel_educativo", "seccion", "turno", "anio_academico",
                       "situacion_academica", "asistencia_escolar",
                       "dificultades", "nota_educativa",
                       "tipo_seguro", "centro_salud", "discapacidad",
                       "necesidades_especiales", "info_medica",
                       "emergencia_nombre", "emergencia_telefono", "nota_salud",
                       "integrantes_hogar", "hermanos", "con_quien_vive",
                       "responsable_economico", "tenencia_vivienda",
                       "rango_ingresos", "personas_dependientes",
                       "nota_socioeconomica",
                       "sin_dato")

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


def sin_dato_de(fila):
    """
    Los campos que en esta ficha se declararon «sin dato por ahora».

    Se guardan como una lista separada por comas. Es un formato pobre a
    propósito: cabe en una columna de texto sin migrar nada, y lo único que
    se hace con él es preguntar si un nombre está dentro.
    """
    crudo = str((fila or {}).get("sin_dato") or "")
    return {c.strip() for c in crudo.split(",") if c.strip()}


def _faltan(fila, definicion):
    """
    Qué campos siguen vacíos SIN que nadie haya dicho que no hay dato.

    Un campo marcado deja de contar como falta: eso es lo que separa «se
    olvidó» de «todavía no existe esa información», que era justo lo que no
    se podía distinguir cuando el vacío era solo un vacío.
    """
    declarados = sin_dato_de(fila)
    return [etiqueta for campo, etiqueta in definicion
            if campo not in declarados
            and not str((fila or {}).get(campo) or "").strip()]


def faltantes_beneficiario(b):
    """Qué campos le faltan a una ficha para estar completa."""
    return _faltan(b, CAMPOS_FICHA_COMPLETA)


# Lo mínimo para que una ficha sirva de algo. No es "todos los campos":
# exigirlo todo haría que ninguna ficha estuviera nunca completa y el
# indicador dejaría de significar nada.
CAMPOS_PERSONAL_COMPLETO = (
    ("documento", "documento"),
    ("cargo", "cargo"),
    ("area", "área"),
    ("fecha_ingreso", "fecha de ingreso"),
    ("telefono", "teléfono"),
)

CAMPOS_RESPONSABLE_COMPLETO = (
    ("documento", "documento"),
    ("telefono", "teléfono"),
)


def faltantes_personal(p):
    """Qué le falta a una ficha de personal para estar completa."""
    return _faltan(p, CAMPOS_PERSONAL_COMPLETO)


# Las columnas que escribe una foto. En una sola lista para que guardar y
# quitar no puedan desincronizarse.
CAMPOS_FOTO = ("foto", "foto_mime", "foto_tam", "foto_ancho", "foto_alto")


def actualizar_foto_responsable(id_, datos):
    """
    Apunta la ficha a una foto nueva, o la deja sin ninguna si datos es None.

    Devuelve el nombre interno de la anterior, para que quien llama pueda
    borrar ese archivo: aquí no se toca el disco, porque si la transacción
    fallara ya no habría forma de recuperarlo.
    """
    fila = responsable(id_)
    if not fila:
        return None
    anterior = fila.get("foto")
    valores = [(datos or {}).get(c) for c in CAMPOS_FOTO]
    with _lock, _conectar() as con:
        con.execute("UPDATE responsables SET "
                    + ", ".join(c + " = ?" for c in CAMPOS_FOTO)
                    + " WHERE id = ?", (*valores, int(id_)))
    return anterior


# ── Invitaciones al formulario público ───────────────────────────────────

CAMPOS_INVITACION = ("token", "responsable_id", "etiqueta", "creada_por",
                     "caduca", "usada", "estado", "nota")


def crear_invitacion(datos):
    campos = [c for c in CAMPOS_INVITACION if c in datos]
    marcas_ = ", ".join("?" for _ in campos)
    with _lock, _conectar() as con:
        cur = con.execute(
            f"INSERT INTO invitaciones ({', '.join(campos)}) VALUES ({marcas_})",
            tuple(datos[c] for c in campos))
        nuevo = cur.lastrowid
    return invitacion(nuevo)


# Una invitación se lee siempre con el nombre de a quién se le entregó:
# sale de la ficha si existe y, si no, de la etiqueta escrita a mano. La
# consulta es una sola para que la fila recién creada y la de la lista
# tengan exactamente la misma forma.
_SELECT_INVITACION = """
    SELECT i.*, COALESCE(NULLIF(r.nombre, ''), i.etiqueta) AS para
      FROM invitaciones i
      LEFT JOIN responsables r ON r.id = i.responsable_id
"""


def invitacion(id_):
    filas = consultar(_SELECT_INVITACION + " WHERE i.id = ?", (int(id_),))
    return filas[0] if filas else None


def invitacion_por_token(token):
    filas = consultar(_SELECT_INVITACION + " WHERE i.token = ?", (str(token),))
    return filas[0] if filas else None


def invitaciones():
    return consultar(_SELECT_INVITACION + " ORDER BY i.id DESC")


def actualizar_invitacion(id_, cambios):
    campos = [c for c in ("estado", "usada", "nota", "responsable_id") if c in cambios]
    if not campos:
        return invitacion(id_)
    with _lock, _conectar() as con:
        con.execute("UPDATE invitaciones SET "
                    + ", ".join(c + " = ?" for c in campos)
                    + " WHERE id = ?",
                    (*[cambios[c] for c in campos], int(id_)))
    return invitacion(id_)


# ── Respuestas del formulario público ────────────────────────────────────

CAMPOS_RESPUESTA = ("origen", "cruda", "normalizada", "token", "invitacion_id",
                    "consentimiento", "estado", "motivo", "responsable_id",
                    "resuelta", "resuelta_por", "huella")


def crear_respuesta_formulario(datos):
    campos = [c for c in CAMPOS_RESPUESTA if c in datos]
    marcas_ = ", ".join("?" for _ in campos)
    with _lock, _conectar() as con:
        cur = con.execute(
            f"INSERT INTO respuestas_formulario ({', '.join(campos)}) "
            f"VALUES ({marcas_})",
            tuple(datos[c] for c in campos))
        return cur.lastrowid


def respuestas_formulario(estado=None):
    """
    La bandeja. Con el nombre de la familia a la que se le dio el enlace,
    que es como se reconoce una respuesta antes de abrirla.
    """
    sql = """
        SELECT rf.*, COALESCE(NULLIF(r.nombre, ''), i.etiqueta) AS para
          FROM respuestas_formulario rf
          LEFT JOIN invitaciones  i ON i.id = rf.invitacion_id
          LEFT JOIN responsables  r ON r.id = rf.responsable_id
    """
    if estado:
        return consultar(sql + " WHERE rf.estado = ? ORDER BY rf.id DESC", (estado,))
    return consultar(sql + " ORDER BY rf.id DESC")


def resolver_respuesta(id_, estado, motivo="", responsable_id=None, usuario_id=None):
    """Marca una respuesta como ingresada o descartada, con su rastro."""
    with _lock, _conectar() as con:
        con.execute(
            """UPDATE respuestas_formulario
                  SET estado = ?, motivo = ?,
                      responsable_id = COALESCE(?, responsable_id),
                      resuelta = datetime('now','localtime'), resuelta_por = ?
                WHERE id = ?""",
            (estado, str(motivo or ""), responsable_id, usuario_id, int(id_)))
    filas = consultar("SELECT * FROM respuestas_formulario WHERE id = ?", (int(id_),))
    return filas[0] if filas else None


def faltantes_responsable(r):
    """Qué le falta a la ficha de un responsable."""
    return _faltan(r, CAMPOS_RESPONSABLE_COMPLETO)


def resumen_personas(dias_nuevos=30):
    """
    Los números del panel de Gestión de Personas, calculados de una vez.

    'nuevos' cuenta las altas de los últimos `dias_nuevos` días. Las fichas
    sin fecha de alta —las anteriores a que existiera la columna— no cuentan
    como nuevas: no se sabe cuándo entraron, y suponerlo sería inventar.
    """
    from datetime import date, timedelta
    corte = (date.today() - timedelta(days=dias_nuevos)).isoformat()

    bens = beneficiarios()
    pers = personal()
    resp = responsables()

    def nuevos(filas):
        return sum(1 for f in filas
                   if f.get("creado") and str(f["creado"])[:10] >= corte)

    incompletos = (
        sum(1 for b in bens if faltantes_beneficiario(b))
        + sum(1 for p in pers if faltantes_personal(p))
        + sum(1 for r in resp if faltantes_responsable(r))
    )

    return {
        "nna": len(bens),
        "responsables": len(resp),
        "personal": len(pers),
        # 'activos' es el total: las tres consultas ya filtran por
        # estado='activo'. Se devuelve igual para que el panel no tenga que
        # saber ese detalle, y para que siga siendo cierto si algún día se
        # deja de filtrar.
        "activos": len(bens) + len(resp) + len(pers),
        "nuevos": nuevos(bens) + nuevos(pers) + nuevos(resp),
        "dias_nuevos": dias_nuevos,
        "incompletos": incompletos,
        "sin_fecha_alta": sum(1 for f in list(bens) + list(pers) + list(resp)
                              if not f.get("creado")),
    }


def beneficiarios(incluir_inactivos=False):
    donde = "" if incluir_inactivos else "WHERE b.estado = 'activo'"
    return consultar(
        f"""SELECT b.*, i.staff_number, i.estado AS estado_biometrico,
                   i.metodo, i.tiene_rostro, i.tiene_huella, i.enrolado
              FROM beneficiarios b
              LEFT JOIN v_identidades i ON i.beneficiario_id = b.id
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
        hay = _tiene_columna(con, "beneficiarios", "creado")
        fecha_col = ", creado" if hay else ""
        fecha_val = ", datetime('now','localtime')" if hay else ""
        cur = con.execute(
            f"INSERT INTO beneficiarios ({', '.join(campos)}{fecha_col}) "
            f"VALUES ({marcas_}{fecha_val})",
            tuple(datos[c] for c in campos),
        )
        con.commit()
        return cur.lastrowid


# ── Hoja de Vida: formación y experiencia ─────────────────────────────────
#
# Dos series por persona. Van en tablas y no en columnas porque nadie sabe de
# antemano cuántos estudios o cuántos trabajos anteriores tiene alguien, y
# 'trabajo_1, trabajo_2, trabajo_3' se queda corto el día que aparece el
# cuarto.

CAMPOS_FORMACION = ("nivel", "institucion", "carrera", "grado",
                    "anio_inicio", "anio_fin", "nota")
CAMPOS_EXPERIENCIA = ("empresa", "cargo", "desde", "hasta", "funciones", "nota")


def formacion_de(personal_id):
    """
    De lo más reciente a lo más antiguo: al abrir una hoja de vida lo que se
    busca es el último título, no el primero.
    """
    return consultar(
        """SELECT * FROM formacion WHERE personal_id = ?
            ORDER BY COALESCE(NULLIF(anio_fin,''), NULLIF(anio_inicio,''), '') DESC,
                     id DESC""",
        (int(personal_id),))


def crear_formacion(personal_id, datos):
    campos = ["personal_id"] + [c for c in CAMPOS_FORMACION if c in datos]
    vals = [int(personal_id)] + [datos[c] for c in campos[1:]]
    with _lock, _conectar() as con:
        cur = con.execute(
            f"INSERT INTO formacion ({', '.join(campos)}) "
            f"VALUES ({', '.join('?' for _ in campos)})", tuple(vals))
        con.commit()
        return cur.lastrowid


def editar_formacion(id_, datos):
    campos = [c for c in CAMPOS_FORMACION if c in datos]
    if not campos:
        return
    ejecutar(f"UPDATE formacion SET {', '.join(c + ' = ?' for c in campos)} WHERE id = ?",
             tuple(datos[c] for c in campos) + (int(id_),))


def borrar_formacion(id_):
    ejecutar("DELETE FROM formacion WHERE id = ?", (int(id_),))


def experiencia_de(personal_id):
    return consultar(
        """SELECT * FROM experiencia WHERE personal_id = ?
            ORDER BY COALESCE(NULLIF(hasta,''), NULLIF(desde,''), '') DESC, id DESC""",
        (int(personal_id),))


def crear_experiencia(personal_id, datos):
    campos = ["personal_id"] + [c for c in CAMPOS_EXPERIENCIA if c in datos]
    vals = [int(personal_id)] + [datos[c] for c in campos[1:]]
    with _lock, _conectar() as con:
        cur = con.execute(
            f"INSERT INTO experiencia ({', '.join(campos)}) "
            f"VALUES ({', '.join('?' for _ in campos)})", tuple(vals))
        con.commit()
        return cur.lastrowid


def editar_experiencia(id_, datos):
    campos = [c for c in CAMPOS_EXPERIENCIA if c in datos]
    if not campos:
        return
    ejecutar(f"UPDATE experiencia SET {', '.join(c + ' = ?' for c in campos)} WHERE id = ?",
             tuple(datos[c] for c in campos) + (int(id_),))


def borrar_experiencia(id_):
    ejecutar("DELETE FROM experiencia WHERE id = ?", (int(id_),))


# ── Series del expediente de beneficiario ─────────────────────────────────
#
# Tres listas que crecen con el tiempo: los programas en los que participa, su
# historial escolar año a año, y el seguimiento social. Las tres cuelgan del
# beneficiario con ON DELETE CASCADE, así que al borrar la ficha se van con
# ella; no hace falta limpiarlas a mano.
#
# El patrón es el mismo de formación y experiencia: una tupla de campos
# permitidos, y el INSERT/UPDATE se arma solo con las claves que llegan. Lo
# que no esté en la tupla se ignora en silencio, que es lo que se quiere: el
# cliente no decide qué columnas existen.

CAMPOS_PROGRAMA = ("programa", "fecha_ingreso", "fecha_salida", "estado", "nota")

CAMPOS_HISTORIAL = ("anio", "institucion", "nivel", "grado", "seccion",
                    "situacion", "rendimiento", "asistencia", "nota")

CAMPOS_SEGUIMIENTO = ("fecha", "responsable_id", "tipo", "situacion", "accion",
                      "compromisos", "nota", "proxima_fecha")


def _crear_en(tabla, campos_ok, beneficiario_id, datos):
    campos = ["beneficiario_id"] + [c for c in campos_ok if c in datos]
    vals = [int(beneficiario_id)] + [datos[c] for c in campos[1:]]
    with _lock, _conectar() as con:
        cur = con.execute(
            f"INSERT INTO {tabla} ({', '.join(campos)}) "
            f"VALUES ({', '.join('?' for _ in campos)})", tuple(vals))
        con.commit()
        return cur.lastrowid


def _editar_en(tabla, campos_ok, id_, datos):
    campos = [c for c in campos_ok if c in datos]
    if not campos:
        return
    ejecutar(f"UPDATE {tabla} SET {', '.join(c + ' = ?' for c in campos)} WHERE id = ?",
             tuple(datos[c] for c in campos) + (int(id_),))


# ── Programas ─────────────────────────────────────────────────────────────

def programas_de(beneficiario_id):
    """
    Los activos primero: son los que importan al abrir la ficha. Dentro de
    cada grupo, el que entró más tarde arriba.
    """
    return consultar(
        """SELECT * FROM programas_beneficiario WHERE beneficiario_id = ?
            ORDER BY CASE WHEN estado = 'activo' THEN 0 ELSE 1 END,
                     COALESCE(NULLIF(fecha_ingreso,''), '') DESC, id DESC""",
        (int(beneficiario_id),))


def crear_programa(beneficiario_id, datos):
    return _crear_en("programas_beneficiario", CAMPOS_PROGRAMA,
                     beneficiario_id, datos)


def editar_programa(id_, datos):
    _editar_en("programas_beneficiario", CAMPOS_PROGRAMA, id_, datos)


def borrar_programa(id_):
    ejecutar("DELETE FROM programas_beneficiario WHERE id = ?", (int(id_),))


# ── Historial educativo ───────────────────────────────────────────────────

def historial_de(beneficiario_id):
    """Del año más reciente al más antiguo."""
    return consultar(
        """SELECT * FROM historial_educativo WHERE beneficiario_id = ?
            ORDER BY COALESCE(NULLIF(anio,''), '') DESC, id DESC""",
        (int(beneficiario_id),))


def crear_historial(beneficiario_id, datos):
    return _crear_en("historial_educativo", CAMPOS_HISTORIAL,
                     beneficiario_id, datos)


def editar_historial(id_, datos):
    _editar_en("historial_educativo", CAMPOS_HISTORIAL, id_, datos)


def borrar_historial(id_):
    ejecutar("DELETE FROM historial_educativo WHERE id = ?", (int(id_),))


# ── Seguimiento social ────────────────────────────────────────────────────

def seguimiento_de(beneficiario_id):
    """
    Lo último arriba. Se trae el nombre de quien lo hizo con un LEFT JOIN: la
    tabla guarda el id, no el nombre, para que no acaben conviviendo tres
    formas de escribir a la misma persona. Si esa ficha se borró, el id queda
    en NULL y aquí sale vacío en vez de romper.
    """
    return consultar(
        """SELECT s.*, p.nombre AS responsable_nombre
             FROM seguimiento s
             LEFT JOIN personal p ON p.id = s.responsable_id
            WHERE s.beneficiario_id = ?
            ORDER BY s.fecha DESC, s.id DESC""",
        (int(beneficiario_id),))


def crear_seguimiento(beneficiario_id, datos):
    return _crear_en("seguimiento", CAMPOS_SEGUIMIENTO, beneficiario_id, datos)


def editar_seguimiento(id_, datos):
    _editar_en("seguimiento", CAMPOS_SEGUIMIENTO, id_, datos)


def borrar_seguimiento(id_):
    ejecutar("DELETE FROM seguimiento WHERE id = ?", (int(id_),))


# ── Canal web: consentimiento y rostro de referencia ──────────────────────
#
# El orden importa y está impuesto por la ley, no por comodidad: sin
# consentimiento aceptado no se guarda ningún descriptor. Esa regla se
# comprueba en app.py antes de escribir, y aquí se le da lo que necesita para
# poder comprobarla.

def consentimiento_vigente(personal_id, tipo="rostro_web"):
    """
    El último consentimiento de esta persona, aceptado y no revocado. None si
    nunca aceptó, si dijo que no, o si lo revocó después.
    """
    filas = consultar(
        """SELECT * FROM consentimientos
            WHERE personal_id = ? AND tipo = ?
            ORDER BY id DESC LIMIT 1""",
        (int(personal_id), tipo),
    )
    if not filas:
        return None
    ult = filas[0]
    if not ult["aceptado"] or (ult["revocado_el"] or "").strip():
        return None
    return ult


def consentimientos_de(personal_id, tipo=None):
    """El histórico completo. Un rechazo o una revocación también cuentan."""
    if tipo:
        return consultar(
            """SELECT * FROM consentimientos WHERE personal_id = ? AND tipo = ?
                ORDER BY id DESC""", (int(personal_id), tipo))
    return consultar(
        "SELECT * FROM consentimientos WHERE personal_id = ? ORDER BY id DESC",
        (int(personal_id),))


def registrar_consentimiento(personal_id, aceptado, version, texto,
                             tipo="rostro_web", ip="", agente=""):
    """
    Siempre INSERTA. Nunca actualiza el anterior: el histórico de quién
    aceptó qué y cuándo es justamente lo que hay que poder demostrar.
    """
    return ejecutar(
        """INSERT INTO consentimientos
               (personal_id, tipo, aceptado, version, texto, ip, agente)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (int(personal_id), tipo, 1 if aceptado else 0, version, texto, ip, agente),
    )


def revocar_consentimiento(personal_id, tipo="rostro_web"):
    """
    Marca el vigente como revocado. No borra nada: quedan las dos cosas, que
    lo aceptó y que después se echó atrás.
    """
    ejecutar(
        """UPDATE consentimientos
              SET revocado_el = datetime('now','localtime')
            WHERE personal_id = ? AND tipo = ? AND aceptado = 1
              AND (revocado_el IS NULL OR revocado_el = '')""",
        (int(personal_id), tipo),
    )


# ── El rostro del canal web ───────────────────────────────────────────────

def rostro_web(personal_id):
    filas = consultar("SELECT * FROM rostros_web WHERE personal_id = ?",
                      (int(personal_id),))
    return filas[0] if filas else None


def rostros_web_registrados():
    """
    Quién tiene rostro del canal web y quién no. Alimenta el seguimiento del
    enrolamiento, que se exige a todo el personal desde el lanzamiento.
    """
    return consultar(
        """SELECT p.id, p.nombre, p.cargo, p.area,
                  r.creado, r.modelo, r.dimension,
                  (SELECT COUNT(*) FROM consentimientos c
                    WHERE c.personal_id = p.id AND c.tipo = 'rostro_web'
                      AND c.aceptado = 1
                      AND (c.revocado_el IS NULL OR c.revocado_el = '')) AS consintio
             FROM personal p
             LEFT JOIN rostros_web r ON r.personal_id = p.id
            WHERE p.estado = 'activo'
            ORDER BY p.nombre"""
    )


def guardar_rostro_web(personal_id, descriptor_json, dimension, modelo,
                       registrado_por=None):
    """
    Crea o reemplaza el descriptor. Reemplazar es lo correcto: si alguien
    vuelve a enrolarse es porque el anterior no servía.
    """
    ejecutar(
        """INSERT INTO rostros_web
               (personal_id, descriptor, dimension, modelo, registrado_por)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(personal_id) DO UPDATE SET
               descriptor = excluded.descriptor,
               dimension = excluded.dimension,
               modelo = excluded.modelo,
               registrado_por = excluded.registrado_por,
               actualizado = datetime('now','localtime')""",
        (int(personal_id), descriptor_json, int(dimension), modelo,
         registrado_por),
    )


def borrar_rostro_web(personal_id):
    """
    Se lleva el descriptor y deja el consentimiento. Son cosas distintas: el
    dato biométrico se puede eliminar; la constancia de que se pidió permiso
    hay que conservarla.
    """
    ejecutar("DELETE FROM rostros_web WHERE personal_id = ?", (int(personal_id),))


# ── Responsables / tutores ────────────────────────────────────────────────
#
# Un responsable existe por sí mismo, no cuelga de ningún beneficiario: se
# registra una vez y se vincula a los niños que corresponda. Por eso las
# consultas del vínculo van aparte de las de la ficha.

CAMPOS_RESPONSABLE = (
    "codigo", "nombre", "documento", "fecha_nac", "sexo", "nacionalidad",
    "estado", "telefono", "telefono_alt", "correo", "departamento",
    "provincia", "distrito", "direccion", "referencia", "ocupacion",
    "situacion_laboral", "centro_trabajo", "tipo_trabajo", "rango_ingresos",
    "personas_a_cargo", "nota", "origen", "origen_personal_id",
    "sin_dato",
)


def responsables(incluir_inactivos=False, texto=""):
    """
    Con cuántos beneficiarios está vinculado cada uno, que es lo primero que
    se quiere ver en el listado.

    'texto' busca por nombre o documento: en una lista de responsables el
    buscador no es un lujo, porque no hay otra forma de encontrar a alguien
    cuyo nombre solo se recuerda a medias.
    """
    donde, params = [], []
    if not incluir_inactivos:
        donde.append("r.estado = 'activo'")
    if texto:
        donde.append("(r.nombre LIKE ? OR r.documento LIKE ?)")
        params += [f"%{texto}%", f"%{texto}%"]
    sql = """SELECT r.*,
                    (SELECT COUNT(*) FROM responsable_beneficiario rb
                      WHERE rb.responsable_id = r.id) AS beneficiarios
               FROM responsables r"""
    if donde:
        sql += " WHERE " + " AND ".join(donde)
    return consultar(sql + " ORDER BY r.nombre", tuple(params))


def responsable(id_):
    filas = consultar("SELECT * FROM responsables WHERE id = ?", (int(id_),))
    return filas[0] if filas else None


def crear_responsable(datos):
    campos = [c for c in CAMPOS_RESPONSABLE if c in datos]
    marcas_ = ", ".join("?" for _ in campos)
    with _lock, _conectar() as con:
        cur = con.execute(
            f"INSERT INTO responsables ({', '.join(campos)}) VALUES ({marcas_})",
            tuple(datos[c] for c in campos),
        )
        con.commit()
        return cur.lastrowid


def editar_responsable(id_, datos):
    campos = [c for c in CAMPOS_RESPONSABLE if c in datos]
    if not campos:
        return
    ejecutar(
        f"UPDATE responsables SET {', '.join(c + ' = ?' for c in campos)} WHERE id = ?",
        tuple(datos[c] for c in campos) + (int(id_),),
    )


def borrar_responsable(id_):
    # Los vínculos se van solos por la clave foránea en cascada; el
    # beneficiario NO, que para eso son entidades distintas.
    ejecutar("DELETE FROM responsables WHERE id = ?", (int(id_),))


# ── El vínculo ────────────────────────────────────────────────────────────

CAMPOS_VINCULO = ("parentesco", "es_principal", "es_legal", "puede_recoger",
                  "es_emergencia", "nota")


def responsables_de(beneficiario_id):
    """Quiénes están a cargo de un beneficiario, con el papel de cada uno."""
    return consultar(
        """SELECT rb.*, r.nombre, r.documento, r.telefono, r.correo,
                  r.ocupacion, r.estado AS estado_responsable
             FROM responsable_beneficiario rb
             JOIN responsables r ON r.id = rb.responsable_id
            WHERE rb.beneficiario_id = ?
            ORDER BY rb.es_principal DESC, r.nombre""",
        (int(beneficiario_id),),
    )


def beneficiarios_de(responsable_id):
    """A qué niños está vinculado un responsable."""
    return consultar(
        """SELECT rb.*, b.nombre, b.fecha_nac, b.casa, b.sala, b.grado,
                  b.estado AS estado_beneficiario
             FROM responsable_beneficiario rb
             JOIN beneficiarios b ON b.id = rb.beneficiario_id
            WHERE rb.responsable_id = ?
            ORDER BY b.nombre""",
        (int(responsable_id),),
    )


def vincular(responsable_id, beneficiario_id, datos=None):
    """
    Crea o actualiza el vínculo. Es idempotente a propósito: volver a
    vincular al mismo par actualiza el papel en vez de reventar contra el
    UNIQUE, que es lo que espera quien corrige un parentesco mal puesto.
    """
    datos = datos or {}
    campos = [c for c in CAMPOS_VINCULO if c in datos]
    with _lock, _conectar() as con:
        fila = con.execute(
            """SELECT id FROM responsable_beneficiario
                WHERE responsable_id = ? AND beneficiario_id = ?""",
            (int(responsable_id), int(beneficiario_id)),
        ).fetchone()
        if fila:
            if campos:
                con.execute(
                    f"""UPDATE responsable_beneficiario
                           SET {', '.join(c + ' = ?' for c in campos)}
                         WHERE id = ?""",
                    tuple(datos[c] for c in campos) + (fila["id"],),
                )
            con.commit()
            return fila["id"]
        cols = ["responsable_id", "beneficiario_id"] + campos
        vals = [int(responsable_id), int(beneficiario_id)] + [datos[c] for c in campos]
        cur = con.execute(
            f"""INSERT INTO responsable_beneficiario ({', '.join(cols)})
                VALUES ({', '.join('?' for _ in cols)})""",
            tuple(vals),
        )
        con.commit()
        return cur.lastrowid


def desvincular(responsable_id, beneficiario_id):
    ejecutar(
        """DELETE FROM responsable_beneficiario
            WHERE responsable_id = ? AND beneficiario_id = ?""",
        (int(responsable_id), int(beneficiario_id)),
    )


# ── Identidades biométricas ───────────────────────────────────────────────

def identidades():
    return consultar("SELECT * FROM v_identidades ORDER BY staff_number")


def identidad(staff_number):
    filas = consultar("SELECT * FROM v_identidades WHERE staff_number = ?",
                      (int(staff_number),))
    return filas[0] if filas else None


# Las tres entidades que pueden tener identidad biométrica, y la columna
# donde vive cada una. En un solo sitio: cuando esto era un ternario de dos
# ramas repetido en dos funciones, añadir la tercera obligaba a acordarse de
# los dos.
COLUMNA_TITULAR = {
    "personal":     "personal_id",
    "beneficiario": "beneficiario_id",
    "responsable":  "responsable_id",
}


def _columna_titular(tipo):
    try:
        return COLUMNA_TITULAR[tipo]
    except KeyError:
        raise ValueError(f"Tipo de titular no reconocido: {tipo!r}")


def identidad_de(tipo, titular_id):
    columna = _columna_titular(tipo)
    filas = consultar(f"SELECT * FROM v_identidades WHERE {columna} = ?",
                      (int(titular_id),))
    return filas[0] if filas else None


def crear_identidad(staff_number, tipo, titular_id, metodo):
    """
    Reserva el staffNumber para una persona que YA existe. El CHECK de la
    tabla garantiza que solo se rellene una de las tres claves.
    """
    sn = config.validar_rango(staff_number)
    columna = _columna_titular(tipo)
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
    Quiénes pueden enrolarse todavía: personal, beneficiarios y responsables
    activos que aún no tienen identidad biométrica.

    Nadie se da de alta aquí a mano: en cuanto se crea una ficha en Gestión
    de Personas aparece sola en esta lista, y desaparece en cuanto se enrola.
    Es lo que alimenta la pantalla de Gestión Biométrica.
    """
    # Se une contra la VISTA, no contra la tabla: ahí vive la única
    # definición de «enrolado». Y la condición es «no está enrolado», no
    # «no tiene fila»: quien lo intentó y se quedó a medias sigue sin poder
    # marcar, así que sigue haciendo falta en esta lista.
    filas = consultar(
        """SELECT * FROM (
           SELECT 'personal' AS tipo, p.id, p.nombre, p.cargo AS detalle,
                  p.vinculo, p.ambito,
                  i.staff_number AS intento_sn, i.estado AS intento_estado,
                  i.metodo AS intento_metodo, i.detalle AS intento_detalle
             FROM personal p
             LEFT JOIN v_identidades i ON i.personal_id = p.id
            WHERE p.estado = 'activo'
              AND (i.staff_number IS NULL OR i.enrolado = 0)
            UNION ALL
           SELECT 'beneficiario' AS tipo, b.id, b.nombre, b.casa AS detalle,
                  NULL AS vinculo, 'ninos' AS ambito,
                  i.staff_number, i.estado, i.metodo, i.detalle
             FROM beneficiarios b
             LEFT JOIN v_identidades i ON i.beneficiario_id = b.id
            WHERE b.estado = 'activo'
              AND (i.staff_number IS NULL OR i.enrolado = 0)
            UNION ALL
           -- Los tutores no tienen ámbito ni vínculo: no trabajan aquí. Se
           -- deja NULL en vez de inventarles uno para que no se cuelen en
           -- los filtros por área del personal.
           SELECT 'responsable' AS tipo, r.id, r.nombre,
                  COALESCE(NULLIF(r.ocupacion,''), 'Responsable') AS detalle,
                  NULL AS vinculo, NULL AS ambito,
                  i.staff_number, i.estado, i.metodo, i.detalle
             FROM responsables r
             LEFT JOIN v_identidades i ON i.responsable_id = r.id
            WHERE r.estado = 'activo'
              AND (i.staff_number IS NULL OR i.enrolado = 0)
           ) ORDER BY nombre"""
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

def guardar_marca(staff_number, fecha, hora, metodo="facial", canal="terminal"):
    """
    'canal' por defecto 'terminal' para no cambiar el comportamiento de la
    sincronización, que es de donde vienen casi todas las marcas.
    """
    if not config.en_rango(staff_number):
        return 0
    if canal not in config.CANALES_MARCA:
        canal = "terminal"
    return ejecutar(
        """INSERT OR IGNORE INTO marcas (staff_number, fecha, hora, metodo, canal)
           SELECT ?, ?, ?, ?, ? WHERE EXISTS
           (SELECT 1 FROM identidades WHERE staff_number = ?)""",
        (int(staff_number), fecha, hora, metodo, canal, int(staff_number)),
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
            -- Solo quien el terminal confirmó. Un enrolamiento a medias no
            -- puede marcar, así que enseñarlo aquí sin marcas se leería
            -- como una falta suya.
            WHERE v.enrolado = 1
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
            WHERE v.enrolado = 1          -- ver marcas_de()
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

# Los tipos válidos, en un solo sitio. Estaban escritos a mano dentro de
# crear_solicitud, y al ampliar la tabla a seis tipos esa copia se quedó
# atrás y rechazaba lo que la base sí aceptaba. Debe coincidir con el CHECK
# de la tabla; solicitudes.py lee de aquí en vez de repetirla.
TIPOS_SOLICITUD = ("vacaciones", "personal", "familiar", "medico",
                   "licencia", "otro")


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
    if tipo not in TIPOS_SOLICITUD:
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
