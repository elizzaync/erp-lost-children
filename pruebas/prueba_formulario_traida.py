# -*- coding: utf-8 -*-
"""La traída del formulario, con datos sucios a propósito.

Lo que importa comprobar no es que «funcione», sino que NADA de lo que
llega toque una ficha, que lo dudoso quede marcado en vez de colarse
limpio, y que traer dos veces no duplique.

La hoja de Google se sustituye por filas escritas aquí: así se pueden
probar los casos feos —un DNI con puntos, una fecha del futuro, alguien
que no autoriza— sin ensuciar la hoja real ni esperar a que ocurran.
"""
import os
import json, os, shutil, sys, tempfile, pathlib
sys.stdout.reconfigure(encoding="utf-8")
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RAIZ, "backend"))

carpeta = pathlib.Path(tempfile.mkdtemp())
copia = carpeta / "form.db"
shutil.copy2(os.path.join(RAIZ, "data", "rrhh.db"), copia)
os.environ["DB_PATH"] = str(copia)
import config; config.DB_PATH = str(copia)
import db; db.config.DB_PATH = str(copia); db.iniciar()
import invitaciones as invi
import google_hoja
import formulario as F

fallos = []
def check(c, m):
    print(("  OK    " if c else "  FALLO ") + m)
    if not c: fallos.append(m)


RESPONSABLES_ANTES = db.consultar("SELECT COUNT(*) n FROM responsables")[0]["n"]
# Y cuántas respuestas había ya en la copia: la prueba mide lo que
# añade, no el total.
RESPONSABLES_YA = db.consultar("SELECT COUNT(*) n FROM respuestas_formulario")[0]["n"]

print("0. Una invitación de verdad, para que una respuesta la traiga")
inv = invi.crear(etiqueta="Zzz Familia Del Formulario")
TOKEN = inv["token"]
check(bool(TOKEN), "invitación creada")

# La hoja, sustituida por estas filas.
FILAS = [
    {   # 1. La buena, pero escrita como escribe la gente
        "Marca temporal": "21/08/2026 16:04:11",
        "Código de invitación": TOKEN,
        "Tratamiento de tus datos personales": "Sí, autorizo el tratamiento de mis datos",
        "Nombres y apellidos": "  Rosa   Huamán   Quispe ",
        "Número de documento": "12.345.678",
        "Fecha de nacimiento": "14/03/1985",
        "Sexo": "Femenino",
        "Nacionalidad": "peruana",
        "Teléfono": "977-000-111",
        "Otro teléfono donde ubicarte": "",
        "Correo electrónico": "  ROSA@Ejemplo.COM ",
        "Departamento donde vives": "Lima",
        "Provincia": "Lima", "Distrito": "Comas",
        "Dirección": "Mz E Lt 6", "Referencia para llegar": "portón azul",
        "¿A qué te dedicas?": "comerciante",
        "Situación laboral actual": "Trabajo por mi cuenta",
        "¿Dónde trabajas?": "mercado", "Tipo de trabajo": "Negocio propio",
        "Ingresos mensuales del hogar": "Menos de S/ 1 025",
        "¿Cuántas personas dependen de ti?": "3",
        "¿Hay algo más que quieras contarnos?": "",
    },
    {   # 2. Quien NO autoriza
        "Marca temporal": "21/08/2026 16:10:02",
        "Código de invitación": TOKEN,
        "Tratamiento de tus datos personales": "No autorizo",
        "Nombres y apellidos": "", "Número de documento": "",
        "Fecha de nacimiento": "", "Sexo": "", "Nacionalidad": "",
        "Teléfono": "", "Otro teléfono donde ubicarte": "",
        "Correo electrónico": "", "Departamento donde vives": "",
        "Provincia": "", "Distrito": "", "Dirección": "",
        "Referencia para llegar": "", "¿A qué te dedicas?": "",
        "Situación laboral actual": "", "¿Dónde trabajas?": "",
        "Tipo de trabajo": "", "Ingresos mensuales del hogar": "",
        "¿Cuántas personas dependen de ti?": "",
        "¿Hay algo más que quieras contarnos?": "",
    },
    {   # 3. Sucia: sin código, fecha del futuro, teléfono corto, correo roto
        "Marca temporal": "21/08/2026 16:22:40",
        "Código de invitación": "",
        "Tratamiento de tus datos personales": "Sí, autorizo el tratamiento de mis datos",
        "Nombres y apellidos": "PEDRO MENDOZA-ROJAS",
        "Número de documento": "1234",
        "Fecha de nacimiento": "01/01/2030",
        "Sexo": "otro", "Nacionalidad": "",
        "Teléfono": "123", "Otro teléfono donde ubicarte": "",
        "Correo electrónico": "pedro(arroba)correo",
        "Departamento donde vives": "", "Provincia": "", "Distrito": "",
        "Dirección": "", "Referencia para llegar": "",
        "¿A qué te dedicas?": "", "Situación laboral actual": "",
        "¿Dónde trabajas?": "", "Tipo de trabajo": "",
        "Ingresos mensuales del hogar": "",
        "¿Cuántas personas dependen de ti?": "dos",
        "¿Hay algo más que quieras contarnos?": "",
    },
]
google_hoja.filas = lambda pestana=None: list(FILAS)

print("\n1. Se traen las tres")
r = F.traer()
print("   " + json.dumps(r, ensure_ascii=False))
check(r["nuevas"] == 3, f"tres nuevas ({r['nuevas']})")

print("\n2. Ninguna tocó una ficha")
n = db.consultar("SELECT COUNT(*) n FROM responsables")[0]["n"]
check(n == RESPONSABLES_ANTES,
      f"responsables en la base: {n} — ninguno creado por la traída")

print("\n3. Lo que se limpió, se limpió bien")
b = F.bandeja()
buena = [x for x in b if "Rosa" in (x["valores"].get("nombre") or "")][0]
v = buena["valores"]
print("   " + json.dumps({k: v[k] for k in ("nombre","documento","telefono","correo","fecha_nac","sexo")}, ensure_ascii=False))
check(v["nombre"] == "Rosa Huamán Quispe", "el nombre pierde los espacios de sobra")
check(v["documento"] == "12345678", "el DNI pierde los puntos")
check(v["telefono"] == "977000111", "el teléfono pierde los guiones")
check(v["correo"] == "rosa@ejemplo.com", "el correo baja a minúsculas")
check(v["fecha_nac"] == "1985-03-14", "la fecha queda en formato de la base")
check(v["sexo"] == "F", "el sexo se guarda como código")
check(not buena["avisos"], f"y no tiene avisos ({buena['avisos']})")

print("\n4. Lo sucio queda marcado, no corregido a la fuerza")
sucia = [x for x in b if "PEDRO" in (x["valores"].get("nombre") or "")][0]
for a in sucia["avisos"]:
    print("   ·", a)
texto = " ".join(sucia["avisos"])
check("8" in texto and "dígitos" in texto, "avisa del documento corto")
check("futuro" in texto, "avisa de la fecha en el futuro")
check("correo" in texto.lower(), "avisa del correo mal escrito")
check("sin código" in texto or "sin c" in texto.lower(), "avisa de que no traía código")
check(sucia["valores"]["nombre"] == "PEDRO MENDOZA-ROJAS",
      "el nombre en mayúsculas se respeta: corregirlo sería adivinar")

print("\n5. Quien no autorizó no se puede ingresar")
negativa = [x for x in b if not x["consentimiento"]][0]
check(negativa["puede_ingresar"] is False, "la bandeja lo marca como no ingresable")
check(any("NO autorizó" in a for a in negativa["avisos"]), "y dice por qué")

print("\n6. Traer otra vez no duplica")
r2 = F.traer()
print("   " + json.dumps(r2, ensure_ascii=False))
check(r2["nuevas"] == 0 and r2["repetidas"] == 3, "las tres se reconocen como ya traídas")
check(len(F.bandeja()) == RESPONSABLES_YA + 3, "la bandeja sigue con las tres de esta prueba")

print("\n7. El enlace usado queda cerrado")
tras = invi.resolver(TOKEN)
check(tras["situacion"] == "usada", f"situación del enlace: {tras['situacion']}")

print("\n8. Una respuesta con documento ya existente se avisa")
db.crear_responsable({"nombre": "Zzz Ya Existia", "documento": "99887766", "telefono": "977000999"})
FILAS.append(dict(FILAS[0], **{
    "Marca temporal": "21/08/2026 17:00:00",
    "Nombres y apellidos": "Zzz Otra Vez",
    "Número de documento": "99.887.766",
}))
F.traer()
dupe = [x for x in F.bandeja() if x["valores"].get("nombre") == "Zzz Otra Vez"][0]
check(any("Ya existe una ficha" in a for a in dupe["avisos"]),
      f"lo dice: {[a for a in dupe['avisos'] if 'existe' in a]}")

print("\n9. Ingresar crea la ficha de verdad")
b = F.bandeja()
buena = [x for x in b if "Rosa" in (x["valores"].get("nombre") or "")][0]
antes = db.consultar("SELECT COUNT(*) n FROM responsables")[0]["n"]
r = F.ingresar(buena["id"])
despues = db.consultar("SELECT COUNT(*) n FROM responsables")[0]["n"]
check(r["creado"] is True, "dice que creó una ficha nueva")
check(despues == antes + 1, f"y hay una más en la base ({antes} -> {despues})")
ficha = db.responsable(r["responsable_id"])
check(ficha["nombre"] == "Rosa Huamán Quispe", "con el nombre limpio")
check(ficha["documento"] == "12345678", "y el documento sin puntos")
check(ficha["telefono"] == "977000111", "y el teléfono sin guiones")

print("\n10. Esa respuesta ya no se puede ingresar dos veces")
try:
    F.ingresar(buena["id"])
    check(False, "debería haberse negado")
except F.FormularioError as e:
    print("   dice:", e)
    check("ya está" in str(e), "avisa de que ya se resolvió")

print("\n11. Quien NO autorizó no se puede ingresar ni llamando al servidor")
negativa = [x for x in F.bandeja() if not x["consentimiento"]][0]
try:
    F.ingresar(negativa["id"])
    check(False, "NUNCA debería dejar")
except F.FormularioError as e:
    print("   dice:", str(e)[:100])
    check("NO autorizó" in str(e), "lo impide con el motivo claro")
check(db.consultar("SELECT estado FROM respuestas_formulario WHERE id = ?",
                   (negativa["id"],))[0]["estado"] == "por_revisar",
      "y su estado no cambió")

print("\n12. Descartar exige un motivo, y lo guarda")
try:
    F.descartar(negativa["id"], "")
    check(False, "debería exigir motivo")
except F.FormularioError as e:
    check("por qué" in str(e), "sin motivo no deja")
d = F.descartar(negativa["id"], "No autorizó el tratamiento de datos.")
check(d["estado"] == "descartada", "queda descartada")
check("No autorizó" in (d["motivo"] or ""), "con el motivo escrito")
check(db.consultar("SELECT COUNT(*) n FROM respuestas_formulario")[0]["n"] >= 3,
      "y sigue existiendo: descartar no borra el rastro")

print("\n13. Editar antes de ingresar cambia lo que se guarda")
sucia = [x for x in F.bandeja() if "PEDRO" in (x["valores"].get("nombre") or "")][0]
r2 = F.ingresar(sucia["id"], {"nombre": "Pedro Mendoza Rojas",
                              "documento": "45678912",
                              "telefono": "988777666",
                              "correo": "pedro@correo.com"})
f2 = db.responsable(r2["responsable_id"])
check(f2["nombre"] == "Pedro Mendoza Rojas", "guarda el nombre corregido")
check(f2["documento"] == "45678912", "y el documento corregido")
check(f2["fecha_nac"] in ("", None), "lo que venía mal y no se corrigió queda vacío, no inventado")

print("\n14. Lo que no es campo de la ficha se ignora")
otra = [x for x in F.bandeja() if x["estado"] == "por_revisar"]
if otra:
    r3 = F.ingresar(otra[0]["id"], {"nombre": "Zzz Con Basura",
                                    "estado": "borrado", "id": 999, "rol": "director"})
    f3 = db.responsable(r3["responsable_id"])
    check(f3["estado"] == "activo", f"un campo colado no cambia el estado ({f3['estado']})")
    check(f3["id"] != 999, "ni el id")

print()
print("FALLOS: " + str(len(fallos)) if fallos else "TRAÍDA DEL FORMULARIO OK")
for f in fallos: print("  - " + f)
shutil.rmtree(carpeta, ignore_errors=True)
sys.exit(1 if fallos else 0)
