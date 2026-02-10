import { ref, update, push, get } from 'firebase/database'
import { rtdb } from '../firebase'
import { debugLog, debugError } from '../utils/debug'

/**
 * Recalculate and update owner's overall summary based on all their groups
 * This should be called whenever a group is created, deleted, or modified
 * 
 * @param {string} ownerId - The owner's user ID
 * @returns {Promise<void>}
 */
export const updateAllUserSummaries = async (groupId, expenseData) => {
  try {
    debugLog('Updating summaries for all users involved in expense', {
      groupId,
      amount: expenseData.amount,
      payersCount: Object.keys(expenseData.payers || {}).length,
      participantsCount: (expenseData.participants || []).length
    })

    // Get all unique user IDs (payers + participants)
    const payerIds = Object.keys(expenseData.payers || {})
    const participantIds = expenseData.participants || []
    const allUserIds = new Set([...payerIds, ...participantIds])

    // Batch update all user summaries
    const updates = {}

    for (const userId of allUserIds) {
      try {
        // Get current user summary
        const userSummaryRef = ref(rtdb, `userSummaries/${String(userId)}`)
        const userSummarySnapshot = await get(userSummaryRef)

        let currentSummary = {
          totalBalance: 0,
          totalAmountOwed: 0,
          totalAmountReceivable: 0,
          lastUpdated: Date.now()
        }

        if (userSummarySnapshot.exists()) {
          currentSummary = userSummarySnapshot.val()
        }

        // Calculate updated amounts for this user
        let amountOwed = 0
        let amountReceivable = 0

        // If user is a payer
        if (payerIds.includes(userId)) {
          amountReceivable = expenseData.payers[userId]?.amount || 0
        }

        // If user is a participant
        if (participantIds.includes(userId)) {
          const participantShare = expenseData.splitDetails[userId] || 0
          amountOwed = participantShare
        }

        // Update summary with new totals
        const newAmountOwed = (currentSummary.totalAmountOwed || 0) + amountOwed
        const newAmountReceivable = (currentSummary.totalAmountReceivable || 0) + amountReceivable
        const newTotalBalance = newAmountReceivable - newAmountOwed
        
        updates[`userSummaries/${String(userId)}`] = {
          totalBalance: newTotalBalance,
          totalAmountOwed: newAmountOwed,
          totalAmountReceivable: newAmountReceivable,
          lastUpdated: Date.now()
        }

        debugLog('Calculated user summary update', {
          userId,
          amountOwed,
          amountReceivable,
          newTotal: {
            totalBalance: newTotalBalance,
            totalAmountOwed: newAmountOwed,
            totalAmountReceivable: newAmountReceivable
          }
        })
      } catch (userError) {
        debugError('Error calculating summary for user', { userId, error: userError.message })
        // Continue with other users
      }
    }

    // Apply all updates in one batch
    if (Object.keys(updates).length > 0) {
      await update(ref(rtdb), updates)
      debugLog('All user summaries updated successfully', {
        updatedUserCount: Object.keys(updates).length
      })
    }
  } catch (error) {
    debugError('Error updating all user summaries', error)
    throw error
  }
}

export const updateOwnerOverallSummary = async (ownerId) => {
  try {
    if (!ownerId || typeof ownerId !== 'string') {
      debugLog('Invalid owner ID, skipping summary update', { ownerId, type: typeof ownerId })
      return
    }

    debugLog('Recalculating owner overall summary', { ownerId })

    // Get user's own summary which is already aggregated
    const userSummaryRef = ref(rtdb, `userSummaries/${String(ownerId)}`)
    const userSummarySnapshot = await get(userSummaryRef)

    let totalGroupCount = 0
    let totalBalance = 0

    if (userSummarySnapshot.exists()) {
      const userSummary = userSummarySnapshot.val()
      totalBalance = userSummary.totalBalance || 0
    }

    // Get all groups for the owner to count them
    const userGroupsRef = ref(rtdb, `users/${String(ownerId)}/groups`)
    const userGroupsSnapshot = await get(userGroupsRef)

    if (userGroupsSnapshot.exists()) {
      const userGroups = userGroupsSnapshot.val()
      totalGroupCount = Object.keys(userGroups).length
    }

    // Update owner's overall summary using batch write
    const summaryData = {
      totalBalance,
      totalGroupCount,
      lastUpdated: Date.now()
    }

    debugLog('Updating userSummaries with data', { ownerId, summaryData })

    await update(ref(rtdb), {
      [`userSummaries/${String(ownerId)}`]: summaryData
    })

    debugLog('Owner overall summary updated successfully', { 
      ownerId,
      totalGroupCount,
      totalBalance
    })
  } catch (error) {
    debugError('Error updating owner overall summary', error)
    throw error
  }
}

/**
 * Generate unique 8-character invite code with collision detection
 * Excludes ambiguous characters: O, I, l, 1, 0
 */
export const generateInviteCode = async () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const maxRetries = 5 // Prevent infinite loop
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    let code = ''
    
    // Generate 8-character code (more unique than 6)
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    
    // Check if code already exists in hash table
    const codeRef = ref(rtdb, `inviteCodes/${code}`)
    const snapshot = await get(codeRef)
    
    if (!snapshot.exists()) {
      // Code is unique
      return code
    }
    
    debugLog('Invite code collision detected, retrying...', { code, attempt })
  }
  
  // Fallback: use timestamp + random as last resort
  const timestamp = Date.now().toString(36).toUpperCase()
  const random = Math.random().toString(36).substring(2, 4).toUpperCase()
  return `${timestamp}${random}`
}

/**
 * Generate unique dummy member ID
 * Format: dummy_{timestamp}_{random}
 */
export const generateDummyId = () => {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8)
  return `dummy_${timestamp}_${random}`
}

/**
 * Create a new group
 * Writes to:
 * - groups/{groupId} with group data
 * - users/{userId}/groups/{groupId} with group reference
 */
export const createGroup = async (userId, groupData) => {
  try {
    const groupId = push(ref(rtdb, 'groups')).key
    if (!groupId) throw new Error('Failed to generate group ID')

    const inviteCode = await generateInviteCode()
    const now = Date.now()

    // Group structure following SPEC.md
    const newGroup = {
      name: groupData.name.trim(),
      description: groupData.description?.trim() || '',
      currency: groupData.currency || 'USD',
      createdBy: userId,
      createdAt: now,
      owner: userId,
      inviteCode,
      
      // Initialize with current user as owner/first member
      members: {
        [userId]: {
          type: 'real',
          name: (groupData.creatorName && groupData.creatorName.trim()) ? groupData.creatorName : (groupData.creatorEmail || 'Member'),
          email: groupData.creatorEmail || '',
          photo: groupData.creatorPhoto || null,
          role: 'owner',
          joinedAt: now
        }
      },

      // Initialize empty collections
      expenses: {},
      settlements: {},
      memberHistory: {},

      // Initialize summary
      summary: {
        totalExpenses: 0,
        expenseCount: 0,
        memberCount: 1,
        lastExpenseAt: null,
        balances: {
          [userId]: 0
        }
      }
    }

    // Batch update: write group + add to user's groups + add invite code index
    const updates = {}
    updates[`groups/${String(groupId)}`] = newGroup
    updates[`users/${String(userId)}/groups/${String(groupId)}`] = {
      lastActivityAt: now
    }
    // Add to invite code reverse index for O(1) lookup
    updates[`inviteCodes/${String(inviteCode)}`] = String(groupId)

    await update(ref(rtdb), updates)

    // Update owner's overall summary after creating the group
    await updateOwnerOverallSummary(userId)

    return {
      success: true,
      groupId,
      inviteCode,
      group: newGroup
    }
  } catch (error) {
    debugError('Error creating group', error)
    throw error
  }
}

/**
 * Add dummy member to group
 * Only group owner can add members
 */
export const addDummyMember = async (groupId, memberName, userId, userRole = 'member') => {
  try {
    // Verify user is owner
    const groupRef = ref(rtdb, `groups/${groupId}`)
    const groupSnapshot = await get(groupRef)

    if (!groupSnapshot.exists()) {
      throw new Error('Group not found')
    }

    const group = groupSnapshot.val()
    if (group.owner !== userId) {
      throw new Error('Only group owner can add members')
    }

    // Check for duplicate names (case-insensitive)
    const existingMembers = Object.values(group.members || {})
    const duplicateName = existingMembers.some(
      member => member.name.toLowerCase() === memberName.toLowerCase()
    )
    if (duplicateName) {
      throw new Error('This name is already taken in this group')
    }

    const dummyId = generateDummyId()
    const now = Date.now()

    // New member data following SPEC.md
    const newMember = {
      type: 'dummy',
      name: memberName.trim(),
      email: null,
      photo: null,
      role: userRole,
      createdBy: userId,
      createdAt: now
    }

    // Batch update
    const updates = {}
    updates[`groups/${String(groupId)}/members/${String(dummyId)}`] = newMember
    updates[`groups/${String(groupId)}/summary/memberCount`] = (group.summary?.memberCount || 1) + 1
    updates[`groups/${String(groupId)}/summary/balances/${String(dummyId)}`] = 0

    await update(ref(rtdb), updates)

    return {
      success: true,
      dummyId,
      member: newMember
    }
  } catch (error) {
    debugError('Error adding dummy member', error)
    throw error
  }
}

/**
 * Claim dummy member by real user
 * Links dummy member ID to real user ID
 */
export const claimDummyMember = async (groupId, dummyId, userId, userName, userEmail) => {
  try {
    const groupRef = ref(rtdb, `groups/${groupId}`)
    const groupSnapshot = await get(groupRef)

    if (!groupSnapshot.exists()) {
      throw new Error('Group not found')
    }

    const group = groupSnapshot.val()
    const dummy = group.members?.[dummyId]

    if (!dummy || dummy.type !== 'dummy') {
      throw new Error('Dummy member not found')
    }

    const now = Date.now()

    // Create real member entry linked to dummy
    const realMember = {
      type: 'real',
      name: userName,
      email: userEmail || '',
      photo: null,
      role: dummy.role || 'member',
      joinedAt: now,
      linkedFrom: dummyId
    }

    // Prepare batch update to replace dummy with real user everywhere
    const updates = {}

    // Add real member
    updates[`groups/${groupId}/members/${userId}`] = realMember

    // Remove dummy member
    updates[`groups/${groupId}/members/${dummyId}`] = null

    // Update expenses: replace dummyId with userId in by, for, and details
    const expenses = group.expenses || {}
    for (const [expenseId, expense] of Object.entries(expenses)) {
      const updatedExpense = { ...expense }
      
      // Replace in 'by' field
      if (updatedExpense.by === dummyId) {
        updatedExpense.by = userId
        updatedExpense.byName = userName
      }

      // Replace in 'for' array
      if (Array.isArray(updatedExpense.for)) {
        updatedExpense.for = updatedExpense.for.map(id => id === dummyId ? userId : id)
      }

      // Replace in details object keys
      if (updatedExpense.details && updatedExpense.details[dummyId] !== undefined) {
        const amount = updatedExpense.details[dummyId]
        delete updatedExpense.details[dummyId]
        updatedExpense.details[userId] = amount
      }

      updates[`groups/${groupId}/expenses/${expenseId}`] = updatedExpense
    }

    // Update settlements
    const settlements = group.settlements || {}
    for (const [settlementId, settlement] of Object.entries(settlements)) {
      const updatedSettlement = { ...settlement }
      
      if (updatedSettlement.from === dummyId) {
        updatedSettlement.from = userId
        updatedSettlement.fromName = userName
      }
      if (updatedSettlement.to === dummyId) {
        updatedSettlement.to = userId
        updatedSettlement.toName = userName
      }

      updates[`groups/${groupId}/settlements/${settlementId}`] = updatedSettlement
    }

    // Update summary balances
    const balances = group.summary?.balances || {}
    if (balances[dummyId] !== undefined) {
      balances[userId] = balances[dummyId]
      delete balances[dummyId]
      updates[`groups/${String(groupId)}/summary/balances`] = balances
    }

    // Add to member history
    const historyId = push(ref(rtdb, `groups/${String(groupId)}/memberHistory`)).key
    updates[`groups/${String(groupId)}/memberHistory/${String(historyId)}`] = {
      action: 'dummy_linked',
      dummyId,
      dummyName: dummy.name,
      linkedToUserId: userId,
      linkedToUserName: userName,
      linkedAt: now,
      originallyCreatedBy: dummy.createdBy
    }

    // Update user's group reference with activity timestamp
    updates[`users/${String(userId)}/groups/${String(groupId)}`] = {
      lastActivityAt: now
    }

    await update(ref(rtdb), updates)

    return {
      success: true,
      userId,
      member: realMember
    }
  } catch (error) {
    debugError('Error claiming dummy member', error)
    throw error
  }
}

/**
 * Get group details
 */
export const getGroup = async (groupId) => {
  try {
    const groupRef = ref(rtdb, `groups/${groupId}`)
    const groupSnapshot = await get(groupRef)

    if (!groupSnapshot.exists()) {
      throw new Error('Group not found')
    }

    return groupSnapshot.val()
  } catch (error) {
    debugError('Error fetching group', error)
    throw error
  }
}

/**
 * Get group members
 */
export const getGroupMembers = async (groupId) => {
  try {
    const membersRef = ref(rtdb, `groups/${groupId}/members`)
    const membersSnapshot = await get(membersRef)

    if (!membersSnapshot.exists()) {
      return {}
    }

    return membersSnapshot.val()
  } catch (error) {
    debugError('Error fetching members', error)
    throw error
  }
}

/**
 * Get available (unclaimed) dummy members for join flow
 */
export const getAvailableDummyMembers = async (groupId) => {
  try {
    const members = await getGroupMembers(groupId)
    return Object.entries(members || {})
      .filter(([, member]) => member.type === 'dummy')
      .map(([id, member]) => ({ id, ...member }))
  } catch (error) {
    debugError('Error fetching available dummy members', error)
    throw error
  }
}

/**
 * Update group info
 * Owner and admins can update group details (name, description)
 */
export const updateGroupInfo = async (groupId, userId, updates) => {
  try {
    // Verify group exists and fetch member info
    const groupRef = ref(rtdb, `groups/${groupId}`)
    const groupSnapshot = await get(groupRef)

    if (!groupSnapshot.exists()) {
      throw new Error('Group not found')
    }

    const group = groupSnapshot.val()
    
    // Check if user is owner or admin
    const isOwner = group.owner === userId
    const userMember = group.members?.[userId]
    const isAdmin = userMember?.role === 'admin'
    
    if (!isOwner && !isAdmin) {
      throw new Error('Only group owner or admin can update group info')
    }

    const updatedGroup = { ...group, ...updates }
    const updateData = {}
    updateData[`groups/${String(groupId)}`] = updatedGroup

    // Note: No longer syncing name/role to users/{userId}/groups/ since it only stores group ID
    if (updates.name) {
      debugLog('Group name updated (no denormalization needed)', { 
        groupId, 
        newName: updates.name,
        updatedBy: userId,
        isAdmin
      })
    }

    await update(ref(rtdb), updateData)

    debugLog('Group info updated successfully', { groupId, updates, updatedBy: userId, isAdmin })
    return { success: true }
  } catch (error) {
    debugError('Error updating group', error)
    throw error
  }
}

export const joinGroupByInviteCode = async (inviteCode, userId, userData) => {
  try {
    if (!inviteCode || !userId) {
      throw new Error('Invite code and user ID are required')
    }

    // Validate code format
    const normalizedCode = inviteCode.toUpperCase()
    if (!/^[A-Z0-9]{6}$/.test(normalizedCode)) {
      throw new Error('Invalid invite code format')
    }

    debugLog('Attempting to join group with code', { inviteCode: normalizedCode, userId })

    // EFFICIENT: Direct lookup using reverse index - O(1) instead of O(n)
    const inviteCodeRef = ref(rtdb, `inviteCodes/${normalizedCode}`)
    const inviteSnapshot = await get(inviteCodeRef)

    if (!inviteSnapshot.exists()) {
      throw new Error('Invalid invite code. This code does not exist.')
    }

    const groupId = inviteSnapshot.val()
    debugLog('Found groupId from invite code', { groupId })

    // Now fetch the group to verify it exists and check membership
    const groupRef = ref(rtdb, `groups/${groupId}`)
    const groupSnapshot = await get(groupRef)

    if (!groupSnapshot.exists()) {
      throw new Error('Group no longer exists (code is invalid)')
    }

    const group = groupSnapshot.val()

    // Check if user is already a member
    if (group.members?.[userId]) {
      throw new Error('You are already a member of this group')
    }

    // Prepare new member data
    const now = Date.now()
    const newMember = {
      type: 'real',
      name: userData?.displayName || 'Member',
      email: userData?.email || '',
      photo: userData?.photoURL || null,
      role: 'member',
      joinedAt: now
    }

    // Batch updates
    const updates = {}
    updates[`groups/${String(groupId)}/members/${String(userId)}`] = newMember
    updates[`groups/${String(groupId)}/summary/memberCount`] = (Object.keys(group.members || {}).length) + 1
    updates[`groups/${String(groupId)}/summary/balances/${String(userId)}`] = 0
    updates[`users/${String(userId)}/groups/${String(groupId)}`] = {
      lastActivityAt: now
    }

    const historyId = push(ref(rtdb, `groups/${String(groupId)}/memberHistory`)).key
    updates[`groups/${String(groupId)}/memberHistory/${String(historyId)}`] = {
      action: 'joined',
      memberId: userId,
      memberName: userData?.displayName || 'Member',
      timestamp: now
    }

    await update(ref(rtdb), updates)

    debugLog('Successfully joined group', { groupId, userId, groupName: group.name })

    return {
      success: true,
      groupId,
      groupName: group.name
    }
  } catch (error) {
    debugError('Error joining group with invite code', error)
    throw error
  }
}

export const joinGroupById = async (groupId, userId, userData) => {
  try {
    if (!groupId || !userId) {
      throw new Error('Group ID and user ID are required')
    }

    debugLog('Attempting to join group by ID', { groupId, userId })

    const groupRef = ref(rtdb, `groups/${groupId}`)
    const groupSnapshot = await get(groupRef)

    if (!groupSnapshot.exists()) {
      throw new Error('Group not found')
    }

    const group = groupSnapshot.val()

    // Check if user is already a member
    if (group.members?.[userId]) {
      throw new Error('You are already a member of this group')
    }

    // Prepare new member data
    const now = Date.now()
    const newMember = {
      type: 'real',
      name: userData?.displayName || 'Member',
      email: userData?.email || '',
      photo: userData?.photoURL || null,
      role: 'member',
      joinedAt: now
    }

    // Batch updates
    const updates = {}
    updates[`groups/${String(groupId)}/members/${String(userId)}`] = newMember
    updates[`groups/${String(groupId)}/summary/memberCount`] = (Object.keys(group.members || {}).length) + 1
    updates[`groups/${String(groupId)}/summary/balances/${String(userId)}`] = 0
    updates[`users/${String(userId)}/groups/${String(groupId)}`] = {
      lastActivityAt: now
    }

    await update(ref(rtdb), updates)

    debugLog('Successfully joined group', { groupId, userId })

    return {
      success: true,
      groupId,
      groupName: group.name
    }
  } catch (error) {
    debugError('Error joining group by ID', error)
    throw error
  }
}

/**
 * Leave a group as a member
 * Removes user from group's members and removes group from user's groups list
 */
export const leaveGroup = async (groupId, userId) => {
  try {
    if (!groupId || !userId) {
      throw new Error('Group ID and user ID are required')
    }

    debugLog('Attempting to leave group', { groupId, userId })

    // Check if user is actually a member
    const groupRef = ref(rtdb, `groups/${groupId}`)
    const groupSnapshot = await get(groupRef)

    if (!groupSnapshot.exists()) {
      throw new Error('Group not found')
    }

    const group = groupSnapshot.val()

    if (!group.members?.[userId]) {
      throw new Error('You are not a member of this group')
    }

    // Cannot leave if you're the owner
    if (group.owner === userId) {
      throw new Error('Group owner cannot leave. Please transfer ownership or delete the group.')
    }

    // Prepare batch update to remove user from group
    const updates = {}
    
    // Remove user from group's members
    updates[`groups/${String(groupId)}/members/${String(userId)}`] = null
    
    // Remove group from user's groups
    updates[`users/${String(userId)}/groups/${String(groupId)}`] = null
    
    // Update member count in summary
    const currentMemberCount = Object.keys(group.members || {}).length
    updates[`groups/${String(groupId)}/summary/memberCount`] = Math.max(0, currentMemberCount - 1)
    
    // Remove user's balance from summary
    updates[`groups/${String(groupId)}/summary/balances/${String(userId)}`] = null

    // Record in member history
    const historyId = push(ref(rtdb, 'dummy')).key
    updates[`groups/${String(groupId)}/memberHistory/${historyId}`] = {
      action: 'member_left',
      memberId: userId,
      memberName: group.members[userId]?.name || 'Unknown',
      leftAt: Date.now()
    }

    await update(ref(rtdb), updates)

    debugLog('Successfully left group', { groupId, userId })

    return {
      success: true,
      groupId,
      groupName: group.name
    }
  } catch (error) {
    debugError('Error leaving group', error)
    throw error
  }
}

/**
 * Delete a group (owner only)
 * Removes group and all associated data
 */
export const deleteGroup = async (groupId, userId) => {
  try {
    if (!groupId || !userId) {
      throw new Error('Group ID and user ID are required')
    }

    debugLog('Attempting to delete group', { groupId, userId })

    // Get group data to verify ownership
    const groupRef = ref(rtdb, `groups/${groupId}`)
    const groupSnapshot = await get(groupRef)

    if (!groupSnapshot.exists()) {
      throw new Error('Group not found')
    }

    const group = groupSnapshot.val()

    // Verify user is owner
    if (group.owner !== userId && group.createdBy !== userId) {
      throw new Error('Only group owner can delete the group')
    }

    // Delete group and all related data
    const updates = {}

    // Remove the group itself
    updates[`groups/${String(groupId)}`] = null

    // Remove group from all members' user data
    if (group.members) {
      Object.keys(group.members).forEach((memberId) => {
        updates[`users/${String(memberId)}/groups/${String(groupId)}`] = null
      })
    }

    // Remove invite code index
    if (group.inviteCode) {
      updates[`inviteCodes/${String(group.inviteCode)}`] = null
    }

    await update(ref(rtdb), updates)

    // Update owner's overall summary after deleting the group
    await updateOwnerOverallSummary(userId)

    debugLog('Successfully deleted group', { groupId, userId })

    return {
      success: true,
      groupId,
      groupName: group.name
    }
  } catch (error) {
    debugError('Error deleting group', error)
    throw error
  }
}

/**
 * Remove a member from group (owner only)
 * Removes the member and updates all related data
 */
export const removeMemberFromGroup = async (groupId, targetMemberId, ownerId) => {
  try {
    if (!groupId || !targetMemberId || !ownerId) {
      throw new Error('Group ID, member ID, and owner ID are required')
    }

    debugLog('Attempting to remove member from group', { groupId, targetMemberId, ownerId })

    // Get group data to verify ownership
    const groupRef = ref(rtdb, `groups/${groupId}`)
    const groupSnapshot = await get(groupRef)

    if (!groupSnapshot.exists()) {
      throw new Error('Group not found')
    }

    const group = groupSnapshot.val()

    // Verify user is owner
    if (group.owner !== ownerId && group.createdBy !== ownerId) {
      throw new Error('Only group owner can remove members')
    }

    // Cannot remove owner
    if (targetMemberId === group.owner || targetMemberId === group.createdBy) {
      throw new Error('Cannot remove the group owner')
    }

    // Check if member exists in the group
    if (!group.members || !group.members[targetMemberId]) {
      throw new Error('Member not found in this group')
    }

    // Get member info for logging
    const memberInfo = group.members[targetMemberId]

    // Update data to remove member
    const updates = {}

    // Remove from group members
    updates[`groups/${String(groupId)}/members/${String(targetMemberId)}`] = null

    // Remove group from member's user data (if real member)
    if (memberInfo.type === 'real') {
      updates[`users/${String(targetMemberId)}/groups/${String(groupId)}`] = null
    }

    // Update member count in summary
    const memberCount = Math.max(0, (group.summary?.memberCount || 1) - 1)
    updates[`groups/${String(groupId)}/summary/memberCount`] = memberCount

    await update(ref(rtdb), updates)

    // Update owner's overall summary after member removal
    await updateOwnerOverallSummary(ownerId)

    debugLog('Successfully removed member from group', { groupId, targetMemberId, ownerId })

    return {
      success: true,
      groupId,
      removedMemberId: targetMemberId,
      memberName: memberInfo.name
    }
  } catch (error) {
    debugError('Error removing member from group', error)
    throw error
  }
}

/**
 * Update member name by owner
 * Owner can change any member's name in the group
 */
export const updateMemberNameAsOwner = async (groupId, targetMemberId, newName, ownerId) => {
  try {
    if (!groupId || !targetMemberId || !newName || !ownerId) {
      throw new Error('Group ID, member ID, new name, and owner ID are required')
    }

    if (!newName.trim()) {
      throw new Error('Member name cannot be empty')
    }

    debugLog('Attempting to update member name as owner', { groupId, targetMemberId, ownerId })

    // Get group data to verify ownership
    const groupRef = ref(rtdb, `groups/${groupId}`)
    const groupSnapshot = await get(groupRef)

    if (!groupSnapshot.exists()) {
      throw new Error('Group not found')
    }

    const group = groupSnapshot.val()

    // Verify user is owner
    if (group.owner !== ownerId && group.createdBy !== ownerId) {
      throw new Error('Only group owner can manage member names')
    }

    // Check if target member exists in the group
    if (!group.members || !group.members[targetMemberId]) {
      throw new Error('Member not found in this group')
    }

    // Update member name
    const updates = {}
    updates[`groups/${String(groupId)}/members/${String(targetMemberId)}/name`] = newName.trim()

    await update(ref(rtdb), updates)

    debugLog('Successfully updated member name', { groupId, targetMemberId, ownerId })

    return {
      success: true,
      groupId,
      memberId: targetMemberId,
      newName: newName.trim()
    }
  } catch (error) {
    debugError('Error updating member name', error)
    throw error
  }
}

/**
 * Update member role (set/unset admin)
 * Only owner can set members as admins
 * 
 * @param {string} groupId - Group ID
 * @param {string} targetMemberId - Member to update
 * @param {boolean} isAdmin - Whether to make them admin
 * @param {string} ownerId - Current user ID (must be owner)
 */
export const updateMemberRole = async (groupId, targetMemberId, isAdmin, ownerId) => {
  try {
    if (!groupId || !targetMemberId || !ownerId) {
      throw new Error('Group ID, member ID, and owner ID are required')
    }

    debugLog('Attempting to update member role', { groupId, targetMemberId, isAdmin, ownerId })

    // Get group data to verify ownership
    const groupRef = ref(rtdb, `groups/${groupId}`)
    const groupSnapshot = await get(groupRef)

    if (!groupSnapshot.exists()) {
      throw new Error('Group not found')
    }

    const group = groupSnapshot.val()

    // Verify user is owner
    if (group.owner !== ownerId && group.createdBy !== ownerId) {
      throw new Error('Only group owner can update member roles')
    }

    // Cannot modify owner's role
    if (targetMemberId === group.owner || targetMemberId === group.createdBy) {
      throw new Error('Cannot modify owner\'s role')
    }

    // Check if member exists in the group
    if (!group.members || !group.members[targetMemberId]) {
      throw new Error('Member not found in this group')
    }

    // Get member info
    const memberInfo = group.members[targetMemberId]

    // Cannot promote dummy members to admin
    if (isAdmin && memberInfo.type === 'dummy') {
      throw new Error('Cannot promote dummy members to admin. Only real members can become admins.')
    }

    // Update member's role
    const updates = {}
    
    if (isAdmin) {
      updates[`groups/${String(groupId)}/members/${String(targetMemberId)}/role`] = 'admin'
    } else {
      updates[`groups/${String(groupId)}/members/${String(targetMemberId)}/role`] = 'member'
    }
    
    // Note: users/{userId}/groups/{groupId} now only stores group ID for simplicity

    await update(ref(rtdb), updates)

    debugLog('Successfully updated member role', { 
      groupId, 
      targetMemberId, 
      isAdmin,
      ownerId,
      syncedToUserCache: true
    })

    return {
      success: true,
      groupId,
      memberId: targetMemberId,
      isAdmin,
      memberName: memberInfo.name
    }
  } catch (error) {
    debugError('Error updating member role', error)
    throw error
  }
}

/**
 * Create a new expense record
 * Handles different split methods and updates group summary
 * 
 * @deprecated Use expenseService.createExpense instead
 */
export { createExpense } from './expenseService'

/**
 * Update group last activity timestamp for the current user
 * Call this when user opens/views the group
 * 
 * @param {string} groupId - Group ID
 * @param {string} userId - Current user ID
 */
export const updateGroupLastActivity = async (groupId, userId) => {
  try {
    if (!groupId || !userId) {
      throw new Error('Group ID and user ID are required')
    }

    const now = Date.now()
    const updateData = {}
    updateData[`users/${String(userId)}/groups/${String(groupId)}/lastActivityAt`] = now

    await update(ref(rtdb), updateData)

    debugLog('Group last activity updated', { groupId, userId, timestamp: now })
    return { success: true }
  } catch (error) {
    debugError('Error updating group last activity', error)
    // Don't throw - this is a non-critical operation
    return { success: false, error: error.message }
  }
}