import React, { useState, useRef, useEffect } from 'react'
import { BiX, BiLoader } from 'react-icons/bi'
import { useTranslation } from '../../hooks/useTranslation'
import { debugLog, debugError } from '../../utils/debug'
import { recordSettlement, updateSettlement } from '../../services/expenseService'
import './SettlementRecordModal.css'

const SettlementRecordModal = ({ 
  isOpen, 
  onClose, 
  groupId, 
  groupMembers, 
  groupCurrency, 
  onSettlementRecorded, 
  currentUserId,
  settlements,
  editingRecord 
}) => {
  const { t } = useTranslation()
  const modalRef = useRef(null)

  const [formData, setFormData] = useState({
    from: '',
    to: '',
    amount: '',
    paymentMethod: '',
    remarks: '',
    date: new Date().toISOString().split('T')[0]
  })

  const [errors, setErrors] = useState({})
  const [isLoading, setIsLoading] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [submitSuccess, setSubmitSuccess] = useState(false)

  // Available payers (all group members)
  const availablePayers = Object.entries(groupMembers || {})
    .map(([memberId, member]) => ({
      id: memberId,
      name: member.name
    }))

  // Available recipients (members excluding selected payer)
  const availableRecipients = Object.entries(groupMembers || {})
    .filter(([memberId]) => memberId !== formData.from)
    .map(([memberId, member]) => ({
      id: memberId,
      name: member.name
    }))

  // Calculate amount owed by payer to recipient
  const getAmountOwedToRecipient = (payerId, recipientId) => {
    if (!settlements || !payerId || !recipientId) return 0
    
    // Find if selected payer owes money to selected recipient
    const settlement = settlements.find(
      s => s.from === payerId && s.to === recipientId
    )
    
    return settlement ? settlement.amount : 0
  }

  // Focus on amount input when modal opens
  useEffect(() => {
    if (isOpen && modalRef.current) {
      const amountInput = modalRef.current.querySelector('[name="amount"]')
      if (amountInput) {
        setTimeout(() => amountInput.focus(), 100)
      }
    }
  }, [isOpen])

  // Prevent scroll wheel from changing number input values
  useEffect(() => {
    const handleWheel = (e) => {
      if (e.target.type === 'number') {
        e.preventDefault()
      }
    }

    if (modalRef.current) {
      modalRef.current.addEventListener('wheel', handleWheel, { passive: false })
      return () => {
        modalRef.current?.removeEventListener('wheel', handleWheel)
      }
    }
  }, [])

  // Reset form when closing or when editing data changes
  useEffect(() => {
    if (!isOpen) {
      setFormData({
        from: '',
        to: '',
        amount: '',
        paymentMethod: '',
        remarks: '',
        date: new Date().toISOString().split('T')[0]
      })
      setErrors({})
      setSubmitError(null)
      setSubmitSuccess(false)
    } else if (editingRecord) {
      // Populate form with existing record data
      setFormData({
        from: editingRecord.from || '',
        to: editingRecord.to || '',
        amount: editingRecord.amount ? editingRecord.amount.toString() : '',
        paymentMethod: editingRecord.paymentMethod || '',
        remarks: editingRecord.remarks || '',
        date: editingRecord.date || new Date().toISOString().split('T')[0]
      })
      setErrors({})
      setSubmitError(null)
      setSubmitSuccess(false)
    }
  }, [isOpen, editingRecord])

  // Validate form
  const validateForm = () => {
    const newErrors = {}

    if (!formData.from) {
      newErrors.from = t('settlement.payerRequired') || 'Payer is required'
    }

    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      newErrors.amount = t('settlement.amountRequired') || 'Amount is required'
    }

    if (!formData.to) {
      newErrors.to = t('settlement.recipientRequired') || 'Recipient is required'
    }

    if (formData.from === formData.to) {
      newErrors.to = t('settlement.cannotPaySelf') || 'Cannot pay yourself'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // Handle input changes
  const handleInputChange = (e) => {
    const { name, value } = e.target

    setFormData((prev) => ({
      ...prev,
      [name]: value
    }))
    // Clear error for this field when user starts typing
    if (errors[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: ''
      }))
    }
  }

  // Handle recipient selection change
  const handleRecipientChange = (e) => {
    const recipientId = e.target.value
    const amountOwed = getAmountOwedToRecipient(formData.from, recipientId)
    
    setFormData((prev) => ({
      ...prev,
      to: recipientId,
      amount: amountOwed > 0 ? amountOwed.toFixed(2) : ''
    }))
    // Clear to error when selecting a recipient
    if (errors.to) {
      setErrors((prev) => ({
        ...prev,
        to: ''
      }))
    }
  }

  // Handle payer selection change
  const handlePayerChange = (e) => {
    const payerId = e.target.value
    setFormData((prev) => ({
      ...prev,
      from: payerId,
      to: '', // Reset recipient when payer changes
      amount: ''
    }))
    // Clear from error when selecting a payer
    if (errors.from) {
      setErrors((prev) => ({
        ...prev,
        from: ''
      }))
    }
  }

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!validateForm()) {
      return
    }

    setIsLoading(true)
    setSubmitError(null)

    try {
      const settlementData = {
        from: formData.from,
        to: formData.to,
        amount: parseFloat(formData.amount),
        paymentMethod: formData.paymentMethod || 'cash',
        remarks: formData.remarks || '',
        date: formData.date
      }

      if (editingRecord && editingRecord.id) {
        // Update existing settlement record
        debugLog('Updating settlement record', { recordId: editingRecord.id, data: settlementData })
        await updateSettlement(groupId, editingRecord.id, settlementData)
      } else {
        // Create new settlement record
        debugLog('Recording settlement', settlementData)
        await recordSettlement(groupId, settlementData, currentUserId)
      }

      setSubmitSuccess(true)
      
      // Reset form
      setFormData({
        from: '',
        to: '',
        amount: '',
        paymentMethod: '',
        remarks: '',
        date: new Date().toISOString().split('T')[0]
      })

      // Notify parent and close after short delay
      setTimeout(() => {
        onSettlementRecorded?.()
        onClose()
      }, 500)
    } catch (error) {
      debugError('Error recording settlement', error)
      setSubmitError(error.message || t('settlement.recordingError') || 'Failed to record settlement')
    } finally {
      setIsLoading(false)
    }
  }

  if (!isOpen) return null

  const isEditMode = editingRecord && editingRecord.id
  const payerName = groupMembers?.[formData.from]?.name || ''
  const recipientName = groupMembers?.[formData.to]?.name || ''

  return (
    <div className="srm-overlay" onClick={(e) => {
      if (e.target.className === 'srm-overlay') onClose()
    }}>
      <div className="settlement-record-modal" ref={modalRef}>
        {/* Header */}
        <div className="modal-header">
          <h2>{isEditMode ? (t('settlement.editPayment') || 'Edit Payment') : (t('settlement.recordPayment') || 'Record Payment')}</h2>
          <button
            className="close-button"
            onClick={onClose}
            disabled={isLoading}
            aria-label="Close"
          >
            <BiX size={24} />
          </button>
        </div>

        {/* Success Message */}
        {submitSuccess && (
          <div className="success-message">
            ✓ {t('settlement.recordedSuccessfully') || 'Payment recorded successfully!'}
          </div>
        )}

        {/* Error Message */}
        {submitError && (
          <div className="error-message">
            ✗ {submitError}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="settlement-form">
          {/* From - Select Payer */}
          <div className="form-group">
            <label htmlFor="from">
              {t('settlement.from') || 'From'} <span className="required">*</span>
            </label>
            <select
              id="from"
              name="from"
              value={formData.from}
              onChange={handlePayerChange}
              className={`form-select ${errors.from ? 'error' : ''}`}
              disabled={isLoading}
            >
              <option value="">{t('settlement.selectPayer') || 'Select payer...'}</option>
              {availablePayers.map((payer) => (
                <option key={payer.id} value={payer.id}>
                  {payer.name}
                </option>
              ))}
            </select>
            {errors.from && <span className="error-text">{errors.from}</span>}
          </div>

          {/* To - Select Recipient */}
          <div className="form-group">
            <label htmlFor="to">
              {t('settlement.to') || 'To'} <span className="required">*</span>
            </label>
            <select
              id="to"
              name="to"
              value={formData.to}
              onChange={handleRecipientChange}
              className={`form-select ${errors.to ? 'error' : ''}`}
              disabled={isLoading}
            >
              <option value="">{t('settlement.selectRecipient') || 'Select recipient...'}</option>
              {availableRecipients.map((recipient) => (
                <option key={recipient.id} value={recipient.id}>
                  {recipient.name}
                </option>
              ))}
            </select>
            {errors.to && <span className="error-text">{errors.to}</span>}
          </div>

          {/* Amount */}
          <div className="form-group">
            <label htmlFor="amount">
              {t('settlement.amount') || 'Amount'} <span className="required">*</span>
            </label>
            <div className="amount-input-wrapper">
              <input
                type="number"
                id="amount"
                name="amount"
                value={formData.amount}
                onChange={handleInputChange}
                placeholder="0.00"
                step="0.01"
                min="0"
                className={`form-input ${errors.amount ? 'error' : ''}`}
                disabled={isLoading}
              />
              <span className="currency">{groupCurrency || 'HKD'}</span>
            </div>
            {errors.amount && <span className="error-text">{errors.amount}</span>}
          </div>

          {/* Payment Method */}
          <div className="form-group">
            <label htmlFor="paymentMethod">
              {t('settlement.paymentMethod') || 'Payment Method'}
            </label>
            <input
              type="text"
              id="paymentMethod"
              name="paymentMethod"
              value={formData.paymentMethod}
              onChange={handleInputChange}
              placeholder={t('settlement.paymentMethodPlaceholder') || 'FPS/Payme/Cash...'}
              className="form-input"
              disabled={isLoading}
            />
          </div>

          {/* Date */}
          <div className="form-group">
            <label htmlFor="date">
              {t('settlement.date') || 'Date'}
            </label>
            <input
              type="date"
              id="date"
              name="date"
              value={formData.date}
              onChange={handleInputChange}
              className="form-input"
              disabled={isLoading}
            />
          </div>

          {/* Remarks */}
          <div className="form-group">
            <label htmlFor="remarks">
              {t('settlement.remarks') || 'Remarks'}
            </label>
            <textarea
              id="remarks"
              name="remarks"
              value={formData.remarks}
              onChange={handleInputChange}
              placeholder={t('settlement.remarksPlaceholder') || 'Add any notes...'}
              className="form-textarea"
              rows="3"
              disabled={isLoading}
            />
          </div>

          {/* Payment Preview */}
          {formData.from && formData.to && formData.amount && (
            <div className="payment-preview">
              <div className="preview-item">
                <span className="preview-label">{payerName}</span>
                <span className="preview-arrow">→</span>
                <span className="preview-label">{recipientName}</span>
              </div>
              <div className="preview-amount">
                {groupCurrency || 'HKD'} {parseFloat(formData.amount).toFixed(2)}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="form-actions">
            <button
              type="button"
              className="button secondary"
              onClick={onClose}
              disabled={isLoading}
            >
              {t('common.cancel') || 'Cancel'}
            </button>
            <button
              type="submit"
              className="button primary"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <BiLoader className="spinner" />
                  {t('common.saving') || 'Saving...'}
                </>
              ) : isEditMode ? (
                t('settlement.updatePayment') || 'Update Payment'
              ) : (
                t('settlement.recordPayment') || 'Record Payment'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default SettlementRecordModal
