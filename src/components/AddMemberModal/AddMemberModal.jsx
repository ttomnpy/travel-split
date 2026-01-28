import { useState, useEffect } from 'react'
import { BiX, BiLoader, BiUser } from 'react-icons/bi';
import { useTranslation } from '../../hooks/useTranslation'
import { useAuth } from '../../contexts/AuthContext'
import { addDummyMember } from '../../services/groupService'
import { debugLog, debugError } from '../../utils/debug'
import './AddMemberModal.css'

function AddMemberModal({ isOpen, onClose, groupId, groupMembers, onMemberAdded }) {
  const { user } = useAuth()
  const { t } = useTranslation()
  const [memberName, setMemberName] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setMemberName('')
      setError('')
      setSuccess(false)
    }
  }, [isOpen])

  const validateName = (name) => {
    const trimmed = name.trim()

    if (!trimmed) {
      return { valid: false, error: t('addMember.errors.nameRequired') }
    }

    if (trimmed.length > 30) {
      return { valid: false, error: t('addMember.errors.nameTooLong') }
    }

    // Check for duplicate names (case-insensitive)
    const existingNames = Object.values(groupMembers || {}).map(m => m.name?.toLowerCase())
    if (existingNames.includes(trimmed.toLowerCase())) {
      return { valid: false, error: t('addMember.errors.nameDuplicate') }
    }

    return { valid: true, error: '' }
  }

  const handleInputChange = (e) => {
    const value = e.target.value
    setMemberName(value)
    setError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    const validation = validateName(memberName)
    if (!validation.valid) {
      setError(validation.error)
      return
    }

    setIsLoading(true)

    try {
      if (!user?.uid) {
        throw new Error('User not authenticated')
      }

      debugLog('Adding dummy member', { groupId, memberName: memberName.trim(), userId: user.uid })
      const result = await addDummyMember(groupId, memberName.trim(), user.uid, 'member')
      debugLog('Successfully added dummy member', { dummyId: result.dummyId })

      setSuccess(true)
      setMemberName('')

      // Notify parent and close after delay
      setTimeout(() => {
        if (onMemberAdded) {
          onMemberAdded(result.dummyId, result.member)
        }
        onClose()
      }, 800)
    } catch (err) {
      debugError('Error adding member', { code: err.code, message: err.message, stack: err.stack })

      if (err.message.includes('duplicate')) {
        setError(t('addMember.errors.nameDuplicate'))
      } else if (err.message.includes('permission')) {
        setError(t('addMember.errors.permission'))
      } else if (err.message.includes('Network')) {
        setError(t('addMember.errors.network'))
      } else {
        setError(t('addMember.errors.generic'))
      }
    } finally {
      setIsLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="amm-overlay" onClick={onClose}>
      <div className="amm-content" onClick={e => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="amm-header">
          <h2 className="amm-title">{t('addMember.title')}</h2>
          <button
            className="amm-close-btn"
            onClick={onClose}
            aria-label="Close modal"
            disabled={isLoading}
          >
            <BiX />
          </button>
        </div>

        {/* Success Message */}
        {success && (
          <div className="amm-success">
            <span>{t('addMember.success')}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="amm-form">
          {/* Info Message */}
          <div className="amm-info">
            <span>{t('addMember.subtitle')}</span>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="amm-error">
              <span>{error}</span>
            </div>
          )}

          {/* Name Input */}
          <div className="amm-form-group">
            <label htmlFor="member-name" className="amm-label">
              {t('addMember.memberName')} <span className="required">{t('addMember.required')}</span>
            </label>
            <div className="input-wrapper">
              <BiUser className="input-icon" />
              <input
                id="member-name"
                type="text"
                value={memberName}
                onChange={handleInputChange}
                placeholder={t('addMember.placeholder')}
                maxLength={30}
                autoFocus
                disabled={isLoading}
                className={`amm-input ${error ? 'error' : ''}`}
              />
            </div>
            <div className="char-count">
              {memberName.length} / 30
            </div>
          </div>

          {/* Buttons */}
          <div className="amm-actions">
            <button
              type="button"
              className="amm-btn amm-btn-secondary"
              onClick={onClose}
              disabled={isLoading}
            >
              {t('addMember.cancel')}
            </button>
            <button
              type="submit"
              className="amm-btn amm-btn-primary"
              disabled={isLoading || !memberName.trim()}
            >
              {isLoading ? (
                <>
                  <BiLoader className="spinner" />
                  {t('addMember.adding')}
                </>
              ) : (
                <>
                  <BiUser />
                  {t('addMember.addBtn')}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default AddMemberModal
