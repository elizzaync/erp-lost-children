# El modelo de reconocimiento facial

Estos archivos NO son código de Lost Children: son una librería de terceros
y sus pesos, guardados aquí a propósito.

| | |
|---|---|
| Qué es | `@vladmandic/face-api`, versión **1.7.15** |
| Licencia | MIT |
| De dónde salió | `https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15` |
| Cuándo | 26 de agosto de 2026 |
| Tamaño | ~7,4 MB en total |

## Por qué está aquí dentro y no se pide a internet

Porque la casa tiene que poder marcar asistencia aunque se caiga el
internet, y porque pedirle el modelo a un servidor de fuera le contaría a
ese servidor, cada mañana, a qué hora abre la casa y desde dónde. Lo sirve
`/web/rostro/`, este mismo servidor.

## Qué hace cada archivo

- `face-api.min.js` — la librería, con su motor de cálculo incluido.
- `modelos/tiny_face_detector_*` — encuentra dónde hay una cara.
- `modelos/face_landmark_68_*` — sitúa ojos, nariz y boca para enderezarla.
- `modelos/face_recognition_*` — convierte esa cara en 128 números.

## Qué se guarda de la cara de una persona

**Los 128 números, no la foto.** El cálculo ocurre en el teléfono de quien
marca; al servidor solo llega el vector, que se guarda en la tabla
`rostros_web`. De ese vector no se reconstruye un rostro.

La foto de cada marca sí se guarda —en `data/marcas/`— porque es la
constancia de quién marcó, y esa decisión es de la ONG, no del modelo.

## Si algún día se cambia de versión o de modelo

Hay que **volver a registrar el rostro de todo el mundo**. Comparar
vectores de modelos distintos no da un resultado malo: da un resultado sin
significado. Por eso cada rostro guarda en `rostros_web.modelo` la etiqueta
con la que se generó (`MODELO_ROSTRO`, en `base.html`).

## Umbral

`ROSTRO_WEB_UMBRAL = 0.6` (en `backend/config.py`). Medido el 26/08/2026
con la misma cara alterada y con caras distintas:

- misma cara, más oscura / más clara / borrosa: **0,03 – 0,14**
- caras de personas distintas: **0,64 – 0,89**

Es decir, el 0,6 tiene margen de sobra por los dos lados.
