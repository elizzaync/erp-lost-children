# -*- coding: utf-8 -*-
"""
Reconstruye 'rostros_web' y 'consentimientos' para que admitan niños.

POR QUÉ
───────
El canal del celular nació solo para trabajadores: las dos tablas tenían
`personal_id` —en rostros_web, además, como CLAVE PRIMARIA— y un
beneficiario no cabía en ninguna de las dos.

Hace falta que quepa porque el día que la nube del terminal se cae, el
celular es el único camino que queda para registrar asistencia. Y los
niños no tienen teléfono: su cara la registra un trabajador con el suyo,
y su asistencia la toma también un adulto.

POR QUÉ RECONSTRUIR Y NO AÑADIR UNA COLUMNA
───────────────────────────────────────────
SQLite no deja cambiar la clave primaria ni añadir un CHECK con ALTER
TABLE. Hay que crear la tabla nueva, copiar, borrar la vieja y renombrar.
Es lo mismo que se hizo en migrar_identidades.py cuando los tutores
dejaron de ser filas de 'personal'.

QUÉ CONSERVA
────────────
Todo. Los rostros ya registrados y todos los consentimientos, incluidos
los revocados: la constancia de que alguien dijo que no es tan importante
como la de que dijo que sí.

USO
───
    py backend\\migrar_rostros_ninos.py              enseña qué haría
    py backend\\migrar_rostros_ninos.py --ejecutar   lo hace
"""
import argparse
import os
import shutil
import sqlite3
import sys
from datetime import datetime

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import config  # noqa: E402

NUEVA_ROSTROS = """
CREATE TABLE rostros_web_nueva (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    personal_id     INTEGER REFERENCES personal(id)      ON DELETE CASCADE,
    beneficiario_id INTEGER REFERENCES beneficiarios(id) ON DELETE CASCADE,
    descriptor  TEXT NOT NULL,
    dimension   INTEGER DEFAULT 0,
    modelo      TEXT DEFAULT '',
    creado      TEXT DEFAULT (datetime('now','localtime')),
    actualizado TEXT DEFAULT (datetime('now','localtime')),
    registrado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    CHECK ((personal_id IS NOT NULL) + (beneficiario_id IS NOT NULL) = 1),
    UNIQUE (personal_id),
    UNIQUE (beneficiario_id)
);
"""

NUEVA_CONSENT = """
CREATE TABLE consentimientos_nueva (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    personal_id     INTEGER REFERENCES personal(id)      ON DELETE CASCADE,
    beneficiario_id INTEGER REFERENCES beneficiarios(id) ON DELETE CASCADE,
    responsable_id  INTEGER REFERENCES responsables(id)  ON DELETE SET NULL,
    tipo        TEXT NOT NULL DEFAULT 'rostro_web',
    aceptado    INTEGER NOT NULL DEFAULT 0,
    version     TEXT DEFAULT '',
    texto       TEXT DEFAULT '',
    cuando      TEXT DEFAULT (datetime('now','localtime')),
    ip          TEXT DEFAULT '',
    agente      TEXT DEFAULT '',
    revocado_el TEXT DEFAULT '',
    CHECK ((personal_id IS NOT NULL) + (beneficiario_id IS NOT NULL) = 1)
);
"""


def _columnas(con, tabla):
    return [f[1] for f in con.execute(f"PRAGMA table_info({tabla})")]


def hace_falta(con):
    """¿Está ya migrada? Se mira si existe la columna, no una versión."""
    faltan = []
    if "beneficiario_id" not in _columnas(con, "rostros_web"):
        faltan.append("rostros_web")
    if "beneficiario_id" not in _columnas(con, "consentimientos"):
        faltan.append("consentimientos")
    if "registrada_por" not in _columnas(con, "marcas"):
        faltan.append("marcas")
    return faltan


def migrar(con):
    hechos = []

    if "beneficiario_id" not in _columnas(con, "rostros_web"):
        antes = con.execute("SELECT COUNT(*) FROM rostros_web").fetchone()[0]
        con.executescript(NUEVA_ROSTROS)
        con.execute("""
            INSERT INTO rostros_web_nueva
                (personal_id, descriptor, dimension, modelo,
                 creado, actualizado, registrado_por)
            SELECT personal_id, descriptor, dimension, modelo,
                   creado, actualizado, registrado_por
              FROM rostros_web""")
        con.execute("DROP TABLE rostros_web")
        con.execute("ALTER TABLE rostros_web_nueva RENAME TO rostros_web")
        despues = con.execute("SELECT COUNT(*) FROM rostros_web").fetchone()[0]
        if antes != despues:
            raise SystemExit(f"ABORTA: rostros_web tenía {antes} y quedaron {despues}")
        hechos.append(f"rostros_web reconstruida ({despues} rostros conservados)")

    if "beneficiario_id" not in _columnas(con, "consentimientos"):
        antes = con.execute("SELECT COUNT(*) FROM consentimientos").fetchone()[0]
        con.executescript(NUEVA_CONSENT)
        con.execute("""
            INSERT INTO consentimientos_nueva
                (id, personal_id, tipo, aceptado, version, texto,
                 cuando, ip, agente, revocado_el)
            SELECT id, personal_id, tipo, aceptado, version, texto,
                   cuando, ip, agente, revocado_el
              FROM consentimientos""")
        con.execute("DROP TABLE consentimientos")
        con.execute("ALTER TABLE consentimientos_nueva RENAME TO consentimientos")
        despues = con.execute("SELECT COUNT(*) FROM consentimientos").fetchone()[0]
        if antes != despues:
            raise SystemExit(f"ABORTA: consentimientos tenía {antes} y quedaron {despues}")
        hechos.append(f"consentimientos reconstruida ({despues} conservados)")

    # Esta sí se puede añadir sin reconstruir: es una columna suelta.
    if "registrada_por" not in _columnas(con, "marcas"):
        con.execute("ALTER TABLE marcas ADD COLUMN registrada_por INTEGER "
                    "REFERENCES personal(id) ON DELETE SET NULL")
        hechos.append("marcas: columna registrada_por añadida")

    return hechos


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--ejecutar", action="store_true")
    a = ap.parse_args()

    print("=" * 68)
    print("  ROSTROS Y CONSENTIMIENTOS — abrir el canal del celular a los niños")
    print("=" * 68)
    print(f"  base: {config.DB_PATH}")

    con = sqlite3.connect(config.DB_PATH)
    con.row_factory = sqlite3.Row
    faltan = hace_falta(con)

    if not faltan:
        print("\n  Ya estaba migrada. No hay nada que hacer.")
        return

    print(f"\n  Hay que tocar: {', '.join(faltan)}")
    print(f"  rostros registrados hoy: "
          f"{con.execute('SELECT COUNT(*) FROM rostros_web').fetchone()[0]}")
    print(f"  consentimientos hoy    : "
          f"{con.execute('SELECT COUNT(*) FROM consentimientos').fetchone()[0]}")

    if not a.ejecutar:
        print("\n  SIMULACIÓN. No se ha tocado nada.")
        print("  De verdad:  py backend\\migrar_rostros_ninos.py --ejecutar")
        return

    # Respaldo ANTES de tocar. Reconstruir una tabla es borrar y crear: si
    # algo sale mal a mitad, sin copia no hay vuelta atrás.
    sello = datetime.now().strftime("%Y%m%d-%H%M%S")
    copia = f"{config.DB_PATH}.antes-rostros-ninos-{sello}"
    shutil.copy2(config.DB_PATH, copia)
    print(f"\n  respaldo: {os.path.basename(copia)}")

    con.execute("PRAGMA foreign_keys = OFF")   # durante el renombrado
    try:
        hechos = migrar(con)
        con.commit()
    except Exception:
        con.rollback()
        print("\n  FALLÓ. La base quedó como estaba; además tienes el respaldo.")
        raise
    con.execute("PRAGMA foreign_keys = ON")

    print()
    for h in hechos:
        print(f"    · {h}")

    # Y comprobar que las claves foráneas siguen sanas después de tocar
    # tres tablas. Si algo quedó apuntando a la nada, sale aquí.
    rotas = con.execute("PRAGMA foreign_key_check").fetchall()
    print(f"\n  claves foráneas rotas: {len(rotas)}")
    if rotas:
        for r in rotas[:5]:
            print("    ", dict(r))
        raise SystemExit("ABORTA: revisa el respaldo")
    print("\n  Migración correcta.")


if __name__ == "__main__":
    main()
