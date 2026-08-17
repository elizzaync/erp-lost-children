# -*- coding: utf-8 -*-
"""
crear_director.py — alta del primer Director y rescate de cuentas.

POR QUÉ ES UN SCRIPT Y NO UN USUARIO POR DEFECTO

Dejar en el código un usuario "admin" con contraseña conocida es una puerta
trasera con otro nombre: viaja con el proyecto, acaba en un repositorio y
nadie la cambia. Aquí no hay ninguna contraseña predefinida — la escribe
quien ejecuta esto, y solo puede ejecutarlo alguien con acceso al disco de
la máquina, que es la garantía razonable en este escenario.

USO

    py backend/crear_director.py                 crea el primer Director
    py backend/crear_director.py --forzar        permite crear otro más
    py backend/crear_director.py --resetear jperez   nueva clave a alguien
    py backend/crear_director.py --listar        quién tiene cuenta

El rescate existe porque el sistema impide quedarse sin Directores activos,
pero no impide olvidar una contraseña.
"""
import getpass
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

for _f in (sys.stdout, sys.stderr):
    try:
        _f.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

import auth
import config
import db


def _pedir_clave(quien):
    while True:
        c1 = getpass.getpass(f"Contraseña para {quien} (no se muestra): ")
        if len(c1) < config.CLAVE_MINIMA:
            print(f"  Muy corta: mínimo {config.CLAVE_MINIMA} caracteres.")
            continue
        c2 = getpass.getpass("Repítela: ")
        if c1 != c2:
            print("  No coinciden. Otra vez.")
            continue
        return c1


def _asegurar_roles():
    """Crea Director y RRHH si no están, con sus permisos de partida."""
    director = db.rol_por_clave(config.ROL_DIRECTOR)
    if not director:
        rid = db.crear_rol("Director", config.ROL_DIRECTOR,
                           "Acceso total. Único rol que puede crear otros Directores.",
                           es_sistema=1)
        db.guardar_permisos_rol(rid, {m: "edicion" for m in config.CLAVES_MODULO})
        director = db.rol(rid)
        print("  Rol «Director» creado con acceso total.")

    rrhh = db.rol_por_clave(config.ROL_RRHH)
    if not rrhh:
        rid = db.crear_rol("RRHH", config.ROL_RRHH,
                           "Gestiona personal, planillas y usuarios. No puede otorgar el rol Director.",
                           es_sistema=1)
        # De partida NO ve incidencias ni sesiones: son del equipo técnico.
        # Se puede ajustar después desde la interfaz.
        permisos = {m: "edicion" for m in config.CLAVES_MODULO}
        permisos["incidencias"] = "ninguno"
        permisos["sesiones"] = "ninguno"
        db.guardar_permisos_rol(rid, permisos)
        print("  Rol «RRHH» creado (sin acceso a sesiones ni incidencias).")
    return director


def listar():
    us = db.usuarios()
    if not us:
        print("No hay ninguna cuenta todavía.")
        return
    print(f"{len(us)} cuenta(s):\n")
    print(f"  {'USUARIO':<16} {'ROL':<14} {'ESTADO':<11} {'ÚLTIMO ACCESO':<20} PERSONA")
    for u in us:
        print(f"  {u['usuario']:<16} {u['rol_nombre']:<14} {u['estado']:<11} "
              f"{(u['ultimo_acceso'] or 'nunca'):<20} {u['nombre']}")


def resetear(nombre_usuario):
    u = db.usuario_por_nombre(nombre_usuario)
    if not u:
        print(f"No existe el usuario «{nombre_usuario}».")
        return 1
    print(f"Restableciendo la contraseña de «{u['usuario']}» ({u['nombre']}).")
    clave = _pedir_clave(u["usuario"])
    db.actualizar_usuario(u["id"], {"clave_hash": auth.hashear(clave),
                                    "debe_cambiar": 1, "estado": "activo"})
    auth.cerrar_sesiones_de(u["id"])   # las sesiones abiertas dejan de valer
    print("\nListo. Tendrá que cambiarla al entrar, y sus sesiones se cerraron.")
    return 0


def crear(forzar=False):
    director = _asegurar_roles()

    activos = db.directores_activos()
    if activos and not forzar:
        print(f"Ya hay {activos} Director(es) activo(s). Usa --forzar para crear otro,")
        print("o --resetear <usuario> si lo que necesitas es recuperar el acceso.")
        return 1

    libres = db.personal_sin_usuario()
    if not libres:
        print("Todas las fichas de personal ya tienen cuenta. Nada que hacer.")
        return 1

    print("\n¿A qué ficha de personal se vincula el Director?\n")
    for p in libres[:40]:
        print(f"  [{p['id']:>3}] {p['nombre']}" + (f" — {p['cargo']}" if p['cargo'] else ""))
    if len(libres) > 40:
        print(f"  ... y {len(libres) - 40} más")

    while True:
        try:
            pid = int(input("\nid de la ficha: ").strip())
        except (ValueError, EOFError):
            print("  Escribe un número.")
            continue
        if not any(p["id"] == pid for p in libres):
            print("  Ese id no está en la lista.")
            continue
        break

    persona = next(p for p in libres if p["id"] == pid)
    sugerido = auth.sugerir_usuario(persona["nombre"],
                                    [u["usuario"] for u in db.usuarios()])
    escrito = input(f"Nombre de usuario [{sugerido}]: ").strip() or sugerido
    if db.usuario_por_nombre(escrito):
        print(f"  «{escrito}» ya existe.")
        return 1

    clave = _pedir_clave(escrito)
    uid = db.crear_usuario(pid, escrito, auth.hashear(clave), director["id"],
                           debe_cambiar=0)
    print(f"\nDirector creado: «{escrito}» → {persona['nombre']} (usuario {uid})")
    print("\nDesde la interfaz podrá crear el resto de cuentas y roles.")
    print(f"LOGIN_ESTRICTO está en {config.LOGIN_ESTRICTO}: "
          + ("solo se entra con cuenta." if config.LOGIN_ESTRICTO
             else "quien no tenga cuenta sigue entrando como antes."))
    return 0


if __name__ == "__main__":
    db.iniciar()
    args = sys.argv[1:]
    if "--listar" in args:
        listar(); sys.exit(0)
    if "--resetear" in args:
        i = args.index("--resetear")
        if i + 1 >= len(args):
            print("Falta el nombre de usuario: --resetear <usuario>"); sys.exit(1)
        sys.exit(resetear(args[i + 1]))
    sys.exit(crear(forzar="--forzar" in args))
