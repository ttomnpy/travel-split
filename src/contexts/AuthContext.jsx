import { createContext, useContext, useState, useEffect } from 'react'
import { onAuthStateChanged, signOut, getRedirectResult } from 'firebase/auth'
import { auth, rtdb } from '../firebase'
import { ref, get } from 'firebase/database'
import { userService } from '../services/userService'
import { debugLog, debugWarn, debugError } from '../utils/debug'

const AuthContext = createContext(null)

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
            setIsNewUser(false)
            setLoading(false)
            return
          } catch (err) {
            debugError('Error Signing Out Unverified User', err)
            setUser(null)
            setIsNewUser(false)
            setLoading(false)
          }
        } else {
          debugLog('User Allowed', { email: currentUser.email, isGoogle: isGoogleUser, emailVerified: currentUser.emailVerified })
          
          // Register user in database and check if they're new BEFORE setting user
          try {
            debugLog('Starting user registration', { userId: currentUser.uid })
            const result = await userService.registerUser(currentUser)
            debugLog('User registration result', { error: result.error, isNewUser: result.isNewUser, userId: currentUser.uid })
            
            if (result.error) {
              debugWarn('Failed to register user in database', { error: result.error })
              setIsNewUser(true)
              setError(`Database Error: ${result.error}. Please complete your profile.`)
            } else {
              debugLog('Setting isNewUser to', { value: result.isNewUser })
              setIsNewUser(result.isNewUser)
              setError(null)
            }
            
            // Fetch user profile from database to get displayName
            try {
              const userProfileRef = ref(rtdb, `users/${currentUser.uid}`)
              const snapshot = await get(userProfileRef)
              if (snapshot.exists()) {
                const profileData = snapshot.val()
                debugLog('User profile fetched from database', { 
                  displayName: profileData.displayName,
                  email: profileData.email 
                })
                setUserProfile(profileData)
              } else {
                debugWarn('User profile not found in database', { userId: currentUser.uid })
                setUserProfile(null)
              }
            } catch (profileErr) {
              debugError('Error fetching user profile from database', profileErr.message)
              setUserProfile(null)
            }
            
            setUser(currentUser)
            setLoading(false)
          } catch (err) {
            debugError('Error registering user', { message: err.message, stack: err.stack })
            setIsNewUser(true)
            setError(`Error: ${err.message}. Please complete your profile.`)
            setUser(currentUser)
            setLoading(false)
          }
        }
      } else {
        debugLog('No User Logged In', null)
        setUser(null)
        setUserProfile(null)
        setIsNewUser(false)
        setLoading(false)
      }
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

