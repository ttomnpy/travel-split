import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, setPersistence, browserLocalPersistence } from 'firebase/auth'
import { getDatabase } from 'firebase/database'
import { getStorage } from 'firebase/storage'
import { debugError } from './utils/debug'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL
}

// Initialize Firebase
export const app = initializeApp(firebaseConfig)

// Initialize Firebase services
export const auth = getAuth(app)
export const rtdb = getDatabase(app)
export const storage = getStorage(app)

// Initialize Google Auth Provider
export const googleProvider = new GoogleAuthProvider()

// Set persistence to LOCAL so users stay logged in
setPersistence(auth, browserLocalPersistence).catch((error) => {
  debugError('Error setting persistence', error)
})

// Configure Google provider to always show account selection
googleProvider.setCustomParameters({
  prompt: 'select_account'
})
