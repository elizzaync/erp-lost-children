# -*- coding: utf-8 -*-
"""
rutas/planillas.py — Cálculo mensual y boletas.

6 rutas. Cada una valida, comprueba permisos y delega:
la lógica vive en los módulos de negocio, no aquí.
"""
import datetime
from flask import jsonify, request
import auth
import planillas
import construir_interfaz
from flask import Blueprint
from .apoyo import (_error, log)

bp = Blueprint("planillas", __name__)

# ── Planillas ─────────────────────────────────────────────────────────────
#
# Las boletas en borrador se recalculan en cada consulta desde las marcas;
# las cerradas se leen congeladas. Ver planillas.py para las reglas.

@bp.get("/api/planillas")
@auth.requiere("planillas", "vista")
def listar_planilla():
    periodo = (request.args.get("periodo") or "").strip() or planillas.periodo_actual()
    if not planillas.periodo_valido(periodo):
        return _error("El período debe tener el formato AAAA-MM", 400)
    try:
        datos = planillas.planilla(periodo)
        datos["ok"] = True
        datos["periodos"] = planillas.periodos_disponibles()
        return jsonify(datos)
    except Exception as e:
        log.exception("fallo al calcular la planilla")
        return _error(e, 500)

@bp.get("/api/planillas/<periodo>/<int:personal_id>")
@auth.requiere("planillas", "vista")
def detalle_boleta(periodo, personal_id):
    if not planillas.periodo_valido(periodo):
        return _error("El período debe tener el formato AAAA-MM", 400)
    d = planillas.detalle(periodo=periodo, personal_id=personal_id)
    if not d:
        return _error("Esa persona no tiene boleta en este período", 404)
    return jsonify({"ok": True, "boleta": d})

@bp.post("/api/planillas/<periodo>/cerrar")
@auth.requiere("planillas", "edicion")
def cerrar_planilla(periodo):
    if not planillas.periodo_valido(periodo):
        return _error("El período debe tener el formato AAAA-MM", 400)
    try:
        return jsonify({"ok": True, **planillas.cerrar(periodo)})
    except ValueError as e:
        return _error(e, 400)
    except Exception as e:
        log.exception("fallo al cerrar la planilla")
        return _error(e, 500)

@bp.post("/api/planillas/<periodo>/reabrir")
@auth.requiere("planillas", "edicion")
def reabrir_planilla(periodo):
    if not planillas.periodo_valido(periodo):
        return _error("El período debe tener el formato AAAA-MM", 400)
    try:
        return jsonify({"ok": True, **planillas.reabrir(periodo)})
    except ValueError as e:
        return _error(e, 400)
    except Exception as e:
        log.exception("fallo al reabrir la planilla")
        return _error(e, 500)

@bp.post("/api/planillas/<periodo>/<int:personal_id>/pagar")
@auth.requiere("planillas", "edicion")
def pagar_boleta(periodo, personal_id):
    if not planillas.periodo_valido(periodo):
        return _error("El período debe tener el formato AAAA-MM", 400)
    try:
        return jsonify({"ok": True, **planillas.pagar(personal_id, periodo)})
    except ValueError as e:
        return _error(e, 400)
    except Exception as e:
        log.exception("fallo al marcar el pago")
        return _error(e, 500)

@bp.post("/api/planillas/<periodo>/<int:personal_id>/revertir")
@auth.requiere("planillas", "edicion")
def revertir_pago_boleta(periodo, personal_id):
    if not planillas.periodo_valido(periodo):
        return _error("El período debe tener el formato AAAA-MM", 400)
    try:
        return jsonify({"ok": True, **planillas.revertir_pago(personal_id, periodo)})
    except ValueError as e:
        return _error(e, 400)
    except Exception as e:
        log.exception("fallo al revertir el pago")
        return _error(e, 500)

