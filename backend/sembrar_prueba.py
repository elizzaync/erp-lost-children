# -*- coding: utf-8 -*-
"""
sembrar_prueba.py — personas de prueba, con asistencia, y su borrado.

PARA QUÉ

Para poder ver funcionando lo que hoy sale vacío: la asistencia del día,
la semana, el mes, los gráficos y los reportes. Sin marcas registradas
todas esas pantallas dicen la verdad —«no hay nada»— y no se puede juzgar
si están bien hechas.

CÓMO SE RECONOCEN

Todas empiezan por «Zzz Prueba». No es capricho: el resto del sistema y
las pruebas automáticas ya usan el prefijo «Zzz» para lo desechable, así
que estas caen en la misma red. En pantalla quedan al final de cualquier
lista ordenada por nombre, lejos de las personas de verdad.

Sus números de terminal van del 9500 en adelante, dentro del rango
reservado para lo que no viene del terminal físico.

CÓMO SE BORRAN

    python sembrar_prueba.py --borrar

Borra exactamente lo que este archivo creó: las fichas cuyo nombre empieza
por «Zzz Prueba», sus identidades y sus marcas. No toca nada más. El
borrado se puede repetir sin peligro.

UNA ADVERTENCIA

Esto escribe en la base REAL. Es lo que se pidió —verlas en el sistema—,
pero conviene borrarlas antes de enseñarle el sistema a nadie: una ficha
inventada que alguien tome por buena es peor que una pantalla vacía.
"""
import argparse
import random
import sys
from datetime import date, timedelta

import config
import db

PREFIJO = "Zzz Prueba"
STAFF_DESDE = 9500

# Gente verosímil, para que las pantallas se parezcan a la realidad: hay
# quien llega temprano, quien llega tarde, quien falta y quien no marca la
# salida. Un juego de datos donde todos son iguales no prueba nada.
GENTE = [
    ("Zzz Prueba Ana Rivas",      "Tutora de Casa Hogar",  "Casa Hogar",      "Lima",  "07:52", 0.95),
    ("Zzz Prueba Beto Salas",     "Cocinero",              "Casa Hogar",      "Lima",  "06:40", 1.00),
    ("Zzz Prueba Carmen Loyola",  "Psicóloga",             "Bienestar",       "Lima",  "08:35", 0.70),
    ("Zzz Prueba Diego Ramos",    "Docente de Refuerzo",   "Educación",       "Comas", "13:10", 0.85),
    ("Zzz Prueba Elena Ticona",   "Asistente Contable",    "Administración y Finanzas", "Lima", "08:05", 0.90),
    ("Zzz Prueba Franco Medina",  "Mantenimiento",         "Casa Hogar",      "Lima",  "07:10", 0.60),
    ("Zzz Prueba Gloria Paredes", "Coordinadora Educativa", "Educación",      "Lima",  "08:20", 0.95),
    ("Zzz Prueba Hugo Zeballos",  "Soporte TI",            "TI y Comunicaciones", "Lima", "09:00", 0.80),
]

DIAS_ATRAS = 21


def _hora(base, desvio_max=18):
    """La hora prevista, más o menos unos minutos. Nadie ficha al segundo."""
    h, m = (int(x) for x in base.split(":"))
    total = h * 60 + m + random.randint(-8, desvio_max)
    return f"{total // 60:02d}:{total % 60:02d}"


def _mas(hhmm, minutos):
    h, m = (int(x) for x in hhmm.split(":"))
    total = h * 60 + m + minutos
    return f"{total // 60:02d}:{total % 60:02d}"


def sembrar(semilla=7):
    random.seed(semilla)          # mismos datos en cada corrida
    hoy = date.today()
    creadas, marcas = 0, 0

    usados = {r[0] for r in db._conectar().execute(
        "SELECT staff_number FROM identidades")}
    siguiente = STAFF_DESDE
    while siguiente in usados:
        siguiente += 1

    for nombre, cargo, area, sede, entrada, constancia in GENTE:
        if db._conectar().execute(
                "SELECT 1 FROM personal WHERE nombre = ?", (nombre,)).fetchone():
            print(f"  ya estaba: {nombre}")
            continue

        pid = db.crear_personal({
            "nombre": nombre, "cargo": cargo, "area": area, "sede": sede,
            "vinculo": "planilla", "ambito": "adm",
            "documento": str(70000000 + creadas * 137 % 9999999),
            "fecha_ingreso": (hoy - timedelta(days=400 + creadas * 90)).isoformat(),
            "telefono": "9" + str(80000000 + creadas * 4321 % 9999999),
        })
        db.crear_identidad(siguiente, "personal", pid, "facial")
        # «Enrolado» significa que el terminal confirmó rostro o huella; sin
        # eso la persona no aparece en Asistencia ni puede marcar. Como aquí
        # no hay terminal, se deja constancia igual que si lo hubiera hecho.
        db.ejecutar("UPDATE identidades SET tiene_rostro = 1, estado = 'enrolado' "
                    "WHERE staff_number = ?", (siguiente,))
        creadas += 1

        for d in range(DIAS_ATRAS):
            dia = hoy - timedelta(days=d)
            if dia.weekday() >= 5:          # sábado y domingo no se trabaja
                continue
            if random.random() > constancia:  # ese día no vino
                continue
            e = _hora(entrada)
            db.guardar_marca(siguiente, dia.isoformat(), e, "facial", "terminal")
            marcas += 1
            # Uno de cada seis días se olvida de marcar la salida: pasa, y
            # las pantallas tienen que saber enseñarlo.
            if random.random() > 0.17:
                db.guardar_marca(siguiente, dia.isoformat(),
                                 _mas(e, random.randint(430, 540)),
                                 "facial", "terminal")
                marcas += 1
        siguiente += 1
        while siguiente in usados:
            siguiente += 1

    print(f"\n  {creadas} personas de prueba · {marcas} marcas en "
          f"los últimos {DIAS_ATRAS} días")
    print("  Todas empiezan por «Zzz Prueba». Para borrarlas:")
    print("      python sembrar_prueba.py --borrar")


def borrar():
    con = db._conectar()
    fichas = con.execute(
        "SELECT id, nombre FROM personal WHERE nombre LIKE ?",
        (PREFIJO + "%",)).fetchall()
    if not fichas:
        print("  no hay nada que borrar")
        return
    ids = [f[0] for f in fichas]
    marcas = 0
    for i in ids:
        # La tabla guarda una columna por tipo de titular, no un par
        # (tipo, id): aquí siempre es personal_id.
        ident = con.execute(
            "SELECT staff_number FROM identidades WHERE personal_id = ?",
            (i,)).fetchone()
        if ident:
            marcas += db.ejecutar("DELETE FROM marcas WHERE staff_number = ?",
                                  (ident[0],))
            db.ejecutar("DELETE FROM identidades WHERE staff_number = ?",
                        (ident[0],))
        db.borrar_personal(i)
    print(f"  {len(ids)} fichas y {marcas} marcas borradas:")
    for f in fichas:
        print("    ·", f[1])


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--borrar", action="store_true",
                    help="quita las personas de prueba y sus marcas")
    args = ap.parse_args()
    db.iniciar()
    borrar() if args.borrar else sembrar()
