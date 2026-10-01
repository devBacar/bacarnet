@echo off
setlocal EnableExtensions
REM PC-N8N: liberar locks y borrar/renombrar backend\node_modules.
REM Ejecutar CMD **como Administrador**.

cd /d D:\App\Bacarnet

echo === PM2 stop ===
call pm2 stop bacarnet-emulators 2>nul
call pm2 stop bacarnet-ngrok 2>nul
timeout /t 5 /nobreak >nul

echo === Cerrar procesos node ligados a Bacarnet / firebase emulators ===
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$patterns=@('Bacarnet','bacarnet-emulators','firebase emulators','firebase-functions');" ^
  "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" -ErrorAction SilentlyContinue |" ^
  "Where-Object { $cmd=$_.CommandLine; $patterns | Where-Object { $cmd -like ('*'+$_+'*') } } |" ^
  "ForEach-Object { Write-Host ('Kill PID '+$_.ProcessId+' '+$_.CommandLine); Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"

timeout /t 3 /nobreak >nul

cd /d D:\App\Bacarnet\backend
if not exist node_modules (
  echo node_modules ya no existe.
  exit /b 0
)

echo === Intentar ren node_modules -^> node_modules.trash ===
ren node_modules node_modules.trash 2>nul
if not exist node_modules (
  echo OK: renombrado a node_modules.trash. Corre npm install.
  call "%~dp0staging-pcn8n-wipe-node_modules.cmd"
  exit /b 0
)

echo Ren fallo, wipe profundo...
call "%~dp0staging-pcn8n-wipe-node_modules.cmd"
exit /b %ERRORLEVEL%
