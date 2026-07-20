-- ============================================================
--  ERP Lost Children — Schema MySQL 8+
--  Compatible con MySQL Community Server 9.x
-- ============================================================

CREATE DATABASE IF NOT EXISTS erp_lost_children
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE erp_lost_children;

-- ─── 1. PERSONAS ─────────────────────────────────────────────
-- NOTA: esta tabla incluye todas las columnas que bridge/server.py realmente
-- usa en sus INSERT/UPDATE de /personas (antes esta versión del esquema
-- estaba desactualizada y no las tenía, por lo que una instalación limpia
-- desde este archivo hacía fallar cada alta/edición de persona).
CREATE TABLE personas (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    nombre         VARCHAR(100) NOT NULL,
    tipo           ENUM('nino','misionero','voluntario','staff','padre') NOT NULL,
    estado         ENUM('activo','inactivo','alerta') NOT NULL DEFAULT 'activo',
    edad           TINYINT UNSIGNED,
    genero         CHAR(1) CHECK (genero IN ('F','M')),
    tutor          VARCHAR(150),
    ingreso        DATE,
    inicial        VARCHAR(4),
    avatar_bg      VARCHAR(20),
    avatar_fg      VARCHAR(20),
    foto_url            VARCHAR(255)  NULL,
    dni                 VARCHAR(30)   NOT NULL DEFAULT '',
    fecha_nacimiento    DATE          NULL,
    nacionalidad        VARCHAR(80)   NOT NULL DEFAULT '',
    telefono            VARCHAR(30)   NOT NULL DEFAULT '',
    email               VARCHAR(120)  NOT NULL DEFAULT '',
    direccion           TEXT          NULL,
    barrio              VARCHAR(100)  NOT NULL DEFAULT '',
    parentesco_tutor    VARCHAR(60)   NOT NULL DEFAULT '',
    telefono_tutor      VARCHAR(30)   NOT NULL DEFAULT '',
    situacion_familiar  VARCHAR(100)  NOT NULL DEFAULT '',
    grupo_sanguineo     VARCHAR(10)   NOT NULL DEFAULT '',
    alergias            TEXT          NULL,
    condicion_medica    TEXT          NULL,
    escolaridad         VARCHAR(100)  NOT NULL DEFAULT '',
    colegio             VARCHAR(150)  NOT NULL DEFAULT '',
    procedencia         VARCHAR(100)  NOT NULL DEFAULT '',
    motivo_ingreso      TEXT          NULL,
    prioridad           ENUM('alta','media','baja') NOT NULL DEFAULT 'media',
    observaciones       TEXT          NULL,
    ocupacion           VARCHAR(150)  NOT NULL DEFAULT '',
    organizacion        VARCHAR(200)  NOT NULL DEFAULT '',
    pais_origen         VARCHAR(100)  NOT NULL DEFAULT '',
    area_servicio       VARCHAR(150)  NOT NULL DEFAULT '',
    tipo_vinculo        VARCHAR(100)  NOT NULL DEFAULT '',
    fecha_fin           DATE          NULL,
    ingreso_familiar    VARCHAR(100)  NOT NULL DEFAULT '',
    num_hijos_programa  TINYINT UNSIGNED NOT NULL DEFAULT 0,
    creado_en      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ─── 2. ASISTENCIA ───────────────────────────────────────────
CREATE TABLE asistencia (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    persona_id  INT NOT NULL,
    fecha       DATE NOT NULL DEFAULT (CURRENT_DATE),
    presente    BOOLEAN NOT NULL DEFAULT FALSE,
    hora        TIME,
    metodo      VARCHAR(50) DEFAULT '—',
    zk_user_id  VARCHAR(20),
    creado_en   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_persona_fecha (persona_id, fecha),
    -- RESTRICT (no CASCADE): personas usa borrado lógico (estado='inactivo'),
    -- nunca DELETE físico. Si algún día se hiciera un DELETE FROM personas,
    -- RESTRICT bloquea la operación en vez de borrar en cascada el historial
    -- de asistencia del menor — consistente con el resto de FKs hacia personas.
    FOREIGN KEY (persona_id) REFERENCES personas(id) ON DELETE RESTRICT
);

CREATE INDEX idx_asistencia_fecha   ON asistencia(fecha);
CREATE INDEX idx_asistencia_persona ON asistencia(persona_id);

-- ─── 3. ARTÍCULOS ────────────────────────────────────────────
CREATE TABLE articulos (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    nombre         VARCHAR(100) NOT NULL,
    categoria      VARCHAR(30)  NOT NULL,
    unidad         VARCHAR(20)  NOT NULL,
    stock          DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (stock >= 0),
    minimo         DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (minimo >= 0),
    vence          DATE,
    activo         BOOLEAN DEFAULT TRUE,
    precio         DECIMAL(10,2) DEFAULT 0.00,
    descripcion    TEXT,
    proveedor      VARCHAR(200) DEFAULT '',
    codigo         VARCHAR(50)  DEFAULT '',
    imagen         VARCHAR(255) DEFAULT '',
    ubicacion      VARCHAR(100) DEFAULT '',
    creado_en      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ─── 4. MOVIMIENTOS DE ALMACÉN ───────────────────────────────
CREATE TABLE movimientos_almacen (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    articulo_id      INT NOT NULL,
    tipo             ENUM('entrada','salida') NOT NULL,
    cantidad         DECIMAL(10,2) NOT NULL CHECK (cantidad > 0),
    -- `fecha` no está cubierta por la auto-migración de server.py
    -- (_migrar_esquema) — a diferencia de origen/costo_total/proveedor_donante,
    -- que sí se auto-agregan ahí. Sin esta columna, POST /entregas y el
    -- registro de servicios de alimentación fallan con
    -- "Unknown column 'fecha'" (confirmado corriendo el esquema en vivo).
    fecha            DATE DEFAULT (CURRENT_DATE),
    origen           ENUM('compra','donacion') DEFAULT 'compra',
    costo_total      DECIMAL(10,2) DEFAULT 0.00,
    proveedor_donante VARCHAR(200) DEFAULT '',
    stock_anterior   DECIMAL(10,2),
    stock_resultante DECIMAL(10,2),
    motivo           VARCHAR(50),
    proveedor        VARCHAR(100),
    referencia_id    INT,
    referencia_tipo  VARCHAR(30),
    observacion      TEXT,
    registrado_por   INT,
    creado_en        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (articulo_id)    REFERENCES articulos(id),
    FOREIGN KEY (registrado_por) REFERENCES personas(id)
);

CREATE INDEX idx_mov_articulo ON movimientos_almacen(articulo_id);
CREATE INDEX idx_mov_fecha    ON movimientos_almacen(creado_en);

-- ─── 5. GASTOS ───────────────────────────────────────────────
CREATE TABLE gastos (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    fecha           DATE NOT NULL DEFAULT (CURRENT_DATE),
    categoria       VARCHAR(30) NOT NULL,
    monto           DECIMAL(10,2) NOT NULL CHECK (monto > 0),
    proveedor       VARCHAR(100) NOT NULL,
    fondo           VARCHAR(100) DEFAULT 'Fondo General',
    observacion     TEXT,
    comprobante_url TEXT,
    cat_bg          VARCHAR(20),
    cat_fg          VARCHAR(20),
    fuente_auto     VARCHAR(50) DEFAULT '',
    registrado_por  INT,
    creado_en       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (registrado_por) REFERENCES personas(id)
);

CREATE INDEX idx_gastos_fecha     ON gastos(fecha);
CREATE INDEX idx_gastos_categoria ON gastos(categoria);

-- ─── 6. PRESUPUESTO MENSUAL ──────────────────────────────────
CREATE TABLE presupuesto_mensual (
    id        INT AUTO_INCREMENT PRIMARY KEY,
    anio      SMALLINT NOT NULL,
    mes       TINYINT  NOT NULL CHECK (mes BETWEEN 1 AND 12),
    monto     DECIMAL(10,2) NOT NULL,
    notas     TEXT,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_anio_mes (anio, mes)
);

INSERT INTO presupuesto_mensual (anio, mes, monto) VALUES (2026, 6, 2400.00);

-- ─── 7. CAMPAÑAS ─────────────────────────────────────────────
CREATE TABLE campanas (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    nombre      VARCHAR(50) NOT NULL UNIQUE,
    descripcion TEXT,
    activa      BOOLEAN DEFAULT TRUE,
    bg_color    VARCHAR(20),
    fg_color    VARCHAR(20),
    creado_en   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO campanas (nombre, bg_color, fg_color) VALUES
    ('Navidad',         '#EDE7FD', '#6B4EEA'),
    ('Campaña escolar', '#FDF2D5', '#9A6B0A'),
    ('Cumpleaños',      '#FDE7E1', '#C24A30'),
    ('General',         '#F0ECE2', '#6E7872');

-- ─── 8. ENTREGAS ─────────────────────────────────────────────
CREATE TABLE entregas (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    fecha          DATE NOT NULL DEFAULT (CURRENT_DATE),
    persona_id     INT  NOT NULL,
    articulo_id    INT  NOT NULL,
    cantidad       DECIMAL(10,2) NOT NULL CHECK (cantidad > 0),
    campana_id     INT,
    observacion    TEXT,
    notas          TEXT,
    registrado_por INT,
    creado_en      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (persona_id)     REFERENCES personas(id),
    FOREIGN KEY (articulo_id)    REFERENCES articulos(id),
    FOREIGN KEY (campana_id)     REFERENCES campanas(id),
    FOREIGN KEY (registrado_por) REFERENCES personas(id)
);

CREATE INDEX idx_entregas_persona ON entregas(persona_id);
CREATE INDEX idx_entregas_fecha   ON entregas(fecha);

-- ─── 9. SERVICIOS DE ALIMENTACIÓN ────────────────────────────
CREATE TABLE servicios_alimentacion (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    fecha           DATE NOT NULL DEFAULT (CURRENT_DATE),
    menu            VARCHAR(100) NOT NULL,
    total_raciones  INT NOT NULL,
    ninos           INT NOT NULL DEFAULT 0,
    misioneros      INT NOT NULL DEFAULT 0,
    voluntarios     SMALLINT DEFAULT 0,
    padres          SMALLINT DEFAULT 0,
    staff           SMALLINT DEFAULT 0,
    costo_total     DECIMAL(10,2),
    costo_racion    DECIMAL(6,2),
    costo_por_plato DECIMAL(10,2) DEFAULT 0.00,
    insumos_desc    TEXT,
    consumo_json    TEXT,
    descontado      BOOLEAN DEFAULT FALSE,
    registrado_por  INT,
    creado_en       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (registrado_por) REFERENCES personas(id)
);

CREATE INDEX idx_servicios_fecha ON servicios_alimentacion(fecha);

-- ─── 10. DETALLE INSUMOS POR SERVICIO ────────────────────────
CREATE TABLE servicio_insumos (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    servicio_id         INT NOT NULL,
    articulo_id         INT NOT NULL,
    cantidad_usada      DECIMAL(10,3) NOT NULL,
    cantidad_por_racion DECIMAL(8,4),
    FOREIGN KEY (servicio_id) REFERENCES servicios_alimentacion(id) ON DELETE CASCADE,
    FOREIGN KEY (articulo_id) REFERENCES articulos(id)
);

-- ─── 11. RECETA BASE ─────────────────────────────────────────
CREATE TABLE receta_base (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    articulo_id    INT NOT NULL,
    por_racion     DECIMAL(8,5) NOT NULL,
    activo         BOOLEAN DEFAULT TRUE,
    actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (articulo_id) REFERENCES articulos(id)
);

-- ─── 12. LOGS DEL ZKTeco SF420 ───────────────────────────────
CREATE TABLE zkteco_logs (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    zk_user_id  VARCHAR(20) NOT NULL,
    timestamp   DATETIME    NOT NULL,
    tipo        VARCHAR(20) DEFAULT 'entrada',
    metodo      VARCHAR(20) DEFAULT 'huella',
    dispositivo VARCHAR(50) DEFAULT 'SF420',
    procesado   BOOLEAN DEFAULT FALSE,
    creado_en   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_user_timestamp (zk_user_id, timestamp)
);

CREATE INDEX idx_zkteco_fecha     ON zkteco_logs(timestamp);
CREATE INDEX idx_zkteco_user      ON zkteco_logs(zk_user_id);
CREATE INDEX idx_zkteco_procesado ON zkteco_logs(procesado);

-- ─── 13. ACTIVIDAD ───────────────────────────────────────────
CREATE TABLE actividad (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    texto           TEXT NOT NULL,
    lugar           VARCHAR(100),
    color           VARCHAR(50),
    modulo          VARCHAR(30),
    referencia_id   INT,
    referencia_tipo VARCHAR(30),
    creado_en       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_actividad_creado ON actividad(creado_en);

-- ─── 13b. FONDOS (ingresos/egresos) ──────────────────────────
-- Antes no existía en este archivo — server.py la auto-crea en runtime
-- (_init_fondos) si falta, pero un fresh install que solo mire este .sql
-- se quedaba sin esta tabla ni referencia de su estructura real.
CREATE TABLE fondos_movimientos (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    tipo          ENUM('ingreso','egreso') NOT NULL,
    monto         DECIMAL(10,2) NOT NULL,
    descripcion   VARCHAR(255) DEFAULT '',
    categoria     VARCHAR(100) DEFAULT '',
    fuente        VARCHAR(50)  DEFAULT 'manual',
    referencia_id INT          DEFAULT NULL,
    fecha         DATE         NOT NULL,
    created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_fondos_fecha ON fondos_movimientos(fecha);

-- ─── 14. USUARIOS DEL SISTEMA ────────────────────────────────
-- NOTA: esta versión reemplaza a una anterior desactualizada que tenía
-- `email UNIQUE` y roles ('responsable','operador','visor') que server.py
-- nunca usa — el login real filtra por `username` y los roles válidos son
-- admin/coordinador/voluntario/kiosko/donador (ver _ROLES_VALIDOS y
-- _init_usuarios() en bridge/server.py, que es la fuente de verdad real).
CREATE TABLE usuarios_sistema (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    nombre         VARCHAR(100) NOT NULL,
    username       VARCHAR(50)  NOT NULL UNIQUE,
    password_hash  VARCHAR(255) NOT NULL,
    rol            ENUM('admin','coordinador','voluntario','kiosko','donador') DEFAULT 'voluntario',
    activo         BOOLEAN DEFAULT TRUE,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
--  VISTAS
-- ============================================================

CREATE OR REPLACE VIEW v_asistencia_hoy AS
SELECT
    a.id,
    a.persona_id,
    p.nombre,
    p.tipo,
    p.inicial,
    p.avatar_bg,
    p.avatar_fg,
    a.presente,
    a.hora,
    a.metodo,
    a.fecha
FROM asistencia a
JOIN personas p ON p.id = a.persona_id
WHERE a.fecha = CURRENT_DATE;

CREATE OR REPLACE VIEW v_articulos_criticos AS
SELECT
    id, nombre, categoria, stock, minimo, unidad,
    ROUND((stock / NULLIF(minimo, 0)) * 100) AS pct_stock
FROM articulos
WHERE stock < minimo AND activo = TRUE
ORDER BY pct_stock ASC;

-- ============================================================
--  DATOS INICIALES
-- ============================================================

-- NOTA: antes había aquí un INSERT con 12 personas de ejemplo (nombres,
-- edades, tutores). Se quitó del esquema versionado a propósito: un sistema
-- que maneja datos de menores no debe tener, ni siquiera como demo, filas
-- con forma de niño identificable versionadas en git. Si se necesitan datos
-- de prueba, generarlos en un script de seed aparte (no versionado, o con
-- nombres evidentemente ficticios tipo "Niño Demo 1").

INSERT INTO articulos (nombre, categoria, stock, minimo, unidad, vence) VALUES
    ('Arroz blanco',      'Alimentos',   18,  20, 'kg',  '2026-08-10'),
    ('Leche UHT',         'Alimentos',   12,  24, 'lts', '2026-07-05'),
    ('Lentejas',          'Alimentos',   8,   15, 'kg',  '2026-09-20'),
    ('Pollo',             'Proteínas',   35,  20, 'kg',  '2026-06-28'),
    ('Aceite vegetal',    'Condimentos', 9,   10, 'lts', '2026-12-01'),
    ('Cuadernos',         'Útiles',      60,  30, 'uds', NULL),
    ('Jabón de barra',    'Higiene',     24,  20, 'uds', '2027-03-15'),
    ('Juguetes medianos', 'Regalos',     15,  10, 'uds', NULL),
    ('Frijoles',          'Alimentos',   22,  15, 'kg',  '2026-10-01'),
    ('Verduras surtidas', 'Alimentos',   14,  10, 'kg',  '2026-06-29');

INSERT INTO receta_base (articulo_id, por_racion) VALUES
    (1,  0.05),
    (4,  0.10),
    (5,  0.006),
    (10, 0.03);
