import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { LoadingSpinner } from './components'
import { LoginPage, HomePage, UserProfileSetupPage, GroupDetailPage, GroupSettingsPage, JoinGroupPage, ActivityPage } from './pages'
import { debugLog } from './utils/debug'
import './styles/global.css'

function AppContent() {
  const { user, logout, isNewUser, setIsNewUser } = useAuth()

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
      <Route path="/activity" element={<ActivityPage onLogout={logout} />} />
      <Route path="/groups/:groupId" element={<GroupDetailPage onLogout={logout} />} />
      <Route path="/groups/:groupId/settings" element={<GroupSettingsPage onLogout={logout} />} />
      <Route path="/join/:inviteCode?" element={<JoinGroupPage onLogout={logout} />} />
    </Routes>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
