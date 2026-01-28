import { ref, push, update, get, set } from 'firebase/database'
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
 * @param {string} currentUserId - User ID who created the expense
 * @returns {Promise<{success: boolean, expenseId: string}>}
 */
export const createExpense = async (groupId, expenseData, currentUserId) => {
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
    // Payer bears the rounding difference
    let details = {}
    let splitMeta = {}
    let totalAmount = 0
    const payerIds = Object.keys(expenseData.payers || {})
    const nonPayerParticipants = expenseData.participants.filter(id => !payerIds.includes(id))

    if (expenseData.splitMethod === 'equal') {
      // Calculate non-payer participants first
      const nonPayerAmount = Math.floor((expenseData.amount * 100) / expenseData.participants.length) / 100
      nonPayerParticipants.forEach((participantId) => {
        details[participantId] = nonPayerAmount
        totalAmount += nonPayerAmount
      })
      // Payers split the remaining amount equally
      const payerCount = payerIds.length
      if (payerCount > 0) {
        const payerBaseAmount = Math.floor(((expenseData.amount - totalAmount) * 100) / payerCount) / 100
        payerIds.forEach((payerId, index) => {
          let amount = payerBaseAmount
          // Last payer bears rounding difference
          if (index === payerCount - 1) {
            amount = Math.round((expenseData.amount - totalAmount - payerBaseAmount * (payerCount - 1)) * 100) / 100
          }
          details[payerId] = amount
          totalAmount += amount
        })
      }
    } else if (expenseData.splitMethod === 'percentage') {
      // Calculate non-payer participants first with their percentages
      expenseData.participants.forEach((participantId) => {
        if (!payerIds.includes(participantId)) {
          const percentage = expenseData.splitDetails[participantId]?.percentage || 0
          const amount = Math.round((expenseData.amount * percentage) / 100 * 100) / 100
          details[participantId] = amount
          splitMeta[participantId] = { percentage }
          totalAmount += amount
        }
      })
      // Payers split the remaining amount by their percentage
      const payerCount = payerIds.length
      if (payerCount > 0) {
        let payerTotalPercentage = 0
        payerIds.forEach((payerId) => {
          payerTotalPercentage += expenseData.splitDetails[payerId]?.percentage || 0
        })
        payerIds.forEach((payerId, index) => {
          const percentage = expenseData.splitDetails[payerId]?.percentage || 0
          let amount = Math.round(((expenseData.amount - totalAmount) * percentage) / payerTotalPercentage * 100) / 100
          // Last payer bears rounding difference
          if (index === payerCount - 1) {
            const paidByPreviousPayers = Object.entries(details)
              .filter(([id]) => payerIds.includes(id) && payerIds.indexOf(id) < index)
              .reduce((sum, [_, val]) => sum + val, 0)
            amount = Math.round((expenseData.amount - totalAmount - paidByPreviousPayers) * 100) / 100
          }
          details[payerId] = amount
          splitMeta[payerId] = { percentage }
          totalAmount += amount
        })
      }
    } else if (expenseData.splitMethod === 'shares') {
      let totalShares = 0
      expenseData.participants.forEach((participantId) => {
        totalShares += expenseData.splitDetails[participantId]?.shares || 1
      })
      // Calculate non-payer participants first
      nonPayerParticipants.forEach((participantId) => {
        const shares = expenseData.splitDetails[participantId]?.shares || 1
        const amount = Math.round((expenseData.amount * shares) / totalShares * 100) / 100
        details[participantId] = amount
        splitMeta[participantId] = { shares }
        totalAmount += amount
      })
      // Payers split the remaining amount by their shares
      const payerCount = payerIds.length
      if (payerCount > 0) {
        let payerTotalShares = 0
        payerIds.forEach((payerId) => {
          payerTotalShares += expenseData.splitDetails[payerId]?.shares || 1
        })
        payerIds.forEach((payerId, index) => {
          const shares = expenseData.splitDetails[payerId]?.shares || 1
          let amount = Math.round(((expenseData.amount - totalAmount) * shares) / payerTotalShares * 100) / 100
          // Last payer bears rounding difference
          if (index === payerCount - 1) {
            const paidByPreviousPayers = Object.entries(details)
              .filter(([id]) => payerIds.includes(id) && payerIds.indexOf(id) < index)
              .reduce((sum, [_, val]) => sum + val, 0)
            amount = Math.round((expenseData.amount - totalAmount - paidByPreviousPayers) * 100) / 100
          }
          details[payerId] = amount
          splitMeta[payerId] = { shares }
          totalAmount += amount
        })
      }
    } else if (expenseData.splitMethod === 'exact') {
      // Calculate non-payer participants first
      nonPayerParticipants.forEach((participantId) => {
        const amount = Math.round((expenseData.splitDetails[participantId]?.amount || 0) * 100) / 100
        details[participantId] = amount
        totalAmount += amount
      })
      // Payers split the remaining amount
      const payerCount = payerIds.length
      if (payerCount > 0) {
        payerIds.forEach((payerId, index) => {
          let amount = Math.round((expenseData.splitDetails[payerId]?.amount || 0) * 100) / 100
          // Last payer bears rounding difference
          if (index === payerCount - 1) {
            const paidByPreviousPayers = Object.entries(details)
              .filter(([id]) => payerIds.includes(id) && payerIds.indexOf(id) < index)
              .reduce((sum, [_, val]) => sum + val, 0)
            amount = Math.round((expenseData.amount - totalAmount - paidByPreviousPayers) * 100) / 100
          }
          details[payerId] = amount
          totalAmount += amount
        })
      }
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
      createdBy: String(currentUserId)
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
    // Round to 2 decimal places to avoid floating point errors
    Object.entries(payers).forEach(([payerId, payerInfo]) => {
      const roundedAmount = Math.round(payerInfo.amount * 100) / 100
      updatedBalances[payerId] = Math.round(((updatedBalances[payerId] || 0) + roundedAmount) * 100) / 100
    })

    // Subtract amounts from each participant's balance (they owe money)
    // Round to 2 decimal places to avoid floating point errors
    Object.entries(details).forEach(([participantId, amount]) => {
      const roundedAmount = Math.round(amount * 100) / 100
      updatedBalances[participantId] = Math.round(((updatedBalances[participantId] || 0) - roundedAmount) * 100) / 100
    })

    // Batch updates
    const updates = {}
    updates[`groups/${String(groupId)}/expenses/${String(expenseId)}`] = expense
    updates[`groups/${String(groupId)}/summary/totalExpenses`] = (currentSummary.totalExpenses || 0) + expenseData.amount
    updates[`groups/${String(groupId)}/summary/expenseCount`] = (currentSummary.expenseCount || 0) + 1
    updates[`groups/${String(groupId)}/summary/lastExpenseAt`] = now
    updates[`groups/${String(groupId)}/summary/balances`] = updatedBalances

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

    debugLog('Current balances before revert', { 
      balances: updatedBalances,
      payers: expense.payers,
      splitDetails: expense.splitDetails
    })

    // Subtract payer amounts (they paid, so we need to reverse that)
    Object.entries(expense.payers || {}).forEach(([payerId, payerInfo]) => {
      const amount = Math.round(payerInfo.amount * 100) / 100
      updatedBalances[payerId] = Math.round(((updatedBalances[payerId] || 0) - amount) * 100) / 100
      debugLog('Reverted payer balance', { payerId, amount, newBalance: updatedBalances[payerId] })
    })

    // Add participant amounts back (they owed, so we need to reverse that)
    Object.entries(expense.splitDetails || {}).forEach(([participantId, amount]) => {
      const roundedAmount = Math.round(amount * 100) / 100
      updatedBalances[participantId] = Math.round(((updatedBalances[participantId] || 0) + roundedAmount) * 100) / 100
      debugLog('Reverted participant balance', { participantId, amount: roundedAmount, newBalance: updatedBalances[participantId] })
    })

    debugLog('Updated balances after revert', { balances: updatedBalances })

    // Batch delete and update
    const updates = {}
    updates[`groups/${String(groupId)}/expenses/${String(expenseId)}`] = null
    updates[`groups/${String(groupId)}/summary/totalExpenses`] = Math.max(0, (currentSummary.totalExpenses || 0) - expense.amount)
    updates[`groups/${String(groupId)}/summary/expenseCount`] = Math.max(0, (currentSummary.expenseCount || 0) - 1)
    updates[`groups/${String(groupId)}/summary/balances`] = updatedBalances

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
          amountReceivable = Math.round((expenseData.payers[userId]?.amount || 0) * 100) / 100
        }

        if (participantIds.includes(userId)) {
          amountOwed = Math.round((expenseData.splitDetails[userId] || 0) * 100) / 100
        }

        const newAmountOwed = Math.max(0, Math.round(((currentSummary.totalAmountOwed || 0) - amountOwed) * 100) / 100)
        const newAmountReceivable = Math.max(0, Math.round(((currentSummary.totalAmountReceivable || 0) - amountReceivable) * 100) / 100)
        const totalBalance = Math.round((newAmountReceivable - newAmountOwed) * 100) / 100

        updates[`userSummaries/${String(userId)}`] = {
          totalAmountOwed: newAmountOwed,
          totalAmountReceivable: newAmountReceivable,
          totalBalance: totalBalance,
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

/**
 * Calculate settlements - who needs to pay whom and how much
 * Uses a greedy algorithm to minimize the number of transactions
 * 
 * @param {Object} group - Group object with members and expenses
 * @returns {Array} Array of settlement objects { from, to, amount }
 */
export const calculateSettlements = (group) => {
  if (!group?.members) {
    return []
  }

  try {
    // Use group/summary/balances directly (already accounts for all expenses and settlements)
    const balances = group.summary?.balances || {}
    const memberNames = {}

    // Initialize member names
    Object.keys(group.members).forEach(memberId => {
      memberNames[memberId] = group.members[memberId].name || 'Unknown'
    })

    // Filter out members with zero balance
    const debtors = [] // People who owe money (negative balance)
    const creditors = [] // People who are owed money (positive balance)

    Object.entries(balances).forEach(([userId, balance]) => {
      const roundedBalance = Math.round(balance * 100) / 100 // Round to 2 decimals
      if (roundedBalance < -0.01) {
        debtors.push({ userId, amount: Math.abs(roundedBalance), name: memberNames[userId] })
      } else if (roundedBalance > 0.01) {
        creditors.push({ userId, amount: roundedBalance, name: memberNames[userId] })
      }
    })

    // Sort for consistent ordering
    debtors.sort((a, b) => b.amount - a.amount)
    creditors.sort((a, b) => b.amount - a.amount)

    // Greedy algorithm to match debtors with creditors
    const settlements = []
    let debtorIdx = 0
    let creditorIdx = 0

    while (debtorIdx < debtors.length && creditorIdx < creditors.length) {
      const debtor = debtors[debtorIdx]
      const creditor = creditors[creditorIdx]

      // Calculate the amount to settle - round to 2 decimal places
      const settleAmount = Math.round(Math.min(debtor.amount, creditor.amount) * 100) / 100

      settlements.push({
        from: debtor.userId,
        fromName: debtor.name,
        to: creditor.userId,
        toName: creditor.name,
        amount: settleAmount
      })

      // Update remaining amounts (round to avoid floating point errors)
      debtor.amount = Math.round((debtor.amount - settleAmount) * 100) / 100
      creditor.amount = Math.round((creditor.amount - settleAmount) * 100) / 100

      // Move to next debtor or creditor if settled
      if (debtor.amount < 0.01) debtorIdx++
      if (creditor.amount < 0.01) creditorIdx++
    }

    debugLog('Settlements calculated', { count: settlements.length, settlements })
    return settlements
  } catch (error) {
    debugError('Error calculating settlements', error)
    return []
  }
}

/**
 * Record a settlement payment between two group members
 * This allows users to manually log who paid whom
 * 
 * @param {string} groupId - The group ID
 * @param {Object} settlementData - Settlement data
 * @param {string} settlementData.from - User ID of payer
 * @param {string} settlementData.to - User ID of recipient
 * @param {number} settlementData.amount - Amount paid
 * @param {string} settlementData.paymentMethod - Payment method (optional)
 * @param {string} settlementData.remarks - Remarks/notes (optional)
 * @param {string} settlementData.date - Date of payment (optional)
 * @param {string} currentUserId - User ID of the person recording
 * @returns {Promise<void>}
 */
export const recordSettlement = async (groupId, settlementData, currentUserId) => {
  try {
    if (!groupId || !settlementData.from || !settlementData.to || !settlementData.amount) {
      throw new Error('Missing required settlement fields')
    }

    debugLog('Recording settlement payment', {
      groupId,
      from: settlementData.from,
      to: settlementData.to,
      amount: settlementData.amount
    })

    const now = Date.now()
    const settlementRecord = {
      from: settlementData.from,
      to: settlementData.to,
      amount: settlementData.amount,
      paymentMethod: settlementData.paymentMethod || 'cash',
      remarks: settlementData.remarks || '',
      date: settlementData.date || new Date().toISOString().split('T')[0],
      recordedBy: currentUserId,
      recordedAt: now
    }

    // Generate unique ID for this settlement record (using Firebase key format)
    const recordId = push(ref(rtdb, 'dummy')).key

    // Get the settlement records object
    const recordsRef = ref(rtdb, `groups/${groupId}/settlementRecords`)
    const recordsSnapshot = await get(recordsRef)
    
    let records = {}
    if (recordsSnapshot.exists()) {
      records = recordsSnapshot.val()
    }

    // Add new record with unique ID
    records[recordId] = settlementRecord

    // Get current group data to update balances
    const groupRef = ref(rtdb, `groups/${groupId}`)
    const groupSnapshot = await get(groupRef)

    if (!groupSnapshot.exists()) {
      throw new Error('Group not found')
    }

    const group = groupSnapshot.val()
    const currentSummary = group.summary || {}
    const updatedBalances = { ...currentSummary.balances }


    const payerBalance = updatedBalances[settlementData.from] || 0
    const recipientBalance = updatedBalances[settlementData.to] || 0

    // Payer pays money, so reduces their deficit (negative balance becomes less negative, moves toward positive)
    updatedBalances[settlementData.from] = Math.round((payerBalance + settlementData.amount) * 100) / 100

    // Recipient receives money, so reduces their credit (positive balance becomes less positive, moves toward zero)
    updatedBalances[settlementData.to] = Math.round((recipientBalance - settlementData.amount) * 100) / 100

    // Batch update: settlement records + group balances (no totalBalance - it's calculated from balances when needed)
    const updates = {}
    updates[`groups/${groupId}/settlementRecords`] = records
    updates[`groups/${groupId}/summary/balances`] = updatedBalances
    updates[`groups/${groupId}/summary/lastSettlementAt`] = now

    // Also update user summaries for payer and recipient
    // Payer's owed amount decreases (they paid money)
    const payerSummaryRef = ref(rtdb, `userSummaries/${settlementData.from}`)
    const payerSummarySnapshot = await get(payerSummaryRef)
    if (payerSummarySnapshot.exists()) {
      const payerSummary = payerSummarySnapshot.val()
      const newAmountOwed = Math.round(((payerSummary.totalAmountOwed || 0) - settlementData.amount) * 100) / 100
      const amountReceivable = payerSummary.totalAmountReceivable || 0
      // totalBalance = totalAmountReceivable - totalAmountOwed (net balance across all groups)
      const totalBalance = Math.round((amountReceivable - newAmountOwed) * 100) / 100
      updates[`userSummaries/${settlementData.from}/totalAmountOwed`] = Math.max(0, newAmountOwed)
      updates[`userSummaries/${settlementData.from}/totalBalance`] = totalBalance
      updates[`userSummaries/${settlementData.from}/lastUpdated`] = now
    }

    // Recipient's receivable amount decreases (they received money)
    const recipientSummaryRef = ref(rtdb, `userSummaries/${settlementData.to}`)
    const recipientSummarySnapshot = await get(recipientSummaryRef)
    if (recipientSummarySnapshot.exists()) {
      const recipientSummary = recipientSummarySnapshot.val()
      const newAmountReceivable = Math.round(((recipientSummary.totalAmountReceivable || 0) - settlementData.amount) * 100) / 100
      const amountOwed = recipientSummary.totalAmountOwed || 0
      // totalBalance = totalAmountReceivable - totalAmountOwed (net balance across all groups)
      const totalBalance = Math.round((newAmountReceivable - amountOwed) * 100) / 100
      updates[`userSummaries/${settlementData.to}/totalAmountReceivable`] = Math.max(0, newAmountReceivable)
      updates[`userSummaries/${settlementData.to}/totalBalance`] = totalBalance
      updates[`userSummaries/${settlementData.to}/lastUpdated`] = now
    }

    await update(ref(rtdb), updates)

    debugLog('Settlement recorded successfully', { settlementRecord })
  } catch (error) {
    debugError('Error recording settlement', error)
    throw error
  }
}

/**
 * Get all settlement records for a group
 * 
 * @param {string} groupId - The group ID
 * @returns {Promise<Array>} Array of settlement records
 */
export const getSettlementRecords = async (groupId) => {
  try {
    const recordsRef = ref(rtdb, `groups/${groupId}/settlementRecords`)
    const recordsSnapshot = await get(recordsRef)

    if (!recordsSnapshot.exists()) {
      return []
    }

    const recordsData = recordsSnapshot.val()
    // Records stored as object with unique IDs
    const records = Object.entries(recordsData).map(([id, record]) => ({
      id,
      ...record
    }))

    debugLog('Retrieved settlement records', { count: records.length })
    return records
  } catch (error) {
    debugError('Error getting settlement records', error)
    return []
  }
}

/**
 * Delete a settlement record by ID
 * 
 * @param {string} groupId - The group ID
 * @param {string} recordId - ID of the record to delete
 * @returns {Promise<void>}
 */
export const deleteSettlementRecord = async (groupId, recordId) => {
  try {
    debugLog('Attempting to delete settlement record', { groupId, recordId })
    
    const recordsRef = ref(rtdb, `groups/${groupId}/settlementRecords`)
    const recordsSnapshot = await get(recordsRef)

    if (!recordsSnapshot.exists()) {
      throw new Error('No settlement records found')
    }

    const recordsData = recordsSnapshot.val()
    const records = { ...recordsData }

    debugLog('Records structure', { keys: Object.keys(records), looking: recordId })

    // Get the settlement record before deleting
    if (recordId in records) {
      const settlementRecord = records[recordId]
      debugLog('Found settlement record to delete', { recordId, record: settlementRecord })

      // Get current group data to update balances
      const groupRef = ref(rtdb, `groups/${groupId}`)
      const groupSnapshot = await get(groupRef)

      if (!groupSnapshot.exists()) {
        throw new Error('Group not found')
      }

      const group = groupSnapshot.val()
      const currentSummary = group.summary || {}
      const updatedBalances = { ...currentSummary.balances }

      // Reverse the balance changes from the settlement
      const payerBalance = updatedBalances[settlementRecord.from] || 0
      const recipientBalance = updatedBalances[settlementRecord.to] || 0

      // Payer's balance should decrease (reverse the payment)
      updatedBalances[settlementRecord.from] = Math.round((payerBalance - settlementRecord.amount) * 100) / 100

      // Recipient's balance should increase (reverse the receipt)
      updatedBalances[settlementRecord.to] = Math.round((recipientBalance + settlementRecord.amount) * 100) / 100

      debugLog('Reversed balances', {
        from: settlementRecord.from,
        fromNewBalance: updatedBalances[settlementRecord.from],
        to: settlementRecord.to,
        toNewBalance: updatedBalances[settlementRecord.to]
      })

      // Batch update: delete record and update balances
      const updates = {}
      delete records[recordId]
      updates[`groups/${groupId}/settlementRecords`] = Object.keys(records).length > 0 ? records : null
      updates[`groups/${groupId}/summary/balances`] = updatedBalances
      updates[`groups/${groupId}/summary/lastSettlementAt`] = Date.now()

      // Also revert user summaries
      const payerSummaryRef = ref(rtdb, `userSummaries/${settlementRecord.from}`)
      const payerSummarySnapshot = await get(payerSummaryRef)
      if (payerSummarySnapshot.exists()) {
        const payerSummary = payerSummarySnapshot.val()
        const newAmountOwed = Math.round(((payerSummary.totalAmountOwed || 0) + settlementRecord.amount) * 100) / 100
        const amountReceivable = payerSummary.totalAmountReceivable || 0
        const totalBalance = Math.round((amountReceivable - newAmountOwed) * 100) / 100
        updates[`userSummaries/${settlementRecord.from}/totalAmountOwed`] = newAmountOwed
        updates[`userSummaries/${settlementRecord.from}/totalBalance`] = totalBalance
        updates[`userSummaries/${settlementRecord.from}/lastUpdated`] = Date.now()
      }

      const recipientSummaryRef = ref(rtdb, `userSummaries/${settlementRecord.to}`)
      const recipientSummarySnapshot = await get(recipientSummaryRef)
      if (recipientSummarySnapshot.exists()) {
        const recipientSummary = recipientSummarySnapshot.val()
        const newAmountReceivable = Math.round(((recipientSummary.totalAmountReceivable || 0) + settlementRecord.amount) * 100) / 100
        const amountOwed = recipientSummary.totalAmountOwed || 0
        const totalBalance = Math.round((newAmountReceivable - amountOwed) * 100) / 100
        updates[`userSummaries/${settlementRecord.to}/totalAmountReceivable`] = newAmountReceivable
        updates[`userSummaries/${settlementRecord.to}/totalBalance`] = totalBalance
        updates[`userSummaries/${settlementRecord.to}/lastUpdated`] = Date.now()
      }

      await update(ref(rtdb), updates)
      debugLog('Settlement record deleted and balances restored successfully', { recordId })
    } else {
      debugError('Record not found in records', { recordId, availableKeys: Object.keys(records) })
      throw new Error(`Settlement record not found (looking for: ${recordId})`)
    }
  } catch (error) {
    debugError('Error deleting settlement record', error)
    throw error
  }
}
