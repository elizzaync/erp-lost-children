"""
Actualiza precios, descripcion y proveedor de los productos ya insertados.
python update_precios.py
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

# (nombre, precio, descripcion, proveedor)
productos = [
    ('Arroz blanco',        1.20, 'Arroz blanco de grano largo, 1 kg',           'Distribuidora Central'),
    ('Pasta spaghetti',     0.95, 'Spaghetti n°5, 500g por paquete',              'Distribuidora Central'),
    ('Harina de maíz',      0.85, 'Harina de maíz precocida, 1 kg',              'Distribuidora Central'),
    ('Azúcar',              0.90, 'Azúcar refinada, 1 kg',                        'Distribuidora Central'),
    ('Aceite vegetal',      2.40, 'Aceite vegetal comestible, 1 litro',           'Distribuidora Central'),
    ('Leche en polvo',      4.50, 'Leche en polvo entera, 1 kg',                 'Lácteos del Norte'),
    ('Avena',               1.10, 'Avena en hojuelas, 1 kg',                     'Distribuidora Central'),
    ('Caraotas negras',     1.30, 'Caraotas negras secas, 1 kg',                 'Distribuidora Central'),
    ('Lentejas',            1.25, 'Lentejas, 1 kg',                              'Distribuidora Central'),
    ('Atún en lata',        1.80, 'Atún en aceite de girasol, 170g',             'Conservas del Mar'),
    ('Sardina en lata',     1.20, 'Sardina en salsa de tomate, 155g',            'Conservas del Mar'),
    ('Sal',                 0.40, 'Sal refinada yodada, 1 kg',                   'Distribuidora Central'),
    ('Salsa de tomate',     0.75, 'Salsa de tomate natural, 350g',               'Distribuidora Central'),
    ('Caldo de pollo',      0.35, 'Cubito de caldo de pollo, unidad',            'Distribuidora Central'),
    ('Ajo molido',          0.90, 'Ajo molido, frasco 100g',                     'Distribuidora Central'),
    ('Jabón de baño',       0.60, 'Jabón de baño, unidad 120g',                  'Higiene Total'),
    ('Shampoo',             2.20, 'Shampoo familiar, frasco 400ml',              'Higiene Total'),
    ('Pasta dental',        1.10, 'Pasta dental con flúor, 100ml',               'Higiene Total'),
    ('Papel higiénico',     3.50, 'Papel higiénico doble hoja, paquete x4',      'Higiene Total'),
    ('Cuadernos',           0.80, 'Cuaderno rayado, 100 hojas',                  'Librería Escolar'),
    ('Lápices',             0.25, 'Lápiz grafito #2, unidad',                    'Librería Escolar'),
    ('Colores',             3.20, 'Caja de colores x12',                         'Librería Escolar'),
    ('Borrador',            0.20, 'Borrador blanco, unidad',                     'Librería Escolar'),
    ('Ropa niños talla S',  8.50, 'Conjunto ropa niños talla S',                 'Donaciones'),
    ('Ropa niños talla M',  9.00, 'Conjunto ropa niños talla M',                 'Donaciones'),
    ('Juguetes varios',     5.00, 'Juguetes infantiles varios',                  'Donaciones'),
    ('Detergente en polvo', 2.80, 'Detergente en polvo, 1 kg',                   'Higiene Total'),
    ('Escoba',              4.50, 'Escoba de plástico estándar',                 'Ferretería Local'),
]

conn = pymysql.connect(**DB)
cur  = conn.cursor()

actualizados = 0
for nombre, precio, descripcion, proveedor in productos:
    rows = cur.execute(
        "UPDATE articulos SET precio=%s, descripcion=%s, proveedor=%s WHERE nombre=%s",
        (precio, descripcion, proveedor, nombre)
    )
    if rows:
        actualizados += 1
        print(f"  OK {nombre} -> ${precio}")
    else:
        print(f"  ? no encontrado: {nombre}")

conn.commit()
cur.close()
conn.close()
print(f"\nListo — {actualizados} productos actualizados.")
