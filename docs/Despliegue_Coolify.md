# Despliegue en Coolify

El módulo se despliega como **un solo contenedor**. A diferencia del ERP
anterior no hace falta servidor de base de datos: usa SQLite, un archivo
dentro de `data/`.

Eso simplifica el despliegue y traslada toda la responsabilidad al volumen.

---

## 1. Lo que no puede faltar: el volumen

> **Sin un volumen persistente en `/app/data`, cada redespliegue borra la base
> de datos.** Se pierden las cuentas de usuario, los sueldos registrados, los
> documentos subidos y las fichas de beneficiarios.

`docker-compose.yml` ya declara el volumen `rrhh_datos`. Si en Coolify se usa
el modo «Dockerfile» en lugar de «Docker Compose», hay que añadir el montaje a
mano en **Storages**:

| | |
|---|---|
| Destino | `/app/data` |
| Tipo | Volume |

Compruébalo antes del primer despliegue, no después: el aviso llega tarde
cuando la base ya se fue.

---

## 2. Variables de entorno

Se configuran en el panel de Coolify. **Ninguna va en el repositorio.**

### Terminal biométrico

Sin estas, la Asistencia y el enrolamiento quedan inactivos; el resto del
sistema funciona con normalidad.

| Variable | Nota |
|---|---|
| `YUNATT_EMAIL` | cuenta compartida con el ERP anterior durante la transición |
| `YUNATT_PASSWORD` | |
| `YUNATT_DEVICE_ID` | |
| `YUNATT_DEPT_ID` | |
| `YUNATT_DEPT_NAME` | por defecto `RRHH-Nuevo` |

### Acceso

| Variable | Por defecto | Cuándo cambiarla |
|---|---|---|
| `LOGIN_ESTRICTO` | `0` | a `1` cuando el dominio sirva por HTTPS |
| `COOKIE_SECURE` | `0` | a `1` junto con la anterior |

---

## 3. El primer arranque, en orden

El orden importa. Hecho al revés, el sistema queda un rato accesible sin
contraseña en una URL pública.

1. **Despliega con `LOGIN_ESTRICTO=0`.** La base se crea sola y se puebla con
   los 20 registros de `backend/_semilla_personal.json`.

2. **Comprueba que responde**: `https://tu-dominio/api/health` debe devolver
   `{"ok": true, ...}`.

3. **Crea la cuenta de Director** desde la terminal del contenedor, en Coolify:

   ```
   python backend/crear_director.py
   ```

   Pide a qué ficha vincularla, el nombre de usuario y la contraseña. No hay
   ninguna contraseña por defecto en el código.

4. **Cierra el acceso**: pon `LOGIN_ESTRICTO=1` y `COOKIE_SECURE=1`, y
   redespliega. No hace falta reconstruir la imagen ni tocar código.

> ⚠️ **Mientras `LOGIN_ESTRICTO` sea `0`, cualquiera que tenga la URL entra al
> sistema completo.** La pantalla de acceso muestra un botón «Entrar sin
> cuenta» — es lo que evita dejar fuera al equipo mientras se reparten las
> cuentas en la red local, pero en una URL pública significa exactamente lo que
> parece. No cargues datos reales antes del paso 4.

---

## 4. Por qué un solo trabajador

El `CMD` del Dockerfile fija `-w 1`. **No subirlo** sin cambiar el código
antes.

`enrolamiento._sesiones` es un diccionario en la memoria del proceso: guarda
las capturas biométricas en curso. Con dos trabajadores, una captura iniciada
en uno no existiría para el otro, y la pantalla se quedaría preguntando por un
enrolamiento que «no existe».

Las sesiones de login sí viven en tabla, así que ese lado sí escalaría. El
enrolamiento es lo que ata al proceso único. La concurrencia se cubre con
`--threads 8`, que comparten esa memoria.

---

## 5. Copias de seguridad

La base es **un solo archivo**, así que el respaldo es una copia de
`/app/data/rrhh.db`. Conviene programarlo en el servidor: es lo único que no se
puede reconstruir desde el repositorio.

`data/archivos/` guarda los documentos y contratos subidos por el equipo — el
mismo volumen, la misma copia.

---

## Historial

El ERP anterior se desplegaba desde este mismo repositorio con MySQL, TLS
autofirmado y acceso por IP directa. Esa configuración sigue disponible en el
historial y en las ramas `dev` y `refactor/frontend-arquitectura`:

```
git show <commit-anterior>:docker-compose.yml
git show <commit-anterior>:docs/Despliegue_Docker_Coolify.md
```
