@echo off
REM ---------------------------------------------------------------------
REM  tunel-rrhh.bat - da una direccion https temporal al servidor local.
REM
REM  PARA QUE: la camara y el GPS del celular solo funcionan sobre https.
REM  Mientras no haya dominio, esta es la forma de ensenar el sistema
REM  desde un telefono. Levanta una direccion https://algo.trycloudflare.com
REM  que apunta al servidor que ya corre en esta computadora.
REM
REM  IMPORTANTE: el trafico pasa por Cloudflare. Sirve para DEMOSTRAR que
REM  funciona, no para trabajar con datos reales de ninos.
REM
REM  La direccion CAMBIA cada vez. La computadora tiene que quedarse
REM  encendida con el servidor arriba.
REM ---------------------------------------------------------------------
setlocal
set PUERTO=7801
set AQUI=%~dp0
set CF=%AQUI%cloudflared.exe

echo.
echo ===============================================================
echo   TUNEL HTTPS  -  Modulo RRHH Lost Children
echo ===============================================================
echo.

REM -- 1. Comprobar que el servidor esta arriba. Sin esto, el tunel
REM       levanta igual y da una direccion que responde "502": parece
REM       que falla el tunel cuando lo que falta es el servidor.
powershell -NoProfile -Command "try{ $r=Invoke-WebRequest -Uri 'http://127.0.0.1:%PUERTO%/api/health' -TimeoutSec 4 -UseBasicParsing; exit 0 }catch{ exit 1 }"
if errorlevel 1 (
  echo   [!] El servidor no responde en el puerto %PUERTO%.
  echo.
  echo       Abre otra ventana y arranca primero:
  echo           py backend\servidor.py
  echo.
  pause
  exit /b 1
)
echo   [ok] El servidor responde en el puerto %PUERTO%.

REM -- 2. cloudflared. Es un solo .exe, sin instalador y sin cuenta.
REM       Se guarda junto a este archivo y queda fuera del repositorio.
if not exist "%CF%" (
  echo   [..] Primera vez: descargando cloudflared ^(unos 20 MB^)...
  powershell -NoProfile -Command "$ErrorActionPreference='Stop'; [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile '%CF%' -UseBasicParsing"
  if errorlevel 1 (
    echo   [!] No se pudo descargar. Revisa la conexion a internet.
    pause
    exit /b 1
  )
  echo   [ok] Descargado.
)

echo.
echo   Levantando el tunel. La direccion https aparece abajo,
echo   en la linea que dice trycloudflare.com
echo.
echo   Para cerrarlo: Ctrl+C en esta ventana.
echo ===============================================================
echo.

"%CF%" tunnel --url http://127.0.0.1:%PUERTO%
