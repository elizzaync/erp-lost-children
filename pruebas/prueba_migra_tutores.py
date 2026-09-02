# -*- coding: utf-8 -*-
"""
La migración de tutores, ensayada sobre una COPIA con los casos difíciles.

No basta con que funcione en el caso fácil. Se montan a propósito los cuatro
que van a aparecer de verdad: un familiar sin documento, una tutora que además
trabaja en la casa, un tutor con dos niños, y un beneficiario cuyo tutor ya no
existe en 'personal'.
"""
import os
import sys, os, shutil, tempfile, pathlib, io, contextlib
sys.stdout.reconfigure(encoding="utf-8")

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RAIZ, "backend"))

COPIA = pathlib.Path(tempfile.mkdtemp()) / "migra_tut.db"
shutil.copy2(os.path.join(RAIZ, "data", "rrhh.db"), COPIA)
os.environ["DB_PATH"] = str(COPIA)

import config
config.DB_PATH = str(COPIA)
import db
db.config.DB_PATH = str(COPIA)
db.iniciar()
import migrar_tutores
migrar_tutores.config.DB_PATH = str(COPIA)

fallos = []
def check(c, m):
    print(("  OK    " if c else "  FALLO ") + m)
    if not c: fallos.append(m)

# ── Los casos difíciles ──────────────────────────────────────────────────
print("1. Se montan los casos que van a aparecer de verdad")

# a) Familiar sin documento, con un niño
mama = db.crear_personal({"nombre": "Zzz Rosa Huaman", "telefono": "988000111"})
n1 = db.crear_beneficiario({"nombre": "Zzz Nino Uno", "tutor_id": mama})

# b) Tutora que ADEMÁS trabaja en la casa: tiene cargo
tutora = db.crear_personal({"nombre": "Zzz Nayeli Tutora", "cargo": "Tutora de Casa Hogar",
                            "area": "Casa Hogar", "documento": "45678912"})
n2 = db.crear_beneficiario({"nombre": "Zzz Nino Dos", "tutor_id": tutora})

# c) Un tutor con DOS niños: el vínculo N-a-N tiene que reflejarlo
abuelo = db.crear_personal({"nombre": "Zzz Abuelo Mario", "documento": "10203040"})
n3 = db.crear_beneficiario({"nombre": "Zzz Nino Tres", "tutor_id": abuelo})
n4 = db.crear_beneficiario({"nombre": "Zzz Nino Cuatro", "tutor_id": abuelo})

# d) Beneficiario cuyo tutor ya no existe: vínculo roto
n5 = db.crear_beneficiario({"nombre": "Zzz Nino Huerfano"})
# La clave foránea impide crear este caso por la vía normal —buena señal—,
# así que se fuerza saltándosela: es como podría aparecer en datos escritos
# antes de que la restricción existiera. La comprobación del plan tiene que
# seguir cubriéndolo.
import sqlite3 as _s3
_c = _s3.connect(str(COPIA)); _c.execute("PRAGMA foreign_keys = OFF")
_c.execute("UPDATE beneficiarios SET tutor_id = 99999 WHERE id = ?", (n5,))
_c.commit(); _c.close()

# e) Beneficiario sin tutor, que no debe aparecer en ninguna parte
n6 = db.crear_beneficiario({"nombre": "Zzz Nino Sin Tutor"})

print(f"   3 tutores · 5 beneficiarios con tutor · 1 sin tutor · 1 con tutor inexistente")

# ── El plan, antes de tocar nada ─────────────────────────────────────────
print("\n2. El plan lo detecta todo antes de escribir")
# analizar() mira la base ENTERA, y esta copia trae lo que haya en la real:
# desde que existen fichas de ejemplo con tutor asignado, aparecen tutores
# que no son de esta prueba. La prueba solo puede afirmar sobre LO SUYO, así
# que se queda con las suyas por el prefijo. Contar el total la ataba a lo
# que hubiera sembrado cualquier otro.
todos = migrar_tutores.analizar()
tutores = [t for t in todos if t["nombre"].startswith("Zzz")]
por_nombre = {t["nombre"]: t for t in tutores}
check(len(tutores) == 3,
      f"encuentra los 3 tutores de la prueba ({len(tutores)} de {len(todos)})")
check(por_nombre["Zzz Abuelo Mario"]["ninos"] == 2, "ve que uno tiene dos beneficiarios")

avisos_mama = por_nombre["Zzz Rosa Huaman"]["avisos"]
check(any("sin documento" in a for a in avisos_mama), "avisa del que no tiene documento")
avisos_tutora = por_nombre["Zzz Nayeli Tutora"]["avisos"]
check(any("cargo" in a for a in avisos_tutora),
      "y del que tiene cargo: puede ser personal de la casa, no un familiar")

salida = io.StringIO()
with contextlib.redirect_stdout(salida):
    migrar_tutores.imprimir_plan(tutores)
texto = salida.getvalue()
check("apuntan a un tutor que YA NO EXISTE" in texto, "señala el vínculo roto")
check("Zzz Nino Huerfano" in texto, "nombrando al beneficiario afectado")
check("Zzz Nino Sin Tutor" not in texto, "y no menciona a quien no tiene tutor")

def mios():
    """Solo los que crea ESTA prueba. La copia arrastra lo que hubiera en la
    base real, y contar el total sería exigir que nadie tenga responsables."""
    return [r for r in db.responsables() if r["nombre"].startswith("Zzz ")]


antes_resp = len(mios())
check(antes_resp == 0, "hasta aquí NO ha escrito nada")

# ── La ejecución ─────────────────────────────────────────────────────────
print("\n3. Al ejecutar")
salida = io.StringIO()
with contextlib.redirect_stdout(salida):
    creadas, vinculos = migrar_tutores.ejecutar(tutores)
print(f"   {creadas} fichas · {vinculos} vínculos")
check(creadas == 3, "crea una ficha por tutor")
check(vinculos == 4, "y un vínculo por cada beneficiario que tenía")

resp = {r["nombre"]: r for r in mios()}
check(len(resp) == 3, "los tres están en responsables")
check(all(r["origen"] == "migrado" for r in resp.values()),
      "todos marcados origen='migrado', para poder revisarlos")
check(resp["Zzz Rosa Huaman"]["telefono"] == "988000111", "conserva el teléfono")
check(resp["Zzz Nayeli Tutora"]["ocupacion"] == "Tutora de Casa Hogar",
      "y el cargo pasa a ocupación, que es lo que significa fuera de la ONG")
check(resp["Zzz Abuelo Mario"]["beneficiarios"] == 2, "el de dos niños conserva los dos")

v = db.responsables_de(n1)
check(len(v) == 1 and v[0]["es_principal"] == 1,
      "el vínculo queda como responsable principal")
check(v[0]["parentesco"] == "", "y sin parentesco inventado: ese dato no existía")

print("\n4. Lo que NO se tocó")
check(db.persona_personal(mama) is not None, "la ficha de personal sigue existiendo")
check(db.persona_personal(tutora)["cargo"] == "Tutora de Casa Hogar",
      "sin modificar")
check(db.beneficiario(n1)["tutor_id"] == mama,
      "beneficiarios.tutor_id se conserva, para poder comparar")
check(len(db.responsables_de(n5)) == 0, "el huérfano queda sin responsable, como se avisó")
check(len(db.responsables_de(n6)) == 0, "y el que no tenía tutor sigue sin tener")

print("\n5. Repetir la migración no duplica")
tutores2 = [t for t in migrar_tutores.analizar()
            if t["nombre"].startswith("Zzz")]
check(all(t["ya_migrado"] for t in tutores2), "reconoce que ya están migrados")
salida = io.StringIO()
with contextlib.redirect_stdout(salida):
    c2, v2 = migrar_tutores.ejecutar(tutores2)
check(c2 == 0 and v2 == 0, "no crea nada la segunda vez")
check(len(mios()) == 3, f"siguen siendo 3 ({len(mios())})")

print("\n6. La base real ni se abrió")
import sqlite3
real = sqlite3.connect(os.path.join(RAIZ, "data", "rrhh.db"))
# Lo que se comprueba es que la migración no escribió en la base real,
# no que esté vacía: el equipo puede tener responsables propios.
n_real = real.execute(
    "SELECT COUNT(*) FROM responsables WHERE nombre LIKE 'Zzz %'").fetchone()[0]
real.close()
check(n_real == 0, f"no escribió ni una fila en la base real ({n_real})")

print("\n" + (f"  {len(fallos)} FALLOS" if fallos else "  MIGRACIÓN DE TUTORES OK (sobre copia)"))
for f in fallos: print("   -", f)
sys.exit(1 if fallos else 0)
