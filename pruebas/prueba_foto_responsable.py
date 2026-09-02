# -*- coding: utf-8 -*-
"""La foto del tutor, de punta a punta y sobre una COPIA.

Lo que de verdad importa comprobar aquí no es que "se sube una foto", sino
las cuatro cosas que se prometieron y que nadie miraría a ojo: que la foto
girada del móvil se endereza, que una foto enorme se reduce, que los
metadatos —incluida la ubicación GPS— no llegan al disco, y que reemplazar
la foto no deja el archivo viejo tirado ocupando espacio.
"""
import os
import io, os, shutil, sys, tempfile, pathlib
sys.stdout.reconfigure(encoding="utf-8")
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RAIZ, "backend"))

copia_dir = pathlib.Path(tempfile.mkdtemp())
copia = copia_dir / "foto.db"
shutil.copy2(os.path.join(RAIZ, "data", "rrhh.db"), copia)
os.environ["DB_PATH"] = str(copia)
import config; config.DB_PATH = str(copia)
# Las fotos de la prueba tampoco tocan la carpeta real.
config.FOTOS_DIR = str(copia_dir / "fotos")
import db; db.config.DB_PATH = str(copia)
db.iniciar()
import fotos; fotos.config.FOTOS_DIR = config.FOTOS_DIR
import app as A
import ayuda_sesion

from PIL import Image

fallos = []
def check(c, m):
    print(("  OK    " if c else "  FALLO ") + m)
    if not c: fallos.append(m)


def imagen(ancho, alto, orientacion=None, con_gps=False, formato="JPEG"):
    """Una foto de prueba, opcionalmente girada y con ubicación, como las del móvil."""
    img = Image.new("RGB", (ancho, alto), (60, 120, 180))
    # Una franja para poder distinguir arriba de abajo tras enderezarla.
    for x in range(ancho):
        for y in range(min(alto // 8, alto)):
            img.putpixel((x, y), (240, 240, 240))
    buf = io.BytesIO()
    kw = {}
    if orientacion or con_gps:
        ex = Image.Exif()
        if orientacion:
            ex[274] = orientacion          # 274 = Orientation
        if con_gps:
            # La ubicación va en su propio bloque dentro del EXIF, no como
            # una etiqueta suelta.
            gps = ex.get_ifd(0x8825)
            gps[1] = "S"                                  # hemisferio
            gps[2] = (12.0, 2.0, 0.0)                     # grados, minutos, segundos
        kw["exif"] = ex.tobytes()
    img.save(buf, format=formato, **kw)
    return buf.getvalue()


print("0. Una ficha de tutor sobre la que trabajar")
cli = ayuda_sesion.cliente(A.app)
rid = db.crear_responsable({"nombre": "Zzz Tutor Con Foto", "documento": "ZZF-1",
                            "telefono": "977000333"})
check(bool(rid), f"responsable de prueba creado · id {rid}")

print("\n1. Sin foto, la ficha lo dice y no inventa una")
r = cli.get(f"/api/responsables/{rid}/foto")
check(r.status_code == 404, f"pedir la foto de quien no tiene devuelve 404 ({r.status_code})")

print("\n2. Se sube una foto girada, enorme y con ubicación GPS")
datos = imagen(3000, 2000, orientacion=6, con_gps=True)
print(f"   original: 3000x2000 · {len(datos)//1024} KB · girada 90° · con GPS")
r = cli.post(f"/api/responsables/{rid}/foto",
             data={"foto": (io.BytesIO(datos), "IMG_0421.JPG")},
             content_type="multipart/form-data")
check(r.status_code == 200, f"la subida responde 200 ({r.status_code})")
ficha = (r.get_json() or {}).get("responsable") or {}
print("   guardada:", ficha.get("foto_ancho"), "x", ficha.get("foto_alto"),
      "·", (ficha.get("foto_tam") or 0)//1024, "KB ·", ficha.get("foto_mime"))

check(max(ficha.get("foto_ancho") or 0, ficha.get("foto_alto") or 0) == 1024,
      "se redujo a 1024 px de lado mayor")
check((ficha.get("foto_tam") or 0) < len(datos),
      "pesa menos que el original")
check(ficha.get("foto_mime") == "image/jpeg", "se guardó como JPG")

print("\n3. Lo guardado en disco está limpio y derecho")
ruta = fotos.ruta_de(ficha.get("foto"))
check(bool(ruta), "el archivo existe en la carpeta de fotos")
guardada = Image.open(ruta)
# La original es apaisada (3000x2000) con la marca "girar 90°": aplicada,
# debe quedar vertical. Si saliera apaisada, la marca se habría ignorado.
check(guardada.height > guardada.width,
      f"la orientación se aplicó: quedó vertical ({guardada.width}x{guardada.height})")
ex = guardada.getexif()
check(not ex.get(34853), "sin ubicación GPS")
check(not ex.get(274) or ex.get(274) == 1, "sin la marca de giro, ya no hace falta")
# Abrirla la deja abierta, y en Windows un archivo abierto no se puede
# reemplazar: sin este cierre el paso 5 falla por culpa de la prueba.
guardada.close()

print("\n4. Se puede ver desde la ficha")
r = cli.get(f"/api/responsables/{rid}/foto")
check(r.status_code == 200, f"la foto se sirve ({r.status_code})")
check(r.headers.get("Content-Type", "").startswith("image/"),
      f"como imagen ({r.headers.get('Content-Type')})")
# Sin esto el archivo sigue abierto y Windows no deja reemplazarlo: es
# cosa del cliente de pruebas, no del servidor, que cierra al responder.
r.close()

print("\n5. Reemplazarla no deja basura en el disco")
vieja = ficha.get("foto")
r = cli.post(f"/api/responsables/{rid}/foto",
             data={"foto": (io.BytesIO(imagen(800, 800)), "otra.png")},
             content_type="multipart/form-data")
nueva = ((r.get_json() or {}).get("responsable") or {}).get("foto")
check(nueva and nueva != vieja, "la ficha apunta a la foto nueva")
check(fotos.ruta_de(vieja) is None, "la anterior se borró del disco")

print("\n6. Lo que no es una foto se rechaza con un motivo entendible")
r = cli.post(f"/api/responsables/{rid}/foto",
             data={"foto": (io.BytesIO(b"esto no es una imagen"), "virus.jpg")},
             content_type="multipart/form-data")
check(r.status_code == 400, f"no se acepta ({r.status_code})")
msg = (r.get_json() or {}).get("error", "")
print("   dice:", msg)
check("imagen" in msg.lower(), "y explica qué pasó, sin jerga")
check(((db.responsable(rid) or {}).get("foto")) == nueva,
      "la foto buena sigue en su sitio tras el intento fallido")

r = cli.post(f"/api/responsables/{rid}/foto",
             data={"foto": (io.BytesIO(b"x" * (fotos.MAX_BYTES + 1)), "gigante.jpg")},
             content_type="multipart/form-data")
check(r.status_code == 400, f"una foto por encima del tope tampoco ({r.status_code})")

print("\n7. Quitarla conserva la ficha entera")
r = cli.delete(f"/api/responsables/{rid}/foto")
check(r.status_code == 200, f"se quita ({r.status_code})")
tras = db.responsable(rid) or {}
check(not tras.get("foto"), "la ficha queda sin foto")
check(tras.get("nombre") == "Zzz Tutor Con Foto" and tras.get("telefono") == "977000333",
      "y con todos sus datos intactos")
check(fotos.ruta_de(nueva) is None, "el archivo se fue con ella")

print("\n8. La misma puerta que usará el formulario público")
# El día que la foto llegue de Drive no habrá objeto de navegador: solo bytes.
meta = fotos.aceptar(imagen(1500, 1200), "desde-drive.jpg")
check(meta.get("foto_mime") == "image/jpeg" and max(meta["foto_ancho"], meta["foto_alto"]) == 1024,
      "aceptar() trata unos bytes sueltos igual que una subida del navegador")
fotos.borrar(meta["foto"])

print()
print("FALLOS: " + str(len(fallos)) if fallos else "FOTO DEL RESPONSABLE OK")
for f in fallos: print("  - " + f)
shutil.rmtree(copia_dir, ignore_errors=True)
sys.exit(1 if fallos else 0)
