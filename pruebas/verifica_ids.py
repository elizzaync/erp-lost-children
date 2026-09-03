# -*- coding: utf-8 -*-
"""
Cada {{ identificador }} del marcado tiene que existir en renderVals.

Un desajuste no rompe nada visiblemente: el campo sale vacío o el onChange
no hace nada, y eso pasa desapercibido hasta que alguien lo usa. Ya ocurrió
dos veces (plaPeriodo y setPlaPeriodo) por un reemplazo de acentos que
también tocó identificadores.
"""
import os
import sys, re, pathlib
sys.stdout.reconfigure(encoding="utf-8")

RUTA = pathlib.Path(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "ERP RRHH - Lost Children Peru.dc.html"))
s = RUTA.read_text(encoding="utf-8")

# Variables de bucle: las declara el propio sc-for con as="..."
locales = set(re.findall(r'<sc-for[^>]*\bas="([^"]+)"', s)) | {"true", "false"}

usados = {}
for m in re.finditer(r'\{\{\s*([A-Za-z_$][\w$]*)\s*(?:\}\}|\.)', s):
    usados.setdefault(m.group(1), s.count("\n", 0, m.start()) + 1)

cuerpo = s[s.index("renderVals()"):]

# Las claves que llegan por esparcido: `...this.valoresEmergencia(),`.
#
# renderVals se reparte entre archivos, y algún bloque calcula sus
# valores en un método propio para no meter treinta líneas de cálculo
# dentro del objeto. Ese método se define ANTES de renderVals, así que
# buscando solo hacia abajo sus claves parecían no existir.
#
# Se añade el cuerpo de esos métodos —y solo de esos— al texto donde se
# buscan las definiciones. Ensancharlo a todo el archivo dejaría la
# comprobación sin valor: cualquier `algo:` de cualquier objeto la
# satisfaría.
PATRON_ESPARCIDO = re.compile(r'[.]{3}this[.](\w+)[(][)]')
for _metodo in PATRON_ESPARCIDO.findall(cuerpo):
    _abre = re.search(r'\b' + _metodo + r'[(][)]\s*[{]', s)
    if not _abre:
        print(f'  OJO: renderVals esparce {_metodo}() y no encuentro el método')
        continue
    # Recorrer llaves para quedarse con el método completo y nada más.
    _prof, _i = 0, _abre.end() - 1
    while _i < len(s):
        if s[_i] == '{':
            _prof += 1
        elif s[_i] == '}':
            _prof -= 1
            if _prof == 0:
                break
        _i += 1
    cuerpo += s[_abre.start():_i + 1]
faltan = {k: v for k, v in usados.items()
          if k not in locales and not re.search(r'\b' + re.escape(k) + r'\s*:', cuerpo)}

print(f"identificadores usados en el marcado: {len(usados)}")
print(f"variables de bucle declaradas:        {len(locales)}")
if faltan:
    print(f"\n  {len(faltan)} SIN DEFINIR EN renderVals:")
    for k, ln in sorted(faltan.items(), key=lambda x: x[1]):
        print(f"    linea {ln:5}  {{{{ {k} }}}}")
    sys.exit(1)
# ── Claves repetidas ─────────────────────────────────────────────────────
#
# renderVals devuelve un objeto literal: si una clave se define dos veces,
# gana la última y la primera desaparece SIN AVISO. Pasó con 'modalRol', que
# ya era el cargo de quien se borra del terminal y volví a usarlo para el
# diálogo de cargos: el bloque entero dejó de pintarse y no hubo ni un error
# en consola.
#
# Solo se miran las claves del primer nivel del objeto devuelto; las de los
# objetos anidados pueden repetirse sin problema.
import collections

inicio = cuerpo.index("return {")
linea0 = s.count("\n", 0, s.index("renderVals()")) + cuerpo.count("\n", 0, inicio) + 1

# Una clave de verdad viene justo detrás de '{' o de ','. Sin esta
# condición, un ternario como  color: activo ? BLUE : GRIS  se leería como
# si 'BLUE' fuera una clave, porque también lleva dos puntos detrás.
nivel, comilla, claves, previo = 0, None, [], "{"

i, largo, linea = inicio + len("return {"), len(cuerpo), linea0
while i < largo:
    c = cuerpo[i]
    if comilla:
        if c == "\\":
            i += 2
            continue
        if c == comilla:
            comilla = None
        elif c == "\n":
            linea += 1
        i += 1
        continue
    if c in "\"'`":
        comilla = c
        previo = c
        i += 1
        continue
    if cuerpo.startswith("//", i):
        j = cuerpo.index("\n", i)
        linea += 1
        i = j + 1
        continue
    if cuerpo.startswith("/*", i):
        j = cuerpo.index("*/", i) + 2
        linea += cuerpo.count("\n", i, j)
        i = j
        continue
    if c in "{[(":
        nivel += 1
        previo = c
        i += 1
        continue
    if c in "}])":
        nivel -= 1
        if nivel < 0:
            break
        previo = c
        i += 1
        continue
    if c == "\n":
        linea += 1
        i += 1
        continue
    if nivel == 0 and (c.isalpha() or c == "_"):
        j = i
        while j < largo and (cuerpo[j].isalnum() or cuerpo[j] in "_$"):
            j += 1
        k = j
        while k < largo and cuerpo[k] in " \t":
            k += 1
        if k < largo and cuerpo[k] == ":" and previo in "{,":
            claves.append((cuerpo[i:j], linea))
        previo = cuerpo[j - 1]
        i = j
        continue
    if not c.isspace():
        previo = c
    i += 1

cuenta = collections.Counter(k for k, _ in claves)
repes = sorted(k for k, n in cuenta.items() if n > 1)
print(f"claves de primer nivel en renderVals:  {len(claves)}")
if repes:
    print(f"\n  {len(repes)} CLAVE(S) REPETIDA(S) — la última pisa a la anterior:")
    for r in repes:
        for k, ln in claves:
            if k == r:
                print(f"    linea {ln:5}  {r}")
    sys.exit(1)


# ── Equilibrio de <div> dentro de cada <sc-if> ───────────────────────────
# Un cierre de más se traga el contenedor de fuera y manda medio diálogo a
# otro sitio, sin error ni aviso. Es barato comprobarlo.
def _bloques_sc_if(lineas):
    """(nombre, primera línea, última) de cada sc-if, anidados incluidos."""
    pila = []
    encontrados = []
    for i, l in enumerate(lineas):
        for _ in range(l.count("<sc-if")):
            m = re.search(r'<sc-if value="\{\{ ([^}]+) \}\}"', l)
            pila.append(((m.group(1).strip() if m else "?"), i))
        for _ in range(l.count("</sc-if>")):
            if pila:
                nombre, desde = pila.pop()
                encontrados.append((nombre, desde, i))
    return encontrados


descuadrados = []
for nombre, desde, hasta in _bloques_sc_if(s.split("\n")):
    lineas_bloque = s.split("\n")[desde:hasta + 1]
    saldo = sum(len(re.findall(r"<div\b", x)) - len(re.findall(r"</div>", x))
                for x in lineas_bloque)
    if saldo:
        descuadrados.append((nombre, desde + 1, saldo))

if descuadrados:
    print(f"\n  {len(descuadrados)} BLOQUE(S) CON <div> DESCUADRADOS:")
    for nombre, linea, saldo in descuadrados:
        que = "cierra de más" if saldo < 0 else "deja abiertos"
        print(f"    linea {linea:5}  sc-if {nombre}: {que} {abs(saldo)}")
    sys.exit(1)

# ── Comentarios sin cerrar ───────────────────────────────────────────────
#
# Un /* sin su */ no da error en ninguna parte: se come TODO lo que viene
# detrás hasta el siguiente cierre, y ese código deja de existir en
# silencio. Pasó dos veces el 31/08/2026 al retirar valores muertos: el
# borrado se llevó la última línea de un comentario y con ella el cierre.
#
# El síntoma fue una lista vacía en pantalla, a cientos de líneas del
# destrozo y sin una sola pista de por dónde buscar.
_abiertos = []
for _f in sorted(RUTA.parent.glob("interfaz/logica/*.js")):
    _t = _f.read_text(encoding="utf-8", errors="replace")
    _i = 0
    while True:
        _a = _t.find("/*", _i)
        if _a < 0:
            break
        _c = _t.find("*/", _a + 2)
        if _c < 0:
            _abiertos.append(_f.name + ":" + str(_t[:_a].count(chr(10)) + 1))
            break
        _i = _c + 2
if _abiertos:
    print()
    print(f"  {len(_abiertos)} COMENTARIO(S) SIN CERRAR:")
    for _c in _abiertos:
        print("    " + _c)
    raise SystemExit(1)

# ── Caracteres invisibles ────────────────────────────────────────────────
#
# Un 0x08 se coló dentro de una expresión regular en alguna edición:
#     t.match(/^(\d{4})/)
# El patrón dejó de casar nunca, anioDe() devolvía vacío para todas las
# fechas y el gráfico «Altas por año» anunciaba que ninguna ficha tenía
# fecha de ingreso, teniéndolas todas. Leyendo el código no se ve: el
# carácter es invisible, y el fallo aparece a tres pantallas de distancia.
_control = []
for _f in sorted(RUTA.parent.glob("interfaz/**/*.*")) + [RUTA]:
    if _f.is_dir():
        continue
    _t = _f.read_bytes().decode("utf-8", "replace")
    for _i, _c in enumerate(_t):
        if ord(_c) < 32 and _c not in (chr(10), chr(13), chr(9)):
            _control.append(_f.name + ":" + str(_t[:_i].count(chr(10)) + 1) + " · " + hex(ord(_c)))
if _control:
    print()
    print(f"  {len(_control)} CARÁCTER(ES) DE CONTROL EN EL CÓDIGO:")
    for _c in _control[:8]:
        print("    " + _c)
    raise SystemExit(1)

print("\n  TODOS DEFINIDOS, SIN REPETIDOS, Y LAS CAJAS CIERRAN")
