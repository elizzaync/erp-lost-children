# -*- coding: utf-8 -*-
"""
Datos de prueba para las suites que necesitan gente enrolada con marcas.

Antes usaban a luis, hari y edward —fichas reales de la base creadas para
probar yunatt— y al borrarlas cuatro suites se quedaron sin fixtura. Una
prueba no debe depender de datos que alguien puede borrar legítimamente:
ahora se los crea ella misma y se los lleva al terminar.

Las identidades se insertan DIRECTO en la base, sin pasar por yunatt: son
locales, no tocan el terminal físico ni la cuenta compartida.

    py fixtura.py crear     -> imprime los ids en JSON
    py fixtura.py borrar
"""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend"))
sys.stdout.reconfigure(encoding="utf-8")

import db

FECHA = "2026-08-12"          # las suites están fijadas a este día

# Reproduce los tres casos que las pruebas ejercitan:
#   completa   -> entrada y salida, con horas calculables
#   incompleta -> solo entrada (el caso que decide la regla de planillas)
#   sin marcas -> enrolada pero no marcó ese día
# 'ambito' y 'vinculo' reproducen los tres casos del filtro de Asistencia:
# un voluntario solo sale en General; un colaborador de casa hogar ('min')
# en General y Colaboradores; uno de oficina ('adm') en Administración.
GENTE = [
    {"nombre": "Zzz Marca Completa",   "sn": 9901, "ambito": "adm",
     "vinculo": "staff", "horas": ["12:33", "12:35", "12:36", "12:39"]},
    {"nombre": "Zzz Marca Incompleta", "sn": 9902, "ambito": "min",
     "vinculo": "staff", "horas": ["12:27"]},
    {"nombre": "Zzz Sin Marcas",       "sn": 9903, "ambito": "min",
     "vinculo": "voluntario", "horas": []},
]


def borrar():
    quitados = 0
    for g in GENTE:
        for p in db.personal(incluir_inactivos=True):
            if p["nombre"] == g["nombre"]:
                # Sin pasar por personas.borrar_personal: eso llamaría a
                # yunatt para desenrolar, y estas identidades solo existen
                # aquí. La cascada de SQLite limpia identidad y marcas.
                db.ejecutar("DELETE FROM personal WHERE id = ?", (p["id"],))
                quitados += 1
    return quitados


def crear():
    borrar()
    out = {}
    for g in GENTE:
        pid = db.crear_personal({"nombre": g["nombre"], "cargo": "Prueba",
                                 "area": "Prueba", "sede": "Lima",
                                 "ambito": g["ambito"], "vinculo": g["vinculo"]})
        db.crear_identidad(g["sn"], "personal", pid, "facial")
        db.actualizar_identidad(g["sn"], "enrolado", rostro=1)
        for h in g["horas"]:
            db.guardar_marca(g["sn"], FECHA, h)
        out[g["nombre"]] = {"personal_id": pid, "staff_number": g["sn"],
                            "marcas": len(g["horas"])}
    return out


if __name__ == "__main__":
    db.iniciar()
    accion = sys.argv[1] if len(sys.argv) > 1 else "crear"
    if accion == "borrar":
        print(json.dumps({"borrados": borrar()}))
    else:
        print(json.dumps(crear(), ensure_ascii=False))
