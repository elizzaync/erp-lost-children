# -*- coding: utf-8 -*-
"""Que una base creada por una versión ANTIGUA se ponga al día del todo.

POR QUÉ EXISTE
──────────────
Este fallo ya ha mordido dos veces, y las dos solo se vio en el contenedor:

  · 04/09/2026  `no such column: i.responsable_id`
                /api/personal y /api/beneficiarios daban 500.

  · 07/09/2026  `table marcas has no column named registrada_por`
                el sincronizador moría en cada intento, cada 90 segundos,
                y nadie traía las marcas del terminal.

Los dos son lo mismo: una columna que está en el CREATE TABLE del esquema
pero NO en `_COLUMNAS_NUEVAS`. Una base recién creada la tiene —viene en el
CREATE TABLE— y por eso aquí nunca falla nada. Una base que ya existía no la
recibe jamás, porque `CREATE TABLE IF NOT EXISTS` no toca una tabla que ya
está y `_asegurar_columnas` solo añade lo que esa lista declara.

Es un fallo invisible por diseño: la máquina donde se programa siempre tiene
la base al día.

QUÉ COMPRUEBA
─────────────
Saca el backend de commits antiguos de verdad, crea una base con CADA uno, y
después le pasa el código de hoy. Al terminar, esa base tiene que tener
exactamente las mismas tablas y columnas que una base recién creada.

No compara la lista contra sí misma —eso no probaría nada—: compara contra
esquemas históricos reales sacados de git.
"""
import json
import os
import pathlib
import shutil
import sqlite3
import subprocess
import sys
import tempfile

sys.stdout.reconfigure(encoding="utf-8")
RAIZ = pathlib.Path(__file__).resolve().parent.parent

# Versiones contra las que se comprueba. No hace falta que sean muchas: hacen
# falta las que ya estuvieron desplegadas, porque son las que existen de
# verdad en algún disco por ahí.
VERSIONES = [
    ("8449401", "17/08/2026 · la reescritura, el esquema más antiguo de este módulo"),
    ("59de533", "21/08/2026 · antes de la bandeja del formulario"),
    ("7867e49", "31/08/2026 · antes de la ubicación y la foto del terminal"),
    ("d67c84e", "17/08/2026 · el que quedó desplegado en Coolify y rompió dos veces"),
]

fallos = []


def check(c, m):
    print(("  OK    " if c else "  FALLO ") + m)
    if not c:
        fallos.append(m)


def _forma(bd):
    """{tabla: [columnas]} de una base."""
    con = sqlite3.connect(bd)
    d = {}
    for (t,) in con.execute("SELECT name FROM sqlite_master "
                            "WHERE type='table' AND name NOT LIKE 'sqlite_%'"):
        d[t] = sorted(r[1] for r in con.execute(f"PRAGMA table_info({t})"))
    con.close()
    return d


GUION_VIEJO = '''
import os, sys
os.environ["DB_PATH"] = r"{bd}"
os.environ["RRHH_ENV_PATH"] = r"{sin_env}"
sys.path.insert(0, r"{backend}")
os.chdir(r"{raiz}")
import config
config.DB_PATH = r"{bd}"
import db
db.iniciar()
'''

GUION_HOY = '''
import os, sys
os.environ["DB_PATH"] = r"{bd}"
os.environ["RRHH_ENV_PATH"] = r"{sin_env}"
sys.path.insert(0, r"{backend}")
os.chdir(r"{raiz}")
import config
config.DB_PATH = r"{bd}"
import db
db.iniciar()
'''


def _correr(guion, tmp, nombre):
    f = tmp / nombre
    f.write_text(guion, encoding="utf-8")
    return subprocess.run([sys.executable, str(f)], capture_output=True,
                          text=True, encoding="utf-8", errors="replace",
                          timeout=180)


tmp = pathlib.Path(tempfile.mkdtemp())
sin_env = tmp / "no-existe.env"
try:
    # ── La forma correcta: una base nueva con el código de hoy ─────────
    print("1. Cómo debe quedar una base al día")
    bd_hoy = tmp / "hoy.db"
    r = _correr(GUION_HOY.format(bd=bd_hoy, sin_env=sin_env,
                                 backend=RAIZ / "backend", raiz=RAIZ),
                tmp, "hoy.py")
    if r.returncode != 0:
        print((r.stdout or "") + (r.stderr or ""))
        raise SystemExit("no se pudo crear la base de referencia")
    correcta = _forma(bd_hoy)
    print(f"   {len(correcta)} tablas · "
          f"{sum(len(c) for c in correcta.values())} columnas")

    # ── Cada versión antigua ───────────────────────────────────────────
    for sha, cuando in VERSIONES:
        print(f"\n2. Una base creada por {sha} ({cuando})")

        existe = subprocess.run(["git", "cat-file", "-e", f"{sha}^{{commit}}"],
                                cwd=RAIZ, capture_output=True)
        if existe.returncode != 0:
            print(f"   (ese commit ya no está en el repositorio, se salta)")
            continue

        viejo = tmp / f"v-{sha}"
        viejo.mkdir()
        tar = tmp / f"{sha}.tar"
        arch = subprocess.run(["git", "archive", sha], cwd=RAIZ,
                              capture_output=True)
        tar.write_bytes(arch.stdout)
        subprocess.run(["tar", "-x", "-f", str(tar), "-C", str(viejo)],
                       check=True, capture_output=True)

        bd = tmp / f"{sha}.db"
        r = _correr(GUION_VIEJO.format(bd=bd, sin_env=sin_env,
                                       backend=viejo / "backend", raiz=viejo),
                    tmp, f"crea-{sha}.py")
        if r.returncode != 0 or not bd.is_file():
            print(f"   (esa versión no arranca sola aquí, se salta)")
            continue

        antes = _forma(bd)
        print(f"   nace con {len(antes)} tablas · "
              f"{sum(len(c) for c in antes.values())} columnas")

        # Ahora el código de hoy, que tiene que ponerla al día.
        r = _correr(GUION_HOY.format(bd=bd, sin_env=sin_env,
                                     backend=RAIZ / "backend", raiz=RAIZ),
                    tmp, f"pone-al-dia-{sha}.py")
        check(r.returncode == 0, f"{sha}: el código de hoy la abre sin caerse")
        if r.returncode != 0:
            print("   " + ((r.stdout or "") + (r.stderr or ""))[-600:])
            continue

        despues = _forma(bd)

        faltan_tablas = sorted(set(correcta) - set(despues))
        check(not faltan_tablas,
              f"{sha}: no falta ninguna tabla"
              + (f" (faltan: {', '.join(faltan_tablas)})" if faltan_tablas else ""))

        pendientes = []
        for t in sorted(set(correcta) & set(despues)):
            f2 = sorted(set(correcta[t]) - set(despues[t]))
            if f2:
                pendientes.append(f"{t}.{'/'.join(f2)}")
        check(not pendientes,
              f"{sha}: no falta ninguna columna"
              + (f"  ←  FALTAN: {', '.join(pendientes)}" if pendientes else ""))

finally:
    shutil.rmtree(tmp, ignore_errors=True)

print()
if fallos:
    print(f"FALLA: {len(fallos)}")
    for f in fallos:
        print("   ·", f)
    print()
    print("  Una columna que está en el CREATE TABLE pero no en")
    print("  _COLUMNAS_NUEVAS no llega nunca a las bases que ya existían.")
    sys.exit(1)
print("TODO BIEN")
