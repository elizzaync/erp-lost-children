# Módulo RRHH — Lost Children Perú

Interfaz de RRHH con enrolamiento biométrico **real** contra el terminal
Timmy TM-AI03F a través de la cuenta de yunatt.com.

## Puesta en marcha

**1. Dependencias** (una sola vez)

```
pip install -r backend\requirements.txt
```

**2. Crear el departamento en yunatt** (una sola vez, a mano)

Entra al panel de yunatt.com → Departamentos → crea uno llamado
`RRHH-Nuevo`. No hace falta buscar su id: el backend lo resuelve solo
consultando `POST /department/list` y emparejando por nombre (sin
distinguir mayúsculas ni espacios sobrantes). El id no está visible en la
interfaz web de yunatt, por eso no se pide.

Si el nombre no aparece, el error dice exactamente qué departamentos sí
existen. Para verlos: `GET /api/yunatt/departamentos`.

Se usa un departamento aparte del que utiliza el ERP anterior para poder
distinguir de un vistazo qué entró por cada sistema, y para poder limpiar
o auditar uno sin tocar el otro.

**3. Credenciales**

Copia `backend\.env.example` a `backend\.env` y rellena `YUNATT_EMAIL` y
`YUNATT_PASSWORD`. El resto ya viene puesto. Nunca subas `.env` a git.

**4. Arrancar**

Doble click en `iniciar.bat`, o bien:

```
python backend\app.py
```

Se abre `http://127.0.0.1:7801/`.

> **Ábrelo siempre por esa dirección, no haciendo doble click en el
> `.dc.html`.** El servidor sirve la interfaz y la API desde el mismo
> origen; abriendo el archivo directamente el navegador bloquea las
> llamadas al backend por CORS.

## Modelo de datos

    personal ──┐
               ├──► identidades ──► marcas
  beneficiarios┘   (staffNumber,     (fecha, hora)
                    biométricos)

`personal` (Hoja de Vida) y `beneficiarios` son entidades **separadas**:
un colaborador tiene cargo, área y contrato; un niño tiene casa, sala y
grado. No comparten campos.

Lo que sí es idéntico para ambos es marcar en el terminal, y eso vive una
sola vez en `identidades`: el `staffNumber`, el estado biométrico y las
marcas. **Las marcas apuntan a la identidad, no a la persona**, así que el
enrolamiento y la sincronización funcionan igual sin saber quién hay
detrás. La vista `v_identidades` aplana la resolución para que Asistencia
no tenga que ramificar por tipo.

La integridad la garantiza el motor: un `CHECK` obliga a que cada identidad
tenga **exactamente un** titular, y dos `UNIQUE` impiden que una persona
tenga dos identidades. Se descartó el patrón polimórfico (`tipo` +
`titular_id`) justamente porque SQLite no puede validarlo.

## Dónde se registra a una persona

**Una sola vez, en Hoja de Vida** (o en Beneficiarios). Esa ficha es la
fuente única: Asistencia y Planillas la leen, no tienen copia.

El enrolamiento biométrico es un atributo de alguien que ya existe. Por eso
"Agregar registro" en Asistencia **elige de una lista** de quienes aún no
tienen identidad, en vez de pedir el nombre otra vez.

Dos borrados distintos, que conviene no confundir:

- **Quitar del terminal** (papelera en Asistencia) elimina la identidad del
  dispositivo, de yunatt y de la base. La ficha se conserva y la persona
  vuelve a aparecer como candidata a enrolar.
- **Borrar la ficha** (Hoja de Vida) la elimina del todo. Si estaba enrolada, se
  la quita antes del terminal: la cascada de SQLite no llega al hardware.

## El flujo de captura

Asistencia → **Agregar registro** → elegir a la persona de la lista →
método (Rostro / Huella / Ambos) → **Iniciar captura biométrica**.

A partir de ahí:

1. El backend reserva un `staffNumber`, da de alta a la persona en yunatt
   y manda el comando `remoteadduser` al terminal.
2. El terminal cambia solo a modo registro y espera a la persona.
3. La interfaz muestra **Reconociendo…** con cuenta atrás de 2 minutos.
4. Al captarse el biométrico, pasa a **Captura correcta**; si nadie se
   acerca o se cancela en el equipo, muestra el error y permite reintentar
   sin consumir otro número.
5. La persona aparece en la tabla de asistencia.

Con **Ambos** son dos fases: primero el rostro y, al confirmarse, el
backend manda solo el comando de huella (la interfaz indica *Paso 2 de 2*).
El terminal no admite registrar las dos modalidades en un solo comando.

## Qué está conectado a la base y qué no

Conectado y funcionando contra `data/rrhh.db` y el terminal:

- **Hoja de Vida · Directorio** — las 23 fichas, con alta, edición y borrado.
- **Hoja de Vida · Organigrama** — árbol armado desde `jefe_id`; quien no
  tiene jefe sale en una sección aparte, no se esconde.
- **Hoja de Vida · Documentos y Contratos** — tabla `documentos`, tanto
  dentro de cada ficha como en la vista consolidada del módulo.
- **Asistencia** — enrolamiento, marcas, vistas diaria, semanal y mensual,
  editar y quitar del terminal.
- **Contadores** del menú lateral y de los chips de método.

Sigue siendo maqueta, porque **todavía no existe ese dato en la base**:
Dashboard, Planillas, Bandeja de Solicitudes, Voluntarios, Capacitaciones,
Homologación/SST, Evaluación de Desempeño, Reportes, y la pestaña
*Beneficiarios* de Hoja de Vida.

En Asistencia, la tabla de la maqueta se conserva **debajo** de la sección
real y separada de ella, para no mezclar datos inventados con datos del
terminal.

## Documentos y contratos

Viven en una sola tabla (`documentos`, con un campo `tipo`) y se ven de dos
formas, sin duplicar el dato:

- **Dentro de la ficha** de cada persona, en sus pestañas *Documentos* y
  *Contratos*. Ahí se registran, se corrigen y se eliminan.
- **A nivel de módulo**, en Hoja de Vida → pestañas *Documentos* y
  *Contratos*: todas las personas en una lista, con filtro por estado y un
  enlace por fila a la ficha correspondiente.

El estado **Vigente / Por vencer / Vencido** no se edita: se calcula con la
fecha de vencimiento (vencido si ya pasó, por vencer si faltan 30 días o
menos). Poder forzarlo a mano vaciaría de sentido las alertas.

Los avisos del Dashboard llevan a la vista consolidada con el filtro ya
aplicado, no a una ficha suelta.

Se adjunta el **archivo real** (PDF, Word, ODT o imagen, hasta 15 MB): el
sistema no genera documentos, guarda el que la organización ya tiene. Los
archivos van a `data/archivos/` con un nombre interno generado, nunca con
el que trae el usuario; el original se conserva aparte y solo se usa al
descargar. El adjunto es opcional: se puede registrar la vigencia antes de
tener el papel escaneado.

## Beneficiarios: nada de perfiles inventados

En Beneficiarios **no se ponen datos de ejemplo verosímiles de menores**,
ni siquiera como demostración.

El archivo de diseño original traía 12 perfiles (`Ángel M.`, `Dayana Q.`…)
y un generador que les fabricaba un expediente de protección completo: DNI,
expediente judicial, vía de ingreso por derivación judicial, referente
familiar, régimen de visitas e historia de vida año por año. Todo inventado
a partir del índice de la lista, y **indistinguible de un caso real**. Se
eliminó por completo.

Lo que queda son marcadores obviamente ficticios (`Beneficiario de prueba
01`) con los campos en *Sin registrar*. La estructura de la ficha —Datos
personales, Educación, Salud, Acompañamiento, Documentos, Historia de
vida— se conserva, porque es la aprobada; lo que no se conserva es
contenido fabricado dentro de ella.

**Regla para el futuro:** cualquier dato de prueba en Beneficiarios va con
nombre genérico, sin número de documento y sin narrativa de caso. Lo mínimo
para comprobar que el campo funciona.

### Qué guarda la ficha

26 columnas: los 9 de siempre (nombre, documento, fecha de nacimiento, casa,
sala, grado, año de ingreso, estado) más 17 que cubren el expediente
completo — procedencia, lengua materna, vía de ingreso, expediente
judicial, situación legal, referente familiar, régimen de visitas,
institución educativa, rendimiento, refuerzo escolar, seguro, alergias,
control médico, tratamiento, tutor, psicóloga y plan de vida.

**Solo `nombre` es obligatorio.** Un niño puede llegar de noche por
derivación sin que se sepa aún su lengua materna, y bloquear el alta lleva
a que se inventen datos. La ficha se marca como **incompleta** y dice qué
le falta, con el mismo criterio que «sin jefe asignado» en el organigrama.

El expediente de un beneficiario real se abre desde su tarjeta en
«Registrados en el sistema», y **Editar expediente** reutiliza el mismo
formulario del alta, precargado: guardar actualiza esa ficha, no crea una
segunda. Sobre un marcador de la maqueta el botón lo explica en vez de
abrir un formulario que no guardaría nada.

**Tutor y psicóloga son claves foráneas a `personal`**, no texto libre: son
colaboradores que ya existen, y escribirlos a mano acabaría con «José
Puma», «J. Puma» y «jose puma» conviviendo como tres personas. Si esa
persona deja la ONG, `ON DELETE SET NULL` deja al niño sin tutor asignado
— nunca borra su ficha.

### Protección: lo que hay y lo que no

Los datos de beneficiarios viven **solo** en `data/rrhh.db` y **nunca** se
envían a yunatt ni al terminal biométrico.

Lo que NO hay, y está pendiente de decidir **antes de cargar datos reales
de menores**: cifrado del archivo, control de acceso por rol (hay un solo
login compartido) y registro de quién consulta qué. Los respaldos son
copias del `.db` sin cifrar.

### Sesiones de acompañamiento e incidencias

Dos tablas que cuelgan del beneficiario:

- `sesiones_acompanamiento` — fecha, tipo (individual, grupal, familiar,
  escolar, otra), quién la hizo y notas. El contador **Sesiones del año**
  del expediente cuenta estas filas del año en curso; antes era un número
  fijo de la maqueta.
- `incidencias` — fecha, gravedad (leve, moderada, grave), descripción,
  quién reporta y seguimiento.

Al borrar la ficha del niño se van con ella (CASCADE). Si quien la hizo
deja la ONG, el registro **se conserva** y queda sin responsable asignado:
borrar el acompañamiento de un menor porque alguien renunció sería perder
su historia.

> **`incidencias` es la tabla más sensible del sistema.** Registra hechos
> sobre un menor que pueden acabar en un informe al juzgado, y hoy
> **cualquiera que entre al sistema puede leerla y escribirla** — un solo
> login compartido, sin roles y sin registro de consultas. Se construyó
> asumiendo ese riesgo de forma consciente y **depende de la conversación
> de protección pendiente**. Las notas de una sesión tienen el mismo
> problema: pueden contener información de salud mental y situación
> familiar.

## Usuarios, roles y permisos

Hasta ahora el login era decorativo —comprobaba que los campos no
estuvieran vacíos y entraba— y los endpoints estaban abiertos a quien
llegara al puerto. Esto construye la autenticación por primera vez.

**Seis tablas:** `roles`, `usuarios`, `permisos_rol`, `sesiones_usuario`,
`intentos_login` y `accesos`.

`usuarios` **no duplica** a `personal`: es una capa encima, con
`personal_id` único. El nombre, el cargo y el área siguen viniendo de la
ficha, igual que `identidades` es solo la capa del terminal.

**Los permisos viven en el ROL, no en el usuario.** Con ~20 personas y ~6
cargos, dos Teen Leaders tienen lo mismo por construcción. La `clave`
normalizada del rol (`teen_leader`) es lo que impide que el mismo cargo
entre tres veces escrito distinto. Si algún día hace falta una excepción
individual, se añade `permisos_usuario` con la misma forma y la resolución
pasa a ser «excepción, si no el rol»: es una adición, no un rediseño.

**Un módulo sin fila de permiso nace CERRADO.** Al añadir un módulo nuevo
al catálogo, nadie lo ve hasta que se conceda explícitamente.

**Dos módulos van aparte a propósito:** `condiciones` (contiene los
sueldos) separado de `personal`, e `incidencias` separado de
`beneficiarios` — quien ve la ficha de un niño no tiene por qué ver su
historial de incidencias.

### El corte

`config.LOGIN_ESTRICTO` gobierna la transición, igual que `RANGO_ESTRICTO`
protege al ERP anterior:

- `False` (ahora) — quien no tiene cuenta entra como antes con permisos
  completos; quien sí la tiene entra con la suya y ya se le aplican sus
  permisos. Nadie se queda fuera mientras se reparten las cuentas.
- `True` — sin cuenta no se entra.

> **No poner `True` antes de tener HTTPS.** Hoy da igual porque el login
> no verifica nada; en cuanto verifique, las contraseñas viajan por la red
> y sin HTTPS lo harían en claro.

### El primer Director

No hay ningún usuario por defecto en el código: una contraseña conocida
que viaja con el proyecto es una puerta trasera con otro nombre. Se crea
ejecutando una vez, con acceso al disco de la máquina:

```
py backend\crear_director.py              crea el primer Director
py backend\crear_director.py --resetear jperez   rescate si alguien se queda fuera
py backend\crear_director.py --listar     quién tiene cuenta
```

El sistema impide quedarse sin Directores activos, pero no impide olvidar
una contraseña: por eso existe `--resetear`.

### La pantalla

La interfaz ya no finge. Antes mostraba un login decorativo y el nombre
«Mariela Quispe» fijo en la barra lateral aunque no supiera quién estaba
delante.

- **Entrada por usuario**, no por correo: los nombres son cortos
  (`jramirez`) porque no todo el equipo tiene correo institucional.
- **El menú se arma con los permisos.** Un módulo al que no se llega no
  aparece; en «solo ver» desaparecen los botones de crear, editar y
  borrar, y también las pestañas de Hoja de Vida que son otro módulo
  (Contratos, Beneficiarios…).
- **Cambio de contraseña obligatorio** la primera vez. A quien le crean la
  cuenta le dan una clave inicial: hasta que la cambie, la saben dos
  personas. Por eso no se llega a ninguna pantalla antes de pasar por ahí.
- **El módulo Usuarios** tiene tres pestañas: las cuentas, los cargos con
  su matriz de permisos, y el registro de accesos.

> Esconder botones **no es la barrera**. La barrera son los 51
> `@auth.requiere` del backend, y `prueba_permisos.py` los ataca llamando
> a la API directamente, sin pasar por la pantalla.

### Durante la convivencia, los permisos son un ensayo

Con `LOGIN_ESTRICTO = False` hay un efecto que conviene tener presente:

> **Cerrar sesión da MÁS acceso que estar dentro con un cargo limitado.**

Quien no trae sesión pasa con permisos completos —es justo lo que evita
que alguien se quede fuera mientras se reparten las cuentas—, así que un
usuario restringido puede saltarse sus límites cerrando sesión. La
pantalla de entrada lo dice con todas las letras y ofrece un botón
**«Entrar sin cuenta»** que desaparece solo al activar el corte.

No es un defecto que haya que tapar ahora: sin HTTPS tampoco serían una
barrera real, porque las contraseñas viajarían en claro de todos modos.
**La protección empieza a existir el día del corte.** Hasta entonces,
conviene probar los permisos, no confiar en ellos.

### Detalles que importan

- **Contraseñas** con `pbkdf2_hmac` (librería estándar, sin dependencias
  nuevas), salt por usuario, 240 000 iteraciones. El algoritmo y las
  iteraciones van dentro del hash, así que subirlas después no invalida
  las claves existentes. **Nunca se registra una contraseña**, ni al fallar.
- **Sesiones en tabla**, no en cookie firmada: así suspender a alguien lo
  echa en el acto en vez de esperar a que caduque. 8 h de tope y 45 min de
  inactividad — pensado para celulares prestados, no para un PC con dueño.
- **CSRF**: las peticiones que escriben exigen el token de la sesión.
- **Bloqueo** a los 5 fallos durante 15 min, contando por usuario **y por
  IP**: solo por usuario, probar cinco claves contra cien usuarios no
  costaría nada.
- **`accesos`** guarda quién tocó qué módulo y con qué resultado. El nombre
  se copia como texto para que el registro siga siendo legible aunque la
  cuenta se borre.

## Las cuatro vistas de Asistencia

La barra con **Día**, **Sincronizar marcas** y **Agregar registro** es común
a las cuatro pestañas: el día elegido manda en todas.

- **Vista diaria** — entrada, salida, horas y estado de cada persona.
- **Vista semanal** — la semana (lunes a domingo) del día elegido. En verde
  las horas trabajadas; en azul la hora de entrada cuando solo hay una
  marca y no se puede calcular la jornada.
- **Calendario mensual** — cuántas personas enroladas marcaron cada día del
  mes del día elegido. El día seleccionado va con borde azul.
- **Justificaciones** — sigue siendo maqueta.

Las tres primeras leen del terminal. Las tablas de la maqueta se conservan
debajo, separadas, para no mezclar datos reales con datos de ejemplo.

## Editar y quitar del terminal

En **Hoja de Vida**, el lápiz de cada fila abre la ficha: nombre,
documento, cargo, área, sede, vínculo y ámbito. El nombre se propaga al
terminal porque es el que muestra al marcar; si yunatt falla, la edición
local se conserva y se avisa de que el terminal sigue con el nombre
anterior — es preferible a perder el cambio entero por un problema de red.
La columna **Terminal** indica si esa persona está enrolada y con qué ID.

En **Asistencia**, el lápiz lleva a esa misma ficha (no hay un segundo
editor), y la papelera **quita del terminal**. Eso no es una operación
local: elimina la identidad del dispositivo físico, de la cuenta de yunatt
y de la base, y tanto el equipo como la cuenta están compartidos con el ERP
anterior. Por eso la papelera solo abre un diálogo; la acción exige una
segunda confirmación sobre un aviso que explica el alcance.

El orden importa: primero se quita del equipo y después de la nube. Al
revés, yunatt ya no sabría a quién mandar el comando de borrado remoto.

## Marcas del día (entradas y salidas)

El enrolamiento registra a la persona en el terminal; las marcas diarias
son otra cosa y llegan por separado.

En Asistencia hay un botón **Sincronizar marcas**. Descarga del informe
mensual de yunatt las marcas del mes y guarda las del rango reservado.
Es **manual a propósito**: cada sincronización consulta yunatt, y la cuenta
está compartida con el ERP anterior mientras dure la transición. Un hilo en
segundo plano multiplicaría esas consultas sin que nadie las pidiera.

Detalles de cómo interpreta las marcas:

- El terminal registra marcas sueltas, no pares entrada/salida. Se toma la
  primera del día como entrada y la última como salida.
- Con **una sola marca** no se puede saber la salida: se deja vacía en vez
  de repetir la entrada, que daría a entender que la persona ya se fue.
- Las horas se calculan entre la primera y la última marca, contemplando
  turnos que cruzan la medianoche.
- Sin marcas el estado es *Sin marcar*, no *Ausente*: puede que la persona
  aún no haya llegado o que no se haya sincronizado todavía.

## Biometría del terminal

El TM-AI03F lee **rostro y huella**. Los códigos que usa yunatt en
`backupnums`: `50` rostro, `0-9` huella, `10` PIN, `11` tarjeta.

Si alguna vez se instala un terminal sin lector de huella, poner
`SOPORTA_HUELLA=0` en `backend/.env` desactiva *Huella* y *Rostro y huella*
en la interfaz y el backend los rechaza. Hay además una red de seguridad:
si se pide una huella y el equipo registra un rostro, se detecta al
instante en lugar de esperar los dos minutos completos.

## Rango de IDs reservado — importante durante la transición

Mientras el ERP anterior siga en producción, los dos sistemas comparten la
misma cuenta de yunatt. Para que no se pisen las identidades, este sistema
solo puede tocar `staffNumber >= 9000`.

Está definido en un único sitio: **`backend/config.py`**, constantes
`STAFF_NUMBER_BASE` y `RANGO_ESTRICTO`. El comentario de ese bloque explica
cómo quitar la restricción el día que apagues el ERP anterior.

Se aplica en dos capas:

- al asignar números nuevos, y
- como guarda dura: cualquier escritura hacia yunatt con un número fuera
  del rango lanza excepción y no llega a salir.

Además, al sincronizar marcas se descartan las de `staffNumber` ajeno, para
no absorber asistencia que pertenece al ERP anterior.

## Sesiones concurrentes

Los dos sistemas se autentican con la misma cuenta. yunatt puede invalidar
la sesión más antigua al abrirse una nueva. Este backend lo minimiza:
login perezoso, sin sincronización en segundo plano y re-login con espera
progresiva. Aun así, conviene no enrolar desde los dos sistemas a la vez.

## Estructura

```
backend/
  app.py             servidor: interfaz estática + API
  yunatt_client.py   transporte HTTP hacia yunatt (TLS 1.3, sesión)
  enrolamiento.py    máquina de estados de la captura
  personas.py        fichas de personal y desenrolamiento
  db.py              SQLite local
  config.py          configuración y RANGO RESERVADO
data/rrhh.db         base de datos local (se crea sola)
```

No comparte base de datos, procesos ni archivos con el ERP anterior.

## API

| Método | Ruta | |
|---|---|---|
| `GET` | `/api/health` | estado del servicio y del rango |
| `GET` | `/api/yunatt/estado` | sesión, dispositivo, departamento, último error |
| `GET` | `/api/yunatt/departamentos` | departamentos vistos y a cuál se resolvió |
| `GET` | `/api/personal` | fichas del personal con su estado biométrico |
| `PUT` | `/api/personal/<id>` | también actualiza `jefe_id` (organigrama) |
| `POST` | `/api/personal` | crea una ficha |
| `PUT` | `/api/personal/<id>` | edita la ficha (el nombre se propaga al terminal) |
| `DELETE` | `/api/personal/<id>` | borra la ficha; la desenrola antes si hace falta |
| `GET` | `/api/beneficiarios` | fichas de beneficiarios |
| `GET` | `/api/identidades` | quiénes están enrolados |
| `DELETE` | `/api/identidades/<sn>` | quita del terminal y de yunatt; conserva la ficha |
| `GET` | `/api/candidatos` | quiénes tienen ficha y aún no están enrolados |
| `POST` | `/api/enrolamiento` | inicia la captura |
| `GET` | `/api/enrolamiento/<sn>/estado` | avance (lo sondea la interfaz) |
| `POST` | `/api/enrolamiento/<sn>/reintentar` | reenvía el comando |
| `POST` | `/api/enrolamiento/<sn>/cancelar` | deja de esperar |
| `GET` | `/api/asistencia?fecha=` | marcas del día |
| `GET` | `/api/asistencia/rango?desde=&hasta=` | marcas por persona y día (semanal y calendario) |
| `POST` | `/api/asistencia/sync` | descarga marcas de yunatt |
| `GET` | `/api/responsables/<id>/foto` | la foto del tutor, para verla en su ficha |
| `POST` | `/api/responsables/<id>/foto` | la pone o la reemplaza; se endereza, reduce y limpia de metadatos |
| `DELETE` | `/api/responsables/<id>/foto` | la quita; la ficha se conserva entera |
| `GET` | `/api/invitaciones` | los enlaces del formulario entregados a cada familia |
| `POST` | `/api/invitaciones` | crea uno; devuelve el enlace listo para entregar |
| `POST` | `/api/invitaciones/<id>/anular` | lo deja sin efecto, conservando el rastro |
| `GET` | `/api/formulario/respuestas` | la bandeja, con el estado del sondeo automático |
| `POST` | `/api/formulario/traer` | lee la hoja y guarda en la bandeja lo que aún no estaba |
| `POST` | `/api/formulario/respuestas/<id>/ingresar` | la lleva a una ficha; nunca si no autorizó |
| `POST` | `/api/formulario/respuestas/<id>/descartar` | la deja fuera, con el motivo escrito |
| `GET` | `/api/permisos/<id>/sustento` | el documento que respalda un permiso |
| `POST` | `/api/permisos/<id>/sustento` | lo adjunta; solo quien lo pidió y solo sin resolver |

## Resuelto: el estado de enrolamiento (2026-08-20)

Era **un fallo real y encadenado**, no de visualización. La fila de
identidad se crea al PEDIR el enrolamiento, y todo lo que la leía sin
mirar más daba por enrolada a esa persona: cuatro intentos cancelados
dejaron a cuatro personas fuera de la cola sin que nadie lo notara, y el
motor rechazaba reintentar con un mensaje falso («ya está enrolada»).

Ahora **«enrolado» se calcula en un solo sitio** —la vista
`v_identidades`, columna `enrolado`— y significa lo que el terminal
confirmó: rostro o huella guardados. `sin_enrolar()` excluye por eso y no
por «tiene fila»; el reintento reaprovecha el número anterior en vez de
crear una segunda identidad; y Registro de Asistencia solo cuenta a quien
puede marcar.

**Las vistas se rehacen en cada arranque** (`DROP VIEW` antes del
esquema). Con `CREATE VIEW IF NOT EXISTS`, una base ya creada conservaba
la definición vieja en silencio, que es como esto pasó inadvertido.

Lo cubren `prueba_enrolado_real` y `prueba_biometria_estado`, y
`verifica_aplicado` comprueba contra la base REAL que la vista no se haya
quedado atrás.

## El banco de pruebas arranca vacío (2026-08-24)

Las suites corren contra una COPIA de la base real, y esa copia se
**vacía** antes de empezar: fuera personas, fichas, solicitudes,
identidades, cuentas y rastro. Se conservan roles, permisos y parámetros,
que son configuración y no datos de nadie.

El motivo: cuatro suites fallaron por dar por hecho que la base estaba
vacía —«deben quedar tres respuestas», «el primer botón Editar es el
mío»—. Eran ciertas al escribirlas y falsas en cuanto la organización
tuvo datos, así que la lista de fallos subía a cada ficha nueva.

Se conserva la copia del esquema real (no una base inventada) porque eso
sí hay que probarlo: es donde aparecen las columnas que faltan y las
migraciones a medias.

## Las horas de un permiso no tocan el saldo (2026-08-24)

`solicitudes` tiene `hora_desde` y `hora_hasta` para los permisos que no
ocupan el día entero. Son **información**: no entran en `dias()` ni en
`saldo_vacaciones()`.

Está así a propósito. La pregunta «¿un permiso de tres horas descuenta
día de vacaciones, medio día o nada?» no está respondida, y suponerla
cambiaría los derechos de las personas por una decisión que nadie tomó.
Cuando se decida, se aplica en `solicitudes.py` y en un solo sitio.

## La dirección recuerda la pantalla (2026-08-24)

La barra lleva `#/personal`, `#/beneficiarios`, etc., y al recargar se
vuelve ahí en vez de al Dashboard. No se recuerdan: el cambio de
contraseña obligatorio (guardar esa dirección sería saltarse el flujo),
las fichas concretas —se vuelve a su lista— y los módulos que el cargo de
quien entra no alcanza, que caen al Dashboard.

Se eligió esto en vez de partir el `.dc.html` en archivos por módulo: el
problema real era que la aplicación no recordaba dónde estabas, y separar
archivos no lo habría resuelto por sí solo.
