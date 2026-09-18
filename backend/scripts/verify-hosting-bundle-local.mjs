/**
 * Obligatorio ANTES de `firebase deploy --only hosting:bacarnet`.
 * Falla si el bundle en dist/ incluye URLs de API local (p. ej. VITE_API_BASE_URL de E2E).
 *
 *   node backend/scripts/verify-hosting-bundle-local.mjs
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const ASSETS_DIR = resolve(ROOT, 'dist/assets')

/** Coincidencias que no deben aparecer en el JS de producción. */
const FORBIDDEN = [
  { label: '127.0.0.1 (cualquier puerto)', test: (text) => /127\.0\.0\.1/.test(text) },
  {
    label: 'localhost con puerto (dev/E2E)',
    test: (text) => /localhost:\d{2,5}/i.test(text),
  },
]

function main() {
  if (!existsSync(ASSETS_DIR)) {
    console.error('FAIL  No existe dist/assets/. Ejecutá npm run build (o npx vite build) primero.')
    process.exit(1)
  }

  const jsFiles = readdirSync(ASSETS_DIR).filter((name) => name.endsWith('.js'))
  if (jsFiles.length === 0) {
    console.error('FAIL  dist/assets/ no tiene archivos .js')
    process.exit(1)
  }

  let failed = false
  for (const file of jsFiles) {
    const path = resolve(ASSETS_DIR, file)
    const text = readFileSync(path, 'utf8')
    for (const rule of FORBIDDEN) {
      if (rule.test(text)) {
        console.error(`FAIL  ${file}: ${rule.label}`)
        failed = true
      }
    }
  }

  if (failed) {
    console.error('')
    console.error('Revisá .env.local / .env.development.local: no debe quedar VITE_API_BASE_URL apuntando a localhost.')
    console.error('Rebuild sin esa variable y volvé a verificar.')
    process.exit(1)
  }

  console.log(`OK  ${jsFiles.length} bundle(s) en dist/assets sin URLs locales de API`)
  for (const file of jsFiles) {
    console.log(`    - ${file}`)
  }
}

main()
