import { debugLog, debugError } from '../utils/debug'

/**
 * Currency exchange rate service
 * Integrates with exchangerate-api.com for live rates
 * API Documentation: https://www.exchangerate-api.com/docs
 */

const API_KEY = import.meta.env.VITE_EXCHANGE_RATE_API_KEY
const API_BASE_URL = 'https://v6.exchangerate-api.com/v6'

// Cache for exchange rates to minimize API calls (24 hour cache)
const rateCache = {}
const CACHE_DURATION = 24 * 60 * 60 * 1000 // 24 hours in milliseconds

/**
 * Get cached rate if available and not expired
 */
const getCachedRate = (fromCurrency, toCurrency) => {
  const cacheKey = `${fromCurrency}-${toCurrency}`
  const cached = rateCache[cacheKey]

  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    debugLog('Using cached exchange rate', { fromCurrency, toCurrency, rate: cached.rate })
    return cached.rate
  }

  return null
}

/**
 * Set rate in cache
 */
const setCachedRate = (fromCurrency, toCurrency, rate) => {
  const cacheKey = `${fromCurrency}-${toCurrency}`
  rateCache[cacheKey] = {
    rate,
    timestamp: Date.now()
  }
}

/**
 * Fetch live exchange rate from exchangerate-api.com
 * Supports 160+ currencies
 */
export const fetchLiveExchangeRate = async (fromCurrency, toCurrency) => {
  try {
    // Check if API key is configured
    if (!API_KEY) {
      debugError('Exchange rate API key not configured', {
        instruction: 'Please add VITE_EXCHANGE_RATE_API_KEY to your .env file'
      })
      return null
    }

    debugLog('Fetching live exchange rate', { fromCurrency, toCurrency })

    // Check cache first
    const cachedRate = getCachedRate(fromCurrency, toCurrency)
    if (cachedRate) {
      return cachedRate
    }

    // Make API request
    const url = `${API_BASE_URL}/${API_KEY}/latest/${fromCurrency}`
    debugLog('Fetching from URL', { url: url.replace(API_KEY, '***') })
    
    const response = await fetch(url)

    if (!response.ok) {
      let errorData = null
      try {
        errorData = await response.json()
      } catch {
        errorData = { raw: response.statusText }
      }
      
      debugError('Exchange rate API HTTP error', {
        status: response.status,
        statusText: response.statusText,
        error: errorData
      })
      return null
    }

    const data = await response.json()
    debugLog('API Response received', { result: data.result, hasConversionRates: !!data.conversion_rates })

    // Check if the API returned success
    if (!data || !data.result) {
      debugError('Invalid API response - missing result field', {
        data: data,
        response: response.statusText
      })
      return null
    }

    // Handle API error responses
    if (data.result !== 'success') {
      debugError('Exchange rate API returned error', {
        result: data.result,
        'error-type': data['error-type'],
        message: `API Error: ${data.result}`,
        fullData: data
      })
      return null
    }

    // Check if conversion_rates data exists and contains the target currency
    // exchangerate-api.com returns rates in 'conversion_rates' field, not 'rates'
    if (!data.conversion_rates || typeof data.conversion_rates !== 'object' || Object.keys(data.conversion_rates).length === 0) {
      debugError('API response missing or empty conversion_rates data', {
        hasConversionRates: !!data.conversion_rates,
        conversionRatesType: typeof data.conversion_rates,
        conversionRatesLength: data.conversion_rates ? Object.keys(data.conversion_rates).length : 0,
        fullData: data
      })
      return null
    }

    if (!(toCurrency in data.conversion_rates)) {
      debugError('Target currency not found in conversion_rates', {
        toCurrency,
        availableCurrencies: Object.keys(data.conversion_rates).slice(0, 10),
        fullData: data
      })
      return null
    }

    const rate = data.conversion_rates[toCurrency]
    
    // Validate rate is a number
    if (typeof rate !== 'number' || rate <= 0) {
      debugError('Invalid rate value received', { rate })
      return null
    }

    // Cache the result
    setCachedRate(fromCurrency, toCurrency, rate)
    
    debugLog('Live rate fetched successfully', {
      fromCurrency,
      toCurrency,
      rate,
      timeUpdated: data.time_last_updated
    })

    return rate
  } catch (err) {
    debugError('Error fetching live exchange rate', {
      name: err.name,
      message: err.message,
      code: err.code,
      hint: 'Check your API key, network connection, and that the currency codes are valid'
    })
    return null
  }
}

/**
 * Validate exchange rate input
 */
export const validateExchangeRate = (rate) => {
  const numRate = parseFloat(rate)
  if (isNaN(numRate) || numRate <= 0) {
    return { valid: false, error: 'Exchange rate must be a positive number' }
  }
  return { valid: true, value: numRate }
}

/**
 * Calculate amount in target currency
 */
export const convertCurrency = (amount, rate) => {
  const numAmount = parseFloat(amount)
  const numRate = parseFloat(rate)

  if (isNaN(numAmount) || isNaN(numRate) || numRate <= 0) {
    return null
  }

  return Math.round((numAmount * numRate) * 100) / 100
}

/**
 * Format exchange rate for display
 */
export const formatExchangeRate = (rate) => {
  return parseFloat(rate).toFixed(4)
}

/**
 * Create exchange rate history object
 */
export const createExchangeRateRecord = (fromCurrency, toCurrency, rate, source = 'custom') => {
  return {
    fromCurrency,
    toCurrency,
    rate: parseFloat(rate),
    source, // 'custom' or 'live'
    date: Date.now()
  }
}
