/**
 * Wrapper PM2 → Firebase Emulator Suite con backup Firestore periódico y cierre prolijo.
 *
 * Env:
 *   BACARNET_EMULATOR_DATA (default C:\bacarnet-emulator-data)
 *   BACARNET_EMULATOR_EXPORT_INTERVAL_MS (default 600000 = 10 min)
 *   FIRESTORE_EMULATOR_HOST (default 127.0.0.1:8080 para backup/restore)
 */

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dataDir =
  process.env.BACARNET_EMULATOR_DATA?.trim() || 'C:\\bacarnet-emulator-data'
const exportIntervalMs = Number.parseInt(
  process.env.BACARNET_EMULATOR_EXPORT_INTERVAL_MS ?? '600000',
  10,
)
const firestoreHost =
  process.env.FIRESTORE_EMULATOR_HOST?.trim() || '127.0.0.1:8080'

if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true })
}

let child = null
let backupInFlight = false
let shuttingDown = false
let periodicTimer = null
let restoreDone = false

function runNodeScript(relativeScript, label) {
  if (backupInFlight && label.includes('backup')) return Promise.resolve(false)
  if (label.includes('backup')) backupInFlight = true

  return new Promise((resolveRun) => {
    console.log(`[bacarnet-emulators] ${label}`)
    const proc = spawn(process.execPath, [resolve(ROOT, relativeScript)], {
      cwd: ROOT,
      stdio: 'inherit',
      env: {
        ...process.env,
        BACARNET_EMULATOR_DATA: dataDir,
        FIRESTORE_EMULATOR_HOST: firestoreHost,
      },
    })
    proc.on('close', (code) => {
      if (label.includes('backup')) backupInFlight = false
      resolveRun(code === 0)
    })
    proc.on('error', () => {
      if (label.includes('backup')) backupInFlight = false
      resolveRun(false)
    })
  })
}

async function maybeRestoreAfterBoot() {
  if (restoreDone) return
  await new Promise((r) => setTimeout(r, 25_000))
  await runNodeScript('scripts/emulator-firestore-restore.mjs', 'Restore admin-backup')
  restoreDone = true
}

function startEmulators() {
  const args = [
    'firebase',
    'emulators:start',
    '--only',
    'firestore,functions,hosting',
    `--import=${dataDir}`,
    '--export-on-exit',
  ]
  console.log(`[bacarnet-emulators] Inicio: npx ${args.join(' ')}`)

  child = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.env,
  })

  child.on('exit', (code, signal) => {
    console.log(
      `[bacarnet-emulators] Proceso firebase terminó (code=${code ?? 'null'}, signal=${signal ?? 'null'})`,
    )
    child = null
    if (!shuttingDown) {
      process.exit(typeof code === 'number' ? code : 1)
    }
  })

  child.on('error', (err) => {
    console.error('[bacarnet-emulators] No se pudo iniciar firebase:', err)
    process.exit(1)
  })

  void maybeRestoreAfterBoot()

  periodicTimer = setInterval(() => {
    void runNodeScript('scripts/emulator-firestore-backup.mjs', 'Backup periódico')
  }, exportIntervalMs)
  if (typeof periodicTimer.unref === 'function') {
    periodicTimer.unref()
  }
}

async function shutdown(trigger) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`[bacarnet-emulators] Apagado (${trigger})…`)

  if (periodicTimer) {
    clearInterval(periodicTimer)
    periodicTimer = null
  }

  await runNodeScript('scripts/emulator-firestore-backup.mjs', 'Backup shutdown')

  if (child && !child.killed) {
    const pid = child.pid
    if (process.platform === 'win32' && pid) {
      spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      })
    } else {
      child.kill('SIGINT')
    }
    await new Promise((resolveWait) => {
      const timeout = setTimeout(resolveWait, 45_000)
      child?.on('exit', () => {
        clearTimeout(timeout)
        resolveWait()
      })
    })
    await new Promise((r) => setTimeout(r, 3_000))
  }

  process.exit(0)
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('message', (msg) => {
  if (msg === 'shutdown') void shutdown('pm2-shutdown')
})

startEmulators()
