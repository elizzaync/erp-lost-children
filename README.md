# ERP Lost Children

Sistema de gestión para ONG: beneficiarios, asistencia biométrica, alimentación,
almacén, entregas y finanzas.

## Stack

- **Frontend**: SPA en JavaScript vanilla (sin frameworks) — `index.html` + `js/` + `modules/`
- **Backend**: Flask (puerto 7793) — `bridge/server.py`
- **Base de datos**: MySQL (XAMPP) — esquema en `erp_lost_children_mysql.sql`
- **Biometría**: dispositivo Timmy TM-AI03F (reconocimiento facial) vía nube yunatt.com (protocolo ADMS)

## Características principales

- Asistencia en **tiempo real** vía WebSocket (`/ws/asistencia`) — las marcas del
  dispositivo aparecen al instante en el dashboard.
- Enrolamiento remoto: el ERP envía el comando y el Timmy activa su pantalla de
  registro; la foto que captura el dispositivo se sincroniza como foto de perfil.
- Monitoreo del enrolamiento (registrado / cancelado) con banner en vivo.
- Borrado sincronizado: eliminar una persona la quita también del dispositivo y de la nube.
- Almacén con alertas de stock mínimo, gastos y fondos con balance, servicios de alimentación.

## Puesta en marcha

```bash
# 1. Requisitos
pip install -r bridge/requirements.txt
pip install flask-sock

# 2. Base de datos (XAMPP/MySQL)
#    Importar erp_lost_children_mysql.sql en una BD llamada erp_lost_children

# 3. Arrancar el servidor
python bridge/server.py
# → abrir http://localhost:7793
```

## Configuración sensible

Las credenciales de yunatt.com **no** están en el código. Se leen desde
`bridge/.env` (excluido de git). Para configurarlas:

```bash
cp bridge/.env.example bridge/.env
# editar bridge/.env con las credenciales reales
```

Las carpetas `bridge/static/fotos/` (fotos de beneficiarios), `bridge/ssl/`
(llaves) y `bridge/static/comprobantes/` están excluidas del repositorio.
