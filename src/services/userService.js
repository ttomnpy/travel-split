import { getDatabase, ref, set, update, get } from 'firebase/database'
import { debugLog, debugWarn, debugError } from '../utils/debug'

// Initialize Realtime Database
const db = getDatabase()

export const userService = {
  /**
   * Register or update user in the database after authentication
   * Creates user profile following the SPEC schema
   * Returns isNewUser flag based on whether user already exists in database
   * 
   * @param {Object} firebaseUser - Firebase user object from auth
   * @param {string} firebaseUser.uid - User ID
   * @param {string} firebaseUser.email - User email
   * @param {string} firebaseUser.displayName - Display name (optional, from provider)
   * @param {string} firebaseUser.photoURL - Profile photo URL (optional)
   * @returns {Promise<{error: null|string, user: Object|null, isNewUser: boolean}>}
   */
  registerUser: async (firebaseUser) => {
    try {
      if (!firebaseUser || !firebaseUser.uid) {
        throw new Error('Invalid Firebase user object')
      }

      debugLog('Registering User in Database', { userId: firebaseUser.uid, email: firebaseUser.email })

      const userId = firebaseUser.uid
      const userRef = ref(db, `users/${userId}`)
      
      // Check if user already exists in database
      let existingUser
      try {
        existingUser = await get(userRef)
        debugLog('Database Query Successful', { userId })
      } catch (dbError) {
        debugError('Database Query Failed', { error: dbError.message, code: dbError.code })
        throw new Error(`Failed to query database: ${dbError.message}`)
      }
      
      if (existingUser.exists()) {
        debugLog('User Already Exists, Updating lastLoginAt', { userId })
        
        // Update existing user's lastLoginAt
        try {
          await update(userRef, {
            lastLoginAt: Date.now()
          })
        } catch (updateError) {
          debugError('Failed to update user lastLoginAt', { error: updateError.message })
        }
        
        const userData = existingUser.val()
        debugLog('Returning existing user', { userId, isNewUser: false })
        return { error: null, user: userData, isNewUser: false }
      }

      // User does not exist - create new user profile following SPEC schema
      debugLog('Creating New User in Database', { userId, email: firebaseUser.email })
      
      const newUser = {
        email: firebaseUser.email,
        displayName: firebaseUser.displayName || '',
        photoURL: firebaseUser.photoURL || null,
        createdAt: Date.now(),
        lastLoginAt: Date.now(),
        // Initialize empty groups object
        groups: {}
      }

      try {
        await set(userRef, newUser)
        debugLog('User Successfully Created', { userId, email: firebaseUser.email })
      } catch (setError) {
        debugError('Failed to create user in database', { error: setError.message, code: setError.code })
        throw new Error(`Failed to create user: ${setError.message}`)
      }

      // New users that don't exist in database need to complete profile setup
      debugLog('Returning new user', { userId, isNewUser: true })
      return { error: null, user: newUser, isNewUser: true }
    } catch (error) {
      debugError('User Registration Error', { 
        code: error.code, 
        message: error.message,
        userId: firebaseUser?.uid 
      })
      return { 
        error: error.code || error.message, 
        user: null,
        isNewUser: false 
      }
    }
  },

  /**
   * Get user profile from database
   * 
   * @param {string} userId - The user ID to fetch
   * @returns {Promise<{error: null|string, user: Object|null}>}
   */
  getUser: async (userId) => {
    try {
      if (!userId) {
        throw new Error('User ID is required')
      }

      const userRef = ref(db, `users/${userId}`)
      const snapshot = await get(userRef)

      if (!snapshot.exists()) {
        debugWarn('User Not Found in Database', { userId })
        return { error: 'user_not_found', user: null }
      }

      return { error: null, user: snapshot.val() }
    } catch (error) {
      debugError('Get User Error', { code: error.code, message: error.message, userId })
      return { error: error.code || error.message, user: null }
    }
  },

  /**
   * Update user profile in database
   * 
   * @param {string} userId - The user ID to update
   * @param {Object} updates - Object containing fields to update
   * @returns {Promise<{error: null|string}>}
   */
  updateUserProfile: async (userId, updates) => {
    try {
      if (!userId) {
        throw new Error('User ID is required')
      }

      debugLog('Updating User Profile', { userId, updates: Object.keys(updates) })

      const userRef = ref(db, `users/${userId}`)
      
      // Only allow specific fields to be updated
      const allowedFields = ['displayName', 'photoURL']
      const filteredUpdates = {}
      
      for (const field of allowedFields) {
        if (field in updates) {
          filteredUpdates[field] = updates[field]
        }
      }

      if (Object.keys(filteredUpdates).length === 0) {
        throw new Error('No valid fields to update')
      }

      await update(userRef, filteredUpdates)

      debugLog('User Profile Updated Successfully', { userId })

      return { error: null }
    } catch (error) {
      debugError('Update User Profile Error', { code: error.code, message: error.message, userId })
      return { error: error.code || error.message }
    }
  },

  /**
   * Get user's groups for home screen
   * Reads from users/{userId}/groups
   * 
   * @param {string} userId - The user ID
   * @returns {Promise<{error: null|string, groups: Object|null}>}
   */
  getUserGroups: async (userId) => {
    try {
      if (!userId) {
        throw new Error('User ID is required')
      }

      const groupsRef = ref(db, `users/${userId}/groups`)
      const snapshot = await get(groupsRef)

      if (!snapshot.exists()) {
        return { error: null, groups: {} }
      }

      return { error: null, groups: snapshot.val() }
    } catch (error) {
      debugError('Get User Groups Error', { code: error.code, message: error.message, userId })
      return { error: error.code || error.message, groups: null }
    }
  },

  /**
   * Add group to user's group list (denormalized for fast home-screen rendering)
   * 
   * @param {string} userId - The user ID
   * @param {string} groupId - The group ID to add
   * @param {Object} groupInfo - Group information to store
   * @returns {Promise<{error: null|string}>}
   */
  addGroupToUser: async (userId, groupId, groupInfo) => {
    try {
      if (!userId || !groupId) {
        throw new Error('User ID and Group ID are required')
      }

      debugLog('Adding Group to User', { userId, groupId })

      const groupRefPath = `users/${userId}/groups/${groupId}`
      const groupRef = ref(db, groupRefPath)

      const groupData = {
        name: groupInfo.name,
        role: groupInfo.role || 'member',
        lastActivity: Date.now(),
        unreadCount: 0
      }

      await set(groupRef, groupData)

      debugLog('Group Added to User Successfully', { userId, groupId })

      return { error: null }
    } catch (error) {
      debugError('Add Group to User Error', { code: error.code, message: error.message, userId, groupId })
      return { error: error.code || error.message }
    }
  },

  /**
   * Update group's lastActivity for a user
   * 
   * @param {string} userId - The user ID
   * @param {string} groupId - The group ID
   * @returns {Promise<{error: null|string}>}
   */
  updateGroupActivity: async (userId, groupId) => {
    try {
      if (!userId || !groupId) {
        throw new Error('User ID and Group ID are required')
      }

      const groupRefPath = `users/${userId}/groups/${groupId}`
      const groupRef = ref(db, groupRefPath)

      await update(groupRef, {
        lastActivity: Date.now()
      })

      return { error: null }
    } catch (error) {
      debugError('Update Group Activity Error', { code: error.code, message: error.message, userId, groupId })
      return { error: error.code || error.message }
    }
  }
}
