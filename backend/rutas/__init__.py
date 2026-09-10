# -*- coding: utf-8 -*-
"""
Los blueprints del módulo, y el único sitio donde se listan.

app.py los registra recorriendo TODOS: añadir un grupo nuevo es
importarlo aquí y ponerlo en la lista, sin tocar app.py.
"""
from .sistema import bp as bp_sistema
from .acceso import bp as bp_acceso
from .personal import bp as bp_personal
from .responsables import bp as bp_responsables
from .asistencia import bp as bp_asistencia
from .beneficiarios import bp as bp_beneficiarios
from .planillas import bp as bp_planillas
from .permisos import bp as bp_permisos

TODOS = (
    bp_sistema,
    bp_acceso,
    bp_personal,
    bp_responsables,
    bp_asistencia,
    bp_beneficiarios,
    bp_planillas,
    bp_permisos,
)
