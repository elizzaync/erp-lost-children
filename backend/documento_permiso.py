# -*- coding: utf-8 -*-
"""El formato «AUTORIZACIÓN AL PERSONAL», el que la ONG ya usa en papel.

Está copiado del formato que me pasaron: la misma cabecera con el logo,
los mismos diez tipos numerados, los mismos campos y en el mismo orden.
Lo que antes era una hoja para rellenar a mano ahora sale con los datos
puestos, y lo que el sistema no sabe se queda como línea en blanco para
escribirlo encima.

LOS DIEZ TIPOS Y LOS SEIS DEL SISTEMA

El papel distingue diez situaciones; el sistema, seis. Aquí se marca la
casilla que corresponde y, cuando no hay equivalencia exacta, se marca
«(10) Otros» y se escribe al lado cómo lo llama el sistema. Nunca se
marca una casilla aproximada: en un formato firmado, un cuadro mal
marcado dice algo que nadie quiso decir.

UN SOLO DOCUMENTO, DOS MOMENTOS

Pendiente sale como hoja para firmar. Resuelta imprime, bajo las firmas,
quién la aprobó o rechazó y cuándo: la copia archivada tiene que poder
probarlo sin abrir el sistema.
"""
import os
from datetime import date

import pdf

MESES = ("enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
         "agosto", "septiembre", "octubre", "noviembre", "diciembre")

MARCA = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                     "data", "marca")

# Los diez del formato, tal como están impresos y en su orden.
TIPOS = (
    (1, "Permiso personal"), (2, "Comisión de Trabajo"),
    (3, "Cita Essalud / Clínica"), (4, "Permanencia Capacitación"),
    (5, "Permanencia Extra (H)"), (6, "Recuperación (H)"),
    (7, "Vacaciones"), (8, "Día(s) Libre(s)"),
    (9, "Transferencia"), (10, "Otros"),
)

# Qué casilla marca cada tipo. Desde el 27/08/2026 hay una por cada una
# del papel, así que ya no hay traducción ni casillas aproximadas: lo que
# se elige en el sistema es lo que se marca en la hoja.
CASILLA = {
    "personal": 1, "comision": 2, "medico": 3, "capacitacion": 4,
    "permanencia": 5, "recuperacion": 6, "vacaciones": 7, "libres": 8,
    "transferencia": 9, "otro": 10,
}

VACIO = ""


def en_letra(iso):
    """2026-08-24 → «24 de agosto de 2026»."""
    if not iso:
        return VACIO
    texto = str(iso)[:10]
    try:
        a, m, d = (int(x) for x in texto.split("-"))
        return f"{d} de {MESES[m - 1]} de {a}"
    except (ValueError, IndexError):
        return texto


def _corta(iso):
    """24/08/2026, para los huecos estrechos de la cabecera."""
    if not iso:
        return VACIO
    t = str(iso)[:10]
    try:
        a, m, d = t.split("-")
        return f"{d}/{m}/{a}"
    except ValueError:
        return t


def _imagen(nombre):
    ruta = os.path.join(MARCA, nombre)
    if not os.path.exists(ruta):
        return None
    with open(ruta, "rb") as f:
        return f.read()


def _total(sol):
    dias = sol.get("dias")
    if dias is None:
        return VACIO
    return f"{dias} día" + ("" if dias == 1 else "s")


def _casilla_de(sol):
    """(número marcado, lo que se escribe junto a «Otros»)."""
    tipo = sol.get("tipo")
    n = CASILLA.get(tipo)
    if n:
        return n, ""
    return 10, sol.get("tipo_etiqueta") or tipo or ""


def armar(sol, organizacion="Lost Children Perú",
          version="", fecha_formato="",
          firma_colaborador=None, firma_jefe=None):
    """Los bytes del PDF de una solicitud, en el formato de la casa."""
    h = pdf.Hoja(margen=34, titulo=f"Autorización - {sol.get('nombre') or ''}")
    izq, der = h.margen, h.ancho - h.margen
    util = der - izq

    # ── La filigrana, debajo de todo lo demás ────────────────────────────
    fil = _imagen("filigrana.jpg")
    if fil:
        an = 330.0
        al = an * 666 / 717
        h.imagen(fil, (h.ancho - an) / 2, (h.alto - al) / 2 - 40, an, al)

    # ── Cabecera: la tabla del formato ───────────────────────────────────
    alto_cab, col_logo, col_der = 62.0, 118.0, 120.0
    y_cab = h.alto - h.margen - alto_cab
    h.caja(izq, y_cab, util, alto_cab, 0.9, pdf.NEGRO)
    h.caja(izq, y_cab, col_logo, alto_cab, 0.9, pdf.NEGRO)
    # La tercera columna solo existe si hay control de documento que
    # escribir; un recuadro vacío en una hoja firmada parece un olvido.
    if version or fecha_formato:
        h.caja(der - col_der, y_cab, col_der, alto_cab, 0.9, pdf.NEGRO)

    logo = _imagen("logo.jpg")
    if logo:
        alto_logo = 44.0
        an_logo = alto_logo * 191 / 152
        h.imagen(logo, izq + (col_logo - an_logo) / 2,
                 y_cab + (alto_cab - alto_logo) / 2, an_logo, alto_logo)

    # La columna del medio: FORMATO arriba, el nombre del formato abajo.
    centro = izq + col_logo + (util - col_logo - col_der) / 2
    for texto, tam, dy in (("FORMATO", 11.5, 17), ("AUTORIZACIÓN AL PERSONAL", 12.5, 40)):
        h.y = y_cab + alto_cab - dy
        h.texto(texto, tam, True, pdf.NEGRO,
                x=centro - pdf.ancho(texto, tam, True) / 2, seguido=True)
    h.regla(0.9, pdf.NEGRO, desde=izq + col_logo, hasta=der - col_der,
            y=y_cab + alto_cab - 24)

    # Aquí iba un cuadro de «Versión / Fecha / Página». No está en el papel
    # de la ONG —lo comprobé leyendo el PDF de referencia— así que era un
    # añadido mío, y encima dejaba dos huecos en blanco esperando un código
    # que nadie tenía por qué dar. Retirado el 30/08/2026.
    #
    # Los parámetros `version` y `fecha_formato` se conservan por si algún
    # día la ONG numera sus formatos: entonces vuelve a dibujarse aquí.
    if version or fecha_formato:
        for j, (rot, val) in enumerate((("Versión:", version),
                                        ("Fecha:", fecha_formato))):
            y = y_cab + alto_cab - 13 - j * 17.5
            h.y = y
            h.texto(rot, 8, False, pdf.NEGRO, x=der - col_der + 7, seguido=True)
            h.texto(val, 8, False, pdf.NEGRO, x=der - col_der + 52, seguido=True)

    # ── Los campos ───────────────────────────────────────────────────────
    def campo(rotulo, valor, x, hasta, tam=9.5):
        """Rótulo, valor encima de la línea, y la línea hasta donde toque."""
        h.texto(rotulo, tam, False, pdf.NEGRO, x=x, seguido=True)
        inicio = x + pdf.ancho(rotulo, tam, False) + 4
        if valor:
            h.texto(str(valor), tam, True, pdf.NEGRO, x=inicio, seguido=True)
        h.regla(0.6, pdf.GRIS_C, desde=inicio, hasta=hasta, y=h.y - 3)

    h.y = y_cab - 30
    tercio = util / 3
    campo("Fecha:", _corta(sol.get("creado")), izq, izq + tercio - 12)
    campo("Área:", sol.get("area"), izq + tercio, izq + 2 * tercio - 12)
    campo("Puesto:", sol.get("cargo"), izq + 2 * tercio, der)

    h.y -= 26
    campo("Nombre del Colaborador:", sol.get("nombre"), izq, der)

    # ── Los diez tipos ───────────────────────────────────────────────────
    marcada, otros = _casilla_de(sol)
    h.y -= 30
    col = util / 3
    # La fila se mide desde donde empezó la rejilla, no desde `h.y`: dentro
    # del bucle `h.y` se mueve para escribir, y calcular la fila a partir de
    # ella dejaba las casillas en escalera.
    arriba = h.y
    for i, (n, etiqueta) in enumerate(TIPOS):
        fila, columna = divmod(i, 3)
        x = izq + columna * col
        y = arriba - fila * 17
        # El cuadro se dibuja siempre; solo lleva aspa el que toca.
        h.caja(x, y - 2, 9, 9, 0.7, pdf.NEGRO)
        if n == marcada:
            h.y = y
            h.texto("X", 8.5, True, pdf.NEGRO, x=x + 2.1, seguido=True)
        h.y = y
        texto = f"({n}) {etiqueta}"
        if n == 10 and otros:
            texto += ": " + otros
        h.texto(texto, 9, n == marcada, pdf.NEGRO, x=x + 14, seguido=True)
    # Cuatro filas: (1)(2)(3) / (4)(5)(6) / (7)(8)(9) / (10).
    h.y = arriba - 3 * 17 - 26

    # ── Nota, horario, días y periodo ────────────────────────────────────
    motivo = (sol.get("motivo") or "").strip()
    campo("Nota:", motivo[:96], izq, der)
    h.y -= 15
    campo("", motivo[96:192], izq, der)

    h.y -= 26
    hd, hh = sol.get("hora_desde"), sol.get("hora_hasta")
    h.texto("Indicar horario:", 9.5, False, pdf.NEGRO, x=izq, seguido=True)
    campo("Inicio:", hd, izq + 110, izq + 300)
    campo("Fin:", hh, izq + 320, der)

    h.y -= 26
    campo("Total de días:", _total(sol), izq, der)

    h.y -= 26
    cuarto = util / 3
    campo("Periodo:", sol.get("periodo") or "", izq, izq + cuarto - 12)
    campo("Fecha de inicio:", _corta(sol.get("desde")), izq + cuarto,
          izq + 2 * cuarto - 12)
    campo("Fecha de fin:", _corta(sol.get("hasta") or sol.get("desde")),
          izq + 2 * cuarto, der)

    # ── Sustento ─────────────────────────────────────────────────────────
    h.y -= 28
    h.texto("SUSTENTO:", 9.5, True, pdf.NEGRO, x=izq, seguido=True)
    adjunto = sol.get("archivo_nombre")
    if adjunto:
        h.texto("adjunto en el sistema: " + str(adjunto), 9, False, pdf.GRIS,
                x=izq + 70, seguido=True)
    # El recuadro se lleva el hueco que sobra: es donde se pega o se grapa
    # la constancia, y en el papel de ahora ocupa media hoja.
    alto_sust = 190.0
    h.caja(izq, h.y - alto_sust - 6, util, alto_sust, 0.6, pdf.GRIS_C)
    h.y -= alto_sust + 30

    # ── Firmas ───────────────────────────────────────────────────────────
    h.texto("Firmas del personal:", 9.5, False, pdf.NEGRO, x=izq, seguido=True)
    h.y -= 56
    y_firma = h.y
    ancho_f = (util - 60) / 2
    for i, (rot, quien, trazo) in enumerate((
            ("Colaborador:", sol.get("nombre") or "", firma_colaborador),
            # Quien resolvió manda sobre el jefe de la ficha: es quien
            # de verdad firmó. Si no hay ninguno, la línea va en blanco
            # para firmar a mano, como el papel de siempre.
            ("Jefe Inmediato:",
             sol.get("resuelta_por_nombre") or sol.get("jefe_nombre") or "",
             firma_jefe))):
        x = izq + i * (ancho_f + 60)
        # La firma va ENCIMA de la línea, no sobre ella: una línea tapada
        # deja de parecer una línea de firma.
        if trazo:
            try:
                px, py, _ = pdf._medir_jpeg(trazo)
                alto = 30.0
                an = min(alto * px / py, ancho_f - 10)
                alto = an * py / px
                h.imagen(trazo, x + 4, y_firma + 3, an, alto)
            except ValueError:
                # Una firma ilegible no puede impedir imprimir el permiso.
                pass
        h.regla(0.7, pdf.NEGRO, desde=x, hasta=x + ancho_f, y=y_firma)
        h.y = y_firma - 12
        h.texto(rot, 9, False, pdf.NEGRO, x=x, seguido=True)
        if quien:
            h.texto(quien, 8.5, False, pdf.GRIS, x=x + 72, seguido=True)

    # ── Lo que el sistema añade al papel ─────────────────────────────────
    h.y = y_firma - 40
    estado = sol.get("estado")
    if estado in ("aprobada", "rechazada", "cancelada"):
        verbo = {"aprobada": "Aprobada", "rechazada": "Rechazada",
                 "cancelada": "Cancelada"}[estado]
        quien = sol.get("jefe_nombre") or "la jefatura"
        cuando = en_letra(sol.get("resuelto_el") or sol.get("aprob_jefe_el"))
        h.parrafo(f"{verbo} en el sistema por {quien} el {cuando}.",
                  9, True, pdf.NEGRO)
        if sol.get("nota"):
            h.espacio(3)
            h.parrafo("Nota de quien resolvió: " + str(sol["nota"]), 8.5,
                      False, pdf.GRIS)
    else:
        h.parrafo("Pendiente de aprobación en el sistema.", 9, True, pdf.GRIS)

    h.espacio(8)
    h.parrafo(
        f"Solicitud N.º {sol.get('id')} · {organizacion} · generado el "
        f"{en_letra(date.today().isoformat())}. Este documento sale del "
        "registro del sistema y refleja su estado al imprimirlo.",
        7.5, False, pdf.GRIS_C)
    return h.bytes()
