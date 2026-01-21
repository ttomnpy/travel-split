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
    console.error(`[${label}]`, error)
  }
}
