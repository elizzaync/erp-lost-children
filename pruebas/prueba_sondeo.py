# -*- coding: utf-8 -*-
"""El sondeo automático: cuándo arranca, cuándo no, y cómo aguanta un fallo.

Lo importante de un hilo que corre solo es que NO haga daño: que no salga a
internet desde las pruebas, que no ingrese nada por su cuenta y que un
error de red no lo mate ni llene el registro.
"""
import os, shutil, sys, tempfile, pathlib, time, logging
sys.stdout.reconfigure(encoding="utf-8")
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RAIZ, "backend"))

carpeta = pathlib.Path(tempfile.mkdtemp())
copia = carpeta / "sondeo.db"
shutil.copy2(os.path.join(RAIZ, "data", "rrhh.db"), copia)
os.environ["DB_PATH"] = str(copia)
import config; config.DB_PATH = str(copia)
import db; db.config.DB_PATH = str(copia); db.iniciar()
import sondeo_formulario as S

fallos = []
def check(c, m):
    print(("  OK    " if c else "  FALLO ") + m)
    if not c: fallos.append(m)


print("1. No arranca si falta lo que necesita")
guardados = (config.FORM_MINUTOS_SONDEO, config.FORM_CREDENCIAL, config.FORM_HOJA_ID)

config.FORM_MINUTOS_SONDEO = 0
check("desactivado" in S.arrancar(), "en 0 minutos, desactivado")

config.FORM_MINUTOS_SONDEO = 10
config.FORM_CREDENCIAL = str(carpeta / "no-existe.json")
check("sin llave" in S.arrancar(), "sin llave de Google, no sondea")

config.FORM_CREDENCIAL = guardados[1]
config.FORM_HOJA_ID = ""
check("sin hoja" in S.arrancar(), "sin hoja configurada, tampoco")

config.FORM_HOJA_ID = guardados[2]

print("\n2. Importar app NO arranca el sondeo")
# Las suites importan app; si el sondeo saliera de ahí, cada prueba
# hablaría con Google y tocaría la hoja de verdad.
import app  # noqa: F401
check(S._hilo is None, "tras importar app, ningún hilo en marcha")

print("\n3. Un fallo no mata el hilo ni llena el registro")
llamadas = {"n": 0}
def revienta():
    llamadas["n"] += 1
    raise RuntimeError("sin internet")
S._una_vuelta = revienta

avisos = []
class Oyente(logging.Handler):
    def emit(self, r): avisos.append(r.getMessage())
S.log.addHandler(Oyente())

hilo = __import__("threading").Thread(target=S._bucle, args=(0.0001,), daemon=True)
# Sin el respiro inicial la prueba tardaría 30 s en empezar. Se guarda la
# función real ANTES de sustituirla: 'time' aquí y S.time son el MISMO
# módulo, así que sin esto la sustituta se llamaría a sí misma.
_dormir_real = time.sleep
S.time.sleep = lambda s: _dormir_real(min(s, 0.02))
hilo.start()
_dormir_real(1.2)
check(hilo.is_alive(), "el hilo sigue vivo tras fallar")
check(llamadas["n"] >= 2, f"y lo reintentó ({llamadas['n']} veces)")
check(any("no se pudo traer" in a for a in avisos), "dejó aviso en el registro")
check(all("Traceback" not in a for a in avisos), "sin volcados que llenen el archivo")
espaciado = [a for a in avisos if "intento seguido" in a]
check(len(espaciado) >= 2, "cuenta los fallos seguidos, para espaciar los intentos")

print("\n4. El sondeo no ingresa nada por su cuenta")
import formulario as F
fuente = open(os.path.join(RAIZ, "backend", "sondeo_formulario.py"), encoding="utf-8").read()
check("ingresar" not in fuente.replace("no ingresa", ""),
      "el módulo no llama a ingresar() en ninguna parte")
check("traer()" in fuente, "solo trae a la bandeja")

config.FORM_MINUTOS_SONDEO = guardados[0]
print()
print("FALLOS: " + str(len(fallos)) if fallos else "SONDEO DEL FORMULARIO OK")
for f in fallos: print("  - " + f)
shutil.rmtree(carpeta, ignore_errors=True)
sys.exit(1 if fallos else 0)
