# -*- coding: utf-8 -*-
"""Atrasa diez minutos la última marca web de hoy.

El servidor rechaza dos marcas seguidas en menos de dos minutos, y hace
bien. Para probar la salida sin esperar de verdad, se atrasa la entrada.

Solo escribe en el BANCO. La primera versión de esto llevaba la ruta a
mano y le cambió la hora a una marca de la base real; por eso ahora la
ruta viene del entorno y, si no viene, no hace nada.
"""
import datetime
import os
import sqlite3
import sys

sys.stdout.reconfigure(encoding="utf-8")
BD = os.environ.get("DB_PATH", "")
if not BD or "rrhh-pruebas" not in BD.replace("\\", "/"):
    print(f"me niego: DB_PATH no es un banco de pruebas ({BD or 'vacío'})")
    raise SystemExit(2)
hoy = datetime.date.today().isoformat()

con = sqlite3.connect(BD)
con.row_factory = sqlite3.Row
fila = con.execute(
    """SELECT id, staff_number, hora FROM marcas
        WHERE fecha = ? AND canal = 'web' ORDER BY hora DESC, id DESC LIMIT 1""",
    (hoy,)).fetchone()
if not fila:
    print("no hay marca web de hoy")
    raise SystemExit(1)

h, m = (fila["hora"].split(":") + ["0"])[:2]
antes = datetime.datetime.combine(
    datetime.date.today(),
    datetime.time(int(h), int(m))) - datetime.timedelta(minutes=10)
con.execute("UPDATE marcas SET hora = ? WHERE id = ?",
            (antes.strftime("%H:%M"), fila["id"]))
con.commit()
print(f"{fila['hora']} → {antes.strftime('%H:%M')}")
