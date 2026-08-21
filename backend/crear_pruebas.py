# -*- coding: utf-8 -*-
"""
Crea las dos cuentas de prueba con las que el equipo va a comparar vistas.

    py backend\\crear_pruebas.py            crea lo que falte
    py backend\\crear_pruebas.py --listar   muestra qué hay
    py backend\\crear_pruebas.py --borrar   se las lleva

  · prueba.rrhh       vista RRHH: ve y edita todos los módulos
  · prueba.trabajador vista Trabajador: autoservicio

Sobre la vista Trabajador. Hoy los permisos son por MÓDULO, no por fila: dar
'personal: vista' le dejaría ver el directorio entero, con los datos de todos
sus compañeros. Eso no es autoservicio.

Así que este rol NO recibe 'personal'. Recibe lo que puede usar sin ver a
nadie más:

    asistencia  vista      su propio registro de marcas
    permisos    edicion    solicitar permisos y ver el estado de los suyos

Y nada más: ni dashboard —el general es administrativo—, ni beneficiarios, ni
planillas, ni usuarios.

Queda una limitación que hay que decir en voz alta y no tapar: mientras el
filtro sea por módulo, "ver solo lo mío" no está garantizado por el backend en
las pantallas que listan gente. Para que lo esté hace falta filtrar por
personal_id en los endpoints de asistencia y permisos —o una vista propia de
autoservicio—, y eso es trabajo aparte. Con el reparto de arriba el trabajador
simplemente no alcanza esas pantallas, que es lo que lo hace seguro hoy.
"""
import sys, os, getpass

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8")

import config
import db
import auth

CLAVE_TRABAJADOR = "trabajador"
CLAVE_RRHH = config.ROL_RRHH

# Lo que ve un trabajador. Ausencia = 'ninguno': un módulo que no está aquí
# nace cerrado, así que la lista dice exactamente a qué llega.
PERMISOS_TRABAJADOR = {
    "asistencia": "vista",
    # 'permisos' NO está, y es a propósito. Se le había dado 'edicion' para
    # que pudiera pedir permisos, pero ese mismo nivel es el que autoriza a
    # APROBARLOS: con él, un trabajador se aprobaba sus propias solicitudes
    # y leía las licencias médicas de todo el equipo.
    #
    # El autoservicio no lo necesita: /api/permisos/mios y el alta trabajan
    # sobre la persona de la sesión, sin mirar este diccionario. Lo que este
    # permiso abre es la bandeja de revisión, que es de la jefatura.
}

CUENTAS = [
    ("prueba.rrhh", CLAVE_RRHH, "Zzz Prueba RRHH"),
    ("prueba.trabajador", CLAVE_TRABAJADOR, "Zzz Prueba Trabajador"),
]


def _rol_trabajador():
    r = db.rol_por_clave(CLAVE_TRABAJADOR)
    if not r:
        rid = db.crear_rol("Trabajador", CLAVE_TRABAJADOR,
                           "Autoservicio: su asistencia y sus permisos. "
                           "No ve fichas de otras personas.")
        print(f"  rol «Trabajador» creado (#{rid})")
    else:
        rid = r["id"]
    # Se reescriben siempre: si alguien los tocó a mano, esto los devuelve a
    # lo que documenta este archivo.
    db.guardar_permisos_rol(rid, PERMISOS_TRABAJADOR)
    return rid


def _ficha(nombre):
    for p in db.personal(incluir_inactivos=True):
        if p["nombre"] == nombre:
            return p["id"]
    return db.crear_personal({"nombre": nombre, "cargo": "Cuenta de prueba"})


def crear():
    db.iniciar()
    import crear_director
    crear_director._asegurar_roles()      # Director y RRHH
    _rol_trabajador()

    clave = os.environ.get("CLAVE_PRUEBAS") or ""
    if not clave:
        clave = getpass.getpass("  Contraseña para las DOS cuentas de prueba: ")
    try:
        hash_ = auth.hashear(clave)
    except ValueError as e:
        print(f"  {e}")
        return 1

    for usuario, clave_rol, nombre in CUENTAS:
        rol = db.rol_por_clave(clave_rol)
        if not rol:
            print(f"  falta el rol '{clave_rol}', me lo salto")
            continue
        existente = db.usuario_por_nombre(usuario)
        if existente:
            db.actualizar_usuario(existente["id"],
                                  {"clave_hash": hash_, "rol_id": rol["id"],
                                   "estado": "activo", "debe_cambiar": 0})
            auth.cerrar_sesiones_de(existente["id"])
            print(f"  {usuario:20} actualizada · rol {rol['nombre']}")
            continue
        pid = _ficha(nombre)
        # debe_cambiar=0 a propósito: son cuentas para probar vistas, y
        # obligar a cambiar la clave en cada prueba estorba.
        db.crear_usuario(pid, usuario, hash_, rol["id"], debe_cambiar=0)
        print(f"  {usuario:20} creada · rol {rol['nombre']}")

    print()
    listar()
    print()
    print("  Las dos comparten la misma contraseña, la que acabas de escribir.")
    print("  Son cuentas de PRUEBA: bórralas antes de poner el sistema en")
    print("  producción con  py backend\\crear_pruebas.py --borrar")
    return 0


def listar():
    db.iniciar()
    print("  Cuentas de prueba:")
    hay = False
    for u in db.usuarios():
        if not u["usuario"].startswith("prueba."):
            continue
        hay = True
        permisos = db.permisos_rol(u["rol_id"])
        alcance = ", ".join(f"{m}:{n}" for m, n in sorted(permisos.items())
                            if n != "ninguno") or "(todo, es Director)"
        if u["rol"] == config.ROL_DIRECTOR:
            alcance = "todos los módulos"
        elif u["rol"] == CLAVE_RRHH:
            alcance = f"{len([1 for n in permisos.values() if n != 'ninguno'])} módulos"
        print(f"    {u['usuario']:20} {u['rol_nombre']:12} → {alcance}")
    if not hay:
        print("    ninguna")
    return 0


def borrar():
    db.iniciar()
    n = 0
    for u in db.usuarios():
        if u["usuario"].startswith("prueba."):
            auth.cerrar_sesiones_de(u["id"])
            db.borrar_usuario(u["id"])
            n += 1
            print(f"  {u['usuario']} eliminada")
    for p in db.personal(incluir_inactivos=True):
        if p["nombre"].startswith("Zzz Prueba "):
            db.ejecutar("DELETE FROM personal WHERE id = ?", (p["id"],))
            print(f"  ficha {p['nombre']} eliminada")
    print(f"\n  {n} cuenta(s) de prueba retiradas")
    return 0


if __name__ == "__main__":
    if "--listar" in sys.argv:
        sys.exit(listar())
    if "--borrar" in sys.argv:
        sys.exit(borrar())
    sys.exit(crear())
