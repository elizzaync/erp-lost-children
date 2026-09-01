# -*- coding: utf-8 -*-
"""
sembrar_ejemplo.py — deja la base con un juego de fichas de ejemplo.

PARA QUÉ
────────
Para poder enseñar el sistema funcionando. Con la base casi vacía, cada
pantalla dice la verdad —«no hay nada»— y no se puede juzgar si el trabajo
está bien hecho ni enseñárselo a nadie.

Estas personas NO EXISTEN. Los nombres, documentos, teléfonos y direcciones
están inventados. Los documentos van todos en el bloque 90.000.000–90.999.999,
que no es un rango que RENIEC emita, para que ninguno pueda coincidir por
casualidad con el DNI de una persona real.

QUÉ HACE, EN ESTE ORDEN
───────────────────────
  1. Respalda la base.
  2. Borra TODOS los datos que haya: personal, beneficiarios, responsables,
     marcas, identidades, solicitudes, documentos, seguimientos, series…
     Se conserva la configuración (roles, permisos, parámetros) y —esto es
     lo importante— LA FICHA Y LA CUENTA DE QUIEN ADMINISTRA, para no
     quedarse fuera del sistema. Ver --incluirme-a-mi.
  3. Siembra el juego de ejemplo: 6 del equipo, 6 responsables/tutores,
     8 beneficiarios, sus vínculos, y un mes de asistencia.

CÓMO SE DESHACE
───────────────
    py backend\\sembrar_ejemplo.py --borrar

Borra exactamente las filas que creó, ni una más: al sembrar se guarda la
lista de identificadores en data/ejemplo-sembrado.json. No se fía del
nombre, porque un nombre se puede cambiar desde la pantalla y entonces la
ficha quedaría huérfana para siempre.

USO
───
    py backend\\sembrar_ejemplo.py              enseña el plan, no toca nada
    py backend\\sembrar_ejemplo.py --ejecutar   borra y siembra
    py backend\\sembrar_ejemplo.py --borrar     retira lo sembrado
"""
import argparse
import json
import os
import shutil
import sqlite3
import sys
from datetime import date, datetime, timedelta

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import config  # noqa: E402
import db  # noqa: E402

REGISTRO = os.path.join(os.path.dirname(config.DB_PATH), "ejemplo-sembrado.json")

# Qué tablas son datos de la organización y cuáles son configuración ya lo
# decide borrado_total.py. Copiarlo aquí parecía más prudente —dos listas
# que no se pisan— pero es al revés: el día que alguien añada una tabla y
# actualice solo una, esta se quedaría corta y dejaría filas sueltas
# apuntando a fichas que ya no existen. Una sola lista, en un solo sitio.
from borrado_total import TABLAS_DATOS  # noqa: E402


# ══════════════════════════════════════════════════════════════════════════
#  LAS PERSONAS INVENTADAS
# ══════════════════════════════════════════════════════════════════════════
#
# Nombres corrientes en Lima, cargos que tiene de verdad una casa hogar, y
# fechas coherentes entre sí: quien ingresó en 2019 no puede tener un
# contrato firmado en 2024 sin que se note raro en la ficha.

EQUIPO = [
    dict(nombre="Rosa Elena Quispe Mamani", documento="90100011",
         cargo="Directora de Casa Hogar", area="Dirección", sede="Comas",
         ambito="int", vinculo="planilla", contrato="indefinido",
         fecha_ingreso="2019-03-04", fecha_nac="1978-06-12", nivel=1,
         email="rosa.quispe@ejemplo.pe", telefono="987110022",
         direccion="Jr. Los Álamos 245, Urb. El Retablo",
         emergencia_nombre="Julio Quispe Ríos", emergencia_telefono="987110099",
         sexo="F", nacionalidad="Peruana", lugar_nacimiento="Puno",
         jornada="completa", estado_laboral="activo",
         departamento="Lima", provincia="Lima", distrito="Comas"),
    dict(nombre="Ana Lucía Torres Bravo", documento="90100012",
         cargo="Psicóloga", area="Psicología", sede="Comas",
         ambito="int", vinculo="planilla", contrato="plazo_fijo",
         fecha_ingreso="2021-08-16", fecha_nac="1990-11-03", nivel=2,
         email="ana.torres@ejemplo.pe", telefono="987110023",
         direccion="Av. Universitaria 1580, Dpto. 302",
         emergencia_nombre="Marta Bravo Núñez", emergencia_telefono="987110098",
         sexo="F", nacionalidad="Peruana", lugar_nacimiento="Lima",
         jornada="completa", estado_laboral="activo",
         departamento="Lima", provincia="Lima", distrito="Los Olivos"),
    dict(nombre="Miguel Ángel Chávez Soto", documento="90100013",
         cargo="Trabajador Social", area="Trabajo Social", sede="Comas",
         ambito="int", vinculo="planilla", contrato="plazo_fijo",
         fecha_ingreso="2022-02-01", fecha_nac="1987-01-27", nivel=2,
         email="miguel.chavez@ejemplo.pe", telefono="987110024",
         direccion="Jr. Huancavelica 118",
         emergencia_nombre="Sara Soto Vega", emergencia_telefono="987110097",
         sexo="M", nacionalidad="Peruana", lugar_nacimiento="Huancayo",
         jornada="completa", estado_laboral="activo",
         departamento="Lima", provincia="Lima", distrito="Comas"),
    dict(nombre="Carmen Rosa Huamán Ríos", documento="90100014",
         cargo="Tutora de Casa", area="Casa Hogar", sede="Comas",
         ambito="int", vinculo="planilla", contrato="indefinido",
         fecha_ingreso="2020-05-11", fecha_nac="1985-09-19", nivel=3,
         email="carmen.huaman@ejemplo.pe", telefono="987110025",
         direccion="Av. Túpac Amaru 3400, Mz. F Lt. 12",
         emergencia_nombre="Pedro Huamán Lozano", emergencia_telefono="987110096",
         sexo="F", nacionalidad="Peruana", lugar_nacimiento="Ayacucho",
         jornada="completa", estado_laboral="activo",
         departamento="Lima", provincia="Lima", distrito="Comas"),
    dict(nombre="José Antonio Paredes Lino", documento="90100015",
         cargo="Docente de Refuerzo Escolar", area="Educación", sede="Comas",
         ambito="int", vinculo="recibo", contrato="locacion",
         fecha_ingreso="2023-03-13", fecha_nac="1994-04-08", nivel=3,
         email="jose.paredes@ejemplo.pe", telefono="987110026",
         direccion="Calle Las Gardenias 77",
         emergencia_nombre="Elsa Lino Campos", emergencia_telefono="987110095",
         sexo="M", nacionalidad="Peruana", lugar_nacimiento="Trujillo",
         jornada="parcial", estado_laboral="activo",
         departamento="Lima", provincia="Lima", distrito="Independencia"),
    dict(nombre="Silvia Marisol Ccahuana Pérez", documento="90100016",
         cargo="Asistente Administrativa", area="Administración", sede="Comas",
         ambito="int", vinculo="planilla", contrato="plazo_fijo",
         fecha_ingreso="2024-01-08", fecha_nac="1996-12-01", nivel=3,
         email="silvia.ccahuana@ejemplo.pe", telefono="987110027",
         direccion="Jr. Chimbote 402",
         emergencia_nombre="Nora Pérez Aguilar", emergencia_telefono="987110094",
         sexo="F", nacionalidad="Peruana", lugar_nacimiento="Cusco",
         jornada="completa", estado_laboral="activo",
         departamento="Lima", provincia="Lima", distrito="Comas"),
]

# Quién reporta a quién, por posición en la lista de arriba. La directora no
# reporta a nadie; el resto cuelga de ella salvo el docente, que depende de
# la psicóloga por el programa de refuerzo.
JERARQUIA = {1: 0, 2: 0, 3: 0, 4: 1, 5: 0}

# Estudios y trabajos anteriores. Sin esto, la Hoja de Vida queda vacía y no
# se puede ver si la pantalla está bien resuelta.
FORMACION = {
    0: [dict(nivel="universitario", institucion="Universidad Nacional Mayor de San Marcos",
             carrera="Trabajo Social", grado="Licenciada",
             anio_inicio="1997", anio_fin="2002")],
    1: [dict(nivel="universitario", institucion="Universidad Ricardo Palma",
             carrera="Psicología", grado="Licenciada",
             anio_inicio="2008", anio_fin="2013"),
        dict(nivel="posgrado", institucion="Pontificia Universidad Católica del Perú",
             carrera="Psicología Clínica Infantil", grado="Maestría",
             anio_inicio="2015", anio_fin="2017")],
    2: [dict(nivel="universitario", institucion="Universidad Nacional del Centro",
             carrera="Trabajo Social", grado="Licenciado",
             anio_inicio="2005", anio_fin="2010")],
    3: [dict(nivel="tecnico", institucion="Instituto Superior Tecnológico Manuel Seoane",
             carrera="Educación Inicial", grado="Técnica",
             anio_inicio="2004", anio_fin="2007")],
    4: [dict(nivel="universitario", institucion="Universidad Nacional de Trujillo",
             carrera="Educación Primaria", grado="Licenciado",
             anio_inicio="2012", anio_fin="2017")],
    5: [dict(nivel="tecnico", institucion="Instituto San Ignacio de Loyola",
             carrera="Administración", grado="Técnica",
             anio_inicio="2014", anio_fin="2017")],
}

EXPERIENCIA = {
    0: [dict(empresa="Aldeas Infantiles SOS Perú", cargo="Coordinadora de programa",
             desde="2010-03", hasta="2019-02",
             funciones="Coordinación de dos casas de acogida y del equipo técnico.")],
    1: [dict(empresa="Centro de Salud Mental Comunitario Comas",
             cargo="Psicóloga", desde="2017-01", hasta="2021-07",
             funciones="Evaluación y acompañamiento psicológico a menores.")],
    2: [dict(empresa="Municipalidad de Comas — DEMUNA",
             cargo="Trabajador social", desde="2013-04", hasta="2022-01",
             funciones="Seguimiento de casos y coordinación con el Poder Judicial.")],
    4: [dict(empresa="I.E. 2032 Manuel Scorza", cargo="Docente de aula",
             desde="2018-03", hasta="2022-12",
             funciones="Aula de cuarto y quinto de primaria.")],
}

RESPONSABLES = [
    dict(nombre="Julia Mercedes Yupanqui Ríos", documento="90200021",
         fecha_nac="1982-02-14", sexo="F", nacionalidad="Peruana",
         telefono="986220031", telefono_alt="012345671",
         correo="julia.yupanqui@ejemplo.pe",
         departamento="Lima", provincia="Lima", distrito="Comas",
         direccion="Mz. J Lt. 8, AA.HH. Año Nuevo",
         referencia="A media cuadra del mercado Unicachi",
         ocupacion="Comerciante", situacion_laboral="independiente",
         centro_trabajo="Mercado Unicachi, puesto 118",
         tipo_trabajo="informal", rango_ingresos="1025-2000",
         personas_a_cargo=3,
         nota="Abuela materna. Es quien recoge a los niños los fines de semana."),
    dict(nombre="Víctor Raúl Ccopa Ticona", documento="90200022",
         fecha_nac="1979-07-30", sexo="M", nacionalidad="Peruana",
         telefono="986220032", correo="victor.ccopa@ejemplo.pe",
         departamento="Lima", provincia="Lima", distrito="Carabayllo",
         direccion="Av. San Juan 1204",
         referencia="Frente al parque zonal",
         ocupacion="Albañil", situacion_laboral="dependiente",
         centro_trabajo="Constructora Los Andes S.A.C.",
         tipo_trabajo="formal", rango_ingresos="1025-2000",
         personas_a_cargo=2,
         nota="Tío paterno. Régimen de visitas los domingos."),
    dict(nombre="Marina del Pilar Ayala Curo", documento="90200023",
         fecha_nac="1990-10-05", sexo="F", nacionalidad="Peruana",
         telefono="986220033", correo="marina.ayala@ejemplo.pe",
         departamento="Lima", provincia="Lima", distrito="Comas",
         direccion="Jr. Los Cedros 331",
         referencia="Al costado de la botica",
         ocupacion="Auxiliar de limpieza", situacion_laboral="dependiente",
         centro_trabajo="Clínica Municipal de Comas",
         tipo_trabajo="formal", rango_ingresos="1025-2000",
         personas_a_cargo=1,
         nota="Madre. En proceso de reinserción familiar acompañado."),
    dict(nombre="Gregorio Aníbal Sánchez Fabián", documento="90200024",
         fecha_nac="1968-05-22", sexo="M", nacionalidad="Peruana",
         telefono="986220034",
         departamento="Lima", provincia="Lima", distrito="Puente Piedra",
         direccion="Mz. C Lt. 14, Urb. Shangri-La",
         ocupacion="Jubilado", situacion_laboral="sin_trabajo",
         rango_ingresos="menos-1025", personas_a_cargo=1,
         nota="Abuelo paterno. Tenencia otorgada por el juzgado de familia."),
    dict(nombre="Rocío Fernanda Espinoza Vera", documento="90200025",
         fecha_nac="1993-03-17", sexo="F", nacionalidad="Peruana",
         telefono="986220035", telefono_alt="986220045",
         correo="rocio.espinoza@ejemplo.pe",
         departamento="Lima", provincia="Lima", distrito="Comas",
         direccion="Av. Belaúnde 2210",
         referencia="Segundo piso, sobre la ferretería",
         ocupacion="Costurera", situacion_laboral="independiente",
         tipo_trabajo="informal", rango_ingresos="menos-1025",
         personas_a_cargo=4,
         nota="Hermana mayor. Único contacto familiar registrado."),
    dict(nombre="Alberto Nicanor Tinoco Rojas", documento="90200026",
         fecha_nac="1975-12-09", sexo="M", nacionalidad="Peruana",
         telefono="986220036", correo="alberto.tinoco@ejemplo.pe",
         departamento="Lima", provincia="Lima", distrito="Independencia",
         direccion="Calle Las Begonias 56",
         ocupacion="Chofer", situacion_laboral="independiente",
         tipo_trabajo="informal", rango_ingresos="2001-3000",
         personas_a_cargo=2,
         nota="Padrino. Autorizado a recoger solo con aviso previo."),
]

NINOS = [
    dict(nombre="Diego Alonso Yupanqui Ayala", documento="90300031",
         fecha_nac="2013-04-21", casa="Casa 1", sala="Sala A",
         grado="6.º de primaria", anio_ingreso="2021", sexo="M",
         nacionalidad="Peruana", lugar_nacimiento="Lima",
         procedencia="Derivado por la UPE de Comas", lengua_materna="Castellano",
         via_ingreso="judicial", expediente_judicial="EXP-2021-00418-JF",
         situacion_legal="Investigación tutelar en curso",
         referente_familiar="Julia Mercedes Yupanqui Ríos (abuela materna)",
         regimen_visitas="Sábados de 10:00 a 16:00",
         institucion_educativa="I.E. 2032 Manuel Scorza",
         nivel_educativo="primaria", seccion="B", turno="mañana",
         anio_academico="2026", situacion_academica="regular",
         asistencia_escolar="Regular, sin faltas en el bimestre",
         rendimiento="En proceso", refuerzo_escolar="Sí, matemática",
         dificultades="Le cuesta la comprensión lectora.",
         nota_educativa="Mejoró tras el refuerzo de los martes.",
         seguro="SIS", tipo_seguro="SIS",
         centro_salud="Centro de Salud Año Nuevo",
         alergias="Ninguna conocida",
         control_medico="Control anual al día (marzo 2026)",
         tratamiento="Ninguno", discapacidad="No",
         emergencia_nombre="Julia Mercedes Yupanqui Ríos",
         emergencia_telefono="986220031",
         plan_vida="Terminar la primaria y pasar a secundaria en la misma I.E.",
         departamento="Lima", provincia="Lima", distrito="Comas",
         direccion="Casa hogar — Av. Túpac Amaru 3400",
         tipo_vivienda="institucional", servicios_basicos="Agua, luz, desagüe, internet",
         integrantes_hogar=8, hermanos=1, con_quien_vive="Casa hogar",
         responsable_economico="La institución",
         tenencia_vivienda="cedida", rango_ingresos="no-aplica",
         personas_dependientes=0,
         nota_socioeconomica="La familia extensa aporta ropa y útiles."),
    dict(nombre="Milagros Anahí Ccopa Salazar", documento="90300032",
         fecha_nac="2015-09-02", casa="Casa 1", sala="Sala A",
         grado="4.º de primaria", anio_ingreso="2022", sexo="F",
         nacionalidad="Peruana", lugar_nacimiento="Lima",
         procedencia="Derivada por la Fiscalía de Familia",
         lengua_materna="Castellano", via_ingreso="judicial",
         expediente_judicial="EXP-2022-00907-JF",
         situacion_legal="Con medida de protección vigente",
         referente_familiar="Víctor Raúl Ccopa Ticona (tío paterno)",
         regimen_visitas="Domingos de 14:00 a 18:00",
         institucion_educativa="I.E. 2032 Manuel Scorza",
         nivel_educativo="primaria", seccion="A", turno="mañana",
         anio_academico="2026", situacion_academica="regular",
         asistencia_escolar="Regular", rendimiento="Logro esperado",
         refuerzo_escolar="No",
         nota_educativa="Buena participación en clase.",
         seguro="SIS", tipo_seguro="SIS",
         centro_salud="Centro de Salud Año Nuevo",
         alergias="Penicilina", control_medico="Control semestral",
         tratamiento="Ninguno", discapacidad="No",
         necesidades_especiales="Ninguna",
         info_medica="Alergia a la penicilina anotada en su carné.",
         emergencia_nombre="Víctor Raúl Ccopa Ticona",
         emergencia_telefono="986220032",
         plan_vida="Continuar en la misma escuela y entrar al taller de música.",
         departamento="Lima", provincia="Lima", distrito="Comas",
         direccion="Casa hogar — Av. Túpac Amaru 3400",
         tipo_vivienda="institucional", servicios_basicos="Agua, luz, desagüe, internet",
         integrantes_hogar=8, hermanos=2, con_quien_vive="Casa hogar",
         responsable_economico="La institución", tenencia_vivienda="cedida",
         rango_ingresos="no-aplica", personas_dependientes=0),
    dict(nombre="Kevin Sebastián Ayala Curo", documento="90300033",
         fecha_nac="2012-01-15", casa="Casa 2", sala="Sala B",
         grado="1.º de secundaria", anio_ingreso="2020", sexo="M",
         nacionalidad="Peruana", lugar_nacimiento="Huánuco",
         procedencia="Traslado desde casa hogar de Huánuco",
         lengua_materna="Castellano", via_ingreso="traslado",
         expediente_judicial="EXP-2020-00233-JF",
         situacion_legal="Investigación tutelar concluida",
         referente_familiar="Marina del Pilar Ayala Curo (madre)",
         regimen_visitas="Quincenal, supervisado",
         institucion_educativa="I.E. 3049 Imperio del Tahuantinsuyo",
         nivel_educativo="secundaria", seccion="C", turno="tarde",
         anio_academico="2026", situacion_academica="repitente",
         asistencia_escolar="Irregular en el primer bimestre",
         rendimiento="En inicio", refuerzo_escolar="Sí, comunicación y matemática",
         dificultades="Repitió primero de secundaria.",
         nota_educativa="Se acordó tutoría dos veces por semana.",
         seguro="SIS", tipo_seguro="SIS",
         centro_salud="Hospital Sergio Bernales",
         alergias="Ninguna conocida", control_medico="Control anual pendiente",
         tratamiento="Ninguno", discapacidad="No",
         emergencia_nombre="Marina del Pilar Ayala Curo",
         emergencia_telefono="986220033",
         plan_vida="Recuperar el año y entrar al taller de carpintería.",
         departamento="Lima", provincia="Lima", distrito="Comas",
         direccion="Casa hogar — Av. Túpac Amaru 3400",
         tipo_vivienda="institucional", servicios_basicos="Agua, luz, desagüe, internet",
         integrantes_hogar=9, hermanos=0, con_quien_vive="Casa hogar",
         responsable_economico="La institución", tenencia_vivienda="cedida",
         rango_ingresos="no-aplica", personas_dependientes=0,
         nota_socioeconomica="La madre trabaja en turnos rotativos."),
    dict(nombre="Luz Angélica Sánchez Fabián", documento="90300034",
         fecha_nac="2016-11-27", casa="Casa 2", sala="Sala B",
         grado="3.º de primaria", anio_ingreso="2023", sexo="F",
         nacionalidad="Peruana", lugar_nacimiento="Lima",
         procedencia="Derivada por la DEMUNA de Puente Piedra",
         lengua_materna="Castellano", via_ingreso="judicial",
         expediente_judicial="EXP-2023-01120-JF",
         situacion_legal="Tenencia otorgada al abuelo paterno",
         referente_familiar="Gregorio Aníbal Sánchez Fabián (abuelo paterno)",
         regimen_visitas="Sábados de 09:00 a 13:00",
         institucion_educativa="I.E. 2032 Manuel Scorza",
         nivel_educativo="primaria", seccion="A", turno="mañana",
         anio_academico="2026", situacion_academica="regular",
         asistencia_escolar="Regular", rendimiento="Logro esperado",
         refuerzo_escolar="No",
         seguro="SIS", tipo_seguro="SIS",
         centro_salud="Centro de Salud Año Nuevo",
         alergias="Ninguna conocida", control_medico="Control semestral al día",
         tratamiento="Ninguno", discapacidad="No",
         emergencia_nombre="Gregorio Aníbal Sánchez Fabián",
         emergencia_telefono="986220034",
         plan_vida="Seguir en la casa hasta que se resuelva la tenencia.",
         departamento="Lima", provincia="Lima", distrito="Comas",
         direccion="Casa hogar — Av. Túpac Amaru 3400",
         tipo_vivienda="institucional", servicios_basicos="Agua, luz, desagüe, internet",
         integrantes_hogar=9, hermanos=1, con_quien_vive="Casa hogar",
         responsable_economico="La institución", tenencia_vivienda="cedida",
         rango_ingresos="no-aplica", personas_dependientes=0),
    dict(nombre="Brandon Josué Espinoza Vera", documento="90300035",
         fecha_nac="2011-06-08", casa="Casa 2", sala="Sala C",
         grado="2.º de secundaria", anio_ingreso="2019", sexo="M",
         nacionalidad="Peruana", lugar_nacimiento="Lima",
         procedencia="Derivado por el Juzgado de Familia de Lima Norte",
         lengua_materna="Castellano", via_ingreso="judicial",
         expediente_judicial="EXP-2019-00089-JF",
         situacion_legal="Investigación tutelar en curso",
         referente_familiar="Rocío Fernanda Espinoza Vera (hermana mayor)",
         regimen_visitas="Mensual, en la institución",
         institucion_educativa="I.E. 3049 Imperio del Tahuantinsuyo",
         nivel_educativo="secundaria", seccion="B", turno="tarde",
         anio_academico="2026", situacion_academica="regular",
         asistencia_escolar="Regular", rendimiento="En proceso",
         refuerzo_escolar="Sí, matemática",
         nota_educativa="Interesado en el taller de electricidad.",
         seguro="SIS", tipo_seguro="SIS",
         centro_salud="Hospital Sergio Bernales",
         alergias="Ninguna conocida", control_medico="Control anual al día",
         tratamiento="Ninguno", discapacidad="No",
         emergencia_nombre="Rocío Fernanda Espinoza Vera",
         emergencia_telefono="986220035",
         plan_vida="Terminar la secundaria y postular a un instituto técnico.",
         departamento="Lima", provincia="Lima", distrito="Comas",
         direccion="Casa hogar — Av. Túpac Amaru 3400",
         tipo_vivienda="institucional", servicios_basicos="Agua, luz, desagüe, internet",
         integrantes_hogar=9, hermanos=3, con_quien_vive="Casa hogar",
         responsable_economico="La institución", tenencia_vivienda="cedida",
         rango_ingresos="no-aplica", personas_dependientes=0),
    dict(nombre="Naomi Alessandra Tinoco Palacios", documento="90300036",
         fecha_nac="2018-02-19", casa="Casa 1", sala="Sala A",
         grado="Inicial 5 años", anio_ingreso="2024", sexo="F",
         nacionalidad="Peruana", lugar_nacimiento="Lima",
         procedencia="Derivada por la UPE de Independencia",
         lengua_materna="Castellano", via_ingreso="judicial",
         expediente_judicial="EXP-2024-00512-JF",
         situacion_legal="Con medida de protección vigente",
         referente_familiar="Alberto Nicanor Tinoco Rojas (padrino)",
         regimen_visitas="Sin régimen establecido",
         institucion_educativa="I.E.I. 377 Divino Niño",
         nivel_educativo="inicial", seccion="Única", turno="mañana",
         anio_academico="2026", situacion_academica="regular",
         asistencia_escolar="Regular", rendimiento="Logro esperado",
         refuerzo_escolar="No",
         seguro="SIS", tipo_seguro="SIS",
         centro_salud="Centro de Salud Año Nuevo",
         alergias="Ninguna conocida",
         control_medico="Control de crecimiento al día",
         tratamiento="Ninguno", discapacidad="No",
         emergencia_nombre="Alberto Nicanor Tinoco Rojas",
         emergencia_telefono="986220036",
         plan_vida="Pasar a primaria en la I.E. 2032 el próximo año.",
         departamento="Lima", provincia="Lima", distrito="Comas",
         direccion="Casa hogar — Av. Túpac Amaru 3400",
         tipo_vivienda="institucional", servicios_basicos="Agua, luz, desagüe, internet",
         integrantes_hogar=8, hermanos=0, con_quien_vive="Casa hogar",
         responsable_economico="La institución", tenencia_vivienda="cedida",
         rango_ingresos="no-aplica", personas_dependientes=0),
    dict(nombre="Jhoel Fabricio Yupanqui Ayala", documento="90300037",
         fecha_nac="2014-08-30", casa="Casa 1", sala="Sala A",
         grado="5.º de primaria", anio_ingreso="2021", sexo="M",
         nacionalidad="Peruana", lugar_nacimiento="Lima",
         procedencia="Ingresó junto a su hermano mayor",
         lengua_materna="Castellano", via_ingreso="judicial",
         expediente_judicial="EXP-2021-00418-JF",
         situacion_legal="Investigación tutelar en curso",
         referente_familiar="Julia Mercedes Yupanqui Ríos (abuela materna)",
         regimen_visitas="Sábados de 10:00 a 16:00",
         institucion_educativa="I.E. 2032 Manuel Scorza",
         nivel_educativo="primaria", seccion="A", turno="mañana",
         anio_academico="2026", situacion_academica="regular",
         asistencia_escolar="Regular", rendimiento="En proceso",
         refuerzo_escolar="Sí, comunicación",
         nota_educativa="Hermano de Diego Alonso; van juntos a la escuela.",
         seguro="SIS", tipo_seguro="SIS",
         centro_salud="Centro de Salud Año Nuevo",
         alergias="Ninguna conocida", control_medico="Control anual al día",
         tratamiento="Ninguno", discapacidad="No",
         emergencia_nombre="Julia Mercedes Yupanqui Ríos",
         emergencia_telefono="986220031",
         plan_vida="Terminar la primaria con su hermano.",
         departamento="Lima", provincia="Lima", distrito="Comas",
         direccion="Casa hogar — Av. Túpac Amaru 3400",
         tipo_vivienda="institucional", servicios_basicos="Agua, luz, desagüe, internet",
         integrantes_hogar=8, hermanos=1, con_quien_vive="Casa hogar",
         responsable_economico="La institución", tenencia_vivienda="cedida",
         rango_ingresos="no-aplica", personas_dependientes=0),
    dict(nombre="Fátima Belén Curo Ramos", documento="90300038",
         fecha_nac="2017-05-14", casa="Casa 2", sala="Sala B",
         grado="2.º de primaria", anio_ingreso="2025", sexo="F",
         nacionalidad="Peruana", lugar_nacimiento="Lima",
         procedencia="Derivada por la comisaría de Comas",
         lengua_materna="Castellano", via_ingreso="judicial",
         expediente_judicial="EXP-2025-00074-JF",
         situacion_legal="Investigación tutelar en curso",
         referente_familiar="Sin referente familiar identificado",
         regimen_visitas="Sin régimen establecido",
         institucion_educativa="I.E. 2032 Manuel Scorza",
         nivel_educativo="primaria", seccion="B", turno="mañana",
         anio_academico="2026", situacion_academica="regular",
         asistencia_escolar="Regular", rendimiento="En proceso",
         refuerzo_escolar="Sí, lectura",
         dificultades="Ingresó a mitad de año y va recuperando.",
         seguro="SIS", tipo_seguro="SIS",
         centro_salud="Centro de Salud Año Nuevo",
         alergias="Ninguna conocida",
         control_medico="Primer control realizado en el ingreso",
         tratamiento="Ninguno", discapacidad="No",
         necesidades_especiales="Acompañamiento psicológico semanal",
         emergencia_nombre="Rosa Elena Quispe Mamani",
         emergencia_telefono="987110022",
         plan_vida="Estabilizar su escolaridad durante este año.",
         departamento="Lima", provincia="Lima", distrito="Comas",
         direccion="Casa hogar — Av. Túpac Amaru 3400",
         tipo_vivienda="institucional", servicios_basicos="Agua, luz, desagüe, internet",
         integrantes_hogar=9, hermanos=0, con_quien_vive="Casa hogar",
         responsable_economico="La institución", tenencia_vivienda="cedida",
         rango_ingresos="no-aplica", personas_dependientes=0,
         nota_socioeconomica="Sin red familiar localizada hasta la fecha."),
]

# Quién responde por quién: (índice del niño, índice del responsable, papel).
VINCULOS = [
    (0, 0, dict(parentesco="abuela", es_principal=1, es_legal=1,
                puede_recoger=1, es_emergencia=1)),
    (6, 0, dict(parentesco="abuela", es_principal=1, es_legal=1,
                puede_recoger=1, es_emergencia=1)),
    (1, 1, dict(parentesco="tio", es_principal=1, es_legal=0,
                puede_recoger=1, es_emergencia=1)),
    (2, 2, dict(parentesco="madre", es_principal=1, es_legal=1,
                puede_recoger=0, es_emergencia=1,
                nota="Visitas supervisadas por disposición del juzgado.")),
    (3, 3, dict(parentesco="abuelo", es_principal=1, es_legal=1,
                puede_recoger=1, es_emergencia=1)),
    (4, 4, dict(parentesco="hermana", es_principal=1, es_legal=0,
                puede_recoger=1, es_emergencia=1)),
    (5, 5, dict(parentesco="otro", es_principal=1, es_legal=0,
                puede_recoger=1, es_emergencia=1,
                nota="Padrino. Debe avisar con un día de antelación.")),
]

# Tutora y psicóloga de cada niño, por índice en EQUIPO.
TUTORA, PSICOLOGA = 3, 1

STAFF_DESDE = 9500          # rango reservado: nada de esto viene del terminal


# ══════════════════════════════════════════════════════════════════════════
#  BORRAR
# ══════════════════════════════════════════════════════════════════════════

def _respaldo(bd, etiqueta):
    sello = datetime.now().strftime("%Y%m%d-%H%M%S")
    destino = f"{bd}.antes-de-{etiqueta}-{sello}.bak"
    shutil.copy2(bd, destino)
    return destino


def _quien_administra(con):
    """
    La ficha que sostiene alguna cuenta de usuario. Es la que NO se borra:
    'usuarios.personal_id' es ON DELETE CASCADE, así que llevársela por
    delante deja a esa persona fuera del sistema sin manera de volver a
    entrar salvo creando otra cuenta desde la consola.
    """
    filas = con.execute(
        """SELECT u.personal_id, p.nombre, u.usuario
             FROM usuarios u JOIN personal p ON p.id = u.personal_id
            ORDER BY u.id"""
    ).fetchall()
    return [(f[0], f[1], f[2]) for f in filas]


def vaciar(bd, conservar_ids, simular=True):
    """Deja la base sin datos, salvo las fichas de 'conservar_ids'."""
    con = sqlite3.connect(bd, isolation_level=None)
    con.execute("PRAGMA foreign_keys = ON")
    salvo = ",".join(str(int(i)) for i in conservar_ids) or "-1"
    cuenta, plan = 0, []
    try:
        if not simular:
            con.execute("BEGIN")
        for t in TABLAS_DATOS:
            try:
                if t == "personal":
                    sql = f"DELETE FROM personal WHERE id NOT IN ({salvo})"
                    n = con.execute(
                        f"SELECT COUNT(*) FROM personal WHERE id NOT IN ({salvo})"
                    ).fetchone()[0]
                else:
                    sql = f"DELETE FROM {t}"
                    n = con.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
                if n:
                    plan.append((t, n))
                if not simular:
                    cuenta += con.execute(sql).rowcount
            except sqlite3.OperationalError:
                pass          # tabla que no existe en esta base
        if not simular:
            con.execute("COMMIT")
    except Exception:
        if not simular:
            try:
                con.execute("ROLLBACK")
            except Exception:
                pass
        raise
    finally:
        con.close()
    return cuenta, plan


# ══════════════════════════════════════════════════════════════════════════
#  SEMBRAR
# ══════════════════════════════════════════════════════════════════════════

def _marcas_del_mes(staff, dias=30):
    """
    Una entrada y una salida por día laborable, con minutos que varían.

    Nadie ficha a la misma hora clavada todos los días, y una tabla con
    08:00 exacto treinta veces se nota falsa a la legua. Tampoco se inventan
    faltas al azar: las ausencias se reparten a propósito para que el
    porcentaje de asistencia dé algo creíble.
    """
    hoy = date.today()
    puestas = 0
    for i in range(dias):
        d = hoy - timedelta(days=i)
        if d.weekday() >= 5:                       # sábado y domingo, no
            continue
        # Una falta de cada doce días trabajados, repartida por persona.
        if (staff + i) % 12 == 0:
            continue
        m_ent = 55 + ((staff * 7 + i * 13) % 20)   # entre 07:55 y 08:14
        h_ent = 7 if m_ent < 60 else 8
        m_ent = m_ent % 60
        m_sal = (staff * 3 + i * 11) % 25          # entre 17:00 y 17:24
        db.guardar_marca(staff, d.isoformat(), f"{h_ent:02d}:{m_ent:02d}",
                         "facial", "terminal")
        db.guardar_marca(staff, d.isoformat(), f"17:{m_sal:02d}",
                         "facial", "terminal")
        puestas += 2
    return puestas


def sembrar():
    """Crea todo y devuelve el registro de lo creado."""
    creado = {"personal": [], "responsables": [], "beneficiarios": [],
              "staff_numbers": [], "sembrado": datetime.now().isoformat(" ")}

    # ── El equipo ────────────────────────────────────────────────────────
    ids_equipo = []
    for i, p in enumerate(EQUIPO):
        pid = db.crear_personal(dict(p, estado="activo"))
        ids_equipo.append(pid)
        creado["personal"].append(pid)
    # El jefe se pone después: cuando se crea la primera ficha, la de su
    # jefa todavía no existe.
    for hijo, jefe in JERARQUIA.items():
        db.actualizar_personal(ids_equipo[hijo], {"jefe_id": ids_equipo[jefe]})
    for i, filas in FORMACION.items():
        for f in filas:
            db.crear_formacion(ids_equipo[i], f)
    for i, filas in EXPERIENCIA.items():
        for f in filas:
            db.crear_experiencia(ids_equipo[i], f)

    # ── Enrolamiento y asistencia ────────────────────────────────────────
    # La identidad es lo que ata a una persona con el número que usa el
    # terminal. Sin ella las marcas no tienen a quién pertenecer.
    marcas = 0
    for i, pid in enumerate(ids_equipo):
        staff = STAFF_DESDE + i
        # crear_identidad la deja «esperando»: eso es lo que pasa de
        # verdad cuando se manda a alguien al terminal. Se marca enrolada
        # aparte, que es el estado en el que quedaría al volver.
        db.crear_identidad(staff, "personal", pid, "facial")
        db.actualizar_identidad(staff, "enrolado", rostro=1)
        creado["staff_numbers"].append(staff)
        marcas += _marcas_del_mes(staff)

    # ── Los responsables ─────────────────────────────────────────────────
    ids_resp = []
    for r in RESPONSABLES:
        rid = db.crear_responsable(dict(r, estado="activo"))
        ids_resp.append(rid)
        creado["responsables"].append(rid)

    # ── Los niños ────────────────────────────────────────────────────────
    ids_ninos = []
    for n in NINOS:
        bid = db.crear_beneficiario(dict(
            n, estado="activo",
            tutor_id=ids_equipo[TUTORA], psicologo_id=ids_equipo[PSICOLOGA]))
        ids_ninos.append(bid)
        creado["beneficiarios"].append(bid)

    # ── Quién responde por quién ─────────────────────────────────────────
    for nino, resp, papel in VINCULOS:
        db.vincular(ids_resp[resp], ids_ninos[nino], papel)

    creado["marcas"] = marcas
    return creado


# ══════════════════════════════════════════════════════════════════════════
#  RETIRAR LO SEMBRADO
# ══════════════════════════════════════════════════════════════════════════

def retirar():
    """
    Borra exactamente lo que se sembró, por identificador.

    Por identificador y no por nombre: un nombre se puede corregir desde la
    pantalla, y entonces la ficha quedaría fuera de la red para siempre.
    """
    if not os.path.exists(REGISTRO):
        print("  no hay registro de siembra: nada que retirar")
        return 0
    reg = json.loads(open(REGISTRO, encoding="utf-8").read())
    con = sqlite3.connect(config.DB_PATH, isolation_level=None)
    con.execute("PRAGMA foreign_keys = ON")
    n = 0
    try:
        con.execute("BEGIN")
        for staff in reg.get("staff_numbers", []):
            n += con.execute("DELETE FROM marcas WHERE staff_number = ?",
                             (staff,)).rowcount
            n += con.execute("DELETE FROM identidades WHERE staff_number = ?",
                             (staff,)).rowcount
        for bid in reg.get("beneficiarios", []):
            n += con.execute("DELETE FROM beneficiarios WHERE id = ?",
                             (bid,)).rowcount
        for rid in reg.get("responsables", []):
            n += con.execute("DELETE FROM responsables WHERE id = ?",
                             (rid,)).rowcount
        for pid in reg.get("personal", []):
            n += con.execute("DELETE FROM personal WHERE id = ?",
                             (pid,)).rowcount
        con.execute("COMMIT")
    except Exception:
        con.execute("ROLLBACK")
        raise
    finally:
        con.close()
    os.remove(REGISTRO)
    return n


# ══════════════════════════════════════════════════════════════════════════

def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--ejecutar", action="store_true",
                    help="borra los datos actuales y siembra los de ejemplo")
    ap.add_argument("--borrar", action="store_true",
                    help="retira lo sembrado y no toca nada más")
    ap.add_argument("--incluirme-a-mi", action="store_true",
                    help="borra TAMBIÉN la ficha de quien administra; te deja "
                         "fuera del sistema hasta crear otra cuenta")
    ap.add_argument("--conservar", nargs="*", metavar="USUARIO",
                    help="qué cuentas sobreviven, por nombre de usuario. Sin "
                         "esto sobreviven todas: borrar una cuenta por "
                         "descuido es peor que dejarla de más.")
    a = ap.parse_args()

    bd = config.DB_PATH
    print("=" * 72)
    print("  DATOS DE EJEMPLO — personas inventadas, ninguna real")
    print("=" * 72)
    print(f"  base   {bd}")
    print()

    if a.borrar:
        n = retirar()
        print(f"  {n} filas retiradas")
        return

    con = sqlite3.connect(bd)
    cuentas = _quien_administra(con)
    con.close()

    if a.incluirme_a_mi:
        conservar = []
    elif a.conservar is not None:
        quedan = {u.lower() for u in a.conservar}
        conservar = [c[0] for c in cuentas if c[2].lower() in quedan]
        desconocidas = quedan - {c[2].lower() for c in cuentas}
        if desconocidas:
            raise SystemExit(
                f"  ABORTA: no existe la cuenta {', '.join(sorted(desconocidas))}. "
                "Nada se ha tocado.")
    else:
        conservar = [c[0] for c in cuentas]

    if cuentas:
        print("  CUENTAS QUE EXISTEN:")
        for pid, nombre, usuario in cuentas:
            marca = "SE CONSERVA" if pid in conservar else "SE BORRA"
            print(f"    · {nombre} ({usuario}) — {marca}")
        print()

    _, plan = vaciar(bd, conservar, simular=True)
    print("  SE BORRA:")
    for t, n in plan:
        print(f"    · {t:28} {n}")
    if not plan:
        print("    · nada, la base ya está vacía de datos")
    print()
    print("  SE SIEMBRA:")
    print(f"    · {len(EQUIPO)} fichas del equipo, con hoja de vida y jefatura")
    print(f"    · {len(RESPONSABLES)} responsables / tutores")
    print(f"    · {len(NINOS)} beneficiarios con la ficha completa")
    print(f"    · {len(VINCULOS)} vínculos entre familia y niño")
    print("    · un mes de asistencia por persona del equipo")
    print()

    if not a.ejecutar:
        print("  SIMULACIÓN. No se ha tocado nada.")
        print("  Para hacerlo de verdad:  py backend\\sembrar_ejemplo.py --ejecutar")
        print("=" * 72)
        return

    respaldo = _respaldo(bd, "sembrar-ejemplo")
    print(f"  respaldo: {os.path.basename(respaldo)}")
    borradas, _ = vaciar(bd, conservar, simular=False)
    print(f"  {borradas} filas borradas")

    db.iniciar()
    creado = sembrar()
    with open(REGISTRO, "w", encoding="utf-8") as f:
        json.dump(creado, f, ensure_ascii=False, indent=2)

    print(f"  sembrado: {len(creado['personal'])} del equipo · "
          f"{len(creado['responsables'])} responsables · "
          f"{len(creado['beneficiarios'])} beneficiarios · "
          f"{creado['marcas']} marcas")
    print(f"  registro: {os.path.basename(REGISTRO)}")
    print()
    print("  Para deshacerlo:  py backend\\sembrar_ejemplo.py --borrar")
    print("=" * 72)


if __name__ == "__main__":
    main()
