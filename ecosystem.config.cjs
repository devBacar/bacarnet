/**
 * PM2 — staging BacarNet (emuladores + ngrok → Hosting :5000).
 * Uso desde la raíz del repo (ej. Z:\Bacarnet en PC servidor):
 *   pm2 start ecosystem.config.cjs
 *   pm2 save
 */
const path = require('node:path')

const repoRoot = __dirname
const emulatorData =
  process.env.BACARNET_EMULATOR_DATA?.trim() ||
  path.join(repoRoot, '.emulator-data')
/** Ruta a ngrok.exe si no esta en PATH de PM2 (opcional: NGROK_BIN en env). */
const ngrokBin = process.env.NGROK_BIN?.trim() || 'ngrok'
const ngrokUrl =
  process.env.BACARNET_NGROK_URL?.trim() ||
  'https://elusive-verse-turbulent.ngrok-free.dev'

module.exports = {
  apps: [
    {
      name: 'bacarnet-emulators',
      script: 'scripts/bacarnet-emulators-runner.mjs',
      cwd: repoRoot,
      interpreter: 'node',
      kill_timeout: 120_000,
      shutdown_with_message: true,
      env: {
        BACARNET_EMULATOR_DATA: emulatorData,
        FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
      },
    },
    {
      name: 'bacarnet-cierre-posicion',
      // Cierre lun-vie 15:00 y sync de movimientos cada 30 min (08:00–18:00).
      script: 'scripts/posicion-cierre-scheduler.mjs',
      cwd: repoRoot,
      interpreter: 'node',
      autorestart: true,
      env: {
        GCLOUD_PROJECT: 'bacar-web',
      },
    },
    {
      name: 'bacarnet-ngrok',
      // PM2 no resuelve PATH como CMD; cmd.exe /c encuentra ngrok en PATH de Windows.
      script: 'cmd.exe',
      args: `/c "${ngrokBin}" http --url=${ngrokUrl} 5000`,
      cwd: repoRoot,
      interpreter: 'none',
      windowsHide: true,
      autorestart: true,
    },
  ],
}
