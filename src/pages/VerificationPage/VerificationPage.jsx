import { useState, useEffect } from 'react'
import { Button } from '../../components'
import { useTranslation } from '../../hooks/useTranslation'
import { authService } from '../../services/authService'
import { debugLog, debugError } from '../../utils/debug'
import { auth } from '../../firebase'
import { BiSend } from 'react-icons/bi'
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
  }, [email])

  const checkVerification = async () => {
    try {
      debugLog('Checking email verification status', { email })
      
      // Sign in temporarily to check verification status
      // This is necessary because the user was signed out after signup
      const storedCredentials = localStorage.getItem('pendingSignupCredentials')
      if (!storedCredentials) {
        setResendMessage(t('verification.checkFailed'))
        return
      }
      
      let credentials
      try {
        credentials = JSON.parse(storedCredentials)
      } catch (e) {
        setResendMessage(t('verification.checkFailed'))
        return
      }
      
      if (credentials.email !== email) {
        setResendMessage(t('verification.checkFailed'))
        return
      }
      
      // Temporarily sign in to check email verification
      const { signInWithEmailAndPassword } = await import('firebase/auth')
      const result = await signInWithEmailAndPassword(auth, credentials.email, credentials.password)
      
      debugLog('User signed in for verification check', { email: credentials.email })
      
      // Reload to get latest email verification status
      await result.user.reload()
      debugLog('User reloaded, emailVerified status:', { emailVerified: result.user.emailVerified })
      
      if (result.user.emailVerified) {
        debugLog('Email is verified!', { email })
        setResendMessage(t('verification.verified'))
        
        // Sign out and show success message
        const { signOut } = await import('firebase/auth')
        await signOut(auth)
        
        setTimeout(() => {
          onVerificationComplete()
        }, 1500)
      } else {
        debugLog('Email not yet verified', { email })
        setResendMessage(t('verification.notVerified'))
      }
    } catch (error) {
      debugError('Error checking verification', error)
      setResendMessage(t('verification.checkFailed'))
    }
  }

  const handleResendEmail = async () => {
    setIsResending(true)
    setResendMessage('')

    try {
      const result = await authService.resendVerificationEmail(email)
      if (result.error) {
        // Check if it's a rate limit error
        if (result.error === 'auth/too-many-requests') {
          setResendMessage(t('verification.resendRateLimited'))
        } else {
          setResendMessage('error')
        }
      } else {
        setResendMessage(t('verification.resendSuccess'))
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
          <BiSend />
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
            {resendMessage !== 'success' && resendMessage !== 'error' && resendMessage}
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
              ? `${t('verification.resendButton')} (${countdown}${t('verification.resendCountdown').includes('秒') ? '秒' : 's'})`
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
