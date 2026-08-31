# -*- coding: utf-8 -*-
"""
reportes.py — un PDF por módulo, con los filtros que se estén viendo.

QUÉ ES UN REPORTE AQUÍ

Una tabla impresa de lo que la pantalla está mostrando en ese momento. Si
quien lo pide tenía puesto un buscador o un filtro de estado, el papel sale
con ESO, no con la lista entera: un reporte que no coincide con la pantalla
de la que salió es peor que no tener reporte, porque nadie sabe cuál de los
dos mirar.

Por eso cada reporte imprime, bajo el título, qué filtros se aplicaron. Un
papel sin esa línea no se puede volver a comprobar meses después.

POR QUÉ SE ARMA EN EL SERVIDOR

Los datos ya están aquí y el generador de PDF también —el mismo que hace
las autorizaciones de permiso—. Mandar las filas al navegador para que las
dibuje sería copiar la lógica de filtrado en dos sitios, que es como se
llega a que el papel y la pantalla digan cosas distintas.

QUÉ NO HACE

No inventa columnas. Cada reporte imprime lo que la base guarda de verdad;
donde no hay dato se escribe una raya, no un cero.
"""
from datetime import date, datetime

import config
import db
import documento_permiso
import pdf

# Ancho de página apaisada: una tabla de ocho columnas no cabe en vertical.
A4_APAISADA = (841.89, 595.28)


def _texto(v, vacio="—"):
    """Lo que se imprime en una celda."""
    if v is None:
        return vacio
    s = str(v).strip()
    return s if s else vacio


def _fecha(v):
    """Una fecha legible, venga en ISO o como esté guardada."""
    s = _texto(v, "")
    if not s:
        return "—"
    if len(s) >= 10 and s[4] == "-" and s[7] == "-":
        return f"{s[8:10]}/{s[5:7]}/{s[0:4]}"
    return s[:10]



# ── Qué lleva la ficha completa de cada módulo ───────────────────────────
# Solo campos que la base guarda de verdad. El orden es el de una ficha en
# papel: quién es, qué hace, cómo se le encuentra.
SECCIONES = {
    "personal": [
        ("Identificación", [
            ("Nombre", "nombre"), ("Documento", "documento"),
            ("Sexo", "sexo"), ("Fecha de nacimiento", "fecha_nac"),
            ("Nacionalidad", "nacionalidad"), ("Lugar de nacimiento", "lugar_nacimiento"),
        ]),
        ("Puesto", [
            ("Cargo", "cargo"), ("Área", "area"), ("Sede", "sede"),
            ("Ámbito", "ambito"), ("Vínculo", "vinculo"), ("Contrato", "contrato"),
            ("Jornada", "jornada"), ("Fecha de ingreso", "fecha_ingreso"),
            ("Situación laboral", "estado_laboral"),
        ]),
        ("Contacto", [
            ("Teléfono", "telefono"), ("Correo", "email"),
            ("Dirección", "direccion"), ("Departamento", "departamento"),
            ("Provincia", "provincia"), ("Distrito", "distrito"),
        ]),
        ("En caso de emergencia", [
            ("Nombre", "emergencia_nombre"), ("Teléfono", "emergencia_telefono"),
        ]),
    ],
    "responsables": [
        ("Identificación", [
            ("Nombre", "nombre"), ("Documento", "documento"),
            ("Fecha de nacimiento", "fecha_nac"), ("Sexo", "sexo"),
            ("Nacionalidad", "nacionalidad"),
        ]),
        ("Contacto", [
            ("Teléfono", "telefono"), ("Otro teléfono", "telefono_alt"),
            ("Correo", "correo"), ("Dirección", "direccion"),
            ("Referencia", "referencia"), ("Departamento", "departamento"),
            ("Provincia", "provincia"), ("Distrito", "distrito"),
        ]),
        ("Situación", [
            ("Ocupación", "ocupacion"), ("Situación laboral", "situacion_laboral"),
            ("Centro de trabajo", "centro_trabajo"), ("Tipo de trabajo", "tipo_trabajo"),
            ("Rango de ingresos", "rango_ingresos"),
            ("Personas a cargo", "personas_a_cargo"), ("Nota", "nota"),
        ]),
    ],
    "beneficiarios": [
        ("Identificación", [
            ("Nombre", "nombre"), ("Documento", "documento"),
            ("Fecha de nacimiento", "fecha_nac"), ("Sexo", "sexo"),
            ("Nacionalidad", "nacionalidad"), ("Lugar de nacimiento", "lugar_nacimiento"),
        ]),
        ("Acogida", [
            ("Casa", "casa"), ("Sala", "sala"), ("Año de ingreso", "anio_ingreso"),
            ("Procedencia", "procedencia"), ("Vía de ingreso", "via_ingreso"),
            ("Situación legal", "situacion_legal"),
            ("Expediente judicial", "expediente_judicial"),
            ("Referente familiar", "referente_familiar"),
            ("Régimen de visitas", "regimen_visitas"),
        ]),
        ("Educación", [
            ("Institución educativa", "institucion_educativa"),
            ("Nivel", "nivel_educativo"), ("Grado", "grado"), ("Sección", "seccion"),
            ("Turno", "turno"), ("Año académico", "anio_academico"),
            ("Situación académica", "situacion_academica"),
            ("Rendimiento", "rendimiento"), ("Refuerzo escolar", "refuerzo_escolar"),
            ("Asistencia escolar", "asistencia_escolar"),
        ]),
        ("Salud", [
            ("Seguro", "seguro"), ("Tipo de seguro", "tipo_seguro"),
            ("Centro de salud", "centro_salud"), ("Alergias", "alergias"),
            ("Control médico", "control_medico"), ("Tratamiento", "tratamiento"),
            ("Discapacidad", "discapacidad"),
            ("Necesidades especiales", "necesidades_especiales"),
        ]),
        ("Hogar", [
            ("Con quién vive", "con_quien_vive"),
            ("Integrantes del hogar", "integrantes_hogar"),
            ("Hermanos", "hermanos"),
            ("Responsable económico", "responsable_economico"),
            ("Tipo de vivienda", "tipo_vivienda"),
            ("Tenencia", "tenencia_vivienda"),
            ("Servicios básicos", "servicios_basicos"),
            ("Rango de ingresos", "rango_ingresos"),
        ]),
    ],
}

FECHAS = ("fecha_nac", "fecha_ingreso", "creado")


class Reporte:
    """Una tabla impresa, con su cabecera y su pie.

    Se ocupa de lo tedioso: repetir los títulos de columna en cada página,
    numerar, recortar lo que no cabe y dejar constancia de quién lo generó
    y cuándo.
    """

    def __init__(self, titulo, subtitulo="", filtros="", quien="",
                 organizacion="Lost Children Perú"):
        self.titulo = titulo
        self.subtitulo = subtitulo
        self.filtros = filtros
        self.quien = quien
        self.organizacion = organizacion
        self.h = pdf.Hoja(tamano=A4_APAISADA, margen=34, titulo=titulo)

    # ── Cabecera ─────────────────────────────────────────────────────────
    def _cabecera(self, primera):
        h = self.h
        izq, der = h.margen, h.ancho - h.margen
        logo = documento_permiso._imagen("logo.jpg")
        if logo:
            alto = 30.0
            h.imagen(logo, izq, h.alto - h.margen - alto, alto * 191 / 152, alto)
        h.y = h.alto - h.margen - 13
        h.texto(self.organizacion, 10, False, pdf.GRIS, x=izq + 48, seguido=True)
        h.y = h.alto - h.margen - 30
        h.texto(self.titulo, 16, True, pdf.AZUL, x=izq + 48, seguido=True)

        hoy = "Generado el " + documento_permiso.en_letra(date.today().isoformat())
        h.y = h.alto - h.margen - 13
        h.texto(hoy, 8.5, False, pdf.GRIS,
                x=der - pdf.ancho(hoy, 8.5), seguido=True)
        if self.quien:
            por = "por " + self.quien
            h.y = h.alto - h.margen - 26
            h.texto(por, 8.5, False, pdf.GRIS_C,
                    x=der - pdf.ancho(por, 8.5), seguido=True)

        h.y = h.alto - h.margen - 44
        if primera and self.subtitulo:
            h.texto(self.subtitulo, 9.5, False, pdf.GRIS, x=izq, seguido=True)
            h.y -= 13
        if primera and self.filtros:
            # La línea que permite comprobar el papel meses después.
            h.texto("Filtros aplicados: " + self.filtros, 9, True, pdf.NEGRO,
                    x=izq, seguido=True)
            h.y -= 13
        h.regla(1.2, pdf.AZUL, y=h.y - 2)
        h.y -= 16

    def _titulos(self, columnas, anchos):
        h = self.h
        x = h.margen
        h.y -= 10
        for (rotulo, _), an in zip(columnas, anchos):
            h.texto(str(rotulo).upper(), 8, True, pdf.AZUL, x=x, seguido=True)
            x += an
        h.regla(0.8, pdf.GRIS_C, y=h.y - 5)
        h.y -= 12

    # ── El cuerpo ────────────────────────────────────────────────────────
    def tabla(self, columnas, filas):
        """
        columnas: [(rótulo, peso), ...] — el peso reparte el ancho.
        filas:    [[celda, ...], ...]
        """
        h = self.h
        util = h.ancho - 2 * h.margen
        total = sum(p for _, p in columnas) or 1
        anchos = [util * p / total for _, p in columnas]

        self._cabecera(primera=True)
        self._titulos(columnas, anchos)

        for fila in filas:
            if h.y < h.margen + 40:
                h.pagina_nueva()
                self._cabecera(primera=False)
                self._titulos(columnas, anchos)
            x = h.margen
            h.y -= 11
            for celda, an in zip(fila, anchos):
                texto = _texto(celda)
                # Se recorta con puntos suspensivos en vez de invadir la
                # columna vecina: una tabla ilegible no es un reporte.
                while pdf.ancho(texto, 9) > an - 8 and len(texto) > 4:
                    texto = texto[:-2] + "…"
                h.texto(texto, 9, False, pdf.NEGRO, x=x, seguido=True)
                x += an
            h.regla(0.4, "#e7e3de" and pdf.GRIS_C, y=h.y - 4)
            h.y -= 6

        if not filas:
            h.y -= 16
            h.texto("No hay nada que listar con estos filtros.", 10.5,
                    False, pdf.GRIS)

        h.y -= 18
        h.texto(f"{len(filas)} " + ("registro" if len(filas) == 1 else "registros"),
                9.5, True, pdf.NEGRO)
        return self

    # ── La ficha completa de una persona ─────────────────────────────────
    def ficha(self, secciones, datos, encabezado=""):
        """Una página por persona. Los campos vacíos salen con una raya:
        una ficha impresa se usa para completarla, y saber qué falta es la
        mitad de su utilidad."""
        h = self.h
        if h._ops:
            h.pagina_nueva()
        self._cabecera(primera=False)

        nombre = _texto(dict(datos).get("nombre"), "Sin nombre")
        h.y -= 6
        h.texto(nombre, 15, True, pdf.NEGRO)
        if encabezado:
            h.y -= 2
            h.texto(encabezado, 9.5, False, pdf.GRIS)
        h.espacio(8)

        col = (h.ancho - 2 * h.margen) / 2 - 10
        for titulo, campos in secciones:
            h.sitio_para(52)
            h.espacio(10)
            h.texto(titulo.upper(), 8.5, True, pdf.AZUL)
            h.regla(0.6, pdf.GRIS_C, y=h.y - 4)
            h.espacio(8)
            # Dos columnas: una ficha de treinta campos en una sola columna
            # son tres páginas de aire.
            arriba = h.y
            bajo = [arriba, arriba]
            for i, (rotulo, campo) in enumerate(campos):
                lado = i % 2
                x = h.margen + lado * (col + 20)
                h.y = bajo[lado]
                h.y -= 11
                h.texto(rotulo, 8, False, pdf.GRIS, x=x, seguido=True)
                h.y -= 12
                bruto = dict(datos).get(campo)
                valor = _fecha(bruto) if campo in FECHAS else _texto(bruto)
                h.parrafo(valor, 10, False, pdf.NEGRO, x=x, limite=col)
                h.espacio(3)
                bajo[lado] = h.y
            h.y = min(bajo)
        return self

    def bytes(self):
        return self.h.bytes()


# ── Un reporte por módulo ────────────────────────────────────────────────
# Cada uno devuelve (titulo, subtitulo, columnas, filas). Los filtros ya
# vienen aplicados: lo que llega aquí es lo que se imprime.

def _busca(filas, campos, texto):
    t = str(texto or "").strip().lower()
    if not t:
        return filas
    return [f for f in filas
            if any(t in str(dict(f).get(c) or "").lower() for c in campos)]


def personal(busca=""):
    filas = _busca(db.personal(), ["nombre", "cargo", "area", "sede",
                                   "documento"], busca)
    cols = [("Nombre", 3), ("Documento", 1.4), ("Cargo", 2.4), ("Área", 2.2),
            ("Sede", 1.4), ("Vínculo", 1.4), ("Ingreso", 1.4)]
    datos = [[f["nombre"], f["documento"], f["cargo"], f["area"], f["sede"],
              f["vinculo"], _fecha(f["fecha_ingreso"])] for f in filas]
    return "Personal", "Fichas activas en Hoja de Vida", cols, datos


def beneficiarios(busca=""):
    filas = _busca(db.beneficiarios(), ["nombre", "casa", "sala", "grado"], busca)
    cols = [("Nombre", 3), ("Documento", 1.4), ("Casa", 1.6), ("Sala", 1.4),
            ("Grado", 1.4), ("Nacimiento", 1.4)]
    datos = [[f["nombre"], dict(f).get("documento"), dict(f).get("casa"),
              dict(f).get("sala"), dict(f).get("grado"),
              _fecha(dict(f).get("fecha_nac"))] for f in filas]
    return "Beneficiarios", "Niñas, niños y adolescentes registrados", cols, datos


def responsables(busca=""):
    filas = db.responsables(texto=busca or "")
    cols = [("Nombre", 3), ("Documento", 1.5), ("Teléfono", 1.5),
            ("Correo", 2.5), ("Vínculo", 1.5)]
    datos = [[f["nombre"], dict(f).get("documento"), dict(f).get("telefono"),
              dict(f).get("correo"), dict(f).get("parentesco")] for f in filas]
    return "Responsables / Tutores", "Adultos a cargo de uno o más beneficiarios", cols, datos


def permisos(estado="", tipo="", busca=""):
    import solicitudes as reglas
    filas = [reglas.con_etiquetas(s) for s in db.solicitudes(estado=estado or None)]
    if tipo:
        filas = [f for f in filas if f.get("tipo") == tipo]
    filas = _busca(filas, ["nombre", "tipo_etiqueta", "cargo", "motivo"], busca)
    cols = [("Solicitante", 2.6), ("Tipo", 1.8), ("Desde", 1.2), ("Hasta", 1.2),
            ("Días", 0.8), ("Estado", 1.4), ("Motivo", 2.6)]
    datos = [[f.get("nombre"), f.get("tipo_etiqueta"), _fecha(f.get("desde")),
              _fecha(f.get("hasta")), f.get("dias"), f.get("estado"),
              f.get("motivo")] for f in filas]
    return "Permisos", "Solicitudes de permiso del personal", cols, datos


def _limita(filas, busca, ids, campo_id="personal_id"):
    """Deja las filas pedidas: por búsqueda de texto y por ids elegidos."""
    quiere = [i.strip() for i in str(ids or "").split(",") if i.strip()]
    if quiere:
        filas = [f for f in filas if str(dict(f).get(campo_id)) in quiere]
    return _busca(filas, ["nombre", "cargo", "area"], busca)


def _dias(desde, hasta):
    """Los días del rango, uno por uno. Los que no tuvieron marca también:
    saltárselos haría parecer continuo lo que tuvo un hueco."""
    d0 = datetime.strptime(desde, "%Y-%m-%d").date()
    d1 = datetime.strptime(hasta, "%Y-%m-%d").date()
    salida, d = [], d0
    while d <= d1:
        salida.append(d.isoformat())
        d = date.fromordinal(d.toordinal() + 1)
    return salida


def _quienes(ids, n):
    if not ids:
        return "todo el personal"
    return str(n) + " personas seleccionadas" if n != 1 else "una persona"


def asistencia(fecha="", busca="", vista="dia", ids="", desde="", hasta=""):
    """
    El reporte de Asistencia, según la pestaña que se esté viendo.

    Cada vista lee de la consulta que tiene el dato: el día de
    `marcas_de`, la semana y el mes de `marcas_rango`, que solo sabe
    cuántos días marcó cada persona. Ver la cabecera del parche que
    arregló esto.
    """
    dia = fecha or date.today().isoformat()

    if vista in ("semana", "cal"):
        if vista == "cal":
            mes = dia[:7]
            d0 = mes + "-01"
            ultimo = 31
            while True:
                try:
                    datetime.strptime(f"{mes}-{ultimo:02d}", "%Y-%m-%d")
                    break
                except ValueError:
                    ultimo -= 1
            d1 = f"{mes}-{ultimo:02d}"
        else:
            d0 = desde or dia
            d1 = hasta or dia
        dias = _dias(d0, d1)
        filas = _limita(db.marcas_rango(d0, d1), busca, ids)

        if vista == "semana":
            # Una columna por día con la hora de entrada: es lo que se mira.
            cols = ([("Persona", 2.6)]
                    + [(_fecha(d)[:5], 1.05) for d in dias]
                    + [("Días", 0.7)])
            datos = []
            for f in filas:
                detalle = dict(f).get("dias") or {}
                fila = [dict(f).get("nombre")]
                n = 0
                for d in dias:
                    m = detalle.get(d) or {}
                    if m.get("entrada"):
                        fila.append(m["entrada"])
                        n += 1
                    else:
                        fila.append("—")
                fila.append(str(n))
                datos.append(fila)
            return (f"Asistencia · del {_fecha(d0)} al {_fecha(d1)}",
                    "Hora de entrada de cada día · " + _quienes(ids, len(filas)),
                    cols, datos)

        # ── El mes: una cuadrícula de presencia ──────────────────────────
        # Treinta y un columnas de horas no caben ni se leen. En un mes lo
        # que se busca es el patrón: qué días vino y cuáles no.
        cols = ([("Persona", 3.2)]
                + [(str(int(d[8:10])), 0.42) for d in dias]
                + [("Días", 0.7)])
        datos = []
        for f in filas:
            detalle = dict(f).get("dias") or {}
            fila = [dict(f).get("nombre")]
            n = 0
            for d in dias:
                if (detalle.get(d) or {}).get("entrada"):
                    fila.append("X")
                    n += 1
                else:
                    fila.append("·")
            fila.append(str(n))
            datos.append(fila)
        return (f"Asistencia · mes de {_fecha(d0)[3:]}",
                "Una X por día con marca · " + _quienes(ids, len(filas)),
                cols, datos)

    if vista == "just":
        cols = [("Persona", 3), ("Fecha", 1.4), ("Motivo", 3), ("Estado", 1.6)]
        return ("Asistencia · justificaciones",
                "El módulo de justificaciones todavía no está construido: "
                "necesita el horario de cada persona para saber qué justificar.",
                cols, [])

    # ── El día ───────────────────────────────────────────────────────────
    marcadas = _limita(db.marcas_de(dia), busca, ids)
    cols = [("Persona", 2.8), ("Ámbito", 1.2), ("Método", 1.2), ("Entrada", 1.1),
            ("Salida", 1.1), ("Horas", 1), ("Estado", 1.5)]
    datos = []
    for f in marcadas:
        d = dict(f)
        datos.append([d.get("nombre"), d.get("ambito"), d.get("metodo"),
                      d.get("entrada") or "—", d.get("salida") or "—",
                      d.get("horas") or "—",
                      "Marcó" if d.get("entrada") else "Sin marcar"])
    # Igual que la pantalla: quien no está enrolado sale marcado, no
    # escondido. Esconderlo daría un total que parece completo y no lo es.
    if not ids:
        try:
            fuera = _busca(db.sin_enrolar(), ["nombre", "cargo", "area"], busca)
        except Exception:
            fuera = []
        for f in fuera:
            d = dict(f)
            datos.append([d.get("nombre"), d.get("ambito"), "—", "—", "—", "—",
                          "Sin enrolar"])
    return ("Asistencia del día " + _fecha(dia),
            "Lo que el terminal ha sincronizado · " + _quienes(ids, len(marcadas)),
            cols, datos)


def usuarios(busca=""):
    filas = _busca(db.usuarios(), ["usuario", "nombre", "rol_nombre"], busca)
    cols = [("Persona", 3), ("Usuario", 2), ("Cargo en el sistema", 2.2),
            ("Estado", 1.4), ("Último acceso", 1.8)]
    datos = [[dict(f).get("nombre"), f["usuario"], dict(f).get("rol_nombre"),
              "Activo" if dict(f).get("activo", 1) else "Inactivo",
              _fecha(dict(f).get("ultimo_acceso"))] for f in filas]
    return "Usuarios del sistema", "Quién entra, con qué cargo", cols, datos


def respuestas(estado="", busca=""):
    filas = db.respuestas_formulario(estado=estado or None)
    filas = [f for f in filas]
    cols = [("Recibida", 1.6), ("Nombre", 2.6), ("Documento", 1.5),
            ("Teléfono", 1.5), ("Estado", 1.5), ("Consentimiento", 1.6)]
    datos = []
    import json as _json
    for f in filas:
        try:
            v = _json.loads(dict(f).get("valores") or "{}")
        except ValueError:
            v = {}
        if busca and not any(str(busca).lower() in str(v.get(c) or "").lower()
                             for c in ("nombre", "documento", "telefono")):
            continue
        datos.append([_fecha(dict(f).get("creado")), v.get("nombre"),
                      v.get("documento"), v.get("telefono"),
                      dict(f).get("estado"),
                      "Sí" if dict(f).get("consentimiento") else "NO"])
    return "Respuestas del formulario", "Lo que enviaron las familias", cols, datos


MODULOS = {
    "personal":      (personal, "personal"),
    "beneficiarios": (beneficiarios, "beneficiarios"),
    "responsables":  (responsables, "responsables"),
    "permisos":      (permisos, "permisos"),
    "asistencia":    (asistencia, "asistencia"),
    "usuarios":      (usuarios, "usuarios"),
    "respuestas":    (respuestas, "responsables"),
}


# De qué tabla sale la ficha completa de cada módulo.
FUENTE_FICHA = {
    "personal": lambda: db.personal(),
    # Asistencia admite elegir personas, pero no tiene "ficha completa":
    # su reporte por persona ES la tabla filtrada por `ids`.
    "asistencia": lambda: db.personal(),
    "responsables": lambda: db.responsables(),
    "beneficiarios": lambda: db.beneficiarios(),
}


def _elegidos(modulo, ids):
    """Las fichas pedidas, en el orden en que están en la lista."""
    quiere = [i.strip() for i in str(ids or "").split(",") if i.strip()]
    todas = FUENTE_FICHA[modulo]()
    if not quiere:
        return todas
    porId = {str(dict(f).get("id")): f for f in todas}
    return [porId[i] for i in quiere if i in porId]


def armar(modulo, parametros, quien="", organizacion="Lost Children Perú"):
    """
    El PDF de un módulo.

    `ids` limita a unas personas concretas; `fichas` añade, detrás de la
    tabla, la ficha completa de cada una. Con una sola persona no se
    imprime tabla: una tabla de una fila no dice nada que la ficha no diga.
    """
    if modulo not in MODULOS:
        raise KeyError(f"No hay reporte para «{modulo}»")
    fn, _ = MODULOS[modulo]
    permitidos = fn.__code__.co_varnames[:fn.__code__.co_argcount]
    kwargs = {k: v for k, v in parametros.items() if k in permitidos and v}
    titulo, subtitulo, columnas, filas = fn(**kwargs)

    ids = str(parametros.get("ids") or "").strip()
    con_fichas = str(parametros.get("fichas") or "").lower() in ("1", "true", "si", "sí")
    puede_ficha = modulo in SECCIONES and modulo in FUENTE_FICHA

    elegidas = _elegidos(modulo, ids) if (puede_ficha and (ids or con_fichas)) else []
    if ids and puede_ficha:
        # La tabla se limita a los elegidos igual que las fichas.
        pedidos = {str(dict(f).get("id")) for f in elegidas}
        nombres = {_texto(dict(f).get("nombre")) for f in elegidas}
        filas = [f for f in filas if _texto(f[0]) in nombres]
        titulo += " · " + (str(len(pedidos)) + " seleccionadas"
                           if len(pedidos) != 1 else _texto(list(nombres)[0]))

    dicho = ", ".join(f"{k}: {v}" for k, v in sorted(kwargs.items()))
    if ids:
        dicho = (dicho + ", " if dicho else "") + f"{len(elegidas)} seleccionadas"
    if con_fichas:
        dicho = (dicho + ", " if dicho else "") + "con ficha completa"

    r = Reporte(titulo, subtitulo, dicho or "ninguno", quien, organizacion)
    # Con una sola persona la tabla sobra.
    solo_una = len(elegidas) == 1 and (ids or con_fichas)
    if not solo_una:
        r.tabla(columnas, filas)
    if con_fichas or solo_una:
        for f in elegidas:
            r.ficha(SECCIONES[modulo], f, encabezado="Ficha completa")
    return r.bytes()
