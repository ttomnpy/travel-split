import { useState, useEffect } from 'react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { LoadingSpinner } from './components'
import { LoginPage, HomePage, UserProfileSetupPage, GroupDetailPage, JoinGroupPage } from './pages'
import { debugLog } from './utils/debug'
import './styles/global.css'

function AppContent() {
  const { user, loading, logout, isNewUser, setIsNewUser } = useAuth()
  const [currentPage, setCurrentPage] = useState('home')
  const [pageParams, setPageParams] = useState({})

  // Initialize page from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const page = params.get('page') || 'home'
    const groupId = params.get('groupId')

    if (page && (page === 'home' || page === 'groupDetail')) {
      const newParams = {}
      if (groupId) newParams.groupId = groupId
      
      setCurrentPage(page)
      setPageParams(newParams)
      debugLog('Initialized page from URL', { page, groupId })
    }
  }, [])

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

  // Navigation handler
  const handleNavigate = (page, params = {}) => {
    setCurrentPage(page)
    setPageParams(params)
    
    // Update URL
    const queryParams = new URLSearchParams()
    queryParams.set('page', page)
    if (params.groupId) {
      queryParams.set('groupId', params.groupId)
    }
    window.history.pushState({}, '', `?${queryParams.toString()}`)
    
    // Scroll to top
    window.scrollTo(0, 0)
    
    debugLog('Navigation', { page, params })
  }

  // Render current page
  const renderPage = () => {
    switch (currentPage) {
      case 'home':
        return (
          <HomePage 
            onLogout={logout} 
            onNavigate={handleNavigate}
          />
        )
      case 'groupDetail':
        return (
          <GroupDetailPage 
            groupId={pageParams.groupId}
            onNavigate={handleNavigate}
            onLogout={logout}
          />
        )
      case 'joinGroup':
        return (
          <JoinGroupPage 
            onBack={() => handleNavigate('home')}
            onGroupJoined={(groupInfo) => {
              debugLog('Group joined, navigating to group detail', groupInfo)
              handleNavigate('groupDetail', { groupId: groupInfo.groupId })
            }}
            onLogout={logout}
          />
        )
      default:
        return (
          <HomePage 
            onLogout={logout} 
            onNavigate={handleNavigate}
          />
        )
    }
  }

  return renderPage()
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}

export default App
