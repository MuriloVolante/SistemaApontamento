@echo off
title Mautus (desenvolvimento)
cd /d "%~dp0"

echo Modo de desenvolvimento: recarrega sozinho ao editar o codigo.
echo Para o uso normal do dia a dia, use iniciar.bat.
echo.

if not exist "node_modules" (
  call npm install
  if errorlevel 1 (
    echo.
    echo A instalacao das dependencias falhou. Confira a internet e rode de novo.
    pause
    exit /b 1
  )
)
call npm run dev
pause
