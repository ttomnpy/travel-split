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
  t: (key, secondParam, thirdParam) => {
    // Handle overloaded parameters:
    // t(key) or t(key, variables) or t(key, defaultValue, variables)
    let variables = {}
    let defaultValue = key

    if (typeof secondParam === 'object' && !Array.isArray(secondParam) && secondParam !== null) {
      // Second param is variables: t(key, variables)
      variables = secondParam
    } else if (typeof secondParam === 'string' && typeof thirdParam === 'object') {
      // Second param is default, third is variables: t(key, defaultValue, variables)
      defaultValue = secondParam
      variables = thirdParam || {}
    } else if (typeof secondParam === 'string') {
      // Second param is just default value
      defaultValue = secondParam
    }

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
    if (variables && typeof variables === 'object') {
      for (const [varKey, varValue] of Object.entries(variables)) {
        result = result.replaceAll(`{{${varKey}}}`, String(varValue))
      }
    }

    return result
  },

  // Get all translations for current language
  getTranslations: () => translations[currentLanguage],

  // Get available languages
  getAvailableLanguages: () => Object.keys(translations)
}

export default i18n
