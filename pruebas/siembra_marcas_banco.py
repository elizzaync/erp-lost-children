# -*- coding: utf-8 -*-
"""Marcas de dos semanas en el BANCO, para poder ver los gráficos dibujados.

La fixtura monta 20 personas pero ni una marca, así que los gráficos de
asistencia solo enseñaban su estado vacío. Sin datos no se prueba el
dibujo: solo se prueba el hueco.

Escribe únicamente en el banco de pruebas; si DB_PATH no apunta a uno, no
hace nada.
"""
import datetime
import os
import random
import sqlite3
import sys

sys.stdout.reconfigure(encoding="utf-8")
BD = os.environ.get("DB_PATH", "")
if not BD or "rrhh-pruebas" not in BD.replace("\\", "/"):
    print(f"me niego: DB_PATH no es un banco de pruebas ({BD or 'vacío'})")
    raise SystemExit(2)

random.seed(20260827)
con = sqlite3.connect(BD)
con.row_factory = sqlite3.Row

gente = con.execute(
    "SELECT id, nombre FROM personal WHERE estado = 'activo' ORDER BY id LIMIT 6"
).fetchall()
if not gente:
    print("el banco no tiene personal")
    raise SystemExit(1)

sn = 9600
puestos = []
for p in gente:
    fila = con.execute(
        "SELECT staff_number FROM identidades WHERE personal_id = ?",
        (p["id"],)).fetchone()
    if fila:
        puestos.append(fila["staff_number"])
        continue
    con.execute(
        """INSERT INTO identidades
             (staff_number, personal_id, metodo, estado,
              tiene_rostro, tiene_huella)
           VALUES (?, ?, 'facial', 'enrolado', 1, 0)""",
        (sn, p["id"]))
    puestos.append(sn)
    sn += 1

hoy = datetime.date.today()
puestas = 0
for i in range(14):
    dia = hoy - datetime.timedelta(days=13 - i)
    if dia.weekday() >= 5:          # fin de semana: nadie marca
        continue
    for s in puestos:
        if random.random() < 0.12:  # alguna falta, como en la vida
            continue
        entra = datetime.time(random.choice([7, 8, 8, 8, 9]),
                              random.randrange(0, 60))
        sale = datetime.time(random.choice([16, 17, 17, 18]),
                             random.randrange(0, 60))
        for hora in (entra, sale):
            con.execute(
                """INSERT OR IGNORE INTO marcas
                     (staff_number, fecha, hora, metodo, canal)
                   VALUES (?, ?, ?, 'facial', 'terminal')""",
                (s, dia.isoformat(), hora.strftime("%H:%M")))
            puestas += 1
con.commit()
print(f"{puestas} marcas de {len(puestos)} personas en 14 días")
