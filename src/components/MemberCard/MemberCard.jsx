import { BiCheck, BiHourglass, BiCrown } from 'react-icons/bi'
import { useState, useRef, useEffect } from 'react'
import './MemberCard.css'

function MemberCard({ member, memberId, isOwner, isCurrentUser }) {
  const [shouldTruncate, setShouldTruncate] = useState(false)
  const emailRef = useRef(null)

  // Check if email overflows container
  useEffect(() => {
    if (emailRef.current) {
      const isOverflowing = emailRef.current.scrollWidth > emailRef.current.clientWidth
      setShouldTruncate(isOverflowing)
    }
  }, [member.email])

  const getInitials = (name) => {
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .substring(0, 2)
  }

  const getStatusIndicators = () => {
    const indicators = []

    // Owner indicator - icon only with tooltip
    if (isOwner) {
      indicators.push({
        type: 'owner',
        icon: BiCrown,
        label: 'Owner'
      })
    }

    // Joined indicator - icon only with tooltip
    if (!isOwner && member.type === 'real') {
      indicators.push({
        type: 'joined',
        icon: BiCheck,
        label: 'Joined'
      })
    }

    // Pending indicator - icon only with tooltip
    if (member.type !== 'real') {
      indicators.push({
        type: 'pending',
        icon: BiHourglass,
        label: 'Pending invite'
      })
    }

    return indicators
  }

  const truncateEmail = (email, maxLength = 20) => {
    if (!email || email.length <= maxLength) return email
    const atIndex = email.indexOf('@')
    if (atIndex > 0) {
      const localPart = email.substring(0, Math.max(3, Math.floor(maxLength / 2)))
      return `${localPart}...@${email.substring(atIndex + 1)}`
    }
    return email.substring(0, maxLength) + '...'
  }

  // Display name - use member.name (group-level customizable name)
  const displayMemberName = member.name || 'Member'

  return (
    <div className="member-card">
      <div className="member-avatar">
        {member.photo ? (
          <img src={member.photo} alt={displayMemberName} />
        ) : (
          <div className="avatar-initials">
            {getInitials(displayMemberName)}
          </div>
        )}
      </div>

      <div className="member-info">
        <div className="member-name-row">
          <h3 className="member-name">{displayMemberName}</h3>
          {isCurrentUser && (
            <span className="member-current-user">You</span>
          )}
        </div>
        {member.email && (
          <p 
            className="member-email" 
            title={member.email}
            ref={emailRef}
          >
            {shouldTruncate ? truncateEmail(member.email) : member.email}
          </p>
        )}
      </div>

      <div className="member-indicators">
        {getStatusIndicators().map((indicator, idx) => {
          const IconComponent = indicator.icon
          return (
            <div
              key={idx}
              className={`status-indicator status-${indicator.type}`}
              title={indicator.label}
              role="img"
              aria-label={indicator.label}
            >
              <IconComponent />
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default MemberCard
