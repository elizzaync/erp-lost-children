@echo off
REM ═══════════════════════════════════════════════════════════════════════
REM  Modulo RRHH - Lost Children Peru
REM  Levanta el servidor local y abre la interfaz en el navegador.
REM
REM  Este script NO toca, comprueba ni interactua de ninguna forma con el
REM  ERP anterior (ERP_Lost_Children). Son dos sistemas independientes.
REM ═══════════════════════════════════════════════════════════════════════

cd /d "%~dp0"

echo.
echo   Modulo RRHH - Lost Children Peru
echo   Iniciando servidor local...
echo.

where py >nul 2>nul
if %errorlevel%==0 (
    py backend\app.py
) else (
    python backend\app.py
)

if errorlevel 1 (
    echo.
    echo   El servidor no pudo arrancar.
    echo   Si faltan dependencias, instalalas con:
    echo       pip install -r backend\requirements.txt
    echo.
    pause
)
