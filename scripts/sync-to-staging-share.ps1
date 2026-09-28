# Copia cambios locales (Desktop) → Z:\Bacarnet sin borrar node_modules del servidor.
param(
  [string]$Source = 'C:\Users\Admin\Desktop\intranet1',
  [string]$Target = 'Z:\Bacarnet'
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path $Target)) {
  throw "No existe $Target. Monta la unidad de red del servidor."
}

# /XD: nunca sincronizar control de versiones ni deps (evita pisar .git del servidor con el de Desktop).
$robocopyExcludeDirs = @(
  '.git',
  '.svn',
  '.hg',
  'node_modules',
  'dist'
)
Write-Host "Sync codigo $Source -> $Target"
robocopy $Source $Target /E /XD @robocopyExcludeDirs /XF firebase-debug.log /R:2 /W:3 /NFL /NDL /NJH /NJS
if ($LASTEXITCODE -ge 8) { exit $LASTEXITCODE }

Write-Host 'Build local (npm no confiable sobre unidad de red Z:)'
Push-Location $Source
npm --prefix backend run build
npm run build
npm run verify:hosting-bundle
Pop-Location

Write-Host 'Copiar artefactos compilados'
robocopy (Join-Path $Source 'dist') (Join-Path $Target 'dist') /MIR /NFL /NDL /NJH /NJS
$backendLib = Join-Path $Source 'backend\lib'
robocopy $backendLib (Join-Path $Target 'backend\lib') /E /NFL /NDL /NJH /NJS
if ($LASTEXITCODE -ge 8) { exit $LASTEXITCODE }

# PC-N8N staging: firebase.json apunta a backend_clean (backend\node_modules está roto).
# Sin este paso el emulador sigue con lib vieja aunque backend\lib esté al día.
$backendCleanRoot = Join-Path $Target 'backend_clean'
$backendCleanLib = Join-Path $backendCleanRoot 'lib'
if (Test-Path $backendCleanRoot) {
  Write-Host "Copiar backend\lib -> $backendCleanLib (emulador staging)"
  robocopy $backendLib $backendCleanLib /E /NFL /NDL /NJH /NJS
  if ($LASTEXITCODE -ge 8) { exit $LASTEXITCODE }

  # El robocopy de código pisa firebase.json del Desktop ("source":"backend").
  # En staging hay que forzar backend_clean o Functions no cargan.
  $firebaseJson = Join-Path $Target 'firebase.json'
  if (Test-Path $firebaseJson) {
    $json = Get-Content -LiteralPath $firebaseJson -Raw -Encoding UTF8
    $patched = $json `
      -replace '"source"\s*:\s*"backend"', '"source": "backend_clean"' `
      -replace 'npm --prefix backend run build', 'npm --prefix backend_clean run build'
    if ($patched -ne $json) {
      Set-Content -LiteralPath $firebaseJson -Value $patched -Encoding UTF8 -NoNewline
      Write-Host 'Patched firebase.json -> functions.source = backend_clean'
    }
  }
} else {
  Write-Host "AVISO: no existe backend_clean en $Target. Solo se actualizo backend\lib"
}

Write-Host 'Sync OK. En Z:\Bacarnet: pm2 restart bacarnet-emulators bacarnet-ngrok'
