-- ============================================================
--  ERP Lost Children — Schema MySQL 8+
--  Compatible con MySQL Community Server 9.x
-- ============================================================

CREATE DATABASE IF NOT EXISTS erp_lost_children
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE erp_lost_children;

-- ─── 1. PERSONAS ─────────────────────────────────────────────
CREATE TABLE personas (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    nombre         VARCHAR(100) NOT NULL,
    tipo           ENUM('nino','misionero','voluntario','staff') NOT NULL,
    estado         ENUM('activo','inactivo','alerta') NOT NULL DEFAULT 'activo',
    edad           TINYINT UNSIGNED,
    genero         CHAR(1) CHECK (genero IN ('F','M')),
    tutor          VARCHAR(150),
    ingreso        DATE,
    inicial        VARCHAR(2),
    avatar_bg      VARCHAR(20),
    avatar_fg      VARCHAR(20),
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
    FOREIGN KEY (persona_id) REFERENCES personas(id) ON DELETE CASCADE
);

CREATE INDEX idx_asistencia_fecha   ON asistencia(fecha);
CREATE INDEX idx_asistencia_persona ON asistencia(persona_id);

-- ─── 3. ARTÍCULOS ────────────────────────────────────────────
CREATE TABLE articulos (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    nombre         VARCHAR(100) NOT NULL,
    categoria      VARCHAR(30)  NOT NULL,
    unidad         VARCHAR(20)  NOT NULL,
    stock          DECIMAL(10,2) NOT NULL DEFAULT 0,
    minimo         DECIMAL(10,2) NOT NULL DEFAULT 0,
    vence          DATE,
    activo         BOOLEAN DEFAULT TRUE,
    creado_en      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ─── 4. MOVIMIENTOS DE ALMACÉN ───────────────────────────────
CREATE TABLE movimientos_almacen (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    articulo_id      INT NOT NULL,
    tipo             ENUM('entrada','salida') NOT NULL,
    cantidad         DECIMAL(10,2) NOT NULL,
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
    monto           DECIMAL(10,2) NOT NULL,
    proveedor       VARCHAR(100) NOT NULL,
    fondo           VARCHAR(100) DEFAULT 'Fondo General',
    observacion     TEXT,
    comprobante_url TEXT,
    cat_bg          VARCHAR(20),
    cat_fg          VARCHAR(20),
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
    cantidad       DECIMAL(10,2) NOT NULL,
    campana_id     INT,
    observacion    TEXT,
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
    costo_total     DECIMAL(10,2),
    costo_racion    DECIMAL(6,2),
    insumos_desc    TEXT,
    descontado      BOOLEAN DEFAULT FALSE,
    registrado_por  INT,
    creado_en       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (registrado_por) REFERENCES personas(id)
);

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

-- ─── 14. USUARIOS DEL SISTEMA ────────────────────────────────
CREATE TABLE usuarios_sistema (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    persona_id     INT,
    email          VARCHAR(150) NOT NULL UNIQUE,
    password_hash  TEXT NOT NULL,
    rol            ENUM('admin','responsable','operador','visor') DEFAULT 'operador',
    activo         BOOLEAN DEFAULT TRUE,
    ultimo_acceso  TIMESTAMP NULL,
    creado_en      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (persona_id) REFERENCES personas(id)
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

INSERT INTO personas (nombre, tipo, estado, edad, genero, tutor, ingreso, inicial, avatar_bg, avatar_fg) VALUES
    ('Camila Rojas',     'nino',      'activo',   8,  'F', 'Ana Rojas (madre)',     '2024-03-01', 'CR', '#DDEDF1', '#1C6678'),
    ('Diego Ramírez',    'nino',      'alerta',   10, 'M', 'Luis Ramírez (padre)',  '2024-01-01', 'DR', '#FDF2D5', '#9A6B0A'),
    ('Sofía Mendoza',    'nino',      'activo',   7,  'F', 'Clara Mendoza (tía)',   '2024-06-01', 'SM', '#EDE7FD', '#6B4EEA'),
    ('Andrés Vega',      'nino',      'activo',   12, 'M', 'Pedro Vega (abuelo)',   '2023-11-01', 'AV', '#E8F7F1', '#1D7A56'),
    ('Hna. Rosa Medina', 'misionero', 'activo',   34, 'F', NULL,                    '2022-08-01', 'RM', '#FDE7E1', '#C24A30'),
    ('Hno. Marco Torres','misionero', 'activo',   28, 'M', NULL,                    '2023-02-01', 'MT', '#DDEDF1', '#1C6678'),
    ('Valentina Cruz',   'voluntario','activo',   22, 'F', NULL,                    '2025-01-01', 'VC', '#EDE7FD', '#6B4EEA'),
    ('Carlos Nuñez',     'staff',     'activo',   40, 'M', NULL,                    '2021-06-01', 'CN', '#E8F7F1', '#1D7A56'),
    ('Lucía Paredes',    'nino',      'activo',   9,  'F', 'Rosa Paredes (madre)',  '2024-09-01', 'LP', '#FDF2D5', '#9A6B0A'),
    ('Mateo Flores',     'nino',      'inactivo', 11, 'M', 'Jorge Flores (padre)',  '2024-04-01', 'MF', '#e8e8e8', '#888888'),
    ('Isabella Torres',  'nino',      'activo',   8,  'F', 'Carmen Torres (madre)', '2025-02-01', 'IT', '#DDEDF1', '#1C6678'),
    ('Sebastián Mora',   'nino',      'activo',   9,  'M', 'Javier Mora (padre)',   '2024-11-01', 'SB', '#E8F7F1', '#1D7A56');

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
