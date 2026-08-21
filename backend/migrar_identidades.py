# -*- coding: utf-8 -*-
"""
Reconstruye la tabla 'identidades' para que los responsables también puedan
enrolarse en el terminal.

POR QUÉ NO BASTA UN ALTER TABLE
────────────────────────────────
La tabla tiene esta regla:

    CHECK ((personal_id IS NOT NULL) + (beneficiario_id IS NOT NULL) = 1)

Añadir la columna 'responsable_id' con ADD COLUMN funciona, pero no sirve de
nada: una fila que solo tenga responsable_id da suma 0 y el CHECK la rechaza.
Y es peor que inútil, porque abre un agujero — con la columna añadida se
puede insertar una fila con personal_id Y responsable_id a la vez, y el CHECK
la deja pasar: una identidad con dos dueños.

SQLite no permite alterar un CHECK. La única salida es reconstruir la tabla.

CÓMO SE HACE
────────────
  1. copia de seguridad fechada de la base entera
  2. tabla nueva con la regla corregida para las tres entidades
  3. se copian las filas actuales, una por una y verificando el total
  4. se cambia la vieja por la nueva
  5. se comprueba: mismo número de filas, sin claves foráneas rotas, y las
     tres formas de enrolar funcionan mientras las mixtas se rechazan

Sin --ejecutar no escribe nada: enseña el plan y para.

    py backend\\migrar_identidades.py              simula
    py backend\\migrar_identidades.py --ejecutar   migra de verdad
"""
import os
import shutil
import sqlite3
import sys
from datetime import datetime

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config  # noqa: E402


TABLA_NUEVA = """
CREATE TABLE identidades_nueva (
    staff_number    INTEGER PRIMARY KEY,   -- el ID en yunatt/terminal, >= 9000
    personal_id     INTEGER REFERENCES personal(id)      ON DELETE CASCADE,
    beneficiario_id INTEGER REFERENCES beneficiarios(id) ON DELETE CASCADE,
    -- Los tutores son una entidad propia, no una fila de 'personal': no
    -- trabajan aquí. Por eso necesitan su propia columna en vez de colarse
    -- por la de personal.
    responsable_id  INTEGER REFERENCES responsables(id)  ON DELETE CASCADE,
    metodo          TEXT DEFAULT 'facial',   -- facial | huella | ambos
    estado          TEXT DEFAULT 'pendiente',-- pendiente | esperando | enrolado | error
    tiene_rostro    INTEGER DEFAULT 0,
    tiene_huella    INTEGER DEFAULT 0,
    detalle         TEXT DEFAULT '',
    creado          TEXT DEFAULT (datetime('now','localtime')),
    -- Exactamente un dueño. La suma vale 1 si y solo si hay uno relleno:
    -- con cero la identidad no apunta a nadie, con dos apuntaría a dos
    -- personas y no habría forma de saber quién marcó.
    CHECK ((personal_id     IS NOT NULL)
         + (beneficiario_id IS NOT NULL)
         + (responsable_id  IS NOT NULL) = 1),
    UNIQUE (personal_id),
    UNIQUE (beneficiario_id),
    UNIQUE (responsable_id)
);
"""

# La vista también hay que rehacerla: su columna 'tipo' daba por hecho que
# solo había dos entidades ("si no es personal, es beneficiario"), así que un
# tutor saldría etiquetado como beneficiario. Y hay que tirarla ANTES de
# tocar la tabla: SQLite se niega a renombrar una tabla de la que cuelga una
# vista rota.
VISTA_NUEVA = """
CREATE VIEW v_identidades AS
SELECT i.staff_number, i.metodo, i.estado, i.tiene_rostro, i.tiene_huella,
       i.detalle, i.creado,
       i.personal_id, i.beneficiario_id, i.responsable_id,
       CASE WHEN i.personal_id     IS NOT NULL THEN 'personal'
            WHEN i.beneficiario_id IS NOT NULL THEN 'beneficiario'
            ELSE 'responsable' END          AS tipo,
       COALESCE(p.nombre,    b.nombre,    r.nombre)    AS nombre,
       COALESCE(p.documento, b.documento, r.documento) AS documento,
       CASE WHEN i.beneficiario_id IS NOT NULL THEN 'ninos'
            -- Los tutores no pertenecen a ningún ámbito de la organización:
            -- no trabajan aquí. Aparecen solo en la vista General.
            WHEN i.responsable_id  IS NOT NULL THEN NULL
            WHEN p.vinculo = 'voluntario'      THEN NULL
            ELSE p.ambito END                 AS ambito,
       p.vinculo, p.cargo, p.area, p.sede,
       b.casa, b.sala, b.grado
  FROM identidades i
  LEFT JOIN personal      p ON p.id = i.personal_id
  LEFT JOIN beneficiarios b ON b.id = i.beneficiario_id
  LEFT JOIN responsables  r ON r.id = i.responsable_id
"""

COLUMNAS_VIEJAS = ("staff_number", "personal_id", "beneficiario_id", "metodo",
                   "estado", "tiene_rostro", "tiene_huella", "detalle", "creado")


def _linea(t=""):
    print(t)


def analizar(bd):
    """Qué hay hoy, sin tocar nada."""
    con = sqlite3.connect(bd)
    con.row_factory = sqlite3.Row
    filas = [dict(r) for r in con.execute("SELECT * FROM identidades")]
    cols = {r[1] for r in con.execute("PRAGMA table_info(identidades)")}
    marcas = con.execute("SELECT COUNT(*) FROM marcas").fetchone()[0]
    resp = con.execute("SELECT COUNT(*) FROM responsables").fetchone()[0]
    con.close()
    return {"filas": filas, "columnas": cols, "marcas": marcas,
            "responsables": resp,
            "ya_migrada": "responsable_id" in cols}


def imprimir_plan(bd, info):
    _linea("=" * 72)
    _linea("  RECONSTRUCCIÓN DE 'identidades'  ·  añade responsable_id")
    _linea("=" * 72)
    _linea(f"  base            {bd}")
    _linea(f"  identidades     {len(info['filas'])} fila(s) que se conservan")
    _linea(f"  marcas          {info['marcas']} (apuntan a staff_number)")
    _linea(f"  responsables    {info['responsables']} ficha(s), hoy no enrolables")
    _linea()

    if info["ya_migrada"]:
        _linea("  La tabla YA tiene responsable_id. No hay nada que hacer.")
        _linea("=" * 72)
        return False

    if info["filas"]:
        _linea("  Filas que se copian tal cual (mismo staff_number):")
        for f in info["filas"]:
            due = ("personal " + str(f["personal_id"])) if f["personal_id"] \
                  else ("beneficiario " + str(f["beneficiario_id"]))
            _linea(f"    · {f['staff_number']}  {due}  "
                   f"{f['metodo']}/{f['estado']}")
    else:
        _linea("  No hay ninguna identidad enrolada: la copia va vacía.")
    _linea()
    _linea("  Lo que cambia:")
    _linea("    · nueva columna responsable_id -> responsables(id) ON DELETE CASCADE")
    _linea("    · el CHECK pasa a contar las TRES entidades, sigue exigiendo")
    _linea("      exactamente un dueño (ni cero, ni dos)")
    _linea("    · UNIQUE(responsable_id): un tutor no puede tener dos identidades")
    _linea("    · la vista v_identidades pasa a distinguir las tres entidades;")
    _linea("      antes etiquetaba a un tutor como 'beneficiario'")
    _linea()
    _linea("  Lo que NO se toca:")
    _linea("    · los staff_number actuales — se conservan uno por uno")
    _linea("    · 'marcas' — ninguna fila se modifica")
    _linea("    · 'personal', 'beneficiarios', 'responsables'")
    _linea("=" * 72)
    return True


def _respaldo(bd):
    sello = datetime.now().strftime("%Y%m%d-%H%M%S")
    destino = f"{bd}.antes-de-identidades-{sello}.bak"
    shutil.copy2(bd, destino)
    return destino


def ejecutar(bd, info):
    """Reconstruye. Devuelve (copiadas, respaldo)."""
    respaldo = _respaldo(bd)
    # isolation_level=None: el control de la transacción es explícito aquí.
    # Con el modo por defecto, sqlite3 abre y cierra transacciones por su
    # cuenta y el BEGIN/COMMIT de abajo no significaría lo que parece.
    con = sqlite3.connect(bd, isolation_level=None)
    try:
        # Se apagan mientras se cambia la tabla por debajo: 'marcas' apunta a
        # staff_number y el DROP intermedio la dejaría colgando un instante.
        con.execute("PRAGMA foreign_keys = OFF")
        con.execute("BEGIN")
        con.execute("DROP VIEW IF EXISTS v_identidades")
        con.execute(TABLA_NUEVA)

        cols = ", ".join(COLUMNAS_VIEJAS)
        con.execute(f"INSERT INTO identidades_nueva ({cols}) "
                    f"SELECT {cols} FROM identidades")
        copiadas = con.execute(
            "SELECT COUNT(*) FROM identidades_nueva").fetchone()[0]
        if copiadas != len(info["filas"]):
            raise RuntimeError(
                f"se copiaron {copiadas} de {len(info['filas'])} filas")

        con.execute("DROP TABLE identidades")
        con.execute("ALTER TABLE identidades_nueva RENAME TO identidades")
        con.execute(VISTA_NUEVA)
        con.execute("COMMIT")

        con.execute("PRAGMA foreign_keys = ON")
        rotas = list(con.execute("PRAGMA foreign_key_check"))
        if rotas:
            raise RuntimeError(f"claves foráneas rotas: {rotas[:3]}")
        return copiadas, respaldo
    except Exception:
        con.execute("ROLLBACK")
        con.close()
        # La copia se deja: si algo quedó a medias, es con lo que se vuelve.
        raise
    finally:
        try:
            con.close()
        except Exception:
            pass


def verificar(bd, esperadas):
    """Las tres formas de enrolar valen; las mixtas y la vacía, no."""
    con = sqlite3.connect(bd)
    con.execute("PRAGMA foreign_keys = ON")
    fallos = []

    n = con.execute("SELECT COUNT(*) FROM identidades").fetchone()[0]
    if n != esperadas:
        fallos.append(f"quedan {n} filas, se esperaban {esperadas}")

    cols = {r[1] for r in con.execute("PRAGMA table_info(identidades)")}
    if "responsable_id" not in cols:
        fallos.append("no existe la columna responsable_id")

    # Se prueba de verdad, sobre una transacción que luego se deshace.
    con.execute("BEGIN")
    try:
        # Alguien SIN identidad: la tabla tiene UNIQUE por titular, así que
        # con una persona ya enrolada la inserción se rechazaría y esta
        # comprobación se leería como un fallo del esquema.
        pid = con.execute(
            "SELECT id FROM personal WHERE id NOT IN "
            "(SELECT personal_id FROM identidades WHERE personal_id IS NOT NULL) "
            "LIMIT 1").fetchone()
        bid = con.execute(
            "SELECT id FROM beneficiarios WHERE id NOT IN "
            "(SELECT beneficiario_id FROM identidades WHERE beneficiario_id IS NOT NULL) "
            "LIMIT 1").fetchone()
        rid = con.execute("INSERT INTO responsables (nombre) "
                          "VALUES ('Zzz Verificacion')").lastrowid

        def cabe(sql, params, debe):
            try:
                con.execute(sql, params)
                paso = True
            except sqlite3.IntegrityError:
                paso = False
            if paso != debe:
                fallos.append(f"{'debía' if debe else 'NO debía'} aceptar: {sql.strip()[:60]}")

        cabe("INSERT INTO identidades (staff_number, responsable_id) VALUES (?,?)",
             (9990, rid), True)
        if pid:
            cabe("INSERT INTO identidades (staff_number, personal_id) VALUES (?,?)",
                 (9991, pid[0]), True)
        if bid:
            cabe("INSERT INTO identidades (staff_number, beneficiario_id) VALUES (?,?)",
                 (9992, bid[0]), True)
        # Dos dueños a la vez: es el agujero que abría el ADD COLUMN.
        if pid:
            cabe("INSERT INTO identidades (staff_number, personal_id, responsable_id) "
                 "VALUES (?,?,?)", (9993, pid[0], rid), False)
        # Sin dueño.
        cabe("INSERT INTO identidades (staff_number) VALUES (?)", (9994,), False)
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
    hay_trabajo = imprimir_plan(bd, info)
    if not hay_trabajo:
        return 0

    if "--ejecutar" not in sys.argv:
        _linea()
        _linea("  SIMULACIÓN. No se ha escrito nada.")
        _linea("  Para migrar de verdad:  py backend\\migrar_identidades.py --ejecutar")
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

    _linea("  Verificado: se conservan las filas, las tres entidades pueden")
    _linea("  enrolarse, y las identidades con dos dueños o sin dueño se")
    _linea("  rechazan.")
    _linea("=" * 72)
    return 0


if __name__ == "__main__":
    sys.exit(main())
