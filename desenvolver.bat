@echo off
title Apontamento - desenvolvimento
cd /d "%~dp0"

echo Modo de desenvolvimento: recarrega sozinho ao editar o codigo.
echo Para o uso normal do dia a dia, use iniciar.bat.
echo.

if not exist "node_modules" call npm install
call npm run dev
pause
