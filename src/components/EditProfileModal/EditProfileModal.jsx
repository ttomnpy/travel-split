import { useState } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import { updateProfile, sendPasswordResetEmail } from 'firebase/auth'
import { ref, update } from 'firebase/database'
import { auth, rtdb } from '../../firebase'
import { debugLog, debugError } from '../../utils/debug'
import { BiX, BiCheck, BiLoaderCircle } from 'react-icons/bi'
import './EditProfileModal.css'

function EditProfileModal({ isOpen, onClose, user, userProfile, onProfileUpdated }) {
  const { t } = useTranslation()
  const [displayName, setDisplayName] = useState(userProfile?.displayName || user?.displayName || '')
  const [email] = useState(user?.email || '')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [showResetPassword, setShowResetPassword] = useState(false)
  const [resetPasswordLoading, setResetPasswordLoading] = useState(false)
  const [resetPasswordMessage, setResetPasswordMessage] = useState('')

  if (!isOpen) return null

  const handleUpdateProfile = async () => {
    setError('')
    setSuccessMessage('')

    if (!displayName.trim()) {
      setError(t('profile.displayNameEmpty'))
      return
    }

    setIsLoading(true)

    try {
      // Update Firebase Auth profile
      if (user) {
        await updateProfile(user, {
          displayName: displayName.trim()
        })
      }

      // Update Firebase Database userProfile
      if (user?.uid) {
        const updates = {}
        updates[`users/${user.uid}/displayName`] = displayName.trim()

        await update(ref(rtdb), updates)
      }

      setSuccessMessage(t('profile.success'))
      debugLog('Profile updated successfully')

      // Notify parent component
      if (onProfileUpdated) {
        onProfileUpdated({
          displayName: displayName.trim()
        })
      }

      // Clear success message after 2 seconds and close
      setTimeout(() => {
        setSuccessMessage('')
        onClose()
      }, 2000)
    } catch (err) {
      debugError('Error updating profile', err)
      setError(t('profile.error'))
    } finally {
      setIsLoading(false)
    }
  }

  const handleResetPassword = async () => {
    setResetPasswordMessage('')
    setError('')

    setResetPasswordLoading(true)

    try {
      if (user?.email) {
        await sendPasswordResetEmail(auth, user.email)
        setResetPasswordMessage(t('profile.resetPasswordSent'))
        debugLog('Password reset email sent to', user.email)

        // Clear message after 3 seconds
        setTimeout(() => {
          setResetPasswordMessage('')
          setShowResetPassword(false)
        }, 3000)
      }
    } catch (err) {
      debugError('Error sending password reset email', err)
      setError(t('profile.error'))
    } finally {
      setResetPasswordLoading(false)
    }
  }

  return (
    <div className="edit-profile-modal-overlay" onClick={onClose}>
      <div className="edit-profile-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="edit-profile-header">
          <h2 className="edit-profile-title">
            {t('profile.editProfile') || 'Edit Profile'}
          </h2>
          <button className="close-btn" onClick={onClose} aria-label="Close">
            <BiX />
          </button>
        </div>

        {/* Content */}
        <div className="edit-profile-content">
          {error && (
            <div className="alert alert-error">
              {error}
            </div>
          )}

          {successMessage && (
            <div className="alert alert-success">
              <BiCheck className="alert-icon" />
              {successMessage}
            </div>
          )}

          {resetPasswordMessage && (
            <div className="alert alert-success">
              <BiCheck className="alert-icon" />
              {resetPasswordMessage}
            </div>
          )}

          {!showResetPassword ? (
            <>
              {/* Display Name Field */}
              <div className="form-group">
                <label htmlFor="displayName" className="form-label">
                  {t('profile.displayName') || 'Display Name'}
                </label>
                <input
                  type="text"
                  id="displayName"
                  className="form-input"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={t('profile.displayNamePlaceholder') || 'Enter your display name'}
                />
              </div>

              {/* Email Field (Read-only) */}
              <div className="form-group">
                <label htmlFor="email" className="form-label">
                  {t('profile.email') || 'Email'}
                </label>
                <input
                  type="email"
                  id="email"
                  className="form-input read-only"
                  value={email}
                  disabled
                  readOnly
                />
                <small className="field-hint">
                  {t('profile.emailReadOnly') || 'Email cannot be changed'}
                </small>
              </div>

              {/* Buttons */}
              <div className="edit-profile-actions">
                <button
                  className="btn btn-primary"
                  onClick={handleUpdateProfile}
                  disabled={isLoading}
                >
                  {isLoading && <BiLoaderCircle className="spinner" />}
                  {isLoading
                    ? t('profile.updating') || 'Updating...'
                    : t('profile.saveChanges') || 'Save Changes'}
                </button>
              </div>

              {/* Password Reset Section */}
              <div className="password-reset-section">
                <button
                  className="btn-text"
                  onClick={() => setShowResetPassword(true)}
                >
                  {t('profile.resetPassword') || 'Reset Password'}
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Reset Password Confirmation */}
              <div className="reset-password-info">
                <p>
                  {t('profile.resetPasswordInfo')}
                </p>
                <p className="email-display">{email}</p>
              </div>

              <div className="edit-profile-actions">
                <button
                  className="btn btn-primary"
                  onClick={handleResetPassword}
                  disabled={resetPasswordLoading}
                >
                  {resetPasswordLoading && <BiLoaderCircle className="spinner" />}
                  {resetPasswordLoading
                    ? t('profile.sending') || 'Sending...'
                    : t('profile.sendResetLink') || 'Send Reset Link'}
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => setShowResetPassword(false)}
                  disabled={resetPasswordLoading}
                >
                  {t('profile.cancel') || 'Cancel'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default EditProfileModal
