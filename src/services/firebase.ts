import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import {
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  sendEmailVerification,
  sendPasswordResetEmail,
  fetchSignInMethodsForEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  EmailAuthProvider,
  linkWithCredential,
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

export async function signOutFirebaseUser() {
  const firebaseAuth = getFirebaseAuth()
  if (firebaseAuth?.currentUser) await signOut(firebaseAuth)
}

export async function getFirebaseIdToken(forceRefresh = false) {
  const firebaseAuth = getFirebaseAuth()
  if (!firebaseAuth) return null
  // currentUser can be null while IndexedDB persistence is still restoring.
  // Wait for the SDK's initial state before deciding that re-login is needed.
  await firebaseAuth.authStateReady()
  const firebaseUser = firebaseAuth.currentUser
  if (!firebaseUser) return null
  // Verification links are often opened in another tab. Reload the account
  // flag and renew its cached token so the backend sees the verified claim.
  if (!firebaseUser.emailVerified) {
    await firebaseUser.reload()
    forceRefresh = true
  }
  return firebaseUser.getIdToken(forceRefresh)
}

export async function resendFirebaseVerification() {
  const firebaseAuth = getFirebaseAuth()
  if (!firebaseAuth) throw new Error('Email verification is not configured.')
  await firebaseAuth.authStateReady()
  const firebaseUser = firebaseAuth.currentUser
  if (!firebaseUser) throw new Error('Enter your email and password and try signing in first, then resend verification.')
  await firebaseUser.reload()
  if (firebaseUser.emailVerified) return 'Your email is already verified. Sign in again to continue.'
  await sendEmailVerification(firebaseUser)
  return 'Verification email sent. Check your inbox and spam folder, open the link, then sign in again.'
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

export async function signInWithGoogleRedirect() {
  const firebaseAuth = getFirebaseAuth()
  if (!firebaseAuth) throw new Error('Firebase Google authentication is not configured.')
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  await signInWithRedirect(firebaseAuth, provider)
}

export async function getGoogleRedirectResult() {
  const firebaseAuth = getFirebaseAuth()
  if (!firebaseAuth) return null
  return getRedirectResult(firebaseAuth)
}

export async function linkPasswordToCurrentFirebaseUser(password: string) {
  const firebaseAuth = getFirebaseAuth()
  if (!firebaseAuth?.currentUser) throw new Error('Complete Google sign-in before setting a password.')
  const credential = EmailAuthProvider.credential(firebaseAuth.currentUser.email || '', password)
  return linkWithCredential(firebaseAuth.currentUser, credential)
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

export async function getFirebaseSignInMethods(email: string): Promise<string[]> {
  const firebaseAuth = getFirebaseAuth()
  if (!firebaseAuth) return []
  return fetchSignInMethodsForEmail(firebaseAuth, email.trim().toLowerCase())
}
