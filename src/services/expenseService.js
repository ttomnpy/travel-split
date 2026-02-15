import { ref, push, update, get } from 'firebase/database'
import { rtdb } from '../firebase'
import { debugLog, debugError } from '../utils/debug'
import { getMemberDisplayName } from '../utils/displayNameHelper'
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
    // Remainder distribution prioritizes payers (those who already paid), especially who paid more
    let details = {}
    let splitMeta = {}
    let totalAmount = 0
    const payerIds = Object.keys(expenseData.payers || {})
    const nonPayerParticipants = expenseData.participants.filter(id => !payerIds.includes(id))

    // Helper function: Sort participants by payer status and payer amount
    // Returns array of participantIds sorted by: [payers_by_amount_desc, non_payers]
    const getRemainderDistributionOrder = (participants) => {
      const payers = []
      const nonPayers = []

      participants.forEach((id) => {
        if (payerIds.includes(id)) {
          payers.push({
            id,
            amount: expenseData.payers[id]?.amount || 0
          })
        } else {
          nonPayers.push(id)
        }
      })

      // Sort payers by amount paid (highest first)
      payers.sort((a, b) => b.amount - a.amount)

      // Return combined list: payers first, then non-payers
      return [...payers.map(p => p.id), ...nonPayers]
    }

    if (expenseData.splitMethod === 'equal') {
      // Fair equal split: round UP, adjust payers for overage
      // Convert to cents to avoid floating point issues
      const amountInCents = Math.round(expenseData.amount * 100)
      const participantCount = expenseData.participants.length
      
      // Calculate base amount (rounded UP)
      const baseCents = Math.ceil(amountInCents / participantCount)
      
      // Initialize all with base amount (rounded up)
      expenseData.participants.forEach((participantId) => {
        details[participantId] = baseCents
      })

      // Calculate total and overage
      const totalAfterRoundUp = baseCents * participantCount
      const overageCents = totalAfterRoundUp - amountInCents
      
      // If there's overage, reduce one payer by the overage
      if (overageCents > 0) {
        const remainderOrder = getRemainderDistributionOrder(expenseData.participants)
        if (remainderOrder.length > 0) {
          const payerToAdjust = remainderOrder[0]
          details[payerToAdjust] = (details[payerToAdjust] || baseCents) - overageCents
        }
      }

      // Convert from cents to currency
      Object.keys(details).forEach((id) => {
        details[id] = details[id] / 100
      })
    } else if (expenseData.splitMethod === 'percentage') {
      // Fair percentage split: round UP, adjust payers for overage
      const amountInCents = Math.round(expenseData.amount * 100)
      const amounts = []
      let totalCents = 0
      
      // Calculate amounts for each participant (rounded UP)
      expenseData.participants.forEach((participantId) => {
        const percentage = expenseData.splitDetails[participantId]?.percentage || 0
        const amountCents = Math.ceil((amountInCents * percentage) / 100)
        amounts.push({ participantId, amountCents })
        totalCents += amountCents
        splitMeta[participantId] = { percentage }
      })
      
      // Calculate overage and adjust payers
      const overageCents = totalCents - amountInCents
      if (overageCents > 0) {
        const remainderOrder = getRemainderDistributionOrder(expenseData.participants)
        for (let i = 0; i < remainderOrder.length && overageCents > 0; i++) {
          const participantId = remainderOrder[i]
          const item = amounts.find(a => a.participantId === participantId)
          if (item) {
            const reduction = Math.min(overageCents, item.amountCents)
            item.amountCents -= reduction
            break
          }
        }
      }
      
      // Apply amounts to details
      amounts.forEach(({ participantId, amountCents }) => {
        details[participantId] = amountCents / 100
      })
    } else if (expenseData.splitMethod === 'shares') {
      // Fair shares split: round UP, adjust payers for overage
      const amountInCents = Math.round(expenseData.amount * 100)
      let totalShares = 0
      const amounts = []
      
      // Calculate total shares
      expenseData.participants.forEach((participantId) => {
        const shares = expenseData.splitDetails[participantId]?.shares || 1
        totalShares += shares
      })
      
      // Calculate amounts for each participant (rounded UP)
      let totalCents = 0
      expenseData.participants.forEach((participantId) => {
        const shares = expenseData.splitDetails[participantId]?.shares || 1
        const amountCents = Math.ceil((amountInCents * shares) / totalShares)
        amounts.push({ participantId, amountCents })
        totalCents += amountCents
        splitMeta[participantId] = { shares }
      })
      
      // Calculate overage and adjust payers
      const overageCents = totalCents - amountInCents
      if (overageCents > 0) {
        const remainderOrder = getRemainderDistributionOrder(expenseData.participants)
        for (let i = 0; i < remainderOrder.length && overageCents > 0; i++) {
          const participantId = remainderOrder[i]
          const item = amounts.find(a => a.participantId === participantId)
          if (item) {
            const reduction = Math.min(overageCents, item.amountCents)
            item.amountCents -= reduction
            break
          }
        }
      }
      
      // Apply amounts to details
      amounts.forEach(({ participantId, amountCents }) => {
        details[participantId] = amountCents / 100
      })
    } else if (expenseData.splitMethod === 'exact') {
      // Exact split: use amounts as specified
      expenseData.participants.forEach((participantId) => {
        const amount = expenseData.splitDetails[participantId]?.amount || 0
        details[participantId] = Math.round(amount * 100) / 100
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
      createdBy: String(currentUserId)
    }

    // Add optional fields
    if (expenseData.location) {
      expense.location = expenseData.location
    }

    if (expenseData.currency) {
      expense.currency = expenseData.currency
    }

    if (expenseData.exchangeRate) {
      expense.exchangeRate = expenseData.exchangeRate
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

    // Initialize member names with removed status indicator
    Object.keys(group.members).forEach(memberId => {
      memberNames[memberId] = getMemberDisplayName(group.members[memberId])
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
 * Update an existing settlement record
 * 
 * @param {string} groupId - The group ID
 * @param {string} recordId - The settlement record ID
 * @param {Object} settlementData - Updated settlement data
 * @returns {Promise<void>}
 */
export const updateSettlement = async (groupId, recordId, settlementData) => {
  try {
    if (!groupId || !recordId || !settlementData.from || !settlementData.to || !settlementData.amount) {
      throw new Error('Missing required settlement fields')
    }

    debugLog('Updating settlement payment', {
      groupId,
      recordId,
      from: settlementData.from,
      to: settlementData.to,
      amount: settlementData.amount
    })

    // Get the existing settlement record
    const recordRef = ref(rtdb, `groups/${groupId}/settlementRecords/${recordId}`)
    const recordSnapshot = await get(recordRef)

    if (!recordSnapshot.exists()) {
      throw new Error('Settlement record not found')
    }

    const oldRecord = recordSnapshot.val()

    // Get current group data to recalculate balances
    const groupRef = ref(rtdb, `groups/${groupId}`)
    const groupSnapshot = await get(groupRef)

    if (!groupSnapshot.exists()) {
      throw new Error('Group not found')
    }

    const group = groupSnapshot.val()
    const currentSummary = group.summary || {}
    const updatedBalances = { ...currentSummary.balances }

    const now = Date.now()

    // Revert old settlement balances
    const oldPayerBalance = updatedBalances[oldRecord.from] || 0
    const oldRecipientBalance = updatedBalances[oldRecord.to] || 0

    updatedBalances[oldRecord.from] = Math.round((oldPayerBalance - oldRecord.amount) * 100) / 100
    updatedBalances[oldRecord.to] = Math.round((oldRecipientBalance + oldRecord.amount) * 100) / 100

    // Apply new settlement balances
    const newPayerBalance = updatedBalances[settlementData.from] || 0
    const newRecipientBalance = updatedBalances[settlementData.to] || 0

    updatedBalances[settlementData.from] = Math.round((newPayerBalance + settlementData.amount) * 100) / 100
    updatedBalances[settlementData.to] = Math.round((newRecipientBalance - settlementData.amount) * 100) / 100

    // Update settlement record
    const updatedRecord = {
      from: settlementData.from,
      to: settlementData.to,
      amount: settlementData.amount,
      paymentMethod: settlementData.paymentMethod || 'cash',
      remarks: settlementData.remarks || '',
      date: settlementData.date || new Date().toISOString().split('T')[0],
      recordedBy: oldRecord.recordedBy,
      recordedAt: oldRecord.recordedAt,
      updatedAt: now
    }

    // Batch update
    const updates = {}
    updates[`groups/${groupId}/settlementRecords/${recordId}`] = updatedRecord
    updates[`groups/${groupId}/summary/balances`] = updatedBalances
    updates[`groups/${groupId}/summary/lastSettlementAt`] = now

    // Update user summaries for all 4 users involved (old and new payer/recipient)
    const affectedUsers = new Set([oldRecord.from, oldRecord.to, settlementData.from, settlementData.to])

    for (const userId of affectedUsers) {
      const userSummaryRef = ref(rtdb, `userSummaries/${userId}`)
      const userSummarySnapshot = await get(userSummaryRef)

      if (userSummarySnapshot.exists()) {
        const userSummary = userSummarySnapshot.val()
        let newAmountOwed = userSummary.totalAmountOwed || 0
        let newAmountReceivable = userSummary.totalAmountReceivable || 0

        // Revert old settlement for this user (opposite of recordSettlement logic)
        if (userId === oldRecord.from) {
          // Old payer: their amountOwed was decreased, so we need to increase it back
          newAmountOwed += oldRecord.amount
        } else if (userId === oldRecord.to) {
          // Old recipient: their amountReceivable was decreased, so we need to increase it back
          newAmountReceivable += oldRecord.amount
        }

        // Apply new settlement for this user (same as recordSettlement logic)
        if (userId === settlementData.from) {
          // New payer: decrease their amountOwed
          newAmountOwed -= settlementData.amount
        } else if (userId === settlementData.to) {
          // New recipient: decrease their amountReceivable
          newAmountReceivable -= settlementData.amount
        }

        newAmountOwed = Math.max(0, Math.round(newAmountOwed * 100) / 100)
        newAmountReceivable = Math.max(0, Math.round(newAmountReceivable * 100) / 100)
        const totalBalance = Math.round((newAmountReceivable - newAmountOwed) * 100) / 100

        updates[`userSummaries/${userId}/totalAmountOwed`] = newAmountOwed
        updates[`userSummaries/${userId}/totalAmountReceivable`] = newAmountReceivable
        updates[`userSummaries/${userId}/totalBalance`] = totalBalance
        updates[`userSummaries/${userId}/lastUpdated`] = now
      }
    }

    await update(ref(rtdb), updates)

    debugLog('Settlement updated successfully', { settlementRecord: updatedRecord })
  } catch (error) {
    debugError('Error updating settlement', error)
    throw error
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
        const newAmountOwed = Math.max(0, Math.round(((payerSummary.totalAmountOwed || 0) + settlementRecord.amount) * 100) / 100)
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
        const newAmountReceivable = Math.max(0, Math.round(((recipientSummary.totalAmountReceivable || 0) + settlementRecord.amount) * 100) / 100)
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
