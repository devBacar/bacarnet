/**
 * Restaura colores redactados: ***REMOVED*** + hex → # + hex (6 u 8 dígitos).
 *
 *   node scripts/restore-redacted-hex-colors.mjs [archivo...]
 *   node scripts/restore-redacted-hex-colors.mjs --check [archivo...]
 *
 * Sin argumentos: no hace nada (evita barrer el repo entero por accidente).
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

/** Solo 6 u 8 caracteres hex (CSS / SVG estándar). */
const REDACTED_HEX = /\*\*\*REMOVED\*\*\*([0-9a-fA-F]{6}|[0-9a-fA-F]{8})(?![0-9a-fA-F])/g

export function restoreRedactedHexInText(text) {
  return text.replace(REDACTED_HEX, '#$1')
}

export function countRedactedHex(text) {
  return [...text.matchAll(REDACTED_HEX)].length
}

function usage() {
  console.error('Uso: node scripts/restore-redacted-hex-colors.mjs [--check] <archivo...>')
  process.exit(1)
}

const args = process.argv.slice(2)
if (args.length === 0) usage()

const checkOnly = args[0] === '--check'
const files = (checkOnly ? args.slice(1) : args).map((f) => resolve(f))
if (files.length === 0) usage()

let totalReplacements = 0
let filesChanged = 0

for (const file of files) {
  const before = readFileSync(file, 'utf8')
  const matches = countRedactedHex(before)
  if (matches === 0) {
    console.log(`OK (sin cambios): ${file}`)
    continue
  }
  const after = restoreRedactedHexInText(before)
  totalReplacements += matches
  if (checkOnly) {
    console.log(`PENDIENTE ${matches} reemplazo(s): ${file}`)
    continue
  }
  writeFileSync(file, after, 'utf8')
  filesChanged++
  console.log(`FIX ${matches} reemplazo(s): ${file}`)
}

if (checkOnly) {
  process.exit(totalReplacements > 0 ? 2 : 0)
}

console.log(`\nListo: ${filesChanged} archivo(s), ${totalReplacements} reemplazo(s).`)
