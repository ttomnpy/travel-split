import React, { useState, useRef, useEffect } from 'react'
import { BiX, BiLoader, BiCalendar, BiMoney, BiUser, BiTag, BiShare, BiRefresh } from 'react-icons/bi'
import { useTranslation } from '../../hooks/useTranslation'
import { debugLog, debugError } from '../../utils/debug'
import { createExpense } from '../../services/expenseService'
import { fetchLiveExchangeRate, validateExchangeRate, convertCurrency, formatExchangeRate } from '../../services/currencyService'
import PayerSelection from './PayerSelection'
import './AddExpenseModal.css'

const AddExpenseModal = ({ isOpen, onClose, groupId, groupMembers, groupCurrency, onExpenseCreated, currentUserId }) => {
  const { t } = useTranslation()
  const modalRef = useRef(null)

  // Currency options
  const currencyOptions = ['USD', 'EUR', 'JPY', 'CNY', 'HKD', 'SGD', 'AUD', 'GBP']

  // Split method types
  const splitMethods = ['equal', 'percentage', 'shares', 'exact']

  // Default currency
  const defaultCurrency = groupCurrency || 'HKD'

  // Form state
  const [formData, setFormData] = useState({
    amount: '',
    payers: {
      [currentUserId]: {
        name: groupMembers?.[currentUserId]?.name || 'Me',
        amount: 0
      }
    },
    payerMode: 'single',
    currency: defaultCurrency,
    description: '',
    category: 'food',
    splitMethod: 'equal',
    participants: Object.keys(groupMembers || {}).reduce((acc, memberId) => {
      acc[memberId] = { selected: true, amount: 0, percentage: 0, shares: 1 }
      return acc
    }, {}),
    date: new Date().toISOString().split('T')[0],
    location: '',
  })

  const [errors, setErrors] = useState({})
  const [isLoading, setIsLoading] = useState(false)
  const [submitError, setSubmitError] = useState(null)

  // Exchange rate state
  const [exchangeRate, setExchangeRate] = useState({
    manualRate: '',
    fetchedRate: null,
    source: 'custom', // 'custom' or 'live'
    isFetching: false,
    fetchError: null
  })

  // Categories
  const categories = ['food', 'transport', 'accommodation', 'entertainment', 'shopping', 'other']

  // Focus on amount input when modal opens
  useEffect(() => {
    if (isOpen && modalRef.current) {
      const amountInput = modalRef.current.querySelector('[name="amount"]')
      if (amountInput) {
        setTimeout(() => amountInput.focus(), 100)
      }
    }
  }, [isOpen])

  // Sync participants with groupMembers whenever groupMembers changes
  useEffect(() => {
    setFormData((prev) => {
      const currentParticipants = prev.participants || {}
      const updatedParticipants = Object.keys(groupMembers || {}).reduce((acc, memberId) => {
        // Keep existing participant or create new one
        acc[memberId] = currentParticipants[memberId] || { selected: true, amount: 0, percentage: 0, shares: 1 }
        return acc
      }, {})
      
      // Only update if participants changed to avoid unnecessary re-renders
      const hasChanged = Object.keys(updatedParticipants).length !== Object.keys(currentParticipants).length ||
                         Object.keys(updatedParticipants).some(id => !currentParticipants[id])
      
      if (hasChanged) {
        return { ...prev, participants: updatedParticipants }
      }
      return prev
    })
  }, [groupMembers])

  // Update single payer amount when total amount changes
  useEffect(() => {
    if (formData.payerMode === 'single' && formData.amount && formData.payers) {
      const payerId = Object.keys(formData.payers)[0]
      if (payerId) {
        setFormData((prev) => ({
          ...prev,
          payers: {
            [payerId]: {
              ...prev.payers[payerId],
              amount: prev.amount
            }
          }
        }))
      }
    }
  }, [formData.amount, formData.payerMode])

  // Handle input changes
  const handleInputChange = (e) => {
    const { name, value, type } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'number' ? (value === '' ? '' : parseFloat(value)) : value,
    }))
    // Clear error when user starts typing (except for exchangeRate - handled separately)
    if (errors[name] && name !== 'exchangeRate') {
      setErrors((prev) => ({
        ...prev,
        [name]: '',
      }))
    }
  }

  // Handle participant selection
  const handleParticipantChange = (memberId) => {
    setFormData((prev) => ({
      ...prev,
      participants: {
        ...prev.participants,
        [memberId]: {
          ...(prev.participants[memberId] || { amount: 0, percentage: 0, shares: 1 }),
          selected: !(prev.participants[memberId]?.selected ?? true),
        },
      },
    }))
  }

  // Handle participant amount/percentage/shares changes
  const handleParticipantAmountChange = (memberId, value, field = 'amount') => {
    setFormData((prev) => ({
      ...prev,
      participants: {
        ...prev.participants,
        [memberId]: {
          ...(prev.participants[memberId] || { selected: true, amount: 0, percentage: 0, shares: 1 }),
          [field]: value === '' ? 0 : parseFloat(value),
        },
      },
    }))
  }

  // Handle exchange rate manual input
  const handleExchangeRateInput = (e) => {
    const { value } = e.target
    setExchangeRate((prev) => ({
      ...prev,
      manualRate: value,
      source: 'custom',
      fetchError: null
    }))

    // Real-time validation for exchange rate
    setErrors((prev) => {
      const newErrors = { ...prev }
      if (value === '' || value === null) {
        newErrors.exchangeRate = t('addExpense.exchangeRateRequired') || 'Exchange rate is required when using a different currency'
      } else if (parseFloat(value) <= 0 || isNaN(parseFloat(value))) {
        newErrors.exchangeRate = t('addExpense.exchangeRateInvalid') || 'Exchange rate must be a positive number'
      } else {
        delete newErrors.exchangeRate
      }
      return newErrors
    })
  }

  // Fetch live exchange rate
  const handleFetchLiveRate = async () => {
    if (formData.currency === groupCurrency) {
      debugLog('Same currency, no need to fetch rate')
      return
    }

    setExchangeRate((prev) => ({
      ...prev,
      isFetching: true,
      fetchError: null
    }))

    try {
      const rate = await fetchLiveExchangeRate(formData.currency, groupCurrency)
      if (rate) {
        setExchangeRate((prev) => ({
          ...prev,
          fetchedRate: rate,
          manualRate: formatExchangeRate(rate),
          source: 'live',
          isFetching: false
        }))
        // Clear exchange rate error when successful fetch
        setErrors((prev) => {
          const newErrors = { ...prev }
          delete newErrors.exchangeRate
          return newErrors
        })
        debugLog('Live rate fetched successfully', { rate })
      } else {
        setExchangeRate((prev) => ({
          ...prev,
          isFetching: false,
          fetchError: 'Failed to fetch exchange rate. Please enter manually.'
        }))
        debugError('Failed to fetch live rate')
      }
    } catch (err) {
      debugError('Error fetching live rate', err)
      setExchangeRate((prev) => ({
        ...prev,
        isFetching: false,
        fetchError: 'Error fetching rate. Please try again or enter manually.'
      }))
    }
  }

  // Get current exchange rate value
  const getCurrentExchangeRate = () => {
    // Check manual rate first
    if (exchangeRate.manualRate) {
      const validation = validateExchangeRate(exchangeRate.manualRate)
      if (validation.valid) {
        return validation.value
      }
    }
    // Check fetched rate if available
    if (exchangeRate.fetchedRate) {
      const validation = validateExchangeRate(exchangeRate.fetchedRate)
      if (validation.valid) {
        return validation.value
      }
    }
    return null
  }

  // Get converted amount (total in group currency)
  const getConvertedAmount = () => {
    const rate = getCurrentExchangeRate()
    if (!rate || !formData.amount) return null
    return convertCurrency(formData.amount, rate)
  }

  // Get participant amount in original currency
  const getParticipantAmountInOriginalCurrency = (memberId) => {
    const selectedParticipants = Object.keys(formData.participants).filter(
      (pid) => formData.participants[pid]?.selected
    )
    const amount = formData.amount || 0

    if (formData.splitMethod === 'equal') {
      return amount / selectedParticipants.length
    } else if (formData.splitMethod === 'percentage') {
      return (amount * (formData.participants[memberId].percentage || 0)) / 100
    } else if (formData.splitMethod === 'shares') {
      const totalShares = selectedParticipants.reduce(
        (sum, pid) => sum + (formData.participants[pid].shares || 1),
        0
      )
      return (amount * (formData.participants[memberId].shares || 1)) / (totalShares || 1)
    } else if (formData.splitMethod === 'exact') {
      return formData.participants[memberId].amount || 0
    }
    return 0
  }

  // Get participant amount in group currency
  const getParticipantAmountInGroupCurrency = (memberId) => {
    const originalAmount = getParticipantAmountInOriginalCurrency(memberId)
    if (formData.currency === groupCurrency) {
      return originalAmount
    }
    const rate = getCurrentExchangeRate()
    if (!rate) return originalAmount
    return convertCurrency(originalAmount, rate)
  }

  // Reset exchange rate when currency changes
  useEffect(() => {
    if (formData.currency === groupCurrency) {
      // Same currency: clear exchange rate state and error
      setExchangeRate({
        manualRate: '',
        fetchedRate: null,
        source: 'custom',
        isFetching: false,
        fetchError: null
      })
      setErrors((prev) => {
        const newErrors = { ...prev }
        delete newErrors.exchangeRate
        return newErrors
      })
    } else {
      // Different currency: show exchange rate required error
      setErrors((prev) => ({
        ...prev,
        exchangeRate: t('addExpense.exchangeRateRequired') || 'Exchange rate is required when using a different currency'
      }))
    }
  }, [formData.currency, groupCurrency])

  // Validate form
  const validateForm = () => {
    const newErrors = {}

    if (!formData.amount || formData.amount <= 0) {
      newErrors.amount = 'Amount must be greater than 0'
    }

    const payerIds = Object.keys(formData.payers || {})
    if (payerIds.length === 0) {
      newErrors.payers = 'Please select who paid'
    }

    // For multiple payers mode, validate that payer amounts sum to total
    if (formData.payerMode === 'multiple' && formData.amount) {
      const totalPayersAmount = Object.values(formData.payers || {}).reduce(
        (sum, payer) => sum + (payer.amount || 0),
        0
      )
      if (Math.abs(totalPayersAmount - formData.amount) > 0.01) {
        newErrors.payers = 'Payer amounts must total the expense amount'
      }
    }

    const selectedParticipants = Object.keys(formData.participants).filter(
      (memberId) => formData.participants[memberId].selected
    )

    if (formData.splitMethod === 'percentage') {
      const totalPercentage = selectedParticipants.reduce(
        (sum, memberId) => sum + (formData.participants[memberId].percentage || 0),
        0
      )
      if (Math.abs(totalPercentage - 100) > 0.01) {
        newErrors.splitPercentage = 'Percentages must total 100%'
      }
    }

    if (formData.splitMethod === 'exact') {
      const totalAmount = selectedParticipants.reduce(
        (sum, memberId) => sum + (formData.participants[memberId].amount || 0),
        0
      )
      
      // Check if individual amounts exceed total (even if total not entered yet)
      if (totalAmount > 0 && (!formData.amount || totalAmount > formData.amount)) {
        newErrors.splitExact = 'Total amount entered exceeds the expense amount'
      } else if (formData.amount && Math.abs(totalAmount - formData.amount) > 0.01) {
        newErrors.splitExact = 'Exact amounts must total the expense amount'
      }
    }

    // Validate exchange rate if currency differs from group currency
    if (formData.currency !== groupCurrency) {
      const hasRate = getCurrentExchangeRate()
      if (!hasRate) {
        newErrors.exchangeRate = t('addExpense.exchangeRateRequired') || 'Exchange rate is required when using a different currency'
      } else if (getCurrentExchangeRate() <= 0) {
        newErrors.exchangeRate = t('addExpense.exchangeRateInvalid') || 'Exchange rate must be a positive number'
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // Handle submit
  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!validateForm()) return

    setIsLoading(true)
    setSubmitError(null)

    try {
      // Get exchange rate if currency differs
      const hasExchangeRate = formData.currency !== groupCurrency
      const rate = hasExchangeRate ? getCurrentExchangeRate() : 1
      const amountInGroupCurrency = hasExchangeRate ? convertCurrency(formData.amount, rate) : formData.amount

      // Convert payers amounts to group currency
      const payersInGroupCurrency = {}
      Object.entries(formData.payers).forEach(([payerId, payer]) => {
        const payerAmountInGroupCurrency = hasExchangeRate ? convertCurrency(payer.amount, rate) : payer.amount
        payersInGroupCurrency[payerId] = {
          ...payer,
          amount: payerAmountInGroupCurrency
        }
      })

      // Prepare split details based on split method
      // Important: Store amounts in GROUP CURRENCY for settlement calculations
      const splitDetails = {}
      selectedParticipants.forEach((participantId) => {
        if (formData.splitMethod === 'equal') {
          splitDetails[participantId] = { percentage: 100 / selectedParticipants.length }
        } else if (formData.splitMethod === 'percentage') {
          splitDetails[participantId] = { percentage: formData.participants[participantId].percentage || 0 }
        } else if (formData.splitMethod === 'shares') {
          splitDetails[participantId] = { shares: formData.participants[participantId].shares || 1 }
        } else if (formData.splitMethod === 'exact') {
          // Convert exact amount to group currency if needed
          const originalAmount = formData.participants[participantId].amount || 0
          const amountToStore = hasExchangeRate ? convertCurrency(originalAmount, rate) : originalAmount
          splitDetails[participantId] = { amount: amountToStore }
        }
      })

      // Call service to create expense
      const expenseData = {
        // Store amount in group currency for easier calculation
        amount: amountInGroupCurrency,
        amountInOriginalCurrency: formData.amount, // Reference only
        payers: payersInGroupCurrency,
        participants: selectedParticipants,
        splitMethod: formData.splitMethod,
        splitDetails,
        description: formData.description,
        category: formData.category,
        currency: groupCurrency, // All amounts stored in group currency
        originalCurrency: formData.currency, // Reference to original currency
        date: formData.date,
        location: formData.location,
      }

      // Add exchange rate if currency differs from group currency
      if (hasExchangeRate && rate) {
        expenseData.exchangeRate = {
          fromCurrency: formData.currency,
          toCurrency: groupCurrency,
          rate,
          amountInGroupCurrency: amountInGroupCurrency,
          source: exchangeRate.source,
          date: Date.now()
        }
      }

      await createExpense(groupId, expenseData, currentUserId)

      setTimeout(() => {
        onClose()
        setFormData({
          amount: '',
          payers: {
            [currentUserId]: {
              name: groupMembers?.[currentUserId]?.name || 'Me',
              amount: 0
            }
          },
          payerMode: 'single',
          currency: defaultCurrency,
          description: '',
          category: 'food',
          splitMethod: 'equal',
          participants: Object.keys(groupMembers || {}).reduce((acc, memberId) => {
            acc[memberId] = { selected: true, amount: 0, percentage: 0, shares: 1 }
            return acc
          }, {}),
          date: new Date().toISOString().split('T')[0],
          location: '',
        })
        if (onExpenseCreated) {
          onExpenseCreated()
        }
      }, 500)
    } catch (error) {
      debugError('Error creating expense', error)
      setSubmitError(error.message || 'Failed to create expense. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  if (!isOpen) return null

  // Get selected participants
  const selectedParticipants = Object.keys(formData.participants).filter(
    (memberId) => formData.participants[memberId].selected
  )

  // Check if form has basic required fields filled
  const isBasicFormValid = !!(
    formData.amount && 
    formData.amount > 0 && 
    Object.keys(formData.payers || {}).length > 0
  )

  // Check for exchange rate validation
  let hasExchangeRateError = false
  if (formData.currency !== groupCurrency) {
    const hasRate = getCurrentExchangeRate()
    if (!hasRate) {
      hasExchangeRateError = true
    }
  }

  // Check for validation errors in payers
  let hasPayersError = false
  if (formData.payerMode === 'multiple' && formData.amount) {
    const totalPayersAmount = Object.values(formData.payers || {}).reduce(
      (sum, payer) => sum + (payer.amount || 0),
      0
    )
    if (Math.abs(totalPayersAmount - formData.amount) > 0.01) {
      hasPayersError = true
    }
  }

  // Check for validation errors in exact split method
  let hasExactSplitError = false
  if (formData.splitMethod === 'exact') {
    const totalAmount = selectedParticipants.reduce(
      (sum, memberId) => sum + (formData.participants[memberId].amount || 0),
      0
    )
    if (totalAmount > 0 && (!formData.amount || totalAmount > formData.amount)) {
      hasExactSplitError = true
    } else if (formData.amount && Math.abs(totalAmount - formData.amount) > 0.01) {
      hasExactSplitError = true
    }
  }

  // Check for validation errors in percentage split method
  let hasPercentageSplitError = false
  if (formData.splitMethod === 'percentage') {
    const totalPercentage = selectedParticipants.reduce(
      (sum, memberId) => sum + (formData.participants[memberId].percentage || 0),
      0
    )
    if (Math.abs(totalPercentage - 100) > 0.01) {
      hasPercentageSplitError = true
    }
  }

  const isFormValid = isBasicFormValid && !hasExactSplitError && !hasPercentageSplitError && !hasPayersError && !hasExchangeRateError

  const handlePayerModeChange = (newMode) => {
    setFormData((prev) => ({
      ...prev,
      payerMode: newMode,
      // Reset payers to single mode (current user)
      payers: newMode === 'single' ? {
        [currentUserId]: {
          name: groupMembers?.[currentUserId]?.name || 'Me',
          amount: prev.amount || 0
        }
      } : prev.payers
    }))
  }

  return (
    <div className="aem-overlay">
      <div className="aem-content" ref={modalRef}>
        {/* Header */}
        <div className="aem-header">
          <h2 className="aem-title">{t('addExpense.title') || 'Add Expense'}</h2>
          <button className="aem-close" onClick={onClose} aria-label="Close">
            <BiX />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="aem-form">
          {/* Amount & Currency Section */}
          <div className="aem-section">
            <h3 className="aem-section-title">{t('addExpense.amountPayer') || 'Amount & Payer'}</h3>

            <div className="aem-row">
              <div className="aem-field aem-field-full">
                <label className="aem-label">
                  <BiMoney className="aem-label-icon" />
                  {t('addExpense.totalAmount') || 'Total Amount'}                <span className="aem-required">*</span>                </label>
                <div className="aem-amount-group">
                  <input
                    type="number"
                    name="amount"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    value={formData.amount}
                    onChange={handleInputChange}
                    className={`aem-input aem-input-amount ${errors.amount ? 'aem-input-error' : ''}`}
                    placeholder="0.00"
                    required
                  />
                  <select
                    name="currency"
                    value={formData.currency}
                    onChange={handleInputChange}
                    className="aem-currency-select"
                  >
                    {currencyOptions.map((curr) => (
                      <option key={curr} value={curr}>
                        {curr}
                      </option>
                    ))}
                  </select>
                </div>
                {errors.amount && <span className="aem-error">{errors.amount}</span>}

                {/* Currency Conversion Section */}
                {formData.currency !== groupCurrency && (
                  <div className="aem-exchange-rate-section">
                    <div className="aem-exchange-rate-label">
                      {t('addExpense.exchangeRate') || 'Exchange Rate'} ({formData.currency} → {groupCurrency})
                      <span className="aem-required">*</span>
                    </div>

                    <div className="aem-exchange-rate-input-group">
                      <input
                        type="number"
                        placeholder="Enter rate"
                        value={exchangeRate.manualRate}
                        onChange={handleExchangeRateInput}
                        className={`aem-exchange-rate-input ${errors.exchangeRate ? 'aem-input-error' : ''}`}
                        step="0.0001"
                        min="0"
                      />
                      <button
                        type="button"
                        className="aem-fetch-rate-btn"
                        onClick={handleFetchLiveRate}
                        disabled={exchangeRate.isFetching}
                        title={t('addExpense.fetchLiveRate') || 'Fetch live rate'}
                      >
                        {exchangeRate.isFetching ? (
                          <BiLoader className="aem-spinner" />
                        ) : (
                          <BiRefresh />
                        )}
                        {exchangeRate.isFetching ? 'Fetching...' : 'Fetch'}
                      </button>
                    </div>

                    {exchangeRate.fetchError && (
                      <div className="aem-exchange-rate-error">
                        {exchangeRate.fetchError}
                      </div>
                    )}

                    {errors.exchangeRate && (
                      <div className="aem-exchange-rate-error">
                        {errors.exchangeRate}
                      </div>
                    )}

                    {exchangeRate.source === 'live' && (
                      <div className="aem-exchange-rate-source">
                        {t('addExpense.liveRate') || '✓ Live rate'} • {new Date(exchangeRate.fetchedRate ? Date.now() : 0).toLocaleTimeString()}
                      </div>
                    )}

                    {getCurrentExchangeRate() && getConvertedAmount() && (
                      <div className="aem-exchange-rate-result">
                        <div className="aem-exchange-rate-row">
                          <span className="aem-exchange-rate-from">
                            {formData.amount} {formData.currency}
                          </span>
                          <span className="aem-exchange-rate-equals">=</span>
                          <span className="aem-exchange-rate-to">
                            {getConvertedAmount()} {groupCurrency}
                          </span>
                        </div>
                        <div className="aem-exchange-rate-info">
                          {t('addExpense.rateInfo') || 'Rate'}: 1 {formData.currency} = {formatExchangeRate(getCurrentExchangeRate())} {groupCurrency}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="aem-field">
              <PayerSelection
                mode={formData.payerMode}
                onModeChange={handlePayerModeChange}
                formData={formData}
                setFormData={setFormData}
                groupMembers={groupMembers}
                currency={formData.currency}
                errors={errors}
              />
            </div>
          </div>

          {/* Description & Category */}
          <div className="aem-section">
            <h3 className="aem-section-title">{t('addExpense.descriptionCategory') || 'Description & Category'}</h3>

            <div className="aem-field">
              <label className="aem-label">
                <BiTag className="aem-label-icon" />
                {t('addExpense.description') || 'Description'}
                <span className="aem-optional">{t('common.optional') || '(optional)'}</span>
              </label>
              <input
                type="text"
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                className="aem-input"
                placeholder={t('addExpense.descriptionPlaceholder') || 'e.g., Dinner at restaurant'}
                maxLength="100"
              />
            </div>

            <div className="aem-field">
              <label className="aem-label">
                <BiTag className="aem-label-icon" />
                {t('addExpense.category') || 'Category'}
              </label>
              <select
                name="category"
                value={formData.category}
                onChange={handleInputChange}
                className="aem-input"
              >
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {t(`expense.category.${cat}`) || cat}
                  </option>
                ))}
              </select>
            </div>

            <div className="aem-row">
              <div className="aem-field aem-field-half">
                <label className="aem-label">
                  <BiCalendar className="aem-label-icon" />
                  {t('addExpense.date') || 'Date'}
                </label>
                <input
                  type="date"
                  name="date"
                  value={formData.date}
                  onChange={handleInputChange}
                  className="aem-input"
                  required
                />
              </div>

              <div className="aem-field aem-field-half">
                <label className="aem-label">
                  {t('addExpense.location') || 'Location'}
                  <span className="aem-optional">{t('common.optional') || '(optional)'}</span>
                </label>
                <input
                  type="text"
                  name="location"
                  value={formData.location}
                  onChange={handleInputChange}
                  className="aem-input"
                  placeholder={t('addExpense.locationPlaceholder') || 'e.g., Restaurant'}
                  maxLength="50"
                />
              </div>
            </div>
          </div>

          {/* Split Method */}
          <div className="aem-section">
            <h3 className="aem-section-title">
              <BiShare className="aem-section-icon" />
              {t('addExpense.splitMethod') || 'Split Method'}
            </h3>

            <div className="aem-split-buttons">
              {splitMethods.map((method) => (
                <button
                  key={method}
                  type="button"
                  className={`aem-split-btn ${formData.splitMethod === method ? 'aem-split-btn-active' : ''}`}
                  onClick={() =>
                    setFormData((prev) => ({
                      ...prev,
                      splitMethod: method,
                    }))
                  }
                >
                  {t(`expense.split.${method}`) || method}
                </button>
              ))}
            </div>

            {formData.splitMethod === 'percentage' && (() => {
              const totalPercentage = Object.keys(formData.participants)
                .filter(pId => formData.participants[pId]?.selected)
                .reduce((sum, pId) => sum + (formData.participants[pId].percentage || 0), 0)
              const isValid = totalPercentage === 100
              return (
                <div className={`aem-validation-hint ${isValid ? 'aem-validation-valid' : 'aem-validation-invalid'}`}>
                  {t('addExpense.percentageTotal') || 'Percentage total'}: {totalPercentage.toFixed(1)}% (必須 100%)
                </div>
              )
            })()}

            {formData.splitMethod === 'exact' && formData.amount && (() => {
              const totalExact = Object.keys(formData.participants)
                .filter(pId => formData.participants[pId]?.selected)
                .reduce((sum, pId) => sum + (formData.participants[pId].amount || 0), 0)
              const isValid = Math.abs(totalExact - formData.amount) < 0.01
              return (
                <div className={`aem-validation-hint ${isValid ? 'aem-validation-valid' : 'aem-validation-invalid'}`}>
                  {t('addExpense.exactTotal') || 'Total'}: {totalExact.toFixed(2)} {formData.currency} / {(formData.amount || 0).toFixed(2)} {formData.currency}
                </div>
              )
            })()}
          </div>

          {/* Participants Section */}
          <div className="aem-section">
            <h3 className="aem-section-title">
              <BiUser className="aem-section-icon" />
              {t('addExpense.participants') || 'Participants'}
            </h3>

            {errors.participants && <span className="aem-error aem-error-block">{errors.participants}</span>}
            {errors.splitPercentage && <span className="aem-error aem-error-block">{errors.splitPercentage}</span>}
            {errors.splitExact && <span className="aem-error aem-error-block">{errors.splitExact}</span>}

            <div className="aem-participants-list">
              {Object.entries(groupMembers || {}).map(([memberId, member]) => (
                <div key={memberId} className="aem-participant">
                  <input
                    type="checkbox"
                    id={`participant-${memberId}`}
                    checked={formData.participants[memberId]?.selected || false}
                    onChange={() => handleParticipantChange(memberId)}
                    className="aem-checkbox"
                  />
                  <label htmlFor={`participant-${memberId}`} className="aem-participant-name">
                    {member.name}
                  </label>

                  {formData.participants[memberId]?.selected && (
                    <div className="aem-participant-input">
                      {formData.splitMethod === 'equal' && (
                        <>
                          {formData.currency !== groupCurrency && (
                            <span className="aem-split-value">
                              {(formData.amount / selectedParticipants.length).toFixed(2)} {formData.currency}
                            </span>
                          )}
                          <span className="aem-split-value-converted">
                            {getParticipantAmountInGroupCurrency(memberId).toFixed(2)} {groupCurrency}
                          </span>
                        </>
                      )}

                      {formData.splitMethod === 'percentage' && (() => {
                        const previewAmount = (formData.amount * (formData.participants[memberId].percentage || 0)) / 100
                        const previewAmountInGroupCurrency = getParticipantAmountInGroupCurrency(memberId)
                        return (
                          <>
                            <div className="aem-input-wrapper">
                              <input
                                type="number"
                                inputMode="decimal"
                                min="0"
                                max="100"
                                step="0.01"
                                value={formData.participants[memberId].percentage || ''}
                                onChange={(e) => handleParticipantAmountChange(memberId, e.target.value, 'percentage')}
                                className="aem-input aem-input-small"
                                placeholder="0"
                                title="Percentage"
                              />
                              <span className="aem-input-unit">%</span>
                            </div>
                            {formData.currency !== groupCurrency && (
                              <span className="aem-split-value">
                                {previewAmount.toFixed(2)} {formData.currency}
                              </span>
                            )}
                            <span className="aem-split-value-converted">
                              {previewAmountInGroupCurrency.toFixed(2)} {groupCurrency}
                            </span>
                          </>
                        )
                      })()}

                      {formData.splitMethod === 'shares' && (() => {
                        const totalShares = Object.keys(formData.participants).filter(pId => formData.participants[pId]?.selected).reduce((sum, pId) => sum + (formData.participants[pId].shares || 1), 0)
                        const previewAmount = (formData.amount * (formData.participants[memberId].shares || 1)) / (totalShares || 1)
                        const previewAmountInGroupCurrency = getParticipantAmountInGroupCurrency(memberId)
                        return (
                          <>
                            <div className="aem-input-wrapper">
                              <input
                                type="number"
                                inputMode="decimal"
                                min="0"
                                step="0.01"
                                value={formData.participants[memberId].shares || ''}
                                onChange={(e) => handleParticipantAmountChange(memberId, e.target.value, 'shares')}
                                className="aem-input aem-input-small"
                                placeholder="1"
                                title={`Shares (input in ${formData.currency})`}
                              />
                              <span className="aem-input-unit">{t('addExpense.shares') || 'shares'}</span>
                            </div>
                            {formData.currency !== groupCurrency && (
                              <span className="aem-split-value">
                                {previewAmount.toFixed(2)} {formData.currency}
                              </span>
                            )}
                            <span className="aem-split-value-converted">
                              {previewAmountInGroupCurrency.toFixed(2)} {groupCurrency}
                            </span>
                          </>
                        )
                      })()}

                      {formData.splitMethod === 'exact' && (() => {
                        const previewAmount = formData.participants[memberId].amount || 0
                        const previewAmountInGroupCurrency = getParticipantAmountInGroupCurrency(memberId)
                        return (
                          <>
                            <div className="aem-input-wrapper">
                              <input
                                type="number"
                                inputMode="decimal"
                                min="0"
                                step="0.01"
                                value={previewAmount === 0 ? '' : previewAmount}
                                onChange={(e) => handleParticipantAmountChange(memberId, e.target.value, 'amount')}
                                className="aem-input aem-input-small"
                                placeholder="0.00"
                                title={`Exact amount (input in ${formData.currency})`}
                              />
                              <span className="aem-input-unit">{formData.currency}</span>
                            </div>
                            {formData.currency !== groupCurrency && (
                              <span className="aem-split-value">
                                {previewAmount.toFixed(2)} {formData.currency}
                              </span>
                            )}
                            <span className="aem-split-value-converted">
                              {previewAmountInGroupCurrency.toFixed(2)} {groupCurrency}
                            </span>
                          </>
                        )
                      })()}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Error Message */}
          {submitError && <div className="aem-error aem-error-block">{submitError}</div>}

          {/* Action Buttons */}
          <div className="aem-action-buttons">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="aem-cancel-btn"
            >
              {t('common.cancel') || 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={isLoading || !isFormValid}
              className="aem-submit-btn"
            >
              {isLoading ? (
                <>
                  <BiLoader className="aem-loading-icon" />
                  {t('common.saving') || 'Saving...'}
                </>
              ) : (
                t('addExpense.addExpense') || 'Add Expense'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default AddExpenseModal
