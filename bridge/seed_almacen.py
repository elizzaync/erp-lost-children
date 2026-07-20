"""
Ejecutar una sola vez para poblar el almacén con productos de prueba.
python seed_almacen.py
"""
import pymysql
from config import env

DB = dict(
    host=env("DB_HOST", "localhost"),
    user=env("DB_USER", "root"),
    password=env("DB_PASSWORD", ""),
    database=env("DB_NAME", "erp_lost_children"),
    charset='utf8mb4',
)

productos = [
    # (nombre, categoria, unidad, stock, minimo, vence)
    ('Arroz blanco',        'Alimentos',   'kg',      45,  10, '2025-12-31'),
    ('Pasta spaghetti',     'Alimentos',   'kg',      28,   8, '2025-11-30'),
    ('Harina de maíz',      'Alimentos',   'kg',      60,  15, '2025-10-15'),
    ('Azúcar',              'Alimentos',   'kg',      30,  10, '2026-01-31'),
    ('Aceite vegetal',      'Alimentos',   'lts',     18,   6, '2025-09-30'),
    ('Leche en polvo',      'Alimentos',   'kg',       8,  10, '2025-08-20'),  # crítico
    ('Avena',               'Alimentos',   'kg',      22,   8, '2025-12-01'),
    ('Caraotas negras',     'Proteínas',   'kg',      35,  10, '2026-03-31'),
    ('Lentejas',            'Proteínas',   'kg',      20,   8, '2026-02-28'),
    ('Atún en lata',        'Proteínas',   'uds',     48,  24, '2026-06-30'),
    ('Sardina en lata',     'Proteínas',   'uds',     36,  24, '2026-05-31'),
    ('Sal',                 'Condimentos', 'kg',      12,   5, None),
    ('Salsa de tomate',     'Condimentos', 'uds',     24,  12, '2025-10-31'),
    ('Caldo de pollo',      'Condimentos', 'uds',     40,  20, '2026-01-15'),
    ('Ajo molido',          'Condimentos', 'uds',      3,   6, '2025-09-01'),  # crítico
    ('Jabón de baño',       'Higiene',     'uds',     60,  30, None),
    ('Shampoo',             'Higiene',     'uds',     18,  20, None),           # crítico
    ('Pasta dental',        'Higiene',     'uds',     24,  20, None),
    ('Papel higiénico',     'Higiene',     'paquetes', 10,  8, None),
    ('Cuadernos',           'Útiles',      'uds',     85,  40, None),
    ('Lápices',             'Útiles',      'uds',    120,  60, None),
    ('Colores',             'Útiles',      'cajas',   15,  10, None),
    ('Borrador',            'Útiles',      'uds',     50,  30, None),
    ('Ropa niños talla S',  'Regalos',     'uds',     22,  10, None),
    ('Ropa niños talla M',  'Regalos',     'uds',     18,  10, None),
    ('Juguetes varios',     'Regalos',     'uds',     14,   5, None),
    ('Detergente en polvo', 'Otros',       'kg',      20,   8, None),
    ('Escoba',              'Otros',       'uds',      4,   3, None),
]

conn = pymysql.connect(**DB)
cur  = conn.cursor()

insertados = 0
for p in productos:
    nombre, cat, unidad, stock, minimo, vence = p
    cur.execute("SELECT id FROM articulos WHERE nombre=%s", (nombre,))
    if cur.fetchone():
        print(f"  ya existe: {nombre}")
        continue
    cur.execute("""
        INSERT INTO articulos (nombre, categoria, unidad, stock, minimo, vence)
        VALUES (%s, %s, %s, %s, %s, %s)
    """, (nombre, cat, unidad, stock, minimo, vence))
    insertados += 1
    print(f"  + {nombre}")

conn.commit()
cur.close()
conn.close()
print(f"\nListo — {insertados} productos insertados.")
