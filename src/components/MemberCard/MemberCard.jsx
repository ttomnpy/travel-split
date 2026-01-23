import { BiCheck, BiHourglass } from 'react-icons/bi'
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

  const getStatusBadge = () => {
    if (isCurrentUser) {
      return (
        <span className="status-badge owner">
          <BiCheck /> You (Owner)
        </span>
      )
    }

    if (member.type === 'real') {
      return (
        <span className="status-badge joined">
          <BiCheck /> Joined
        </span>
      )
    }

    return (
      <span className="status-badge pending">
        <BiHourglass /> Pending invite
      </span>
    )
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

  const displayEmail = shouldTruncate ? truncateEmail(member.email) : member.email

  return (
    <div className="member-card">
      <div className="member-avatar">
        {member.photo ? (
          <img src={member.photo} alt={member.name} />
        ) : (
          <div className="avatar-initials">
            {getInitials(member.name)}
          </div>
        )}
      </div>

      <div className="member-info">
        <div className="member-name-row">
          <h3 className="member-name">{member.name}</h3>
          {isCurrentUser && (
            <span className="status-badge owner inline">
              <BiCheck /> You (Owner)
            </span>
          )}
        </div>
        {member.email && (
          <p 
            className="member-email" 
            title={member.email}
            ref={emailRef}
          >
            {displayEmail}
          </p>
        )}
      </div>

      {!isCurrentUser && (
        <div className="member-status">
          {getStatusBadge()}
        </div>
      )}
    </div>
  )
}

export default MemberCard
