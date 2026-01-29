import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ref, onValue, update } from 'firebase/database'
import { rtdb } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import { useTranslation } from '../../hooks/useTranslation'
import { getDisplayName } from '../../utils/displayNameHelper'
import { debugLog, debugError } from '../../utils/debug'
import { leaveGroup, deleteGroup } from '../../services/groupService'
import { HeaderControls, LoadingSpinner, ConfirmationModal, MemberManagement } from '../../components'
import { BiUndo, BiX } from 'react-icons/bi'
import './GroupSettingsPage.css'

function GroupSettingsPage({ onLogout }) {
  const { groupId } = useParams()
  const navigate = useNavigate()
  const { user, userProfile } = useAuth()
  const { t, currentLanguage, setLanguage } = useTranslation()
  const isInitializedRef = useRef(false)

  const [group, setGroup] = useState(null)
  const [memberData, setMemberData] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSavingSettings, setIsSavingSettings] = useState(false)
  const [isSavingMemberName, setIsSavingMemberName] = useState(false)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [refreshMembers, setRefreshMembers] = useState(0)
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    type: null, // 'leave' or 'delete'
    isLoading: false
  })

  // Form state
  const [formData, setFormData] = useState({
    groupName: '',
    currency: '',
    description: '',
    memberName: ''
  })

  // Check if current user is owner or admin
  const isOwner = group?.createdBy === user?.uid
  const userRole = memberData?.role
  const isAdmin = userRole === 'admin'
  const canManage = isOwner || isAdmin

  // Fetch group and member data
  useEffect(() => {
    if (!groupId || !user?.uid) return

    setIsLoading(true)
    setError('')
    isInitializedRef.current = false

    // Subscribe to group data
    const groupRef = ref(rtdb, `groups/${groupId}`)
    const unsubscribeGroup = onValue(
      groupRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const groupData = snapshot.val()
          setGroup(groupData)

          // Only initialize form data once on first load
          if (!isInitializedRef.current) {
            setFormData({
              groupName: groupData.name || '',
              currency: groupData.currency || 'USD',
              description: groupData.description || '',
              memberName: groupData.members?.[user.uid]?.name || ''
            })
            isInitializedRef.current = true
          }

          // Always update member data
          if (groupData.members?.[user.uid]) {
            setMemberData(groupData.members[user.uid])
          }
        } else {
          setError(t('groupDetail.groupNotFound') || 'Group not found')
        }
        setIsLoading(false)
      },
      (err) => {
        debugError('Error fetching group data', err)
        setError(t('groupDetail.errorLoading') || 'Error loading group settings')
        setIsLoading(false)
      }
    )

    return () => unsubscribeGroup()
  }, [groupId, user?.uid])

  const handleSaveGroupSettings = async () => {
    if (!canManage) return

    setIsSavingSettings(true)
    setError('')
    setSuccessMessage('')

    try {
      if (!groupId) {
        throw new Error('Invalid group ID')
      }

      const gId = String(groupId)

      const updates = {}
      let hasUpdates = false

      // Update group name
      if (formData.groupName && String(formData.groupName).trim().length > 0) {
        updates[`groups/${gId}/name`] = String(formData.groupName).trim()
        hasUpdates = true
      }

      // Currency is locked and cannot be changed after group creation

      // Update description (always update if present)
      if (typeof formData.description === 'string' || typeof formData.description === 'undefined') {
        updates[`groups/${gId}/description`] = String(formData.description || '').trim()
        hasUpdates = true
      }

      // Check if there are any updates
      if (!hasUpdates || Object.keys(updates).length === 0) {
        setError(t('groupSettings.noChanges') || 'No changes to save')
        setIsSavingSettings(false)
        return
      }

      debugLog('Updating group settings', { groupId: gId, updates })
      await update(ref(rtdb), updates)

      debugLog('Group settings updated', { groupId })
      setSuccessMessage(t('groupSettings.savedSuccess') || 'Settings saved successfully!')

      setTimeout(() => {
        setSuccessMessage('')
      }, 3000)
    } catch (err) {
      debugError('Error saving group settings', err)
      setError(err.message || t('groupSettings.saveError') || 'Error saving settings')
    } finally {
      setIsSavingSettings(false)
    }
  }

  const handleSaveMemberName = async () => {
    setIsSavingMemberName(true)
    setError('')
    setSuccessMessage('')

    try {
      if (!formData.memberName || !formData.memberName.trim()) {
        setError(t('groupSettings.nameRequired') || 'Name cannot be empty')
        setIsSavingMemberName(false)
        return
      }

      if (!groupId || !String(groupId).trim() || !user?.uid || !String(user.uid).trim()) {
        throw new Error('Invalid group ID or user ID')
      }

      await update(ref(rtdb), {
        [`groups/${String(groupId).trim()}/members/${String(user.uid).trim()}/name`]: formData.memberName.trim()
      })

      debugLog('Member name updated', { groupId, userId: user.uid })
      setSuccessMessage(t('groupSettings.nameUpdated') || 'Your name has been updated!')

      setTimeout(() => {
        setSuccessMessage('')
      }, 3000)
    } catch (err) {
      debugError('Error updating member name', err)
      setError(err.message || t('groupSettings.updateError') || 'Error updating name')
    } finally {
      setIsSavingMemberName(false)
    }
  }

  const handleLeaveGroup = async () => {
    setConfirmModal({ isOpen: true, type: 'leave', isLoading: false })
  }

  const handleConfirmLeaveGroup = async () => {
    setConfirmModal((prev) => ({ ...prev, isLoading: true }))
    setError('')

    try {
      await leaveGroup(groupId, user.uid)
      debugLog('User left group', { groupId, userId: user.uid })
      setConfirmModal({ isOpen: false, type: null, isLoading: false })
      navigate('/')
    } catch (err) {
      debugError('Error leaving group', err)
      setError(err.message || t('groupDetail.errorLeaving') || 'Error leaving group')
      setConfirmModal((prev) => ({ ...prev, isLoading: false }))
    }
  }

  const handleDeleteGroup = async () => {
    setConfirmModal({ isOpen: true, type: 'delete', isLoading: false })
  }

  const handleConfirmDeleteGroup = async () => {
    setConfirmModal((prev) => ({ ...prev, isLoading: true }))
    setError('')

    try {
      await deleteGroup(groupId, user.uid)
      debugLog('Group deleted', { groupId, userId: user.uid })
      setConfirmModal({ isOpen: false, type: null, isLoading: false })
      navigate('/')
    } catch (err) {
      debugError('Error deleting group', err)
      setError(err.message || t('groupSettings.deleteError') || 'Error deleting group')
      setConfirmModal((prev) => ({ ...prev, isLoading: false }))
    }
  }

  const handleConfirmModalCancel = () => {
    setConfirmModal({ isOpen: false, type: null, isLoading: false })
  }

  if (isLoading) {
    return <LoadingSpinner />
  }

  return (
    <div className="group-settings-page">
      {/* Header */}
      <header className="settings-header">
        <button
          className="back-button"
          onClick={() => navigate(`/groups/${groupId}`)}
          aria-label="Go back"
        >
          <BiUndo />
        </button>
        <h1 className="settings-title">{t('groupSettings.title') || 'Group Settings'}</h1>
        <HeaderControls
          currentLanguage={currentLanguage}
          onLanguageChange={setLanguage}
          onLogout={onLogout}
          user={user}
          displayName={getDisplayName(userProfile, user)}
        />
      </header>

      {/* Main Content */}
      <main className="settings-main">
        {/* Error/Success Messages */}
        {error && (
          <div className="settings-message error-message">
            <BiX />
            <span>{error}</span>
            <button onClick={() => setError('')}>
              <BiX />
            </button>
          </div>
        )}

        {successMessage && (
          <div className="settings-message success-message">
            <span>✓</span>
            <span>{successMessage}</span>
            <button onClick={() => setSuccessMessage('')}>
              <BiX />
            </button>
          </div>
        )}

        {/* Group Settings (Owner and Admin) */}
        {canManage && (
          <section className="settings-section group-settings">
            <h2 className="section-title">{t('groupSettings.groupSettings') || 'Group Settings'}</h2>
            <p className="section-subtitle">
              {isOwner ? (t('groupSettings.ownerOnly') || 'Only the group owner can modify these settings') : (t('groupSettings.adminCanEdit') || 'As an admin, you can modify these settings')}
            </p>

            <div className="gsp-form-group">
              <label htmlFor="groupName">{t('groupSettings.groupName') || 'Group Name'}</label>
              <input
                id="groupName"
                type="text"
                value={formData.groupName}
                onChange={(e) => setFormData({ ...formData, groupName: e.target.value })}
                placeholder={t('groupSettings.enterGroupName') || 'Enter group name'}
                disabled={isSavingSettings}
              />
            </div>

            <div className="gsp-form-group">
              <label htmlFor="currency">{t('groupSettings.currency') || 'Currency'}</label>
              <select
                id="currency"
                value={formData.currency}
                onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                disabled={true}
                title={t('groupSettings.currencyCannotChange') || 'Currency cannot be changed after group creation'}
              >
                <option value="USD">USD - US Dollar</option>
                <option value="EUR">EUR - Euro</option>
                <option value="GBP">GBP - British Pound</option>
                <option value="JPY">JPY - Japanese Yen</option>
                <option value="CNY">CNY - Chinese Yuan</option>
                <option value="HKD">HKD - Hong Kong Dollar</option>
                <option value="SGD">SGD - Singapore Dollar</option>
                <option value="AUD">AUD - Australian Dollar</option>
                <option value="CAD">CAD - Canadian Dollar</option>
              </select>
              <small className="gsp-form-note">{t('groupSettings.currencyCannotChangeNote') || 'Currency is locked and cannot be modified after group creation'}</small>
            </div>

            <div className="gsp-form-group">
              <label htmlFor="description">{t('groupSettings.description') || 'Description'}</label>
              <textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder={t('groupSettings.enterDescription') || 'Enter group description'}
                disabled={isSavingSettings}
                rows={4}
              />
            </div>

            <button
              className="save-button"
              onClick={handleSaveGroupSettings}
              disabled={isSavingSettings}
            >
              {isSavingSettings ? (t('common.saving') || 'Saving...') : (t('common.save') || 'Save Changes')}
            </button>
          </section>
        )}

        {/* Member Management (Owner and Admin) */}
        {canManage && (
          <MemberManagement
            groupId={groupId}
            members={group?.members}
            currentUserId={user?.uid}
            onMembersChange={() => setRefreshMembers((prev) => prev + 1)}
          />
        )}

        {/* Member Settings */}
        <section className="settings-section member-settings">
          <h2 className="section-title">{t('groupSettings.memberSettings') || 'Your Settings in This Group'}</h2>

          <div className="gsp-form-group">
            <label htmlFor="memberName">{t('groupSettings.yourName') || 'Your Name in This Group'}</label>
            <input
              id="memberName"
              type="text"
              value={formData.memberName}
              onChange={(e) => setFormData({ ...formData, memberName: e.target.value })}
              placeholder={t('groupSettings.enterName') || 'Enter your name'}
              disabled={isSavingMemberName}
            />
            <p className="gsp-form-hint">
              {t('groupSettings.nameHint') || 'This name will be shown to other group members for expenses'}
            </p>
          </div>

          <button
            className="save-button"
            onClick={handleSaveMemberName}
            disabled={isSavingMemberName}
          >
            {isSavingMemberName ? (t('common.saving') || 'Saving...') : (t('common.save') || 'Update Name')}
          </button>
        </section>

        {/* Leave/Delete Group Section */}
        <section className="settings-section danger-zone">
          <h2 className="section-title danger">{t('groupSettings.dangerZone') || 'Danger Zone'}</h2>

          <div className="danger-action">
            <div className="danger-info">
              {isOwner ? (
                <>
                  <h3>{t('groupSettings.deleteGroup') || 'Delete This Group'}</h3>
                  <p>
                    {t('groupSettings.deleteDescription') || 'Permanently delete this group and all its data. This action cannot be undone.'}
                  </p>
                </>
              ) : (
                <>
                  <h3>{t('groupSettings.leaveGroup') || 'Leave This Group'}</h3>
                  <p>
                    {t('groupSettings.leaveDescription') || 'You will no longer see this group or be able to access its expenses'}
                  </p>
                </>
              )}
            </div>
            <button
              className={`leave-button ${isOwner ? 'danger' : ''}`}
              onClick={isOwner ? handleDeleteGroup : handleLeaveGroup}
              disabled={confirmModal.isLoading}
            >
              {isOwner ? (t('groupSettings.deleteButton') || 'Delete Group') : (t('groupSettings.leaveButton') || 'Leave Group')}
            </button>
          </div>
        </section>

        {/* Confirmation Modal */}
        <ConfirmationModal
          isOpen={confirmModal.isOpen}
          title={
            confirmModal.type === 'delete'
              ? t('groupSettings.confirmDeleteTitle') || 'Delete Group?'
              : t('groupSettings.confirmLeaveTitle') || 'Leave Group?'
          }
          message={
            confirmModal.type === 'delete'
              ? t('groupSettings.confirmDeleteMessage') || 'Are you sure you want to delete this group? This action cannot be undone and all group data will be permanently deleted.'
              : t('groupSettings.confirmLeaveMessage') || 'Are you sure you want to leave this group? You will no longer have access to it.'
          }
          confirmText={
            confirmModal.type === 'delete'
              ? t('groupSettings.confirmDelete') || 'Delete Group'
              : t('groupSettings.confirmLeave') || 'Leave Group'
          }
          cancelText={t('common.cancel') || 'Cancel'}
          isDangerous={true}
          isLoading={confirmModal.isLoading}
          onConfirm={confirmModal.type === 'delete' ? handleConfirmDeleteGroup : handleConfirmLeaveGroup}
          onCancel={handleConfirmModalCancel}
        />
      </main>
    </div>
  )
}

export default GroupSettingsPage
