@echo off
rem ═══════════════════════════════════════════════════════════════════════
rem  arrancar-servidor.bat — levanta el Modulo RRHH y lo mantiene vivo
rem ═══════════════════════════════════════════════════════════════════════
rem
rem  POR QUE EXISTE
rem  El servidor se apagaba y nadie se enteraba hasta que alguien no podia
rem  fichar. No era que el programa fallara: era que lo arrancaba una
rem  persona a mano, y todo lo que depende de que alguien se acuerde acaba
rem  sin hacerse. La tarea programada "Modulo RRHH - servidor" llama a este
rem  archivo al iniciar sesion en Windows.
rem
rem  QUE HACE
rem  Comprueba si ya hay algo escuchando en el puerto. Si lo hay, no
rem  arranca otro: dos servidores sobre la misma base es la forma mas
rem  rapida de corromperla. Si no lo hay, arranca. Y cuando el servidor
rem  termina —por un fallo, por un apagon, por lo que sea— espera y lo
rem  vuelve a levantar.
rem
rem  A MANO
rem      herramientas\arrancar-servidor.bat        arranca y vigila
rem  Para pararlo: cerrar esta ventana, o Administrador de tareas ->
rem  python.exe. La tarea lo volvera a levantar al reiniciar sesion.
rem ═══════════════════════════════════════════════════════════════════════

rem  Sin rutas escritas a fuego: la carpeta del proyecto es la de arriba de
rem  esta. El proyecto tiene tildes en el nombre y una ruta copiada a mano
rem  se rompe sola.
set "RAIZ=%~dp0.."
set "PY=C:\Users\NIEVES\AppData\Local\Programs\Python\Python311\python.exe"
set "PUERTO=7801"
set "REGISTRO=%RAIZ%\registro"

if not exist "%REGISTRO%" mkdir "%REGISTRO%"

:bucle

rem  ¿Ya hay alguien escuchando? Entonces este no pinta nada.
netstat -ano -p TCP | findstr /R /C:":%PUERTO% .*LISTENING" >nul 2>&1
if not errorlevel 1 goto esperar

if not exist "%PY%" (
  echo [%date% %time%] NO ESTA EL PYTHON EN %PY% >> "%REGISTRO%\servidor.log"
  goto esperar
)

rem  El registro crece con cada peticion. Sin un tope, en unos meses son
rem  gigabytes en un disco que nadie mira. Al pasar de 20 MB se guarda como
rem  "anterior" y se empieza uno nuevo: siempre quedan los dos ultimos
rem  tramos, que es lo que hace falta para entender una caida.
set "TAM="
for %%A in ("%REGISTRO%\servidor.log") do set "TAM=%%~zA"
if defined TAM if %TAM% GTR 20000000 (
  move /y "%REGISTRO%\servidor.log" "%REGISTRO%\servidor-anterior.log" >nul 2>&1
)

echo. >> "%REGISTRO%\servidor.log"
echo ===== arrancando  %date% %time% ===== >> "%REGISTRO%\servidor.log"
cd /d "%RAIZ%"
"%PY%" backend\app.py >> "%REGISTRO%\servidor.log" 2>&1
echo ===== se detuvo   %date% %time% ===== >> "%REGISTRO%\servidor.log"

:esperar
rem  Un respiro antes de volver a mirar. Sin esto, un fallo al arrancar
rem  daria vueltas a toda velocidad y llenaria el disco de registro.
timeout /t 15 /nobreak >nul
goto bucle
