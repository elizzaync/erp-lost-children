# Módulo RRHH — Lost Children Perú

Sistema de Recursos Humanos para la ONG Lost Children of Peru, con
integración al terminal biométrico **Timmy TM-AI03F** a través de yunatt.

Esta es una **reescritura completa**: sustituye la primera versión de este
repositorio, que quedó descartada. El historial anterior sigue disponible en
`git log` y en las ramas `dev` y `refactor/frontend-arquitectura`.

## Qué hace hoy

| Módulo | Estado |
|---|---|
| Dashboard | conectado a la base |
| Hoja de Vida (personal, organigrama, documentos, contratos, beneficiarios) | conectado |
| Asistencia y enrolamiento biométrico | conectado al terminal real |
| Condiciones y sueldos | conectado |
| Planillas | cálculo y cierre de período |
| Usuarios y permisos | login real, roles y registro de accesos |
| Bandeja de Solicitudes, Voluntarios, Capacitaciones, Evaluación, Homologación/SST | pantallas de diseño, aún sin base |

## Puesta en marcha

```bash
pip install -r backend/requirements.txt
cp backend/.env.example backend/.env     # y completar las credenciales
py backend/crear_director.py             # crea la primera cuenta
py backend/app.py                        # http://127.0.0.1:7801
```

## Lo que este repositorio NO contiene

El repositorio es público, así que estas dos cosas quedan fuera a propósito
y hay que ponerlas a mano en cada instalación:

- `backend/.env` — credenciales de yunatt; la cuenta está compartida con el
  ERP anterior y da acceso al terminal biométrico. Usa `.env.example` como
  plantilla.
- `data/` — la base y los adjuntos. Es estado de ejecución, no código: cada
  instalación tiene la suya, y va acumulando sueldos, documentos y fichas de
  beneficiarios. `py backend/app.py` la crea vacía en el primer arranque.

El sistema arranca **sin ningún registro**: las fichas de personal se crean
desde la propia interfaz, en Hoja de Vida → Agregar usuario. Las pantallas
que aún no leen de la base (Voluntarios, Capacitaciones, Evaluación) siguen
mostrando datos de maqueta con nombres inventados.

## Despliegue

```bash
docker compose up -d --build      # http://localhost:7801
```

En Coolify hay dos cosas que no pueden faltar, y ambas están explicadas en
**[docs/Despliegue_Coolify.md](docs/Despliegue_Coolify.md)**:

- un **volumen persistente en `/app/data`** — la base es un archivo SQLite y
  sin volumen se borra en cada redespliegue;
- poner `LOGIN_ESTRICTO=1` en cuanto el dominio sirva por HTTPS. Hasta
  entonces, cualquiera con la URL entra al sistema completo.

## Documentación

**[LEEME.md](LEEME.md)** explica el modelo de datos, el protocolo del
terminal, el sistema de usuarios y permisos, el rango de IDs reservado
durante la transición desde el ERP anterior, y las decisiones de diseño con
su motivo.

## Pendiente antes de producción

- HTTPS y servidor WSGI en el VPS; hasta entonces `LOGIN_ESTRICTO` sigue en
  `0` y el sistema funciona en modo convivencia.
- Interfaz móvil para los voluntarios.
- Revisión de la Ley 29733 de protección de datos personales antes de cargar
  datos reales de menores.
