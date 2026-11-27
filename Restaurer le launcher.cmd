@echo off
chcp 65001 >nul
rem Remet le launcher japonais d origine.
node "%~dp0launcher-fr.mjs" restore %*
echo.
pause
