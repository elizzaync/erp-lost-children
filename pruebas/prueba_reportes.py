# -*- coding: utf-8 -*-
"""Los reportes: que salgan, que filtren y que no los vea cualquiera.

Lo que puede fallar de verdad no es que el PDF se genere —eso lo dice el
tipo del valor— sino:

  · que el filtro NO viaje, y el papel liste a todos aunque la pantalla
    mostrara a uno. Se comprueba contando registros con y sin filtro.
  · que la línea de «Filtros aplicados» no aparezca, y meses después nadie
    pueda saber de qué era ese papel.
  · que se entreguen sin sesión.
"""
import io
import os
import sys

import requests

sys.stdout.reconfigure(encoding="utf-8")
AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)

fallos = []


def check(ok, que):
    print(("  OK    " if ok else "  FALLO ") + que)
    if not ok:
        fallos.append(que)


def cargar_corredor():
    ruta = os.path.join(AQUI, "correr_todo.py")
    fuente = open(ruta, encoding="utf-8").read()
    corte = fuente.index("barrer_zzz()\n\nbanco")
    mod = {"__name__": "corredor_parcial", "__file__": ruta}
    exec(compile(fuente[:corte], ruta, "exec"), mod)
    return mod


propio = not (os.environ.get("DB_PATH") and os.environ.get("URL_PRUEBAS"))
if propio:
    C = cargar_corredor()
    banco, carpeta = C["levantar_banco"]()
    BASE = C["ENTORNO"]["URL_PRUEBAS"]
else:
    banco = carpeta = None
    BASE = os.environ["URL_PRUEBAS"]

try:
    if propio:
        C["fixtura"]("montar")
    from pypdf import PdfReader

    s = requests.Session()
    r = s.post(BASE + "/api/login", json={
        "usuario": os.environ.get("USUARIO_PRUEBAS", "banco.pruebas"),
        "clave": os.environ.get("CLAVE_PRUEBAS", "banco-de-pruebas-2026")},
        timeout=10)
    check(r.status_code == 200, f"se entra al sistema ({r.status_code})")
    # Toda escritura identificada exige el token; llega en el cuerpo del
    # login, no en una cookie.
    csrf = ((r.json() if r.status_code == 200 else {}) or {}).get("sesion", {}).get("csrf", "")

    def bajar(modulo, **filtros):
        r = s.get(f"{BASE}/api/reportes/{modulo}.pdf", params=filtros, timeout=25)
        if r.status_code != 200:
            return r.status_code, "", 0
        texto = "\n".join(p.extract_text() or ""
                          for p in PdfReader(io.BytesIO(r.content)).pages)
        # «N registros» al final dice cuántas filas se imprimieron.
        import re
        m = re.search(r"(\d+)\s+registros?", texto)
        return r.status_code, texto, int(m.group(1)) if m else -1

    print("\n1. Los siete módulos entregan su PDF")
    cuantos = {}
    for m in ("personal", "beneficiarios", "responsables", "permisos",
              "asistencia", "usuarios", "respuestas"):
        est, texto, n = bajar(m)
        cuantos[m] = n
        check(est == 200, f"{m}: responde 200 ({est})")
        check(n >= 0, f"{m}: dice cuántos registros imprimió ({n})")

    print("\n2. Llevan la línea que permite comprobarlos después")
    est, texto, n = bajar("personal")
    check("Filtros aplicados" in texto, "dice qué filtros se aplicaron")
    check("Generado el" in texto, "y cuándo se generó")
    check("Lost Children" in texto, "con el nombre de la organización")

    print("\n3. El filtro VIAJA: el papel coincide con la pantalla")
    # Antes buscaba «Mariela», una persona real de la base. Sola pasaba
    # —monta su propia fixtura— y dentro de la corrida no, porque ahí el
    # banco trae lo que le hayan dejado las suites anteriores. Una prueba
    # no puede depender de que exista una persona concreta: se crea la
    # suya, con un cargo que no se parece a nada, y se retira al acabar.
    NOMBRE = "Zzz Reporte Filtro"
    CARGO = "Cargo Inventado Qwzx"
    r = s.post(BASE + "/api/personal", json={"nombre": NOMBRE, "cargo": CARGO},
               headers={"X-CSRF-Token": csrf}, timeout=15)
    creado = (r.json() or {}).get("id") if r.status_code == 200 else None
    check(bool(creado), f"se crea la ficha para filtrar ({r.status_code})")

    est, texto, todos = bajar("personal")
    est2, texto2, filtrados = bajar("personal", busca=NOMBRE)
    print(f"   sin filtro: {todos} · con «{NOMBRE}»: {filtrados}")
    check(filtrados < todos, f"filtrar recorta el reporte ({todos} → {filtrados})")
    check(filtrados == 1, f"y encuentra a alguien: exactamente una ({filtrados})")
    # El cargo NO aparece en la línea de «Filtros aplicados», así que
    # encontrarlo prueba que la fila salió impresa de verdad. Comprobar el
    # nombre no probaba nada: el nombre está en esa línea igualmente.
    check(CARGO in texto2.replace("\n", " "), "quien sale es quien se buscó")
    check("busca: " + NOMBRE in texto2, "y el papel dice que se filtró por eso")

    if creado:
        s.delete(f"{BASE}/api/personal/{creado}",
                 headers={"X-CSRF-Token": csrf}, timeout=15)

    print("\n4. Un filtro sin resultados no imprime la lista entera")
    est3, texto3, ninguno = bajar("personal", busca="qqzzxx")
    check(ninguno == 0, f"cero registros ({ninguno})")
    check("No hay nada que listar" in texto3, "y lo dice en el papel")

    print("\n5. Los permisos también filtran por estado")
    est, _, tot = bajar("permisos")
    est, _, pend = bajar("permisos", estado="pendiente")
    print(f"   todas: {tot} · pendientes: {pend}")
    check(pend <= tot, "el filtro de estado se aplica")

    print("\n6. Sin sesión no se entrega ninguno")
    anon = requests.Session()
    for m in ("personal", "beneficiarios", "respuestas"):
        r = anon.get(f"{BASE}/api/reportes/{m}.pdf", timeout=15)
        check(r.status_code in (401, 403),
              f"{m}: sin sesión responde {r.status_code}")

    print("\n7. Un módulo que no existe")
    r = s.get(f"{BASE}/api/reportes/inventado.pdf", timeout=10)
    check(r.status_code == 404, f"responde 404 ({r.status_code})")
    check("json" in r.headers.get("Content-Type", ""), "y en JSON")

finally:
    if propio:
        try:
            C["fixtura"]("desmontar")
        finally:
            C["bajar_banco"](banco, carpeta)

print("\n" + ("FALLOS: %d" % len(fallos) if fallos else "REPORTES OK"))
for f in fallos:
    print("  - " + f)
sys.exit(1 if fallos else 0)
