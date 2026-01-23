import { ref, set, update, push, get } from 'firebase/database'
import { rtdb } from '../firebase'
import { debugLog, debugError } from '../utils/debug'

/**
 * Generate unique 6-character invite code
 * Excludes ambiguous characters: O, I, l, 1, 0
 */
export const generateInviteCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
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

    const inviteCode = generateInviteCode()
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
          name: groupData.creatorName || 'Owner',
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

    // Batch update: write group + add to user's groups
    const updates = {}
    updates[`groups/${groupId}`] = newGroup
    updates[`users/${userId}/groups/${groupId}`] = {
      name: newGroup.name,
      role: 'owner',
      lastActivity: now,
      unreadCount: 0
    }

    await update(ref(rtdb), updates)

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
    updates[`groups/${groupId}/members/${dummyId}`] = newMember
    updates[`groups/${groupId}/summary/memberCount`] = (group.summary?.memberCount || 1) + 1
    updates[`groups/${groupId}/summary/balances/${dummyId}`] = 0

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
export const claimDummyMember = async (groupId, dummyId, userId, userName) => {
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
      email: '',
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
      updates[`groups/${groupId}/summary/balances`] = balances
    }

    // Add to member history
    const historyId = push(ref(rtdb, `groups/${groupId}/memberHistory`)).key
    updates[`groups/${groupId}/memberHistory/${historyId}`] = {
      action: 'dummy_linked',
      dummyId,
      dummyName: dummy.name,
      linkedToUserId: userId,
      linkedToUserName: userName,
      linkedAt: now,
      originallyCreatedBy: dummy.createdBy
    }

    // Update user's group reference
    updates[`users/${userId}/groups/${groupId}`] = {
      name: group.name,
      role: realMember.role,
      lastActivity: now,
      unreadCount: 0
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
      .filter(([_, member]) => member.type === 'dummy')
      .map(([id, member]) => ({ id, ...member }))
  } catch (error) {
    debugError('Error fetching available dummy members', error)
    throw error
  }
}

/**
 * Update group info
 */
export const updateGroupInfo = async (groupId, userId, updates) => {
  try {
    // Verify user is owner
    const groupRef = ref(rtdb, `groups/${groupId}`)
    const groupSnapshot = await get(groupRef)

    if (!groupSnapshot.exists()) {
      throw new Error('Group not found')
    }

    const group = groupSnapshot.val()
    if (group.owner !== userId) {
      throw new Error('Only group owner can update group info')
    }

    const updateData = {}
    updateData[`groups/${groupId}`] = { ...group, ...updates }

    await update(ref(rtdb), updateData)

    return { success: true }
  } catch (error) {
    debugError('Error updating group', error)
    throw error
  }
}
