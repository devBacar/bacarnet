$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$source = Join-Path $repoRoot 'backend\src'
$destination = Join-Path $repoRoot 'backend_clean\src'

if (-not (Test-Path -LiteralPath $source -PathType Container)) {
  throw "No existe el origen: $source"
}

New-Item -ItemType Directory -Path $destination -Force | Out-Null

& robocopy $source $destination /E /COPY:DAT /DCOPY:DAT /R:2 /W:1 /NP
$robocopyExitCode = $LASTEXITCODE

if ($robocopyExitCode -ge 8) {
  throw "robocopy falló con código $robocopyExitCode"
}

Write-Host "Sincronización backend/src -> backend_clean/src completada (robocopy: $robocopyExitCode)."
$global:LASTEXITCODE = 0
