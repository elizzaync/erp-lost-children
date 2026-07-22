# Despliegue en Contabo con Docker + Coolify (acceso por IP pública)

Servidor Contabo con Coolify ya instalado, usado también para otros
proyectos por dominio (vía Cloudflare + Let's Encrypt automático).

Este despliegue es **distinto**: se decidió acceder por la IP pública
directa del servidor, sin dominio, así que **no** se usa el enrutamiento
por dominio de Traefik/Coolify para este servicio — el propio contenedor
`app` termina TLS con un certificado autofirmado.

A lo largo de esta guía, `PUBLIC_IP` y `PUBLIC_PORT` son las variables de
entorno reales que defines en el `.env` del servidor (Paso 2) — no van
escritas literalmente en ningún archivo del repo (que es público) para no
fijar la IP real de tu infraestructura en el código versionado.

## Arquitectura

```
Internet ──PUBLIC_PORT── [contenedor app: gunicorn+gevent, TLS propio] ──red interna── [contenedor db: MySQL 8]
```

- `app`: Flask (bridge/server.py) servido por gunicorn (worker gevent, **1
  solo worker** — ver por qué en el Dockerfile).
- `db`: MySQL 8, solo alcanzable desde `app` dentro de la red de Docker
  Compose — nunca expuesto a internet.
- El Timmy (dispositivo biométrico) sigue en la LAN de la ONG y sigue
  hablando con `global.yunatt.com` como siempre — el bridge en Contabo solo
  necesita salida a internet para hacer polling a yunatt.com cada 20s, no
  necesita estar en la misma red que el dispositivo.

## Paso 1 — Generar el certificado autofirmado (en el propio servidor)

Por SSH en el Contabo (reemplazar `PUBLIC_IP` por la IP real del servidor):

```bash
mkdir -p ~/erp-lost-children/bridge/ssl
cd ~/erp-lost-children/bridge/ssl
openssl req -x509 -nodes -newkey rsa:2048 \
  -keyout key.pem -out cert.pem -days 3650 \
  -subj "/CN=PUBLIC_IP" \
  -addext "subjectAltName=IP:PUBLIC_IP"
```

Esto genera un certificado válido por 10 años para esa IP. El navegador
mostrará una advertencia de "conexión no segura" la primera vez (es
autofirmado, no lo emite una autoridad reconocida) — se acepta una vez,
igual que pasó con el túnel de VS Code.

Si en algún momento cambia la IP pública del servidor, hay que regenerar
el certificado con la IP nueva.

## Paso 2 — Variables de entorno

Crear `~/erp-lost-children/.env` (NO se versiona, vive solo en el
servidor) con:

```bash
PUBLIC_IP=<IP pública real del servidor>
PUBLIC_PORT=8443
DB_USER=erp_user
DB_PASSWORD=<contraseña fuerte, generarla nueva>
DB_NAME=erp_lost_children
MYSQL_ROOT_PASSWORD=<otra contraseña fuerte, distinta>
YUNATT_EMAIL=<la misma cuenta de yunatt.com ya en uso — ver bridge/.env de la PC de la ONG>
YUNATT_PASSWORD=<la contraseña real de yunatt.com — ver bridge/.env de la PC de la ONG>
```

`PUBLIC_IP`/`PUBLIC_PORT` son los que usa `docker-compose.yml` para armar
`CORS_ORIGINS` y el mapeo de puertos — sin esto el frontend no podrá
llamar a la API por CORS.

Si se despliega vía el panel de Coolify (recomendado en vez de `.env`
suelto): estas mismas variables se cargan en **Coolify → tu recurso → 
Environment Variables**, marcadas como secretas. Coolify las inyecta al
`docker-compose.yml` de la misma forma.

## Paso 3 — Desplegar

**Opción A — Coolify, tipo de recurso "Docker Compose":**
1. Nuevo recurso → Docker Compose → apuntar al repo de GitHub
   (`erp-lost-children`, rama `main`) → Coolify detecta `docker-compose.yml`.
2. Cargar las variables de entorno del Paso 2 en el panel.
3. **Importante**: como no hay dominio, en la configuración de red del
   recurso desactivar el enrutamiento automático por dominio de Coolify y
   dejar el mapeo de puertos definido por `PUBLIC_PORT` (default 8443 en
   `docker-compose.yml`) para que quede expuesto directo en la IP del
   servidor.
4. Deploy.

**Opción B — `docker compose` directo por SSH** (si el flujo de Coolify sin
dominio da problemas):
```bash
cd ~/erp-lost-children
docker compose up -d --build
```

## Paso 4 — Abrir el puerto en el firewall

`PUBLIC_PORT` (8443 por defecto) casi seguro no está abierto por defecto
(Coolify normalmente solo abre 22/80/443). Por SSH:
```bash
sudo ufw allow 8443/tcp
sudo ufw status
```
Revisar también si Contabo tiene un firewall a nivel de panel de cliente
(algunos planes lo traen) — ahí también hay que permitir el puerto.

## Paso 5 — Migrar los datos existentes (personas, asistencia, etc.)

Desde la PC de la ONG, exportar la base actual:
```bash
mysqldump -u root erp_lost_children > erp_lost_children_dump.sql
```
Copiar ese archivo al servidor (`scp`) e importarlo dentro del contenedor
de MySQL ya desplegado:
```bash
docker compose exec -T db mysql -u erp_user -p erp_lost_children < erp_lost_children_dump.sql
```
Hacer esto **antes** de dar por buena la migración de fotos —
`bridge/static/fotos/`, `comprobantes/` y `articulos/` también hay que
copiarlos al volumen correspondiente (`erp_fotos`, `erp_comprobantes`,
`erp_articulos`) con `docker cp` o montando el volumen y copiando los
archivos directamente.

## Paso 6 — Primer acceso

Si es una base de datos nueva (sin el dump del Paso 5), `_init_usuarios()`
crea automáticamente `admin`/`coord`/`voluntario` con contraseñas
aleatorias — verlas en el log:
```bash
docker compose logs app | grep "->"
```
Si se migró la base existente, ya tienes tus usuarios y contraseñas de
siempre (o el usuario `admin2` que se creó en esta misma sesión).

## Verificar que quedó bien

```bash
curl -k https://PUBLIC_IP:8443/health
# {"ok": true, "mysql": true}
```

## Pendientes conocidos (heredados de la auditoría de seguridad)

- **CSP con `unsafe-inline`** sigue sin corregirse (decisión explícita del
  equipo) — con tráfico público real en vez de un túnel de demo, esto sube
  de prioridad. Ver `docs/Auditoria_Seguridad_Calidad_2026-07-21_v2.docx`,
  sección 5.1.
- **1 solo worker de gunicorn**: no escalar réplicas de este contenedor en
  Coolify sin antes mover las sesiones a Redis y des-duplicar los hilos de
  fondo (sync de yunatt, watcher de asistencia).
- El certificado autofirmado seguirá mostrando advertencia en el navegador
  a cada persona nueva que entre — es el costo de no tener dominio. Si más
  adelante se consigue un subdominio en `esystemtic.com` para este ERP,
  Coolify puede emitirle un certificado real de Let's Encrypt sin este
  paso manual.
