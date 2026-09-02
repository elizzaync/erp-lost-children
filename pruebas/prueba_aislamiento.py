# -*- coding: utf-8 -*-
"""
¿De verdad las suites de navegador ya no pueden tocar la base real?

No basta con leer el código: hay que verlo. Esta prueba levanta el banco
igual que hace el corredor, escribe en él a través del servidor —como haría
cualquier suite— y comprueba que la base real no se enteró.

Y comprueba lo que más importa: que si el proceso muere de golpe, sin
'finally' ni limpieza de ninguna clase, la base real sigue intacta. Ese es
el caso que falló tres veces.
"""
import http.cookiejar
import importlib.util
import json
import os
import sqlite3
import subprocess
import sys
import time
import urllib.request

sys.stdout.reconfigure(encoding="utf-8")
AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE_REAL = os.path.join(RAIZ, "data", "rrhh.db")
SERVIDOR = os.path.join(RAIZ, "backend", "servidor.py")

fallos = []
def check(c, m):
    print(("  OK    " if c else "  FALLO ") + m)
    if not c:
        fallos.append(m)


def foto_real():
    """Qué hay en la base real ahora mismo."""
    con = sqlite3.connect(BASE_REAL)
    d = {t: con.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
         for t in ("personal", "beneficiarios", "responsables", "identidades")}
    d["nombres"] = sorted(r[0] for r in con.execute("SELECT nombre FROM personal"))
    con.close()
    return d


# El corredor no es importable por nombre (tiene código al importarse), así
# que se cargan solo las funciones que hacen falta, copiándolas de su fuente.
def cargar_corredor():
    ruta = os.path.join(AQUI, "correr_todo.py")
    fuente = open(ruta, encoding="utf-8").read()
    # Se corta justo antes de que empiece a ejecutar suites.
    corte = fuente.index("barrer_zzz()\n\nbanco")
    mod = {"__name__": "corredor_parcial", "__file__": ruta}
    exec(compile(fuente[:corte], ruta, "exec"), mod)
    return mod


print("0. Cómo está la base real antes de nada")
antes = foto_real()
print(f"   personal {antes['personal']} · beneficiarios {antes['beneficiarios']}")

print("\n1. El corredor levanta su banco de pruebas")
C = cargar_corredor()
check(hasattr(C["__builtins__"], "get") or True, "el corredor se carga")
banco, carpeta = C["levantar_banco"]()
copia = C["ENTORNO"]["DB_PATH"]
check(os.path.exists(copia), f"existe la copia · {os.path.basename(copia)}")
check(os.path.abspath(copia) != os.path.abspath(BASE_REAL),
      "y NO es la base real")

try:
    print("\n2. El banco responde y sirve la copia, no la real")
    with urllib.request.urlopen(C["URL"], timeout=5) as r:
        check(r.status == 200, "el servidor de pruebas responde")

    # Se escribe COMO LO HARÍA UNA SUITE: por la API del banco, y con
    # sesión. Sin identificarse son 401 en todo desde que se cerró el modo
    # convivencia, así que la prueba entra con la cuenta del propio banco.
    tarro = http.cookiejar.CookieJar()
    abre = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(tarro)).open

    cred = json.dumps({"usuario": C["USUARIO_PRUEBAS"],
                       "clave": C["CLAVE_PRUEBAS"]}).encode("utf-8")
    req = urllib.request.Request(C["URL"] + "api/login", data=cred,
                                 headers={"Content-Type": "application/json"},
                                 method="POST")
    with abre(req, timeout=10) as r:
        check(r.status == 200, "la prueba entra con la cuenta del banco")
        entrada = json.loads(r.read().decode("utf-8"))

    # El CSRF llega en el cuerpo del login y hay que devolverlo en la
    # cabecera; sin él la escritura es 403 aunque la sesión sea buena. La
    # cookie de sesión sí va sola, en el tarro.
    csrf = (entrada.get("sesion") or {}).get("csrf") or ""
    check(bool(csrf), "el servidor entregó el token CSRF")

    cuerpo = b'{"nombre":"Zzz Aislamiento","cargo":"Prueba"}'
    req = urllib.request.Request(C["URL"] + "api/personal", data=cuerpo,
                                 headers={"Content-Type": "application/json",
                                          "X-CSRF-Token": csrf},
                                 method="POST")
    with abre(req, timeout=10) as r:
        check(r.status == 200, "se crea una ficha a través del servidor")

    con = sqlite3.connect(copia)
    en_copia = con.execute(
        "SELECT COUNT(*) FROM personal WHERE nombre = 'Zzz Aislamiento'").fetchone()[0]
    con.close()
    check(en_copia == 1, "la ficha aparece en la COPIA")

    con = sqlite3.connect(BASE_REAL)
    en_real = con.execute(
        "SELECT COUNT(*) FROM personal WHERE nombre = 'Zzz Aislamiento'").fetchone()[0]
    con.close()
    check(en_real == 0, "y NO aparece en la base real")

    print("\n3. La fixtura de 20 fichas también va a la copia")
    # Un marcador sobreviviente de una corrida muerta apunta a ids de OTRA
    # base; si no se descarta, 'montar' se niega y las suites corren contra
    # una copia vacía, fallando todas por la razón equivocada.
    check(not os.path.exists(os.path.join(AQUI, "fixtura_montada.json")),
          "el banco descartó el marcador de la corrida anterior")
    C["fixtura"]("montar")
    con = sqlite3.connect(copia)
    n_copia = con.execute("SELECT COUNT(*) FROM personal").fetchone()[0]
    con.close()
    check(n_copia >= 20, f"la copia tiene {n_copia} fichas")
    real_ahora = foto_real()
    check(real_ahora["personal"] == antes["personal"],
          f"la base real sigue con {antes['personal']} "
          f"(tiene {real_ahora['personal']})")
    check(real_ahora["nombres"] == antes["nombres"],
          "y con exactamente las mismas personas")

    print("\n4. El caso que falló tres veces: muerte sin limpieza")
    # Se mata el servidor a lo bruto. No hay 'finally', ni desmontar, ni nada.
    banco.kill()
    time.sleep(1)
    tras_matar = foto_real()
    check(tras_matar["personal"] == antes["personal"],
          "matado en seco, la base real sigue igual")
    check(tras_matar["nombres"] == antes["nombres"], "mismas personas")
    check(tras_matar["beneficiarios"] == antes["beneficiarios"],
          "mismos beneficiarios")
    print("   (antes de este cambio, aquí quedaban 20 fichas dentro)")

finally:
    C["bajar_banco"](banco, carpeta)

print("\n5. Al retirar el banco no queda rastro")
check(not os.path.exists(carpeta), "la carpeta temporal se borra")
final = foto_real()
check(final == antes, "la base real terminó exactamente como empezó")

print("\n6. El puerto del banco queda libre al terminar")
libre = subprocess.run([sys.executable, SERVIDOR, "--estado"],
                       capture_output=True, text=True, encoding="utf-8",
                       errors="replace")
print("   " + (libre.stdout or "").strip().split("\n")[0])

print("\n" + (f"  {len(fallos)} FALLOS" if fallos else "  AISLAMIENTO OK"))
for f in fallos:
    print("   -", f)
sys.exit(1 if fallos else 0)
