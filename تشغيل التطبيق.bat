@echo off
chcp 65001 >nul 2>&1
title Noor - Islamic App
set PORT=8090
set APPDIR=%~dp0islamic-app
echo.
echo  ====================================
echo   Noor - Islamic App
echo   http://localhost:%PORT%
echo   Press Ctrl+C to stop
echo  ====================================
echo.
python --version >nul 2>&1
if %errorlevel% equ 0 goto :use_python
echo Python not found. Please install Python from https://www.python.org
pause
goto :eof
:use_python
start "" "http://localhost:%PORT%"
cd /d "%~dp0islamic-app"
python -m http.server %PORT%
pause
