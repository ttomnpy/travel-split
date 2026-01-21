import { AuthProvider, useAuth } from './contexts/AuthContext'
import { LoadingSpinner } from './components'
import { LoginPage, HomePage } from './pages'
import { debugLog } from './utils/debug'
import './styles/global.css'

function AppContent() {
  const { user, loading, logout } = useAuth()

  if (loading) {
    return <LoadingSpinner />
  }

  // Double security check - user must exist AND either be verified OR be a Google user
  const isGoogleUser = user?.providerData?.some(provider => provider.providerId === 'google.com')
  const isAuthorized = user && (user.emailVerified === true || isGoogleUser)
  
  debugLog('AppContent Render', { 
    user: user?.email, 
    emailVerified: user?.emailVerified, 
    isGoogle: isGoogleUser,
    isAuthorized 
  })

  if (!isAuthorized) {
    debugLog('Unauthorized Access Attempt - Showing LoginPage', null)
    return <LoginPage />
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
