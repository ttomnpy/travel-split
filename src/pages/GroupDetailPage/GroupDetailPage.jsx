import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ref, onValue } from 'firebase/database'
import { rtdb } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import { useTranslation } from '../../hooks/useTranslation'
import { getDisplayName } from '../../utils/displayNameHelper'
import { debugLog, debugError } from '../../utils/debug'
import { getGroup } from '../../services/groupService'
import { deleteExpense } from '../../services/expenseService'
import { AddMemberModal, InviteModal, MembersList, LoadingSpinner, HeaderControls, AddExpenseModal, ConfirmationModal } from '../../components'
import { BiUndo, BiPlus, BiMoney, BiX, BiLock, BiShare, BiReceipt, BiChevronDown, BiTrash } from 'react-icons/bi';
import './GroupDetailPage.css'

function GroupDetailPage({ onLogout }) {
  const { groupId } = useParams()
  const navigate = useNavigate()
  const { user, userProfile } = useAuth()
  const { t, currentLanguage, setLanguage } = useTranslation()

  const [group, setGroup] = useState(null)
  const [members, setMembers] = useState({})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [errorType, setErrorType] = useState('')
  const [showAddMemberModal, setShowAddMemberModal] = useState(false)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [showAddExpenseModal, setShowAddExpenseModal] = useState(false)
  const [activeTab, setActiveTab] = useState('members')
  const [expandedExpense, setExpandedExpense] = useState(null)
  const [expenseToDelete, setExpenseToDelete] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    expenseId: null,
    expense: null,
    isLoading: false
  })

  // Fetch group details
  useEffect(() => {
    if (!groupId) {
      setError('Group not found')
      setIsLoading(false)
      return
    }

    const groupRef = ref(rtdb, `groups/${groupId}`)
    const unsubscribe = onValue(
      groupRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const groupData = snapshot.val()
          setGroup(groupData)
          setMembers(groupData.members || {})
          setError('')
          setErrorType('')
        } else {
          setError('Group not found')
          setErrorType('notFound')
        }
        setIsLoading(false)
      },
      (err) => {
        debugError('Error fetching group', err)
        // Check if it's a permission error
        if (err.code === 'PERMISSION_DENIED' || err.message?.includes('permission')) {
          setError('You do not have permission to access this group')
          setErrorType('permissionDenied')
        } else {
          setError('Failed to load group details')
          setErrorType('error')
        }
        setIsLoading(false)
      }
    )

    return () => unsubscribe()
  }, [groupId])

  const isOwner = group && group.owner === user?.uid
  const isGroupMember = group && members && (user?.uid in members)
  const hasPermission = isOwner || isGroupMember
  const expenseCount = group?.expenses ? Object.keys(group.expenses).length : 0
  const totalAmount = group?.summary?.totalExpenses || 0

  const handleAddMember = (dummyId, member) => {
    // Member is automatically added via Firebase listener
    setShowAddMemberModal(false)
  }

  const handleDeleteExpense = (expenseId, expense) => {
    setConfirmModal({
      isOpen: true,
      expenseId,
      expense,
      isLoading: false
    })
  }

  const handleConfirmDeleteExpense = async () => {
    const { expenseId, expense } = confirmModal
    setConfirmModal(prev => ({ ...prev, isLoading: true }))

    try {
      await deleteExpense(groupId, expenseId, expense)
      setExpandedExpense(null)
      setExpenseToDelete(null)
      setConfirmModal({
        isOpen: false,
        expenseId: null,
        expense: null,
        isLoading: false
      })
      debugLog('Expense deleted successfully', { expenseId })
    } catch (err) {
      debugError('Error deleting expense', err)
      setError(t('groupDetail.deleteExpenseError') || 'Failed to delete expense. Please try again.')
      setConfirmModal(prev => ({ ...prev, isLoading: false }))
    }
  }

  const handleCancelDeleteExpense = () => {
    setConfirmModal({
      isOpen: false,
      expenseId: null,
      expense: null,
      isLoading: false
    })
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: group?.currency || 'USD'
    }).format(amount || 0)
  }

  if (isLoading) {
    return (
      <div className="group-detail-page">
        <div className="loading-wrapper">
          <LoadingSpinner />
        </div>
      </div>
    )
  }

  if (error) {
    const isPermissionError = errorType === 'permissionDenied'
    
    return (
      <div className="group-detail-page error-page">
        {/* Minimalist Header */}
        <header className="error-header">
          <button
            className="error-back-button"
            onClick={() => navigate('/')}
            aria-label="Go back to home"
          >
            <BiUndo />
          </button>
        </header>

        {/* Main Error Content */}
        <main className="error-main-content">
          <div className="error-illustration">
            {isPermissionError ? (
              <div className="lock-icon-wrapper">
                <BiLock className="lock-icon" />
              </div>
            ) : (
              <div className="not-found-icon-wrapper">
                <BiX className="not-found-icon" />
              </div>
            )}
          </div>

          <div className="error-content-wrapper">
            <h1 className="error-title">
              {isPermissionError ? t('groupDetail.accessDenied') : t('groupDetail.groupNotFound')}
            </h1>
            
            <p className="error-subtitle">
              {isPermissionError 
                ? t('groupDetail.notMemberOfGroup')
                : t('groupDetail.groupNotFoundDescription')
              }
            </p>

            {isPermissionError && (
              <div className="error-suggestion">
                <p className="suggestion-label">💡 {t('groupDetail.suggestion') || 'Need access?'}</p>
                <p className="suggestion-text">{t('groupDetail.suggestionText')}</p>
              </div>
            )}
          </div>

          <button
            className="error-action-button"
            onClick={() => navigate('/')}
          >
            <BiUndo size={18} />
            <span>{t('groupDetail.backToHome')}</span>
          </button>
        </main>
      </div>
    )
  }

  // Check permissions after group is loaded
  if (group && !hasPermission) {
    return (
      <div className="group-detail-page error-page">
        {/* Minimalist Header */}
        <header className="error-header">
          <button
            className="error-back-button"
            onClick={() => navigate('/')}
            aria-label="Go back to home"
          >
            <BiUndo />
          </button>
        </header>

        {/* Main Error Content */}
        <main className="error-main-content">
          <div className="error-illustration">
            <div className="lock-icon-wrapper">
              <BiLock className="lock-icon" />
            </div>
          </div>

          <div className="error-content-wrapper">
            <h1 className="error-title">
              {t('groupDetail.accessDenied')}
            </h1>
            
            <p className="error-subtitle">
              {t('groupDetail.notMemberOfGroup')}
            </p>

            <div className="error-suggestion">
              <p className="suggestion-label">💡 {t('groupDetail.suggestion') || 'Need access?'}</p>
              <p className="suggestion-text">Ask the trip owner to invite you as a member to see and contribute to this trip.</p>
            </div>
          </div>

          <button
            className="error-action-button"
            onClick={() => navigate('/')}
          >
            <BiUndo size={18} />
            <span>{t('groupDetail.backToHome')}</span>
          </button>
        </main>
      </div>
    )
  }

  return (
    <div className="group-detail-page">
      {/* Header */}
      <header className="group-detail-header">
        <button
          className="back-button"
          onClick={() => navigate('/')}
          aria-label="Go back"
        >
          <BiUndo />
        </button>
        <h1 className="group-title">{group?.name}</h1>
        <HeaderControls
          currentLanguage={currentLanguage}
          onLanguageChange={setLanguage}
          onLogout={onLogout}
          user={user}
          displayName={getDisplayName(userProfile, user)}
        />
      </header>

      {/* Error/Success Messages */}
      {error && (
        <div className="group-message error-message">
          <BiX />
          <span>{error}</span>
          <button onClick={() => setError('')}>
            <BiX />
          </button>
        </div>
      )}

      {/* Main Content */}
      <main className="group-detail-main">
        {/* Group Summary */}
        <section className="group-summary">
          <div className="summary-card">
            <div className="summary-item">
              <span className="summary-label">{t('groupDetail.totalExpenses')}</span>
              <div className="summary-value">
                <BiMoney className="summary-icon" />
                <span>{formatCurrency(totalAmount)}</span>
              </div>
            </div>
            <div className="summary-item">
              <span className="summary-label">{t('groupDetail.transactions')}</span>
              <div className="summary-value">{expenseCount}</div>
            </div>
            <div className="summary-item">
              <span className="summary-label">{t('groupDetail.currency')}</span>
              <div className="summary-value">{group?.currency}</div>
            </div>
          </div>
        </section>

        {/* Action Buttons */}
        <section className="group-actions">
          <button
            className="action-btn primary"
            onClick={() => setShowAddExpenseModal(true)}
          >
            <BiPlus />
            {t('groupDetail.addExpense')}
          </button>
          {isOwner && (
            <button
              className="action-btn invite"
              onClick={() => setShowInviteModal(true)}
            >
              <BiShare />
              {t('groupDetail.invitePeople') || 'Invite People'}
            </button>
          )}
          <button
            className="action-btn secondary"
            onClick={() => navigate(`/groups/${groupId}/settings`)}
          >
            {t('groupDetail.settings')}
          </button>
        </section>

        {/* Group Info */}
        {group?.description && (
          <section className="group-info">
            <h2 className="section-label">{t('groupDetail.aboutThisTrip')}</h2>
            <p className="group-description">{group.description}</p>
          </section>
        )}

        {/* Tabs Section */}
        <section className="group-content-tabs">
          <div className="tabs-header">
            <button 
              className={`tab-button ${activeTab === 'members' ? 'active' : ''}`}
              onClick={() => setActiveTab('members')}
            >
              <span>{t('groupDetail.members') || 'Members'}</span>
            </button>
            <button 
              className={`tab-button ${activeTab === 'expenses' ? 'active' : ''}`}
              onClick={() => setActiveTab('expenses')}
            >
              <BiReceipt className="tab-icon" />
              <span>{t('groupDetail.expenses') || 'Expenses'}</span>
            </button>
          </div>

          {/* Members Tab */}
          {activeTab === 'members' && (
            <div className="tab-content members-tab">
              <MembersList
                members={members}
                currentUserId={user?.uid}
                isOwner={isOwner}
                onAddMember={() => setShowAddMemberModal(true)}
              />
            </div>
          )}

          {/* Expenses Tab */}
          {activeTab === 'expenses' && (
            <div className="tab-content expenses-tab">
              <div className="expenses-content">
                {expenseCount > 0 ? (
                  <div className="expense-list">
                    {group?.expenses && Object.entries(group.expenses).map(([expenseId, expense]) => {
                      const payerIds = Object.keys(expense.payers || {})
                      const participantIds = expense.participants || []
                      const expenseDate = expense.date ? new Date(expense.date).toLocaleDateString(currentLanguage === 'zh-HK' ? 'zh-HK' : 'en-US') : ''
                      const isExpanded = expandedExpense === expenseId
                      
                      return (
                        <div 
                          key={expenseId} 
                          className={`expense-item ${isExpanded ? 'expanded' : 'collapsed'}`}
                        >
                          {/* Compact Overview - Always Shown */}
                          <button
                            className="expense-overview"
                            onClick={() => {
                              // Prevent scroll position from jumping
                              const scrollPos = document.querySelector('.group-detail-main')?.scrollTop
                              setExpandedExpense(isExpanded ? null : expenseId)
                              // Restore scroll position after React renders
                              if (scrollPos !== undefined) {
                                requestAnimationFrame(() => {
                                  const mainContent = document.querySelector('.group-detail-main')
                                  if (mainContent) {
                                    mainContent.scrollTop = scrollPos
                                  }
                                })
                              }
                            }}
                            type="button"
                          >
                            <div className="overview-left">
                              {/* Payer Avatar */}
                              {payerIds.length > 0 && (
                                <div className="payer-avatar-section">
                                  <div className="avatar-large payer">
                                    {expense.payers[payerIds[0]]?.name?.charAt(0).toUpperCase()}
                                  </div>
                                </div>
                              )}
                              
                              <div className="expense-info">
                                <div className="expense-title-compact">{expense.description}</div>
                                <div className="overview-meta">
                                  <span className="meta-date">{expenseDate}</span>
                                  <span className="meta-category">{t(`expense.category.${expense.category}`) || expense.category}</span>
                                </div>
                              </div>
                            </div>

                            <div className="overview-right">
                              <div className="amount-and-avatars">
                                <div className="expense-amount-compact">
                                  {formatCurrency(expense.amount)}
                                </div>
                                
                                {/* Participant Avatars Stack */}
                                <div className="participant-avatars-stack">
                                  {participantIds.slice(0, 4).map((memberId, idx) => (
                                    <div key={memberId} className="avatar-small participant" title={members[memberId]?.name}>
                                      {members[memberId]?.name?.charAt(0).toUpperCase()}
                                    </div>
                                  ))}
                                  {participantIds.length > 4 && (
                                    <div className="avatar-small more">+{participantIds.length - 4}</div>
                                  )}
                                </div>
                              </div>
                              
                              <BiChevronDown className={`expand-icon ${isExpanded ? 'rotated' : ''}`} />
                            </div>
                          </button>

                          {/* Expanded Details - Shown on Click */}
                          {isExpanded && (
                            <div className="expense-details">
                              <div className="details-section">
                                <div className="details-group">
                                  <div className="group-label">{t('groupDetail.paidBy') || 'Paid by'}</div>
                                  <div className="details-pills">
                                    {payerIds.map((payerId) => (
                                      <div key={payerId} className="detail-pill payer">
                                        <span className="pill-name">{expense.payers[payerId]?.name}</span>
                                        <span className="pill-amount">{formatCurrency(expense.payers[payerId]?.amount)}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>

                                <div className="details-group">
                                  <div className="group-label">{t('groupDetail.involvedMembers') || 'Involved'}</div>
                                  <div className="details-pills">
                                    {participantIds.map((memberId) => (
                                      <div key={memberId} className="detail-pill participant">
                                        <span className="pill-name">{members[memberId]?.name || 'Unknown'}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>

                                {expense.location && (
                                  <div className="details-group">
                                    <div className="group-label">{t('groupDetail.location') || 'Location'}</div>
                                    <div className="detail-location">{expense.location}</div>
                                  </div>
                                )}
                              </div>

                              {/* Delete Button */}
                              {isOwner && (
                                <div className="expense-actions">
                                  <button
                                    className="btn-delete-expense"
                                    onClick={() => handleDeleteExpense(expenseId, expense)}
                                    disabled={isDeleting}
                                    title="Delete this expense"
                                  >
                                    <BiTrash size={16} />
                                    <span>{isDeleting ? 'Deleting...' : 'Delete'}</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="empty-state">
                    <BiReceipt className="empty-icon" />
                    <p>{t('groupDetail.noExpenses') || 'No expenses yet'}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Add Member Modal */}
        <AddMemberModal
          isOpen={showAddMemberModal}
          onClose={() => setShowAddMemberModal(false)}
          groupId={groupId}
          groupMembers={members}
          onMemberAdded={handleAddMember}
        />

        {/* Invite Modal */}
        <InviteModal
          isOpen={showInviteModal}
          onClose={() => setShowInviteModal(false)}
          groupId={groupId}
        />

        {/* Add Expense Modal */}
        <AddExpenseModal
          isOpen={showAddExpenseModal}
          onClose={() => setShowAddExpenseModal(false)}
          groupId={groupId}
          groupMembers={members}
          groupCurrency={group?.currency}
          currentUserId={user?.uid}
          onExpenseCreated={() => {
            setShowAddExpenseModal(false)
          }}
        />

        {/* Delete Expense Confirmation Modal */}
        <ConfirmationModal
          isOpen={confirmModal.isOpen}
          title={t('groupDetail.deleteExpenseTitle') || 'Delete Expense?'}
          message={t('groupDetail.deleteExpenseMessage') || 'Are you sure you want to delete this expense? This action cannot be undone.'}
          confirmText={t('groupDetail.deleteButton') || 'Delete'}
          cancelText={t('common.cancel') || 'Cancel'}
          isDangerous={true}
          isLoading={confirmModal.isLoading}
          onConfirm={handleConfirmDeleteExpense}
          onCancel={handleCancelDeleteExpense}
        />

        <div className="content-footer"></div>
      </main>
    </div>
  )
}

export default GroupDetailPage
