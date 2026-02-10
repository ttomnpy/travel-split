import { BiPlus } from 'react-icons/bi'
import { useTranslation } from '../../hooks/useTranslation'
import MemberCard from '../MemberCard/MemberCard'
import './MembersList.css'

function MembersList({ members, currentUserId, isOwner, onAddMember }) {
  const { t } = useTranslation()

  if (!members || Object.keys(members).length === 0) {
    return (
      <div className="members-empty">
        <div className="empty-icon">👥</div>
        <p>{t('member.noMembers')}</p>
      </div>
    )
  }

  // Separate real and dummy members, excluding removed members for active member list
  const realMembers = []
  const dummyMembers = []

  Object.entries(members).forEach(([memberId, member]) => {
    // Skip removed members from active member list (they'll be shown separately)
    if (member.status === 'removed') {
      return
    }
    
    if (member.type === 'real') {
      realMembers.push({ id: memberId, ...member })
    } else {
      dummyMembers.push({ id: memberId, ...member })
    }
  })

  // Sort: owner first, then other real members, then dummy members
  realMembers.sort((a, b) => {
    if (a.role === 'owner') return -1
    if (b.role === 'owner') return 1
    return 0
  })

  return (
    <div className="members-container">
      <div className="members-header">
        <h2 className="members-title">
          {t('member.membersTitle', { count: Object.keys(members).length })}
        </h2>
        {isOwner && (
          <button
            className="add-member-btn"
            onClick={onAddMember}
            title={t('member.addMember')}
            aria-label={t('member.addMember')}
          >
            <BiPlus />
          </button>
        )}
      </div>

      <div className="members-list">
        {/* Real Members Section */}
        {realMembers.length > 0 && (
          <div className="members-section">
            <h3 className="section-title">{t('member.joined')}</h3>
            <div className="members-grid">
              {realMembers.map(member => (
                <MemberCard
                  key={member.id}
                  memberId={member.id}
                  member={member}
                  isOwner={member.role === 'owner'}
                  isCurrentUser={member.id === currentUserId}
                />
              ))}
            </div>
          </div>
        )}

        {/* Dummy Members Section */}
        {dummyMembers.length > 0 && (
          <div className="members-section">
            <h3 className="section-title">{t('member.pendingInvite')}</h3>
            <div className="members-grid">
              {dummyMembers.map(member => (
                <MemberCard
                  key={member.id}
                  memberId={member.id}
                  member={member}
                  isOwner={false}
                  isCurrentUser={false}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default MembersList
