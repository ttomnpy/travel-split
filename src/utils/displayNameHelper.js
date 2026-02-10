/**
 * Get display name from user profile with fallback logic
 * Priority: userProfile.displayName > Firebase Auth displayName > email > 'Member'
 * 
 * @param {Object} userProfile - User profile from database (/users/{uid})
 * @param {Object} user - Firebase Auth user
 * @returns {string} - Display name to show in UI
 */
export function getDisplayName(userProfile, user) {
  // First priority: displayName from database (user profile)
  if (userProfile?.displayName?.trim()) {
    return userProfile.displayName
  }
  
  // Second priority: displayName from Firebase Auth
  if (user?.displayName?.trim()) {
    return user.displayName
  }
  
  // Third priority: Extract name from email (before @)
  if (user?.email) {
    return user.email.split('@')[0]
  }
  
  // Fallback
  return 'Member'
}

/**
 * Get email from user
 * @param {Object} user - Firebase Auth user
 * @returns {string} - User email
 */
export function getUserEmail(user) {
  return user?.email || 'Unknown'
}

/**
 * Get display name for a member, adding "(removed)" if member has been removed from group
 * @param {Object} member - Member object
 * @returns {string} Display name with status
 */
export function getMemberDisplayName(member) {
  if (!member) return 'Unknown Member'
  
  const baseName = member.name || 'Member'
  
  if (member.status === 'removed') {
    return `${baseName} (removed)`
  }
  
  return baseName
}

/**
 * Check if member is removed from group
 * @param {Object} member - Member object
 * @returns {boolean} True if member is removed
 */
export function isMemberRemoved(member) {
  return member?.status === 'removed'
}
