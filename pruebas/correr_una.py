# -*- coding: utf-8 -*-
"""
Una sola suite de navegador, dentro de su banco de pruebas.

Desde que las suites dejaron de tocar la base real, no se pueden lanzar
sueltas: necesitan el servidor del 7801 apuntando a la copia. Esto levanta
el banco, monta la fixtura, corre la suite que se pida y lo retira todo.

    py correr_una.py prueba_legajo
    py correr_una.py prueba_legajo --sin-fixtura
"""
import os
import subprocess
import sys

sys.stdout.reconfigure(encoding="utf-8")
AQUI = os.path.dirname(os.path.abspath(__file__))


def cargar_corredor():
    """Las funciones del corredor, sin ejecutar sus suites."""
    ruta = os.path.join(AQUI, "correr_todo.py")
    fuente = open(ruta, encoding="utf-8").read()
    corte = fuente.index("barrer_zzz()\n\nbanco")
    mod = {"__name__": "corredor_parcial", "__file__": ruta}
    exec(compile(fuente[:corte], ruta, "exec"), mod)
    return mod


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        print(__doc__)
        return 2
    nombre = args[0].removesuffix(".js")
    con_fixtura = "--sin-fixtura" not in sys.argv

    C = cargar_corredor()
    banco, carpeta = C["levantar_banco"]()
    try:
        if con_fixtura:
            C["fixtura"]("montar")
            # La segunda fixtura: tres personas enroladas con marcas del
            # terminal. La montaba solo el corredor completo, así que
            # legajo, organigrama, asistencia y documentos fallaban al
            # lanzarlas sueltas por falta de datos, no por un fallo suyo.
            C["fixtura_marcas"]("crear")
        # Hay suites en Python (las que no necesitan navegador).
        guion = os.path.join(AQUI, nombre + ".py")
        orden = ([sys.executable, guion] if os.path.exists(guion)
                 else ["node", nombre + ".js"])
        r = subprocess.run(orden, cwd=AQUI, env=C["ENTORNO"])
        return r.returncode
    finally:
        if con_fixtura:
            C["fixtura_marcas"]("borrar")
            C["fixtura"]("desmontar")
        C["bajar_banco"](banco, carpeta)


if __name__ == "__main__":
    sys.exit(main())
