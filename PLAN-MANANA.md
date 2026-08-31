# Plan para mañana · dividir la interfaz en archivos

*Escrito el 24 de agosto de 2026, al cierre de la jornada.*

---

## El problema, dicho sin adornos

`ERP RRHH - Lost Children Peru.dc.html` tiene **más de 11.000 líneas** y
dentro conviven tres cosas distintas:

1. el armazón de la página (barra lateral, cabecera, diálogos),
2. el marcado de las **21 pantallas**,
3. una clase de JavaScript con toda la lógica y **927 valores** en
   `renderVals()`.

Eso trae dos costes que ya estamos pagando:

- **Cada cambio toca un archivo enorme.** Para mover un botón hay que
  localizarlo entre miles de líneas, y un `</div>` de más se cuela sin que
  nadie lo vea. Hoy mismo pasó: la barra de botones del diálogo llevaba
  quién sabe cuánto tiempo pintándose fuera del recuadro.
- **No se puede trabajar por módulos.** Cerrar «Permisos» significa abrir
  el mismo archivo que contiene «Beneficiarios» y «Asistencia».

El enrutado por URL que le propuse **no resolvió lo que usted esperaba**.
Antes de tocar nada mañana necesito saber qué falla exactamente: si al
recargar sigue yendo al Dashboard, si la dirección no cambia al navegar, o
si el botón «atrás» del navegador hace algo raro. **Son tres fallos
distintos con tres arreglos distintos.**

---

## Lo que propongo

Que el `.dc.html` pase a ser un **archivo generado**, no un archivo que se
edita a mano. Las piezas viven separadas y un ensamblador las junta.

```
interfaz/
  base.html                  armazón: barra lateral, cabecera, pie
  pantallas/
    dashboard.html
    personal.html
    beneficiarios.html
    asistencia.html
    permisos.html
    ...                      una por pantalla
  dialogos/
    pedir-permiso.html
    firma.html
    ficha.html
    ...
  logica/
    (segunda fase — ver abajo)

construir_interfaz.py        junta todo y escribe el .dc.html
```

**Por qué generado y no servido por trozos:** hoy el `.dc.html` se puede
abrir a doble clic sin servidor. Eso vale y no lo quiero perder. El
ensamblador se ejecuta solo al arrancar el servidor, así que usted edita
una pieza, recarga, y ya está — sin acordarse de ningún paso extra.

---

## Las fases, en orden

### Fase 0 · Red de seguridad (antes de tocar nada)

- Respaldo completo del archivo actual, con fecha.
- **Foto dorada**: se guarda el HTML tal como está hoy, línea por línea.
  Al terminar la división, el archivo reconstruido tiene que salir
  **idéntico byte a byte**. Si no lo es, la división cambió algo, y eso
  es exactamente lo que no queremos.

### Fase 1 · Dividir el marcado (lo grueso)

El marcado es la mayor parte del archivo y se divide limpio: cada pantalla
ya vive dentro de su propio `<sc-if value="{{ isAlgo }}">`. Se corta por
ahí, sin reescribir ni una línea.

Al terminar esta fase el `.dc.html` se reconstruye idéntico y **todo sigue
funcionando exactamente igual**. No es un avance visible; es el avance que
permite los siguientes.

### Fase 2 · Dividir la lógica (lo delicado)

Aquí hay que ir con más cuidado: es **una sola clase**, y una clase no se
parte en archivos sin más. El camino que propongo:

- `renderVals()` pasa a llamar a un método por módulo —
  `valoresDePermisos()`, `valoresDeAsistencia()`— y cada uno se va a su
  archivo. La clase queda como índice.
- Los métodos de cada módulo (`cargarPermisos`, `resolverPermiso`…) se van
  con su módulo.

**Riesgo real:** el runtime exige que todo identificador del marcado
exista en `renderVals()`. Al repartirlo, un módulo puede pisar la clave de
otro sin que nadie lo note. El verificador ya detecta claves repetidas —
lo comprobé hoy metiendo una a propósito—, así que esa red ya está puesta.

### Fase 3 · Demostrar que nada cambió

- El archivo reconstruido, idéntico a la foto dorada.
- El verificador en verde: identificadores, claves repetidas y equilibrio
  de `<div>`.
- **La regresión completa**, comparada contra el número de hoy.

### Fase 4 · Que sea cómodo

- El servidor reconstruye al arrancar.
- Un modo `--vigilar` que reconstruye al guardar una pieza.
- `LEEME.md` explica dónde vive cada cosa.

---

## Lo que le va a costar a usted

**Casi nada durante el trabajo**, y ese es el punto: las fases 0 a 3 no
cambian ni un píxel de lo que usted ve. Lo que cambia es dónde vivo yo
cuando le arreglo algo.

**Después sí lo va a notar**, en que los cambios de un módulo dejan de
poder romper otro.

---

## Lo que necesito de usted mañana

1. **Qué falla exactamente del enrutado por URL.** Las tres posibilidades
   están arriba.
2. **Si prefiere que empecemos por la fase 1 completa o por un solo
   módulo** como prueba —«Permisos», por ejemplo— para ver el resultado
   antes de comprometer el resto. Yo recomiendo lo segundo: si el molde
   está mal, se descubre con un módulo y no con veintiuno.

---

## Lo que sigue pendiente, para no perderlo de vista

**Del formato de permisos:**

- «Versión» y «Fecha» de la cabecera del formato — están en blanco a
  propósito, no me los invento.
- Si el sistema debe ofrecer **los diez tipos** del papel en vez de los
  seis actuales. Hoy cuesta poco: hay muy pocas solicitudes registradas.
- Si **Administración también firma** cuando el permiso pasa de 7 días: el
  formato solo tiene dos líneas de firma.

**Del resto:**

- Los fallos de la regresión, sin investigar uno por uno.
- El formulario de tutores está listo y **ninguna familia lo ha recibido
  todavía**.
- GitHub sigue congelado hasta que usted lo pida.
