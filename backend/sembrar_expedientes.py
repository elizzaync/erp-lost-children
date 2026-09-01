# -*- coding: utf-8 -*-
"""
sembrar_expedientes.py — llena las pantallas que salían vacías.

PARA QUÉ
────────
Las fichas de ejemplo (sembrar_ejemplo.py) dejaron con datos el Directorio,
los expedientes, la asistencia y el organigrama. Pero cinco pantallas
seguían diciendo «no hay nada»:

    Documentos del personal        Sesiones de acompañamiento
    Condiciones y sueldos          Incidencias
    Seguimiento de beneficiarios   (+ Programas e Historial escolar)

Una pantalla vacía no enseña si está bien hecha. Esto le pone contenido a
todas, con el mismo criterio que el resto del juego de ejemplo: personas
que NO EXISTEN y datos que no pueden confundirse con reales.

QUÉ NO HACE
───────────
No adjunta archivos. Los documentos se registran con su tipo, su fecha y
su vencimiento —que es lo que la pantalla enseña y lo que hace falta ver
funcionando— pero sin papel escaneado detrás. El sistema admite eso a
propósito: anotar que un contrato vence en marzo es útil aunque el
escaneo llegue después.

CÓMO SE DESHACE
───────────────
    py backend\\sembrar_expedientes.py --borrar

Retira exactamente lo que creó, por identificador, igual que
sembrar_ejemplo.py. Y se va solo también cuando se retiran las fichas: si
la persona desaparece, sus documentos se van con ella.

USO
───
    py backend\\sembrar_expedientes.py              enseña el plan
    py backend\\sembrar_expedientes.py --ejecutar   siembra
    py backend\\sembrar_expedientes.py --borrar     retira lo sembrado
"""
import argparse
import json
import os
import sys
from datetime import date, timedelta

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import config  # noqa: E402
import db  # noqa: E402

REGISTRO = os.path.join(os.path.dirname(config.DB_PATH),
                        "expedientes-sembrados.json")

HOY = date.today()


def _f(dias):
    return (HOY + timedelta(days=dias)).isoformat()


# ── Documentos y contratos del equipo ────────────────────────────────────
#
# Se reparten a propósito entre vigentes, por vencer y vencidos: la
# pantalla colorea según eso, y con todos vigentes no se vería.
DOCUMENTOS = [
    ("contrato",  "Contrato a plazo indeterminado", -900, 3650),
    ("documento", "DNI",                            -1200, 2000),
    ("documento", "Certificado de antecedentes penales", -300, 65),
    ("documento", "Certificado de salud",           -400, -20),
    ("contrato",  "Adenda de renovación",           -200, 160),
    ("documento", "Certificado de antecedentes policiales", -150, 210),
    ("documento", "Título profesional",             -2000, None),
]

# ── Sueldos, por régimen ─────────────────────────────────────────────────
CONDICIONES = [
    ("planilla",   3200.0, 8, -900),
    ("planilla",   2800.0, 8, -700),
    ("planilla",   2600.0, 8, -600),
    ("planilla",   1900.0, 8, -800),
    ("honorarios", 1500.0, 4, -400),
    ("planilla",   1800.0, 8, -300),
]

# ── Acompañamiento de los niños ──────────────────────────────────────────
SESIONES = [
    (-3,  "individual", "Conversación sobre su rendimiento en matemática. Se le nota más suelto que el mes pasado."),
    (-10, "grupal",     "Taller de emociones con los cuatro de Casa 1."),
    (-17, "familiar",   "Con la abuela, para preparar la visita del sábado."),
    (-24, "escolar",    "Reunión con la tutora del colegio: acuerdan reforzar comunicación."),
    (-31, "individual", "Primera sesión tras el ingreso. Muy callada; se acuerda ir despacio."),
    (-38, "grupal",     "Juego cooperativo con los de Casa 2."),
]

INCIDENCIAS = [
    (-5,  "leve",     "Se cayó jugando en el patio; raspón en la rodilla.",
     "Curación en el momento. Sin novedad al día siguiente."),
    (-12, "moderada", "Discusión con un compañero durante el almuerzo.",
     "Se habló con los dos por separado. Acuerdan pedirse disculpas."),
    (-20, "leve",     "Olvidó el cuaderno de comunicación en el colegio.",
     "La tutora lo recogió al día siguiente."),
    (-27, "grave",    "No regresó a la hora acordada tras la visita familiar.",
     "Se avisó a la DEMUNA y al juzgado. Regresó esa misma noche con su abuela."),
]

SEGUIMIENTO = [
    (-7,  "psicologico", "Se adapta bien a la casa. Duerme mejor desde el cambio de sala.",
     "Continuar sesiones semanales.", "Mantener la rutina de la noche.", 21),
    (-21, "social",      "La familia extensa mantiene el contacto y cumple el régimen de visitas.",
     "Coordinar con la abuela la visita del próximo mes.", "Confirmar por teléfono.", 30),
    (-35, "educativo",   "Bajó en comunicación durante el segundo bimestre.",
     "Refuerzo dos veces por semana con el docente.", "Revisar notas en octubre.", 45),
]

PROGRAMAS = [
    ("Refuerzo escolar", -300, None, "activo", "Martes y jueves, con el docente de la casa."),
    ("Taller de música", -150, None, "activo", "Cajón y guitarra, los sábados."),
    ("Acompañamiento psicológico", -400, None, "activo", "Sesiones semanales."),
    ("Deporte — vóley", -500, -60, "cerrado", "Se cerró al terminar el campeonato escolar."),
]

HISTORIAL = [
    ("2024", "I.E. 2032 Manuel Scorza", "primaria", "4.º", "B", "aprobado", "Logro esperado", "Regular", ""),
    ("2025", "I.E. 2032 Manuel Scorza", "primaria", "5.º", "B", "aprobado", "En proceso", "Regular",
     "Recibió refuerzo en comunicación durante el segundo semestre."),
    ("2026", "I.E. 2032 Manuel Scorza", "primaria", "6.º", "B", "en_curso", "En proceso", "Regular", ""),
]


def _ejemplo():
    """
    Las fichas del juego de ejemplo, por su documento.

    Se reconocen por el bloque 90.000.000–90.999.999, que RENIEC no emite.
    Así esto NUNCA toca una ficha real, aunque se ejecute por error en una
    base con datos de verdad: si no hay fichas de ejemplo, no hace nada.
    """
    gente = [p for p in db.personal()
             if str(p.get("documento") or "").startswith("901")]
    ninos = [b for b in db.beneficiarios()
             if str(b.get("documento") or "").startswith("903")]
    return gente, ninos


def sembrar():
    gente, ninos = _ejemplo()
    if not gente or not ninos:
        raise SystemExit(
            "ABORTA: no encuentro las fichas de ejemplo. Esto solo siembra "
            "sobre ellas, nunca sobre fichas reales.")

    creado = {"documentos": [], "condiciones": [], "sesiones": [],
              "incidencias": [], "seguimiento": [], "programas": [],
              "historial": []}

    # Documentos: los tres primeros a todo el mundo, el resto repartido.
    for i, p in enumerate(gente):
        for j, (tipo, nombre, desde, dura) in enumerate(DOCUMENTOS):
            if j >= 3 and (i + j) % 2:
                continue
            vence = "" if dura is None else _f(desde + dura)
            creado["documentos"].append(
                db.crear_documento(p["id"], tipo, nombre,
                                   emitido=_f(desde), vence=vence))

    for p, (regimen, sueldo, horas, desde) in zip(gente, CONDICIONES):
        creado["condiciones"].append(
            db.crear_condicion(p["id"], regimen, sueldo, jornada_horas=horas,
                               vigente_desde=_f(desde),
                               nota="Registrado en el ejemplo del sistema."))

    psicologa = next((p["id"] for p in gente if "Psicólog" in (p.get("cargo") or "")),
                     gente[0]["id"])
    social = next((p["id"] for p in gente if "Social" in (p.get("cargo") or "")),
                  gente[0]["id"])

    for i, b in enumerate(ninos):
        for j, (dias, tipo, notas) in enumerate(SESIONES):
            if (i + j) % 2:
                continue
            creado["sesiones"].append(
                db.crear_sesion(b["id"], _f(dias), tipo, psicologa, notas))
        for j, (dias, grav, desc, seg) in enumerate(INCIDENCIAS):
            if (i + j) % 3:
                continue
            creado["incidencias"].append(
                db.crear_incidencia(b["id"], _f(dias), desc, grav, social, seg))
        for j, (dias, tipo, sit, acc, comp, prox) in enumerate(SEGUIMIENTO):
            if (i + j) % 2:
                continue
            creado["seguimiento"].append(db.crear_seguimiento(b["id"], {
                "fecha": _f(dias), "responsable_id": psicologa, "tipo": tipo,
                "situacion": sit, "accion": acc, "compromisos": comp,
                "proxima_fecha": _f(prox)}))
        for j, (prog, desde, hasta, estado, nota) in enumerate(PROGRAMAS):
            if (i + j) % 2:
                continue
            creado["programas"].append(db.crear_programa(b["id"], {
                "programa": prog, "fecha_ingreso": _f(desde),
                "fecha_salida": "" if hasta is None else _f(hasta),
                "estado": estado, "nota": nota}))
        for anio, inst, nivel, grado, sec, sit, rend, asis, nota in HISTORIAL:
            creado["historial"].append(db.crear_historial(b["id"], {
                "anio": anio, "institucion": inst, "nivel": nivel,
                "grado": grado, "seccion": sec, "situacion": sit,
                "rendimiento": rend, "asistencia": asis, "nota": nota}))

    return creado


def retirar():
    if not os.path.exists(REGISTRO):
        print("  no hay registro: nada que retirar")
        return 0
    reg = json.loads(open(REGISTRO, encoding="utf-8").read())
    borradas = 0
    for clave, fn in (("documentos", db.borrar_documento),
                      ("sesiones", db.borrar_sesion),
                      ("incidencias", db.borrar_incidencia),
                      ("seguimiento", db.borrar_seguimiento),
                      ("programas", db.borrar_programa),
                      ("historial", db.borrar_historial)):
        for id_ in reg.get(clave, []):
            try:
                fn(id_)
                borradas += 1
            except Exception:
                pass
    os.remove(REGISTRO)
    return borradas


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--ejecutar", action="store_true")
    ap.add_argument("--borrar", action="store_true")
    a = ap.parse_args()

    db.iniciar()
    print("=" * 68)
    print("  EXPEDIENTES DE EJEMPLO — sobre las fichas inventadas")
    print("=" * 68)

    if a.borrar:
        print(f"  {retirar()} filas retiradas")
        return

    gente, ninos = _ejemplo()
    print(f"  fichas de ejemplo: {len(gente)} del equipo · {len(ninos)} niños")
    print()
    print("  SE LLENAN:")
    print("    · Documentos y contratos, con vigencias repartidas")
    print("    · Condiciones y sueldos, por régimen")
    print("    · Sesiones de acompañamiento")
    print("    · Incidencias, de leve a grave")
    print("    · Seguimiento de beneficiarios")
    print("    · Programas e historial escolar de cada niño")
    print()

    if not a.ejecutar:
        print("  SIMULACIÓN. No se ha tocado nada.")
        print("  De verdad:  py backend\\sembrar_expedientes.py --ejecutar")
        return

    creado = sembrar()
    with open(REGISTRO, "w", encoding="utf-8") as f:
        json.dump(creado, f, ensure_ascii=False, indent=2)
    for k, v in creado.items():
        print(f"    {k:14} {len(v)}")
    print(f"\n  registro: {os.path.basename(REGISTRO)}")
    print("  Para deshacerlo:  py backend\\sembrar_expedientes.py --borrar")


if __name__ == "__main__":
    main()
