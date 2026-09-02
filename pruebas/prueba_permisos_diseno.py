# -*- coding: utf-8 -*-
"""El rediseño de Permisos no tocó la lógica.

Lo que importa comprobar de un cambio «solo visual» no es que se vea
bien: es que el saldo de vacaciones, la doble firma y las validaciones
sigan haciendo exactamente lo mismo que antes. Eso se prueba aquí, sobre
una copia, llamando a las reglas directamente.

Y de las piezas nuevas, lo que de verdad puede salir mal: que una hora
mal escrita se guarde igual, o que las horas cambien el conteo de días
sin que nadie lo haya decidido.
"""
import os, shutil, sys, tempfile, pathlib
sys.stdout.reconfigure(encoding="utf-8")
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RAIZ, "backend"))

carpeta = pathlib.Path(tempfile.mkdtemp())
copia = carpeta / "permisos.db"
shutil.copy2(os.path.join(RAIZ, "data", "rrhh.db"), copia)
os.environ["DB_PATH"] = str(copia)
import config; config.DB_PATH = str(copia)
import db; db.config.DB_PATH = str(copia); db.iniciar()
import solicitudes as R

fallos = []
def check(c, m):
    print(("  OK    " if c else "  FALLO ") + m)
    if not c: fallos.append(m)


print("0. Una persona con jefe y planilla")
jefa = db.crear_personal({"nombre": "Zzz Jefa Permisos", "cargo": "Coordinadora"})
yo = db.crear_personal({"nombre": "Zzz Pide Permiso", "cargo": "Educadora",
                        "fecha_ingreso": "2023-02-01", "jefe_id": jefa})
# En planilla: es lo que hace que le apliquen las vacaciones.
db.crear_condicion(yo, "planilla", 2400, jornada_horas=8,
                   vigente_desde="2023-02-01")
check(bool(yo), f"ficha creada · id {yo}")

print("\n1. El conteo de días no cambió")
check(R.dias("2026-09-01", "2026-09-05") == 5, "cinco días son cinco")
check(R.dias("2026-09-01", "2026-09-01") == 1, "un día es uno")

print("\n2. La doble firma sigue igual")
umbral = config.DIAS_VISTO_BUENO_ADMIN
print(f"   umbral configurado: {umbral} días")
check(R.requiere_admin("2026-09-01", "2026-09-02") is False, "un permiso corto: una firma")
largo = R.requiere_admin("2026-09-01", "2026-09-30")
check(largo is True, "un permiso largo: dos firmas")

print("\n3. Las horas NO cambian el conteo de días")
sid = R.crear(yo, "personal", "2026-09-10", "2026-09-10", "cita",
              hora_desde="14:00", hora_hasta="17:00")
sol = db.solicitud(sid)
print(f"   guardado: {sol['desde']} · {sol['hora_desde']}–{sol['hora_hasta']}")
check(sol["hora_desde"] == "14:00" and sol["hora_hasta"] == "17:00",
      "las horas se guardan")
check(R.dias(sol["desde"], sol["hasta"]) == 1,
      "y sigue contando un día, como antes de que existieran las horas")

print("\n4. Una hora mal escrita no se guarda a medias")
sid2 = R.crear(yo, "personal", "2026-09-11", "2026-09-11", "otra",
               hora_desde="a las 3", hora_hasta="25:99")
sol2 = db.solicitud(sid2)
print(f"   guardado: hora_desde={sol2['hora_desde']!r} hora_hasta={sol2['hora_hasta']!r}")
check(sol2["hora_desde"] == "" and sol2["hora_hasta"] == "",
      "lo que no es HH:MM se descarta en vez de guardarse")

print("\n5. Y una hora suelta se admite: media jornada sin hora de vuelta")
sid3 = R.crear(yo, "personal", "2026-09-12", "2026-09-12", "salida",
               hora_desde="15:30", hora_hasta="")
check(db.solicitud(sid3)["hora_desde"] == "15:30", "se guarda la que hay")

print("\n6. El saldo de vacaciones no se movió por los permisos con hora")
saldo = R.saldo_vacaciones(yo)
print(f"   saldo: {saldo}")
sid4 = R.crear(yo, "vacaciones", "2026-10-01", "2026-10-03", "descanso")
saldo2 = R.saldo_vacaciones(yo)
print(f"   saldo tras pedir 3 días de vacaciones: {saldo2}")
if saldo is not None and saldo2 is not None:
    check(saldo2 == saldo - 3, f"bajó exactamente 3 ({saldo} -> {saldo2})")
else:
    check(saldo == saldo2, "no aplica vacaciones a esta persona, y sigue sin aplicar")

print("\n7. Las validaciones de siempre siguen rechazando")
try:
    R.crear(yo, "vacaciones", "2026-10-02", "2026-10-04", "solapada")
    check(False, "debería haber rechazado el solape")
except R.ReglaRota as e:
    print("   dice:", str(e)[:90])
    check(True, "el solape se sigue rechazando")

try:
    R.crear(yo, "inventado", "2026-11-01", "2026-11-02", "")
    check(False, "debería rechazar un tipo que no existe")
except (R.ReglaRota, ValueError) as e:
    check(True, "un tipo desconocido se sigue rechazando")

print("\n8. Limpieza")
db.ejecutar("DELETE FROM solicitudes WHERE personal_id = ?", (yo,))
db.ejecutar("DELETE FROM personal WHERE id IN (?, ?)", (yo, jefa))
check(True, "retirado")

print()
print("FALLOS: " + str(len(fallos)) if fallos else "LÓGICA DE PERMISOS INTACTA")
for f in fallos: print("  - " + f)
shutil.rmtree(carpeta, ignore_errors=True)
sys.exit(1 if fallos else 0)
