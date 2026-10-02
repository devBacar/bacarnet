# Ejecutar SOLO en PC-N8N (Firestore emulador local :8080).
# PowerShell - no usar sintaxis $env: en CMD.
param(
  [string]$Email = 'sistemas.ti@bacarsa.com.ar',
  [string]$RepoRoot = 'D:\App\Bacarnet'
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path $RepoRoot)) {
  $RepoRoot = 'Z:\Bacarnet'
}
if (-not (Test-Path $RepoRoot)) {
  throw 'No se encontro D:\App\Bacarnet ni Z:\Bacarnet'
}

$saPath = Join-Path $RepoRoot 'backend\.secrets\firebase-admin-sa.json'
if (-not (Test-Path $saPath)) {
  throw "Falta $saPath - copia firebase-admin-sa.json ahi (desde la PC de dev)."
}

$env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
$env:ADMIN_SDK_KEY_PATH = $saPath
$env:GOOGLE_APPLICATION_CREDENTIALS = $saPath

Push-Location $RepoRoot
node backend/scripts/grant-emulator-super-admin.mjs "--email=$Email" --create-if-missing
Pop-Location
