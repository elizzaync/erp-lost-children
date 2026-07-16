# Fase 2 — Multi-Timmy: verificación de datos e instalación en empresa

**Proyecto:** ERP Lost Children
**Fecha:** 2026-07-14
**Alcance:** Soportar 2 o más dispositivos Timmy TM-AI03F conectados a la misma
cuenta yunatt.com, garantizando integridad de las marcas de asistencia y sin
caídas del sistema; más la guía de instalación para la empresa.

---

## 1. Cómo funciona el flujo hoy (1 Timmy)

```
Timmy TM-AI03F ──ADMS/WebSocket──▶ global.yunatt.com
                                        │
                                        ▼  (cada 60s: login → monthDataId → filas)
                              bridge/yunatt_sync.py
                                        │
                                        ▼
                          MySQL: zkteco_logs + asistencia
                                        │
                                        ▼
                            ERP (Flask :7793) ──▶ navegador
```

**Puntos que hoy asumen un solo dispositivo:**

| Punto | Estado actual | Riesgo con 2+ Timmys |
|-------|---------------|----------------------|
| `DEVICE_ID = 22952` | Hardcodeado en `yunatt_staff_sync.py` | El enrollment remoto siempre apunta a un solo Timmy |
| Columna `dispositivo` | Fija en `'TIMMY-CLOUD'` | No se sabe en qué sede/dispositivo marcó la persona |
| Dedup `(zk_user_id, timestamp)` | Por persona + hora exacta | Dos Timmys con reloj desfasado → misma marca contada 2 veces |
| `monthDataId` | Uno por cuenta | yunatt ya agrega todos los devices; OK, pero hay que atribuir origen |

> **Hallazgo clave:** yunatt.com **ya consolida** las marcas de todos los
> dispositivos de la misma cuenta en una sola vista mensual. Por eso el "¿quién
> está presente hoy?" funciona sin cambios. Lo que falta es **atribución por
> dispositivo**, **tolerancia a desfase de reloj** y **resiliencia** ante un
> Timmy caído.

---

## 2. Los 3 riesgos a blindar (y su verificación)

### Riesgo A — Atribución: ¿en qué Timmy marcó la persona?

**Problema:** hoy todo se guarda como `'TIMMY-CLOUD'`. Con varias sedes no se
puede auditar dónde marcó cada quien.

**Solución:**
1. Tabla nueva `dispositivos` como catálogo de Timmys.
2. La columna `zkteco_logs.dispositivo` guarda el identificador real del device
   (SN o nombre yunatt), no una constante.
3. Al descargar de yunatt, leer el campo de dispositivo que trae cada fila
   (yunatt expone el origen en el detalle de la marca) y mapearlo.

```sql
CREATE TABLE IF NOT EXISTS dispositivos (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  yunatt_id      INT UNIQUE,              -- attenceMachineId de yunatt
  sn             VARCHAR(40) UNIQUE,      -- serial del Timmy
  nombre         VARCHAR(80),             -- "TM-AI03F Sede Norte"
  sede           VARCHAR(80),
  activo         TINYINT(1) DEFAULT 1,
  ultima_marca   DATETIME NULL,           -- para heartbeat/monitoreo
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Verificación (checklist de aceptación):**
- [ ] Cada fila en `zkteco_logs` tiene un `dispositivo` que existe en `dispositivos`.
- [ ] `SELECT dispositivo, COUNT(*) FROM zkteco_logs GROUP BY dispositivo` muestra
      conteos por cada Timmy real, no solo `TIMMY-CLOUD`.

### Riesgo B — Desfase de reloj: la misma persona "marca dos veces"

**Problema:** el TM-AI03F **pierde la hora al apagarse** (ya documentado). Si dos
Timmys tienen relojes desfasados 1–2 min, un mismo evento puede llegar como
`08:45` en uno y `08:46` en otro, y el dedup por hora exacta los cuenta como 2.

**Solución — dedup por ventana temporal:**
- Regla de negocio: **una persona no puede tener dos marcas válidas del mismo
  tipo dentro de N minutos** (recomendado N=3, configurable).
- Al reconciliar con `asistencia`, si ya existe una marca de esa persona ese día
  dentro de la ventana, se registra en `zkteco_logs` (auditoría completa) pero
  **no** se crea una segunda entrada de asistencia.

```sql
-- Antes de marcar presente, comprobar ventana de N minutos:
SELECT 1 FROM zkteco_logs
WHERE zk_user_id = %s
  AND ABS(TIMESTAMPDIFF(SECOND, timestamp, %s)) < %s   -- N*60
LIMIT 1;
```

**Mitigación de raíz (no solo software):**
- Fijar `timeZone = America/Lima` en la cuenta yunatt (ya pendiente en memoria).
- yunatt reenvía la hora al Timmy al reconectar → todos los devices de la cuenta
  quedan sincronizados a la misma zona. **Esta es la defensa principal.**

**Verificación:**
- [ ] Marcar con la misma persona en dos Timmys en < 1 min → una sola entrada en
      `asistencia`, dos filas en `zkteco_logs` (con distinto `dispositivo`).
- [ ] `SELECT zk_user_id, fecha, COUNT(*) FROM asistencia GROUP BY zk_user_id,
      fecha HAVING COUNT(*)>1` devuelve 0 filas.

### Riesgo C — Resiliencia: un Timmy caído no debe tumbar el sistema

**Problema:** el sync corre en un loop cada 60s. Hoy un fallo de red o de login
solo se registra en log; hay que garantizar que **un dispositivo offline no
detenga la ingesta de los demás** ni tumbe el servidor.

**Solución:**
1. **Aislamiento por device:** como yunatt agrega todo en un solo `monthDataId`,
   la caída de un Timmy simplemente significa "ese device no aporta marcas
   nuevas"; el sync sigue trayendo las de los demás. Ya es resiliente a nivel de
   ingesta. **Acción:** envolver cada dispositivo en su propio try/except al
   procesar, para que un dato corrupto de uno no aborte el lote completo.
2. **Heartbeat / monitoreo:** actualizar `dispositivos.ultima_marca` con cada
   marca recibida. Si un Timmy no reporta en > X horas hábiles, mostrar alerta
   en el ERP ("Timmy Sede Norte sin marcas desde …").
3. **Reintento con backoff:** el loop ya reintenta cada 60s. Añadir backoff
   exponencial ante fallos consecutivos de yunatt (60s → 120s → 300s tope) para
   no martillar el servidor cuando yunatt está caído.
4. **Idempotencia:** `INSERT IGNORE` ya garantiza que reprocesar el mismo mes no
   duplica. Un reinicio del servidor recupera el estado sin pérdida.

**Verificación:**
- [ ] Apagar un Timmy → el ERP sigue registrando marcas del otro sin errores.
- [ ] El ERP muestra el estado "offline" del Timmy apagado tras el umbral.
- [ ] Matar y reiniciar el servidor a mitad de sync → sin marcas duplicadas ni
      perdidas (idempotencia).

---

## 3. Cambios de código concretos (resumen de implementación)

> Esto es el **plan**; la implementación se hace en una tarea aparte con tu visto bueno.

1. **`DEVICE_ID` → catálogo dinámico.**
   - Reemplazar la constante por una función `get_dispositivos()` que lea la
     tabla `dispositivos` (o `/attenceMachine/query` de yunatt).
   - El enrollment remoto (`remoteadduser`) recibe el `attenceMachineId` destino
     como parámetro (a qué Timmy enviar la pantalla de registro).

2. **`yunatt_sync._save()` — atribución + dedup por ventana.**
   - Guardar el `dispositivo` real por fila.
   - Añadir el check de ventana de N minutos antes de crear entrada en `asistencia`.

3. **`yunatt_sync._yunatt_auto_loop()` — resiliencia.**
   - try/except por fila, backoff exponencial, actualización de `ultima_marca`.

4. **UI (`modules/asistencia.js`).**
   - Selector de Timmy destino en el enrollment ("Registrar cara en: [Sede Norte ▼]").
   - Panel de estado de dispositivos (online/offline + última marca).
   - Columna "Dispositivo/Sede" en el historial de marcas.

5. **Migración SQL** (`docs/sql/fase2_multitimmy.sql`): crear tabla `dispositivos`,
   añadir índice en `zkteco_logs(zk_user_id, timestamp)`, seed del Timmy actual
   (yunatt_id=22952).

---

## 4. Modelo de datos final (multi-Timmy)

```
dispositivos (catálogo de Timmys)
   id, yunatt_id, sn, nombre, sede, activo, ultima_marca
        │
        │ 1:N
        ▼
zkteco_logs (auditoría cruda, toda marca)
   id, zk_user_id, timestamp, tipo, metodo, dispositivo ──▶ FK lógica a dispositivos.sn/nombre
        │
        │ reconciliación (dedup por ventana)
        ▼
asistencia (estado del día por persona)
   persona_id, fecha, presente, hora, metodo, zk_user_id
```

Regla de oro: **`zkteco_logs` nunca deduplica por dispositivo** (guarda TODO para
auditoría). La deduplicación de negocio vive **solo** en la capa `asistencia`.

---

# GUÍA DE INSTALACIÓN PARA LA EMPRESA

## A. Requisitos previos

**Hardware:**
- 1 PC/servidor Windows 10/11 (el que corre el ERP), encendido en horario laboral.
- 1 o más dispositivos Timmy TM-AI03F.
- Red WiFi o Ethernet con salida a Internet (los Timmys se conectan a yunatt.com
  por su cuenta; el servidor también necesita Internet).

**Software en el servidor:**
- Python 3.11+ (`python --version`).
- XAMPP (MySQL/MariaDB) corriendo.
- Navegador moderno (Chrome/Edge).

**Cuentas:**
- Cuenta yunatt.com de la empresa (una sola cuenta para todos los Timmys).

## B. Instalación del servidor ERP

1. Copiar la carpeta `ERP_Lost_Children` al servidor (ej. `C:\Users\<usuario>\ERP_Lost_Children`).
2. Instalar dependencias de Python:
   ```
   pip install flask flask-cors requests mysql-connector-python
   ```
3. Arrancar XAMPP → iniciar **MySQL**.
4. Crear la base de datos e importar el esquema:
   - Abrir phpMyAdmin (`http://localhost/phpmyadmin`).
   - Crear la BD `erp_lost_children` (charset `utf8mb4`).
   - Importar el `.sql` del proyecto + `docs/sql/fase2_multitimmy.sql`.
5. Verificar credenciales de MySQL en `bridge/yunatt_sync.py` y
   `bridge/yunatt_staff_sync.py` (`DB_CONFIG`): usuario `root`, password vacío
   (ajustar si la empresa usa otro).
6. Configurar la cuenta yunatt en ambos archivos (`EMAIL`, `PASSWORD`).

## C. Puesta en marcha

1. Desde `C:\...\ERP_Lost_Children` ejecutar:
   ```
   python bridge/server.py
   ```
   Debe imprimir: `ERP Lost Children — puerto 7793` y `yunatt: auto-sync activo`.
2. Abrir el ERP en `http://localhost:7793`.
3. (Opcional) Crear acceso directo / tarea programada de Windows para que el
   servidor arranque al iniciar sesión (ver sección E).

## D. Alta de cada Timmy (por cada dispositivo)

**En el dispositivo:**
1. Conectar el Timmy a la red (WiFi o Ethernet) con salida a Internet.
2. Menú Admin → configurar la cuenta/servidor ADMS de yunatt de la empresa.
3. Confirmar en el Timmy que aparece "conectado" al servidor en la nube.

**En yunatt.com:**
4. El dispositivo aparece en `attenceMachine/index`. Anotar su `attenceMachineId`
   y su SN.
5. Fijar `timeZone = America/Lima` en la configuración de la cuenta (crítico para
   evitar desfase de reloj entre Timmys).

**En el ERP:**
6. Registrar el Timmy en la tabla `dispositivos` (yunatt_id, sn, nombre, sede).
7. Verificar que las marcas de ese Timmy aparecen en el historial con su
   dispositivo/sede correcta.

## E. Arranque automático (recomendado)

Crear un `.bat` (`iniciar_erp.bat`) en el escritorio:
```bat
@echo off
cd /d C:\Users\<usuario>\ERP_Lost_Children
python bridge\server.py
```
Y agregarlo al **Programador de tareas de Windows** disparado "Al iniciar
sesión", para que el servidor esté siempre arriba en horario laboral.

## F. Operación diaria

- **Registrar cara/huella de una persona:** ERP → Asistencia → sección "Marcas
  del dispositivo" → seleccionar persona → botón "😊 Cara" (elegir el Timmy si
  hay varios) → la persona se acerca a ESE Timmy y mira la cámara.
- **Marcar asistencia:** la persona solo se acerca a cualquier Timmy; la marca
  llega al ERP en ≤ 60s.
- **Ver estado de los Timmys:** panel de dispositivos (online/offline, última marca).

## G. Solución de problemas

| Síntoma | Causa probable | Acción |
|---------|----------------|--------|
| El ERP no carga | Servidor Flask apagado | `python bridge/server.py` |
| Sin marcas nuevas | yunatt sin sesión / sin Internet | Revisar Internet; el sync re-loguea solo |
| "Sin sesión yunatt" al registrar cara | Sesión yunatt expirada | Reintenta solo (re-login automático) |
| Login yunatt hace timeout | TLS de Windows | Ya resuelto con adaptador TLS 1.3 |
| Hora de marcas incorrecta | Timmy perdió la hora al apagarse | Fijar `America/Lima` en yunatt; reconecta y corrige |
| Un Timmy no reporta | Device offline / sin red | Revisar red del Timmy; los demás siguen operando |
| Marca duplicada de una persona | Desfase de reloj entre Timmys | Dedup por ventana lo evita; sincronizar zona horaria |

## H. Respaldo

- **Base de datos:** exportar `erp_lost_children` desde phpMyAdmin periódicamente
  (semanal recomendado). Las marcas también viven en yunatt.com como respaldo
  externo (reprocesables por mes de forma idempotente).
- **Código:** mantener copia de la carpeta `ERP_Lost_Children` (idealmente en un
  repositorio git).

---

## Anexo — Checklist de verificación Fase 2 (aceptación)

- [ ] Tabla `dispositivos` creada y con los Timmys de la empresa dados de alta.
- [ ] Cada marca en `zkteco_logs` atribuida a su dispositivo real.
- [ ] Dedup por ventana: misma persona en 2 Timmys < 1 min → 1 sola asistencia.
- [ ] Zona horaria `America/Lima` fijada en yunatt.
- [ ] Apagar un Timmy no interrumpe la ingesta de los demás.
- [ ] Panel de estado muestra online/offline por dispositivo.
- [ ] Reinicio del servidor a mitad de sync → sin duplicados ni pérdidas.
- [ ] Enrollment remoto permite elegir a qué Timmy enviar la pantalla de registro.
