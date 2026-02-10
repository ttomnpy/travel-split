import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ref, onValue, get } from 'firebase/database'
import { rtdb } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import { useTranslation } from '../../hooks/useTranslation'
import { debugLog, debugError } from '../../utils/debug'
import { LoadingSpinner, HeaderControls } from '../../components'
import { BiChevronLeft } from 'react-icons/bi'
import './ActivityPage.css'

function ActivityPage({ onLogout }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { t } = useTranslation()

  const [allExpenses, setAllExpenses] = useState([])
  const [userGroups, setUserGroups] = useState({})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedGroupFilter, setSelectedGroupFilter] = useState('all')
  const [sortBy, setSortBy] = useState('newest') // 'newest', 'oldest', 'amount-high', 'amount-low'
  
  const allExpensesRef = useRef({})
  const groupMapRef = useRef({})

  useEffect(() => {
    if (!user?.uid) return

    setIsLoading(true)
    setError('')

    let unsubscribeExpenses = []

    // First, get list of user's groups
    const unsubscribeUserGroups = onValue(
      ref(rtdb, `users/${user.uid}/groups`),
      (groupsSnapshot) => {
        try {
          if (!groupsSnapshot.exists()) {
            setUserGroups({})
            setAllExpenses([])
            setIsLoading(false)
            return
          }

          // groupsSnapshot.val() is now just a list of group IDs (true values)
          const groupIds = Object.keys(groupsSnapshot.val())
          
          // Fetch full group data for each group to get the name
          const fetchGroupData = async () => {
            const groupMap = {}
            for (const groupId of groupIds) {
              try {
                const groupRef = ref(rtdb, `groups/${groupId}`)
                const groupSnapshot = await get(groupRef)
                if (groupSnapshot.exists()) {
                  groupMap[groupId] = groupSnapshot.val().name || `Group ${groupId.slice(0, 8)}`
                } else {
                  groupMap[groupId] = `Group ${groupId.slice(0, 8)}`
                }
              } catch (err) {
                debugError(`Error fetching group ${groupId}`, err)
                groupMap[groupId] = `Group ${groupId.slice(0, 8)}`
              }
            }
            
            groupMapRef.current = groupMap
            setUserGroups(groupMap)
            
            // Set up listeners for each group's expenses
            allExpensesRef.current = {}
            unsubscribeExpenses.forEach(unsub => unsub())
            unsubscribeExpenses = []

            groupIds.forEach((groupId) => {
              // Listen to expenses
              const expensesRef = ref(rtdb, `groups/${groupId}/expenses`)
              const unsubscribe = onValue(
                expensesRef,
                (snapshot) => {
                  if (snapshot.exists()) {
                    const expenses = snapshot.val()
                    allExpensesRef.current[groupId] = Object.entries(expenses).map(([expenseId, expenseData]) => ({
                      id: expenseId,
                      groupId,
                      groupName: groupMapRef.current[groupId] || `Group ${groupId.slice(0, 8)}`,
                      ...expenseData
                    }))
                  } else {
                    allExpensesRef.current[groupId] = []
                  }

                  // Flatten and sort all expenses
                  const flatExpenses = Object.values(allExpensesRef.current).flat()
                  debugLog('All expenses updated:', flatExpenses)
                  setAllExpenses(flatExpenses)
                  setIsLoading(false)
                },
                (error) => {
                  debugError(`Error listening to expenses for group ${groupId}`, error)
                  setIsLoading(false)
                }
              )
              unsubscribeExpenses.push(unsubscribe)
            })
          }
          
          fetchGroupData()
        } catch (err) {
          debugError('Error processing user groups', err)
          setIsLoading(false)
        }
      },
      (error) => {
        debugError('Error fetching user groups', error)
        setError('Failed to load activity')
        setIsLoading(false)
      }
    )

    return () => {
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
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : (amount || 0)
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency
    }).format(numAmount)
  }

  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A'
    const date = new Date(timestamp)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    if (date.toDateString() === today.toDateString()) {
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday'
    } else if (date.getFullYear() === today.getFullYear()) {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    }
  }

  // Filter expenses
  const filteredExpenses = selectedGroupFilter === 'all'
    ? allExpenses
    : allExpenses.filter(exp => exp.groupId === selectedGroupFilter)

  // Sort expenses
  const sortedExpenses = [...filteredExpenses].sort((a, b) => {
    switch (sortBy) {
      case 'newest':
        return (b.created || 0) - (a.created || 0)
      case 'oldest':
        return (a.created || 0) - (b.created || 0)
      case 'amount-high':
        return (b.amount || 0) - (a.amount || 0)
      case 'amount-low':
        return (a.amount || 0) - (b.amount || 0)
      default:
        return 0
    }
  })

  if (isLoading) {
    return <LoadingSpinner />
  }

  return (
    <div className="activity-history-page-container">
      <header className="activity-history-header">
        <div className="activity-history-header-content">
          <button
            className="history-back-button"
            onClick={() => navigate('/')}
            aria-label="Back to home"
          >
            <BiChevronLeft />
          </button>
          <h1 className="activity-history-title">{t('activity.title') || 'Activity'}</h1>
          <div style={{ width: '2.5rem' }}></div> {/* Spacer for alignment */}
        </div>
      </header>

      <main className="activity-history-main">
        {error && (
          <div className="activity-history-error">
            <p>{error}</p>
          </div>
        )}

        {sortedExpenses.length > 0 ? (
          <>
            {/* Filters & Sort */}
            <div className="activity-history-controls">
              <div className="filter-group">
                <label htmlFor="group-filter">{t('activity.filterByGroup') || 'Filter by Group'}</label>
                <select
                  id="group-filter"
                  className="filter-select"
                  value={selectedGroupFilter}
                  onChange={(e) => setSelectedGroupFilter(e.target.value)}
                >
                  <option value="all">{t('activity.allGroups') || 'All Groups'}</option>
                  {Object.entries(userGroups).map(([groupId, groupName]) => (
                    <option key={groupId} value={groupId}>
                      {groupName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sort-group">
                <label htmlFor="sort-by">{t('activity.sortBy') || 'Sort by'}</label>
                <select
                  id="sort-by"
                  className="sort-select"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                >
                  <option value="newest">{t('activity.newest') || 'Newest First'}</option>
                  <option value="oldest">{t('activity.oldest') || 'Oldest First'}</option>
                  <option value="amount-high">{t('activity.amountHigh') || 'Amount (High to Low)'}</option>
                  <option value="amount-low">{t('activity.amountLow') || 'Amount (Low to High)'}</option>
                </select>
              </div>
            </div>

            {/* Activity List */}
            <div className="activity-history-list">
              {sortedExpenses.map((expense) => (
                <div
                  key={`${expense.groupId}-${expense.id}`}
                  className="activity-history-card"
                  onClick={() => navigate(`/groups/${expense.groupId}`)}
                  role="button"
                  tabIndex={0}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      navigate(`/groups/${expense.groupId}`)
                    }
                  }}
                >
                  <div className="history-card-left">
                    <div className="history-card-icon">
                      {getCategoryEmoji(expense.category)}
                    </div>
                    <div className="history-card-info">
                      <p className="history-card-title">{expense.description}</p>
                      <p className="history-card-meta">
                        {expense.groupName} • {formatDate(expense.date || expense.created)}
                      </p>
                    </div>
                  </div>
                  <div className="history-card-amount">
                    {formatCurrency(expense.amount)}
                  </div>
                </div>
              ))}
            </div>

            {/* Result count */}
            <div className="activity-history-footer">
              <p className="result-count">
                {sortedExpenses.length} {sortedExpenses.length === 1 ? t('activity.expense') : t('activity.expenses') || 'expenses'}
              </p>
            </div>
          </>
        ) : (
          <div className="activity-history-empty">
            <div className="empty-icon">📊</div>
            <h2>{t('activity.noActivity') || 'No Activity Yet'}</h2>
            <p>{t('activity.noActivityDescription') || 'Your activity history will appear here'}</p>
            <button
              className="empty-cta"
              onClick={() => navigate('/')}
            >
              {t('activity.backHome') || 'Back to Home'}
            </button>
          </div>
        )}
      </main>

      <HeaderControls onLogout={onLogout} />
    </div>
  )
}

export default ActivityPage
