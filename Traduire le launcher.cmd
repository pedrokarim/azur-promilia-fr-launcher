@echo off
chcp 65001 >nul
rem Met le launcher en français. A relancer après chaque mise à jour du launcher.
node "%~dp0launcher-fr.mjs" apply %*
echo.
pause
