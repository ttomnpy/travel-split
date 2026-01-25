import { ref, push, update, get } from 'firebase/database'
import { rtdb } from '../firebase'
import { debugLog, debugError } from '../utils/debug'
import { updateAllUserSummaries } from './groupService'

/**
 * Create a new expense record
 * Handles different split methods and multiple payers, updates group summary
 * 
 * @param {string} groupId - The group ID
 * @param {Object} expenseData - Expense data
 * @param {number} expenseData.amount - Total expense amount
 * @param {Object} expenseData.payers - Payers object: { userId: { name, amount }, ... }
 * @param {Array} expenseData.participants - Array of participant IDs
 * @param {string} expenseData.splitMethod - 'equal' | 'percentage' | 'shares' | 'exact'
 * @param {Object} expenseData.splitDetails - Split method specific details
 * @param {string} expenseData.description - Description
 * @param {string} expenseData.category - Category
 * @param {string} expenseData.currency - Currency code
 * @param {string} expenseData.date - Date (ISO string or timestamp)
 * @param {string} expenseData.location - Location
 * @returns {Promise<{success: boolean, expenseId: string}>}
 */
export const createExpense = async (groupId, expenseData) => {
  try {
    // Validate payers
    const hasPayers = expenseData.payers && Object.keys(expenseData.payers).length > 0
    
    if (!groupId || !expenseData.amount || !hasPayers) {
      throw new Error('Group ID, amount, and at least one payer are required')
    }

    debugLog('Creating expense', { 
      groupId, 
      amount: expenseData.amount, 
      payersCount: Object.keys(expenseData.payers).length 
    })

    const now = Date.now()
    const expenseId = push(ref(rtdb, 'dummy')).key

    // Normalize payers to object format
    const payers = expenseData.payers

    // Calculate splits based on split method
    let details = {}
    let splitMeta = {}
    let totalAmount = 0

    if (expenseData.splitMethod === 'equal') {
      const shareAmount = expenseData.amount / expenseData.participants.length
      expenseData.participants.forEach((participantId) => {
        details[participantId] = shareAmount
        totalAmount += shareAmount
      })
    } else if (expenseData.splitMethod === 'percentage') {
      expenseData.participants.forEach((participantId) => {
        const percentage = expenseData.splitDetails[participantId]?.percentage || 0
        const amount = (expenseData.amount * percentage) / 100
        details[participantId] = amount
        splitMeta[participantId] = { percentage }
        totalAmount += amount
      })
    } else if (expenseData.splitMethod === 'shares') {
      let totalShares = 0
      expenseData.participants.forEach((participantId) => {
        totalShares += expenseData.splitDetails[participantId]?.shares || 1
      })
      expenseData.participants.forEach((participantId) => {
        const shares = expenseData.splitDetails[participantId]?.shares || 1
        const amount = (expenseData.amount * shares) / totalShares
        details[participantId] = amount
        splitMeta[participantId] = { shares }
        totalAmount += amount
      })
    } else if (expenseData.splitMethod === 'exact') {
      expenseData.participants.forEach((participantId) => {
        const amount = expenseData.splitDetails[participantId]?.amount || 0
        details[participantId] = amount
        totalAmount += amount
      })
    }

    // Parse date to timestamp
    let dateTimestamp = now
    if (expenseData.date) {
      if (typeof expenseData.date === 'string') {
        // ISO string like "2026-01-24"
        dateTimestamp = new Date(expenseData.date).getTime()
      } else if (typeof expenseData.date === 'number') {
        dateTimestamp = expenseData.date
      }
    }

    // Create expense object following new schema
    const expense = {
      description: expenseData.description || '',
      amount: expenseData.amount,
      category: expenseData.category || 'other',
      payers: Object.keys(payers).reduce((acc, payerId) => {
        acc[String(payerId)] = {
          name: payers[payerId].name,
          amount: payers[payerId].amount
        }
        return acc
      }, {}),
      participants: expenseData.participants.map(String),
      splitMethod: expenseData.splitMethod,
      splitDetails: details,
      date: dateTimestamp,
      createdAt: now,
    }

    // Add optional fields
    if (expenseData.location) {
      expense.location = expenseData.location
    }

    if (expenseData.currency) {
      expense.currency = expenseData.currency
    }

    if (Object.keys(splitMeta).length > 0) {
      expense.splitMeta = splitMeta
    }

    // Get current group data to update summary
    const groupRef = ref(rtdb, `groups/${String(groupId)}`)
    const groupSnapshot = await get(groupRef)

    if (!groupSnapshot.exists()) {
      throw new Error('Group not found')
    }

    const group = groupSnapshot.val()
    const currentSummary = group.summary || {}

    // Update balances
    const updatedBalances = { ...currentSummary.balances }

    // Add amounts to each payer's balance (they gave money)
    Object.entries(payers).forEach(([payerId, payerInfo]) => {
      updatedBalances[payerId] = (updatedBalances[payerId] || 0) + payerInfo.amount
    })

    // Subtract amounts from each participant's balance (they owe money)
    Object.entries(details).forEach(([participantId, amount]) => {
      updatedBalances[participantId] = (updatedBalances[participantId] || 0) - amount
    })

    // Calculate total balance for summary (net of all members)
    let totalBalance = 0
    Object.values(updatedBalances).forEach((balance) => {
      if (balance > 0) totalBalance += balance
    })

    // Batch updates
    const updates = {}
    updates[`groups/${String(groupId)}/expenses/${String(expenseId)}`] = expense
    updates[`groups/${String(groupId)}/summary/totalExpenses`] = (currentSummary.totalExpenses || 0) + expenseData.amount
    updates[`groups/${String(groupId)}/summary/expenseCount`] = (currentSummary.expenseCount || 0) + 1
    updates[`groups/${String(groupId)}/summary/lastExpenseAt`] = now
    updates[`groups/${String(groupId)}/summary/balances`] = updatedBalances
    updates[`groups/${String(groupId)}/summary/totalBalance`] = totalBalance

    await update(ref(rtdb), updates)

    // Update summaries for ALL users involved in this expense (payers + participants)
    try {
      await updateAllUserSummaries(groupId, {
        amount: expenseData.amount,
        payers: expenseData.payers,
        participants: expenseData.participants,
        splitDetails: details
      })
      debugLog('All user summaries updated for expense', { groupId, expenseId })
    } catch (summaryError) {
      debugError('Failed to update user summaries', summaryError)
      // Don't throw - expense was already created successfully
    }

    debugLog('Expense created successfully', { groupId, expenseId, amount: expenseData.amount })

    return {
      success: true,
      expenseId,
    }
  } catch (error) {
    debugError('Error creating expense', error)
    throw error
  }
}

/**
 * Delete an expense record and revert user summaries
 * 
 * @param {string} groupId - The group ID
 * @param {string} expenseId - The expense ID to delete
 * @param {Object} expense - The expense object with payers, participants, and amount
 * @returns {Promise<{success: boolean}>}
 */
export const deleteExpense = async (groupId, expenseId, expense) => {
  try {
    if (!groupId || !expenseId || !expense) {
      throw new Error('Group ID, expense ID, and expense data are required')
    }

    debugLog('Deleting expense', { groupId, expenseId, amount: expense.amount })

    // Get current group data
    const groupRef = ref(rtdb, `groups/${String(groupId)}`)
    const groupSnapshot = await get(groupRef)

    if (!groupSnapshot.exists()) {
      throw new Error('Group not found')
    }

    const group = groupSnapshot.val()
    const currentSummary = group.summary || {}

    // Revert balances
    const updatedBalances = { ...currentSummary.balances }

    // Subtract payer amounts
    Object.entries(expense.payers || {}).forEach(([payerId, payerInfo]) => {
      updatedBalances[payerId] = (updatedBalances[payerId] || 0) - payerInfo.amount
    })

    // Add participant amounts back
    Object.entries(expense.splitDetails || {}).forEach(([participantId, amount]) => {
      updatedBalances[participantId] = (updatedBalances[participantId] || 0) + amount
    })

    // Calculate total balance
    let totalBalance = 0
    Object.values(updatedBalances).forEach((balance) => {
      if (balance > 0) totalBalance += balance
    })

    // Batch delete and update
    const updates = {}
    updates[`groups/${String(groupId)}/expenses/${String(expenseId)}`] = null
    updates[`groups/${String(groupId)}/summary/totalExpenses`] = Math.max(0, (currentSummary.totalExpenses || 0) - expense.amount)
    updates[`groups/${String(groupId)}/summary/expenseCount`] = Math.max(0, (currentSummary.expenseCount || 0) - 1)
    updates[`groups/${String(groupId)}/summary/balances`] = updatedBalances
    updates[`groups/${String(groupId)}/summary/totalBalance`] = totalBalance

    await update(ref(rtdb), updates)

    // Revert summaries for all users involved
    try {
      await revertUserSummariesForExpense(groupId, {
        amount: expense.amount,
        payers: expense.payers,
        participants: expense.participants,
        splitDetails: expense.splitDetails
      })
      debugLog('User summaries reverted for deleted expense', { groupId, expenseId })
    } catch (summaryError) {
      debugError('Failed to revert user summaries', summaryError)
      // Don't throw - expense was already deleted successfully
    }

    debugLog('Expense deleted successfully', { groupId, expenseId })

    return {
      success: true
    }
  } catch (error) {
    debugError('Error deleting expense', error)
    throw error
  }
}

/**
 * Revert user summaries after expense deletion
 */
const revertUserSummariesForExpense = async (groupId, expenseData) => {
  try {
    const payerIds = Object.keys(expenseData.payers || {})
    const participantIds = expenseData.participants || []
    const allUserIds = new Set([...payerIds, ...participantIds])

    const updates = {}

    for (const userId of allUserIds) {
      try {
        const userSummaryRef = ref(rtdb, `userSummaries/${String(userId)}`)
        const userSummarySnapshot = await get(userSummaryRef)

        if (!userSummarySnapshot.exists()) {
          continue
        }

        const currentSummary = userSummarySnapshot.val()
        let amountOwed = 0
        let amountReceivable = 0

        if (payerIds.includes(userId)) {
          amountReceivable = expenseData.payers[userId]?.amount || 0
        }

        if (participantIds.includes(userId)) {
          amountOwed = expenseData.splitDetails[userId] || 0
        }

        updates[`userSummaries/${String(userId)}`] = {
          totalExpenseAmount: Math.max(0, (currentSummary.totalExpenseAmount || 0) - expenseData.amount),
          totalAmountOwed: Math.max(0, (currentSummary.totalAmountOwed || 0) - amountOwed),
          totalAmountReceivable: Math.max(0, (currentSummary.totalAmountReceivable || 0) - amountReceivable),
          lastUpdated: Date.now()
        }

        debugLog('Calculated user summary revert', {
          userId,
          amountOwed,
          amountReceivable
        })
      } catch (userError) {
        debugError('Error reverting summary for user', { userId, error: userError.message })
      }
    }

    if (Object.keys(updates).length > 0) {
      await update(ref(rtdb), updates)
      debugLog('All user summaries reverted successfully')
    }
  } catch (error) {
    debugError('Error reverting user summaries', error)
    throw error
  }
}
