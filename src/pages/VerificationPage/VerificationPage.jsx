import { useState, useEffect } from 'react'
import { Button } from '../../components'
import { useTranslation } from '../../hooks/useTranslation'
import { authService } from '../../services/authService'
import { BiMailSend } from 'react-icons/bi'
import './VerificationPage.css'

function VerificationPage({ email, user, onVerificationComplete, onBackToLogin }) {
  const { t } = useTranslation()
  const [isResending, setIsResending] = useState(false)
  const [resendMessage, setResendMessage] = useState('')
  const [countdown, setCountdown] = useState(0)
  const [isChecking, setIsChecking] = useState(false)

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [countdown])

  // Auto-check verification every 3 seconds
  useEffect(() => {
    const autoCheckInterval = setInterval(() => {
      checkVerification()
    }, 3000)

    return () => clearInterval(autoCheckInterval)
  }, [user])

  const checkVerification = async () => {
    if (!user) return
    
    try {
      // Reload user to get updated emailVerified status
      if (user.reload) {
        await user.reload()
      }

      if (user.emailVerified) {
        setResendMessage('✓ 郵件已驗證！')
        setTimeout(() => {
          onVerificationComplete()
        }, 1500)
      } else {
        setResendMessage('✗ 郵件未驗證。請檢查收件箱並點擊驗證鏈接。')
      }
    } catch (error) {
      console.error('Error checking verification:', error)
      setResendMessage('✗ 檢查驗證狀態失敗。請稍後再試。')
    }
  }

  const handleResendEmail = async () => {
    setIsResending(true)
    setResendMessage('')

    try {
      const result = await authService.resendVerificationEmail(user)
      if (result.error) {
        setResendMessage('error')
      } else {
        setResendMessage('success')
        setCountdown(60)
      }
    } finally {
      setIsResending(false)
    }
  }

  return (
    <div className="verification-container">
      <div className="verification-card">
        {/* Icon */}
        <div className="verification-icon">
          <BiMailSend />
        </div>

        {/* Title */}
        <h1>{t('verification.title')}</h1>
        <p className="verification-subtitle">
          {t('verification.subtitle')}
        </p>

        {/* Email Display */}
        <div className="email-display">
          <p>{email}</p>
        </div>

        {/* Instructions */}
        <div className="verification-instructions">
          <ol>
            <li>{t('verification.step1')}</li>
            <li>{t('verification.step2')}</li>
            <li>{t('verification.step3')}</li>
          </ol>
        </div>

        {/* Messages */}
        {resendMessage && (
          <div
            className={`verification-message ${
              resendMessage === 'success'
                ? 'success'
                : resendMessage === 'error'
                ? 'error'
                : 'info'
            }`}
          >
            {resendMessage === 'success' && t('verification.resendSuccess')}
            {resendMessage === 'error' && t('verification.resendFailed')}
          </div>
        )}

        {/* Buttons */}
        <div className="verification-buttons">
          <Button
            variant="primary"
            size="lg"
            onClick={() => {
              setIsChecking(true)
              checkVerification().finally(() => setIsChecking(false))
            }}
            disabled={isChecking}
          >
            {isChecking ? t('verification.checking') : t('verification.checkButton')}
          </Button>

          <Button
            variant="secondary"
            size="lg"
            onClick={handleResendEmail}
            disabled={isResending || countdown > 0}
          >
            {countdown > 0
              ? t('verification.resendCountdown', null, { countdown })
              : t('verification.resendButton')}
          </Button>

          <Button
            variant="tertiary"
            size="lg"
            onClick={onBackToLogin}
          >
            {t('verification.backButton')}
          </Button>
        </div>

        {/* Footer */}
        <p className="verification-footer">
          {t('verification.noEmail')}
        </p>
      </div>
    </div>
  )
}

export default VerificationPage
