# Qué puerto es cuál

Regla, sin excepciones:

## 7801 — el sistema real

Es del equipo. Ninguna prueba lo levanta, lo para ni lo consulta. Si abres
**http://127.0.0.1:7801/** estás viendo tus datos, siempre.

Lo arranca `py backend\servidor.py` y solo eso.

## 7802 – 7899 — pruebas

Todo lo que ves en ese rango es un servidor de pruebas trabajando sobre una
**copia** de la base. Si aparece un puerto ahí, es de pruebas: no es tu
sistema y lo que muestre no son tus datos.

| Puerto | Quién                      | Qué levanta                          |
|--------|----------------------------|--------------------------------------|
| 7802   | `correr_todo.py`           | el banco de la regresión completa     |
| 7803   | `prueba_login.py`          | su propio servidor, base propia       |
| 7804   | `prueba_login.py`          | segundo servidor, para el modo estricto |
| 7806   | `prueba_vistas.py`         | servidor propio para los dos roles    |
| 7807   | `prueba_marca_web.py`      | servidor propio del canal web         |

Cada uno corre sobre su copia y se retira al terminar.

## 9300 – 9499 — el navegador de las pruebas

No son servidores del sistema: es el puerto de depuración con el que cada
suite maneja su Edge en segundo plano. Si ves uno de estos, no hay ninguna
aplicación detrás que puedas abrir.

---

## Cómo saber qué estás viendo

    py backend\servidor.py --estado

Dice quién ocupa el 7801 y con qué PID. Si el PID cambia mientras trabajas,
algo se lo llevó — y eso sería un fallo, no algo normal.

## Por qué existe esta separación

Durante un tiempo las pruebas y el sistema real compartieron el 7801: al
correr una prueba, el equipo veía por su ventana los datos del banco —veinte
fichas que aparecían y desaparecían solas— y creía que su base estaba
contaminada. No lo estaba: lo estaba la ventana.

La separación por puerto es lo que hace que "lo que veo en el 7801 es mío"
sea cierto sin tener que comprobarlo cada vez.
