import './GroupExpenseCard.css'

function GroupExpenseCard({ 
  groupName = 'Group Name',
  totalAmount = 1234.56,
  currency = 'HKD',
  memberCount = 3,
  members = [
    { id: 1, name: 'Alice', initials: 'AL' },
    { id: 2, name: 'Bob', initials: 'BO' },
    { id: 3, name: 'Carol', initials: 'CR' }
  ],
  onViewDetails = () => {},
  variant = 'default'
}) {
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('zh-HK', {
      style: 'currency',
      currency: currency
    }).format(amount)
  }

  return (
    <div className={`expense-card ${variant}`}>
      {/* Card Header */}
      <div className="gec-card-header">
        <h3 className="group-name">{groupName}</h3>
        <div className="member-count">{memberCount}</div>
      </div>

      {/* Total Amount */}
      <div className="amount-section">
        <p className="amount-label">Total Expenses</p>
        <p className="amount-value">{formatCurrency(totalAmount)}</p>
      </div>

      {/* Members */}
      <div className="members-section">
        <p className="members-label">Members</p>
        <div className="members-list">
          {members.map((member) => (
            <div key={member.id} className="member-item">
              <div className="member-avatar">{member.initials}</div>
              <span className="member-name">{member.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Action Button */}
      <button 
        className="action-button"
        onClick={onViewDetails}
        aria-label={`View details for ${groupName}`}
      >
        View Details
      </button>
    </div>
  )
}

export default GroupExpenseCard
