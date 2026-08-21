# -*- coding: utf-8 -*-
"""
Traslada los tutores de beneficiarios desde 'personal' a 'responsables'.

    py backend\\migrar_tutores.py              simula y no toca nada
    py backend\\migrar_tutores.py --ejecutar   migra de verdad

POR DEFECTO SIMULA. Ejecutar exige el argumento explícito, y antes hace una
copia de la base. Una migración que se dispara sola es una migración que
alguien lanza sin querer.

── Qué hace ────────────────────────────────────────────────────────────────

Hoy 'beneficiarios.tutor_id' apunta a 'personal': el tutor se registró como si
fuera un trabajador de la ONG. En el modelo nuevo un responsable es entidad
propia, porque casi nunca lo es —es la madre, la abuela, un hermano mayor— y
meterlo en 'personal' obligaba a inventarle cargo y área, y lo hacía aparecer
en el directorio del equipo.

Por cada persona de 'personal' que figure como tutor de al menos un
beneficiario se crea una ficha en 'responsables' y se rehacen sus vínculos en
la tabla N-a-N, conservando a qué niños estaba asociada.

── Qué NO hace, a propósito ────────────────────────────────────────────────

  · No borra nada de 'personal'. Si esa persona además trabaja en la ONG,
    su ficha de trabajador sigue donde estaba. Decidir si sobra es un juicio
    humano, no algo que deba adivinar un script.
  · No vacía 'beneficiarios.tutor_id'. Queda como estaba, de modo que la
    migración se puede repetir y comparar. Retirar esa columna es un paso
    posterior y aparte, cuando el equipo haya validado el resultado.
  · No inventa parentescos. El modelo viejo no guardaba ninguno: todos los
    vínculos nacen con parentesco vacío y marcados para revisión.

── Casos que quedan para revisión manual ───────────────────────────────────

Cada ficha creada lleva origen='migrado' y origen_personal_id, y la interfaz
la muestra con el aviso "Migrado desde personal · revisar". Los motivos
habituales:

  · Sin documento — el modelo viejo no lo pedía, así que no hay forma de
    saber si dos tutores con nombre parecido son la misma persona.
  · Sin parentesco — no existía el dato.
  · Cargo y área de trabajador — pistas de que quizá SÍ es personal de la
    casa (una tutora contratada) y no un familiar. Se avisa, no se decide.
"""
import sys, os, shutil, datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8")

import config
import db


def analizar():
    """
    Qué se migraría. No escribe nada: es lo que se enseña antes de decidir.
    """
    tutores = db.consultar(
        """SELECT p.id, p.nombre, p.documento, p.cargo, p.area, p.sede,
                  p.telefono, p.email, p.direccion, p.fecha_nac, p.estado,
                  COUNT(b.id) AS ninos
             FROM personal p
             JOIN beneficiarios b ON b.tutor_id = p.id
            GROUP BY p.id
            ORDER BY p.nombre"""
    )
    for t in tutores:
        t["beneficiarios"] = db.consultar(
            "SELECT id, nombre FROM beneficiarios WHERE tutor_id = ?", (t["id"],))
        t["avisos"] = []
        if not (t["documento"] or "").strip():
            t["avisos"].append("sin documento: no se puede descartar que esté duplicado")
        if (t["cargo"] or "").strip():
            t["avisos"].append(f"tiene cargo «{t['cargo']}»: quizá sea personal de la casa, no un familiar")
        ya = db.consultar(
            "SELECT id FROM responsables WHERE origen_personal_id = ?", (t["id"],))
        t["ya_migrado"] = bool(ya)
        if ya:
            t["avisos"].append("ya existe una ficha migrada para esta persona")
    return tutores


def imprimir_plan(tutores):
    huerfanos = db.consultar(
        """SELECT b.id, b.nombre, b.tutor_id FROM beneficiarios b
            WHERE b.tutor_id IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM personal p WHERE p.id = b.tutor_id)""")
    total_b = db.consultar("SELECT COUNT(*) AS n FROM beneficiarios")[0]["n"]
    sin_tutor = db.consultar(
        "SELECT COUNT(*) AS n FROM beneficiarios WHERE tutor_id IS NULL")[0]["n"]

    print("=" * 72)
    print("  PLAN DE MIGRACIÓN DE TUTORES  ·  personal → responsables")
    print("=" * 72)
    print(f"  base           {config.DB_PATH}")
    print(f"  beneficiarios  {total_b} en total · {sin_tutor} sin tutor asignado")
    print(f"  tutores        {len(tutores)} persona(s) de 'personal' figuran como tutor")
    print()

    if not tutores:
        print("  No hay nada que migrar: ningún beneficiario tiene tutor_id.")
        print()
    for t in tutores:
        print(f"  ── {t['nombre']}  (personal #{t['id']})")
        print(f"     documento {t['documento'] or '—'} · cargo {t['cargo'] or '—'} · {t['ninos']} beneficiario(s)")
        for b in t["beneficiarios"]:
            print(f"       · vínculo → {b['nombre']} (beneficiario #{b['id']})")
        for a in t["avisos"]:
            print(f"       ⚠ {a}")
        print()

    if huerfanos:
        print(f"  ⚠ {len(huerfanos)} beneficiario(s) apuntan a un tutor que YA NO EXISTE")
        print("    en 'personal'. Su vínculo no se puede reconstruir: quedan sin")
        print("    responsable y hay que asignárselo a mano.")
        for h in huerfanos:
            print(f"       · {h['nombre']} → tutor_id {h['tutor_id']} (inexistente)")
        print()

    print("  Lo que se hará:")
    print(f"    · crear {len([t for t in tutores if not t['ya_migrado']])} ficha(s) en 'responsables', marcadas origen='migrado'")
    print(f"    · crear {sum(t['ninos'] for t in tutores)} vínculo(s) en 'responsable_beneficiario'")
    print("    · marcar cada vínculo como responsable principal, sin parentesco")
    print()
    print("  Lo que NO se toca:")
    print("    · 'personal' — ninguna ficha de trabajador se borra ni se modifica")
    print("    · 'beneficiarios.tutor_id' — se conserva para poder comparar y repetir")
    print("=" * 72)


def ejecutar(tutores):
    creadas, vinculos = 0, 0
    for t in tutores:
        if t["ya_migrado"]:
            print(f"  salto {t['nombre']}: ya tiene ficha migrada")
            continue
        rid = db.crear_responsable({
            "nombre": t["nombre"],
            "documento": t["documento"] or "",
            "fecha_nac": t["fecha_nac"] or "",
            "telefono": t["telefono"] or "",
            "correo": t["email"] or "",
            "direccion": t["direccion"] or "",
            "ocupacion": t["cargo"] or "",
            "nota": ("Ficha creada por la migración del "
                     + datetime.date.today().isoformat()
                     + ". El parentesco no existía en el modelo anterior: "
                       "hay que completarlo a mano."),
            "origen": "migrado",
            "origen_personal_id": t["id"],
        })
        creadas += 1
        for b in t["beneficiarios"]:
            # es_principal porque en el modelo viejo era el único; el resto de
            # papeles quedan sin marcar, que es lo honesto: no se sabían.
            db.vincular(rid, b["id"], {"es_principal": 1, "parentesco": ""})
            vinculos += 1
        print(f"  migrado {t['nombre']} → responsable #{rid} ({t['ninos']} vínculo(s))")
    return creadas, vinculos


def main():
    de_verdad = "--ejecutar" in sys.argv
    db.iniciar()
    tutores = analizar()
    imprimir_plan(tutores)

    if not de_verdad:
        print()
        print("  SIMULACIÓN. No se ha escrito nada.")
        print("  Para migrar de verdad:  py backend\\migrar_tutores.py --ejecutar")
        return 0

    if not tutores:
        print("\n  Nada que migrar.")
        return 0

    respaldo = config.DB_PATH + ".antes-migrar-tutores"
    shutil.copy2(config.DB_PATH, respaldo)
    print(f"\n  respaldo: {respaldo}\n")
    creadas, vinculos = ejecutar(tutores)
    print(f"\n  {creadas} ficha(s) de responsable · {vinculos} vínculo(s)")
    print("  Revisa en la interfaz las fichas marcadas «Migrado desde personal».")
    return 0


if __name__ == "__main__":
    sys.exit(main())
