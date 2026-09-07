/**
 * Punto 8: evidencia de política rename/move (Drive capabilities, sin gobernanza de área).
 *
 *   node backend/scripts/test-drive-rename-move-policy.mjs
 */

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

function line(ok, label, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  return ok
}

function main() {
  const renameSrc = readFileSync(
    resolve(ROOT, 'backend/src/modules/drive/renameFile.ts'),
    'utf8',
  )
  const moveSrc = readFileSync(resolve(ROOT, 'backend/src/modules/drive/moveFile.ts'), 'utf8')
  const trashSrc = readFileSync(resolve(ROOT, 'backend/src/modules/drive/trashFile.ts'), 'utf8')
  const classifySrc = readFileSync(
    resolve(ROOT, 'backend/src/modules/drive/updateClassification.ts'),
    'utf8',
  )

  let ok = true

  ok =
    line(
      !renameSrc.includes('canPerformGovernanceAction') &&
        !renameSrc.includes('canGovernDriveFile'),
      '8a  rename NO usa gobernanza intranet',
    ) && ok

  ok =
    line(
      renameSrc.includes('getFileInSharedDrive'),
      '8b  rename valida pertenencia a Unidad compartida',
    ) && ok

  ok =
    line(
      !moveSrc.includes('canPerformGovernanceAction') &&
        !moveSrc.includes('canGovernDriveFile'),
      '8c  move NO usa gobernanza intranet',
    ) && ok

  ok =
    line(
      moveSrc.includes('capabilities/canEdit') && moveSrc.includes('capabilities/canAddChildren'),
      '8d  move exige canEdit + canAddChildren de Drive',
    ) && ok

  ok =
    line(
      !trashSrc.includes('canPerformGovernanceAction'),
      '8e  trash NO usa gobernanza intranet (misma familia que rename/move)',
    ) && ok

  ok =
    line(
      classifySrc.includes('canPerformGovernanceAction'),
      '8f  classification SÍ usa gobernanza (contraste)',
    ) && ok

  const readme = readFileSync(resolve(ROOT, 'backend/README.md'), 'utf8')
  ok =
    line(
      readme.includes('Mutaciones estructurales (renombrar / mover / papelera)'),
      '8g  política documentada en backend/README.md',
    ) && ok

  if (!ok) process.exit(1)
  console.log('\nOK: rename/move/trash dependen de permisos Drive (política documentada).')
}

main()
