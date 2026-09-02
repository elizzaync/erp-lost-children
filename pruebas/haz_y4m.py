# -*- coding: utf-8 -*-
"""Convierte una foto en un vídeo .y4m de un solo fotograma repetido.

Es lo que necesita Edge para hacer de cámara falsa con una cara de verdad:
sin esto, la cámara de prueba dibuja un comecocos verde y el reconocimiento
—con razón— no ve ninguna cara.

    py haz_y4m.py caras/cand/c20.72.jpg caras/A.y4m
"""
import sys

from PIL import Image

sys.stdout.reconfigure(encoding="utf-8")


def y4m(origen, destino, ancho=640, alto=480, fotogramas=12):
    im = Image.open(origen).convert("RGB").resize((ancho, alto))
    y, cb, cr = im.convert("YCbCr").split()
    yb = y.tobytes()
    # El croma va a la mitad de resolución en cada eje: eso es el 4:2:0.
    ub = cb.resize((ancho // 2, alto // 2), Image.BOX).tobytes()
    vb = cr.resize((ancho // 2, alto // 2), Image.BOX).tobytes()
    with open(destino, "wb") as f:
        f.write(f"YUV4MPEG2 W{ancho} H{alto} F30:1 Ip A1:1 C420mpeg2\n".encode())
        for _ in range(fotogramas):
            f.write(b"FRAME\n" + yb + ub + vb)
    print(f"  {destino}  ({ancho}x{alto}, {fotogramas} fotogramas)")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(__doc__)
        raise SystemExit(2)
    y4m(sys.argv[1], sys.argv[2])
