# -*- coding: utf-8 -*-
"""
Borrado total de los datos, conservando la configuración del sistema.

QUÉ SE VA
─────────
Todo lo que es un dato de la organización: fichas de personal,
beneficiarios, responsables, identidades biométricas, marcas del terminal,
solicitudes, documentos, condiciones, boletas, y las series de expediente.

Y con ellas, POR CASCADA, las cuentas de usuario: 'usuarios.personal_id' es
ON DELETE CASCADE y NOT NULL, así que no hay forma de borrar una ficha y
dejar viva su cuenta. Quien ejecute esto se queda fuera del sistema hasta
crear la primera cuenta de nuevo.

QUÉ SE QUEDA
────────────
  roles          los cargos y su definición
  permisos_rol   qué puede cada cargo
  parametros     la configuración del sistema

Y TODAS las tablas: aquí no se elimina ninguna, solo se vacían filas.

CÓMO VOLVER A ENTRAR
────────────────────
Este script crea la ficha de personal que se le indique, para que haya a
quién vincular la primera cuenta. La cuenta NO la crea: eso se hace con

    py backend\\crear_director.py

que pide la contraseña por teclado. Así no viaja por ningún otro sitio.

    py backend\\borrado_total.py              simula y no toca nada
    py backend\\borrado_total.py --ejecutar   borra de verdad
"""
import os
import shutil
import sqlite3
import sys
from datetime import datetime

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config  # noqa: E402


# Se vacían. El orden no importa —las cascadas hacen el trabajo—, pero se
# listan explícitamente para que quede a la vista qué se lleva por delante.
TABLAS_DATOS = (
    "marcas", "identidades", "rostros_web", "consentimientos",
    "formacion", "experiencia",
    "programas_beneficiario", "historial_educativo", "seguimiento",
    "sesiones_acompanamiento", "incidencias",
    "responsable_beneficiario", "responsables",
    "solicitudes", "boletas", "condiciones_laborales", "documentos",
    "beneficiarios", "personal",
    "personas_migrada",
)

# Rastro de sesiones y accesos: se va con las cuentas, y conservarlo sería
# guardar quién entró a un sistema cuyos datos ya no existen.
TABLAS_RASTRO = ("sesiones_usuario", "intentos_login", "accesos")

# NO se tocan. Es la configuración que costó armar.
TABLAS_CONFIG = ("roles", "permisos_rol", "parametros")


def _linea(t=""):
    print(t)


def inventario(con):
    filas = {}
    for (t,) in con.execute(
            "SELECT name FROM sqlite_master WHERE type='table' "
            "AND name NOT LIKE 'sqlite_%' ORDER BY name"):
        filas[t] = con.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
    return filas


def imprimir_plan(bd, antes, ficha):
    _linea("=" * 72)
    _linea("  BORRADO TOTAL DE DATOS")
    _linea("=" * 72)
    _linea(f"  base   {bd}")
    _linea()
    _linea("  SE VACÍA:")
    for t in TABLAS_DATOS:
        if antes.get(t):
            _linea(f"    · {t:28} {antes[t]}")
    vacias = [t for t in TABLAS_DATOS if not antes.get(t)]
    if vacias:
        _linea(f"    · y {len(vacias)} tablas más, ya vacías")
    _linea()
    _linea("  SE VA POR CASCADA (usuarios.personal_id es ON DELETE CASCADE):")
    _linea(f"    · usuarios                     {antes.get('usuarios', 0)}")
    for t in TABLAS_RASTRO:
        _linea(f"    · {t:28} {antes.get(t, 0)}")
    _linea()
    _linea("  SE CONSERVA:")
    for t in TABLAS_CONFIG:
        _linea(f"    · {t:28} {antes.get(t, 0)}")
    _linea()
    _linea("  NINGUNA TABLA SE ELIMINA. Solo se borran filas.")
    _linea()
    _linea("  DESPUÉS se crea esta ficha, para poder recuperar el acceso:")
    for k, v in ficha.items():
        if v:
            _linea(f"    · {k:16} {v}")
    _linea()
    _linea("  La CUENTA no la crea este script. Después:")
    _linea("      py backend\\crear_director.py")
    _linea("  que pide la contraseña por teclado y la vincula a esa ficha.")
    _linea("=" * 72)


def _respaldo(bd):
    sello = datetime.now().strftime("%Y%m%d-%H%M%S")
    destino = f"{bd}.antes-del-borrado-total-{sello}.bak"
    shutil.copy2(bd, destino)
    return destino


def ejecutar(bd, ficha):
    """Borra y crea la ficha. Devuelve (borradas, id_ficha, respaldo)."""
    respaldo = _respaldo(bd)
    con = sqlite3.connect(bd, isolation_level=None)
    try:
        con.execute("PRAGMA foreign_keys = ON")
        con.execute("BEGIN")
        borradas = 0
        for t in TABLAS_DATOS + TABLAS_RASTRO:
            try:
                borradas += con.execute(f"DELETE FROM {t}").rowcount
            except sqlite3.OperationalError:
                pass          # una tabla que no existe en esta base
        # Por si alguna cuenta sobrevivió a la cascada (no debería).
        borradas += con.execute("DELETE FROM usuarios").rowcount

        campos = [k for k, v in ficha.items() if v]
        pid = con.execute(
            f"INSERT INTO personal ({', '.join(campos)}, estado, creado) "
            f"VALUES ({', '.join('?' for _ in campos)}, 'activo', "
            f"datetime('now','localtime'))",
            tuple(ficha[k] for k in campos),
        ).lastrowid
        con.execute("COMMIT")
        return borradas, pid, respaldo
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


def verificar(bd, pid, antes):
    con = sqlite3.connect(bd)
    con.row_factory = sqlite3.Row
    fallos = []

    despues = inventario(con)

    # 1. Ninguna tabla desapareció.
    faltan = set(antes) - set(despues)
    if faltan:
        fallos.append(f"desaparecieron tablas: {sorted(faltan)}")

    # 2. Las de datos, vacías — salvo 'personal', que tiene la ficha nueva.
    for t in TABLAS_DATOS:
        esperado = 1 if t == "personal" else 0
        if despues.get(t, 0) != esperado:
            fallos.append(f"{t} quedó con {despues.get(t)} filas, se esperaban {esperado}")
    for t in TABLAS_RASTRO + ("usuarios",):
        if despues.get(t, 0) != 0:
            fallos.append(f"{t} quedó con {despues.get(t)} filas")

    # 3. La configuración intacta.
    for t in TABLAS_CONFIG:
        if despues.get(t, 0) != antes.get(t, 0):
            fallos.append(f"{t} cambió: {antes.get(t)} -> {despues.get(t)}")

    # 4. El rol Director sigue ahí y con sus permisos: sin él no se puede
    #    recuperar el acceso.
    d = con.execute("SELECT id, nombre FROM roles WHERE clave = 'director'").fetchone()
    if not d:
        fallos.append("no existe el rol Director: crear_director.py no podría correr")
    else:
        n = con.execute("SELECT COUNT(*) FROM permisos_rol WHERE rol_id = ?",
                        (d["id"],)).fetchone()[0]
        if n == 0:
            fallos.append("el rol Director se quedó sin permisos")

    # 5. La ficha nueva está y es la única.
    f = con.execute("SELECT * FROM personal WHERE id = ?", (pid,)).fetchone()
    if not f:
        fallos.append("no se creó la ficha")
    elif con.execute("SELECT COUNT(*) FROM personal").fetchone()[0] != 1:
        fallos.append("hay más de una ficha de personal")

    # 6. Nada roto.
    rotas = list(con.execute("PRAGMA foreign_key_check"))
    if rotas:
        fallos.append(f"claves foráneas rotas: {rotas[:3]}")

    # 7. Y ninguna ficha tiene cuenta todavía: es lo que crear_director.py
    #    necesita encontrar para ofrecerla.
    libres = con.execute(
        "SELECT COUNT(*) FROM personal p LEFT JOIN usuarios u "
        "ON u.personal_id = p.id WHERE u.id IS NULL").fetchone()[0]
    if libres != 1:
        fallos.append(f"crear_director.py vería {libres} fichas libres, se esperaba 1")

    con.close()
    return fallos, despues


FICHA = {
    "nombre":        "Elizabeth Yolanda Nieves Campos",
    "cargo":         "Administrador",
    "area":          "Administracion",
    "sede":          "Lima",
    "documento":     "73831535",
    # Se guarda en aaaa-mm-dd, que es lo que escribe el formulario de la
    # aplicación. El 18/08/2026 que se indicó es esta misma fecha.
    "fecha_ingreso": "2026-08-18",
}


def main():
    bd = config.DB_PATH
    if not os.path.exists(bd):
        print(f"No existe la base: {bd}")
        return 1

    con = sqlite3.connect(bd)
    antes = inventario(con)
    con.close()

    imprimir_plan(bd, antes, FICHA)

    if "--ejecutar" not in sys.argv:
        _linea()
        _linea("  SIMULACIÓN. No se ha borrado nada.")
        _linea("  Para borrar de verdad:  py backend\\borrado_total.py --ejecutar")
        return 0

    _linea()
    _linea("  Ejecutando…")
    borradas, pid, respaldo = ejecutar(bd, FICHA)
    _linea(f"  copia de seguridad  {respaldo}")
    _linea(f"  filas borradas      {borradas}")
    _linea(f"  ficha creada        id {pid} · {FICHA['nombre']}")

    fallos, despues = verificar(bd, pid, antes)
    _linea()
    if fallos:
        _linea("  LA VERIFICACIÓN FALLÓ:")
        for f in fallos:
            _linea("    · " + f)
        _linea(f"  Para volver atrás:  copia {respaldo} sobre {bd}")
        return 1

    _linea("  Verificado:")
    _linea("    · todas las tablas siguen existiendo")
    _linea("    · los datos están en cero y no hay claves foráneas rotas")
    _linea(f"    · roles ({despues.get('roles')}) y permisos "
           f"({despues.get('permisos_rol')}) intactos")
    _linea("    · el rol Director conserva sus permisos")
    _linea("    · la ficha nueva existe y no tiene cuenta todavía")
    _linea()
    _linea("  AHORA, para recuperar el acceso:")
    _linea("      py backend\\crear_director.py")
    _linea("=" * 72)
    return 0


if __name__ == "__main__":
    sys.exit(main())
