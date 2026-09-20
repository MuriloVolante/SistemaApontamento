@echo off
title Sistema de Apontamento
cd /d "%~dp0"

echo ============================================
echo   Sistema de Apontamento
echo ============================================
echo.

if not exist "node_modules" (
  echo Primeira execucao: instalando dependencias. Isso leva 1-2 minutos.
  call npm install
  echo.
)

call node scripts\preparar.mjs
if errorlevel 1 (
  echo.
  echo Falha ao compilar. Veja a mensagem acima.
  pause
  exit /b 1
)

start "" /b powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 4; Start-Process 'http://localhost:3000'"

echo O navegador vai abrir sozinho em http://localhost:3000
echo Para encerrar o sistema, feche esta janela ou tecle Ctrl+C.
echo.

call npm start
pause
