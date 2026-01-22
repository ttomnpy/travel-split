import { AuthProvider, useAuth } from './contexts/AuthContext'
import { LoadingSpinner } from './components'
import { LoginPage, HomePage, UserProfileSetupPage } from './pages'
import { debugLog } from './utils/debug'
import './styles/global.css'

function AppContent() {
  const { user, loading, logout, isNewUser, setIsNewUser } = useAuth()

  // Show loading only until isNewUser status is determined
  // isNewUser starts as null, becomes true/false after auth check
  if (isNewUser === null) {
    return <LoadingSpinner />
  }

  // Double security check - user must exist AND either be verified OR be a Google user
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

  return <HomePage onLogout={logout} />
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}

export default App
