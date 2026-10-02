import { initializeApp } from 'firebase/app'
import { getAnalytics } from 'firebase/analytics'
import { connectAuthEmulator, getAuth, signInWithCustomToken } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
}

const app = initializeApp(firebaseConfig)
const auth = getAuth(app)
const db = getFirestore(app)

if (import.meta.env.VITE_USE_EMULATORS === 'true') {
  connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, 'localhost', 8080)
}

if (import.meta.env.DEV || import.meta.env.VITE_E2E === 'true') {
  // @ts-expect-error helpers locales para scripts Playwright / depuración (solo Vite dev)
  window.__getIdToken = () => auth.currentUser?.getIdToken()
  // @ts-expect-error helpers locales para scripts Playwright / depuración (solo Vite dev)
  window.__e2eSignInWithCustomToken = (customToken: string) =>
    signInWithCustomToken(auth, customToken)
}

let analytics
try {
  analytics = getAnalytics(app)
} catch {
  analytics = undefined
}

export { app, analytics, auth, db }
