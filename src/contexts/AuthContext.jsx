import { createContext, useContext, useState, useEffect } from 'react'
import { onAuthStateChanged, signOut, getRedirectResult } from 'firebase/auth'
import { auth } from '../firebase'
import { debugLog, debugWarn, debugError } from '../utils/debug'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    // Check for redirect result from Google sign-in on mobile
    const checkRedirectResult = async () => {
      try {
        debugLog('Checking for Google Redirect Result', null)
        const result = await getRedirectResult(auth)
        if (result?.user) {
          debugLog('Google Redirect Result Received', { email: result.user.email })
        }
      } catch (err) {
        debugError('Error Getting Redirect Result', err.message)
      }
    }

    checkRedirectResult()

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      debugLog('Auth State Changed', { 
        currentUser: currentUser?.email, 
        emailVerified: currentUser?.emailVerified 
      })
      
      if (currentUser) {
        // Reload user to get the latest emailVerified status
        try {
          await currentUser.reload()
          debugLog('User Reloaded', { 
            email: currentUser.email, 
            emailVerified: currentUser.emailVerified 
          })
        } catch (err) {
          debugError('Error Reloading User', err)
        }
        
        // Check if email is verified
        // Allow Google OAuth users even if emailVerified is false (they're verified through Google)
        const isGoogleUser = currentUser.providerData?.some(provider => provider.providerId === 'google.com')
        
        if (!currentUser.emailVerified && !isGoogleUser) {
          debugWarn('Unverified User Detected - Signing Out', currentUser.email)
          // Sign out unverified users immediately (email/password only)
          try {
            await signOut(auth)
            setUser(null)
            setLoading(false)
            return
          } catch (err) {
            debugError('Error Signing Out Unverified User', err)
            setUser(null)
          }
        } else {
          debugLog('User Allowed', { email: currentUser.email, isGoogle: isGoogleUser, emailVerified: currentUser.emailVerified })
          setUser(currentUser)
        }
      } else {
        debugLog('No User Logged In', null)
        setUser(null)
      }
      setLoading(false)
    }, (err) => {
      debugError('Auth Error', err)
      setError(err.message)
      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  const logout = async () => {
    try {
      setError(null)
      await signOut(auth)
    } catch (err) {
      setError(err.message)
    }
  }

  const value = {
    user,
    loading,
    error,
    logout,
    isAuthenticated: !!user
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
