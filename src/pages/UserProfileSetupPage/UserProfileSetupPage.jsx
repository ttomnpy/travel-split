import { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useTranslation } from '../../hooks/useTranslation'
import { userService } from '../../services/userService'
import { debugLog, debugError } from '../../utils/debug'
import './UserProfileSetupPage.css'

export function UserProfileSetupPage({ onProfileComplete }) {
  const { user, logout, error: authError, updateUserProfileData } = useAuth()
  const { t } = useTranslation()
  const [displayName, setDisplayName] = useState(user?.displayName || '')
  // const [previewURL, setPreviewURL] = useState(user?.photoURL || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(authError || '')
  // const fileInputRef = useRef(null)

  // const handleAvatarClick = () => {
  //   fileInputRef.current?.click()
  // }

  // const handleFileChange = async (event) => {
  //   const file = event.target.files?.[0]
  //   if (!file) return

  //   // Validate file type
  //   if (!file.type.startsWith('image/')) {
  //     setError(t('profile.selectImageFile'))
  //     return
  //   }

  //   // Validate file size (max 5MB)
  //   if (file.size > 5 * 1024 * 1024) {
  //     setError(t('profile.imageTooLarge'))
  //     return
  //   }

  //   // Create preview
  //   const reader = new FileReader()
  //   reader.onload = (e) => {
  //     setPreviewURL(e.target?.result)
  //   }
  //   reader.readAsDataURL(file)

  //   // In production, you would upload to Firebase Storage
  //   // For now, we'll use the data URL
  //   debugLog('Avatar Selected', { fileName: file.name, fileSize: file.size })
  // }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!displayName.trim()) {
      setError(t('profile.displayNameEmpty'))
      return
    }

    if (displayName.trim().length > 50) {
      setError(t('profile.displayNameTooLong'))
      return
    }

    setLoading(true)
    setError(null)

    try {
      debugLog('Updating User Profile', { userId: user.uid })

      const updates = {
        displayName: displayName.trim()
        // photoURL: previewURL || null
      }

      const result = await userService.updateUserProfile(user.uid, updates)

      if (result.error) {
        // Show error and don't allow skipping
        setError(t('profile.saveProfileError'))
        setLoading(false)
        return
      }

      debugLog('Profile Setup Completed', { userId: user.uid, displayName })
      
      // Update userProfile in AuthContext immediately so all components get the latest data
      updateUserProfileData({
        displayName: displayName.trim()
        // photoURL: previewURL || null
      })
      
      // Only notify completion if no error occurred
      if (onProfileComplete) {
        onProfileComplete()
      }
    } catch (err) {
      debugError('Profile Setup Error', { error: err.message })
      // Show error and don't allow skipping
      setError(t('profile.error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="profile-setup-container">
      <div className="profile-setup-card">
        <h1>{t('profile.title')}</h1>
        <p className="subtitle">{t('profile.subtitle')}</p>

        <form onSubmit={handleSubmit}>
          {/* Avatar Section - Disabled - User profile image functionality removed */}

          {/* Display Name Section */}
          <div className="upsp-form-group">
            <label htmlFor="displayName">{t('profile.displayName')}</label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value)
                setError(null)
              }}
              placeholder={t('profile.displayNamePlaceholder')}
              maxLength="50"
              required
              disabled={loading}
            />
            <div className="char-count">
              {displayName.length}/50
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          {/* Action Buttons */}
          <div className="upsp-button-group">
            <button
              type="submit"
              className="upsp-btn upsp-btn-primary"
              disabled={loading || !displayName.trim()}
            >
              {loading ? t('profile.completing') : t('profile.complete')}
            </button>
            <button
              type="button"
              className="upsp-btn upsp-btn-secondary"
              onClick={logout}
              disabled={loading}
            >
              {t('profile.logout')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
