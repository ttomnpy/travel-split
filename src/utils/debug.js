// Debug utility - only logs in development environment
export const debugLog = (label, data) => {
  if (import.meta.env.DEV) {
    console.log(`[${label}]`, data)
  }
}

export const debugWarn = (label, data) => {
  if (import.meta.env.DEV) {
    console.warn(`[${label}]`, data)
  }
}

export const debugError = (label, error) => {
  if (import.meta.env.DEV) {
    if (error && typeof error === 'object') {
      // If it's an Error object or has code/message properties
      const errorInfo = {
        code: error.code || 'unknown',
        message: error.message || String(error),
        fullError: error
      }
      console.error(`[${label}]`, errorInfo)
    } else {
      console.error(`[${label}]`, error)
    }
  }
}
