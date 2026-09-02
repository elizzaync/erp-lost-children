# -*- coding: utf-8 -*-
"""Deja la cuenta del banco como recién creada.

Las suites de marcar comparten un mismo banco y se ejecutan en fila. La
primera enrola un rostro y marca; la siguiente da por hecho que empieza sin
rostro y sin marcas, y falla por algo que no es suyo. Correr cada una sola
lo escondía: el banco era nuevo cada vez.

Borra SOLO el rastro de la cuenta de pruebas —sus marcas de hoy, su rostro
y su consentimiento— y solo dentro de un banco de pruebas.

    py limpia_mi_rastro.py            todo el rastro
    py limpia_mi_rastro.py --marcas   solo las marcas
"""
import os
import sqlite3
import sys

sys.stdout.reconfigure(encoding="utf-8")
BD = os.environ.get("DB_PATH", "")
if not BD or "rrhh-pruebas" not in BD.replace("\\", "/"):
    print(f"me niego: DB_PATH no es un banco de pruebas ({BD or 'vacío'})")
    raise SystemExit(2)

USUARIO = os.environ.get("USUARIO_PRUEBAS", "banco.pruebas")
solo_marcas = "--marcas" in sys.argv

con = sqlite3.connect(BD)
con.row_factory = sqlite3.Row
fila = con.execute(
    "SELECT personal_id FROM usuarios WHERE usuario = ?", (USUARIO,)).fetchone()
if not fila or not fila["personal_id"]:
    print("la cuenta del banco no tiene ficha")
    raise SystemExit(0)
pid = fila["personal_id"]

ident = con.execute(
    "SELECT staff_number FROM identidades WHERE personal_id = ?", (pid,)).fetchone()
borradas = 0
if ident:
    cur = con.execute("DELETE FROM marcas WHERE staff_number = ?",
                      (ident["staff_number"],))
    borradas = cur.rowcount

if not solo_marcas:
    con.execute("DELETE FROM rostros_web WHERE personal_id = ?", (pid,))
    con.execute("DELETE FROM consentimientos WHERE personal_id = ? "
                "AND tipo = 'rostro_web'", (pid,))
con.commit()
print(f"rastro limpio: {borradas} marcas"
      + ("" if solo_marcas else ", rostro y consentimiento"))
