@echo off
rem Demande la langue à forcer dans le launcher (français si on appuie juste sur Entrée), puis l’applique.
rem À relancer après chaque mise à jour du launcher. On peut glisser le dossier du launcher sur ce fichier.
rem Les commentaires restent avant chcp 65001 et les commandes en ASCII : après chcp, cmd se
rem perd dans un fichier UTF-8 à chaque caractère accentué.
chcp 65001 >nul
node "%~dp0launcher-fr.mjs" choose %*
echo.
pause
