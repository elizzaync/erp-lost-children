# -*- coding: utf-8 -*-
"""
planillas.py — cálculo de la planilla mensual.

QUÉ HACE Y QUÉ NO

Produce, para cada persona con condiciones laborales vigentes, la boleta de
un mes: cuánto se le paga y por qué. No guarda nombres, cargos ni sueldos
propios: el sueldo lo lee de 'condiciones_laborales' (que se edita en la
ficha de la persona) y las horas de 'marcas' (que llena Asistencia desde el
terminal). Aquí no hay una segunda copia de nada.

DOS ESTADOS, DOS COMPORTAMIENTOS

  borrador  los números se recalculan desde las marcas cada vez que se
            consultan. Si llegan marcas nuevas, la boleta las recoge sola.
  cerrada   los números quedan congelados en la tabla 'boletas'. Una marca
            que se sincronice tarde ya NO altera un mes pagado.
  pagada    igual que cerrada; solo cambia el estado.

REGLAS DE NEGOCIO DECIDIDAS CON LA ORGANIZACIÓN

1. Marca incompleta (entrada sin salida, como pasa cuando alguien olvida
   marcar al irse): el día CUENTA como presente y aporta 0 horas. No se le
   quita el pago a nadie por un fallo del marcador. Queda registrado en
   'dias_incompletos' y en el detalle, y se avisa en pantalla, pero NO
   bloquea el cierre de la planilla.

2. El bruto es el sueldo base COMPLETO. Las marcas son informativas, no un
   multiplicador. Motivo: hoy la mayoría del personal no está enrolada en
   el terminal; prorratear por días marcados les pondría el sueldo en cero
   por un dato que falta, no por una ausencia real. Cuando esté todo el
   personal enrolado habrá que revisar esta regla.

3. Vacaciones y permisos no entran todavía: la Bandeja de Solicitudes es
   maqueta. Cuando exista, se descuentan aquí.

LO QUE FALTA A PROPÓSITO

  - Feriados: los días hábiles son de lunes a viernes. No hay calendario
    de feriados peruanos.
  - AFP/ONP/EsSalud reales: por ahora un porcentaje plano configurable en
    Configuración. Los topes, la asignación familiar y la quinta categoría
    son otro problema.
"""
import calendar
import json
import logging
from datetime import date, timedelta

import db

log = logging.getLogger("planillas")

ESTADOS = ("borrador", "cerrada", "pagada")


# ── Utilidades de período ─────────────────────────────────────────────────

def periodo_valido(periodo):
    """'2026-08' -> True. Se valida porque llega por la URL."""
    try:
        anio, mes = str(periodo).split("-")
        return len(anio) == 4 and 1 <= int(mes) <= 12 and int(anio) > 1900
    except (ValueError, AttributeError):
        return False


def rango_del_periodo(periodo):
    """'2026-08' -> ('2026-08-01', '2026-08-31')."""
    anio, mes = (int(x) for x in periodo.split("-"))
    ultimo = calendar.monthrange(anio, mes)[1]
    return f"{anio:04d}-{mes:02d}-01", f"{anio:04d}-{mes:02d}-{ultimo:02d}"


def dias_habiles(periodo):
    """
    Lunes a viernes del mes. Sin feriados: no tenemos calendario oficial y
    inventarlos daría un número que parece exacto y no lo es.
    """
    anio, mes = (int(x) for x in periodo.split("-"))
    ultimo = calendar.monthrange(anio, mes)[1]
    return sum(1 for d in range(1, ultimo + 1)
               if date(anio, mes, d).weekday() < 5)


def periodo_actual():
    hoy = date.today()
    return f"{hoy.year:04d}-{hoy.month:02d}"


def periodos_disponibles(cuantos=12):
    """Los últimos meses, para el selector. El actual primero."""
    hoy = date.today().replace(day=1)
    salida = []
    for _ in range(cuantos):
        salida.append(f"{hoy.year:04d}-{hoy.month:02d}")
        hoy = (hoy - timedelta(days=1)).replace(day=1)
    return salida


# ── Descuentos ────────────────────────────────────────────────────────────

def porcentajes():
    """
    Configurables desde Configuración. Son placeholders hasta que un
    contador confirme las cifras reales; por eso NO están en el código.
    """
    def leer(clave, defecto):
        try:
            return float(db.parametro(clave, "") or defecto)
        except (TypeError, ValueError):
            return defecto
    return {
        "planilla":   leer("descuento_planilla", db.DESCUENTO_POR_DEFECTO["planilla"]),
        "honorarios": leer("descuento_honorarios", db.DESCUENTO_POR_DEFECTO["honorarios"]),
        "sin_pago":   0.0,
    }


# ── Cálculo ───────────────────────────────────────────────────────────────

def _horas_a_decimal(texto):
    """'8:30' -> 8.5. Devuelve 0 si no encaja."""
    try:
        h, m = (int(x) for x in str(texto).split(":")[:2])
        return round(h + m / 60.0, 2)
    except (ValueError, AttributeError):
        return 0.0


def _asistencia_del_periodo(periodo):
    """
    Días y horas de cada ficha en el mes, sacados de las marcas del
    terminal. Devuelve {personal_id: {...}}.

    Un día con una sola marca es un día INCOMPLETO: se sabe que la persona
    vino (hay entrada) pero no cuántas horas estuvo. Cuenta como presente y
    aporta 0 horas — la regla decidida con la organización.
    """
    desde, hasta = rango_del_periodo(periodo)
    resumen = {}
    for ident in db.marcas_rango(desde, hasta):
        pid = ident.get("personal_id")
        if not pid:            # identidad de un beneficiario: no va a planilla
            continue
        dias = ident.get("dias") or {}
        incompletos = sorted(f for f, d in dias.items() if not d.get("horas"))
        horas = sum(_horas_a_decimal(d.get("horas")) for d in dias.values())
        resumen[pid] = {
            "staff_number": ident.get("staff_number"),
            "dias_marcados": len(dias),
            "dias_incompletos": len(incompletos),
            "incompletos": incompletos,
            "horas": round(horas, 2),
        }
    return resumen


def calcular(periodo, condicion, asistencia):
    """
    Los números de una persona en un mes. Función pura: no toca la base ni
    depende del reloj, para poder probarla con cualquier caso.
    """
    regimen = condicion["regimen"]
    sueldo = float(condicion["sueldo_base"] or 0)
    pct = porcentajes().get(regimen, 0.0)

    # Regla 2: el bruto es el sueldo completo, las marcas no lo recortan.
    bruto = sueldo
    descuentos = round(bruto * pct / 100.0, 2)
    neto = round(bruto - descuentos, 2)

    a = asistencia or {}
    return {
        "periodo": periodo,
        "regimen": regimen,
        "sueldo_base": sueldo,
        "dias_habiles": dias_habiles(periodo),
        "dias_marcados": a.get("dias_marcados", 0),
        "dias_incompletos": a.get("dias_incompletos", 0),
        "horas": a.get("horas", 0.0),
        "bruto": bruto,
        "descuentos": descuentos,
        "neto": neto,
        "porcentaje": pct,
        # Sin identidad biométrica no hay marcas posibles: decirlo es
        # distinto de decir "0 días", que sería mentir.
        "enrolado": bool(a.get("staff_number")),
        "detalle": json.dumps({"incompletos": a.get("incompletos", [])}),
    }


def _fila(persona, condicion, calculo, guardada):
    """Une ficha + condición + cálculo en lo que consume la pantalla."""
    fila = dict(calculo)
    fila.update({
        "personal_id": persona["id"],
        "nombre": persona["nombre"],
        "cargo": persona.get("cargo") or "",
        "area": persona.get("area") or "",
        "vinculo": persona.get("vinculo") or "staff",
        "estado": (guardada or {}).get("estado", "borrador"),
        "cerrada_el": (guardada or {}).get("cerrada_el", ""),
        "congelada": bool(guardada),
    })
    if guardada:
        # Cerrada: mandan los valores congelados, no el recálculo.
        for c in ("sueldo_base", "dias_habiles", "dias_marcados",
                  "dias_incompletos", "horas", "bruto", "descuentos",
                  "neto", "regimen", "detalle"):
            fila[c] = guardada[c]
        try:
            fila["incompletos"] = json.loads(guardada["detalle"] or "{}").get("incompletos", [])
        except (ValueError, TypeError):
            fila["incompletos"] = []
    else:
        fila["incompletos"] = json.loads(calculo["detalle"]).get("incompletos", [])
    return fila


def planilla(periodo):
    """
    La planilla de un mes: una fila por persona con condiciones vigentes,
    más la lista aparte de quienes no las tienen.

    Las boletas en borrador se recalculan aquí mismo; las cerradas se leen
    tal cual quedaron.
    """
    if not periodo_valido(periodo):
        raise ValueError(f"Período no reconocido: {periodo!r}")

    _, ultimo_dia = rango_del_periodo(periodo)
    asistencia = _asistencia_del_periodo(periodo)
    guardadas = db.boletas_de(periodo)

    filas, sin_condicion = [], []
    for persona in db.personal():
        # La condición que regía al CERRAR el mes, no la de hoy: si a
        # alguien le suben el sueldo en septiembre, agosto no cambia.
        cond = db.condicion_vigente(persona["id"], ultimo_dia)
        if not cond:
            sin_condicion.append({
                "personal_id": persona["id"], "nombre": persona["nombre"],
                "cargo": persona.get("cargo") or "",
                "area": persona.get("area") or "",
                "vinculo": persona.get("vinculo") or "staff",
            })
            continue
        calculo = calcular(periodo, cond, asistencia.get(persona["id"]))
        filas.append(_fila(persona, cond, calculo, guardadas.get(persona["id"])))

    filas.sort(key=lambda f: (-f["neto"], f["nombre"]))
    return {
        "periodo": periodo,
        "filas": filas,
        "sin_condicion": sin_condicion,
        "totales": totales(filas),
        "estado": estado_periodo(filas),
        "porcentajes": porcentajes(),
    }


def totales(filas):
    return {
        "personas": len(filas),
        "bruto": round(sum(f["bruto"] for f in filas), 2),
        "descuentos": round(sum(f["descuentos"] for f in filas), 2),
        "neto": round(sum(f["neto"] for f in filas), 2),
        "dias_incompletos": sum(f["dias_incompletos"] for f in filas),
        "sin_enrolar": sum(1 for f in filas if not f["enrolado"]),
        "cerradas": sum(1 for f in filas if f["estado"] in ("cerrada", "pagada")),
        "pagadas": sum(1 for f in filas if f["estado"] == "pagada"),
    }


def estado_periodo(filas):
    """abierto | cerrado | pagado, según en qué punto están sus boletas."""
    if not filas:
        return "abierto"
    estados = {f["estado"] for f in filas}
    if estados == {"pagada"}:
        return "pagado"
    if estados <= {"cerrada", "pagada"}:
        return "cerrado"
    return "abierto"


# ── Cierre, pago y reapertura ─────────────────────────────────────────────

def cerrar(periodo):
    """
    Congela los números del mes. Los días incompletos NO lo impiden: se
    cuentan como presentes y quedan anotados, según la regla decidida.
    """
    datos = planilla(periodo)
    if not datos["filas"]:
        raise ValueError("No hay nadie con condiciones laborales en este período")

    hoy = date.today().isoformat()
    congeladas = 0
    for f in datos["filas"]:
        if f["estado"] in ("cerrada", "pagada"):
            continue          # ya estaba: no se vuelve a tocar
        db.guardar_boleta({
            "personal_id": f["personal_id"], "periodo": periodo,
            "regimen": f["regimen"], "sueldo_base": f["sueldo_base"],
            "dias_habiles": f["dias_habiles"], "dias_marcados": f["dias_marcados"],
            "dias_incompletos": f["dias_incompletos"], "horas": f["horas"],
            "bruto": f["bruto"], "descuentos": f["descuentos"], "neto": f["neto"],
            "estado": "cerrada", "cerrada_el": hoy, "detalle": f["detalle"],
        })
        congeladas += 1
    return {"cerradas": congeladas, "total": len(datos["filas"])}


def reabrir(periodo):
    """
    Vuelve el mes a borrador descartando los valores congelados, para que
    se recalculen desde las marcas actuales.

    Las boletas ya PAGADAS no se tocan: reabrir un pago hecho sería
    reescribir un hecho, no corregir un cálculo.
    """
    pagadas = [b for b in db.boletas_de(periodo).values() if b["estado"] == "pagada"]
    if pagadas:
        raise ValueError(
            f"{len(pagadas)} boleta(s) de este período ya están pagadas. "
            "Hay que revertir el pago antes de reabrir.")
    borradas = db.borrar_boletas(periodo)
    return {"reabiertas": borradas}


def pagar(personal_id, periodo):
    b = db.boleta(personal_id, periodo)
    if not b:
        raise ValueError("Esa boleta todavía no está cerrada")
    if b["estado"] == "borrador":
        raise ValueError("Hay que cerrar la planilla antes de marcar el pago")
    if b["estado"] == "pagada":
        return {"ya_estaba": True}
    db.cambiar_estado_boleta(personal_id, periodo, "pagada")
    return {"ya_estaba": False}


def revertir_pago(personal_id, periodo):
    """Deshace un pago marcado por error. La boleta vuelve a 'cerrada'."""
    b = db.boleta(personal_id, periodo)
    if not b:
        raise ValueError("No existe esa boleta")
    if b["estado"] != "pagada":
        raise ValueError("Esa boleta no está marcada como pagada")
    db.cambiar_estado_boleta(personal_id, periodo, "cerrada")
    return {"ok": True}


def detalle(personal_id, periodo):
    """El desglose de una boleta, para la pantalla de detalle."""
    datos = planilla(periodo)
    for f in datos["filas"]:
        if f["personal_id"] == personal_id:
            f = dict(f)
            f["condicion"] = db.condicion_vigente(
                personal_id, rango_del_periodo(periodo)[1])
            f["historial"] = db.condiciones_de(personal_id)
            return f
    return None
