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
import { userService } from './userService'
import { debugLog, debugWarn, debugError } from '../utils/debug'

export const authService = {
  // Email/Password Sign Up
  signupWithEmail: async (email, password) => {
    try {
      debugLog('Sign Up Process Started', { email })
      const result = await createUserWithEmailAndPassword(auth, email, password)
      
      debugLog('User account created', { email, uid: result.user.uid })
      
      // Send verification email immediately while user is still authenticated
      try {
        await sendEmailVerification(result.user)
        debugLog('Verification email sent successfully', { email })
      } catch (emailError) {
        debugError('Failed to send verification email', { code: emailError.code, message: emailError.message })
        // Don't fail signup if email sending fails - user can resend later
      }
      
      // Store credentials in localStorage for resending verification
      localStorage.setItem('pendingSignupCredentials', JSON.stringify({ email, password }))
      debugLog('Credentials stored for verification resend', { email })
      
      // Sign out the user immediately so they can't access the app without verifying
      try {
        await firebaseSignOut(auth)
        debugLog('User signed out after verification email', { email })
      } catch (signoutError) {
        debugError('Failed to sign out after signup', { code: signoutError.code, message: signoutError.message })
      }
      
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
  resendVerificationEmail: async (email) => {
    try {
      debugLog('Resending verification email', { email })
      
      // Retrieve stored credentials from localStorage
      const storedCredentials = localStorage.getItem('pendingSignupCredentials')
      if (!storedCredentials) {
        debugError('Resend Email Error', 'No stored credentials found')
        return { error: 'no_credentials', message: null }
      }
      
      let credentials
      try {
        credentials = JSON.parse(storedCredentials)
      } catch (e) {
        debugError('Resend Email Error', 'Invalid stored credentials format')
        return { error: 'invalid_credentials', message: null }
      }
      
      // Verify email matches
      if (credentials.email !== email) {
        debugError('Resend Email Error', `Email mismatch: ${credentials.email} !== ${email}`)
        return { error: 'email_mismatch', message: null }
      }
      
      try {
        // Sign in temporarily with stored credentials
        const result = await signInWithEmailAndPassword(auth, credentials.email, credentials.password)
        debugLog('Temporary sign in successful for verification email', { email: credentials.email })
        
        // Send verification email
        await sendEmailVerification(result.user)
        debugLog('Verification email sent', { email })
        
        // Sign out immediately
        await firebaseSignOut(auth)
        debugLog('Signed out after sending verification email', null)
        
        return { error: null, message: 'email_resent' }
      } catch (signInError) {
        // Handle rate limiting gracefully
        if (signInError.code === 'auth/too-many-requests') {
          debugWarn('Resend Email Rate Limited', { message: signInError.message })
          return { 
            error: 'auth/too-many-requests', 
            message: 'Too many attempts. Please wait a few minutes before trying again.'
          }
        }
        throw signInError
      }
    } catch (error) {
      debugError('Resend Email Error', error)
      return { error: error.code || 'unknown_error', message: null }
    }
  },

  // Check for redirect result (called on app load for mobile)
  handleRedirectResult: async () => {
    try {
      const result = await getRedirectResult(auth)
      if (result?.user) {
        // User registration will be handled by AuthContext's onAuthStateChanged
        // No need to call registerUser here
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
      // Improved mobile detection
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
                       window.innerWidth < 768
      
      debugLog('Google Sign In Attempt', { isMobile, windowWidth: window.innerWidth })
      
      if (isMobile) {
        // Use redirect for mobile devices
        try {
          debugLog('Initiating Google Redirect for Mobile', null)
          
          await signInWithRedirect(auth, googleProvider)
          
          // This will cause a page redirect, so we return a neutral state
          return { user: null, error: null, message: 'redirect' }
        } catch (redirectError) {
          debugError('Google Redirect Error', { code: redirectError.code, message: redirectError.message })
          return { user: null, error: redirectError.code, message: null }
        }
      } else {
        // Use popup for desktop browsers
        try {
          debugLog('Initiating Google Popup for Desktop', null)
          const result = await signInWithPopup(auth, googleProvider)
          debugLog('Google Popup Sign In Success', { email: result.user.email })
          return { user: result.user, error: null, message: null }
        } catch (popupError) {
          debugError('Google Popup Error', { code: popupError.code, message: popupError.message })
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
