# Poner el módulo en línea, con HTTPS

Hoy el sistema solo funciona en la computadora del equipo. **Desde un celular
no se puede marcar asistencia**, y no es un fallo nuestro: los navegadores
bloquean la cámara y el GPS en cualquier página que no vaya por HTTPS. Sin
certificado, el módulo de marcar no sirve para lo que se hizo.

Esto es lo que falta y en qué orden.

## 1. Lo que hace falta de fuera (no lo puedo hacer yo)

| Qué | Para qué | Quién |
|---|---|---|
| Un **dominio** (p. ej. `rrhh.lostchildrenperu.org`) | Sin nombre no hay certificado | La ONG |
| Acceso al **DNS** de ese dominio | Apuntar el registro A al servidor | La ONG |
| El **servidor con Coolify** (Contabo) y una cuenta para entrar | Es donde corre | La ONG |

Con esas tres cosas, el resto ya está preparado en el repositorio.

## 2. Lo que ya está listo

- `Dockerfile` y `docker-compose.yml` escritos para Coolify.
- Coolify termina el TLS en su Traefik y saca el certificado solo (Let's
  Encrypt). El contenedor solo habla HTTP por dentro; eso es correcto.
- `LOGIN_ESTRICTO=1` por defecto: no se entra sin cuenta.
- `COOKIE_SECURE=1` por defecto: la cookie de sesión solo viaja por HTTPS.
  **Falla cerrado a propósito** — si el certificado no está, nadie entra, en
  vez de entrar con la contraseña viajando en claro.
- El modelo de reconocimiento facial (`web/rostro/`, 7,4 MB) va dentro de la
  imagen. No se descarga de internet: cada celular lo baja del propio
  servidor la primera vez.

## 3. El orden, cuando llegue el momento

1. **DNS**: registro A del subdominio → IP del servidor. Esperar a que
   propague (unos minutos).
2. **Coolify**: crear la aplicación desde el repositorio, con el
   `docker-compose.yml` de la raíz.
3. **Volumen**: comprobar que `rrhh_datos` está montado en `/app/data`.
   Sin eso, **cada redespliegue borra la base**, los documentos, las firmas
   y las fotos de las marcas.
4. **Variables** en el panel: `YUNATT_EMAIL`, `YUNATT_PASSWORD`,
   `YUNATT_DEVICE_ID`, `YUNATT_DEPT_ID`.
5. **Dominio** asignado a la aplicación, con «Generate SSL» activado.
6. Comprobar que `https://<dominio>/api/health` responde antes de repartir
   la dirección a nadie.
7. **Entrar desde un celular** y registrar el rostro: es la primera prueba
   real de que la cámara y el GPS funcionan.

## 4. Antes de dar la dirección al equipo

- [ ] **Rotar la contraseña de yunatt** y la llave de la cuenta de servicio
      de Google: han estado en archivos locales.
- [ ] **Cerrar las sesiones abiertas** (una orden, la ejecuto yo).
- [x] Borrar las 8 personas «Zzz Prueba» y las fichas sueltas *luisao*,
      *chr*, *LUIS* — **hecho el 31/08/2026**. En su lugar hay un juego de
      fichas de ejemplo completas (`backend/sembrar_ejemplo.py`), con
      documentos en el bloque 90.000.000–90.999.999, que RENIEC no emite:
      ninguna puede coincidir con el DNI de una persona real. Se retiran
      con `py backend\sembrar_ejemplo.py --borrar`.
- [ ] **Retirar esas fichas de ejemplo antes de que el equipo empiece a
      registrar de verdad.** Sirven para enseñar el sistema, no para
      convivir con datos reales: mezclarlas es cómo un dato inventado
      acaba en un informe.
- [ ] Subir la primera copia de seguridad de `data/` fuera del servidor.

## 5. Lo que NO cambia con el despliegue

- **No hay control de distancia.** Se decidió el 27/08/2026: se guarda dónde
  marcó cada persona, pero no se rechaza a nadie por estar lejos. El día que
  se quiera, basta con configurar `lat`, `lon` y `radio_marca`.
- La **meta semanal** es 48 h, un valor puesto a mano. El sistema no conoce
  el horario de nadie y por eso no habla de tardanzas ni de horas extra.
