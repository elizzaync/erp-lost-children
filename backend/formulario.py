# -*- coding: utf-8 -*-
"""
formulario.py — traer las respuestas del formulario a la bandeja.

EL TRATO, QUE NO SE NEGOCIA

Nada de lo que llega escribe en una ficha. Cada respuesta entra en
respuestas_formulario y espera a que una persona la revise. Este módulo
solo trae, limpia y AVISA; ingresar es otra decisión y otro botón.

QUÉ SE LIMPIA Y QUÉ NO

Se normaliza lo que tiene una forma indiscutible: espacios de sobra, un
DNI escrito con puntos, un teléfono con guiones, una fecha en el formato
del día, «Femenino» que en la ficha se guarda como F.

No se corrige lo que sería adivinar. Un nombre en mayúsculas se deja como
llegó: convertirlo a mayúscula inicial estropearía «de la Cruz» y
«MENDOZA-ROJAS», y nadie sabe cuál de las dos formas quería la persona.
Lo dudoso se marca con un aviso para que lo mire quien revisa.

LA FILA CRUDA SE GUARDA SIEMPRE

Junto a la versión limpia. Si mañana se descubre que la limpieza se
equivocaba en algo, el original sigue ahí y se puede rehacer.
"""
import hashlib
import json
import re
import unicodedata
from datetime import date, datetime

import db
import google_hoja
import invitaciones as invi

# ── El mapa: cada pregunta de la hoja, a su campo de la ficha ────────────
#
# Las claves son los encabezados TAL CUAL los escribe Google, que son los
# enunciados del formulario. Si alguien renombra una pregunta, esa columna
# deja de reconocerse y se avisa en vez de perderla en silencio.
MAPA = {
    "Nombres y apellidos": "nombre",
    "Número de documento": "documento",
    "Fecha de nacimiento": "fecha_nac",
    "Sexo": "sexo",
    "Nacionalidad": "nacionalidad",
    "Teléfono": "telefono",
    "Otro teléfono donde ubicarte": "telefono_alt",
    "Correo electrónico": "correo",
    "Departamento donde vives": "departamento",
    "Provincia": "provincia",
    "Distrito": "distrito",
    "Dirección": "direccion",
    "Referencia para llegar": "referencia",
    "¿A qué te dedicas?": "ocupacion",
    "Situación laboral actual": "situacion_laboral",
    "¿Dónde trabajas?": "centro_trabajo",
    "Tipo de trabajo": "tipo_trabajo",
    "Ingresos mensuales del hogar": "rango_ingresos",
    "¿Cuántas personas dependen de ti?": "personas_a_cargo",
    "¿Hay algo más que quieras contarnos?": "nota",
}

COL_MARCA = "Marca temporal"
COL_TOKEN = "Código de invitación"
COL_CONSENTIMIENTO = "Tratamiento de tus datos personales"

# El vocabulario de la ficha. El formulario pregunta en palabras y la base
# guarda códigos; la traducción vive aquí, en un solo sitio.
SEXOS = {"femenino": "F", "masculino": "M", "prefiero no decirlo": "X"}


def _limpio(v):
    """Sin espacios de sobra ni dobles. Lo mínimo que nadie discute."""
    return re.sub(r"\s+", " ", str(v or "")).strip()


def _sin_tildes(v):
    return "".join(c for c in unicodedata.normalize("NFKD", str(v or ""))
                   if not unicodedata.combining(c)).lower()


def _documento(v, avisos):
    """
    Solo letras y números, en mayúsculas. Puntos, guiones y espacios fuera:
    el mismo DNI escrito «12.345.678» y «12345678» son el mismo documento, y
    si no se igualan aquí el sistema no puede ver que ya existe.
    """
    d = re.sub(r"[^A-Za-z0-9]", "", _limpio(v)).upper()
    if not d:
        return ""
    if d.isdigit() and len(d) != 8:
        avisos.append(f"El documento tiene {len(d)} dígitos; un DNI tiene 8.")
    elif not d.isdigit() and not (9 <= len(d) <= 12):
        avisos.append("El documento no parece un DNI ni un carné de extranjería.")
    return d


def _telefono(v, avisos, cual="teléfono"):
    t = re.sub(r"[^0-9]", "", str(v or ""))
    if not t:
        return ""
    if len(t) < 6 or len(t) > 9:
        avisos.append(f"El {cual} tiene {len(t)} dígitos; se esperan entre 6 y 9.")
    return t


def _correo(v, avisos):
    c = _limpio(v).lower()
    if c and not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", c):
        avisos.append("El correo no tiene forma de correo.")
    return c


def _fecha(v, avisos):
    """
    A ISO. Google entrega la fecha como la muestra la hoja, que según la
    configuración puede ser d/m/aaaa, m/d/aaaa o ya ISO. Se prueban los
    formatos en orden y, cuando el día es mayor que 12, el propio dato
    dice cuál de los dos es.
    """
    t = _limpio(v)
    if not t:
        return ""
    for formato in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y"):
        try:
            f = datetime.strptime(t, formato).date()
        except ValueError:
            continue
        if f > date.today():
            avisos.append(f"La fecha de nacimiento ({t}) está en el futuro.")
            return ""
        if f.year < 1900:
            avisos.append(f"La fecha de nacimiento ({t}) parece equivocada.")
            return ""
        return f.isoformat()
    avisos.append(f"No se entendió la fecha «{t}».")
    return ""


def _entero(v, avisos, cual):
    t = re.sub(r"[^0-9]", "", str(v or ""))
    if not t:
        return None
    n = int(t)
    if n > 30:
        avisos.append(f"{cual}: {n} parece demasiado.")
    return n


def _sexo(v, avisos):
    t = _sin_tildes(_limpio(v))
    if not t:
        return ""
    if t in SEXOS:
        return SEXOS[t]
    avisos.append(f"No se reconoció el sexo «{_limpio(v)}».")
    return ""


def huella(fila):
    """
    Identidad de una fila de la hoja, para no traer dos veces lo mismo.

    Se calcula con la marca temporal, el código y el documento: si esos
    tres coinciden es la misma respuesta, aunque se vuelva a leer la hoja
    entera. No se usa el número de fila porque cambia si alguien borra
    una de arriba.
    """
    crudo = "|".join([
        _limpio(fila.get(COL_MARCA)),
        _limpio(fila.get(COL_TOKEN)),
        _limpio(fila.get("Número de documento")),
        _limpio(fila.get("Nombres y apellidos")),
    ])
    return hashlib.sha256(crudo.encode("utf-8")).hexdigest()


def acepto(fila):
    """¿Autorizó el tratamiento de sus datos?"""
    return _sin_tildes(fila.get(COL_CONSENTIMIENTO, "")).startswith("si")


def normalizar(fila):
    """
    La respuesta lista para proponerla, y lo que hay que mirar de ella.

    Devuelve (valores, avisos). Los avisos NO impiden guardar en la
    bandeja: son lo que verá quien revise.
    """
    avisos = []
    v = {}

    desconocidas = [c for c in fila
                    if c not in MAPA and c not in (COL_MARCA, COL_TOKEN, COL_CONSENTIMIENTO)]
    if desconocidas:
        # Una pregunta renombrada o añadida en el formulario. Se avisa en
        # vez de tirar la columna sin que nadie se entere.
        avisos.append("Columnas que este sistema no reconoce: "
                      + ", ".join(desconocidas[:4]))

    for columna, campo in MAPA.items():
        if columna not in fila:
            continue
        bruto = fila[columna]
        if campo == "documento":
            v[campo] = _documento(bruto, avisos)
        elif campo == "telefono":
            v[campo] = _telefono(bruto, avisos)
        elif campo == "telefono_alt":
            v[campo] = _telefono(bruto, avisos, "otro teléfono")
        elif campo == "correo":
            v[campo] = _correo(bruto, avisos)
        elif campo == "fecha_nac":
            v[campo] = _fecha(bruto, avisos)
        elif campo == "sexo":
            v[campo] = _sexo(bruto, avisos)
        elif campo == "personas_a_cargo":
            n = _entero(bruto, avisos, "Personas a cargo")
            v[campo] = n if n is not None else 0
        else:
            v[campo] = _limpio(bruto)

    if not v.get("nombre"):
        avisos.append("La respuesta no trae nombre.")
    return v, avisos


def _duplicado(documento):
    """¿Ya hay una ficha con ese documento?"""
    if not documento:
        return None
    filas = db.consultar(
        "SELECT id, nombre FROM responsables WHERE UPPER(REPLACE(REPLACE(documento,'.',''),'-','')) = ?",
        (documento,))
    return filas[0] if filas else None


def traer(pestana=None):
    """
    Lee la hoja y guarda en la bandeja lo que aún no estaba.

    Devuelve un resumen: cuántas se leyeron, cuántas son nuevas y cuántas
    ya estaban. Volver a llamarla no duplica nada — es la huella la que lo
    impide, no el orden de las filas.
    """
    filas = google_hoja.filas(pestana)
    ya = {f["huella"] for f in db.consultar("SELECT huella FROM respuestas_formulario")}

    nuevas, repetidas = 0, 0
    for fila in filas:
        h = huella(fila)
        if h in ya:
            repetidas += 1
            continue

        valores, avisos = normalizar(fila)
        token = _limpio(fila.get(COL_TOKEN))
        r = invi.resolver(token)
        invitacion = r["invitacion"]
        if r["situacion"] != "vigente":
            avisos.append({
                "sin token": "La respuesta llegó sin código de invitación.",
                "desconocido": "El código de invitación no es de ninguna familia registrada.",
                "caducada": "El enlace usado ya había caducado.",
                "usada": "Ese enlace ya se había usado antes.",
                "anulada": "Ese enlace estaba anulado.",
            }.get(r["situacion"], f"El código está en estado «{r['situacion']}»."))

        consintio = acepto(fila)
        if not consintio:
            avisos.append("NO autorizó el tratamiento de sus datos. Esta "
                          "respuesta no se puede ingresar; solo descartar.")

        dup = _duplicado(valores.get("documento"))
        if dup:
            avisos.append(f"Ya existe una ficha con ese documento: {dup['nombre']}.")

        db.crear_respuesta_formulario({
            "cruda": json.dumps(fila, ensure_ascii=False),
            "normalizada": json.dumps({"valores": valores, "avisos": avisos},
                                      ensure_ascii=False),
            "token": token,
            "invitacion_id": (invitacion or {}).get("id"),
            "consentimiento": 1 if consintio else 0,
            "responsable_id": (invitacion or {}).get("responsable_id") or (dup or {}).get("id"),
            "huella": h,
        })
        # Un enlace se cierra al recibir su respuesta, no al ingresarla:
        # lo que caducó es el permiso para responder.
        if invitacion and r["situacion"] == "vigente":
            invi.marcar_usada(invitacion["id"])
        ya.add(h)
        nuevas += 1

    return {"leidas": len(filas), "nuevas": nuevas, "repetidas": repetidas}


class FormularioError(Exception):
    """No se puede resolver así. El mensaje es para quien lo lee."""


def _respuesta(id_):
    filas = db.consultar("SELECT * FROM respuestas_formulario WHERE id = ?", (int(id_),))
    if not filas:
        raise FormularioError(f"No existe la respuesta {id_}.")
    return filas[0]


def ingresar(id_, cambios=None, usuario_id=None):
    """
    Lleva una respuesta a la ficha del tutor: la crea, o actualiza la que ya
    existía si el enlace estaba atado a una ficha o el documento coincide.

    'cambios' es lo que corrigió quien revisa. Se aceptan solo campos de la
    ficha: lo que venga de más se ignora en vez de guardarse a ciegas.
    """
    r = _respuesta(id_)

    if not r.get("consentimiento"):
        # La negativa está registrada con su fecha y su hora. Ingresarla
        # sería tratar datos de alguien que dijo expresamente que no.
        raise FormularioError(
            "Esa persona NO autorizó el tratamiento de sus datos. Su respuesta "
            "solo se puede descartar.")
    if r.get("estado") != "por_revisar":
        raise FormularioError(f"Esa respuesta ya está {r.get('estado')}.")

    try:
        n = json.loads(r.get("normalizada") or "{}")
    except ValueError:
        n = {}
    # Solo los campos que el formulario pregunta. La ficha tiene otros
    # —estado, origen, sin_dato— que son contabilidad interna y no algo
    # que el tutor escriba: colarlos por aquí sería cambiar el estado de
    # una ficha desde una pantalla de revisión.
    admitidos = set(MAPA.values())
    valores = {k: v for k, v in (n.get("valores") or {}).items() if k in admitidos}
    for k, v in (cambios or {}).items():
        if k in admitidos:
            valores[k] = v

    if not str(valores.get("nombre") or "").strip():
        raise FormularioError("No se puede crear una ficha sin nombre.")

    # ¿Actualizar una ficha que ya existe, o crear una nueva? Primero manda
    # el enlace —se entregó a esa familia— y después el documento.
    destino = r.get("responsable_id")
    if not destino:
        dup = _duplicado(valores.get("documento"))
        destino = (dup or {}).get("id")

    if destino:
        db.editar_responsable(destino, valores)
        creado = False
    else:
        destino = db.crear_responsable(valores)
        creado = True

    db.resolver_respuesta(id_, "ingresada", responsable_id=destino,
                          usuario_id=usuario_id)
    return {"responsable_id": destino, "creado": creado,
            "responsable": db.responsable(destino)}


def descartar(id_, motivo="", usuario_id=None):
    """
    Deja la respuesta fuera, con el porqué escrito.

    No se borra: que alguien enviara algo y se decidiera no ingresarlo es
    justamente lo que hay que poder explicar después.
    """
    r = _respuesta(id_)
    if r.get("estado") == "ingresada":
        raise FormularioError("Esa respuesta ya se ingresó; no se puede descartar.")
    motivo = str(motivo or "").strip()
    if not motivo:
        raise FormularioError("Hay que decir por qué se descarta.")
    db.resolver_respuesta(id_, "descartada", motivo=motivo, usuario_id=usuario_id)
    return db.consultar("SELECT * FROM respuestas_formulario WHERE id = ?",
                        (int(id_),))[0]


def bandeja(estado=None):
    """Lo que espera revisión, listo para enseñar."""
    filas = db.respuestas_formulario(estado)
    salida = []
    for f in filas:
        try:
            n = json.loads(f.get("normalizada") or "{}")
        except ValueError:
            n = {}
        d = dict(f)
        d["valores"] = n.get("valores") or {}
        d["avisos"] = n.get("avisos") or []
        d["puede_ingresar"] = bool(f.get("consentimiento")) and f.get("estado") == "por_revisar"
        salida.append(d)
    return salida
