import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { LoadingSpinner } from './components'
import { LoginPage, HomePage, UserProfileSetupPage, GroupDetailPage, GroupSettingsPage, JoinGroupPage } from './pages'
import { getRedirectResult } from 'firebase/auth'
import { auth } from './firebase'
import { debugLog, debugError } from './utils/debug'
import './styles/global.css'

function AppContent() {
  const { user, loading, logout, isNewUser, setIsNewUser } = useAuth()

  // Show loading only until isNewUser status is determined
  if (isNewUser === null) {
    return <LoadingSpinner />
  }

  // Double security check
  const isGoogleUser = user?.providerData?.some(provider => provider.providerId === 'google.com')
  const isAuthorized = user && (user.emailVerified === true || isGoogleUser)
  
  debugLog('AppContent Render', { 
    user: user?.email, 
    emailVerified: user?.emailVerified, 
    isGoogle: isGoogleUser,
    isAuthorized,
    isNewUser
  })

  if (!isAuthorized) {
    debugLog('Unauthorized Access Attempt - Showing LoginPage', null)
    return <LoginPage />
  }

  // Show profile setup page for new users
  if (isNewUser) {
    debugLog('Showing UserProfileSetupPage for new user', { userId: user?.uid })
    return (
      <UserProfileSetupPage 
        onProfileComplete={() => setIsNewUser(false)}
      />
    )
  }

  return (
    <Routes>
      <Route path="/" element={<HomePage onLogout={logout} />} />
      <Route path="/groups/:groupId" element={<GroupDetailPage onLogout={logout} />} />
      <Route path="/groups/:groupId/settings" element={<GroupSettingsPage onLogout={logout} />} />
      <Route path="/join/:inviteCode?" element={<JoinGroupPage onLogout={logout} />} />
    </Routes>
  )
}

function App() {
  useEffect(() => {
    const checkRedirectResult = async () => {
      try {
        debugLog('App Level: Checking for OAuth redirect result', null)
        const result = await getRedirectResult(auth)
        if (result?.user) {
          debugLog('App Level: OAuth redirect result received', { email: result.user.email })
        }
      } catch (err) {
        if (err.code !== 'auth/no-auth-event-pending') {
          debugError('App Level: OAuth redirect error', { code: err.code })
        }
      }
    }

    checkRedirectResult()
  }, [])

  return (
    <BrowserRouter>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
