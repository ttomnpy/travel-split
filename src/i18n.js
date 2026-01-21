// Simple i18n without external dependencies
import zhHK from './locales/zh-HK.json'
import enUS from './locales/en-US.json'

const translations = {
  'zh-HK': zhHK,
  'en-US': enUS
}

let currentLanguage = localStorage.getItem('language') || 'zh-HK'

export const i18n = {
  // Get current language
  getCurrentLanguage: () => currentLanguage,

  // Set language
  setLanguage: (lang) => {
    if (translations[lang]) {
      currentLanguage = lang
      localStorage.setItem('language', lang)
      // Trigger a custom event so React components can re-render
      window.dispatchEvent(new Event('languageChange'))
    }
  },

  // Get translation
  t: (key, defaultValue = key, variables = {}) => {
    const keys = key.split('.')
    let value = translations[currentLanguage]

    for (const k of keys) {
      value = value?.[k]
    }

    if (!value) {
      return defaultValue
    }

    // Replace variables like {{email}} with actual values
    let result = value
    for (const [varKey, varValue] of Object.entries(variables)) {
      result = result.replace(`{{${varKey}}}`, varValue)
    }

    return result
  },

  // Get all translations for current language
  getTranslations: () => translations[currentLanguage],

  // Get available languages
  getAvailableLanguages: () => Object.keys(translations)
}

export default i18n
