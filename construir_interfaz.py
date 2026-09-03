# -*- coding: utf-8 -*-
"""
construir_interfaz.py — junta las piezas de interfaz/ y escribe
"ERP RRHH - Lost Children Peru.dc.html".

El .dc.html deja de ser un archivo que se edita a mano: es GENERADO.
Las piezas viven en interfaz/ (base.html, pantallas/, dialogos/) y este
script las junta reemplazando cada marcador `<!--@PANTALLA:x-->` o
`<!--@DIALOGO:x-->` por el contenido exacto del archivo correspondiente.

Por qué generado y no servido por trozos: el .dc.html se puede seguir
abriendo a doble clic sin servidor (aunque para la app conviene siempre
entrar por http://127.0.0.1:7801/, ver LEEME.md). El ensamblador corre
solo al arrancar el servidor (ver app.py), así que se edita una pieza,
se recarga, y ya está.

Uso manual:
    python construir_interfaz.py             reconstruye el .dc.html
    python construir_interfaz.py --comprobar reconstruye y compara
                                              byte a byte contra el actual
"""
import re
import sys
import pathlib

RAIZ = pathlib.Path(__file__).resolve().parent
INTERFAZ = RAIZ / "interfaz"
SALIDA = RAIZ / "ERP RRHH - Lost Children Peru.dc.html"

MARCADOR_HTML = re.compile(r'^([ \t]*)<!--@(PANTALLA|DIALOGO):([A-Za-z0-9_-]+)-->[ \t]*$')
MARCADOR_JS = re.compile(r'^([ \t]*)/\*@LOGICA:([A-Za-z0-9_-]+)\*/[ \t]*$')
CORTE_INTERNO = re.compile(r'^/\*§CORTE§ linea original \d+ §\*/$')

# El fin de línea NO importa, y esto es deliberado.
#
# Hasta el 03/09/2026 este archivo partía las piezas por "\r\n" a secas.
# En esta máquina funciona —Windows guarda así— pero el repositorio las
# guarda con "\n": git tiene core.autocrlf=true, que convierte al sacarlas
# aquí y las guarda con LF. Cuando Coolify clona en Linux salen con LF, el
# split no encontraba ninguna línea, ningún marcador se sustituía, y el
# contenedor servía el esqueleto de base.html con los marcadores sin
# rellenar: una página en blanco, 46 KB en vez de 837 KB, y ni un solo
# error en el registro. El peor tipo de fallo: silencioso y solo allí.
#
# Se normaliza al leer y se escribe siempre con "\r\n", así el archivo
# generado sale idéntico aquí y dentro del contenedor. Lo vigila
# pruebas/prueba_construir_lf.py.
def _lineas(ruta, quitar_final=True):
    """Las líneas de un archivo, venga con LF, CRLF o CR.

    `quitar_final` descarta el hueco vacío que deja el salto de línea del
    final. Las piezas lo quieren quitado —se insertan dentro de otra
    línea—; base.html no, porque ese salto es el que cierra el archivo
    generado.
    """
    texto = ruta.read_bytes().decode("utf-8")
    texto = texto.replace("\r\n", "\n").replace("\r", "\n")
    if quitar_final and texto.endswith("\n"):
        texto = texto[:-1]
    return texto.split("\n")


# Cada módulo de lógica puede vivir repartido en varios tramos no contiguos
# del archivo original (p.ej. "responsables" antes y después de "bandeja").
# logica/<modulo>.js los guarda en orden, separados por el marcador interno
# CORTE_INTERNO. Cada aparición de @LOGICA:<modulo> en base.html consume,
# en orden, el siguiente tramo de ese módulo.
_cursor_logica = {}


def _tramos_de(nombre):
    if nombre not in _cursor_logica:
        ruta = INTERFAZ / "logica" / f"{nombre}.js"
        if not ruta.exists():
            raise SystemExit(f"Falta la pieza logica/{nombre}.js (marcador en base.html)")
        piezas_js = _lineas(ruta)
        tramos, actual = [], []
        for l in piezas_js:
            if CORTE_INTERNO.match(l):
                tramos.append(actual)
                actual = []
            else:
                actual.append(l)
        tramos.append(actual)
        _cursor_logica[nombre] = iter(tramos)
    return _cursor_logica[nombre]


def construir():
    lineas = _lineas(INTERFAZ / "base.html", quitar_final=False)

    piezas = []
    for l in lineas:
        m = MARCADOR_HTML.match(l)
        if m:
            _, tipo, nombre = m.groups()
            carpeta = "pantallas" if tipo == "PANTALLA" else "dialogos"
            ruta = INTERFAZ / carpeta / f"{nombre}.html"
            if not ruta.exists():
                raise SystemExit(f"Falta la pieza {carpeta}/{nombre}.html (marcador en base.html)")
            piezas.append("\r\n".join(_lineas(ruta)))
            continue
        m = MARCADOR_JS.match(l)
        if m:
            _, nombre = m.groups()
            tramo = next(_tramos_de(nombre))
            piezas.append("\r\n".join(tramo))
            continue
        piezas.append(l)

    return "\r\n".join(piezas)


def escribir():
    """Reconstruye y escribe el .dc.html. La llama app.py al arrancar."""
    SALIDA.write_bytes(construir().encode("utf-8"))


def main():
    texto = construir()
    if "--comprobar" in sys.argv:
        anterior = SALIDA.read_bytes().decode("utf-8") if SALIDA.exists() else None
        if anterior == texto:
            print("IDÉNTICO al archivo actual.")
            return
        print("DIFERENTE del archivo actual — no se escribió nada. Usa sin --comprobar para regenerar.")
        sys.exit(1)
    SALIDA.write_bytes(texto.encode("utf-8"))
    print(f"escrito: {SALIDA} ({len(texto)} caracteres)")


if __name__ == "__main__":
    main()
