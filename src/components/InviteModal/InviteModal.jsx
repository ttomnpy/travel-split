import { useState, useEffect, useRef } from 'react'
import { ref, get, update } from 'firebase/database'
import { rtdb } from '../../firebase'
import { generateInviteCode } from '../../services/groupService'
import { useTranslation } from '../../hooks/useTranslation'
import { debugLog, debugError } from '../../utils/debug'
import { BiCopy, BiX, BiCheck } from 'react-icons/bi'
import './InviteModal.css'

function InviteModal({ isOpen, onClose, groupId }) {
  const { t } = useTranslation()
  const [inviteCode, setInviteCode] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copiedUrl, setCopiedUrl] = useState(false)
  const [error, setError] = useState('')
  const hiddenInputRef = useRef(null)

  // Fetch or create invite code
  useEffect(() => {
    if (!isOpen || !groupId) return

    const loadInviteCode = async () => {
      try {
        setIsLoading(true)
        setError('')
        
        // Get current group
        const groupRef = ref(rtdb, `groups/${groupId}`)
        const groupSnapshot = await get(groupRef)
        
        if (!groupSnapshot.exists()) {
          setError('Group not found')
          return
        }
        
        const groupData = groupSnapshot.val()
        
        // If group already has invite code, use it
        if (groupData.inviteCode) {
          setInviteCode(groupData.inviteCode)
          debugLog('Using existing invite code', { code: groupData.inviteCode })
        } else {
          // Generate new invite code
          const newCode = await generateInviteCode()
          
          // Update group with new invite code
          const updates = {}
          updates[`groups/${groupId}/inviteCode`] = newCode
          updates[`inviteCodes/${newCode}`] = groupId
          
          await update(ref(rtdb), updates)
          
          setInviteCode(newCode)
          debugLog('Generated and saved new invite code', { code: newCode })
        }
      } catch (err) {
        debugError('Error loading invite code', err)
        setError('Failed to load invite code')
      } finally {
        setIsLoading(false)
      }
    }
    
    loadInviteCode()
  }, [isOpen, groupId])

  const copyToClipboard = async () => {
    try {
      // Try modern Clipboard API first
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(inviteCode)
      } else {
        // Fallback for iOS Safari: use hidden input ref (no DOM manipulation)
        if (hiddenInputRef.current) {
          hiddenInputRef.current.value = inviteCode
          hiddenInputRef.current.select()
          const success = document.execCommand('copy')
          
          if (!success) {
            throw new Error('Copy command failed')
          }
        }
      }
      
      setCopied(true)
      
      // Reset copied status after 2 seconds
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      debugError('Failed to copy to clipboard', err)
      setError('Failed to copy invite code')
    }
  }

  const copyInviteUrl = async () => {
    try {
      const inviteUrl = `${window.location.origin}/join/${inviteCode}`
      
      // Try modern Clipboard API first
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(inviteUrl)
      } else {
        // Fallback for iOS Safari: use hidden input ref
        if (hiddenInputRef.current) {
          hiddenInputRef.current.value = inviteUrl
          hiddenInputRef.current.select()
          const success = document.execCommand('copy')
          
          if (!success) {
            throw new Error('Copy command failed')
          }
        }
      }
      
      setCopiedUrl(true)
      
      // Reset copied status after 2 seconds
      setTimeout(() => setCopiedUrl(false), 2000)
    } catch (err) {
      debugError('Failed to copy invite URL to clipboard', err)
      setError('Failed to copy invite URL')
    }
  }

  if (!isOpen) return null

  return (
    <div className="invite-modal-overlay" onClick={onClose}>
      <div className="invite-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="invite-modal-header">
          <h2>{t('invite.title') || 'Invite People'}</h2>
          <button
            className="invite-close-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <BiX />
          </button>
        </div>

        {/* Content */}
        <div className="invite-modal-content">
          {isLoading ? (
            <div className="invite-loading">
              <div className="spinner"></div>
              <p>{t('invite.generating') || 'Generating invite code...'}</p>
            </div>
          ) : error ? (
            <div className="invite-error">
              <p>{error}</p>
            </div>
          ) : (
            <>
              <p className="invite-description">
                {t('invite.description') || 'Share this code with people to invite them to this trip'}
              </p>

              {/* Invite Code Display */}
              <div className="invite-code-container">
                <div className="invite-code">
                  <span className="code-text">{inviteCode}</span>
                </div>
                <button
                  className={`invite-copy-btn ${copied ? 'copied' : ''}`}
                  onClick={copyToClipboard}
                  title={copied ? 'Copied!' : 'Copy invite code'}
                >
                  {copied ? (
                    <>
                      <BiCheck />
                      <span>{t('invite.copied') || 'Copied!'}</span>
                    </>
                  ) : (
                    <>
                      <BiCopy />
                      <span>{t('invite.copy') || 'Copy'}</span>
                    </>
                  )}
                </button>
              </div>

              {/* Invite URL Display */}
              <div className="invite-url-container">
                <div className="invite-url">
                  <span className="url-text">{window.location.origin}/join/{inviteCode}</span>
                </div>
                <button
                  className={`invite-copy-url-btn ${copiedUrl ? 'copied' : ''}`}
                  onClick={copyInviteUrl}
                  title={copiedUrl ? 'Copied!' : 'Copy invite URL'}
                >
                  {copiedUrl ? (
                    <>
                      <BiCheck />
                      <span>{t('invite.copied') || 'Copied!'}</span>
                    </>
                  ) : (
                    <>
                      <BiCopy />
                      <span>{t('invite.copy') || 'Copy'}</span>
                    </>
                  )}
                </button>
              </div>

              {/* Info Message */}
              <div className="invite-info">
                <p>
                  {t('invite.info') || 'Anyone with this code can join your trip'}
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="invite-modal-footer">
          <button
            className="invite-close-modal-btn"
            onClick={onClose}
          >
            {t('common.close') || 'Close'}
          </button>
        </div>
      </div>

      {/* Hidden input for clipboard fallback (iOS Safari) */}
      <input
        ref={hiddenInputRef}
        type="text"
        style={{
          position: 'fixed',
          left: '-9999px',
          top: '-9999px',
          opacity: 0,
          pointerEvents: 'none'
        }}
        readOnly
      />
    </div>
  )
}

export default InviteModal
