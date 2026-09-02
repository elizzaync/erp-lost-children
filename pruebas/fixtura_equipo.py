# -*- coding: utf-8 -*-
"""
Datos de prueba para las suites de navegador.

Hasta el 17/08/2026 el producto sembraba 20 personas al crear la base, y las
suites daban por hecho que estaban ahí. Esa semilla se retiró: el sistema
arranca vacío, como debe. Pero varias suites comprueban cosas que solo se ven
con datos (el organigrama a tres niveles, el sueldo vigente, los totales de la
planilla), así que ahora los datos los trae la prueba.

Es lo correcto de todas formas: una prueba no debe depender de lo que haya en
la base, ni dejar rastro al terminar.

    py fixtura_equipo.py montar
    py fixtura_equipo.py desmontar
    py fixtura_equipo.py estado

Al desmontar se borra SOLO lo que montó esta fixtura —los ids quedan anotados
en fixtura_montada.json— para no llevarse por delante nada que se haya
registrado a mano mientras estaba puesta.
"""
import os
import sys, os, json, pathlib

sys.stdout.reconfigure(encoding="utf-8")
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RAIZ, "backend"))

AQUI = pathlib.Path(__file__).parent
EQUIPO = AQUI / "fixtura_equipo.json"          # recuperada del historial de git
REGISTRO = AQUI / "fixtura_montada.json"       # qué ids creó, para deshacerlo

import db
import personas

# Las condiciones que tenían las suites cuando pasaban. Se reproducen tal cual:
# prueba_condiciones comprueba el sueldo vigente y prueba_planillas los totales.
CONDICIONES = [
    (16, "planilla", 2600.0, 8.0, "2026-01-01", "2026-05-31"),
    (16, "planilla", 3100.0, 8.0, "2026-06-01", "2026-07-31"),
    (16, "planilla", 3600.0, 8.0, "2026-08-01", None),
    (1,  "planilla", 1200.0, 8.0, "2026-08-13", None),
]

DOCUMENTOS = [
    (1, "documento", "Antecedentes penales", ""),
    (1, "documento", "Certificado de salvaguarda infantil", ""),
]

PARAMETROS = {
    "organizacion": "Lost Children of Peru",
    "ciudad": "",
    "fecha_fundacion": "2014-03-02",
    "descuento_planilla": "12",
}


def _leer_equipo():
    d = json.loads(EQUIPO.read_text(encoding="utf-8"))
    return d if isinstance(d, list) else next(v for v in d.values() if isinstance(v, list))


def montar():
    if REGISTRO.exists():
        print("ya estaba montada. 'desmontar' primero si quieres rehacerla.")
        return 1

    gente = _leer_equipo()
    creado = {"personal": [], "condiciones": [], "documentos": [], "parametros": []}

    # Se usa la API pública de db, no su conexión interna.
    for g in gente:
        pid = db.crear_personal({
            "nombre": g.get("n", ""), "documento": "", "cargo": g.get("c", ""),
            "area": g.get("area", ""), "sede": g.get("sede", ""),
            "ambito": g.get("br") or "min", "vinculo": "staff",
            "contrato": g.get("cont", ""), "fecha_ingreso": g.get("ing", ""),
            "fecha_nac": g.get("nac", ""), "nivel": g.get("d", 0) or 0,
        })
        creado["personal"].append({"id": pid, "orig": g.get("id")})

    # Los jefes se asignan en una segunda pasada: al crear el primero todavía
    # no existe el id del suyo.
    mapa = {c["orig"]: c["id"] for c in creado["personal"]}
    for g in gente:
        if g.get("jefe") and g.get("id") in mapa and g["jefe"] in mapa:
            personas.editar_personal(mapa[g["id"]], {"jefe_id": mapa[g["jefe"]]})

    for pid_orig, reg, sueldo, jornada, desde, hasta in CONDICIONES:
        if pid_orig not in mapa:
            continue
        cid = db.crear_condicion(mapa[pid_orig], reg, sueldo,
                                 jornada_horas=jornada, vigente_desde=desde)
        creado["condiciones"].append(cid)
        if hasta:
            db.ejecutar("UPDATE condiciones_laborales SET vigente_hasta = ? "
                        "WHERE id = ?", (hasta, cid))

    for pid_orig, tipo, nombre, vence in DOCUMENTOS:
        if pid_orig not in mapa:
            continue
        did = db.crear_documento(mapa[pid_orig], tipo, nombre, "", vence)
        creado["documentos"].append(did)

    for k, v in PARAMETROS.items():
        db.guardar_parametro(k, v)
        creado["parametros"].append(k)

    REGISTRO.write_text(json.dumps(creado, ensure_ascii=False, indent=2),
                        encoding="utf-8")
    print(f"montada: {len(creado['personal'])} personas · "
          f"{len(creado['condiciones'])} condiciones · "
          f"{len(creado['documentos'])} documentos · "
          f"{len(creado['parametros'])} parámetros")
    return 0


def _limpiar_por_nombre():
    """
    Barre las fichas de la fixtura buscándolas por nombre.

    Hace falta porque el registro de ids puede perderse —alguien borra el
    archivo, se limpia el scratchpad— y entonces 'desmontar' no sabría qué
    quitar y las 20 personas se quedarían en la base pareciendo reales.
    """
    nombres = {x.get("n") for x in _leer_equipo() if x.get("n")}
    fuera = 0
    for p in db.personal(incluir_inactivos=True):
        if p["nombre"] in nombres:
            db.ejecutar("DELETE FROM personal WHERE id = ?", (p["id"],))
            fuera += 1
    return fuera


def desmontar():
    if not REGISTRO.exists():
        # Sin registro no significa "no hay nada": puede haberse perdido.
        sueltas = _limpiar_por_nombre()
        print(f"no había registro de montaje · {sueltas} ficha(s) sueltas retiradas"
              if sueltas else "no había nada montado.")
        return 0
    creado = json.loads(REGISTRO.read_text(encoding="utf-8"))

    for did in creado.get("documentos", []):
        db.ejecutar("DELETE FROM documentos WHERE id = ?", (did,))
    for cid in creado.get("condiciones", []):
        db.ejecutar("DELETE FROM condiciones_laborales WHERE id = ?", (cid,))
    for k in creado.get("parametros", []):
        db.ejecutar("DELETE FROM parametros WHERE clave = ?", (k,))
    # El personal al final: lo demás cuelga de él.
    for p in creado.get("personal", []):
        db.ejecutar("DELETE FROM personal WHERE id = ?", (p["id"],))

    REGISTRO.unlink()
    print(f"desmontada: {len(creado.get('personal', []))} personas retiradas")
    return 0


def estado():
    print("montada" if REGISTRO.exists() else "no montada")
    for t in ("personal", "condiciones_laborales", "documentos", "parametros",
              "beneficiarios", "usuarios", "roles"):
        print(f"  {t:24} {len(db.consultar('SELECT 1 FROM ' + t))}")
    return 0


if __name__ == "__main__":
    accion = (sys.argv[1] if len(sys.argv) > 1 else "estado").lower()
    sys.exit({"montar": montar, "desmontar": desmontar,
              "estado": estado}.get(accion, estado)())
