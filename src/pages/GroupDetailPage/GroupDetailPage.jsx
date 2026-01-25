import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ref, onValue } from 'firebase/database'
import { rtdb } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import { useTranslation } from '../../hooks/useTranslation'
import { getDisplayName } from '../../utils/displayNameHelper'
import { debugLog, debugError } from '../../utils/debug'
import { getGroup } from '../../services/groupService'
import { AddMemberModal, InviteModal, MembersList, LoadingSpinner, HeaderControls, AddExpenseModal } from '../../components'
import { BiUndo, BiPlus, BiMoney, BiX, BiLock, BiShare } from 'react-icons/bi';
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

        {/* Group Info */}
        {group?.description && (
          <section className="group-info">
            <h2 className="section-label">{t('groupDetail.aboutThisTrip')}</h2>
            <p className="group-description">{group.description}</p>
          </section>
        )}

        {/* Members */}
        <section className="group-members">
          <MembersList
            members={members}
            currentUserId={user?.uid}
            isOwner={isOwner}
            onAddMember={() => setShowAddMemberModal(true)}
          />
        </section>

        {/* Add Member Modal */}
        <AddMemberModal
          isOpen={showAddMemberModal}
          onClose={() => setShowAddMemberModal(false)}
          groupId={groupId}
          groupMembers={members}
          onMemberAdded={handleAddMember}
        />

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

        <div className="content-footer"></div>
      </main>
    </div>
  )
}

export default GroupDetailPage
