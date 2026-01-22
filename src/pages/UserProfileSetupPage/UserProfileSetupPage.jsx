import { useState, useRef } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { userService } from '../../services/userService'
import { debugLog, debugError } from '../../utils/debug'
import './UserProfileSetupPage.css'

export function UserProfileSetupPage({ onProfileComplete }) {
  const { user, logout, error: authError } = useAuth()
  const [displayName, setDisplayName] = useState(user?.displayName || '')
  const [photoURL, setPhotoURL] = useState(user?.photoURL || '')
  const [previewURL, setPreviewURL] = useState(user?.photoURL || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(authError || '')
  const fileInputRef = useRef(null)

  const handleAvatarClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file')
      return
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('Image size must be less than 5MB')
      return
    }

    // Create preview
    const reader = new FileReader()
    reader.onload = (e) => {
      setPreviewURL(e.target?.result)
    }
    reader.readAsDataURL(file)

    // In production, you would upload to Firebase Storage
    // For now, we'll use the data URL
    debugLog('Avatar Selected', { fileName: file.name, fileSize: file.size })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!displayName.trim()) {
      setError('Display name cannot be empty')
      return
    }

    if (displayName.trim().length > 50) {
      setError('Display name must be less than 50 characters')
      return
    }

    setLoading(true)
    setError(null)

    try {
      debugLog('Updating User Profile', { userId: user.uid })

      const updates = {
        displayName: displayName.trim(),
        photoURL: previewURL || null
      }

      const result = await userService.updateUserProfile(user.uid, updates)

      if (result.error) {
        // Show error and don't allow skipping
        setError(`Failed to save profile: ${result.error}`)
        setLoading(false)
        return
      }

      debugLog('Profile Setup Completed', { userId: user.uid, displayName })
      
      // Only notify completion if no error occurred
      if (onProfileComplete) {
        onProfileComplete()
      }
    } catch (err) {
      debugError('Profile Setup Error', { error: err.message })
      // Show error and don't allow skipping
      setError(err.message || 'Failed to save profile. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="profile-setup-container">
      <div className="profile-setup-card">
        <h1>Complete Your Profile</h1>
        <p className="subtitle">Let's get to know you better!</p>

        <form onSubmit={handleSubmit}>
          {/* Avatar Section */}
          <div className="avatar-section">
            <div 
              className="avatar-preview"
              onClick={handleAvatarClick}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  handleAvatarClick()
                }
              }}
            >
              {previewURL ? (
                <img src={previewURL} alt="Profile preview" />
              ) : (
                <div className="avatar-placeholder">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="48"
                    height="48"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                  </svg>
                </div>
              )}
              <div className="avatar-overlay">
                <span>Change Photo</span>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
            <p className="avatar-hint">Click to upload or change your photo</p>
          </div>

          {/* Display Name Section */}
          <div className="form-group">
            <label htmlFor="displayName">Display Name</label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value)
                setError(null)
              }}
              placeholder="Enter your name"
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
          <div className="button-group">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || !displayName.trim()}
            >
              {loading ? 'Saving...' : 'Complete Profile'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={logout}
              disabled={loading}
            >
              Log Out
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
