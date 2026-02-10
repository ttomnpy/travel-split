// Global flag to prevent duplicate getRedirectResult calls (React StrictMode issue)
let redirectState = {
  checked: false,
  promise: null
}

// Reset the flag when page loads with OAuth redirect parameters
if (typeof window !== 'undefined') {
  const urlParams = new URLSearchParams(window.location.search)
  const hasState = urlParams.has('state')
  const hasCode = urlParams.has('code')

  if (hasState || hasCode) {
    redirectState.checked = false
    redirectState.promise = null
  }
}

export const getRedirectResultChecked = () => redirectState.checked
export const setRedirectResultChecked = (value) => {
  redirectState.checked = value
}
export const getRedirectResultPromise = () => redirectState.promise
export const setRedirectResultPromise = (value) => {
  redirectState.promise = value
}
