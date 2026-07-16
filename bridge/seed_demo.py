"""
Seed de datos de demostración para todos los módulos.
python seed_demo.py
"""
import pymysql
from datetime import date, timedelta
import random, json

DB = dict(host='localhost', user='root', password='', database='erp_lost_children', charset='utf8mb4')
hoy = date.today()

def dia(offset=0):
    return (hoy + timedelta(days=offset)).isoformat()

conn = pymysql.connect(**DB)
cur  = conn.cursor()

# ─── Personas extra ──────────────────────────────────────────
print("\n── Personas ──")
personas_extra = [
    # (nombre, tipo, estado)
    ('Sofia Ramirez',    'nino',      'activo'),
    ('Mateo Torres',     'nino',      'activo'),
    ('Valentina Cruz',   'nino',      'activo'),
    ('Diego Flores',     'nino',      'activo'),
    ('Camila Quispe',    'nino',      'activo'),
    ('Sebastian Vega',   'nino',      'alerta'),
    ('Lucia Mendoza',    'nino',      'activo'),
    ('Ana Paula Ruiz',   'nino',      'activo'),
    ('Maria Garcia',     'padre',     'activo'),
    ('Jorge Huaman',     'padre',     'activo'),
    ('Carmen Lopez',     'padre',     'activo'),
    ('Hna. Isabel',      'misionero', 'activo'),
    ('Fr. Andres',       'misionero', 'activo'),
    ('Rosa Solis',       'voluntario','activo'),
    ('Luis Cardenas',    'voluntario','activo'),
]
inserted_personas = 0
for nombre, tipo, estado in personas_extra:
    cur.execute("SELECT id FROM personas WHERE nombre=%s AND tipo=%s", (nombre, tipo))
    if not cur.fetchone():
        cur.execute(
            "INSERT INTO personas (nombre, tipo, estado) VALUES (%s,%s,%s)",
            (nombre, tipo, estado)
        )
        inserted_personas += 1
        print(f"  + {nombre} ({tipo})")
print(f"  → {inserted_personas} personas nuevas")
conn.commit()

# IDs actualizados
cur.execute("SELECT id, nombre, tipo FROM personas WHERE estado != 'inactivo'")
personas = cur.fetchall()  # (id, nombre, tipo)

# ─── Asistencia ──────────────────────────────────────────────
print("\n── Asistencia ──")
cur.execute("DELETE FROM asistencia WHERE fecha = CURDATE()")

METODOS = ['Manual', 'Manual', 'Manual', 'Reconocimiento facial', 'QR']
TIPOS   = {'nino':'Niño','padre':'Padre','misionero':'Misionero','voluntario':'Voluntario','staff':'Staff'}

for pid, nombre, tipo in personas:
    presente = random.random() < 0.82
    metodo   = random.choice(METODOS)
    hora     = None
    if presente:
        h = random.randint(8, 10)
        m = random.randint(0, 59)
        hora = f"{h:02d}:{m:02d}:00"
    cur.execute("""
        INSERT INTO asistencia (persona_id, fecha, presente, metodo, hora)
        VALUES (%s, CURDATE(), %s, %s, %s)
        ON DUPLICATE KEY UPDATE presente=%s, metodo=%s, hora=%s
    """, (pid, presente, metodo, hora, presente, metodo, hora))

print(f"  → {len(personas)} registros de asistencia (hoy)")
conn.commit()

# ─── Servicios de alimentación ────────────────────────────────
print("\n── Servicios de alimentación ──")
menus = [
    ('Arroz con pollo y verduras',  'Arroz Blanco, Caraotas negras, Aceite vegetal, Sal, Caldo de pollo'),
    ('Sopa de lentejas con pan',    'Lentejas, Harina de maíz, Sal, Ajo molido, Aceite vegetal'),
    ('Pasta con atún',              'Pasta spaghetti, Atún en lata, Salsa de tomate, Sal, Aceite vegetal'),
    ('Arroz con frijoles',          'Arroz Blanco, Caraotas negras, Sal, Aceite vegetal, Caldo de pollo'),
    ('Guiso de sardinas',           'Arroz Blanco, Sardina en lata, Salsa de tomate, Sal, Ajo molido'),
    ('Avena con leche',             'Avena, Leche en polvo, Azúcar'),
    ('Pasta con salsa roja',        'Pasta spaghetti, Salsa de tomate, Sal, Aceite vegetal, Ajo molido'),
    ('Arroz con huevo',             'Arroz Blanco, Aceite vegetal, Sal, Caldo de pollo'),
    ('Sopa de maíz',                'Harina de maíz, Sal, Aceite vegetal, Caldo de pollo'),
    ('Menú especial niños',         'Arroz Blanco, Atún en lata, Aceite vegetal, Sal, Leche en polvo'),
]

for i in range(20):
    fecha  = dia(-(i * 3 + random.randint(0,2)))
    menu, insumos = random.choice(menus)
    ninos      = random.randint(18, 35)
    voluntarios= random.randint(1, 4)
    padres     = random.randint(2, 8)
    staff      = random.randint(0, 2)
    total      = ninos + voluntarios + padres + staff
    costo_pp   = round(random.uniform(2.80, 5.50), 2)

    consumo = []
    for art in insumos.split(', '):
        consumo.append({'nombre': art.strip(), 'cantidad': round(random.uniform(0.5, 3.0), 2)})

    cur.execute("""
        INSERT INTO servicios_alimentacion
          (fecha, menu, total_raciones, insumos_desc, voluntarios, padres, staff, costo_por_plato, consumo_json)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
    """, (fecha, menu, total, insumos, voluntarios, padres, staff, costo_pp, json.dumps(consumo)))
    print(f"  + {fecha} — {menu[:35]} — {total} raciones @ S/{costo_pp}")

conn.commit()
print("  → 20 servicios de alimentación")

# ─── Entregas ────────────────────────────────────────────────
print("\n── Entregas ──")
ninos_list = [(pid, nombre) for pid, nombre, tipo in personas if tipo == 'nino']
padres_list= [(pid, nombre) for pid, nombre, tipo in personas if tipo == 'padre']
mis_list   = [(pid, nombre) for pid, nombre, tipo in personas if tipo == 'misionero']

articulos_entrega = [
    # (articulo_id, nombre, categoria, unidad, persona_tipos)
    (24, 'Ropa niños talla S', 'Regalos',  'uds', ['nino']),
    (25, 'Ropa niños talla M', 'Regalos',  'uds', ['nino']),
    (26, 'Juguetes varios',    'Regalos',  'uds', ['nino']),
    (20, 'Cuadernos',          'Útiles',   'uds', ['nino']),
    (21, 'Lápices',            'Útiles',   'uds', ['nino']),
    (22, 'Colores',            'Útiles',   'cajas',['nino']),
    (16, 'Jabón de baño',      'Higiene',  'uds', ['nino','padre','misionero']),
    (17, 'Shampoo',            'Higiene',  'uds', ['nino','padre']),
    (18, 'Pasta dental',       'Higiene',  'uds', ['nino','padre','misionero']),
    (19, 'Papel higiénico',    'Higiene',  'paquetes',['nino','padre']),
]

campanas = ['General', 'General', 'General', 'Navidad 2024', 'Día del Niño', 'Campaña Útiles']

cur.execute("SELECT COUNT(*) FROM entregas"); existing = cur.fetchone()[0]
needed = max(0, 40 - existing)

# Asegurar campanas
for c in campanas:
    cur.execute("SELECT id FROM campanas WHERE nombre=%s", (c,))
    if not cur.fetchone():
        cur.execute("INSERT INTO campanas (nombre) VALUES (%s)", (c,))
conn.commit()

def get_campana_id(nombre):
    cur.execute("SELECT id FROM campanas WHERE nombre=%s", (nombre,))
    row = cur.fetchone()
    if row: return row[0]
    cur.execute("INSERT INTO campanas (nombre) VALUES (%s)", (nombre,))
    return cur.lastrowid

for i in range(needed):
    fecha_e   = dia(-(i * 2 + random.randint(0, 3)))
    art       = random.choice(articulos_entrega)
    art_id, art_nom, art_cat, art_uni, tipos_ok = art
    campana   = random.choice(campanas)
    camp_id   = get_campana_id(campana)

    if 'padre' in tipos_ok and random.random() < 0.2 and padres_list:
        pid, pnom = random.choice(padres_list)
    elif 'misionero' in tipos_ok and random.random() < 0.1 and mis_list:
        pid, pnom = random.choice(mis_list)
    else:
        if ninos_list:
            pid, pnom = random.choice(ninos_list)
        else:
            continue

    cantidad  = random.randint(1, 3)
    notas_opts= ['', '', '', 'Donado por parroquia', 'Kit escolar completo', 'Campana solidaria', '']
    notas     = random.choice(notas_opts)

    cur.execute("""
        INSERT INTO entregas (persona_id, articulo_id, campana_id, cantidad, fecha, notas)
        VALUES (%s, %s, %s, %s, %s, %s)
    """, (pid, art_id, camp_id, cantidad, fecha_e, notas))
    print(f"  + {fecha_e} — {pnom} — {art_nom} x{cantidad}")

conn.commit()
print(f"  → {needed} entregas nuevas")

# ─── Gastos e Ingresos ────────────────────────────────────────
print("\n── Gastos ──")
gastos_demo = [
    # (dias_atras, categoria, monto, proveedor, observacion, fuente_auto)
    (2,  'Alimentos',  320.00, 'Distribuidora Central', 'Compra mensual arroz y menestras', ''),
    (5,  'Alimentos',  185.50, 'Mercado Santa Rosa',    'Verduras y condimentos semana', ''),
    (7,  'Transporte', 45.00,  'Taxi Seguro',           'Transporte donaciones al local', ''),
    (10, 'Útiles',     210.00, 'Librería Escolar',      'Kit escolar 20 niños', ''),
    (12, 'Servicios',  180.00, 'Empresa Eléctrica',     'Factura luz mensual', ''),
    (14, 'Higiene',    95.00,  'Distribuidora Higiene', 'Jabón, shampoo y pasta dental', ''),
    (17, 'Alimentos',  260.00, 'Distribuidora Central', 'Compra quincenal alimentos', ''),
    (20, 'Transporte', 60.00,  'Combustible',           'Gasolina furgoneta donaciones', ''),
    (22, 'Servicios',  120.00, 'Empresa de Agua',       'Agua y saneamiento mensual', ''),
    (25, 'Regalos',    350.00, 'Juguetería El Niño',    'Juguetes campaña navidad', ''),
    (28, 'Alimentos',  140.00, 'Mercado Central',       'Compra semanal proteínas', ''),
    (30, 'Útiles',     85.00,  'Librería Escolar',      'Cuadernos adicionales', ''),
    (33, 'Servicios',  75.00,  'Internet Total',        'Internet mensual sede', ''),
    (35, 'Higiene',    130.00, 'Distribuidora Higiene', 'Papel higiénico y detergente', ''),
    (38, 'Alimentos',  290.00, 'Distribuidora Central', 'Compra mensual base', ''),
    (40, 'Transporte', 35.00,  'Taxi Seguro',           'Traslado medicamentos', ''),
    (42, 'Otros',      55.00,  'Ferretería Local',      'Materiales limpieza y escobas', ''),
    (45, 'Alimentos',  175.00, 'Mercado Santa Rosa',    'Compra verduras y frutas', ''),
]

for dias, cat, monto, prov, obs, fauto in gastos_demo:
    fecha_g = dia(-dias)
    cat_colors = {
        'Alimentos':  ('#DDEDF1','#1C6678'),
        'Útiles':     ('#FDF2D5','#9A6B0A'),
        'Higiene':    ('#E8F7F1','#1D7A56'),
        'Transporte': ('#E1EDFD','#2A5FA0'),
        'Servicios':  ('#e8e8e8','#555'),
        'Regalos':    ('#EDE7FD','#6B4EEA'),
        'Otros':      ('#e8e8e8','#6E7872'),
    }
    bg, fg = cat_colors.get(cat, ('#e8e8e8','#555'))
    cur.execute("""
        INSERT INTO gastos (fecha, categoria, monto, proveedor, fondo, observacion, cat_bg, cat_fg, fuente_auto)
        VALUES (%s,%s,%s,%s,'Fondo General',%s,%s,%s,%s)
    """, (fecha_g, cat, monto, prov, obs, bg, fg, fauto))
    gasto_id = cur.lastrowid
    # Movimiento de fondos asociado
    cur.execute("""
        INSERT INTO fondos_movimientos (tipo, monto, descripcion, categoria, fuente, referencia_id, fecha)
        VALUES ('egreso',%s,%s,%s,'gasto',%s,%s)
    """, (monto, prov, cat, gasto_id, fecha_g))
    print(f"  + {fecha_g} — {cat} — S/{monto} ({prov[:25]})")

conn.commit()
print("  → 18 gastos nuevos")

# ─── Ingresos / Fondos ────────────────────────────────────────
print("\n── Ingresos ──")
ingresos_demo = [
    (3,  'Donación de dinero', 500.00,  'Parroquia San José — donación mensual'),
    (8,  'Evento',             850.00,  'Pollada benéfica 29 junio — 170 platos'),
    (15, 'Colecta',            230.50,  'Colecta dominical comunidad'),
    (20, 'Transferencia',      1200.00, 'Subvención municipal programa infancia'),
    (28, 'Donación de dinero', 300.00,  'Familia Rodríguez — donación esporádica'),
    (35, 'Evento',             620.00,  'Rifa solidaria mayo — 310 tickets'),
    (42, 'Colecta',            185.00,  'Colecta parroquial abril'),
    (50, 'Subvención',         2000.00, 'ONG Caritas — apoyo programa nutricional'),
    (58, 'Donación de dinero', 150.00,  'Anónimo — caja de donaciones'),
    (65, 'Transferencia',      750.00,  'Empresa Minera — responsabilidad social'),
]

for dias, tipo, monto, desc in ingresos_demo:
    fecha_i = dia(-dias)
    cur.execute("""
        INSERT INTO fondos_movimientos (tipo, monto, descripcion, categoria, fuente, fecha)
        VALUES ('ingreso',%s,%s,%s,'donacion',%s)
    """, (monto, desc, tipo, fecha_i))
    print(f"  + {fecha_i} — {tipo} — S/{monto}")

conn.commit()
print("  → 10 ingresos nuevos")

# ─── Resumen final ────────────────────────────────────────────
print("\n════ Seed completado ════")
for t in ['personas','asistencia','gastos','fondos_movimientos','entregas','servicios_alimentacion']:
    cur.execute('SELECT COUNT(*) FROM '+t)
    print(f"  {t}: {cur.fetchone()[0]} registros")

cur.close()
conn.close()
