import { createContext, useContext, useState, useEffect } from 'react'
import { onAuthStateChanged, signOut, getRedirectResult } from 'firebase/auth'
import { auth, rtdb } from '../firebase'
import { ref, get } from 'firebase/database'
import { userService } from '../services/userService'
import { debugLog, debugWarn, debugError } from '../utils/debug'

const AuthContext = createContext(null)

// Global flag to prevent duplicate getRedirectResult calls (React StrictMode issue)
let redirectResultChecked = false
let redirectResultPromise = null

// Reset the flag when page loads with OAuth redirect parameters
if (typeof window !== 'undefined') {
  const urlParams = new URLSearchParams(window.location.search)
  const hasState = urlParams.has('state')
  const hasCode = urlParams.has('code')

  // Use debug logging rather than console to keep production console quiet
  if (hasState || hasCode) {
    debugLog('OAuth redirect detected - resetting redirect flags', { hasState, hasCode })
    redirectResultChecked = false
    redirectResultPromise = null
  } else {
    debugLog('No OAuth params found on page load', null)
  }
}

function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [userProfile, setUserProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isNewUser, setIsNewUser] = useState(null) 
  useEffect(() => {
    let unsubscribe
    let isMounted = true

    const initializeAuth = async () => {
      try {
        // Use global promise to ensure getRedirectResult is only called once
        if (!redirectResultChecked) {
          debugLog('Checking for Google Redirect Result', null)
          redirectResultPromise = getRedirectResult(auth)
          redirectResultChecked = true
        }

        const result = await redirectResultPromise
        
        if (!isMounted) return

        if (result?.user) {
          debugLog('Google Redirect Result Received', { 
            email: result.user.email,
            uid: result.user.uid,
            provider: result.providerId
          })
        } else {
          debugLog('No pending redirect result', null)
        }
      } catch (err) {
        if (isMounted && err.code !== 'auth/no-auth-event-pending') {
          debugError('Error Getting Redirect Result', err.message)
        }
      }

      unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
        if (!isMounted) return
        debugLog('Auth State Changed', { 
          currentUser: currentUser?.email, 
          emailVerified: currentUser?.emailVerified 
        })
        
        if (currentUser) {
          // Reload user to get the latest emailVerified status
          try {
            await currentUser.reload()
          } catch (err) {
            debugError('Error Reloading User', err)
          }
          
          const isGoogleUser = currentUser.providerData?.some(p => p.providerId === 'google.com')
          
          if (!currentUser.emailVerified && !isGoogleUser) {
            debugWarn('Unverified User Detected - Signing Out', currentUser.email)
            await signOut(auth)
            setUser(null)
            setIsNewUser(false)
            setLoading(false)
            return
          }

          // Register and fetch profile
          try {
            const regResult = await userService.registerUser(currentUser)
            setIsNewUser(regResult.isNewUser)
            
            const userProfileRef = ref(rtdb, `users/${currentUser.uid}`)
            const snapshot = await get(userProfileRef)
            if (snapshot.exists()) {
              setUserProfile(snapshot.val())
            }
            
            setUser(currentUser)
          } catch (err) {
            debugError('Error completing auth state change', err)
          }
        } else {
          debugLog('No User Logged In', null)
          setUser(null)
          setUserProfile(null)
          setIsNewUser(false)
        }
        setLoading(false)
      }, (err) => {
        debugError('Auth Error', err)
        setError(err.message)
        setLoading(false)
      })
    }

    initializeAuth()

    return () => {
      isMounted = false
      if (unsubscribe) unsubscribe()
    }
  }, [])

  const logout = async () => {
    try {
      setError(null)
      await signOut(auth)
    } catch (err) {
      setError(err.message)
    }
  }

  // Update user profile in context (called when user updates their profile)
  const updateUserProfileData = (updatedProfileData) => {
    setUserProfile((prevProfile) => ({
      ...prevProfile,
      ...updatedProfileData
    }))
  }

  const value = {
    user,
    userProfile,
    loading,
    error,
    logout,
    isAuthenticated: !!user,
    isNewUser,
    setIsNewUser,
    updateUserProfileData
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export { useAuth }

