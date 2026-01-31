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
  
  console.log('🔍 Page loaded - checking URL params:', { hasState, hasCode })
  
  // Check for OAuth redirect indicators
  if (hasState || hasCode) {
    console.log('🔄 OAuth redirect detected! Resetting redirect check flag')
    console.log('📍 URL params:', {
      state: hasState ? 'YES' : 'NO',
      code: hasCode ? 'YES' : 'NO'
    })
    redirectResultChecked = false
    redirectResultPromise = null
  } else {
    console.log('✅ No OAuth params found - normal page load')
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
          console.log('🚀 [CRITICAL] Calling getRedirectResult (FIRST TIME)')
          console.log('   auth.currentUser before:', auth.currentUser ? auth.currentUser.email : 'null')
          
          redirectResultPromise = getRedirectResult(auth)
          redirectResultChecked = true
        } else {
          console.log('⏭️ [INFO] Skipping getRedirectResult - already checked')
        }

        const result = await redirectResultPromise
        
        if (!isMounted) return

        if (result?.user) {
          console.log('✅ [SUCCESS] GOOGLE REDIRECT RESULT RECEIVED!', {
            email: result.user.email,
            uid: result.user.uid,
            provider: result.providerId
          })
          debugLog('Google Redirect Result Received', { 
            email: result.user.email,
            uid: result.user.uid,
            provider: result.providerId
          })
        } else {
          console.log('⚠️ [WARNING] getRedirectResult returned null')
          console.log('   auth.currentUser after:', auth.currentUser ? auth.currentUser.email : 'null')
          debugLog('No pending redirect result', null)
        }
      } catch (err) {
        if (isMounted && err.code !== 'auth/no-auth-event-pending') {
          console.error('❌ [ERROR] Getting Redirect Result:', err)
          debugError('Error Getting Redirect Result', err.message)
        }
      }

      unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
        if (!isMounted) return
        
        console.log('🔔 [AUTH STATE CHANGED]', {
          user: currentUser?.email || 'null',
          emailVerified: currentUser?.emailVerified,
          provider: currentUser?.providerData?.[0]?.providerId || 'none'
        })
        
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
            console.log('📝 [ACTION] Registering user:', currentUser.email)
            const regResult = await userService.registerUser(currentUser)
            console.log('✅ [ACTION] User registered. isNewUser:', regResult.isNewUser)
            setIsNewUser(regResult.isNewUser)
            
            const userProfileRef = ref(rtdb, `users/${currentUser.uid}`)
            const snapshot = await get(userProfileRef)
            if (snapshot.exists()) {
              console.log('📊 [ACTION] Fetched user profile')
              setUserProfile(snapshot.val())
            }
            
            console.log('✅ [ACTION] SETTING USER STATE:', currentUser.email)
            setUser(currentUser)
            setLoading(false)
          } catch (err) {
            console.error('❌ [ERROR] Completing auth state change:', err)
            debugError('Error completing auth state change', err)
          }
        } else {
          console.log('❌ [INFO] No user logged in')
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

