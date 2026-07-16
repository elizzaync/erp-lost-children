# -*- coding: utf-8 -*-
"""
Datos ficticios para el dashboard — SOLO Recursos y Finanzas.
NO toca: personas, asistencia, zkteco_logs, entregas (relacionado a personas),
usuarios_sistema, ni nada del Timmy/yunatt.
Tablas pobladas: articulos, movimientos_almacen, gastos, fondos_movimientos,
servicios_alimentacion, presupuesto_mensual, campanas.
"""
import sys, json, random
sys.path.insert(0, r"C:\Users\NIEVES\ERP_Lost_Children\bridge")
from server import get_db

random.seed(42)
conn = get_db()
cur = conn.cursor()

# ── Limpiar solo las tablas que vamos a poblar ────────────────────────────────
cur.execute("SET FOREIGN_KEY_CHECKS = 0")
for t in ["servicio_insumos", "movimientos_almacen", "gastos", "fondos_movimientos",
          "servicios_alimentacion", "articulos", "campanas", "presupuesto_mensual"]:
    cur.execute(f"TRUNCATE TABLE `{t}`")
cur.execute("SET FOREIGN_KEY_CHECKS = 1")

# ── ARTÍCULOS DE ALMACÉN ──────────────────────────────────────────────────────
# (nombre, categoria, unidad, stock, minimo, precio, proveedor, ubicacion)
articulos = [
    ("Arroz",                "Alimentos",   "kg",     85,  40, 4.20, "Makro Surquillo",    "Despensa A1"),
    ("Azúcar rubia",         "Alimentos",   "kg",     32,  15, 4.80, "Makro Surquillo",    "Despensa A1"),
    ("Aceite vegetal",       "Alimentos",   "litros", 18,  10, 9.50, "Makro Surquillo",    "Despensa A2"),
    ("Fideos tallarín",      "Alimentos",   "kg",     26,  12, 5.00, "Mercado Central",    "Despensa A2"),
    ("Lentejas",             "Alimentos",   "kg",     14,  10, 7.50, "Mercado Central",    "Despensa A3"),
    ("Frejol canario",       "Alimentos",   "kg",      6,  10, 9.00, "Mercado Central",    "Despensa A3"),
    ("Avena",                "Alimentos",   "kg",     22,   8, 6.00, "Makro Surquillo",    "Despensa A1"),
    ("Leche evaporada",      "Alimentos",   "unidades", 48, 24, 3.80, "Makro Surquillo",   "Despensa B1"),
    ("Pollo",                "Proteínas",   "kg",     12,   8, 12.50, "Avícola San Luis",  "Congelador"),
    ("Huevos",               "Proteínas",   "unidades", 90, 60, 0.55, "Avícola San Luis",  "Despensa B2"),
    ("Atún en lata",         "Proteínas",   "unidades", 35, 20, 6.20, "Makro Surquillo",   "Despensa B1"),
    ("Sal y condimentos",    "Condimentos", "kg",      8,   3, 4.00, "Mercado Central",    "Despensa C1"),
    ("Cuadernos",            "Útiles",      "unidades", 45, 30, 3.50, "Tai Loy",           "Estante D1"),
    ("Lápices y colores",    "Útiles",      "unidades", 28, 25, 8.00, "Tai Loy",           "Estante D1"),
    ("Papel higiénico",      "Higiene",     "unidades", 20, 24, 2.00, "Makro Surquillo",   "Estante E1"),
    ("Jabón de manos",       "Higiene",     "unidades", 15,  10, 3.50, "Makro Surquillo",  "Estante E1"),
    ("Detergente",           "Higiene",     "kg",       5,   6, 8.90, "Makro Surquillo",   "Estante E2"),
    ("Juguetes didácticos",  "Regalos",     "unidades", 12,  5, 25.00, "Donaciones varias","Estante F1"),
]
for a in articulos:
    cur.execute("""
        INSERT INTO articulos (nombre, categoria, unidad, stock, minimo, precio,
                               proveedor, ubicacion, activo)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,1)
    """, a)
print(f"articulos: {len(articulos)}")

# Mapa nombre → id para movimientos
cur.execute("SELECT id, nombre, stock, unidad FROM articulos")
arts = {r[1]: {"id": r[0], "stock": r[2], "unidad": r[3]} for r in cur.fetchall()}

# ── MOVIMIENTOS DE ALMACÉN (julio 2026) ───────────────────────────────────────
movimientos = [
    ("2026-07-02", "Arroz",           "entrada", 50, "compra",   210.00, "Makro Surquillo"),
    ("2026-07-02", "Aceite vegetal",  "entrada", 12, "compra",   114.00, "Makro Surquillo"),
    ("2026-07-03", "Leche evaporada", "entrada", 48, "donacion",   0.00, "Iglesia Bautista Surco"),
    ("2026-07-05", "Pollo",           "entrada", 15, "compra",   187.50, "Avícola San Luis"),
    ("2026-07-07", "Cuadernos",       "entrada", 50, "donacion",   0.00, "Empresa Textil Andina"),
    ("2026-07-08", "Arroz",           "salida",  12, "consumo",    0.00, "Cocina — almuerzos semana"),
    ("2026-07-09", "Huevos",          "entrada", 120,"compra",    66.00, "Avícola San Luis"),
    ("2026-07-10", "Frejol canario",  "salida",   5, "consumo",    0.00, "Cocina — menú del día"),
    ("2026-07-11", "Juguetes didácticos","entrada",12,"donacion",  0.00, "Colecta Día del Niño"),
    ("2026-07-12", "Detergente",      "salida",   3, "consumo",    0.00, "Limpieza local"),
    ("2026-07-14", "Atún en lata",    "entrada", 24, "compra",   148.80, "Makro Surquillo"),
    ("2026-07-14", "Papel higiénico", "salida",  10, "consumo",    0.00, "Servicios higiénicos"),
]
for fecha, nombre, tipo, cant, origen, costo, prov in movimientos:
    a = arts[nombre]
    prev = a["stock"]  # aproximado para demo
    res  = prev + cant if tipo == "entrada" else max(prev - cant, 0)
    cur.execute("""
        INSERT INTO movimientos_almacen (articulo_id, tipo, cantidad, stock_anterior,
            stock_resultante, motivo, origen, costo_total, proveedor_donante, creado_en)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
    """, (a["id"], tipo, cant, prev, res,
          f"{'Compra' if origen=='compra' else 'Donación' if origen=='donacion' else 'Salida'} · {prov}",
          origen, costo, prov, f"{fecha} 10:30:00"))
print(f"movimientos_almacen: {len(movimientos)}")

# ── GASTOS (julio 2026) ───────────────────────────────────────────────────────
CAT = {
    "Alimentos":  ("#DDEDF1", "#1C6678"),
    "Almacén":    ("#E0F0FF", "#015a9e"),
    "Regalos":    ("#EDE7FD", "#6B4EEA"),
    "Útiles":     ("#FDF2D5", "#9A6B0A"),
    "Servicios":  ("#e8e8e8", "#555"),
    "Transporte": ("#E1EDFD", "#2A5FA0"),
    "Higiene":    ("#E8F7F1", "#1D7A56"),
    "Otros":      ("#e8e8e8", "#6E7872"),
}
gastos = [
    ("2026-07-01", "Servicios",  180.00, "Luz del Sur",            "Recibo de luz del local"),
    ("2026-07-01", "Servicios",   89.00, "Sedapal",                "Recibo de agua"),
    ("2026-07-02", "Alimentos",  210.00, "Makro Surquillo",        "Arroz 50kg para el mes"),
    ("2026-07-02", "Alimentos",  114.00, "Makro Surquillo",        "Aceite vegetal x12"),
    ("2026-07-03", "Transporte",  45.00, "Taxi Seguro SAC",        "Traslado de donaciones"),
    ("2026-07-05", "Alimentos",  187.50, "Avícola San Luis",       "Pollo 15kg"),
    ("2026-07-06", "Servicios",  120.00, "Movistar",               "Internet del local"),
    ("2026-07-07", "Higiene",     67.80, "Makro Surquillo",        "Artículos de limpieza"),
    ("2026-07-08", "Útiles",      95.00, "Tai Loy",                "Material educativo refuerzo"),
    ("2026-07-09", "Alimentos",   66.00, "Avícola San Luis",       "Huevos x120"),
    ("2026-07-10", "Transporte",  60.00, "Taxi Seguro SAC",        "Movilidad taller de padres"),
    ("2026-07-11", "Otros",       80.00, "Ferretería El Sol",      "Reparación caño de cocina"),
    ("2026-07-12", "Regalos",    150.00, "Comercial Lima Centro",  "Premios concurso de lectura"),
    ("2026-07-14", "Alimentos",  148.80, "Makro Surquillo",        "Atún en lata x24"),
    ("2026-07-15", "Servicios",   95.00, "Contadora M. Espinoza",  "Honorarios contables julio"),
]
for fecha, cat, monto, prov, obs in gastos:
    bg, fg = CAT[cat]
    cur.execute("""
        INSERT INTO gastos (fecha, categoria, monto, proveedor, fondo, observacion,
                            cat_bg, cat_fg, registrado_por)
        VALUES (%s,%s,%s,%s,'Fondo General',%s,%s,%s,NULL)
    """, (fecha, cat, monto, prov, obs, bg, fg))
    # Egreso espejo en fondos (como hace el endpoint real)
    cur.execute("""
        INSERT INTO fondos_movimientos (tipo, monto, descripcion, categoria, fuente, fecha)
        VALUES ('egreso',%s,%s,%s,'gasto',%s)
    """, (monto, f"{cat} · {prov}", cat, fecha))
print(f"gastos: {len(gastos)} (total S/ {sum(g[2] for g in gastos):.2f})")

# ── INGRESOS / DONACIONES ─────────────────────────────────────────────────────
ingresos = [
    ("2026-07-01", 1500.00, "Donación mensual — Fundación Esperanza",  "Donación de dinero"),
    ("2026-07-03",  350.00, "Colecta dominical Iglesia Bautista Surco","Colecta"),
    ("2026-07-05",  800.00, "Subvención municipal — programa alimentario","Subvención"),
    ("2026-07-08",  250.00, "Donación individual — familia Gutiérrez", "Donación de dinero"),
    ("2026-07-11",  420.00, "Rifa pro-fondos Día del Niño",            "Evento"),
    ("2026-07-14",  600.00, "Transferencia ONG aliada Kinder Hilfe",   "Transferencia"),
]
for fecha, monto, desc, cat in ingresos:
    cur.execute("""
        INSERT INTO fondos_movimientos (tipo, monto, descripcion, categoria, fuente, fecha)
        VALUES ('ingreso',%s,%s,%s,'manual',%s)
    """, (monto, desc, cat, fecha))
print(f"ingresos: {len(ingresos)} (total S/ {sum(i[1] for i in ingresos):.2f})")

# ── SERVICIOS DE ALIMENTACIÓN (almuerzos servidos julio) ──────────────────────
menus = [
    ("2026-07-01", "Arroz con pollo y ensalada",       34, 26, 4, 2, 2, 98.60),
    ("2026-07-02", "Tallarines rojos con huevo",       31, 24, 3, 2, 2, 82.30),
    ("2026-07-03", "Lentejas con arroz y plátano",     36, 28, 4, 2, 2, 76.40),
    ("2026-07-06", "Ají de gallina",                   33, 25, 4, 2, 2, 105.20),
    ("2026-07-07", "Arroz chaufa con pollo",           35, 27, 4, 2, 2, 94.10),
    ("2026-07-08", "Sopa de verduras + segundo",       30, 23, 3, 2, 2, 71.80),
    ("2026-07-09", "Frejoles con arroz y huevo frito", 34, 26, 4, 2, 2, 79.50),
    ("2026-07-10", "Pollo al horno con puré",          37, 29, 4, 2, 2, 112.40),
    ("2026-07-13", "Estofado de pollo con arroz",      32, 24, 4, 2, 2, 96.70),
    ("2026-07-14", "Tortilla de verduras con arroz",   33, 25, 4, 2, 2, 68.90),
]
for fecha, menu, total, ninos, mis, vol, staff, costo in menus:
    cur.execute("""
        INSERT INTO servicios_alimentacion (fecha, menu, total_raciones, ninos,
            misioneros, voluntarios, padres, staff, costo_total, costo_por_plato,
            insumos_desc, descontado, registrado_por)
        VALUES (%s,%s,%s,%s,%s,%s,0,%s,%s,%s,%s,1,NULL)
    """, (fecha, menu, total, ninos, mis, vol, staff, costo,
          round(costo/total, 2), "Insumos de despensa según menú"))
print(f"servicios_alimentacion: {len(menus)} (total {sum(m[2] for m in menus)} raciones)")

# ── PRESUPUESTO Y CAMPAÑAS ────────────────────────────────────────────────────
cur.execute("INSERT INTO presupuesto_mensual (anio, mes, monto, notas) VALUES (2026, 7, 2400.00, 'Presupuesto operativo julio 2026')")
campanas = [
    ("General",           "Entregas regulares del programa",      1, "#EDE7FD", "#6B4EEA"),
    ("Día del Niño",      "Campaña de regalos y actividades",     1, "#FDF2D5", "#9A6B0A"),
    ("Útiles Escolares",  "Kits escolares medio año",             1, "#DDEDF1", "#1C6678"),
]
for c in campanas:
    cur.execute("INSERT INTO campanas (nombre, descripcion, activa, bg_color, fg_color) VALUES (%s,%s,%s,%s,%s)", c)
print(f"campanas: {len(campanas)} + presupuesto julio S/ 2400")

conn.commit()
cur.close()
conn.close()
print("SEED COMPLETO — personas/asistencia/timmy intactos")
