import { getAdminDb, initAdmin } from './get-test-token.mjs'

initAdmin()
const db = getAdminDb()

await db.collection('global_settings').doc('main').set({ newsEnabled: true }, { merge: true })
console.log('OK newsEnabled restored to true')

const uid = '8pRc7XL2f4cjy2djPQ1SxW6aMvv2'
await db.collection('users').doc(uid).update({ birthDate: '' })
console.log('OK Franco birthDate cleared')
