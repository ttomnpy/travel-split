// 驗證工具函數
import i18n from '../i18n'

export const validateEmail = (email) => {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return regex.test(email)
}

// Password requirements
export const PASSWORD_REQUIREMENTS = {
  minLength: 8,
  hasUpperCase: true,
  hasLowerCase: true,
  hasNumber: true,
  hasSpecialChar: true
}

export const validatePassword = (password) => {
  return {
    isValid: password.length >= PASSWORD_REQUIREMENTS.minLength &&
             // /[A-Z]/.test(password) && // TEMP COMMENTED OUT
             /[a-z]/.test(password) &&
             /[0-9]/.test(password),
             // /[!@#$%^&*]/.test(password) // TEMP COMMENTED OUT
    requirements: {
      minLength: password.length >= PASSWORD_REQUIREMENTS.minLength,
      hasUpperCase: true, // /[A-Z]/.test(password), // TEMP COMMENTED OUT
      hasLowerCase: /[a-z]/.test(password),
      hasNumber: /[0-9]/.test(password),
      hasSpecialChar: true // /[!@#$%^&*]/.test(password) // TEMP COMMENTED OUT
    }
  }
}

export const validatePasswordsMatch = (password, confirmPassword) => {
  return password === confirmPassword && password.length > 0
}

export const getErrorMessage = (error) => {
  // Try to get from translations first
  const translatedMessage = i18n.t(`errors.${error}`, null)
  if (translatedMessage && translatedMessage !== `errors.${error}`) {
    return translatedMessage
  }

  // Fallback to generic error
  return i18n.t('errors.generic', '發生錯誤，請稍後再試')
}

