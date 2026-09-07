/**
 * Reestructuración de áreas según organigrama (sep 2025).
 *
 *   node scripts/restructure-org-areas.mjs           ***REMOVED*** dry-run (default)
 *   node scripts/restructure-org-areas.mjs --apply   ***REMOVED*** escritura real
 *
 * 1. Renombra UIF → Área de Cumplimiento, Gerencia → Comisión Ejecutiva (solo name).
 * 2. Crea stubs: Directorio, Finanzas, Otros Proyectos, Servicio Tercerizado de Tesorería.
 * 3. Suma managedAreaIds en users/ y pendingUserSetup/ (arrayUnion, idempotente).
 */

import { initializeApp, applicationDefault, cert, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dryRun = !process.argv.includes('--apply')

const COMISION_EJECUTIVA_ID = 'MM25DIlzctON9kegb4MF'

const RENAMES = [
  {
    areaId: 'OWWnpfsRRx0XQ6FCqlOa',
    fromName: 'UIF',
    toName: 'Área de Cumplimiento',
  },
  {
    areaId: 'MM25DIlzctON9kegb4MF',
    fromName: 'Gerencia',
    toName: 'Comisión Ejecutiva',
  },
]

/** Miembros titulares de Comisión Ejecutiva (emails normalizados). */
const COMISION_EJECUTIVA_CHIEFS = new Set([
  'ivan.barrera@bacarsa.com.ar',
  'administracion@bacarsa.com.ar',
  'pablo.magnin@bacarsa.com.ar',
  'eduardo.asinardi@bacarsa.com.ar',
  'creartes@bacarsa.com.ar',
].map((e) => e.trim().toLowerCase()))

/** Áreas nuevas: name → jefes (managedAreaIds se suma, no reemplaza). */
const NEW_AREAS = [
  {
    name: 'Directorio',
    chiefs: [
      'ivan.barrera@bacarsa.com.ar',
      'eduardo.asinardi@bacarsa.com.ar',
      'creartes@bacarsa.com.ar',
    ],
  },
  {
    name: 'Finanzas',
    chiefs: ['creartes@bacarsa.com.ar'],
  },
  {
    name: 'Otros Proyectos',
    chiefs: ['pablo.magnin@bacarsa.com.ar'],
  },
  {
    name: 'Servicio Tercerizado de Tesorería',
    chiefs: ['administracion@bacarsa.com.ar'],
  },
]

function loadBackendEnv() {
  for (const rel of ['backend/.env', 'backend/.env.local', '.env.local']) {
    const envPath = resolve(ROOT, rel)
    if (!existsSync(envPath)) continue
    for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('***REMOVED***')) continue
      const eq = trimmed.indexOf('=')
      if (eq <= 0) continue
      const key = trimmed.slice(0, eq).trim()
      let value = trimmed.slice(eq + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      if (process.env[key] === undefined) process.env[key] = value
    }
  }
}

function initAdmin() {
  if (getApps().length > 0) return
  loadBackendEnv()
  const credPath = process.env.ADMIN_SDK_KEY_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (credPath) {
    const serviceAccount = JSON.parse(readFileSync(resolve(credPath), 'utf8'))
    initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.project_id,
    })
    return
  }
  initializeApp({ credential: applicationDefault() })
}

function normEmail(email) {
  return email.trim().toLowerCase()
}

function pickReusableRoot(candidates) {
  return candidates.filter((folder) => folder.legacy !== true)[0] ?? null
}

function rolePatch(currentRole) {
  if (currentRole === 'super_admin' || currentRole === 'admin') return null
  return 'admin'
}

function sortedUnique(ids) {
  return [...new Set(ids.filter((id) => typeof id === 'string' && id.length > 0))].sort()
}

async function main() {
  initAdmin()
  const db = getFirestore()

  console.log(
    dryRun
      ? '=== DRY-RUN: reestructuración organigrama (sin escrituras) ==='
      : '=== APPLY: reestructuración organigrama ===',
  )
  console.log('')

  // --- Renombres ---
  console.log('=== 1. Renombres (solo folders/{id}.name) ===')
  const renameResults = []
  for (const row of RENAMES) {
    const snap = await db.collection('folders').doc(row.areaId).get()
    if (!snap.exists) {
      renameResults.push({ ...row, status: 'ERROR', detail: 'documento no existe' })
      console.log(`ERROR  ${row.areaId}  "${row.fromName}" → "${row.toName}"  (no existe)`)
      continue
    }
    const currentName = String(snap.get('name') ?? '')
    const governingAreaId = snap.get('governingAreaId') ?? null
    const legacy = snap.get('legacy') === true
    if (legacy) {
      renameResults.push({ ...row, status: 'ERROR', detail: 'marcada legacy' })
      console.log(`ERROR  ${row.areaId}  legacy=true — no se renombra`)
      continue
    }
    if (currentName === row.toName) {
      renameResults.push({ ...row, status: 'SKIP', detail: 'ya tiene el nombre destino' })
      console.log(`SKIP   ${row.areaId}  ya se llama "${row.toName}"`)
      continue
    }
    if (currentName !== row.fromName) {
      renameResults.push({
        ...row,
        status: 'WARN',
        detail: `nombre actual "${currentName}" ≠ "${row.fromName}" esperado`,
      })
      console.log(
        `WARN   ${row.areaId}  nombre actual="${currentName}" (esperado "${row.fromName}") → "${row.toName}"`,
      )
    } else {
      renameResults.push({ ...row, status: 'RENAME', detail: currentName })
      console.log(`RENAME ${row.areaId}  "${currentName}" → "${row.toName}"`)
    }
    console.log(`       governingAreaId=${governingAreaId ?? '—'}  (sin cambio)`)
    if (!dryRun && renameResults.at(-1)?.status !== 'SKIP' && renameResults.at(-1)?.status !== 'ERROR') {
      await db.collection('folders').doc(row.areaId).update({ name: row.toName })
    }
  }

  // --- Áreas nuevas ---
  console.log('')
  console.log('=== 2. Áreas nuevas (stubs folders/) ===')
  const rootsSnap = await db.collection('folders').where('parentFolderId', '==', null).get()
  /** @type {Map<string, {id: string, governingAreaId: unknown, legacy?: boolean}[]>} */
  const rootsByName = new Map()
  for (const docSnap of rootsSnap.docs) {
    const name = String(docSnap.get('name') ?? '')
    const list = rootsByName.get(name) ?? []
    list.push({
      id: docSnap.id,
      governingAreaId: docSnap.get('governingAreaId') ?? null,
      legacy: docSnap.get('legacy') === true,
    })
    rootsByName.set(name, list)
  }

  const newAreaIds = new Map()
  for (const area of NEW_AREAS) {
    const candidates = rootsByName.get(area.name) ?? []
    const existing = pickReusableRoot(candidates)
    if (existing) {
      newAreaIds.set(area.name, existing.id)
      console.log(`REUTILIZA "${area.name}"  id=${existing.id}`)
    } else if (dryRun) {
      newAreaIds.set(area.name, `(nuevo-id-al-aplicar:${area.name})`)
      console.log(`CREA     "${area.name}"  id=(se genera al aplicar)`)
    } else {
      const ref = db.collection('folders').doc()
      await ref.set({
        name: area.name,
        parentFolderId: null,
        allowedUsers: [],
        governingAreaId: ref.id,
        createdAt: FieldValue.serverTimestamp(),
      })
      newAreaIds.set(area.name, ref.id)
      console.log(`CREA     "${area.name}"  id=${ref.id}`)
    }
  }

  // --- Usuarios y pending ---
  console.log('')
  console.log('=== 3. managedAreaIds (sumar, no reemplazar) ===')

  const usersSnap = await db.collection('users').get()
  /** @type {Map<string, {uid: string, role: string|null, managedAreaIds: string[]}>} */
  const usersByEmail = new Map()
  for (const docSnap of usersSnap.docs) {
    const email = typeof docSnap.get('email') === 'string' ? normEmail(docSnap.get('email')) : ''
    if (!email || usersByEmail.has(email)) continue
    usersByEmail.set(email, {
      uid: docSnap.id,
      role: docSnap.get('role') ?? null,
      managedAreaIds: Array.isArray(docSnap.get('managedAreaIds'))
        ? docSnap.get('managedAreaIds').filter((id) => typeof id === 'string')
        : [],
    })
  }

  const pendingSnap = await db.collection('pendingUserSetup').get()
  /** @type {Map<string, FirebaseFirestore.DocumentSnapshot>} */
  const pendingByEmail = new Map()
  for (const docSnap of pendingSnap.docs) {
    pendingByEmail.set(normEmail(docSnap.id), docSnap)
  }

  /** email → { areaName, areaId }[] */
  const plannedAdds = new Map()

  for (const area of NEW_AREAS) {
    const areaId = newAreaIds.get(area.name)
    for (const chiefEmail of area.chiefs) {
      const email = normEmail(chiefEmail)
      if (!plannedAdds.has(email)) plannedAdds.set(email, [])
      plannedAdds.get(email).push({ areaName: area.name, areaId })
    }
  }

  for (const email of COMISION_EJECUTIVA_CHIEFS) {
    if (!plannedAdds.has(email)) plannedAdds.set(email, [])
  }

  const allEmails = [...new Set([...plannedAdds.keys(), ...COMISION_EJECUTIVA_CHIEFS])].sort()

  for (const email of allEmails) {
    const adds = plannedAdds.get(email) ?? []
    const user = usersByEmail.get(email)
    const pending = pendingByEmail.get(email)

    console.log(`--- ${email} ---`)

    const comisionFix =
      COMISION_EJECUTIVA_CHIEFS.has(email)
        ? [{ areaName: 'Comisión Ejecutiva', areaId: COMISION_EJECUTIVA_ID }]
        : []

    const allPlanned = [...comisionFix, ...adds]

    if (user) {
      const before = sortedUnique(user.managedAreaIds)
      const plannedLabels = allPlanned.filter((item) => !before.includes(item.areaId))
      const idsToAdd = plannedLabels
        .map((item) => item.areaId)
        .filter((id) => typeof id === 'string' && !id.startsWith('('))
      const after = sortedUnique([...before, ...idsToAdd, ...plannedLabels.filter((i) => i.areaId.startsWith('(')).map((i) => `<${i.areaName}>`)])

      console.log(`  Fuente: users/${user.uid}  role=${user.role ?? '—'}`)
      console.log(`  managedAreaIds antes: [${before.join(', ') || '—'}]`)
      if (plannedLabels.length === 0) {
        console.log('  Sin cambio: ya tiene Comisión Ejecutiva y todas las áreas nuevas')
      } else {
        for (const item of plannedLabels) {
          const tag = item.areaId.startsWith('(') ? `(nuevo: ${item.areaName})` : item.areaId
          const note =
            item.areaId === COMISION_EJECUTIVA_ID && !before.includes(COMISION_EJECUTIVA_ID)
              ? ' (corrección: faltaba Comisión Ejecutiva)'
              : ''
          console.log(`  + ${item.areaName} [${tag}]${note}`)
        }
        if (!dryRun || idsToAdd.length > 0) {
          console.log(`  managedAreaIds después (IDs reales): [${sortedUnique([...before, ...idsToAdd]).join(', ')}]`)
        }
        const roleChange = idsToAdd.length > 0 ? rolePatch(user.role) : null
        if (roleChange) console.log(`  role → ${roleChange}`)
      }

      if (!dryRun && idsToAdd.length > 0) {
        const patch = { managedAreaIds: FieldValue.arrayUnion(...idsToAdd) }
        if (rolePatch(user.role)) patch.role = rolePatch(user.role)
        await db.collection('users').doc(user.uid).update(patch)
        console.log('  ✓ users actualizado')
      }
      continue
    }

    if (pending) {
      const applied = pending.get('applied') === true
      const before = sortedUnique(
        Array.isArray(pending.get('managedAreaIds'))
          ? pending.get('managedAreaIds').filter((id) => typeof id === 'string')
          : [],
      )
      const plannedLabels = allPlanned.filter((item) => !before.includes(item.areaId))
      const idsToAdd = plannedLabels
        .map((item) => item.areaId)
        .filter((id) => typeof id === 'string' && !id.startsWith('('))

      console.log(`  Fuente: pendingUserSetup/${email}  applied=${applied}`)
      console.log(`  managedAreaIds antes: [${before.join(', ') || '—'}]`)
      if (applied) {
        console.log(`  ⚠ pending ya aplicado (appliedToUid=${pending.get('appliedToUid') ?? '?'}) — revisar users/ manualmente`)
      }
      if (plannedLabels.length === 0) {
        console.log('  Sin cambio en pending')
      } else {
        for (const item of plannedLabels) {
          const tag = item.areaId.startsWith('(') ? `(nuevo: ${item.areaName})` : item.areaId
          const note =
            item.areaId === COMISION_EJECUTIVA_ID && !before.includes(COMISION_EJECUTIVA_ID)
              ? ' (corrección: faltaba Comisión Ejecutiva)'
              : ''
          console.log(`  + ${item.areaName} [${tag}]${note}`)
        }
        if (!dryRun || idsToAdd.length > 0) {
          console.log(`  managedAreaIds después (IDs reales): [${sortedUnique([...before, ...idsToAdd]).join(', ')}]`)
        }
      }

      if (!dryRun && !applied && idsToAdd.length > 0) {
        await pending.ref.update({
          managedAreaIds: FieldValue.arrayUnion(...idsToAdd),
          updatedAt: FieldValue.serverTimestamp(),
        })
        console.log('  ✓ pendingUserSetup actualizado')
      }
      continue
    }

    console.log('  Fuente: (sin users/ ni pendingUserSetup)')
    for (const item of allPlanned) {
      const tag = item.areaId.startsWith('(') ? `(nuevo: ${item.areaName})` : item.areaId
      console.log(`  + crear pending con ${item.areaName} [${tag}]`)
    }

    if (!dryRun) {
      const ids = allPlanned
        .map((item) => item.areaId)
        .filter((id) => typeof id === 'string' && !id.startsWith('('))
      await db
        .collection('pendingUserSetup')
        .doc(email)
        .set(
          {
            email,
            role: 'admin',
            managedAreaIds: ids,
            memberAreaIds: [],
            permissions: { view_directory: true, view_drive: true },
            note: 'Seed restructure-org-areas — jefe sin perfil aún',
            applied: false,
            createdAt: FieldValue.serverTimestamp(),
            createdByUid: 'restructure-org-areas',
            createdByEmail: 'seed@intranet',
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        )
      console.log('  ✓ pendingUserSetup creado')
    }
  }

  // --- driveFolderAreas (informativo) ---
  console.log('')
  console.log('=== 4. driveFolderAreas (solo informativo; no se modifica en este script) ===')
  for (const row of RENAMES) {
    const mappings = await db
      .collection('driveFolderAreas')
      .where('governingAreaId', '==', row.areaId)
      .get()
    if (mappings.empty) {
      console.log(`${row.areaId}: sin mapeos driveFolderAreas`)
      continue
    }
    for (const docSnap of mappings.docs) {
      const driveName = String(docSnap.get('name') ?? '')
      console.log(
        `  driveFolderAreas/${docSnap.id}  name="${driveName}"  governingAreaId=${row.areaId}`,
      )
      if (driveName !== row.toName) {
        console.log(`    → sugerencia post-rename Drive: actualizar name a "${row.toName}" al mapear carpeta renombrada`)
      }
    }
  }
  for (const area of NEW_AREAS) {
    console.log(`  "${area.name}": sin driveFolderAreas hasta que mapees la carpeta Drive (post-apply)`)
  }

  console.log('')
  console.log('=== Resumen ===')
  console.log(`Renombres: ${renameResults.filter((r) => r.status === 'RENAME' || r.status === 'WARN').length} pendientes`)
  console.log(`Áreas nuevas: ${NEW_AREAS.length} (${[...newAreaIds.values()].filter((id) => !String(id).startsWith('(')).length} IDs conocidos)`)
  console.log(`Personas con cambios de managedAreaIds: ${plannedAdds.size}`)
  console.log('')
  if (dryRun) {
    console.log('Dry-run listo. Para aplicar: node scripts/restructure-org-areas.mjs --apply')
  } else {
    console.log('Apply listo. Siguiente paso: mapear carpetas Drive nuevas en driveFolderAreas.')
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
