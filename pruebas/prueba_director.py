# -*- coding: utf-8 -*-
"""
crear_director.py ejecutado de verdad, sobre una COPIA.

Se simula el tecleo del operador por stdin, incluido getpass, para probar
el guion completo y no solo sus funciones sueltas.
"""
import os
import sys, os, shutil, io, subprocess
sys.stdout.reconfigure(encoding="utf-8")

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RAIZ, "backend"))
COPIA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "rrhh_dir.db")
shutil.copy2(os.path.join(RAIZ, "data", "rrhh.db"), COPIA)

import config
config.DB_PATH = COPIA
import db, auth, crear_director
db.config.DB_PATH = COPIA
db.iniciar()

fallos = []
def check(c, m):
    print(("  OK    " if c else "  FALLO ") + m)
    if not c: fallos.append(m)

def _asegurar_personal(cuantos=3):
    """
    Crea fichas de prueba si la base no tiene suficientes sin cuenta.

    Antes bastaba con coger las primeras de las 20 de la semilla. Esa semilla
    se retiró y la base arranca vacía, así que la prueba se abastece sola: es
    lo correcto de todas formas, porque no debe depender de datos ambientales
    que alguien puede borrar legítimamente.
    """
    creadas = []
    while len(db.personal_sin_usuario()) < cuantos:
        creadas.append(db.crear_personal(
            {"nombre": "Zzz Cuenta %d" % (len(creadas) + 1), "cargo": "Prueba"}))
    if creadas:
        print("   (fixtura: %d ficha(s) creada(s) para esta prueba)" % len(creadas))
    return creadas

# getpass no lee de stdin redirigido: se sustituye por una cola de respuestas
CLAVES = []
def _fake_getpass(prompt=""):
    return CLAVES.pop(0) if CLAVES else ""
crear_director.getpass.getpass = _fake_getpass

def correr(entradas, claves):
    """Ejecuta crear() con el tecleo simulado y devuelve lo que imprimió."""
    global CLAVES
    CLAVES = list(claves)
    sys.stdin = io.StringIO("\n".join(entradas) + "\n")
    salida = io.StringIO()
    real = sys.stdout
    sys.stdout = salida
    try:
        codigo = crear_director.crear()
    finally:
        sys.stdout = real
        sys.stdin = sys.__stdin__
    return codigo, salida.getvalue()

print("1. Estado de partida")
# No se exige partir de cero: otra suite pudo dejar los roles de sistema
# creados. Lo que importa es que no haya CUENTAS, que es lo que decide si
# el guion permite crear el primer Director.
db.ejecutar("DELETE FROM usuarios")
print(f"   roles previos: {len(db.roles())} · cuentas: {len(db.usuarios())}")
check(len(db.usuarios()) == 0, "no hay cuentas de usuario")

print("\n2. Primera ejecución: crea los roles y el Director")
_asegurar_personal(3)
pid = db.personal_sin_usuario()[0]["id"]
codigo, salida = correr([str(pid), "dirprueba"],
                        ["clave-de-prueba", "clave-de-prueba"])
print("   " + " / ".join(l.strip() for l in salida.strip().split("\n") if l.strip())[:180])
check(codigo == 0, "termina bien")
check(db.rol_por_clave("director") is not None, "crea el rol Director")
check(db.rol_por_clave("rrhh") is not None, "y el rol RRHH")
u = db.usuario_por_nombre("dirprueba")
check(u is not None, "crea la cuenta")
check(u["rol"] == "director", "con rol Director")
check(u["personal_id"] == pid, "vinculada a la ficha elegida")
check(u["debe_cambiar"] == 0, "no le exige cambiar la clave (la eligió él)")

print("\n3. La contraseña se guardó hasheada, no en claro")
print(f"   {u['clave_hash'][:46]}...")
check("clave-de-prueba" not in u["clave_hash"], "no aparece en claro")
check(auth.verificar("clave-de-prueba", u["clave_hash"]), "y verifica bien")

print("\n4. No hay contraseña por defecto en el código")
fuente = open(os.path.join(RAIZ, "backend", "crear_director.py"), encoding="utf-8").read()
sospechosas = [w for w in ("admin123", "password", "123456", "cambiar123", "temporal")
               if w in fuente.lower()]
check(not sospechosas, f"ninguna clave incrustada{'' if not sospechosas else ' — ' + str(sospechosas)}")

print("\n5. Segunda ejecución: se niega si ya hay un Director")
codigo, salida = correr([], [])
print("   " + salida.strip().split("\n")[0][:110])
check(codigo == 1, "no crea un segundo Director sin --forzar")
check("--forzar" in salida and "--resetear" in salida, "explica las dos salidas")
check(len(db.usuarios()) == 1, "sigue habiendo una sola cuenta")

print("\n6. Con --forzar sí deja")
pid2 = db.personal_sin_usuario()[0]["id"]
CLAVES = ["otra-clave-larga", "otra-clave-larga"]
sys.stdin = io.StringIO(f"{pid2}\ndirdos\n")
_sal = io.StringIO(); _r = sys.stdout; sys.stdout = _sal
try:
    codigo = crear_director.crear(forzar=True)
finally:
    sys.stdout = _r; sys.stdin = sys.__stdin__
check(codigo == 0 and db.directores_activos() == 2, "crea el segundo con --forzar")

print("\n7. Rescate: --resetear cambia la clave y cierra sesiones")
tok, _ = auth.abrir_sesion(u["id"])
check(auth.sesion_de(tok) is not None, "hay una sesión abierta antes")
CLAVES = ["clave-nueva-larga", "clave-nueva-larga"]
_sal = io.StringIO(); _r = sys.stdout; sys.stdout = _sal
try:
    codigo = crear_director.resetear("dirprueba")
finally:
    sys.stdout = _r
u2 = db.usuario_por_nombre("dirprueba")
check(codigo == 0, "el rescate termina bien")
check(auth.verificar("clave-nueva-larga", u2["clave_hash"]), "la clave nueva funciona")
check(not auth.verificar("clave-de-prueba", u2["clave_hash"]), "la vieja ya no")
check(u2["debe_cambiar"] == 1, "le exige cambiarla al entrar")
check(auth.sesion_de(tok) is None, "y sus sesiones abiertas se cerraron")

print("\n8. Rescate de un usuario que no existe")
_sal = io.StringIO(); _r = sys.stdout; sys.stdout = _sal
try:
    codigo = crear_director.resetear("noexiste")
finally:
    sys.stdout = _r
check(codigo == 1, "avisa y no revienta")

print("\n9. Claves que no coinciden o son cortas se rechazan")
CLAVES = ["corta", "corta", "buena-y-larga", "otra-distinta", "buena-y-larga", "buena-y-larga"]
_sal = io.StringIO(); _r = sys.stdout; sys.stdout = _sal
try:
    got = crear_director._pedir_clave("x")
finally:
    sys.stdout = _r
salida = _sal.getvalue()
check(got == "buena-y-larga", "insiste hasta que la clave es válida")
check("Muy corta" in salida, "avisa de la corta")
check("No coinciden" in salida, "y de las que no coinciden")

print("\n10. --listar no muestra ninguna contraseña")
_sal = io.StringIO(); _r = sys.stdout; sys.stdout = _sal
try:
    crear_director.listar()
finally:
    sys.stdout = _r
listado = _sal.getvalue()
print("   " + " / ".join(l.strip() for l in listado.strip().split("\n")[:4]))
check("dirprueba" in listado, "lista las cuentas")
check("clave-nueva-larga" not in listado and "pbkdf2" not in listado,
      "sin contraseñas ni hashes")

print("\n" + (f"  {len(fallos)} FALLOS" if fallos else "  CREAR_DIRECTOR OK"))
for f in fallos: print("   -", f)
print("  (la base real NO fue tocada)")
sys.exit(1 if fallos else 0)
