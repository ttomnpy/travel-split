import React from 'react'
import { BiTrash, BiCalendar, BiMoney, BiComment } from 'react-icons/bi'
import { getMemberDisplayName } from '../../utils/displayNameHelper'
import './SettlementHistory.css'

function SettlementHistory({ 
  settlementRecords = [], 
  members = {}, 
  formatCurrency,
  currentUserId,
  onDeleteRecord,
  t,
  isLoading
}) {
  if (!settlementRecords || settlementRecords.length === 0) {
    return (
      <div className="settlement-history">
        <h4 className="settlement-history-title">
          {t('settlement.paymentHistory') || 'Payment History'}
        </h4>
        <div className="empty-history">
          <p>{t('settlement.noPaymentRecords') || 'No payment records yet'}</p>
        </div>
      </div>
    )
  }

  const handleDeleteClick = (recordId, record) => {
    if (onDeleteRecord) {
      onDeleteRecord(recordId, record)
    }
  }

  return (
    <div className="settlement-history">
      <h4 className="settlement-history-title">
        {t('settlement.paymentHistory') || 'Payment History'}
      </h4>

      <div className="settlement-records">
        {settlementRecords.map((record) => {
          const fromName = getMemberDisplayName(members?.[record.from]) || 'Unknown'
          const toName = getMemberDisplayName(members?.[record.to]) || 'Unknown'
          const isUserInvolved = record.from === currentUserId || record.to === currentUserId
          const isUserPayer = record.from === currentUserId
          const isUserRecipient = record.to === currentUserId

          return (
            <div 
              key={record.id}
              className={`settlement-record ${isUserInvolved ? 'user-involved' : ''} ${
                isUserPayer ? 'user-payer' : isUserRecipient ? 'user-recipient' : ''
              }`}
            >
              {/* Header with From/To and Amount */}
              <div className="record-header">
                <div className="record-parties">
                  <div className="party-info">
                    <div className="party-name">
                      {fromName}
                      {isUserPayer && (
                        <span className="you-badge">{t('settlement.you') || 'You'}</span>
                      )}
                    </div>
                    <div className="party-role">{t('settlement.paid') || 'Paid'}</div>
                  </div>

                  <div className="arrow-container">
                    <span className="arrow">→</span>
                  </div>

                  <div className="party-info recipient">
                    <div className="party-name">
                      {toName}
                      {isUserRecipient && (
                        <span className="you-badge">{t('settlement.you') || 'You'}</span>
                      )}
                    </div>
                    <div className="party-role">{t('settlement.received') || 'Received'}</div>
                  </div>
                </div>

                <div className="record-amount">
                  {formatCurrency(record.amount)}
                </div>
              </div>

              {/* Details */}
              <div className="record-details">
                {record.date && (
                  <div className="detail-item">
                    <BiCalendar size={16} />
                    <span>{new Date(record.date).toLocaleDateString()}</span>
                  </div>
                )}

                {record.paymentMethod && (
                  <div className="detail-item">
                    <BiMoney size={16} />
                    <span>{record.paymentMethod}</span>
                  </div>
                )}

                {record.remarks && (
                  <div className="detail-item full-width">
                    <BiComment size={16} />
                    <span>{record.remarks}</span>
                  </div>
                )}
              </div>

              {/* Delete Button (if user is involved or admin) */}
              {isUserInvolved && (
                <button
                  className="delete-button"
                  onClick={() => handleDeleteClick(record.id, record)}
                  disabled={isLoading}
                  title={t('common.delete') || 'Delete'}
                >
                  <BiTrash size={18} />
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default SettlementHistory
