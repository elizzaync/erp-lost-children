# Suites que el corredor no ejecuta

Estos 14 archivos venían de la carpeta de trabajo temporal pero **no
están en la lista de `correr_todo.py`**, así que no forman parte de la
regresión: nadie los ha corrido en mucho tiempo y ninguno ha sido
verificado contra el sistema actual.

Se guardan aquí en vez de borrarlos porque varios parecen versiones
anteriores de suites que sí corren —`prueba_ficha` frente a
`prueba_fichas`, `prueba_marcar` frente a `prueba_marca_web`— y conviene
poder mirarlas antes de decidir.

Uno está roto de forma comprobada: `prueba_filtro.js` lee un `_check.js`
en la raíz del proyecto que ya no existe y que nada genera.

**Antes de recuperar cualquiera de estos:** correrlo, ver que pasa contra
el sistema de hoy, y solo entonces añadirlo a `correr_todo.py`. Una suite
que no se ejecuta no protege nada, y una que se añade sin comprobar
convierte la regresión en ruido.
