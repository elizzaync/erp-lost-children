# -*- coding: utf-8 -*-
"""
Reconstruye 'solicitudes' para admitir los tipos de permiso acordados.

POR QUÉ NO BASTA UN UPDATE
──────────────────────────
La tabla tiene tres reglas CHECK, y una limita los tipos:

    CHECK (tipo IN ('vacaciones','permiso','licencia'))

Los tipos que se pidieron —personales, familiares, médicos, licencias y
otros— no caben ahí: cualquier INSERT con 'medico' se rechaza. SQLite no
permite alterar un CHECK, así que hay que reconstruir la tabla, igual que
hubo que hacer con 'identidades'.

QUÉ PASA CON 'vacaciones'
─────────────────────────
No está en la lista de cinco, pero NO se elimina, y esto merece explicarse
porque es una decisión y no un descuido:

  · config.py guarda una política de vacaciones acordada con la
    organización — 30 días por año, tope de 60, visto bueno de
    Administración pasados 7 días corridos. Quitar el tipo dejaría esas
    reglas apuntando a algo que ya no existe.
  · las vacaciones no son un permiso: se generan por antigüedad y se
    consumen de un saldo. Los otros cinco no tienen saldo.

Así que la tabla admite SEIS tipos: vacaciones + los cinco pedidos. Si se
prefiere lo contrario, se cambia la tupla TIPOS de abajo y se vuelve a
correr; mientras no se ejecute, no se escribe nada.

CÓMO SE HACE
────────────
  1. copia de seguridad fechada de la base entera
  2. tabla nueva con los CHECK corregidos
  3. se copian las filas actuales, traduciendo los tipos viejos
  4. se cambia la vieja por la nueva y se rehacen sus índices
  5. se comprueba: mismas filas, los seis tipos entran, los inventados no

    py backend\\migrar_tipos_permiso.py              simula
    py backend\\migrar_tipos_permiso.py --ejecutar   migra de verdad
"""
import os
import shutil
import sqlite3
import sys
from datetime import datetime

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config  # noqa: E402


# Los seis que admitirá la tabla. 'permiso' a secas desaparece: era el cajón
# de sastre que los cinco nuevos vienen a desglosar.
TIPOS = ("vacaciones", "personal", "familiar", "medico", "licencia", "otro")

# Las filas que ya existan se traducen. 'permiso' genérico no se puede
# repartir entre los cinco sin inventarse a cuál pertenecía cada una, así
# que va a 'otro', que es exactamente lo que significa: un permiso del que
# no consta el motivo.
TRADUCCION = {
    "vacaciones": "vacaciones",
    "licencia": "licencia",
    "permiso": "otro",
}

ESTADOS = ("pendiente", "pendiente_admin", "aprobada", "rechazada", "cancelada")

TABLA_NUEVA = """
CREATE TABLE solicitudes_nueva (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    personal_id    INTEGER NOT NULL REFERENCES personal(id) ON DELETE CASCADE,
    -- vacaciones: se generan por antigüedad y salen de un saldo.
    -- personal | familiar | medico | licencia | otro: no tienen saldo.
    tipo           TEXT NOT NULL DEFAULT 'otro',
    desde          TEXT NOT NULL,          -- 'YYYY-MM-DD'
    hasta          TEXT NOT NULL,
    motivo         TEXT DEFAULT '',
    estado         TEXT NOT NULL DEFAULT 'pendiente',
        -- pendiente | pendiente_admin | aprobada | rechazada | cancelada
    requiere_admin INTEGER NOT NULL DEFAULT 0,
    jefe_id        INTEGER REFERENCES personal(id) ON DELETE SET NULL,
    aprob_jefe_el  TEXT DEFAULT '',
    aprob_admin_el TEXT DEFAULT '',
    resuelto_el    TEXT DEFAULT '',
    nota           TEXT DEFAULT '',        -- motivo del rechazo o comentario
    creado         TEXT DEFAULT (datetime('now','localtime')),
    CHECK (tipo IN ('vacaciones','personal','familiar','medico','licencia','otro')),
    CHECK (estado IN ('pendiente','pendiente_admin','aprobada','rechazada','cancelada')),
    CHECK (hasta >= desde)
);
"""

INDICES = (
    "CREATE INDEX IF NOT EXISTS idx_solicitudes_persona "
    "ON solicitudes(personal_id, desde)",
    "CREATE INDEX IF NOT EXISTS idx_solicitudes_estado "
    "ON solicitudes(estado, desde)",
)

COLUMNAS = ("id", "personal_id", "desde", "hasta", "motivo", "estado",
            "requiere_admin", "jefe_id", "aprob_jefe_el", "aprob_admin_el",
            "resuelto_el", "nota", "creado")


def _linea(t=""):
    print(t)


def analizar(bd):
    con = sqlite3.connect(bd)
    con.row_factory = sqlite3.Row
    filas = [dict(r) for r in con.execute("SELECT * FROM solicitudes")]
    sql = con.execute(
        "SELECT sql FROM sqlite_master WHERE name='solicitudes'").fetchone()
    con.close()
    texto = (sql[0] if sql else "") or ""
    por_tipo = {}
    for f in filas:
        por_tipo[f["tipo"]] = por_tipo.get(f["tipo"], 0) + 1
    return {"filas": filas, "por_tipo": por_tipo,
            "ya_migrada": "'medico'" in texto}


def imprimir_plan(bd, info):
    _linea("=" * 72)
    _linea("  RECONSTRUCCIÓN DE 'solicitudes'  ·  tipos de permiso")
    _linea("=" * 72)
    _linea(f"  base           {bd}")
    _linea(f"  solicitudes    {len(info['filas'])} fila(s)")
    _linea()

    if info["ya_migrada"]:
        _linea("  La tabla YA admite los tipos nuevos. No hay nada que hacer.")
        _linea("=" * 72)
        return False

    _linea("  Tipos que admite HOY:      vacaciones, permiso, licencia")
    _linea("  Tipos que admitirá:        " + ", ".join(TIPOS))
    _linea()
    _linea("  'permiso' a secas desaparece: era el cajón de sastre que los")
    _linea("  cinco nuevos vienen a desglosar.")
    _linea()
    _linea("  'vacaciones' SE CONSERVA aunque no estaba en la lista de cinco:")
    _linea("  config.py guarda una política acordada (30 días al año, tope de")
    _linea("  60, visto bueno de Administración pasados 7 días) que quedaría")
    _linea("  apuntando a un tipo inexistente. Si se prefiere quitarlo, se")
    _linea("  cambia la tupla TIPOS del script y se vuelve a correr.")
    _linea()

    if info["filas"]:
        _linea("  Filas que se traducen:")
        for viejo, n in sorted(info["por_tipo"].items()):
            nuevo = TRADUCCION.get(viejo, "otro")
            marca = "" if viejo == nuevo else "  ->  " + nuevo
            _linea(f"    · {n:3} de tipo '{viejo}'{marca}")
        _linea()
        _linea("  Los 'permiso' genéricos pasan a 'otro': repartirlos entre los")
        _linea("  cinco exigiría inventarse a cuál pertenecía cada uno.")
    else:
        _linea("  La tabla está VACÍA: no hay ninguna fila que traducir.")
    _linea()
    _linea("  Lo que NO cambia:")
    _linea("    · los estados y sus transiciones")
    _linea("    · el doble visto bueno (jefe / administración)")
    _linea("    · las tres reglas CHECK restantes, incluida hasta >= desde")
    _linea("    · 'personal' — ninguna ficha se toca")
    _linea("=" * 72)
    return True


def _respaldo(bd):
    sello = datetime.now().strftime("%Y%m%d-%H%M%S")
    destino = f"{bd}.antes-de-tipos-permiso-{sello}.bak"
    shutil.copy2(bd, destino)
    return destino


def ejecutar(bd, info):
    respaldo = _respaldo(bd)
    con = sqlite3.connect(bd, isolation_level=None)
    try:
        con.execute("PRAGMA foreign_keys = OFF")
        con.execute("BEGIN")
        con.execute(TABLA_NUEVA)

        cols = ", ".join(COLUMNAS)
        # El tipo se traduce fila a fila en vez de con un CASE en SQL: la
        # tabla de traducción vive arriba, a la vista, y así se aplica la
        # misma en la simulación y en la ejecución.
        casos = " ".join(
            f"WHEN '{viejo}' THEN '{nuevo}'" for viejo, nuevo in TRADUCCION.items())
        con.execute(
            f"INSERT INTO solicitudes_nueva ({cols}, tipo) "
            f"SELECT {cols}, CASE tipo {casos} ELSE 'otro' END FROM solicitudes")

        copiadas = con.execute(
            "SELECT COUNT(*) FROM solicitudes_nueva").fetchone()[0]
        if copiadas != len(info["filas"]):
            raise RuntimeError(
                f"se copiaron {copiadas} de {len(info['filas'])} filas")

        con.execute("DROP TABLE solicitudes")
        con.execute("ALTER TABLE solicitudes_nueva RENAME TO solicitudes")
        # El RENAME no se lleva los índices de la tabla vieja: se rehacen.
        for sql in INDICES:
            con.execute(sql)
        con.execute("COMMIT")

        con.execute("PRAGMA foreign_keys = ON")
        rotas = list(con.execute("PRAGMA foreign_key_check"))
        if rotas:
            raise RuntimeError(f"claves foráneas rotas: {rotas[:3]}")
        return copiadas, respaldo
    except Exception:
        try:
            con.execute("ROLLBACK")
        except Exception:
            pass
        raise
    finally:
        try:
            con.close()
        except Exception:
            pass


def verificar(bd, esperadas):
    """Los seis tipos entran; lo que no está en la lista, no."""
    con = sqlite3.connect(bd, isolation_level=None)
    con.execute("PRAGMA foreign_keys = ON")
    fallos = []

    n = con.execute("SELECT COUNT(*) FROM solicitudes").fetchone()[0]
    if n != esperadas:
        fallos.append(f"quedan {n} filas, se esperaban {esperadas}")

    idx = {r[0] for r in con.execute(
        "SELECT name FROM sqlite_master WHERE type='index' "
        "AND tbl_name='solicitudes'")}
    for esperado in ("idx_solicitudes_persona", "idx_solicitudes_estado"):
        if esperado not in idx:
            fallos.append(f"falta el índice {esperado}")

    con.execute("BEGIN")
    try:
        fila = con.execute("SELECT id FROM personal LIMIT 1").fetchone()
        if not fila:
            fallos.append("no hay ninguna ficha de personal con la que probar")
        else:
            pid = fila[0]

            def cabe(tipo, debe):
                try:
                    con.execute(
                        "INSERT INTO solicitudes (personal_id, tipo, desde, hasta) "
                        "VALUES (?,?,?,?)", (pid, tipo, "2026-09-01", "2026-09-02"))
                    paso = True
                except sqlite3.IntegrityError:
                    paso = False
                if paso != debe:
                    fallos.append(
                        f"{'debía' if debe else 'NO debía'} aceptar el tipo {tipo!r}")

            for t in TIPOS:
                cabe(t, True)
            cabe("permiso", False)      # el viejo cajón de sastre ya no vale
            cabe("cualquiera", False)

            # La regla de fechas tiene que seguir viva.
            try:
                con.execute(
                    "INSERT INTO solicitudes (personal_id, tipo, desde, hasta) "
                    "VALUES (?,?,?,?)", (pid, "otro", "2026-09-10", "2026-09-01"))
                fallos.append("aceptó una solicitud que termina antes de empezar")
            except sqlite3.IntegrityError:
                pass
    finally:
        con.execute("ROLLBACK")
        con.close()
    return fallos


def main():
    bd = config.DB_PATH
    if not os.path.exists(bd):
        print(f"No existe la base: {bd}")
        return 1

    info = analizar(bd)
    if not imprimir_plan(bd, info):
        return 0

    if "--ejecutar" not in sys.argv:
        _linea()
        _linea("  SIMULACIÓN. No se ha escrito nada.")
        _linea("  Para migrar de verdad:  py backend\\migrar_tipos_permiso.py --ejecutar")
        return 0

    _linea()
    _linea("  Ejecutando…")
    copiadas, respaldo = ejecutar(bd, info)
    _linea(f"  copia de seguridad  {respaldo}")
    _linea(f"  filas conservadas   {copiadas}")

    fallos = verificar(bd, copiadas)
    _linea()
    if fallos:
        _linea("  LA VERIFICACIÓN FALLÓ:")
        for f in fallos:
            _linea("    · " + f)
        _linea(f"  Para volver atrás:  copia {respaldo} sobre {bd}")
        return 1

    _linea("  Verificado: se conservan las filas y sus índices, los seis tipos")
    _linea("  entran, y los que no están en la lista se rechazan.")
    _linea("=" * 72)
    return 0


if __name__ == "__main__":
    sys.exit(main())
