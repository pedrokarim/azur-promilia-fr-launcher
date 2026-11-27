@echo off
rem Met le launcher en français. À relancer après chaque mise à jour du launcher.
rem Commentaire avant chcp 65001 : après, cmd se perd dans un fichier UTF-8 à chaque caractère accentué.
chcp 65001 >nul
node "%~dp0launcher-fr.mjs" apply %*
echo.
pause
