# -*- coding: utf-8 -*-
"""Mete una marca por fuera del navegador, como haría el terminal.

Sirve para comprobar que una pantalla abierta se entera sola. Tiene que
entrar por detrás —no con un clic en la propia página— porque lo que se
quiere probar es justamente que la pantalla se entera de lo que hizo OTRO:
el terminal al sincronizar, o el teléfono de otra persona.

Solo funciona contra el BANCO de pruebas. Si DB_PATH apunta a otra base se
niega: una marca inventada en la base real es una marca falsa en el
expediente de alguien.
"""
import datetime
import os
import sqlite3
import sys

sys.stdout.reconfigure(encoding="utf-8")
BD = os.environ.get("DB_PATH", "")
if "rrhh-pruebas" not in BD and "banco" not in BD:
    raise SystemExit(f"ABORTA: DB_PATH no es un banco de pruebas ({BD!r})")

con = sqlite3.connect(BD, isolation_level=None)
con.row_factory = sqlite3.Row
con.execute("PRAGMA foreign_keys = ON")

NOMBRE = "Zzz Vigilancia"
fila = con.execute("SELECT id FROM personal WHERE nombre = ?", (NOMBRE,)).fetchone()
if fila:
    pid = fila["id"]
else:
    pid = con.execute(
        "INSERT INTO personal (nombre, cargo, estado) VALUES (?, 'Prueba', 'activo')",
        (NOMBRE,)).lastrowid

SN = 9977
con.execute(
    """INSERT OR IGNORE INTO identidades
       (staff_number, personal_id, metodo, estado, tiene_rostro)
       VALUES (?, ?, 'facial', 'enrolado', 1)""", (SN, pid))

ahora = datetime.datetime.now()
con.execute(
    """INSERT OR IGNORE INTO marcas
       (staff_number, fecha, hora, metodo, canal)
       VALUES (?, ?, ?, 'facial', 'terminal')""",
    (SN, ahora.date().isoformat(), ahora.strftime("%H:%M")))
con.close()
print(f"marca metida por detrás: {NOMBRE} a las {ahora.strftime('%H:%M')}")
