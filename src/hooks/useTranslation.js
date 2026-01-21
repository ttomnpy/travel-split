import { useState, useEffect } from 'react'
import i18n from '../i18n'

// Custom hook for using translations
export const useTranslation = () => {
  const [, setLanguageChange] = useState(0)

  useEffect(() => {
    // Listen for language changes
    const handleLanguageChange = () => {
      setLanguageChange(prev => prev + 1)
    }

    window.addEventListener('languageChange', handleLanguageChange)
    return () => window.removeEventListener('languageChange', handleLanguageChange)
  }, [])

  return {
    t: i18n.t.bind(i18n),
    currentLanguage: i18n.getCurrentLanguage(),
    setLanguage: i18n.setLanguage.bind(i18n),
    availableLanguages: i18n.getAvailableLanguages()
  }
}
