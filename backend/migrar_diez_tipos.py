# -*- coding: utf-8 -*-
"""
Los diez tipos del formato en papel, y quién firmó la aprobación.

DOS CAMBIOS EN LA MISMA TABLA

1. LOS DIEZ TIPOS. El sistema ofrecía seis y el papel de la ONG distingue
   diez; al imprimir había que marcar «(10) Otros» y escribir al lado cómo
   lo llamaba el sistema. Decisión del 27/08/2026: manda el papel. Ahora
   cada tipo del sistema es una casilla del formato, y no hay traducción.

   Lo que se pierde: «familiar» y «licencia» no existen en el papel y pasan
   a «otro». Es lo que el formato permite decir. En esta base hay UNA fila
   así (una licencia) y el guion la nombra antes de tocarla.

2. QUIÉN APROBÓ. `jefe_id` se copiaba de la ficha al crear la solicitud, y
   como nadie tiene jefe asignado estaba vacío en todas. Resultado: al
   aprobar y firmar, la firma de jefatura no aparecía en el documento —no
   había de quién sacarla—. Se añade `resuelta_por`, que guarda a la
   persona que resolvió. La firma del colaborador NO se toca: el documento
   lleva las dos, como el papel.

Un CHECK de SQLite no se puede alterar: hay que rehacer la tabla. Se copia
la base antes, se migra sobre la copia y solo al final se reemplaza.

    py backend\\migrar_diez_tipos.py              simula
    py backend\\migrar_diez_tipos.py --ejecutar   migra de verdad
"""
import os
import shutil
import sqlite3
import sys
from datetime import datetime

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config  # noqa: E402


# Los diez, en el orden del papel. La clave es corta y sin acentos porque
# viaja en la base y en la API; la etiqueta bonita vive en solicitudes.py.
TIPOS = ("personal", "comision", "medico", "capacitacion", "permanencia",
         "recuperacion", "vacaciones", "libres", "transferencia", "otro")

# Lo que ya existe, traducido. Los dos que el papel no contempla van a
# «otro», que es exactamente lo que el formato dice de ellos.
TRADUCCION = {
    "vacaciones": "vacaciones",
    "personal": "personal",
    "medico": "medico",
    "familiar": "otro",
    "licencia": "otro",
    "otro": "otro",
}

ESTADOS = ("pendiente", "pendiente_admin", "aprobada", "rechazada", "cancelada")

TABLA_NUEVA = f"""
CREATE TABLE solicitudes_nueva (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    personal_id    INTEGER NOT NULL REFERENCES personal(id) ON DELETE CASCADE,
    tipo           TEXT NOT NULL DEFAULT 'otro',
    desde          TEXT NOT NULL,
    hasta          TEXT NOT NULL,
    motivo         TEXT DEFAULT '',
    estado         TEXT NOT NULL DEFAULT 'pendiente',
    requiere_admin INTEGER NOT NULL DEFAULT 0,
    jefe_id        INTEGER REFERENCES personal(id) ON DELETE SET NULL,
    -- Quién resolvió. De aquí sale la firma de jefatura del documento: sin
    -- esto, aprobar no dejaba constancia de quién aprobaba.
    resuelta_por   INTEGER REFERENCES personal(id) ON DELETE SET NULL,
    aprob_jefe_el  TEXT DEFAULT '',
    aprob_admin_el TEXT DEFAULT '',
    resuelto_el    TEXT DEFAULT '',
    nota           TEXT DEFAULT '',
    creado         TEXT DEFAULT (datetime('now','localtime')),
    hora_desde     TEXT DEFAULT '',
    hora_hasta     TEXT DEFAULT '',
    archivo        TEXT DEFAULT NULL,
    archivo_nombre TEXT DEFAULT NULL,
    archivo_mime   TEXT DEFAULT NULL,
    archivo_tam    INTEGER DEFAULT NULL,
    periodo        TEXT DEFAULT '',
    CHECK (tipo IN ({", ".join(repr(t) for t in TIPOS)})),
    CHECK (estado IN ({", ".join(repr(e) for e in ESTADOS)})),
    CHECK (hasta >= desde)
)
"""

COLUMNAS = ("id", "personal_id", "tipo", "desde", "hasta", "motivo", "estado",
            "requiere_admin", "jefe_id", "aprob_jefe_el", "aprob_admin_el",
            "resuelto_el", "nota", "creado", "hora_desde", "hora_hasta",
            "archivo", "archivo_nombre", "archivo_mime", "archivo_tam",
            "periodo")


def migrar(ruta, ejecutar):
    con = sqlite3.connect(ruta)
    con.row_factory = sqlite3.Row
    filas = [dict(f) for f in con.execute("SELECT * FROM solicitudes")]
    print(f"  solicitudes en la base: {len(filas)}")

    cuenta = {}
    for f in filas:
        viejo = f["tipo"]
        nuevo = TRADUCCION.get(viejo, "otro")
        cuenta[(viejo, nuevo)] = cuenta.get((viejo, nuevo), 0) + 1
    for (viejo, nuevo), n in sorted(cuenta.items()):
        flecha = "=" if viejo == nuevo else "→"
        aviso = "" if viejo == nuevo else "   (el papel no tiene esa casilla)"
        print(f"    {viejo:12} {flecha} {nuevo:12} {n}{aviso}")

    ya = [c[1] for c in con.execute("PRAGMA table_info(solicitudes)")]
    print(f"  columna 'resuelta_por': {'ya está' if 'resuelta_por' in ya else 'se añade'}")

    if not ejecutar:
        print("\n  SIMULACIÓN: no se ha escrito nada.")
        con.close()
        return

    con.execute("PRAGMA foreign_keys = OFF")
    con.execute("DROP TABLE IF EXISTS solicitudes_nueva")
    con.executescript(TABLA_NUEVA)
    for f in filas:
        f = dict(f)
        f["tipo"] = TRADUCCION.get(f["tipo"], "otro")
        con.execute(
            f"INSERT INTO solicitudes_nueva ({', '.join(COLUMNAS)}) "
            f"VALUES ({', '.join('?' * len(COLUMNAS))})",
            tuple(f.get(c) for c in COLUMNAS))
    con.execute("DROP TABLE solicitudes")
    con.execute("ALTER TABLE solicitudes_nueva RENAME TO solicitudes")
    con.commit()
    quedan = con.execute("SELECT COUNT(*) FROM solicitudes").fetchone()[0]
    print(f"  migradas: {quedan} de {len(filas)}")
    assert quedan == len(filas), "se perdieron filas por el camino"
    con.close()


def main():
    ejecutar = "--ejecutar" in sys.argv
    ruta = config.DB_PATH
    print(f"Base: {ruta}")

    if not ejecutar:
        # El ensayo va sobre una copia: así se ve el resultado sin arriesgar.
        copia = ruta + ".ensayo"
        shutil.copy2(ruta, copia)
        print("Ensayo sobre una copia\n")
        migrar(copia, True)
        print("\n  (la copia del ensayo se borra)")
        os.remove(copia)
        print("\nPara hacerlo de verdad:  py backend\\migrar_diez_tipos.py --ejecutar")
        return

    sello = datetime.now().strftime("%Y%m%d-%H%M%S")
    respaldo = f"{ruta}.antes-de-diez-tipos-{sello}.bak"
    shutil.copy2(ruta, respaldo)
    print(f"Respaldo: {respaldo}\n")
    migrar(ruta, True)
    print("\nHecho.")


if __name__ == "__main__":
    main()
