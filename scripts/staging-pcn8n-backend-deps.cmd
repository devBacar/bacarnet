@echo off
REM PC-N8N (D:\App\Bacarnet): reinstalar backend\node_modules sin bucle intranet1.
REM Ejecutar como Administrador si rmdir falla. Node 20 recomendado (nvm use 20).

cd /d D:\App\Bacarnet

echo Deteniendo emuladores (libera locks en node_modules)...
call pm2 stop bacarnet-emulators
timeout /t 5 /nobreak >nul

cd /d D:\App\Bacarnet\backend

if exist node_modules (
  call "%~dp0staging-pcn8n-wipe-node_modules.cmd"
  if errorlevel 1 exit /b 1
)

echo npm install (1-3 min normal; mas de 5 min sin lineas nuevas = cancelar y repetir)...
call npm install
if errorlevel 1 (
  echo npm install fallo. Proba: cerrar antivirus, repetir, o copiar node_modules desde PC dev.
  exit /b 1
)

cd /d D:\App\Bacarnet
echo Reiniciando emuladores...
call pm2 restart bacarnet-emulators --update-env

echo Probar: curl http://127.0.0.1:5000/api/health
exit /b 0
