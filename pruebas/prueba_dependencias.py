# -*- coding: utf-8 -*-
"""Que todo lo que el backend importa esté declarado en requirements.txt.

POR QUÉ EXISTE
──────────────
El 03/09/2026 el contenedor de Coolify se cayó diez veces seguidas hasta que
Docker se rindió. El despliegue decía "Success" y el registro del contenedor
—que hay que ir a buscar aparte— decía:

    File "/app/backend/firmas.py", line 42, in <module>
        from PIL import Image
    ModuleNotFoundError: No module named 'PIL'

Pillow nunca estuvo en requirements.txt. Y no se notó porque esta máquina lo
tiene instalado de forma global, igual que cryptography: aquí el servidor
arranca, las pruebas pasan y todo parece correcto. El contenedor parte de
cero y solo instala lo que dice ese archivo, así que allí no existe.

Detrás de Pillow esperaba el mismo fallo con cryptography (app.py importa
formulario, que importa google_hoja, que lo importa a él). Arreglar solo el
primero habría dado otra caída idéntica en la línea siguiente.

Es un fallo que no se puede ver leyendo el código ni ejecutándolo aquí. Solo
se ve comparando los `import` contra el archivo de dependencias, que es lo
que hace esta prueba.

QUÉ COMPRUEBA
─────────────
Que cada librería externa que el backend importa SIN protección esté
declarada. Un import envuelto en `try/except ImportError` no cuenta: ese es
el patrón de las opcionales —pillow_heif, para las fotos HEIC del iPhone—,
que se pueden no instalar porque el código ya avisa cuando faltan.
"""
import ast
import pathlib
import re
import sys

sys.stdout.reconfigure(encoding="utf-8")
RAIZ = pathlib.Path(__file__).resolve().parent.parent
BACKEND = RAIZ / "backend"

fallos = []


def check(c, m):
    print(("  OK    " if c else "  FALLO ") + m)
    if not c:
        fallos.append(m)


# El nombre que se importa no siempre es el nombre del paquete que se
# instala, y un paquete trae módulos que no se declaran por su cuenta.
#   módulo importado -> qué línea de requirements.txt lo cubre
CUBIERTO_POR = {
    "PIL": "pillow",
    "cryptography": "cryptography",
    "flask": "flask",
    "requests": "requests",
    "gunicorn": "gunicorn",
    # Vienen dentro de otro paquete, no se declaran sueltos.
    "werkzeug": "flask",
    "jinja2": "flask",
    "urllib3": "requests",
    "certifi": "requests",
    "pillow_heif": "pillow-heif",
}


def declarados():
    """Los nombres de paquete que pide requirements.txt, en minúsculas."""
    texto = (BACKEND / "requirements.txt").read_text(encoding="utf-8")
    fuera = set()
    for linea in texto.splitlines():
        linea = linea.split("#")[0].strip()
        if not linea:
            continue
        fuera.add(re.split(r"[<>=!\[;]", linea)[0].strip().lower())
    return fuera


def externos_sin_proteger():
    """Cada librería externa importada sin try/except, con dónde aparece."""
    locales = {p.stem for p in BACKEND.glob("*.py")}
    locales |= {p.stem for p in RAIZ.glob("*.py")}
    estandar = set(sys.stdlib_module_names)

    encontrados = {}
    for py in sorted(BACKEND.rglob("*.py")):
        arbol = ast.parse(py.read_text(encoding="utf-8"), filename=str(py))

        # Marcar los import que viven dentro de un try que caza ImportError.
        protegidos = set()
        for nodo in ast.walk(arbol):
            if not isinstance(nodo, ast.Try):
                continue
            caza = any(
                h.type is None
                or (isinstance(h.type, ast.Name)
                    and h.type.id in ("ImportError", "ModuleNotFoundError", "Exception"))
                for h in nodo.handlers
            )
            if not caza:
                continue
            for hijo in ast.walk(nodo):
                if isinstance(hijo, (ast.Import, ast.ImportFrom)):
                    protegidos.add(id(hijo))

        for nodo in ast.walk(arbol):
            if isinstance(nodo, ast.Import):
                nombres = [a.name.split(".")[0] for a in nodo.names]
            elif isinstance(nodo, ast.ImportFrom):
                if nodo.level:          # from .algo import x — es local
                    continue
                nombres = [(nodo.module or "").split(".")[0]]
            else:
                continue
            if id(nodo) in protegidos:
                continue
            for n in nombres:
                if not n or n in estandar or n in locales:
                    continue
                encontrados.setdefault(n, []).append(
                    f"{py.relative_to(RAIZ).as_posix()}:{nodo.lineno}")
    return encontrados


pedidos = declarados()
usados = externos_sin_proteger()

print("1. requirements.txt se lee y declara algo")
check(bool(pedidos), f"declara {len(pedidos)} paquetes: {', '.join(sorted(pedidos))}")

print("\n2. Cada librería externa importada sin protección está declarada")
for modulo in sorted(usados):
    paquete = CUBIERTO_POR.get(modulo)
    donde = usados[modulo][0]
    if paquete is None:
        check(False,
              f"{modulo} ({donde}) no está en la tabla CUBIERTO_POR de esta "
              f"prueba — añádelo ahí y a requirements.txt si hace falta")
    else:
        check(paquete in pedidos,
              f"{modulo} lo cubre «{paquete}» ({donde})")

print("\n3. Lo declarado se puede importar de verdad aquí")
for modulo in sorted(usados):
    try:
        __import__(modulo)
        check(True, f"{modulo} se importa")
    except ImportError as e:
        check(False, f"{modulo} no se importa: {e}")

print()
if fallos:
    print(f"FALLA: {len(fallos)}")
    for f in fallos:
        print("   ·", f)
    sys.exit(1)
print("TODO BIEN")
