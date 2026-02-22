import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ref, get } from 'firebase/database'
import { rtdb } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import { useTranslation } from '../../hooks/useTranslation'
import { getDisplayName } from '../../utils/displayNameHelper'
import { debugLog, debugError } from '../../utils/debug'
import { Button, LoadingSpinner, HeaderControls } from '../../components'
import { claimDummyMember, joinGroupById } from '../../services/groupService'
import { BiLink, BiChevronLeft, BiCheck, BiX, BiWallet } from 'react-icons/bi'
import './JoinGroupPage.css'

function JoinGroupPage({ onLogout = () => {} }) {
  const navigate = useNavigate()
  const { inviteCode: inviteCodeFromUrl } = useParams()
  const { user, userProfile } = useAuth()
  const { t, currentLanguage, setLanguage } = useTranslation()

  const [step, setStep] = useState('input') // 'input' | 'selectMember' | 'success'
  const [inviteCode, setInviteCode] = useState('')
  const [groupData, setGroupData] = useState(null)
  const [dummyMembers, setDummyMembers] = useState([])
  const [selectedDummy, setSelectedDummy] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  // Auto-fill and search if invite code is in URL
  useEffect(() => {
    if (inviteCodeFromUrl) {
      const upperCode = inviteCodeFromUrl.toUpperCase()
      setInviteCode(upperCode)
      // Trigger search after setting the code
      handleSearchGroup(upperCode)
    }
  }, [inviteCodeFromUrl])

  const handleInputChange = (e) => {
    setInviteCode(e.target.value.toUpperCase())
    setError('')
  }

  const handleSearchGroup = async (codeToSearch = null) => {
    let codeToUse = codeToSearch || inviteCode || ''
    
    // Ensure it's always a string
    if (typeof codeToUse !== 'string') {
      codeToUse = String(codeToUse)
    }
    codeToUse = codeToUse.trim()
    
    if (!codeToUse) {
      setError(t('joinGroup.inviteCodeRequired') || 'Please enter an invite code')
      return
    }

    setIsLoading(true)
    setError('')

    let normalizedCode = ''
    try {
      // Use userProfile from AuthContext (already fetched globally)
      normalizedCode = codeToUse.toUpperCase()
      debugLog('Searching for invite code', { code: normalizedCode })

      // Get group ID from invite code
      const inviteCodeRef = ref(rtdb, `inviteCodes/${normalizedCode}`)
      let inviteSnapshot
      
      try {
        inviteSnapshot = await get(inviteCodeRef)
      } catch (err) {
        debugError('Error reading invite code', err)
        
        // Handle permission and network errors specifically
        if (err.message?.includes('Permission denied') || err.code === 'PERMISSION_DENIED') {
          setError(t('joinGroup.permissionDenied') || 'Permission denied. Please ensure you are logged in.')
        } else if (err.message?.includes('Network') || err.message?.includes('timeout')) {
          setError(t('joinGroup.networkError') || 'Network error. Please check your connection.')
        } else {
          setError(t('joinGroup.invalidInviteCode') || 'Invalid invite code or network error')
        }
        setIsLoading(false)
        return
      }

      if (!inviteSnapshot.exists()) {
        debugLog('Invite code not found', { code: normalizedCode })
        setError(t('joinGroup.invalidInviteCode') || 'Invalid invite code')
        setIsLoading(false)
        return
      }

      const groupId = inviteSnapshot.val()
      debugLog('Group ID found', { groupId })

      // Get full group data
      const groupRef = ref(rtdb, `groups/${groupId}`)
      let groupSnapshot
      
      try {
        groupSnapshot = await get(groupRef)
      } catch (err) {
        debugError('Error reading group data', err)
        
        // Show actual error message
        if (err.message?.includes('Permission denied') || err.code === 'PERMISSION_DENIED') {
          setError(`${t('joinGroup.permissionDenied') || 'Permission denied'} - ${err.message}`)
        } else if (err.message?.includes('Network') || err.message?.includes('timeout')) {
          setError(t('joinGroup.networkError') || 'Network error. Please check your connection.')
        } else {
          setError(`${t('joinGroup.errorSearching') || 'Error searching for group'} - ${err.message}`)
        }
        setIsLoading(false)
        return
      }

      if (!groupSnapshot.exists()) {
        debugLog('Group not found', { groupId })
        setError(t('joinGroup.groupNotFound') || 'Group not found')
        setIsLoading(false)
        return
      }

      const group = groupSnapshot.val()
      debugLog('Group data loaded', { groupId, memberCount: Object.keys(group.members || {}).length })

      // Check if user is already an active member (not removed/kicked)
      const existingMember = group.members?.[user.uid]
      if (existingMember && existingMember.status !== 'removed') {
        setError(t('joinGroup.alreadyMember') || 'You are already a member of this group')
        setIsLoading(false)
        return
      }

      // Get unclaimed dummy members
      const dummies = Object.entries(group.members || {})
        .filter(([id, member]) => {
          const isDummy = member.type === 'dummy'
          const isUnclaimed = !member.claimedBy
          debugLog('Checking member', { id, type: member.type, claimedBy: member.claimedBy, isDummy, isUnclaimed })
          return isDummy && isUnclaimed
        })
        .map(([id, member]) => ({
          id,
          ...member
        }))

      debugLog('Filtered dummies', { totalMembers: Object.entries(group.members || {}).length, dummyCount: dummies.length, dummies })

      setGroupData({
        id: groupId,
        name: group.name,
        description: group.description,
        currency: group.currency,
        createdBy: group.createdBy,
        memberCount: group.summary?.memberCount || Object.keys(group.members || {}).length
      })

      setDummyMembers(dummies)
      setStep(dummies.length > 0 ? 'selectMember' : 'joinAsNew')

      debugLog('Group found and dummy members loaded', { groupId, dummyCount: dummies.length })
    } catch (err) {
      debugError('Error searching group', err)
      console.error('Detailed error:', {
        code: err.code,
        message: err.message,
        stack: err.stack
      })
      
      // Improved error messages
      if (err.message?.includes('Permission denied')) {
        setError(t('joinGroup.permissionDenied') || 'Permission denied. Please ensure you are logged in and have network access.')
      } else if (err.code === 'PERMISSION_DENIED' || err.message?.includes('PERMISSION_DENIED')) {
        setError(t('joinGroup.permissionDenied') || 'Permission denied. Please ensure you are logged in and have network access.')
      } else if (err.message?.includes('not defined') || !normalizedCode) {
        setError(t('joinGroup.invalidInviteCode') || 'Invalid invite code')
      } else if (err.message?.includes('Network') || err.message?.includes('connection')) {
        setError(t('joinGroup.networkError') || 'Network error. Please check your internet connection.')
      } else {
        setError(t('joinGroup.errorSearching') || 'Error searching for group. Please try again.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleClaimDummy = async (dummyId) => {
    setIsLoading(true)
    setError('')

    try {
      const displayName = getDisplayName(userProfile, user)
      const result = await claimDummyMember(
        groupData.id,
        dummyId,
        user.uid,
        displayName,
        user.email,
        user.photoURL || null
      )

      setSuccessMessage(
        t('joinGroup.successClaimed') || 
        `Successfully claimed "${dummyId}" in ${groupData.name}`
      )
      setStep('success')

      debugLog('Successfully claimed dummy member', result)

      // Callback to parent
      setTimeout(() => {
        navigate(`/groups/${groupData.id}`)
      }, 1500)
    } catch (err) {
      debugError('Error claiming dummy member', err)
      setError(err.message || t('joinGroup.errorClaiming') || 'Error claiming member. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleJoinAsNew = async () => {
    setIsLoading(true)
    setError('')

    try {
      const displayName = getDisplayName(userProfile, user)
      const result = await joinGroupById(
        groupData.id,
        user.uid,
        {
          displayName: displayName,
          email: user.email,
          photoURL: user.photoURL
        }
      )

      setSuccessMessage(
        t('joinGroup.successJoined') || 
        `Successfully joined ${groupData.name}`
      )
      setStep('success')

      debugLog('Successfully joined group as new member', result)

      // Callback to parent
      setTimeout(() => {
        navigate(`/groups/${groupData.id}`)
      }, 1500)
    } catch (err) {
      debugError('Error joining group', err)
      setError(err.message || t('joinGroup.errorJoining') || 'Error joining group. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleBack = () => {
    if (step === 'selectMember' || step === 'joinAsNew') {
      setStep('input')
      setSelectedDummy(null)
      setGroupData(null)
      setDummyMembers([])
    } else {
      navigate('/')
    }
  }

  return (
    <div className="join-group-page">
      {/* Header */}
      <header className="join-group-header">
        <button
          className="back-button"
          onClick={handleBack}
          disabled={isLoading}
          aria-label="Go back"
        >
          <BiChevronLeft />
        </button>
        <h1 className="join-group-title">{t('joinGroup.title') || 'Join a Group'}</h1>
        <HeaderControls
          currentLanguage={currentLanguage}
          onLanguageChange={setLanguage}
          onLogout={onLogout}
          user={user}
          displayName={getDisplayName(userProfile, user)}
        />
      </header>

      {/* Main Content */}
      <div className="join-group-content">
        {isLoading && <LoadingSpinner />}

        {/* Step 1: Input Invite Code */}
        {step === 'input' && !isLoading && (
          <div className="step-input">
            <div className="step-icon">
              <BiLink />
            </div>
            <h2>{t('joinGroup.enterCode') || 'Enter Invite Code'}</h2>
            <p className="step-description">
              {t('joinGroup.codeDescription') || 'Ask the group organizer for an 8-character invite code'}
            </p>

            <div className="jgp-input-group">
              <input
                type="text"
                className="invite-code-input"
                placeholder={t('joinGroup.codePlaceholder') || 'E.g., ABC123XY'}
                value={inviteCode}
                onChange={handleInputChange}
                onKeyPress={(e) => e.key === 'Enter' && handleSearchGroup()}
                maxLength="10"
              />
              {inviteCode && (
                <button
                  className="clear-button"
                  onClick={() => {
                    setInviteCode('')
                    setError('')
                  }}
                >
                  <BiX />
                </button>
              )}
            </div>

            {error && <div className="error-message">{error}</div>}

            <button
              className="search-button"
              onClick={() => handleSearchGroup()}
              disabled={!inviteCode.trim()}
            >
              {t('joinGroup.search') || 'Search'}
            </button>
          </div>
        )}

        {/* Step 2: Select Member or Join as New */}
        {(step === 'selectMember' || step === 'joinAsNew') && !isLoading && groupData && (
          <div className="step-select-member">
            <div className="group-info">
              <h2 className="group-name">{groupData.name}</h2>
              {groupData.description && (
                <p className="group-description">{groupData.description}</p>
              )}
              <div className="group-meta">
                <span>{groupData.memberCount} {currentLanguage === 'zh-HK' ? '成員' : 'members'}</span>
                <span>•</span>
                <span>{groupData.currency}</span>
              </div>
            </div>

            {/* Dummy Members List */}
            {dummyMembers.length > 0 && step === 'selectMember' && (
              <div className="members-section">
                <h3>{t('joinGroup.claimDummy') || 'Are you one of these?'}</h3>
                <p className="section-description">
                  {t('joinGroup.claimDescription') || 'Select your name to claim the placeholder'}
                </p>

                <div className="dummy-members-list">
                  {dummyMembers.map((dummy) => (
                    <div
                      key={dummy.id}
                      className={`dummy-member-card ${selectedDummy === dummy.id ? 'selected' : ''}`}
                      onClick={() => setSelectedDummy(selectedDummy === dummy.id ? null : dummy.id)}
                    >
                      <div className="member-card-content">
                        <div className="member-avatar">
                          {dummy.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="member-info">
                          <p className="member-name">{dummy.name}</p>
                          <p className="member-role">{dummy.role === 'owner' ? 'Organizer' : 'Member'}</p>
                        </div>
                      </div>
                      {selectedDummy === dummy.id && (
                        <div className="member-selected">
                          <BiCheck />
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {selectedDummy && (
                  <button
                    className="confirm-button primary"
                    onClick={() => handleClaimDummy(selectedDummy)}
                  >
                    {t('joinGroup.confirm') || 'Confirm'}
                  </button>
                )}

                <div className="divider">
                  <span>{t('joinGroup.or') || 'OR'}</span>
                </div>
              </div>
            )}

            {/* Join as New Member */}
            <div className="join-as-new-section">
              <h3>
                {step === 'selectMember'
                  ? t('joinGroup.joinAsNewTitle') || 'Join as New Member'
                  : t('joinGroup.joinAsNew') || 'Join Group'
                }
              </h3>
              <p className="section-description">
                {t('joinGroup.joinAsNewDescription') || 'Add yourself as a new member to this group'}
              </p>

              <div className="new-member-info">
                <div className="member-avatar large">
                  {userProfile?.displayName?.charAt(0).toUpperCase() || 'U'}
                </div>
                <p className="member-name">{userProfile?.displayName || 'Member'}</p>
                <p className="member-email">{user?.email}</p>
              </div>

              <button
                className="confirm-button secondary"
                onClick={handleJoinAsNew}
              >
                {t('joinGroup.joinButton') || 'Join as New Member'}
              </button>
            </div>

            {error && <div className="error-message">{error}</div>}
          </div>
        )}

        {/* Step 3: Success */}
        {step === 'success' && !isLoading && (
          <div className="step-success">
            <div className="success-icon">✓</div>
            <h2>{t('joinGroup.successTitle') || 'Success!'}</h2>
            <p>{successMessage}</p>
            <button
              className="success-button"
              onClick={() => navigate(`/groups/${groupData.id}`)}
            >
              {t('joinGroup.goToGroup') || 'Go to Group'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default JoinGroupPage
