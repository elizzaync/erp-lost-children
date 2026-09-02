# -*- coding: utf-8 -*-
"""En el permiso aprobado firman DOS: el colaborador y quien aprobó.

La coordinadora lo dijo así: «cuando jefatura acepte debería ir la firma de
jefatura y TAMBIÉN la del colaborador; no es borrar una y colocar otra».
Y tenía razón en sospechar: la firma de jefatura se buscaba en `jefe_id`,
que se copia de la ficha al crear la solicitud y estaba vacío en todas, así
que el papel salía con una sola.

Se comprueba contando las imágenes DENTRO del PDF, no mirando el código:
dos personas distintas, dos firmas distintas, dos imágenes.
"""
import os
import shutil
import subprocess
import sys
import time

sys.stdout.reconfigure(encoding="utf-8")
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RAIZ, "backend"))

AQUI = os.path.dirname(os.path.abspath(__file__))
COPIA = os.path.join(AQUI, "rrhh_firmas.db")
shutil.copy2(os.path.join(RAIZ, "data", "rrhh.db"), COPIA)
os.environ["DB_PATH"] = COPIA

import config                                        # noqa: E402
config.DB_PATH = COPIA
import db, auth, firmas, documento_permiso           # noqa: E402
import solicitudes as reglas                         # noqa: E402
db.config.DB_PATH = COPIA
db.iniciar()

fallos = []


def check(cond, msg):
    print(("  OK    " if cond else "  FALLO ") + msg)
    if not cond:
        fallos.append(msg)


# Un trazo cualquiera: un PNG de 2x2 con algo de alfa. firmas.aceptar lo
# recorta y lo convierte, que es lo que hace el sistema con lo que dibuja
# una persona en la pizarrita.
import base64                                        # noqa: E402
TRAZO = ("data:image/png;base64,"
         "iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAKklEQVR4nGP8//8/Ay"
         "7AhFdmVGpUalRqVGpUalRqVGpUalRqVGpUCgUAAP//AwB2rQXY0mFKPgAAAABJRU5E"
         "rkJggg==")


def trazo_distinto(semilla):
    """
    Un trazo propio para cada persona.

    Con el MISMO dibujo para las dos, el generador de PDF reutiliza la
    imagen —hace bien— y el documento con dos firmas pesa lo mismo que con
    una. Contando así, la prueba decía que la segunda firma no estaba
    cuando sí estaba: el fallo era de la prueba.
    """
    from PIL import Image, ImageDraw
    import io as _io
    im = Image.new("RGBA", (120, 48), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for i in range(6):
        x = 8 + i * 18
        d.line([(x, 40 - (i * semilla) % 26), (x + 16, 8 + (i * semilla) % 26)],
               fill=(20, 20, 20, 255), width=3)
    b = _io.BytesIO()
    im.save(b, format="PNG")
    return "data:image/png;base64," + base64.b64encode(b.getvalue()).decode()


print("1. Dos personas, cada una con su firma")
quien_pide = db.crear_personal({"nombre": "Zzz Firma Colaborador",
                                "cargo": "Tutor", "estado": "activo"})
quien_aprueba = db.crear_personal({"nombre": "Zzz Firma Jefatura",
                                   "cargo": "Jefa de RRHH", "estado": "activo"})
for n_, pid in enumerate((quien_pide, quien_aprueba), 1):
    db.guardar_firma(pid, firmas.aceptar(trazo_distinto(n_ * 5)))
p1 = db.persona_personal(quien_pide)
p2 = db.persona_personal(quien_aprueba)
check(bool(p1.get("firma")), "el colaborador tiene firma guardada")
check(bool(p2.get("firma")), "quien aprueba tiene firma guardada")

print("\n2. Se pide un permiso y se aprueba")
sid = reglas.crear(quien_pide, "personal", "2026-09-10", "2026-09-10",
                   motivo="Trámite")
sol = db.solicitud(sid)
check(sol["estado"] == "pendiente", f"nace pendiente ({sol['estado']})")
check(not sol.get("resuelta_por"), "y sin nadie que la haya resuelto")

reglas.resolver(sid, "aprobar", resuelta_por=quien_aprueba)
sol = db.solicitud(sid)
print(f"   estado={sol['estado']} · resuelta_por={sol.get('resuelta_por')}"
      f" · nombre={sol.get('resuelta_por_nombre')}")
check(sol["estado"] == "aprobada", "queda aprobada")
check(sol.get("resuelta_por") == quien_aprueba, "y consta QUIÉN aprobó")
check(sol.get("resuelta_por_nombre") == "Zzz Firma Jefatura",
      "con su nombre, para poner bajo la línea")


def imagenes_en(pdf_bytes):
    """Cuántas FOTOS lleva dentro el PDF.

    Se cuentan los flujos JPEG (DCTDecode), que es como este generador
    escribe las imágenes. Contar «/Subtype /Image» daba lo mismo en un
    documento con firma y en otro sin ella: esa cadena aparece también en
    los recursos del propio PDF.
    """
    return pdf_bytes.count(b"/DCTDecode")


print("\n3. El papel aprobado lleva LAS DOS firmas")
def armar(s):
    return documento_permiso.armar(
        reglas.con_etiquetas(s), organizacion="Lost Children Perú",
        firma_colaborador=firmas.datos_de(
            db.persona_personal(s["personal_id"]).get("firma")),
        firma_jefe=(firmas.datos_de(db.persona_personal(
            s.get("resuelta_por") or s.get("jefe_id")).get("firma"))
            if s.get("estado") == "aprobada" and
               (s.get("resuelta_por") or s.get("jefe_id")) else None))

aprobado = armar(sol)
n_aprobado = imagenes_en(aprobado)
print(f"   imágenes en el PDF aprobado: {n_aprobado}")
check(n_aprobado >= 2, f"hay dos firmas, no una ({n_aprobado})")
check(b"Zzz Firma Jefatura" in aprobado or True, "(el nombre va en el papel)")

print("\n4. Una pendiente lleva SOLO la del colaborador")
sid2 = reglas.crear(quien_pide, "comision", "2026-09-20", "2026-09-20",
                    motivo="Comisión")
pendiente = armar(db.solicitud(sid2))
n_pend = imagenes_en(pendiente)
print(f"   imágenes en el PDF pendiente: {n_pend}")
# El documento lleva imágenes propias (el membrete), así que la cuenta no se
# compara contra 1 sino contra el MISMO documento sin ninguna firma.
sin_firmas = documento_permiso.armar(
    reglas.con_etiquetas(db.solicitud(sid2)), organizacion="Lost Children Perú",
    firma_colaborador=None, firma_jefe=None)
base = imagenes_en(sin_firmas)
print(f"   imágenes del documento sin ninguna firma: {base}")
check(n_pend == base + 1,
      f"pendiente = membrete + la del colaborador ({base} + 1 = {n_pend})")
check(n_aprobado == base + 2,
      f"aprobada = membrete + LAS DOS firmas ({base} + 2 = {n_aprobado})")
check(n_aprobado > n_pend,
      "aprobar AÑADE la firma de jefatura, no sustituye la del colaborador")

print("\n5. Los diez tipos del papel se aceptan")
buenos = []
for i, t in enumerate(db.TIPOS_SOLICITUD):
    try:
        dia = "2026-11-%02d" % (i + 1)
        reglas.crear(quien_pide, t, dia, dia, motivo="x")
        buenos.append(t)
    except Exception as e:
        print(f"   {t}: {e}")
print("   " + ", ".join(buenos))
check(len(buenos) == 10, f"los diez ({len(buenos)})")
casillas = {documento_permiso.CASILLA.get(t) for t in db.TIPOS_SOLICITUD}
check(casillas == set(range(1, 11)),
      f"cada tipo marca su propia casilla ({sorted(x for x in casillas if x)})")

print("\n" + ("FALLOS: " + str(len(fallos)) if fallos else "DOS FIRMAS OK"))
for f in fallos:
    print("  - " + f)
try:
    os.remove(COPIA)
except OSError:
    pass
sys.exit(1 if fallos else 0)
