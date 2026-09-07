/**
 * Chequeo cumpleaños: set birthDate=hoy, verificar en Firestore, restaurar.
 * node backend/scripts/verify-birthday-flow.mjs
 */

import { getAdminDb, getTestIdToken } from './get-test-token.mjs'

async function main() {
  const { uid } = await getTestIdToken()
  const db = getAdminDb()
  const ref = db.collection('users').doc(uid)
  const snap = await ref.get()
  const original = snap.data()?.birthDate ?? null

  const today = new Date()
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  await ref.update({ birthDate: todayIso })
  const updated = (await ref.get()).data()?.birthDate
  if (updated !== todayIso) {
    throw new Error(`birthDate not updated: ${updated}`)
  }

  console.log('OK birthDate set to today', { uid, todayIso, original })

  if (original) {
    await ref.update({ birthDate: original })
    console.log('OK birthDate restored', { original })
  } else {
    await ref.update({ birthDate: '' })
    console.log('OK birthDate cleared (was empty)')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
