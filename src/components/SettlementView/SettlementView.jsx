import React, { useState } from 'react'
import { BiCheck, BiPlus } from 'react-icons/bi'
import SettlementHistory from '../SettlementHistory/SettlementHistory'
import './SettlementView.css'

function SettlementView({ 
  settlements, 
  formatCurrency, 
  currentUserId, 
  t,
  groupMembers,
  settlementRecords,
  onOpenRecordModal,
  onDeleteRecord,
  isLoading
}) {
  if (!settlements || settlements.length === 0) {
    return (
      <div className="settlement-empty-state">
        <div className="empty-icon">
          <BiCheck />
        </div>
        <h3>{t('settlement.allSettled') || 'All Settled!'}</h3>
        <p>{t('settlement.noOutstandingDebts') || 'No outstanding debts. Everyone is settled up!'}</p>
        
        {/* Show button to record settlement even when all settled */}
        {onOpenRecordModal && (
          <button 
            className="record-payment-button"
            onClick={onOpenRecordModal}
          >
            <BiPlus size={18} />
            {t('settlement.recordPayment') || 'Record Payment'}
          </button>
        )}

        {/* Show settlement history */}
        {settlementRecords && settlementRecords.length > 0 && (
          <SettlementHistory
            settlementRecords={settlementRecords}
            members={groupMembers}
            formatCurrency={formatCurrency}
            currentUserId={currentUserId}
            onDeleteRecord={onDeleteRecord}
            t={t}
            isLoading={isLoading}
          />
        )}
      </div>
    )
  }

  return (
    <div className="settlement-view">
      <div className="settlement-header">
        <div className="header-content">
          <h3>{t('settlement.settleUpTitle') || 'Settlement Summary'}</h3>
          <p className="settlement-subtitle">{t('settlement.settleUpDescription') || 'Here\'s who needs to pay whom to settle all expenses'}</p>
        </div>
        {onOpenRecordModal && (
          <button 
            className="record-payment-button"
            onClick={onOpenRecordModal}
            title={t('settlement.recordPayment') || 'Record Payment'}
          >
            <BiPlus size={18} />
            <span>{t('settlement.recordPayment') || 'Record Payment'}</span>
          </button>
        )}
      </div>

      <div className="settlement-list">
        {settlements.map((settlement, index) => {
          const isUserInvolved = settlement.from === currentUserId || settlement.to === currentUserId
          const isUserDebtor = settlement.from === currentUserId
          const isUserCreditor = settlement.to === currentUserId

          return (
            <div 
              key={index} 
              className={`settlement-item ${isUserInvolved ? 'user-involved' : ''} ${
                isUserDebtor ? 'user-debtor' : isUserCreditor ? 'user-creditor' : ''
              }`}
            >
              {/* Left Side - From (Debtor) */}
              <div className="settlement-person from">
                <div className="person-avatar debtor">
                  {settlement.fromName?.charAt(0).toUpperCase()}
                </div>
                <div className="person-info">
                  <div className="person-name">
                    {settlement.fromName}
                    {isUserDebtor && (
                      <span className="you-badge">{t('settlement.you') || 'You'}</span>
                    )}
                  </div>
                  <div className="person-role">{t('settlement.pays') || 'Pays'}</div>
                </div>
              </div>

              {/* Middle - Arrow and Amount */}
              <div className="settlement-arrow">
                <div className="arrow-line">→</div>
                <div className="amount-badge">
                  {formatCurrency(settlement.amount)}
                </div>
              </div>

              {/* Right Side - To (Creditor) */}
              <div className="settlement-person to">
                <div className="person-info">
                  <div className="person-name">
                    {settlement.toName}
                    {isUserCreditor && (
                      <span className="you-badge">{t('settlement.you') || 'You'}</span>
                    )}
                  </div>
                  <div className="person-role">{t('settlement.receives') || 'Receives'}</div>
                </div>
                <div className="person-avatar creditor">
                  {settlement.toName?.charAt(0).toUpperCase()}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Settlement History */}
      {settlementRecords && settlementRecords.length > 0 && (
        <SettlementHistory
          settlementRecords={settlementRecords}
          members={groupMembers}
          formatCurrency={formatCurrency}
          currentUserId={currentUserId}
          onDeleteRecord={onDeleteRecord}
          t={t}
          isLoading={isLoading}
        />
      )}
    </div>
  )
}

export default SettlementView
