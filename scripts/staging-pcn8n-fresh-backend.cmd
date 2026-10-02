@echo off
setlocal EnableExtensions
REM PC-N8N: backend limpio sin borrar node_modules corrupto (renombrar carpeta backend).
REM Ejecutar CMD como Administrador. PM2 bacarnet detenido.

cd /d D:\App\Bacarnet

echo === PM2 stop ===
call pm2 stop bacarnet-emulators 2>nul
call pm2 stop bacarnet-ngrok 2>nul
timeout /t 5 /nobreak >nul

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" -ErrorAction SilentlyContinue |" ^
  "Where-Object { $_.CommandLine -match 'Bacarnet|firebase' } |" ^
  "ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
timeout /t 2 /nobreak >nul

if exist backend_clean (
  echo Borrando intento anterior backend_clean...
  rmdir /s /q backend_clean 2>nul
)

echo === Copiar backend sin node_modules -^> backend_clean ===
robocopy backend backend_clean /E /XD node_modules /NFL /NDL /NJH /NJS /R:1 /W:1
if errorlevel 8 (
  echo robocopy fallo.
  exit /b 1
)

echo === Renombrar backend actual (con basura) ===
set SUF=%RANDOM%
ren backend backend_trash_%SUF%
if exist backend (
  echo No se pudo renombrar backend. REINICIA PC-N8N y vuelve a ejecutar este script.
  exit /b 1
)

ren backend_clean backend
if not exist backend (
  echo Error: backend no quedo creado. Restaura manualmente backend_trash_%SUF%
  exit /b 1
)

echo === npm install en backend nuevo ===
cd backend
call npm install
if errorlevel 1 (
  echo npm install fallo.
  exit /b 1
)

cd /d D:\App\Bacarnet
echo === PM2 restart ===
call pm2 restart bacarnet-emulators bacarnet-ngrok --update-env

echo.
echo OK. Probar: curl http://127.0.0.1:5000/api/health
echo Carpeta vieja (borrar cuando quieras): D:\App\Bacarnet\backend_trash_%SUF%
exit /b 0
