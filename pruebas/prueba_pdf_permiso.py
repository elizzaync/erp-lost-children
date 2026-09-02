# -*- coding: utf-8 -*-
"""El PDF del permiso, contra un servidor de verdad.

No se comprueba que la función devuelva bytes: eso ya lo dice el tipo. Se
comprueba que el servidor lo entregue, que el archivo sea un PDF que un
lector sepa abrir, y que dentro esté escrito lo que la solicitud dice —con
sus tildes, y con el estado correcto en cada momento.

Las dos situaciones que importan son distintas: una pendiente sale como
hoja para firmar, y una aprobada tiene que llevar impreso quién la aprobó.
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


# Dentro de la corrida completa el banco ya está en pie y el corredor pasa
# su base por el entorno; levantar otro dejaría dos servidores peleando por
# el mismo puerto. Suelta, la suite se monta el suyo.
propio = not (os.environ.get("DB_PATH") and os.environ.get("URL_PRUEBAS"))
if propio:
    C = cargar_corredor()
    banco, carpeta = C["levantar_banco"]()
    BASE = C["ENTORNO"]["URL_PRUEBAS"]
    COPIA = C["ENTORNO"]["DB_PATH"]
else:
    banco = carpeta = None
    BASE = os.environ["URL_PRUEBAS"]
    COPIA = os.environ["DB_PATH"]
    print("banco heredado del corredor:", BASE)

try:
    # ── Una persona y dos solicitudes, puestas directamente en la copia ──
    sys.path.insert(0, os.path.join(
        os.path.dirname(os.path.dirname(AQUI)), "backend"))
    os.environ["DB_PATH"] = COPIA
    ruta_backend = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend")
    sys.path.insert(0, ruta_backend)
    import db
    db.RUTA = COPIA if hasattr(db, "RUTA") else None
    db.iniciar()

    pid = db.crear_personal({
        "nombre": "Zzz Ángel Ñuño Ríos", "cargo": "Educador",
        "area": "Programas", "vinculo": "planilla",
        "fecha_ingreso": "2024-03-01", "documento": "70123456"})
    print("persona de prueba:", pid)

    import solicitudes as reglas

    pendiente = reglas.crear(pid, "medico", "2026-09-01", "2026-09-03",
                             motivo="Cita médica con citación adjunta",
                             hora_desde="08:00", hora_hasta="12:30")
    aprobada = reglas.crear(pid, "personal", "2026-09-10", "2026-09-10",
                            motivo="Trámite familiar")
    id_pend = pendiente["id"] if isinstance(pendiente, dict) else pendiente
    id_apro = aprobada["id"] if isinstance(aprobada, dict) else aprobada
    reglas.resolver(id_apro, "aprobar", "Conforme, coordinado con el equipo.")
    print("solicitudes:", id_pend, "pendiente ·", id_apro, "aprobada")

    # ── Entrar y bajarse los dos documentos ──────────────────────────────
    s = requests.Session()
    r = s.post(BASE + "/api/login", json={
        "usuario": os.environ.get("USUARIO_PRUEBAS", "banco.pruebas"),
        "clave": os.environ.get("CLAVE_PRUEBAS", "banco-de-pruebas-2026")},
        timeout=10)
    check(r.status_code == 200, f"se entra al sistema ({r.status_code})")

    from pypdf import PdfReader

    def bajar(id_, que):
        r = s.get(f"{BASE}/api/permisos/{id_}/documento.pdf", timeout=15)
        check(r.status_code == 200, f"{que}: el servidor lo entrega ({r.status_code})")
        if r.status_code != 200:
            print("     " + r.text[:160])
            return ""
        check(r.headers.get("Content-Type", "").startswith("application/pdf"),
              f"{que}: lo manda como PDF")
        check(r.content[:5] == b"%PDF-", f"{que}: el archivo empieza por %PDF")
        lector = PdfReader(io.BytesIO(r.content))
        texto = "\n".join(p.extract_text() or "" for p in lector.pages)
        check(len(lector.pages) >= 1, f"{que}: tiene {len(lector.pages)} página(s)")
        abierto = os.path.join(AQUI, f"permiso-{que}.pdf")
        open(abierto, "wb").write(r.content)
        return texto

    print("\n1. La pendiente sale como hoja para firmar")
    t = bajar(id_pend, "pendiente")
    check("AUTORIZACIÓN AL PERSONAL" in t, "es el formato de la casa")
    check("Zzz Ángel Ñuño Ríos" in t, "lleva el nombre con sus tildes y su ñ")
    check("Nombre del Colaborador" in t, "con el rótulo del formato")
    check("Programas" in t and "Educador" in t, "el área y el puesto")

    print("   los diez tipos, y uno solo marcado")
    for n, etiqueta in ((1, "Permiso personal"), (2, "Comisión de Trabajo"),
                        (3, "Cita Essalud / Clínica"),
                        (4, "Permanencia Capacitación"),
                        (5, "Permanencia Extra (H)"), (6, "Recuperación (H)"),
                        (7, "Vacaciones"), (8, "Día(s) Libre(s)"),
                        (9, "Transferencia"), (10, "Otros")):
        if not (f"({n}) {etiqueta}" in t):
            check(False, f"falta el tipo ({n}) {etiqueta}")
    check(all(f"({n})" in t for n in range(1, 11)), "están los diez numerados")
    # El nombre de prueba no lleva ninguna X, así que la única del documento
    # tiene que ser el aspa de la casilla marcada.
    check(t.count("X") == 1, f"hay un aspa y solo uno (hay {t.count('X')})")

    check("01/09/2026" in t and "03/09/2026" in t, "las fechas del periodo")
    check("3 días" in t, "el total de días")
    check("08:00" in t and "12:30" in t, "el horario de inicio y fin")
    check("Cita médica" in t, "la nota con el motivo")
    check("SUSTENTO" in t, "el recuadro de sustento")
    check("Firmas del personal" in t and "Colaborador" in t
          and "Jefe Inmediato" in t, "las dos firmas, con sus rótulos")
    check("Pendiente de aprobación en el sistema" in t,
          "y dice que está pendiente")
    check("Aprobada en el sistema" not in t,
          "sin dar por aprobado lo que nadie aprobó")

    print("\n2. La aprobada lleva impreso quién la aprobó")
    t = bajar(id_apro, "aprobada")
    check("Aprobada en el sistema por" in t, "dice quién la aprobó")
    check("Conforme, coordinado con el equipo." in t, "y la nota que se escribió")
    check("Pendiente de aprobación" not in t, "y ya no se llama pendiente")
    check("(1) Permiso personal" in t, "sigue llevando los diez tipos")

    print("\n3. Quien no ha entrado no se lo puede bajar")
    anon = requests.Session()
    r = anon.get(f"{BASE}/api/permisos/{id_apro}/documento.pdf", timeout=10)
    check(r.status_code == 403, f"sin sesión responde 403 ({r.status_code})")

    print("\n4. Una solicitud que no existe")
    r = s.get(f"{BASE}/api/permisos/999999/documento.pdf", timeout=10)
    check(r.status_code == 404, f"responde 404 ({r.status_code})")
    check("json" in r.headers.get("Content-Type", ""),
          "y en JSON, no en una página de error de Flask")

finally:
    if propio:
        C["bajar_banco"](banco, carpeta)

print("\n" + ("FALLOS: %d" % len(fallos) if fallos else "PDF DEL PERMISO OK"))
for f in fallos:
    print("  - " + f)
sys.exit(1 if fallos else 0)
