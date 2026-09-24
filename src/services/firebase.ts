import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  GoogleAuthProvider,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
  type Auth,
} from 'firebase/auth'
import { getAnalytics, isSupported, type Analytics } from 'firebase/analytics'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
}

export const FIREBASE_CONFIGURED = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.authDomain &&
  firebaseConfig.projectId &&
  firebaseConfig.appId,
)

let app: FirebaseApp | null = null
let auth: Auth | null = null
let analyticsPromise: Promise<Analytics | null> | null = null

export function getFirebaseApp() {
  if (!FIREBASE_CONFIGURED) return null
  if (!app) app = getApps()[0] ?? initializeApp(firebaseConfig)
  return app
}

export function getFirebaseAuth() {
  const firebaseApp = getFirebaseApp()
  if (!firebaseApp) return null
  if (!auth) auth = getAuth(firebaseApp)
  return auth
}

export function getFirebaseIdToken() {
  const firebaseAuth = getFirebaseAuth()
  if (!firebaseAuth) return Promise.resolve(null)
  if (firebaseAuth.currentUser) return firebaseAuth.currentUser.getIdToken()
  return new Promise<string | null>((resolve) => {
    const unsubscribe = onAuthStateChanged(firebaseAuth, async (firebaseUser) => {
      unsubscribe()
      resolve(firebaseUser ? await firebaseUser.getIdToken() : null)
    })
  })
}

export function initFirebaseAnalytics() {
  const firebaseApp = getFirebaseApp()
  if (!firebaseApp || !firebaseConfig.measurementId) return Promise.resolve(null)
  if (!analyticsPromise) {
    analyticsPromise = isSupported()
      .then((supported) => (supported ? getAnalytics(firebaseApp) : null))
      .catch(() => null)
  }
  return analyticsPromise
}

export async function signInWithGooglePopup() {
  const firebaseAuth = getFirebaseAuth()
  if (!firebaseAuth) {
    throw new Error('Firebase Google authentication is not configured.')
  }
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  return signInWithPopup(firebaseAuth, provider)
}

export async function sendFirebasePasswordReset(email: string) {
  const firebaseAuth = getFirebaseAuth()
  if (!firebaseAuth) {
    throw new Error('Firebase authentication is not configured.')
  }
  return sendPasswordResetEmail(firebaseAuth, email.trim().toLowerCase())
}

export async function createFirebaseEmailUser(email: string, password: string, name: string) {
  const firebaseAuth = getFirebaseAuth()
  if (!firebaseAuth) {
    throw new Error('Firebase authentication is not configured.')
  }
  const credential = await createUserWithEmailAndPassword(firebaseAuth, email, password)
  if (name.trim()) {
    await updateProfile(credential.user, { displayName: name.trim() })
  }
  await sendEmailVerification(credential.user)
  return credential
}

export async function signInFirebaseEmailUser(email: string, password: string) {
  const firebaseAuth = getFirebaseAuth()
  if (!firebaseAuth) {
    throw new Error('Firebase authentication is not configured.')
  }
  return signInWithEmailAndPassword(firebaseAuth, email, password)
}
