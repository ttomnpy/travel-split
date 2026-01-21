import { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useAuthForm } from '../../hooks/useAuthForm'
import { useTranslation } from '../../hooks/useTranslation'
import { getErrorMessage, validateEmail, validatePassword, validatePasswordsMatch } from '../../utils/validation'
import { InputField, Button, GoogleLoginButton, PasswordRequirements } from '../../components'
import { authService } from '../../services/authService'
import VerificationPage from '../VerificationPage/VerificationPage'
import { BiMoney } from 'react-icons/bi'
import './LoginPage.css'

function LoginPage() {
  const { t, setLanguage, currentLanguage } = useTranslation()
  const [isSignUp, setIsSignUp] = useState(false)
  const [localError, setLocalError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showVerification, setShowVerification] = useState(false)
  const [unverifiedUser, setUnverifiedUser] = useState(null)
  const [signupEmail, setSignupEmail] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const { email, setEmail, password, setPassword } = useAuthForm()

  const isEmailValid = validateEmail(email)
  const passwordValidation = validatePassword(password)
  const isPasswordValid = passwordValidation.isValid
  const isPasswordsMatch = validatePasswordsMatch(password, confirmPassword)
  const isFormValid = isEmailValid && isPasswordValid && (isSignUp ? isPasswordsMatch : true)

  const handleEmailSubmit = async (e) => {
    e.preventDefault()
    if (!isFormValid) return

    setIsLoading(true)
    setLocalError('')

    try {
      if (isSignUp) {
        // Sign up - don't log in, show verification
        const result = await authService.signupWithEmail(email, password)
        
        if (result.error) {
          setLocalError(result.error)
        } else {
          // Store user info and show verification page
          setUnverifiedUser(result.user)
          setSignupEmail(email)
          setShowVerification(true)
          setEmail('')
          setPassword('')
          setConfirmPassword('')
        }
      } else {
        // Login - normal flow
        const result = await authService.loginWithEmail(email, password)
        
        if (result.error) {
          setLocalError(result.error)
        }
        // On successful login, user will be redirected via AuthContext
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleVerificationComplete = () => {
    // After verification, prompt user to login
    setShowVerification(false)
    setUnverifiedUser(null)
    setSignupEmail('')
    setIsSignUp(false)
    setLocalError('')
    setSuccessMessage('verification_complete')
    // Clear success message after 5 seconds
    setTimeout(() => setSuccessMessage(''), 5000)
  }

  const handleBackToLogin = () => {
    setShowVerification(false)
    setUnverifiedUser(null)
    setSignupEmail('')
  }

  if (showVerification && unverifiedUser) {
    return (
      <VerificationPage
        email={signupEmail}
        user={unverifiedUser}
        onVerificationComplete={handleVerificationComplete}
        onBackToLogin={handleBackToLogin}
      />
    )
  }

  const handleGoogleSuccess = (user) => {
    setLocalError('')
  }

  const handleGoogleError = (error) => {
    setLocalError(error)
  }

  return (
    <div className="login-container">
      {/* Language Switcher */}
      <div className="language-switcher">
        <button
          className={`lang-btn ${currentLanguage === 'zh-HK' ? 'active' : ''}`}
          onClick={() => setLanguage('zh-HK')}
        >
          繁
        </button>
        <button
          className={`lang-btn ${currentLanguage === 'en-US' ? 'active' : ''}`}
          onClick={() => setLanguage('en-US')}
        >
          EN
        </button>
      </div>

      <div className="login-card">
        {/* Logo/Header */}
        <div className="login-header">
          <div className="app-icon">
            <BiMoney />
          </div>
          <h1>{t('common.appName')}</h1>
          <p>{t('auth.loginSubtitle')}</p>
        </div>

        {/* Form */}
        <form onSubmit={handleEmailSubmit} className="login-form">
          <InputField
            label={t('auth.email')}
            type="email"
            placeholder={t('auth.emailPlaceholder')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <InputField
            label={t('auth.password')}
            type="password"
            placeholder={t('auth.passwordPlaceholder')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {isSignUp && password.length > 0 && (
            <PasswordRequirements requirements={passwordValidation.requirements} />
          )}

          {isSignUp && (
            <InputField
              label={t('auth.confirmPassword')}
              type="password"
              placeholder={t('auth.passwordPlaceholder')}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              error={confirmPassword && !isPasswordsMatch ? t('auth.passwordMismatch') : ''}
            />
          )}

          {localError && (
            <div className="error-message">
              {getErrorMessage(localError)}
            </div>
          )}

          {successMessage && (
            <div className="success-message">
              {getErrorMessage(successMessage)}
            </div>
          )}

          <Button
            type="submit"
            variant="primary"
            size="lg"
            disabled={isLoading || !isFormValid}
          >
            {isLoading ? t('common.loading') : isSignUp ? t('auth.signup') : t('auth.login')}
          </Button>
        </form>

        {/* Divider */}
        <div className="divider">
          <span>{t('auth.or')}</span>
        </div>

        {/* Google Login */}
        <GoogleLoginButton
          onSuccess={handleGoogleSuccess}
          onError={handleGoogleError}
        />

        {/* Toggle */}
        <div className="toggle-mode">
          <p>
            {isSignUp ? t('auth.haveAccount') : t('auth.noAccount')}
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp)
                setConfirmPassword('')
                setLocalError('')
              }}
              className="toggle-button"
            >
              {isSignUp ? t('auth.login') : t('auth.signup')}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}

export default LoginPage
