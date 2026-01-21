import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut as firebaseSignOut,
  sendEmailVerification
} from 'firebase/auth'
import { auth, googleProvider } from '../firebase'
import { debugLog, debugWarn, debugError } from '../utils/debug'

export const authService = {
  // Email/Password Sign Up
  signupWithEmail: async (email, password) => {
    try {
      debugLog('Sign Up Process Started', { email })
      const result = await createUserWithEmailAndPassword(auth, email, password)
      
      // Send verification email
      await sendEmailVerification(result.user)
      
      // Sign out the user immediately so they can't access the app without verifying
      await firebaseSignOut(auth)
      debugLog('User Created and Signed Out - Verification Email Sent', { email })
      
      return { 
        user: result.user, 
        error: null,
        message: 'verification_email_sent'
      }
    } catch (error) {
      debugError('Sign Up Error', { code: error.code, message: error.message })
      return { user: null, error: error.code, message: null }
    }
  },

  // Email/Password Login
  loginWithEmail: async (email, password) => {
    try {
      const result = await signInWithEmailAndPassword(auth, email, password)
      
      // Check if email is verified
      if (!result.user.emailVerified) {
        // Sign out unverified user
        await firebaseSignOut(auth)
        return { 
          user: null, 
          error: 'email_not_verified',
          message: 'Please verify your email first'
        }
      }
      
      return { user: result.user, error: null, message: null }
    } catch (error) {
      return { user: null, error: error.code, message: null }
    }
  },

  // Resend verification email
  resendVerificationEmail: async (user) => {
    try {
      await sendEmailVerification(user)
      return { error: null, message: 'email_resent' }
    } catch (error) {
      return { error: error.code, message: null }
    }
  },

  // Check for redirect result (called on app load for mobile)
  handleRedirectResult: async () => {
    try {
      const result = await getRedirectResult(auth)
      if (result?.user) {
        return { user: result.user, error: null }
      }
      return { user: null, error: null }
    } catch (error) {
      return { user: null, error: error.code }
    }
  },

  // Google Sign In - handles both desktop (popup) and mobile (redirect)
  loginWithGoogle: async () => {
    try {
      // Detect if running on mobile
      const isMobile = /iPhone|iPad|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
      
      debugLog('Google Sign In Attempt', { isMobile, userAgent: navigator.userAgent })
      
      if (isMobile) {
        // Use redirect for mobile devices
        try {
          debugLog('Initiating Google Redirect for Mobile', { provider: 'Google' })
          await signInWithRedirect(auth, googleProvider)
          // This will cause a page redirect, so we return immediately
          debugLog('signInWithRedirect executed, page should redirect now', null)
          return { user: null, error: null, message: 'redirect' }
        } catch (redirectError) {
          debugError('Redirect Error', { code: redirectError.code, message: redirectError.message })
          return { user: null, error: redirectError.code, message: null }
        }
      } else {
        // Use popup for desktop browsers
        try {
          debugLog('Initiating Google Popup for Desktop', { provider: 'Google' })
          const result = await signInWithPopup(auth, googleProvider)
          debugLog('Google Popup Sign In Success', { email: result.user.email })
          return { user: result.user, error: null, message: null }
        } catch (popupError) {
          debugError('Popup Error', { code: popupError.code, message: popupError.message })
          if (popupError.code === 'auth/popup-closed-by-user') {
            return { user: null, error: 'popup-closed', message: null }
          }
          return { user: null, error: popupError.code, message: null }
        }
      }
    } catch (error) {
      debugError('Google Sign In Error', { code: error.code, message: error.message })
      return { user: null, error: error.code, message: null }
    }
  },

  // Sign Out
  logout: async () => {
    try {
      await firebaseSignOut(auth)
      return { error: null }
    } catch (error) {
      return { error: error.code }
    }
  }
}
