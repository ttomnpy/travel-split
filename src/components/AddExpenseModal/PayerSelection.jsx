import React from 'react'
import { BiMoney, BiUser } from 'react-icons/bi'
import { useTranslation } from '../../hooks/useTranslation'
import './PayerSelection.css'

const PayerSelection = ({ 
  mode, 
  onModeChange, 
  formData, 
  setFormData, 
  groupMembers, 
  currency,
  errors 
}) => {
  const { t } = useTranslation()

  const handleSinglePayerChange = (e) => {
    const selectedPayerId = e.target.value
    const selectedMember = groupMembers[selectedPayerId]
    setFormData((prev) => ({
      ...prev,
      payers: {
        [selectedPayerId]: {
          name: selectedMember.name,
          amount: prev.amount
        }
      }
    }))
  }

  const handleMultiplePayerToggle = (memberId) => {
    setFormData((prev) => {
      const newPayers = { ...prev.payers }
      if (newPayers[memberId]) {
        delete newPayers[memberId]
      } else {
        newPayers[memberId] = {
          name: groupMembers[memberId].name,
          amount: 0
        }
      }
      return { ...prev, payers: newPayers }
    })
  }

  const handleMultiplePayerAmountChange = (memberId, amount) => {
    setFormData((prev) => ({
      ...prev,
      payers: {
        ...prev.payers,
        [memberId]: {
          ...prev.payers[memberId],
          amount: amount === '' ? 0 : parseFloat(amount)
        }
      }
    }))
  }

  // Calculate total of all payers
  const totalPayersAmount = Object.values(formData.payers || {}).reduce(
    (sum, payer) => sum + (payer.amount || 0),
    0
  )
  const payersAmountValid = Math.abs(totalPayersAmount - formData.amount) < 0.01

  return (
    <div className="ps-container">
      {/* Mode Tabs */}
      <div className="ps-tabs">
        <button
          type="button"
          className={`ps-tab ${mode === 'single' ? 'ps-tab-active' : ''}`}
          onClick={() => onModeChange('single')}
        >
          {t('addExpense.singlePayer') || 'Single Payer'}
        </button>
        <button
          type="button"
          className={`ps-tab ${mode === 'multiple' ? 'ps-tab-active' : ''}`}
          onClick={() => onModeChange('multiple')}
        >
          {t('addExpense.multiplePayers') || 'Multiple Payers'}
        </button>
      </div>

      {/* Single Payer Mode */}
      {mode === 'single' && (
        <div className="ps-section ps-single-payer">
          <label className="ps-label">
            <BiUser className="ps-label-icon" />
            {t('addExpense.whoPaid') || 'Who Paid'}
            <span className="ps-required">*</span>
          </label>
          <select
            value={Object.keys(formData.payers || {})[0] || ''}
            onChange={handleSinglePayerChange}
            className="ps-input ps-select"
          >
            <option value="">
              {t('addExpense.selectPayer') || 'Select payer...'}
            </option>
            {Object.entries(groupMembers || {}).map(([memberId, member]) => (
              <option key={memberId} value={memberId}>
                {member.name}
              </option>
            ))}
          </select>
          {errors.payer && <span className="ps-error">{errors.payer}</span>}
        </div>
      )}

      {/* Multiple Payers Mode */}
      {mode === 'multiple' && (
        <div className="ps-section ps-multiple-payers">
          <label className="ps-label">
            {t('addExpense.selectMultiplePayers') || 'Who Paid'}
            <span className="ps-required">*</span>
          </label>

          <div className="ps-payers-list">
            {Object.entries(groupMembers || {}).map(([memberId, member]) => {
              const isSelected = formData.payers && formData.payers[memberId]
              const payerAmount = isSelected ? formData.payers[memberId].amount : 0

              return (
                <div key={memberId} className="ps-payer-row">
                  <input
                    type="checkbox"
                    id={`payer-${memberId}`}
                    checked={!!isSelected}
                    onChange={() => handleMultiplePayerToggle(memberId)}
                    className="ps-checkbox"
                  />
                  <label htmlFor={`payer-${memberId}`} className="ps-payer-name">
                    {member.name}
                  </label>

                  {isSelected && (
                    <div className="ps-payer-input-group">
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        value={payerAmount === 0 ? '' : payerAmount}
                        onChange={(e) =>
                          handleMultiplePayerAmountChange(
                            memberId,
                            e.target.value
                          )
                        }
                        className="ps-input ps-payer-amount"
                        placeholder="0.00"
                      />
                      <span className="ps-payer-preview">
                        {payerAmount.toFixed(2)} {currency}
                      </span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Validation hint for multiple payers */}
          {Object.keys(formData.payers || {}).length > 0 && formData.amount && (
            <div
              className={`ps-validation-hint ${
                payersAmountValid
                  ? 'ps-validation-valid'
                  : 'ps-validation-invalid'
              }`}
            >
              {t('addExpense.payersTotal') || 'Payers Total'}:{' '}
              {totalPayersAmount.toFixed(2)} {currency} /{' '}
              {formData.amount.toFixed(2)} {currency}
            </div>
          )}

          {errors.payers && <span className="ps-error">{errors.payers}</span>}
        </div>
      )}
    </div>
  )
}

export default PayerSelection
