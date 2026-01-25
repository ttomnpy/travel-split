import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ref, onValue } from 'firebase/database'
import { rtdb } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import { useTranslation } from '../../hooks/useTranslation'
import { getDisplayName } from '../../utils/displayNameHelper'
import { debugLog, debugError } from '../../utils/debug'
import { Button, LoadingSpinner, HeaderControls, CreateGroupModal } from '../../components'
import { BiMoney, BiPlus, BiLink, BiTrendingUp, BiX, BiChevronRight, BiWallet, BiGroup } from 'react-icons/bi'
import './HomePage.css'

function HomePage({ onLogout }) {
  const navigate = useNavigate()
  const { user, userProfile } = useAuth()
  const { t, setLanguage, currentLanguage } = useTranslation()
  
  const [userGroups, setUserGroups] = useState([])
  const [recentExpenses, setRecentExpenses] = useState([])
  const [overallSummary, setOverallSummary] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [isCreateGroupModalOpen, setIsCreateGroupModalOpen] = useState(false)
  const allExpensesRef = useRef({})

  useEffect(() => {
    if (!user?.uid) return

    setIsLoading(true)
    setError('')

    // Track all unsubscribes for cleanup
    let unsubscribeExpenses = []
    allExpensesRef.current = {}

    // Listen to user's overall summary from Firebase
    const unsubscribeOverallSummary = onValue(
      ref(rtdb, `users/${user.uid}/overallSummary`),
      (summarySnapshot) => {
        if (summarySnapshot.exists()) {
          const summary = summarySnapshot.val()
          debugLog('Overall summary updated from Firebase:', summary)
          setOverallSummary(summary)
        } else {
          // Initialize if not found
          setOverallSummary({
            totalGroupCount: 0,
            totalBalance: 0,
            totalPendingAmount: 0
          })
        }
      },
      (error) => {
        debugError('Error listening to overall summary', error)
      }
    )

    // Fetch user groups
    const unsubscribeUserGroups = onValue(
      ref(rtdb, `users/${user.uid}/groups`),
      (groupsSnapshot) => {
        try {
          if (!groupsSnapshot.exists()) {
            setUserGroups([])
            setRecentExpenses([])
            setIsLoading(false)
            return
          }

          const groups = groupsSnapshot.val()
          
          // Transform groups data
          const groupsArray = Object.entries(groups).map(([groupId, groupData]) => ({
            id: groupId,
            ...groupData
          }))

          setUserGroups(groupsArray)
          setOverallSummary({
            totalGroupCount: 0,
            totalBalance: 0,
            totalPendingAmount: 0
          })

          // Clean up old listeners
          unsubscribeExpenses.forEach(unsub => unsub())
          unsubscribeExpenses = []
          allExpensesRef.current = {}

          // Set up listeners for each group's summary and expenses
          for (const groupId of Object.keys(groups)) {
            // Listen to group summary for member count
            const groupSummaryRef = ref(rtdb, `groups/${groupId}/summary`)
            const summaryUnsubscribe = onValue(
              groupSummaryRef,
              (summarySnapshot) => {
                if (summarySnapshot.exists()) {
                  const summary = summarySnapshot.val()
                  debugLog(`Group ${groupId} summary updated:`, summary)
                  // Update the userGroups with the correct memberCount
                  setUserGroups(prev => prev.map(g => 
                    g.id === groupId 
                      ? { ...g, summary }
                      : g
                  ))
                }
              },
              (error) => {
                debugError(`Error listening to group summary for ${groupId}`, error)
              }
            )
            unsubscribeExpenses.push(summaryUnsubscribe)

            // Listen to expenses
            const groupRef = ref(rtdb, `groups/${groupId}/expenses`)
            const unsubscribe = onValue(
              groupRef,
              (groupSnapshot) => {
                debugLog(`Expenses updated for group ${groupId}`, groupSnapshot.val())
                if (groupSnapshot.exists()) {
                  const expenses = groupSnapshot.val()
                  allExpensesRef.current[groupId] = Object.entries(expenses).map(([expenseId, expenseData]) => ({
                    id: expenseId,
                    groupId,
                    groupName: groups[groupId]?.name || 'Unknown Group',
                    ...expenseData
                  }))
                } else {
                  allExpensesRef.current[groupId] = []
                }

                // Sort by date and take last 5
                const sorted = Object.values(allExpensesRef.current)
                  .flat()
                  .sort((a, b) => (b.created || 0) - (a.created || 0))
                  .slice(0, 5)

                debugLog('Recent expenses updated', sorted)
                setRecentExpenses(sorted)
                setIsLoading(false)
              },
              (error) => {
                debugError(`Error listening to expenses for group ${groupId}`, error)
                setIsLoading(false)
              }
            )
            unsubscribeExpenses.push(unsubscribe)
          }

          if (Object.keys(groups).length === 0) {
            setRecentExpenses([])
            setIsLoading(false)
          }
        } catch (err) {
          debugError('Error loading home data', err)
          setError(t('home.errorLoading'))
          setIsLoading(false)
        }
      },
      (error) => {
        debugError('Error listening to user data', error)
        setError(t('home.errorLoading'))
        setIsLoading(false)
      }
    )

    // Cleanup function
    return () => {
      unsubscribeOverallSummary()
      unsubscribeUserGroups()
      unsubscribeExpenses.forEach(unsub => unsub())
    }
  }, [user?.uid])

  const getCategoryEmoji = (category) => {
    const emojiMap = {
      'Lodging': '🏨',
      'Food': '🍽️',
      'Transport': '🚗',
      'Entertainment': '🎭',
      'Shopping': '🛍️',
      'Other': '📌'
    }
    return emojiMap[category] || '📌'
  }

  const formatCurrency = (amount, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency
    }).format(amount || 0)
  }

  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A'
    const date = new Date(timestamp)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    if (date.toDateString() === today.toDateString()) {
      return currentLanguage === 'zh-HK' ? '今天' : 'Today'
    } else if (date.toDateString() === yesterday.toDateString()) {
      return currentLanguage === 'zh-HK' ? '昨天' : 'Yesterday'
    } else {
      return date.toLocaleDateString(currentLanguage === 'zh-HK' ? 'zh-HK' : 'en-US', { 
        month: 'short', 
        day: 'numeric',
        year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
      })
    }
  }

  const displayName = getDisplayName(userProfile, user)

  if (isLoading) {
    return (
      <div className="home-container">
        <div className="loading-wrapper">
          <LoadingSpinner />
        </div>
      </div>
    )
  }

  return (
    <div className="home-container">
      {/* Header */}
      <header className="home-header">
        <div className="header-content">
          <div className="header-left">
            <div className="app-logo">
              <BiWallet />
            </div>
            <h1 className="app-title">TripSplit</h1>
          </div>
          <HeaderControls
            currentLanguage={currentLanguage}
            onLanguageChange={setLanguage}
            onLogout={onLogout}
            user={user}
            displayName={displayName}
          />
        </div>
      </header>

      {/* Main Content */}
      <main className="home-main">
        {error && (
          <div className="error-banner">
            <BiX className="error-icon" />
            <span>{error}</span>
          </div>
        )}

        {/* Welcome Section */}
        <section className="welcome-section">
          <div className="welcome-card">
            <p className="welcome-greeting">{t('home.welcome', { name: displayName })}</p>
            <h2 className="welcome-title">{t('home.balanceTitle')}</h2>
          </div>
        </section>

        {/* Balance Overview Card - Three Card Layout */}
        <section className="balance-overview">
          <div className="balance-cards-grid">
            {/* Main Balance Status Card */}
            <div className="balance-primary-card">
              <div className="balance-card-header">
                <span className="balance-label">{t('home.totalBalance')}</span>
              </div>
              <div className="balance-card-body">
                <p className={`balance-amount-main ${(overallSummary?.totalBalance || 0) >= 0 ? 'positive' : 'negative'}`}>
                  {formatCurrency(overallSummary?.totalBalance || 0)}
                </p>
                <div className="balance-status-indicator">
                  {(overallSummary?.totalBalance || 0) > 0 && (
                    <div className="status-badge positive">
                      <BiTrendingUp />
                      <span>{t('home.toReceive')}</span>
                    </div>
                  )}
                  {(overallSummary?.totalBalance || 0) < 0 && (
                    <div className="status-badge negative">
                      <BiTrendingUp />
                      <span>{t('home.toPay')}</span>
                    </div>
                  )}
                  {(overallSummary?.totalBalance || 0) === 0 && (
                    <div className="status-badge settled">
                      <span>✓ {t('home.settled')}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* You Owe Card */}
            <div className="balance-detail-card owes">
              <div className="balance-card-header">
                <span className="balance-label">{t('home.iOwe')}</span>
              </div>
              <div className="balance-card-body">
                <p className="balance-amount-detail owing">
                  {formatCurrency(Math.min(0, overallSummary?.totalBalance || 0) * -1)}
                </p>
                <div className="card-meta">{t('home.needToPay')}</div>
              </div>
            </div>

            {/* You're Owed Card */}
            <div className="balance-detail-card owed">
              <div className="balance-card-header">
                <span className="balance-label">{t('home.iOwed')}</span>
              </div>
              <div className="balance-card-body">
                <p className="balance-amount-detail owed">
                  {formatCurrency(Math.max(0, overallSummary?.totalBalance || 0))}
                </p>
                <div className="card-meta">{t('home.willReceive')}</div>
              </div>
            </div>
          </div>
        </section>

        {/* Action Buttons */}
        <section className="action-buttons">
          <button
            className="action-btn primary"
            onClick={() => setIsCreateGroupModalOpen(true)}
          >
            <BiPlus className="btn-icon" />
            <span>{t('home.createTrip')}</span>
          </button>
          <button
            className="action-btn secondary"
            onClick={() => navigate('/join')}
          >
            <BiLink className="btn-icon" />
            <span>{t('home.joinTrip')}</span>
          </button>
        </section>

        {/* Groups Section */}
        {userGroups.length > 0 ? (
          <section className="groups-section">
            <div className="section-header">
              <h2 className="section-title">
                <BiGroup className="header-icon" />
                {t('home.activeTrips')}
              </h2>
              {userGroups.length > 3 && (
                <button className="view-all-btn" onClick={() => navigate('/groups')}>
                  {t('home.viewAll')} <BiChevronRight />
                </button>
              )}
            </div>

            <div className="groups-list">
              {userGroups.slice(0, 3).map((group) => {
                // Calculate member count from summary or members object
                const memberCount = group.summary?.memberCount || group.memberCount || 0
                return (
                <div
                  key={group.id}
                  className="group-card"
                  onClick={() => navigate(`/groups/${group.id}`)}
                >
                  <div className="group-header">
                    <div className="group-emoji">🌍</div>
                    <div className="group-info">
                      <h3 className="group-name">{group.name}</h3>
                      <p className="group-meta">{memberCount} {currentLanguage === 'zh-HK' ? '成員' : 'members'}</p>
                    </div>
                  </div>
                  <div className="group-footer">
                    <div className="group-status">
                      <span className="status-label">{t('home.totalPending')}</span>
                      <span className={`status-amount ${group.pendingAmount >= 0 ? 'positive' : 'negative'}`}>
                        {formatCurrency(group.pendingAmount || 0)}
                      </span>
                    </div>
                    <BiChevronRight className="group-arrow" />
                  </div>
                </div>
                )
              })}
            </div>
          </section>
        ) : (
          <section className="empty-state">
            <div className="empty-visual">
              <div className="empty-icon">🎒</div>
              <h3>{t('home.noTrips')}</h3>
              <p>{t('home.noTripsDescription')}</p>
            </div>
            <button
              className="empty-cta"
              onClick={() => navigate('/create-group')}
            >
              <BiPlus /> {t('home.createTrip')}
            </button>
          </section>
        )}

        {/* Recent Activity */}
        {recentExpenses.length > 0 && (
          <section className="activity-section">
            <div className="section-header">
              <h2 className="section-title">{t('home.recentPayments')}</h2>
              {recentExpenses.length > 3 && (
                <button className="view-all-btn" onClick={() => navigate('/activity')}>
                  {t('home.viewAll')} <BiChevronRight />
                </button>
              )}
            </div>

            <div className="activity-timeline">
              {recentExpenses.slice(0, 3).map((expense) => (
                <div
                  key={expense.id}
                  className="activity-entry"
                  onClick={() => navigate(`/groups/${expense.groupId}`)}
                >
                  <div className="activity-visual">
                    <div className="activity-icon">{getCategoryEmoji(expense.cat)}</div>
                  </div>
                  <div className="activity-detail">
                    <p className="activity-title">{expense.desc}</p>
                    <p className="activity-context">
                      {expense.groupName} • {formatDate(expense.date)}
                    </p>
                  </div>
                  <div className="activity-amount">
                    {formatCurrency(expense.amt)}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Footer Spacing */}
        <div className="content-footer"></div>
      </main>

      {/* Create Group Modal */}
      <CreateGroupModal
        isOpen={isCreateGroupModalOpen}
        onClose={() => setIsCreateGroupModalOpen(false)}
        onGroupCreated={(newGroup) => {
          // newGroup contains groupId and inviteCode
          navigate(`/groups/${newGroup.groupId}`)
        }}
        userId={user?.uid}
        userData={{
          displayName: getDisplayName(userProfile, user),
          email: user?.email || '',
          photo: user?.photoURL || null
        }}
      />
    </div>
  )
}

export default HomePage
