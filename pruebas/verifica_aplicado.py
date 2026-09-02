# -*- coding: utf-8 -*-
"""
¿Lo que dice el código está de verdad aplicado en el sistema real?

Dos veces ha pasado lo mismo: un arreglo escrito, dado por cerrado, y sin
efecto sobre la base o la configuración que corre de verdad.

  · el Paso 3 quedó a medias y solo constaba en una lista
  · el rol Trabajador perdió 'permisos' en crear_pruebas.py, pero el rol de
    la base seguía teniéndolo, así que la cuenta podía aprobarse permisos

Esto NO lee código: consulta la base real y compara con lo que el código
espera encontrar. Es la única forma de que un "ya está" signifique algo.

    py verifica_aplicado.py
"""
import os
import sqlite3
import sys

sys.stdout.reconfigure(encoding="utf-8")
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = os.path.join(RAIZ, "data", "rrhh.db")
sys.path.insert(0, os.path.join(RAIZ, "backend"))

import config          # noqa: E402
import crear_pruebas   # noqa: E402

problemas = []


def check(ok, que, detalle=""):
    print(("  OK    " if ok else "  FALTA ") + que + (f"  ({detalle})" if detalle else ""))
    if not ok:
        problemas.append(que + (" · " + detalle if detalle else ""))


con = sqlite3.connect(BASE)
con.row_factory = sqlite3.Row


print("1. Esquema: las migraciones que se ejecutaron, ¿están puestas?")
cols_ident = {r["name"] for r in con.execute("PRAGMA table_info(identidades)")}
check("responsable_id" in cols_ident,
      "identidades admite responsables",
      "falta correr backend/migrar_identidades.py --ejecutar")

sql_sol = (con.execute(
    "SELECT sql FROM sqlite_master WHERE name='solicitudes'").fetchone() or [""])[0] or ""
check("'medico'" in sql_sol,
      "solicitudes admite los seis tipos",
      "falta correr backend/migrar_tipos_permiso.py --ejecutar")

vista = (con.execute(
    "SELECT sql FROM sqlite_master WHERE name='v_identidades'").fetchone() or [""])[0] or ""
check("responsable_id" in vista,
      "la vista v_identidades distingue las tres entidades",
      "quedó la versión que etiquetaba a un tutor como beneficiario")

print("\n2. Columnas añadidas después: ¿llegaron a la base?")
for tabla, col in (("personal", "creado"), ("beneficiarios", "creado"),
                   ("personal", "sexo"), ("personal", "jornada"),
                   ("marcas", "canal")):
    cols = {r["name"] for r in con.execute(f"PRAGMA table_info({tabla})")}
    check(col in cols, f"{tabla}.{col}",
          "arranca el servidor para que db.iniciar() la añada")

print("\n3. Tablas nuevas del backend")
tablas = {r["name"] for r in con.execute(
    "SELECT name FROM sqlite_master WHERE type='table'")}
for t in ("responsables", "responsable_beneficiario", "formacion", "experiencia",
          "programas_beneficiario", "historial_educativo", "seguimiento",
          "rostros_web", "consentimientos"):
    check(t in tablas, f"tabla {t}")

print("\n4. Roles: ¿coinciden con lo que declara el código?")
for usuario, esperado, etiqueta in (
        ("prueba.trabajador", crear_pruebas.PERMISOS_TRABAJADOR, "rol Trabajador"),):
    fila = con.execute(
        "SELECT rol_id FROM usuarios WHERE usuario = ?", (usuario,)).fetchone()
    if not fila:
        check(True, f"{etiqueta}: la cuenta {usuario} no existe (nada que comparar)")
        continue
    real = {r["modulo"]: r["nivel"] for r in con.execute(
        "SELECT modulo, nivel FROM permisos_rol WHERE rol_id = ?", (fila["rol_id"],))}
    real = {k: v for k, v in real.items() if v and v != "ninguno"}
    check(real == dict(esperado), f"{etiqueta} coincide con el código",
          f"base={real} código={dict(esperado)}")

print("\n5. Módulos: ¿el catálogo del código existe en los roles?")
claves = {m[0] for m in config.MODULOS}
en_base = {r["modulo"] for r in con.execute("SELECT DISTINCT modulo FROM permisos_rol")}
huerfanos = en_base - claves
check(not huerfanos, "ningún rol guarda permisos de módulos que ya no existen",
      f"sobran: {sorted(huerfanos)}")

print("\n6. Lo construido para el formulario de tutores")
tablas = {r["name"] for r in con.execute(
    "SELECT name FROM sqlite_master WHERE type='table'")}
check("invitaciones" in tablas, "existe la tabla de invitaciones")
check("respuestas_formulario" in tablas, "existe la bandeja de respuestas")

cols_resp = {r[1] for r in con.execute("PRAGMA table_info(responsables)")}
for c in ("foto", "foto_mime", "foto_ancho", "sin_dato"):
    check(c in cols_resp, f"responsables.{c}")

# La configuración del enlace: sin ella no se puede entregar ninguno.
check(bool(getattr(config, "FORM_URL_PRELLENADO", "")),
      "la dirección del formulario está configurada")
check("PLANTILLA" in (getattr(config, "FORM_URL_PRELLENADO", "") or ""),
      "y lleva la marca donde va el código de cada familia")
check(bool(getattr(config, "FORM_HOJA_ID", "")),
      "la hoja de respuestas está configurada")

print("\n7. La definición de «enrolado», que es una sola")
# Una vista es una consulta con nombre: puede quedarse con la definición
# vieja en una base ya creada y nadie enterarse. Por eso se comprueba
# contra la base REAL, no contra el archivo del esquema.
vista = (con.execute(
    "SELECT sql FROM sqlite_master WHERE type='view' AND name='v_identidades'"
).fetchone() or [""])[0] or ""
check("enrolado" in vista, "la vista v_identidades calcula 'enrolado'")
check("tiene_rostro" in vista and "tiene_huella" in vista,
      "y lo hace con lo que el terminal confirmó")

try:
    filas = list(con.execute(
        "SELECT staff_number, estado, tiene_rostro, tiene_huella, enrolado "
        "FROM v_identidades"))
    malas = [f["staff_number"] for f in filas
             if bool(f["enrolado"]) != bool(f["tiene_rostro"] or f["tiene_huella"])]
    check(not malas, "y ninguna fila se contradice", f"raras: {malas}")
    a_medias = [f["staff_number"] for f in filas if not f["enrolado"]]
    print(f"   identidades: {len(filas)} · enroladas de verdad: "
          f"{len(filas) - len(a_medias)} · intentos a medias: {len(a_medias)}")
except sqlite3.OperationalError as e:
    check(False, "la vista se puede consultar", str(e))

print("\n8. Datos de prueba que no deberían estar en la base real")
sueltos = []
for tabla in ("personal", "beneficiarios", "responsables"):
    try:
        for r in con.execute(
                f"SELECT nombre FROM {tabla} WHERE nombre LIKE 'Zzz %' "
                "AND nombre NOT LIKE 'Zzz Prueba %'"):
            sueltos.append(f"{tabla}: {r['nombre']}")
    except sqlite3.OperationalError:
        pass
check(not sueltos, "sin fichas de prueba sueltas", ", ".join(sueltos[:5]))

n_sol = con.execute("SELECT COUNT(*) FROM solicitudes").fetchone()[0]
print(f"   solicitudes en la base: {n_sol}")

con.close()

print("\n" + ("=" * 60))
if problemas:
    print(f"  {len(problemas)} COSAS ESCRITAS PERO NO APLICADAS:")
    for p in problemas:
        print("   ·", p)
else:
    print("  TODO LO ESCRITO ESTÁ APLICADO EN EL SISTEMA REAL")
print("=" * 60)
sys.exit(1 if problemas else 0)
