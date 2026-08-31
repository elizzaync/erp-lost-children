# -*- coding: utf-8 -*-
"""Un PDF de verdad, sin instalar nada.

POR QUÉ ESCRITO A MANO

Para generar PDF hay librerías buenas —reportlab, weasyprint— y ninguna
está instalada. Añadirlas significa pedirle a quien despliegue esto que
instale un paquete más, y weasyprint arrastra media distribución en
Windows. Un permiso es una hoja con texto, dos rayas y dos líneas de
firma; eso cabe en un archivo PDF escrito directamente.

Lo que hay aquí es el mínimo del formato: catálogo, páginas, un flujo de
contenido por página y las dos fuentes que todo lector trae de fábrica
(Helvetica y Helvetica-Bold). No hay imágenes, ni fuentes incrustadas, ni
compresión. El resultado lo abre cualquier lector y se puede imprimir.

LOS ACENTOS

El texto se codifica en cp1252 con WinAnsiEncoding, que cubre el español
entero: tildes, ñ, ¿, ¡, º. Lo que no cabe —una flecha, un guion largo—
se sustituye antes por su equivalente de toda la vida en vez de salir
como un cuadrito.
"""
import unicodedata
from datetime import datetime, timezone

A4 = (595.28, 841.89)

NEGRO = (0.13, 0.12, 0.11)
AZUL = (0.055, 0.239, 0.412)
GRIS = (0.49, 0.56, 0.61)
GRIS_C = (0.60, 0.65, 0.70)

# Anchos de Helvetica en milésimas de punto. Solo hacen falta para
# centrar y para partir líneas; un carácter de más o de menos no rompe
# nada, pero una línea que se sale del margen sí se ve.
_ANCHOS = {
    "normal": (
        "278 278 355 556 556 889 667 191 333 333 389 584 278 333 278 278 "
        "556 556 556 556 556 556 556 556 556 556 278 278 584 584 584 556 "
        "1015 667 667 722 722 667 611 778 722 278 500 667 556 833 722 778 "
        "667 778 722 667 611 722 667 944 667 667 611 278 278 278 469 556 "
        "333 556 556 500 556 556 278 556 556 222 222 500 222 833 556 556 "
        "556 556 333 500 278 556 500 722 500 500 500 334 260 334 584"
    ),
    "negrita": (
        "278 333 474 556 556 889 722 238 333 333 389 584 278 333 278 278 "
        "556 556 556 556 556 556 556 556 556 556 333 333 584 584 584 611 "
        "975 722 722 722 722 667 611 778 722 278 556 722 611 833 722 778 "
        "667 778 722 667 611 722 667 944 667 667 611 333 278 333 584 556 "
        "333 556 611 556 611 556 333 611 611 278 278 556 278 889 611 611 "
        "611 611 389 556 333 611 556 778 556 556 500 389 280 389 584"
    ),
}
_ANCHOS = {k: [int(x) for x in v.split()] for k, v in _ANCHOS.items()}

# Lo que cp1252 no tiene, escrito como se escribiría a mano.
_SUSTITUTOS = {"→": "-", "—": "-", "–": "-", "…": "...",
               " ": " ", "‘": "'", "’": "'",
               "“": '"', "”": '"', "•": "-"}


def _plano(txt):
    """Texto que cp1252 sí sabe escribir."""
    for malo, bueno in _SUSTITUTOS.items():
        txt = txt.replace(malo, bueno)
    salida = []
    for c in txt:
        try:
            c.encode("cp1252")
            salida.append(c)
        except UnicodeEncodeError:
            # Última red: 'ā' se convierte en 'a' antes que en un cuadrito.
            base = unicodedata.normalize("NFD", c)
            base = "".join(x for x in base if not unicodedata.combining(x))
            salida.append(base if base.isascii() and base else "?")
    return "".join(salida)


def _ancho_car(c, negrita):
    """Ancho de un carácter. Los acentuados miden como su letra base."""
    n = ord(c)
    if 32 <= n <= 126:
        return _ANCHOS["negrita" if negrita else "normal"][n - 32]
    base = unicodedata.normalize("NFD", c)
    base = "".join(x for x in base if not unicodedata.combining(x))
    if base and 32 <= ord(base[0]) <= 126:
        return _ANCHOS["negrita" if negrita else "normal"][ord(base[0]) - 32]
    return 556


def ancho(txt, tam, negrita=False):
    return sum(_ancho_car(c, negrita) for c in txt) * tam / 1000.0


def _escapar(txt):
    return (txt.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)"))


def _medir_jpeg(datos):
    """Ancho, alto y si es gris, leídos de las cabeceras del propio JPEG.

    Se lee aquí en vez de con Pillow porque un PDF necesita esos tres
    números y nada más; cargar la imagen entera para eso sería trabajo de
    balde.
    """
    i = 2
    while i < len(datos):
        if datos[i] != 0xFF:
            i += 1
            continue
        marca = datos[i + 1]
        if marca in (0xD8, 0xD9) or 0xD0 <= marca <= 0xD7:
            i += 2
            continue
        largo = int.from_bytes(datos[i + 2:i + 4], "big")
        if 0xC0 <= marca <= 0xCF and marca not in (0xC4, 0xC8, 0xCC):
            alto = int.from_bytes(datos[i + 5:i + 7], "big")
            ancho = int.from_bytes(datos[i + 7:i + 9], "big")
            componentes = datos[i + 9]
            return ancho, alto, componentes == 1
        i += 2 + largo
    raise ValueError("Eso no parece un JPEG")


class Hoja:
    """Una hoja sobre la que se escribe de arriba abajo.

    El cursor `y` baja solo. Quien dibuja no calcula coordenadas: pide
    texto, párrafos o filas y la hoja lleva la cuenta.
    """

    def __init__(self, tamano=A4, margen=56, titulo="Documento"):
        self.ancho, self.alto = tamano
        self.margen = margen
        self.titulo = titulo
        self.paginas = []
        self._ops = []
        # Las imágenes se registran una vez y se colocan las veces que haga
        # falta: la filigrana va en todas las hojas y pesa 17 KB.
        self.imagenes = []
        self.y = self.alto - margen

    # ── El lienzo ────────────────────────────────────────────────────────
    @property
    def util(self):
        return self.ancho - 2 * self.margen

    def _op(self, s):
        self._ops.append(s)

    def pagina_nueva(self):
        self.paginas.append("\n".join(self._ops))
        self._ops = []
        self.y = self.alto - self.margen

    def sitio_para(self, alto):
        """Si no cabe, empieza otra hoja. Evita textos cortados por abajo."""
        if self.y - alto < self.margen:
            self.pagina_nueva()

    def espacio(self, n):
        self.y -= n

    # ── Lo que se dibuja ─────────────────────────────────────────────────
    def texto(self, txt, tam=11, negrita=False, color=NEGRO, x=None,
              centrado=False, seguido=False):
        txt = _plano(str(txt))
        self.sitio_para(tam * 1.2)
        if x is None:
            x = self.margen
        if centrado:
            x = (self.ancho - ancho(txt, tam, negrita)) / 2
        if not seguido:
            self.y -= tam
        self._op("%.3f %.3f %.3f rg" % color)
        self._op("BT /%s %.2f Tf 1 0 0 1 %.2f %.2f Tm (%s) Tj ET"
                 % ("F2" if negrita else "F1", tam, x, self.y, _escapar(txt)))
        return x + ancho(txt, tam, negrita)

    def parrafo(self, txt, tam=11, negrita=False, color=NEGRO, x=None,
                limite=None, interlinea=1.45):
        """Texto que se parte por palabras dentro del ancho disponible."""
        txt = _plano(str(txt))
        x = self.margen if x is None else x
        limite = limite if limite is not None else self.ancho - self.margen - x
        lineas, actual = [], ""
        for palabra in txt.split():
            prueba = (actual + " " + palabra).strip()
            if actual and ancho(prueba, tam, negrita) > limite:
                lineas.append(actual)
                actual = palabra
            else:
                actual = prueba
        lineas.append(actual)
        for i, linea in enumerate(lineas):
            self.texto(linea, tam, negrita, color, x=x)
            if i < len(lineas) - 1:
                self.espacio(tam * (interlinea - 1))
        return len(lineas)

    def regla(self, grosor=0.7, color=GRIS_C, desde=None, hasta=None, y=None):
        y = self.y if y is None else y
        desde = self.margen if desde is None else desde
        hasta = (self.ancho - self.margen) if hasta is None else hasta
        self._op("%.3f %.3f %.3f RG %.2f w %.2f %.2f m %.2f %.2f l S"
                 % (color + (grosor, desde, y, hasta, y)))

    def fila(self, rotulo, valor, tam=10.5, ancho_rotulo=105, negrita=False):
        """Rótulo a la izquierda, valor a la derecha, alineados."""
        self.sitio_para(tam * 1.9)
        self.y -= tam
        self._op("%.3f %.3f %.3f rg" % GRIS)
        self._op("BT /F1 %.2f Tf 1 0 0 1 %.2f %.2f Tm (%s) Tj ET"
                 % (tam, self.margen, self.y, _escapar(_plano(str(rotulo)))))
        x = self.margen + ancho_rotulo
        self.y += tam           # el valor puede ocupar varias líneas
        self.y -= tam
        self.parrafo(valor, tam, negrita, NEGRO, x=x)
        self.espacio(tam * 0.72)

    def caja(self, x, y, ancho, alto, grosor=0.7, color=GRIS_C):
        """Un rectángulo. La `y` es la de abajo, como en el propio PDF."""
        self._op("%.3f %.3f %.3f RG %.2f w %.2f %.2f %.2f %.2f re S"
                 % (color + (grosor, x, y, ancho, alto)))

    def imagen(self, jpeg, x, y, ancho, alto):
        """Coloca un JPEG. Solo JPEG: el PDF los lleva tal cual, sin
        descomprimirlos ni recodificarlos, y así no hace falta zlib."""
        for i, (datos, _, _) in enumerate(self.imagenes):
            if datos is jpeg or datos == jpeg:
                nombre = "Im%d" % (i + 1)
                break
        else:
            ancho_px, alto_px, gris = _medir_jpeg(jpeg)
            self.imagenes.append((jpeg, (ancho_px, alto_px), gris))
            nombre = "Im%d" % len(self.imagenes)
        self._op("q %.2f 0 0 %.2f %.2f %.2f cm /%s Do Q"
                 % (ancho, alto, x, y, nombre))

    # ── El archivo ───────────────────────────────────────────────────────
    def bytes(self):
        """El PDF entero. Las páginas se cierran aquí, no antes."""
        paginas = list(self.paginas)
        if self._ops or not paginas:
            paginas.append("\n".join(self._ops))

        objetos = []                       # cada uno, ya en bytes
        n_pag = len(paginas)
        # 1 catálogo · 2 páginas · 3..n+2 páginas · resto contenidos y fuentes
        id_contenido = 3 + n_pag
        id_f1 = id_contenido + n_pag
        id_f2 = id_f1 + 1
        id_img = id_f2 + 1
        id_info = id_img + len(self.imagenes)

        objetos.append(b"<< /Type /Catalog /Pages 2 0 R >>")
        hijos = " ".join("%d 0 R" % (3 + i) for i in range(n_pag))
        objetos.append(("<< /Type /Pages /Kids [%s] /Count %d >>"
                        % (hijos, n_pag)).encode("ascii"))
        for i in range(n_pag):
            # Todas las imágenes se declaran en todas las hojas. Ocupan un
            # renglón cada una y se guardan una sola vez; separarlas por
            # hoja sería llevar una contabilidad para no ahorrar nada.
            xobj = " ".join("/Im%d %d 0 R" % (j + 1, id_img + j)
                            for j in range(len(self.imagenes)))
            objetos.append((
                "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 %.2f %.2f] "
                "/Resources << /Font << /F1 %d 0 R /F2 %d 0 R >>%s >> "
                "/Contents %d 0 R >>"
                % (self.ancho, self.alto, id_f1, id_f2,
                   (" /XObject << %s >>" % xobj) if xobj else "",
                   id_contenido + i)
            ).encode("ascii"))
        for contenido in paginas:
            cuerpo = contenido.encode("cp1252", "replace")
            objetos.append(b"<< /Length %d >>\nstream\n" % len(cuerpo)
                           + cuerpo + b"\nendstream")
        for nombre in (b"Helvetica", b"Helvetica-Bold"):
            objetos.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /"
                           + nombre + b" /Encoding /WinAnsiEncoding >>")
        # El JPEG entra tal cual: DCTDecode es exactamente el formato
        # JPEG, así que el lector lo descomprime él mismo.
        for datos, (px, py), gris in self.imagenes:
            cabecera = (
                "<< /Type /XObject /Subtype /Image /Width %d /Height %d "
                "/ColorSpace /Device%s /BitsPerComponent 8 "
                "/Filter /DCTDecode /Length %d >>"
                % (px, py, "Gray" if gris else "RGB", len(datos))
            ).encode("ascii")
            objetos.append(cabecera + b"\nstream\n" + datos
                           + b"\nendstream")
        cuando = datetime.now(timezone.utc).strftime("D:%Y%m%d%H%M%SZ")
        objetos.append(("<< /Title (%s) /Producer (ERP Lost Children Peru) "
                        "/CreationDate (%s) >>"
                        % (_escapar(_plano(self.titulo)), cuando)).encode("cp1252"))

        salida = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
        posiciones = []
        for i, obj in enumerate(objetos, start=1):
            posiciones.append(len(salida))
            salida += b"%d 0 obj\n" % i + obj + b"\nendobj\n"
        inicio_xref = len(salida)
        salida += b"xref\n0 %d\n" % (len(objetos) + 1)
        salida += b"0000000000 65535 f \n"
        for pos in posiciones:
            salida += b"%010d 00000 n \n" % pos
        salida += (b"trailer\n<< /Size %d /Root 1 0 R /Info %d 0 R >>\n"
                   % (len(objetos) + 1, id_info))
        salida += b"startxref\n%d\n%%%%EOF\n" % inicio_xref
        return bytes(salida)
