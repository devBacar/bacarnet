# Actualiza staging en Z:\Bacarnet (pull + build + restart PM2).
# Ejecutar en la PC donde corren los emuladores.
param(
  [string]$RepoRoot = 'Z:\Bacarnet',
  [string]$Branch = ''
)

$ErrorActionPreference = 'Stop'
Set-Location $RepoRoot

Write-Host "==> Repo: $RepoRoot"
if ($Branch) {
  git fetch origin
  git checkout $Branch
}
git pull origin $(git branch --show-current)

Write-Host '==> Build (si falla npm en Z:, usa sync-to-staging-share.ps1 desde Desktop)'
try {
  npm --prefix backend run build
  npm run build
  npm run verify:hosting-bundle
} catch {
  Write-Warning $_
  Write-Warning 'Ejecuta en Desktop: .\scripts\sync-to-staging-share.ps1'
}

Write-Host '==> PM2 restart'
pm2 restart bacarnet-emulators bacarnet-ngrok

Write-Host 'Listo. Probar: https://elusive-verse-turbulent.ngrok-free.dev/'
