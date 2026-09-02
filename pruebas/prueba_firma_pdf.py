# -*- coding: utf-8 -*-
"""¿Está la firma DENTRO del PDF?

La prueba de navegador se conformaba con que el archivo pesara más, y
pesaba más por el texto de la resolución: 25 bytes. Una firma incrustada
son kilobytes. Aquí se cuentan las imágenes del PDF, que es la pregunta
de verdad.

El papel lleva siempre dos imágenes —el logo y la filigrana—. Con la
firma del colaborador, tres. Con la del jefe además, cuatro. Y una
solicitud pendiente NO debe llevar la del jefe, por muy guardada que la
tenga: nadie la ha aprobado.
"""
import io
import os
import sys

sys.stdout.reconfigure(encoding="utf-8")
RUTA = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend")
sys.path.insert(0, RUTA)

fallos = []


def check(ok, que):
    print(("  OK    " if ok else "  FALLO ") + que)
    if not ok:
        fallos.append(que)


AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)


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
    COPIA = C["ENTORNO"]["DB_PATH"]
else:
    banco = carpeta = None
    COPIA = os.environ["DB_PATH"]

try:
    os.environ["DB_PATH"] = COPIA
    import db
    import firmas
    import solicitudes as reglas
    import documento_permiso as dp
    from PIL import Image
    from pypdf import PdfReader

    db.iniciar()

    def trazo(ancho=300):
        """Una firma de mentira, pero una imagen de verdad."""
        im = Image.new("RGBA", (ancho, 90), (0, 0, 0, 0))
        px = im.load()
        for x in range(20, ancho - 20):
            for dy in (-1, 0, 1):
                y = 45 + int(18 * ((x % 40) - 20) / 20) + dy
                if 0 <= y < 90:
                    px[x, y] = (10, 10, 10, 255)
        buf = io.BytesIO()
        im.save(buf, "PNG")
        import base64
        return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()

    jefe = db.crear_personal({"nombre": "Zzz Jefa Que Firma", "cargo": "Coordinadora",
                              "area": "Programas", "vinculo": "planilla",
                              "fecha_ingreso": "2023-01-02"})
    quien = db.crear_personal({"nombre": "Zzz Quien Pide", "cargo": "Educador",
                               "area": "Programas", "vinculo": "planilla",
                               "fecha_ingreso": "2024-03-01", "jefe_id": jefe})
    db.guardar_firma(jefe, firmas.aceptar(trazo(320)))
    db.guardar_firma(quien, firmas.aceptar(trazo(280)))
    print("personas:", quien, "· jefa:", jefe)

    def imagenes(sol, con_jefe):
        datos = dp.armar(
            reglas.con_etiquetas(sol),
            firma_colaborador=firmas.datos_de(db.persona_personal(quien)["firma"]),
            firma_jefe=(firmas.datos_de(db.persona_personal(jefe)["firma"])
                        if con_jefe else None))
        r = PdfReader(io.BytesIO(datos))
        return len(list(r.pages[0].images)), datos

    sid = reglas.crear(quien, "personal", "2026-12-01", "2026-12-01",
                       motivo="Zzz prueba de firma")
    sid = sid["id"] if isinstance(sid, dict) else sid

    print("\n1. Pendiente: firma del colaborador, no la del jefe")
    n, datos = imagenes(db.solicitud(sid), con_jefe=False)
    print("   imágenes en el PDF:", n)
    check(n == 3, f"logo, filigrana y la firma de quien pide ({n})")
    open(os.path.join(AQUI, "firma-pendiente.pdf"), "wb").write(datos)

    print("\n2. Aprobada: también la del jefe")
    reglas.resolver(sid, "aprobar", "Conforme.")
    sol = db.solicitud(sid)
    check(sol["estado"] == "aprobada", "la solicitud está aprobada")
    n2, datos2 = imagenes(sol, con_jefe=True)
    print("   imágenes en el PDF:", n2)
    check(n2 == 4, f"y ahora son cuatro, con la firma de la jefa ({n2})")
    check(len(datos2) - len(datos) > 2000,
          f"el archivo crece lo que pesa una firma ({len(datos2) - len(datos)} bytes)")
    open(os.path.join(AQUI, "firma-aprobada.pdf"), "wb").write(datos2)

    print("\n3. Una firma vacía no se guarda")
    vacia = Image.new("RGBA", (300, 90), (0, 0, 0, 0))
    buf = io.BytesIO(); vacia.save(buf, "PNG")
    import base64
    try:
        firmas.aceptar("data:image/png;base64,"
                       + base64.b64encode(buf.getvalue()).decode())
        check(False, "se aceptó un lienzo en blanco")
    except firmas.FirmaError as e:
        check("No se dibujó" in str(e), f"se rechaza con motivo claro: «{e}»")

    print("\n4. Y lo que no es una imagen, tampoco")
    for malo, que in (("hola", "texto suelto"),
                      ("data:image/png;base64,%%%", "base64 rota")):
        try:
            firmas.aceptar(malo)
            check(False, f"se aceptó {que}")
        except firmas.FirmaError:
            check(True, f"se rechaza {que}")

finally:
    if propio:
        C["bajar_banco"](banco, carpeta)

print("\n" + ("FALLOS: %d" % len(fallos) if fallos else "FIRMA EN EL PDF OK"))
for f in fallos:
    print("  - " + f)
sys.exit(1 if fallos else 0)
