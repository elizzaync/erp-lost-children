# -*- coding: utf-8 -*-
"""
personas.py — fichas de personal y su vínculo con el terminal.

Separación de responsabilidades, ahora que hay dos entidades:

  editar_personal / borrar_personal   la FICHA (Hoja de Vida)
  desenrolar                          la IDENTIDAD biométrica

Son cosas distintas y conviene no confundirlas: quitar a alguien del
terminal no borra su ficha (puede seguir en la ONG y volver a enrolarse), y
borrar su ficha sí obliga a quitarlo del terminal antes, o queda un
fantasma marcando asistencia sin dueño.

CUIDADO: desenrolar no es una operación local. La identidad vive en tres
sitios y hay que quitarla de los tres:

    1. el dispositivo físico  (comando ADMS vía yunatt)
    2. la cuenta de yunatt    (staff de la nube)
    3. esta base SQLite

Y el dispositivo y la cuenta están COMPARTIDOS con el ERP anterior mientras
dure la transición, así que todo pasa por config.validar_rango().
"""
import logging

import archivos
import config
import db
import enrolamiento
from yunatt_client import cliente, YunattError

log = logging.getLogger("personas")

AMBITOS = ("adm", "min")
VINCULOS = ("staff", "voluntario")


def editar_personal(id_, datos):
    """
    Actualiza la ficha. Si la persona está enrolada y cambia de nombre, se
    propaga al terminal: es el nombre que muestra al marcar.
    """
    ficha = db.persona_personal(id_)
    if not ficha:
        raise KeyError(f"No existe la persona {id_}")

    limpio = {}
    for campo in db.CAMPOS_PERSONAL:
        if campo not in datos:
            continue
        valor = datos[campo]
        if campo == "jefe_id":
            # El ÚNICO campo que admite quedarse sin valor. La interfaz manda
            # null (o cadena vacía) al elegir "Sin jefe asignado", y eso hay
            # que obedecerlo: descartarlo como se hacía antes impedía sacar a
            # nadie de la jerarquía una vez asignado.
            limpio[campo] = int(valor) if valor not in (None, "", 0, "0") else None
            continue
        if valor is None:
            # En el resto, null significa "no me lo mandaron", no "bórralo":
            # tratarlo como borrado vaciaría campos sin querer.
            continue
        limpio[campo] = valor

    if "nombre" in limpio:
        limpio["nombre"] = str(limpio["nombre"]).strip()
        if not limpio["nombre"]:
            raise ValueError("El nombre no puede quedar vacío")
    if "ambito" in limpio and limpio["ambito"] not in AMBITOS:
        raise ValueError(f"Ámbito no reconocido: {limpio['ambito']!r}")
    if "vinculo" in limpio and limpio["vinculo"] not in VINCULOS:
        raise ValueError(f"Vínculo no reconocido: {limpio['vinculo']!r}")
    if limpio.get("jefe_id") and int(limpio["jefe_id"]) == int(id_):
        raise ValueError("Una persona no puede ser jefa de sí misma")

    cambio_nombre = "nombre" in limpio and limpio["nombre"] != ficha["nombre"]
    db.actualizar_personal(id_, limpio)

    aviso = ""
    if cambio_nombre and ficha.get("staff_number"):
        # Si yunatt falla, el cambio local se mantiene y se avisa: es
        # preferible a perder la edición entera por un problema de red.
        try:
            cliente.actualizar_staff(ficha["staff_number"], limpio["nombre"])
        except YunattError as e:
            aviso = (f"Guardado aquí, pero el terminal sigue mostrando el "
                     f"nombre anterior: {e}")
            log.warning(f"personas: {id_} renombrado en local pero no en yunatt — {e}")

    return {"aviso": aviso, **db.persona_personal(id_)}


def crear_personal(datos):
    nombre = str(datos.get("nombre") or "").strip()
    if not nombre:
        raise ValueError("El nombre es obligatorio")
    datos = {**datos, "nombre": nombre}
    if datos.get("ambito") and datos["ambito"] not in AMBITOS:
        raise ValueError(f"Ámbito no reconocido: {datos['ambito']!r}")
    if datos.get("vinculo") and datos["vinculo"] not in VINCULOS:
        raise ValueError(f"Vínculo no reconocido: {datos['vinculo']!r}")
    nuevo = db.crear_personal(datos)
    log.info(f"personas: ficha creada id={nuevo} '{nombre}'")
    return db.persona_personal(nuevo)


def desenrolar(staff_number):
    """
    Quita la identidad biométrica del dispositivo, de yunatt y de la base.
    La ficha de la persona se conserva: podrá volver a enrolarse.

    Devuelve el detalle de qué se hizo en cada capa para poder decírselo al
    usuario sin que tenga que adivinar.
    """
    sn = config.validar_rango(staff_number)
    ident = db.identidad(sn)
    if not ident:
        raise KeyError(f"No existe la identidad {sn}")

    # Si estaba esperando una captura, dejar de sondear.
    try:
        enrolamiento.olvidar(sn)
    except Exception:
        pass

    resultado = {"staff_number": sn, "nombre": ident["nombre"],
                 "dispositivo": False, "nube": False, "local": False, "avisos": []}

    # Si yunatt no contesta, esto NO puede abortar la operación.
    #
    # Antes se llamaba directo y la excepción salía de la función: con su
    # plataforma caída —que va irregular— era imposible retirar a nadie ni
    # siquiera aquí. Retirar es una decisión de la ONG, y no puede quedar
    # en manos de que un proveedor esté disponible.
    #
    # Se retira igual y se avisa de que el terminal no se enteró. Queda en
    # 'retirado' con sus biométricos a cero, así que la próxima revisión ya
    # lo tratará como no enrolado.
    fila = None
    try:
        fila = next(
            (s for s in cliente.staff_en_nube()
             if str(s.get("staffNumber")) == str(sn)),
            None,
        )
        if fila is None:
            resultado["avisos"].append("No estaba en yunatt; solo se quitó aquí.")
    except Exception as e:
        resultado["avisos"].append(
            "yunatt no responde, así que el terminal no se ha enterado: "
            "esa persona seguirá pudiendo fichar en el Timmy hasta que se "
            "la quite de allí. Aquí ya está retirada.")
        log.warning("personas: %s retirada sin poder avisar a yunatt — %s", sn, e)
    else:
        id_interno = fila["id"]
        # Primero el equipo: si se borra antes de la nube, yunatt ya no
        # sabría a quién mandar el comando de borrado remoto.
        try:
            cliente.borrar_del_dispositivo([id_interno])
            resultado["dispositivo"] = True
            # «dispositivo: True» significa que yunatt ACEPTÓ la orden, no
            # que el equipo ya la haya aplicado: el borrado es asíncrono y
            # esta plataforma no informa del contenido del terminal —sus
            # contadores useduser/usedface se quedan a cero—. El Timmy la
            # aplica en cuanto sincroniza, normalmente en segundos.
            resultado["avisos"].append(
                "Orden enviada al terminal. El equipo la aplica al "
                "sincronizar; yunatt no confirma cuándo.")
        except YunattError as e:
            resultado["avisos"].append(f"No se pudo quitar del terminal: {e}")
            log.warning(f"personas: {sn} no se quitó del dispositivo — {e}")
        try:
            cliente.borrar_de_nube([id_interno])
            resultado["nube"] = True
        except YunattError as e:
            # La plataforma oficial (www.yunatt.com:82) no expone ninguna
            # ruta para borrar personal: /staff/batchRemove y cinco
            # variantes más responden 404. No es un fallo que se pueda
            # arreglar desde aquí, y tampoco rompe nada —quien no está en
            # el terminal no puede fichar—, así que se dice tal cual en
            # vez de enseñar un error que invita a reintentar.
            if "404" in str(e):
                resultado["avisos"].append(
                    "Queda su ficha en yunatt: esta plataforma no permite "
                    "borrar personal desde fuera. Se quita a mano en "
                    "Staff Management, o se deja: no afecta a nada.")
            else:
                resultado["avisos"].append(f"No se pudo quitar de yunatt: {e}")
            log.warning(f"personas: {sn} no se quitó de la nube — {e}")

    # NO se borra la fila: se marca como retirada.
    #
    # `marcas.staff_number` apunta a `identidades` con ON DELETE CASCADE,
    # así que borrar la identidad se llevaba por delante TODO el historial
    # de asistencia de esa persona. Pasó de verdad el 01/09/2026: quitar a
    # dos personas para volver a enrolarlas borró sus marcas del día.
    #
    # Dejando la fila en 'retirado' y sin biométricos:
    #   · las marcas se conservan —son un hecho, no dejan de haber ocurrido
    #     porque a alguien se le quite del terminal—;
    #   · `enrolado` en v_identidades pasa a 0 (se calcula de rostro/huella),
    #     así que la persona reaparece como enrolable;
    #   · al volver a enrolarla se reutiliza su MISMO staff_number, y su
    #     historial anterior sigue siendo suyo.
    marcas = db.consultar(
        "SELECT COUNT(*) AS n FROM marcas WHERE staff_number = ?", (sn,)
    )[0]["n"]
    db.actualizar_identidad(sn, "retirado", rostro=0, huella=0,
                            detalle="Retirada del terminal desde el sistema")
    resultado["local"] = True
    resultado["marcas_conservadas"] = marcas
    log.info(f"personas: identidad {sn} '{ident['nombre']}' eliminada "
             f"(dispositivo={resultado['dispositivo']} nube={resultado['nube']})")
    return resultado


def borrar_personal(id_):
    """
    Borra la ficha. Si la persona estaba enrolada, primero se la quita del
    terminal: la cascada de SQLite limpia la identidad y sus marcas, pero no
    llega al dispositivo físico.
    """
    ficha = db.persona_personal(id_)
    if not ficha:
        raise KeyError(f"No existe la persona {id_}")

    resultado = {"id": int(id_), "nombre": ficha["nombre"], "avisos": [],
                 "estaba_enrolada": bool(ficha.get("staff_number"))}
    if ficha.get("staff_number"):
        r = desenrolar(ficha["staff_number"])
        resultado["avisos"] = r["avisos"]
        resultado["staff_number"] = r["staff_number"]

    # La cascada de SQLite borra las filas de 'documentos', pero los
    # archivos adjuntos viven en disco y ahí no llega: hay que anotarlos
    # ANTES de borrar, cuando todavía se pueden consultar.
    adjuntos = [d["archivo"] for d in db.documentos_de(id_) if d.get("archivo")]

    db.borrar_personal(id_)

    borrados = sum(1 for a in adjuntos if archivos.borrar(a))
    if adjuntos:
        resultado["archivos_borrados"] = borrados
        log.info(f"personas: {borrados}/{len(adjuntos)} adjuntos eliminados del disco")

    log.info(f"personas: ficha {id_} '{ficha['nombre']}' borrada")
    return resultado
