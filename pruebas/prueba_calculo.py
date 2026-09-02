# -*- coding: utf-8 -*-
"""Reglas de cálculo de planillas, sobre una COPIA de la base."""
import os
import sys, os, shutil, json
sys.stdout.reconfigure(encoding="utf-8")

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RAIZ, "backend"))
COPIA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "rrhh_calc.db")
shutil.copy2(os.path.join(RAIZ, "data", "rrhh.db"), COPIA)

import config
config.DB_PATH = COPIA
import db
db.config.DB_PATH = COPIA
import planillas

fallos = []
def check(c, m):
    print(("  OK    " if c else "  FALLO ") + m)
    if not c: fallos.append(m)

print("\n1. Días hábiles del mes (lunes a viernes)")
for p, esperado in [("2026-08", 21), ("2026-02", 20), ("2026-05", 21)]:
    d = planillas.dias_habiles(p)
    print(f"   {p} -> {d}")
    check(d == esperado, f"{p} tiene {esperado} días hábiles")

print("\n2. Rango del período")
print("   ", planillas.rango_del_periodo("2026-08"), planillas.rango_del_periodo("2026-02"))
check(planillas.rango_del_periodo("2026-08") == ("2026-08-01", "2026-08-31"), "agosto entero")
check(planillas.rango_del_periodo("2026-02") == ("2026-02-01", "2026-02-28"), "febrero no inventa el 30")

print("\n3. Períodos inválidos se rechazan")
for p in ["2026-13", "agosto", "", "2026", "26-08", None]:
    check(not planillas.periodo_valido(p), f"rechaza {p!r}")

print("\n4. El bruto es el sueldo completo, las marcas no lo recortan")
cond = {"regimen": "planilla", "sueldo_base": 3000.0, "jornada_horas": 8}
sin_marcas   = planillas.calcular("2026-08", cond, None)
con_2_dias   = planillas.calcular("2026-08", cond, {"dias_marcados": 2, "dias_incompletos": 0,
                                                    "incompletos": [], "horas": 16.0, "staff_number": 9001})
print(f"   sin marcas: bruto {sin_marcas['bruto']}  neto {sin_marcas['neto']}")
print(f"   2 días:     bruto {con_2_dias['bruto']}  neto {con_2_dias['neto']}")
check(sin_marcas["bruto"] == 3000.0, "quien no marcó igual cobra su sueldo")
check(sin_marcas["bruto"] == con_2_dias["bruto"], "el bruto no depende de los días marcados")
check(sin_marcas["enrolado"] is False, "se distingue 'sin enrolar' de '0 días'")
check(con_2_dias["enrolado"] is True, "quien tiene identidad figura como enrolado")

print("\n5. Descuentos por régimen")
casos = [("planilla", 3000.0, 12.0, 360.0, 2640.0),
         ("honorarios", 2000.0, 8.0, 160.0, 1840.0),
         ("sin_pago", 0.0, 0.0, 0.0, 0.0)]
for regimen, sueldo, pct, desc, neto in casos:
    r = planillas.calcular("2026-08", {"regimen": regimen, "sueldo_base": sueldo}, None)
    print(f"   {regimen:11} S/ {r['bruto']:>7.0f}  -{r['descuentos']:>7.2f} ({r['porcentaje']}%)  = {r['neto']:.2f}")
    check(abs(r["descuentos"] - desc) < 0.01 and abs(r["neto"] - neto) < 0.01,
          f"{regimen}: {pct}% de descuento")

print("\n6. Día con marca incompleta: cuenta como presente, 0 horas")
a = {"dias_marcados": 3, "dias_incompletos": 1, "incompletos": ["2026-08-12"],
     "horas": 16.0, "staff_number": 9001}
r = planillas.calcular("2026-08", cond, a)
print(f"   días marcados {r['dias_marcados']}, incompletos {r['dias_incompletos']}, horas {r['horas']}")
check(r["dias_marcados"] == 3, "el día incompleto SÍ cuenta como día presente")
check(r["dias_incompletos"] == 1, "queda contabilizado como incompleto")
check(json.loads(r["detalle"])["incompletos"] == ["2026-08-12"], "se guarda QUÉ día fue, para auditar")
check(r["neto"] == 2640.0, "no se le recorta el pago por el olvido")

print("\n7. Las horas se leen de las marcas del terminal")
# Fixtura propia sobre la copia: antes usaba a hari y edward, fichas reales
# que se borraron por ser de prueba. Una prueba no debe depender de datos
# que alguien puede borrar legítimamente.
INC = db.crear_personal({"nombre": "Zzz Incompleta", "cargo": "Prueba"})
COM = db.crear_personal({"nombre": "Zzz Completa", "cargo": "Prueba"})
db.crear_identidad(9902, "personal", INC, "facial")
db.actualizar_identidad(9902, "enrolado", rostro=1)
db.guardar_marca(9902, "2026-08-12", "12:27")          # solo entrada
db.crear_identidad(9901, "personal", COM, "facial")
db.actualizar_identidad(9901, "enrolado", rostro=1)
for _h in ("12:33", "12:39"):                          # entrada y salida
    db.guardar_marca(9901, "2026-08-12", _h)

asis = planillas._asistencia_del_periodo("2026-08")
for pid, a in sorted(asis.items()):
    p = db.persona_personal(pid)
    print(f"   {p['nombre']:<16} días {a['dias_marcados']}  incompletos {a['dias_incompletos']}  horas {a['horas']}  {a['incompletos']}")
inc = [a for pid, a in asis.items() if db.persona_personal(pid)["nombre"] == "Zzz Incompleta"]
com = [a for pid, a in asis.items() if db.persona_personal(pid)["nombre"] == "Zzz Completa"]
check(bool(inc) and inc[0]["dias_incompletos"] == 1,
      "entrada sin salida sale como día incompleto")
check(bool(inc) and inc[0]["dias_marcados"] == 1,
      "y ese día igual cuenta como presente")
check(bool(com) and com[0]["dias_incompletos"] == 0,
      "entrada y salida no figura como incompleto")

print("\n8. El sueldo que manda es el del período, no el de hoy")
# Antes usaba el id 3 fijo, que era una de las 20 personas de la semilla.
# Esa semilla se retiró y la base arranca vacía, así que la prueba usa la
# ficha que ella misma creó: no puede depender de datos que ya no existen.
SUE = db.crear_personal({"nombre": "Zzz Sueldos", "cargo": "Prueba"})
db.crear_condicion(SUE, "planilla", 2000, vigente_desde="2026-01-01")
db.crear_condicion(SUE, "planilla", 5000, vigente_desde="2026-09-01")
ago = planillas.planilla("2026-08")
sep = planillas.planilla("2026-09")
f_ago = [f for f in ago["filas"] if f["personal_id"] == SUE][0]
f_sep = [f for f in sep["filas"] if f["personal_id"] == SUE][0]
print(f"   agosto: S/ {f_ago['bruto']:.0f}   septiembre: S/ {f_sep['bruto']:.0f}")
check(f_ago["bruto"] == 2000.0, "agosto usa el sueldo que regía en agosto")
check(f_sep["bruto"] == 5000.0, "septiembre usa el nuevo")

print("\n9. Quien no tiene condiciones sale aparte, no con sueldo cero")
pl = planillas.planilla("2026-08")
print(f"   con boleta: {len(pl['filas'])}   sin condiciones: {len(pl['sin_condicion'])}")
# Se comprueba por identidad, no por cantidad: el ">= 2" de antes se
# cumplía de casualidad con los datos de la semilla, y con la base limpia
# dejaba de valer. Lo que importa es que cada persona caiga en la lista que
# le toca, no cuántas haya.
ids_con = {f["personal_id"] for f in pl["filas"]}
ids_sin = {s["personal_id"] for s in pl["sin_condicion"]}
check(SUE in ids_con, "quien tiene condiciones aparece con boleta")
check(INC in ids_sin and COM in ids_sin,
      "quienes no las tienen van a la lista aparte, no con sueldo cero")
check(not (ids_con & ids_sin), "nadie está en las dos listas")
check(len(ids_con | ids_sin) == len(db.personal()), "entre las dos suman todo el personal")

print("\n10. Cerrar congela; una marca nueva ya no cambia el mes")
# La persona tiene que estar enrolada Y tener condiciones: si no, o no
# puede marcar, o no aparece en la planilla.
ident = db.identidades()[0]
pid_enrolado = ident["personal_id"]
sn = ident["staff_number"]
db.crear_condicion(pid_enrolado, "planilla", 1500, vigente_desde="2026-01-01")
nombre_enrolado = db.persona_personal(pid_enrolado)["nombre"]
print(f"   usando a {nombre_enrolado} (id {pid_enrolado}, terminal {sn})")

prev = [f for f in planillas.planilla("2026-08")["filas"] if f["personal_id"] == pid_enrolado][0]
print(f"   antes de cerrar: {prev['dias_marcados']} días marcados")
planillas.cerrar("2026-08")
# El día se busca LIBRE, no se escribe a mano. Con el 20 fijo la prueba
# dependía de que esa persona no tuviera ya marca ese día; desde que la
# copia trae marcas del equipo, a veces la tenía y añadir otra no sumaba
# un día nuevo — la prueba lo leía como que recalcular no funcionaba.
_ocupados = {f["fecha"] for f in db.consultar(
    "SELECT DISTINCT fecha FROM marcas WHERE staff_number = ?", (sn,))}
DIA_LIBRE = next(d for d in (f"2026-08-{n:02d}" for n in range(1, 29))
                 if d not in _ocupados)
print(f"   día libre elegido: {DIA_LIBRE}")
db.guardar_marca(sn, DIA_LIBRE, "08:00")
db.guardar_marca(sn, DIA_LIBRE, "17:00")
despues = planillas.planilla("2026-08")
fe = [f for f in despues["filas"] if f["personal_id"] == pid_enrolado][0]
print(f"   cerrada: {fe['dias_marcados']} días (la marca nueva NO entró)")
check(fe["estado"] == "cerrada", "la boleta quedó cerrada")
check(fe["dias_marcados"] == prev["dias_marcados"], "la marca posterior no altera el mes cerrado")
check(fe["bruto"] == prev["bruto"], "el monto congelado no se movió")
check(despues["estado"] == "cerrado", "el período figura como cerrado")

print("\n11. Reabrir vuelve a calcular")
planillas.reabrir("2026-08")
reab = planillas.planilla("2026-08")
fr = [f for f in reab["filas"] if f["personal_id"] == pid_enrolado][0]
print(f"   estado: {fr['estado']}   período: {reab['estado']}   días ahora: {fr['dias_marcados']}")
check(fr["estado"] == "borrador", "las boletas vuelven a borrador")
check(reab["estado"] == "abierto", "el período vuelve a abierto")
check(fr["dias_marcados"] == prev["dias_marcados"] + 1,
      "al recalcular sí recoge la marca que había llegado tarde")

print("\n12. Una boleta pagada no se puede reabrir sin revertir")
planillas.cerrar("2026-08")
planillas.pagar(SUE, "2026-08")
try:
    planillas.reabrir("2026-08")
    check(False, "reabrir con boletas pagadas debería fallar")
except ValueError as e:
    print(f"   {e}")
    check("pagadas" in str(e), "avisa que hay que revertir el pago primero")
planillas.revertir_pago(SUE, "2026-08")
planillas.reabrir("2026-08")
check(planillas.planilla("2026-08")["estado"] == "abierto", "tras revertir sí se puede reabrir")

print("\n13. No se puede pagar lo que no está cerrado")
try:
    planillas.pagar(SUE, "2026-08")
    check(False, "pagar un borrador debería fallar")
except ValueError as e:
    print(f"   {e}")
    check(True, "pagar un borrador se rechaza")

print("\n" + (f"  {len(fallos)} FALLOS" if fallos else "  CÁLCULO OK"))
for f in fallos: print("   -", f)
sys.exit(1 if fallos else 0)
