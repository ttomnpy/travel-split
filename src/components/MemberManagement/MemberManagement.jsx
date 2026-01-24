import { useState } from 'react'
import { BiTrash, BiEdit, BiCheck, BiX } from 'react-icons/bi'
import { useTranslation } from '../../hooks/useTranslation'
import { debugLog, debugError } from '../../utils/debug'
import { removeMemberFromGroup, updateMemberNameAsOwner } from '../../services/groupService'
import ConfirmationModal from '../ConfirmationModal/ConfirmationModal'
import './MemberManagement.css'

function MemberManagement({ groupId, members, currentUserId, onMembersChange }) {
  const { t } = useTranslation()
  const [editingMemberId, setEditingMemberId] = useState(null)
  const [editingName, setEditingName] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    targetMemberId: null,
    targetMemberName: '',
    isLoading: false
  })
  const [error, setError] = useState('')

  if (!members || Object.keys(members).length === 0) {
    return null
  }

  // Filter out owner and current user from management list
  const managedMembers = Object.entries(members)
    .filter(([memberId, member]) => {
      // Cannot manage owner
      if (member.role === 'owner') return false
      // Can manage other members
      return true
    })
    .map(([memberId, member]) => ({ id: memberId, ...member }))

  if (managedMembers.length === 0) {
    return null
  }

  const startEdit = (memberId, currentName) => {
    setEditingMemberId(memberId)
    setEditingName(currentName)
    setError('')
  }

  const cancelEdit = () => {
    setEditingMemberId(null)
    setEditingName('')
    setError('')
  }

  const handleSaveMemberName = async (memberId) => {
    if (!editingName.trim()) {
      setError(t('groupSettings.nameRequired') || 'Name cannot be empty')
      return
    }

    setIsSaving(true)
    setError('')

    try {
      await updateMemberNameAsOwner(groupId, memberId, editingName.trim(), currentUserId)
      debugLog('Member name updated by owner', { memberId, newName: editingName })
      setEditingMemberId(null)
      setEditingName('')
      onMembersChange?.()
    } catch (err) {
      debugError('Error updating member name', err)
      setError(err.message || t('groupSettings.updateError') || 'Error updating name')
    } finally {
      setIsSaving(false)
    }
  }

  const openRemoveConfirm = (memberId, memberName) => {
    setConfirmModal({
      isOpen: true,
      targetMemberId: memberId,
      targetMemberName: memberName,
      isLoading: false
    })
    setError('')
  }

  const handleConfirmRemove = async () => {
    setConfirmModal((prev) => ({ ...prev, isLoading: true }))

    try {
      await removeMemberFromGroup(groupId, confirmModal.targetMemberId, currentUserId)
      debugLog('Member removed from group', { memberId: confirmModal.targetMemberId })
      setConfirmModal({ isOpen: false, targetMemberId: null, targetMemberName: '', isLoading: false })
      onMembersChange?.()
    } catch (err) {
      debugError('Error removing member', err)
      setError(err.message || t('groupSettings.removeError') || 'Error removing member')
      setConfirmModal((prev) => ({ ...prev, isLoading: false }))
    }
  }

  const handleCancelRemove = () => {
    setConfirmModal({ isOpen: false, targetMemberId: null, targetMemberName: '', isLoading: false })
    setError('')
  }

  return (
    <>
      <section className="settings-section member-management-section">
        <h2 className="section-title">{t('groupSettings.manageMembers') || 'Manage Members'}</h2>
        <p className="section-subtitle">
          {t('groupSettings.manageMembersDesc') || 'Change member names or remove members from the group'}
        </p>

        {error && (
          <div className="member-management-error">
            <span>{error}</span>
            <button onClick={() => setError('')}>
              <BiX />
            </button>
          </div>
        )}

        <div className="member-management-list">
          {managedMembers.map((member) => (
            <div key={member.id} className="member-management-row">
              <div className="member-info-col">
                <div className="member-avatar-small">
                  {member.photo ? (
                    <img src={member.photo} alt={member.name} />
                  ) : (
                    <div className="avatar-initials-small">
                      {(member.name || 'M')
                        .split(' ')
                        .map((part) => part[0])
                        .join('')
                        .toUpperCase()
                        .substring(0, 2)}
                    </div>
                  )}
                </div>
                <div className="member-details-col">
                  {editingMemberId === member.id ? (
                    <input
                      type="text"
                      className="member-name-input"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      placeholder={t('groupSettings.enterName') || 'Enter member name'}
                      disabled={isSaving}
                      autoFocus
                    />
                  ) : (
                    <>
                      <p className="member-name-display">{member.name}</p>
                      {member.email && <p className="member-email-display">{member.email}</p>}
                    </>
                  )}
                </div>
              </div>

              <div className="member-actions-col">
                {editingMemberId === member.id ? (
                  <>
                    <button
                      className="member-action-btn member-action-btn-confirm"
                      onClick={() => handleSaveMemberName(member.id)}
                      disabled={isSaving}
                      title={t('common.save') || 'Save'}
                    >
                      <BiCheck />
                    </button>
                    <button
                      className="member-action-btn member-action-btn-cancel"
                      onClick={cancelEdit}
                      disabled={isSaving}
                      title={t('common.cancel') || 'Cancel'}
                    >
                      <BiX />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="member-action-btn member-action-btn-edit"
                      onClick={() => startEdit(member.id, member.name)}
                      title={t('common.edit') || 'Edit'}
                    >
                      <BiEdit />
                    </button>
                    <button
                      className="member-action-btn member-action-btn-remove"
                      onClick={() => openRemoveConfirm(member.id, member.name)}
                      title={t('common.remove') || 'Remove'}
                    >
                      <BiTrash />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        title={t('groupSettings.removeMemberTitle') || 'Remove Member?'}
        message={
          confirmModal.targetMemberName
            ? (t('groupSettings.removeMemberMessage', { memberName: confirmModal.targetMemberName }) ||
              `Are you sure you want to remove "${confirmModal.targetMemberName}" from this group? They will no longer have access to group data.`)
            : 'Are you sure you want to remove this member from the group?'
        }
        confirmText={t('groupSettings.remove') || 'Remove'}
        cancelText={t('common.cancel') || 'Cancel'}
        isDangerous={true}
        isLoading={confirmModal.isLoading}
        onConfirm={handleConfirmRemove}
        onCancel={handleCancelRemove}
      />
    </>
  )
}

export default MemberManagement
