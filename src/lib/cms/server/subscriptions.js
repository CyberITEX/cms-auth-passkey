// src/lib/cms/server/subscriptions.js
'use server';
import { subDays } from 'date-fns';
import {
  createDocument,
  deleteDocument,
  getDocument,
  getDocuments,
  updateDocument,
  getDocumentsByRelation
} from './sdk_db';
import { Query } from './sdk_client';
import { getUser } from './sdk_users';
import { sendSubscriptionStatusEmail } from '@/functions/email/subscriptionMail';
import { processStripeSubscriptionRenewal } from '@/lib/stripe/server/renewalPayments';

// Collection names
const SUBSCRIPTIONS_COLLECTION = 'orderSubscriptions';
const SUBSCRIPTION_CHANGES_COLLECTION = 'orderSubscriptionChanges';

/**
 * Get subscriptions for a specific user with flexible pagination
 * @param {string} userId - The user ID
 * @param {Object} options - Additional options for filtering and pagination
 * @param {string} options.search - Search term for subscription IDs or products (optional)
 * @param {string} options.status - Filter by subscription status (optional)
 * @param {string} options.type - Filter by subscription type (optional)
 * @param {string} options.timeFilter - Filter by time period (e.g., '3days', '7days', '30days', '3months')
 * @param {number} options.limit - Maximum number of subscriptions to return (default: 12)
 * @param {number} options.offset - Offset for pagination (default: 0)
 * @param {string} options.sortField - Field to sort by (default: '$createdAt')
 * @param {string} options.sortOrder - Sort direction ('asc' or 'desc', default: 'desc')
 * @returns {Promise<Object>} - Response with user subscriptions or error
 */
export async function getUserSubscriptions(userId, options = {}) {
  try {
    if (!userId) {
      throw new Error('User ID is required');
    }

    // Set default options
    const {
      search = null,
      status = null,
      type = null,
      timeFilter = null,
      limit = 12,
      offset = 0,
      sortField = '$createdAt',
      sortOrder = 'desc'
    } = options;

    // Create queries array
    const queries = [
      Query.equal('userId', userId),
      Query.limit(limit),
      Query.offset(offset)
    ];

    // Add search filter if provided
    if (search) {
      // You might need to adjust this according to your backend capabilities
      // This searches in order fields and product names
      queries.push(
        Query.or([
          Query.search('productName', search),
          Query.search('planName', search),
          Query.search('pricingName', search),
        ])
      );
    }

    // Add status filter
    if (status) {
      queries.push(Query.equal('status', status));
    }

    // Add type filter
    if (type) {
      queries.push(Query.equal('type', type));
    }

    // Add time filter
    if (timeFilter) {
      const now = new Date();
      let filterDate;

      switch (timeFilter) {
        case '3days':
          filterDate = subDays(now, 3);
          break;
        case '7days':
          filterDate = subDays(now, 7);
          break;
        case '30days':
          filterDate = subDays(now, 30);
          break;
        case '3months':
          filterDate = subDays(now, 90);
          break;
        default:
          filterDate = null;
      }

      if (filterDate) {
        queries.push(Query.greaterThan('createdAt', filterDate.toISOString()));
      }
    }

    // Add sorting
    if (sortField) {
      if (sortOrder.toLowerCase() === 'asc') {
        queries.push(Query.orderAsc(sortField));
      } else {
        queries.push(Query.orderDesc(sortField));
      }
    }

    // Get subscriptions with filters
    const response = await getDocuments(SUBSCRIPTIONS_COLLECTION, queries);

    if (!response.success) {
      throw new Error(response.message || 'Failed to fetch subscriptions');
    }

    // Get the subscriptions and total count
    const subscriptions = response.data.documents || [];
    const totalCount = response.data.total || 0;

    return {
      success: true,
      data: {
        subscriptions: subscriptions,
        total: totalCount
      }
    };
  } catch (error) {
    console.error(`Error fetching subscriptions for user ${userId}:`, error);
    return {
      success: false,
      message: error.message || 'Failed to fetch subscriptions'
    };
  }
}

/**
 * Get subscriptions with flexible pagination
 * @param {Object} options - Additional options for filtering and pagination
 * @param {string} options.search - Search term for subscription IDs or products (optional)
 * @param {string} options.status - Filter by subscription status (optional)
 * @param {string} options.type - Filter by subscription type (optional)
 * @param {string} options.timeFilter - Filter by time period (e.g., '3days', '7days', '30days', '3months')
 * @param {number} options.limit - Maximum number of subscriptions to return (default: 12)
 * @param {number} options.offset - Offset for pagination (default: 0)
 * @param {string} options.sortField - Field to sort by (default: '$createdAt')
 * @param {string} options.sortOrder - Sort direction ('asc' or 'desc', default: 'desc')
 * @returns {Promise<Object>} - Response with user subscriptions or error
 */
export async function getSubscriptions(options = {}) {
  try {
    // Set default options
    const {
      search = null,
      status = null,
      type = null,
      timeFilter = null,
      limit = 12,
      offset = 0,
      sortField = '$createdAt',
      sortOrder = 'desc'
    } = options;

    // Create queries array
    const queries = [
      Query.limit(limit),
      Query.offset(offset)
    ];

    // Add search filter if provided
    if (search) {
      // You might need to adjust this according to your backend capabilities
      // This searches in order fields and product names
      queries.push(
        Query.or([
          Query.search('productName', search),
          Query.search('planName', search),
          Query.search('pricingName', search),
        ])
      );
    }

    // Add status filter
    if (status) {
      queries.push(Query.equal('status', status));
    }

    // Add type filter
    if (type) {
      queries.push(Query.equal('type', type));
    }

    // Add time filter
    if (timeFilter) {
      const now = new Date();
      let filterDate;

      switch (timeFilter) {
        case '3days':
          filterDate = subDays(now, 3);
          break;
        case '7days':
          filterDate = subDays(now, 7);
          break;
        case '30days':
          filterDate = subDays(now, 30);
          break;
        case '3months':
          filterDate = subDays(now, 90);
          break;
        default:
          filterDate = null;
      }

      if (filterDate) {
        queries.push(Query.greaterThan('createdAt', filterDate.toISOString()));
      }
    }

    // Add sorting
    if (sortField) {
      if (sortOrder.toLowerCase() === 'asc') {
        queries.push(Query.orderAsc(sortField));
      } else {
        queries.push(Query.orderDesc(sortField));
      }
    }

    // Get subscriptions with filters
    const response = await getDocuments(SUBSCRIPTIONS_COLLECTION, queries);

    if (!response.success) {
      throw new Error(response.message || 'Failed to fetch subscriptions');
    }

    // Get the subscriptions and total count
    const subscriptions = response.data.documents || [];
    const totalCount = response.data.total || 0;

    return {
      success: true,
      data: {
        subscriptions: subscriptions,
        total: totalCount
      }
    };
  } catch (error) {
    console.error(`Error fetching subscriptions for user ${userId}:`, error);
    return {
      success: false,
      message: error.message || 'Failed to fetch subscriptions'
    };
  }
}


/**
 * Get a single subscription by ID
 * @param {string} subscriptionId - The subscription ID
 * @param {Object} options - Additional options
 * @param {boolean} options.includeRelations - Whether to include related data (optional, default: false)
 * @returns {Promise<Object>} - Response with subscription or error
 */
export async function getSingleSubscription(subscriptionId) {
  try {
    if (!subscriptionId) {
      throw new Error('Subscription ID is required');
    }

    // Get the subscription
    const response = await getDocument(
      SUBSCRIPTIONS_COLLECTION,
      subscriptionId
    );

    if (!response.success) {
      throw new Error(response.message || 'Failed to fetch subscription');
    }

    const subscription = response.data;

    return {
      success: true,
      data: subscription
    };
  } catch (error) {
    console.error(`Error fetching subscription ${subscriptionId}:`, error);
    return {
      success: false,
      message: error.message || 'Failed to fetch subscription'
    };
  }
}

/**
 * Update a subscription
 * @param {string} subscriptionId - The subscription ID
 * @param {Object} data - The data to update the subscription with
 * @returns {Promise<Object>} - Response with updated subscription or error
 */
export async function updateSubscription(subscriptionId, updateData = {}) {
  try {
    if (!subscriptionId) {
      throw new Error('Subscription ID is required');
    }
    // Check if the subscription exists
    const subscriptionResponse = await getDocument(
      SUBSCRIPTIONS_COLLECTION,
      subscriptionId
    );

    if (!subscriptionResponse.success) {
      throw new Error(subscriptionResponse.message || 'Failed to fetch subscription');
    }

    // Add updatedAt timestamp
    updateData.updatedAt = new Date().toISOString();

    // Update the subscription
    const response = await updateDocument(
      SUBSCRIPTIONS_COLLECTION,
      subscriptionId,
      updateData
    );

    if (!response.success) {
      throw new Error(response.message || 'Failed to update subscription');
    }

    return {
      success: true,
      data: response.data,
      message: 'Subscription updated successfully'
    };
  } catch (error) {
    console.error(`Error updating subscription ${subscriptionId}:`, error);
    return {
      success: false,
      message: error.message || 'Failed to update subscription'
    };
  }
}

/**
 * Create a subscription change record
 * @param {string} subscriptionId - The subscription ID
 * @param {Object} changeData - The change data
 * @returns {Promise<Object>} - Response with created change record or error
 */
export async function createSubscriptionChangeRecord(subscriptionId, changeData) {
  try {
    if (!subscriptionId) {
      throw new Error('Subscription ID is required');
    }

    // Prepare the change record
    const changeRecord = {
      subscription: subscriptionId, // This links to the subscription via relationship
      createdAt: new Date().toISOString(),
      ...changeData
    };

    // Create the change record
    const response = await createDocument(
      SUBSCRIPTION_CHANGES_COLLECTION,
      changeRecord
    );

    if (!response.success) {
      throw new Error(response.message || 'Failed to create subscription change record');
    }

    return {
      success: true,
      data: response.data,
      message: 'Subscription change record created successfully'
    };
  } catch (error) {
    console.error(`Error creating subscription change record for ${subscriptionId}:`, error);
    return {
      success: false,
      message: error.message || 'Failed to create subscription change record'
    };
  }
}

/**
 * Request to cancel a subscription - creates a pending cancellation request
 * @param {string} subscriptionId - The subscription ID
 * @param {string} reason - Reason for cancellation
 * @param {string} userId - User ID requesting cancellation
 * @returns {Promise<Object>} - Response with updated subscription or error
 */
export async function requestCancelSubscription(subscriptionId, userId = '', reason = '') {
  try {
    if (!subscriptionId) {
      throw new Error('Subscription ID is required');
    }

    // Get current subscription data
    const subResponse = await getDocument(SUBSCRIPTIONS_COLLECTION, subscriptionId);
    if (!subResponse.success) {
      throw new Error(subResponse.message || 'Failed to fetch subscription');
    }

    const currentSubscription = subResponse.data;

    // Update the subscription status to "PendingCancellation"
    // We need to add this status to the schema if it doesn't exist
    const updateData = {
      status: 'PendingCancellation',
      updatedAt: new Date().toISOString()
    };

    // Update the subscription
    const updateResponse = await updateSubscription(subscriptionId, updateData);

    if (!updateResponse.success) {
      throw new Error(updateResponse.message || 'Failed to update subscription status');
    }

    // Create a change record
    const changeData = {
      changeType: 'Cancel',
      fromStatus: currentSubscription.status,
      toStatus: 'PendingCancellation',
      changeReason: reason,
      changedBy: userId || currentSubscription.userId,
      immediateChange: false,
      effectiveDate: new Date().toISOString(),
      additionalNotes: 'Cancellation request pending admin approval'
    };

    await createSubscriptionChangeRecord(subscriptionId, changeData);

    return {
      success: true,
      data: updateResponse.data,
      message: 'Subscription cancellation request submitted successfully'
    };
  } catch (error) {
    console.error(`Error requesting cancellation for subscription ${subscriptionId}:`, error);
    return {
      success: false,
      message: error.message || 'Failed to request subscription cancellation'
    };
  }
}

/**
 * Admin approval for subscription cancellation
 * @param {string} subscriptionId - The subscription ID
 * @param {string} adminId - Admin user ID approving the cancellation
 * @param {string} notes - Additional notes from admin
 * @returns {Promise<Object>} - Response with canceled subscription or error
 */
export async function approveCancelSubscription(subscriptionId, adminId, notes = '') {
  try {
    if (!subscriptionId) {
      throw new Error('Subscription ID is required');
    }

    if (!adminId) {
      throw new Error('Admin ID is required for approval');
    }

    // Get current subscription data
    const subResponse = await getDocument(SUBSCRIPTIONS_COLLECTION, subscriptionId);
    if (!subResponse.success) {
      throw new Error(subResponse.message || 'Failed to fetch subscription');
    }

    const currentSubscription = subResponse.data;

    // Verify the subscription is in PendingCancellation status
    if (currentSubscription.status !== 'PendingCancellation') {
      throw new Error('Subscription is not pending cancellation');
    }

    // Update the subscription
    const updateData = {
      status: 'Canceled',
      updatedAt: new Date().toISOString()
    };

    // Update the subscription
    const updateResponse = await updateSubscription(subscriptionId, updateData);

    if (!updateResponse.success) {
      throw new Error(updateResponse.message || 'Failed to cancel subscription');
    }

    // Create a change record
    const changeData = {
      changeType: 'Cancel',
      fromStatus: 'PendingCancellation',
      toStatus: 'Canceled',
      changeReason: 'Admin approved cancellation',
      changedBy: adminId,
      immediateChange: true,
      effectiveDate: new Date().toISOString(),
      additionalNotes: notes
    };

    await createSubscriptionChangeRecord(subscriptionId, changeData);
    await sendSubscriptionNotification(subscriptionId, 'approveCancel', notes);
    return {
      success: true,
      data: updateResponse.data,
      message: 'Subscription cancellation approved successfully'
    };
  } catch (error) {
    console.error(`Error approving cancellation for subscription ${subscriptionId}:`, error);
    return {
      success: false,
      message: error.message || 'Failed to approve subscription cancellation'
    };
  }
}

/**
 * Cancel a subscription immediately without admin approval
 * @param {string} subscriptionId - The subscription ID
 * @param {string} reason - Reason for cancellation
 * @param {string} userId - User ID requesting cancellation
 * @returns {Promise<Object>} - Response with canceled subscription or error
 */
export async function cancelSubscription(subscriptionId, userId = '', reason = '') {
  try {
    if (!subscriptionId) {
      throw new Error('Subscription ID is required');
    }

    // Get current subscription data
    const subResponse = await getDocument(SUBSCRIPTIONS_COLLECTION, subscriptionId);
    if (!subResponse.success) {
      throw new Error(subResponse.message || 'Failed to fetch subscription');
    }

    const currentSubscription = subResponse.data;

    // Update the subscription status to "Canceled" immediately
    const updateData = {
      status: 'Canceled',
      updatedAt: new Date().toISOString()
    };

    // Update the subscription
    const updateResponse = await updateSubscription(subscriptionId, updateData);

    if (!updateResponse.success) {
      throw new Error(updateResponse.message || 'Failed to cancel subscription');
    }

    // Create a change record
    const changeData = {
      changeType: 'Cancel',
      fromStatus: currentSubscription.status,
      toStatus: 'Canceled',
      changeReason: reason || 'Direct cancellation by admin',
      changedBy: userId || currentSubscription.userId,
      immediateChange: true,
      effectiveDate: new Date().toISOString(),
      additionalNotes: 'Subscription canceled directly by admin'
    };

    await createSubscriptionChangeRecord(subscriptionId, changeData);

    // Send notification email
    await sendSubscriptionNotification(
      subscriptionId,
      'cancel',
      reason || 'Direct cancellation by admin'
    );

    return {
      success: true,
      data: updateResponse.data,
      message: 'Subscription canceled successfully'
    };
  } catch (error) {
    console.error(`Error canceling subscription ${subscriptionId}:`, error);
    return {
      success: false,
      message: error.message || 'Failed to cancel subscription'
    };
  }
}

/**
 * Reject cancellation request for a subscription
 * @param {string} subscriptionId - The subscription ID
 * @param {string} adminId - Admin user ID rejecting the cancellation
 * @param {string} reason - Reason for rejection
 * @returns {Promise<Object>} - Response with updated subscription or error
 */
export async function rejectCancelSubscription(subscriptionId, adminId, reason = '') {
  try {
    if (!subscriptionId) {
      throw new Error('Subscription ID is required');
    }

    if (!adminId) {
      throw new Error('Admin ID is required for rejection');
    }

    // Get current subscription data
    const subResponse = await getDocument(SUBSCRIPTIONS_COLLECTION, subscriptionId);
    if (!subResponse.success) {
      throw new Error(subResponse.message || 'Failed to fetch subscription');
    }

    const currentSubscription = subResponse.data;

    // Verify the subscription is in PendingCancellation status
    if (currentSubscription.status !== 'PendingCancellation') {
      throw new Error('Subscription is not pending cancellation');
    }

    // Revert to Active status
    const updateData = {
      status: 'Active',
      updatedAt: new Date().toISOString()
    };

    // Update the subscription
    const updateResponse = await updateSubscription(subscriptionId, updateData);

    if (!updateResponse.success) {
      throw new Error(updateResponse.message || 'Failed to update subscription');
    }

    // Create a change record
    const changeData = {
      changeType: 'Reactivate',
      fromStatus: 'PendingCancellation',
      toStatus: 'Active',
      changeReason: reason || 'Admin rejected cancellation request',
      changedBy: adminId,
      immediateChange: true,
      effectiveDate: new Date().toISOString(),
      additionalNotes: 'Admin rejected cancellation request'
    };

    await createSubscriptionChangeRecord(subscriptionId, changeData);

    await sendSubscriptionNotification(subscriptionId, 'rejectCancel', reason);

    return {
      success: true,
      data: updateResponse.data,
      message: 'Subscription cancellation request rejected'
    };
  } catch (error) {
    console.error(`Error rejecting cancellation for subscription ${subscriptionId}:`, error);
    return {
      success: false,
      message: error.message || 'Failed to reject subscription cancellation'
    };
  }
}


/**
 * Request to pause a subscription - creates a pending pause request
 * @param {string} subscriptionId - The subscription ID
 * @param {string} reason - Reason for pause
 * @param {string} userId - User ID requesting pause
 * @returns {Promise<Object>} - Response with updated subscription or error
 */
export async function requestPauseSubscription(subscriptionId, userId = '', reason = '') {
  try {
    if (!subscriptionId) {
      throw new Error('Subscription ID is required');
    }

    // Get current subscription data
    const subResponse = await getDocument(SUBSCRIPTIONS_COLLECTION, subscriptionId);
    if (!subResponse.success) {
      throw new Error(subResponse.message || 'Failed to fetch subscription');
    }

    const currentSubscription = subResponse.data;

    // Check if subscription is in a state that can be paused
    if (currentSubscription.status !== 'Active') {
      throw new Error(`Subscription with status '${currentSubscription.status}' cannot be paused`);
    }

    // Update the subscription status to "PendingPause"
    const updateData = {
      status: 'PendingPause',
      updatedAt: new Date().toISOString()
    };

    // Update the subscription
    const updateResponse = await updateSubscription(subscriptionId, updateData);

    if (!updateResponse.success) {
      throw new Error(updateResponse.message || 'Failed to update subscription status');
    }

    // Create a change record
    const changeData = {
      changeType: 'Pause',
      fromStatus: currentSubscription.status,
      toStatus: 'PendingPause',
      changeReason: reason,
      changedBy: userId || currentSubscription.userId,
      immediateChange: false,
      effectiveDate: new Date().toISOString(),
      additionalNotes: 'Pause request pending admin approval'
    };

    await createSubscriptionChangeRecord(subscriptionId, changeData);

    return {
      success: true,
      data: updateResponse.data,
      message: 'Subscription pause request submitted successfully'
    };
  } catch (error) {
    console.error(`Error requesting pause for subscription ${subscriptionId}:`, error);
    return {
      success: false,
      message: error.message || 'Failed to request subscription pause'
    };
  }
}

/**
 * Admin approval for subscription pause
 * @param {string} subscriptionId - The subscription ID
 * @param {string} adminId - Admin user ID approving the pause
 * @param {string} notes - Additional notes from admin
 * @returns {Promise<Object>} - Response with paused subscription or error
 */
export async function approvePauseSubscription(subscriptionId, adminId, notes = '') {
  try {
    if (!subscriptionId) {
      throw new Error('Subscription ID is required');
    }

    if (!adminId) {
      throw new Error('Admin ID is required for approval');
    }

    // Get current subscription data
    const subResponse = await getDocument(SUBSCRIPTIONS_COLLECTION, subscriptionId);
    if (!subResponse.success) {
      throw new Error(subResponse.message || 'Failed to fetch subscription');
    }

    const currentSubscription = subResponse.data;

    // Verify the subscription is in PendingPause status
    if (currentSubscription.status !== 'PendingPause') {
      throw new Error('Subscription is not pending pause');
    }

    // Update the subscription
    const updateData = {
      status: 'Paused',
      updatedAt: new Date().toISOString()
    };

    // Update the subscription
    const updateResponse = await updateSubscription(subscriptionId, updateData);

    if (!updateResponse.success) {
      throw new Error(updateResponse.message || 'Failed to pause subscription');
    }

    // Create a change record
    const changeData = {
      changeType: 'Pause',
      fromStatus: 'PendingPause',
      toStatus: 'Paused',
      changeReason: 'Admin approved pause',
      changedBy: adminId,
      immediateChange: true,
      effectiveDate: new Date().toISOString(),
      additionalNotes: notes
    };

    await createSubscriptionChangeRecord(subscriptionId, changeData);
    await sendSubscriptionNotification(subscriptionId, 'approvePause', notes);
    return {
      success: true,
      data: updateResponse.data,
      message: 'Subscription pause approved successfully'
    };
  } catch (error) {
    console.error(`Error approving pause for subscription ${subscriptionId}:`, error);
    return {
      success: false,
      message: error.message || 'Failed to approve subscription pause'
    };
  }
}

/**
 * Reject pause request for a subscription
 * @param {string} subscriptionId - The subscription ID
 * @param {string} adminId - Admin user ID rejecting the pause
 * @param {string} reason - Reason for rejection
 * @returns {Promise<Object>} - Response with updated subscription or error
 */
export async function rejectPauseSubscription(subscriptionId, adminId, reason = '') {
  try {
    if (!subscriptionId) {
      throw new Error('Subscription ID is required');
    }

    if (!adminId) {
      throw new Error('Admin ID is required for rejection');
    }

    // Get current subscription data
    const subResponse = await getDocument(SUBSCRIPTIONS_COLLECTION, subscriptionId);
    if (!subResponse.success) {
      throw new Error(subResponse.message || 'Failed to fetch subscription');
    }

    const currentSubscription = subResponse.data;

    // Verify the subscription is in PendingPause status
    if (currentSubscription.status !== 'PendingPause') {
      throw new Error('Subscription is not pending pause');
    }

    // Revert to Active status
    const updateData = {
      status: 'Active',
      updatedAt: new Date().toISOString()
    };

    // Update the subscription
    const updateResponse = await updateSubscription(subscriptionId, updateData);

    if (!updateResponse.success) {
      throw new Error(updateResponse.message || 'Failed to update subscription');
    }

    // Create a change record
    const changeData = {
      changeType: 'Resume',
      fromStatus: 'PendingPause',
      toStatus: 'Active',
      changeReason: reason || 'Admin rejected pause request',
      changedBy: adminId,
      immediateChange: true,
      effectiveDate: new Date().toISOString(),
      additionalNotes: 'Admin rejected pause request'
    };

    await createSubscriptionChangeRecord(subscriptionId, changeData);
    await sendSubscriptionNotification(subscriptionId, 'rejectPause', reason);
    return {
      success: true,
      data: updateResponse.data,
      message: 'Subscription pause request rejected'
    };
  } catch (error) {
    console.error(`Error rejecting pause for subscription ${subscriptionId}:`, error);
    return {
      success: false,
      message: error.message || 'Failed to reject subscription pause'
    };
  }
}

/**
 * Pause a subscription
 * @param {string} subscriptionId - The subscription ID
 * @param {string} userId - User making the request
 * @param {string} reason - Reason for pausing
 * @returns {Promise<Object>} - Response with paused subscription or error
 */
export async function pauseSubscription(subscriptionId, userId = '', reason = '') {
  try {
    if (!subscriptionId) {
      throw new Error('Subscription ID is required');
    }

    // Get current subscription data
    const subResponse = await getDocument(SUBSCRIPTIONS_COLLECTION, subscriptionId);
    if (!subResponse.success) {
      throw new Error(subResponse.message || 'Failed to fetch subscription');
    }

    const currentSubscription = subResponse.data;

    // Update the subscription
    const updateData = {
      status: 'Paused',
      updatedAt: new Date().toISOString()
    };

    // Update the subscription
    const updateResponse = await updateSubscription(subscriptionId, updateData);

    if (!updateResponse.success) {
      throw new Error(updateResponse.message || 'Failed to pause subscription');
    }

    // Create a change record
    const changeData = {
      changeType: 'Pause',
      fromStatus: currentSubscription.status,
      toStatus: 'Paused',
      changeReason: reason || 'User requested pause',
      changedBy: userId || currentSubscription.userId,
      immediateChange: true,
      effectiveDate: new Date().toISOString()
    };

    await createSubscriptionChangeRecord(subscriptionId, changeData);
    await sendSubscriptionNotification(subscriptionId, 'pause', reason);
    return {
      success: true,
      data: updateResponse.data,
      message: 'Subscription paused successfully'
    };
  } catch (error) {
    console.error(`Error pausing subscription ${subscriptionId}:`, error);
    return {
      success: false,
      message: error.message || 'Failed to pause subscription'
    };
  }
}

/**
 * Resume a subscription
 * @param {string} subscriptionId - The subscription ID
 * @param {string} userId - User making the request
 * @param {string} reason - Reason for resuming
 * @returns {Promise<Object>} - Response with resumed subscription or error
 */
export async function resumeSubscription(subscriptionId, userId = '', reason = '') {
  try {
    if (!subscriptionId) {
      throw new Error('Subscription ID is required');
    }

    // Get current subscription data
    const subResponse = await getDocument(SUBSCRIPTIONS_COLLECTION, subscriptionId);
    if (!subResponse.success) {
      throw new Error(subResponse.message || 'Failed to fetch subscription');
    }

    const currentSubscription = subResponse.data;

    // Verify the subscription is in Paused status
    if (currentSubscription.status !== 'Paused') {
      throw new Error('Subscription is not paused');
    }

    // Calculate the next billing date based on billing frequency and interval
    const today = new Date();
    let nextBillingDate = new Date(today);

    if (currentSubscription.billingFrequency && currentSubscription.billingInterval) {
      switch (currentSubscription.billingFrequency.toLowerCase()) {
        case 'day':
          nextBillingDate.setDate(today.getDate() + currentSubscription.billingInterval);
          break;
        case 'week':
          nextBillingDate.setDate(today.getDate() + (currentSubscription.billingInterval * 7));
          break;
        case 'month':
          nextBillingDate.setMonth(today.getMonth() + currentSubscription.billingInterval);
          break;
        case 'year':
          nextBillingDate.setFullYear(today.getFullYear() + currentSubscription.billingInterval);
          break;
        default:
          nextBillingDate.setMonth(today.getMonth() + 1); // Default to 1 month
      }
    } else {
      // Default to 1 month if billing frequency or interval is not specified
      nextBillingDate.setMonth(today.getMonth() + 1);
    }

    // Update the subscription
    const updateData = {
      status: 'Active',
      nextBillingDate: nextBillingDate.toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Update the subscription
    const updateResponse = await updateSubscription(subscriptionId, updateData);

    if (!updateResponse.success) {
      throw new Error(updateResponse.message || 'Failed to resume subscription');
    }

    // Create a change record
    const changeData = {
      changeType: 'Resume',
      fromStatus: 'Paused',
      toStatus: 'Active',
      changeReason: reason || 'User requested resume',
      changedBy: userId || currentSubscription.userId,
      immediateChange: true,
      effectiveDate: new Date().toISOString(),
      additionalNotes: `Next billing date set to ${nextBillingDate.toISOString()}`
    };

    await createSubscriptionChangeRecord(subscriptionId, changeData);
    await sendSubscriptionNotification(subscriptionId, 'resume', reason);
    return {
      success: true,
      data: updateResponse.data,
      message: 'Subscription resumed successfully'
    };
  } catch (error) {
    console.error(`Error resuming subscription ${subscriptionId}:`, error);
    return {
      success: false,
      message: error.message || 'Failed to resume subscription'
    };
  }
}


/**
 * Update auto renewal setting for a subscription
 * @param {string} subscriptionId - The subscription ID
 * @param {boolean} autoRenewal - Auto renewal status (true/false)
 * @returns {Promise<Object>} - Response with updated subscription or error
 */
export async function updateAutoRenewal(subscriptionId, autoRenewal = false,) {
  try {
    if (!subscriptionId) {
      throw new Error('Subscription ID is required');
    }

    if (typeof autoRenewal !== 'boolean') {
      throw new Error('Auto renewal must be a boolean value');
    }

    // Update the subscription
    const updateData = {
      autoRenew: autoRenewal,
      updatedAt: new Date().toISOString()
    };

    // Update the subscription
    const updateResponse = await updateSubscription(subscriptionId, updateData);

    if (!updateResponse.success) {
      throw new Error(updateResponse.message || 'Failed to update auto renewal setting');
    }

    return {
      success: true,
      data: updateResponse.data,
      message: `Auto renewal ${autoRenewal ? 'enabled' : 'disabled'} successfully`
    };
  } catch (error) {
    console.error(`Error updating auto renewal for subscription ${subscriptionId}:`, error);
    return {
      success: false,
      message: error.message || 'Failed to update auto renewal setting'
    };
  }
}


// Updated renewSubscription function for subscriptions.js
/**
 * Professional subscription renewal system
 * @param {string} subscriptionId - The subscription ID
 * @param {string} userId - User making the request
 * @param {string} reason - Reason for renewal
 * @param {Object} options - Renewal options
 * @returns {Promise<Object>} - Response with renewed subscription or error
 */
export async function renewSubscription(subscriptionId, userId = '', reason = '', options = {}) {
  try {
    if (!subscriptionId) {
      throw new Error('Subscription ID is required');
    }

    // Get current subscription data
    const subResponse = await getSingleSubscription(subscriptionId);
    if (!subResponse.success) {
      throw new Error(subResponse.message || 'Failed to fetch subscription');
    }

    const currentSubscription = subResponse.data;

    // Professional renewal eligibility check
    if (!canRenewSubscription(currentSubscription)) {
      throw new Error(`Subscription with status '${currentSubscription.status}' cannot be renewed`);
    }

    const userData = await getUser(currentSubscription.userId);
    const customerId = userData.data.prefs.stripeCustomerId;

    // Default options
    const { processPayment = true } = options;

    if (processPayment) {
      console.log(`Processing subscription renewal with payment for ${subscriptionId}`);

      try {
        const renewalResult = await processStripeSubscriptionRenewal(subscriptionId, customerId, {
          userId,
          reason: reason || getRenewalReason(currentSubscription),
          paymentMethodId: options.paymentMethodId
        });

        if (!renewalResult.success) {
          throw new Error(renewalResult.message || 'Failed to process renewal payment');
        }

        return {
          success: true,
          data: {
            subscription: renewalResult.data.subscription || renewalResult.data.renewalOrder?.subscription,
            renewalOrder: renewalResult.data.renewalOrder,
            parentOrder: renewalResult.data.parentOrder,
            payment: renewalResult.data.payment,
            renewalSequence: renewalResult.data.renewalSequence,
            nextRenewalDate: renewalResult.data.nextRenewalDate
          },
          message: 'Subscription renewed successfully with payment processing'
        };

      } catch (paymentError) {
        console.error(`Payment processing failed for subscription ${subscriptionId}:`, paymentError);

        // Update subscription to PastDue if payment fails and it was Active
        if (currentSubscription.status === 'Active') {
          await updateSubscription(subscriptionId, {
            status: 'PastDue',
            updatedAt: new Date().toISOString()
          });
        }

        throw new Error(`Payment processing failed: ${paymentError.message}`);
      }

    } else {
      // Manual renewal without payment processing
      console.log(`Processing manual subscription renewal without payment for ${subscriptionId}`);

      const nextBillingDate = calculateNextBillingDate(
        currentSubscription.billingFrequency,
        currentSubscription.billingInterval
      );

      // Update the subscription
      const updateData = {
        status: 'Active',
        nextBillingDate: nextBillingDate.toISOString(),
        updatedAt: new Date().toISOString()
      };

      const updateResponse = await updateSubscription(subscriptionId, updateData);

      if (!updateResponse.success) {
        throw new Error(updateResponse.message || 'Failed to renew subscription');
      }

      // Create a change record with proper enum value
      const changeData = {
        changeType: 'Reactivate', // Using allowed enum value
        fromStatus: currentSubscription.status,
        toStatus: 'Active',
        changeReason: reason || 'Manual subscription renewal',
        changedBy: userId || currentSubscription.userId,
        immediateChange: true,
        effectiveDate: new Date().toISOString(),
        additionalNotes: `Subscription renewed manually with next billing date ${nextBillingDate.toISOString()}`
      };

      await createSubscriptionChangeRecord(subscriptionId, changeData);

      return {
        success: true,
        data: {
          subscription: updateResponse.data,
          renewalOrder: null,
          payment: null,
          nextRenewalDate: nextBillingDate.toISOString()
        },
        message: 'Subscription renewed successfully (manual renewal without payment)'
      };
    }

  } catch (error) {
    console.error(`Error renewing subscription ${subscriptionId}:`, error);
    return {
      success: false,
      message: error.message || 'Failed to renew subscription'
    };
  }
}

/**
 * Check if subscription can be renewed (professional conditions)
 * @param {Object} subscription - Subscription object
 * @returns {boolean} - Whether subscription can be renewed
 */
function canRenewSubscription(subscription) {
  const now = new Date();
  const nextBillingDate = subscription.nextBillingDate ? new Date(subscription.nextBillingDate) : null;
  const status = subscription.status;

  // Case 1: Active subscription past due date
  if (status === 'Active' && nextBillingDate && now >= nextBillingDate) {
    return true;
  }

  // Case 2: PastDue status (always renewable)
  if (status === 'PastDue') {
    return true;
  }

  // Case 3: Failed subscription (recovery)
  if (status === 'Failed') {
    return true;
  }

  // Case 4: Canceled subscription (reactivation)
  if (status === 'Canceled') {
    return true;
  }

  // Case 5: Trialing subscription that has ended
  if (status === 'Trialing' && nextBillingDate && now >= nextBillingDate) {
    return true;
  }

  return false;
}

/**
 * Get appropriate renewal reason based on subscription status
 * @param {Object} subscription - Subscription object
 * @returns {string} - Renewal reason
 */
function getRenewalReason(subscription) {
  const now = new Date();
  const nextBillingDate = subscription.nextBillingDate ? new Date(subscription.nextBillingDate) : null;
  const status = subscription.status;

  if (status === 'Active' && nextBillingDate && now >= nextBillingDate) {
    return 'Automatic renewal - billing date passed';
  }
  if (status === 'PastDue') {
    return 'Payment retry for past due subscription';
  }
  if (status === 'Failed') {
    return 'Recovery renewal for failed subscription';
  }
  if (status === 'Canceled') {
    return 'Reactivation of canceled subscription';
  }
  if (status === 'Trialing') {
    return 'Trial to paid conversion';
  }

  return 'Subscription renewal';
}

/**
 * Calculate next billing date
 */
function calculateNextBillingDate(frequency, interval = 1, fromDate = new Date()) {
  const nextDate = new Date(fromDate);

  switch (frequency.toLowerCase()) {
    case 'day':
      nextDate.setDate(nextDate.getDate() + interval);
      break;
    case 'week':
      nextDate.setDate(nextDate.getDate() + (interval * 7));
      break;
    case 'month':
      nextDate.setMonth(nextDate.getMonth() + interval);
      break;
    case 'year':
      nextDate.setFullYear(nextDate.getFullYear() + interval);
      break;
    default:
      nextDate.setMonth(nextDate.getMonth() + 1);
  }

  return nextDate;
}

/**
 * Retry failed renewal
 * @param {string} subscriptionId - Subscription ID
 * @param {string} userId - User ID
 * @param {Object} options - Retry options
 * @returns {Promise<Object>} - Retry result
 */
export async function retryRenewal(subscriptionId, userId = '', options = {}) {
  try {
    // Get subscription to check if it's in a failed state
    const subResponse = await getSingleSubscription(subscriptionId);
    if (!subResponse.success) {
      throw new Error('Failed to fetch subscription for retry');
    }

    const subscription = subResponse.data;

    // Only retry if subscription is in PastDue or Failed status
    if (!['PastDue', 'Failed'].includes(subscription.status)) {
      throw new Error(`Cannot retry renewal for subscription with status '${subscription.status}'`);
    }

    // Attempt renewal with retry reason
    return await renewSubscription(
      subscriptionId,
      userId,
      `Retry renewal attempt - Previous status: ${subscription.status}`,
      options
    );

  } catch (error) {
    console.error(`Error retrying renewal for subscription ${subscriptionId}:`, error);
    return {
      success: false,
      message: error.message || 'Failed to retry renewal'
    };
  }
}

// Convenience wrapper functions
export async function renewSubscriptionManually(subscriptionId, userId, reason = '') {
  return await renewSubscription(subscriptionId, userId, reason, { processPayment: false });
}

/**
 * Change subscription plan or pricing
 * @param {string} subscriptionId - The subscription ID
 * @param {Object} changeData - The changes to apply
 * @param {string} changeData.newPricingId - ID of the new pricing plan
 * @param {string} changeData.newPriceName - Name of the new pricing plan
 * @param {string} changeData.newPlanName - Name of the new plan
 * @param {string} changeData.newProductName - Name of the new product
 * @param {number} changeData.newPrice - New price
 * @param {string} changeData.userId - User making the change
 * @param {string} changeData.reason - Reason for change
 * @returns {Promise<Object>} - Response with updated subscription or error
 */
export async function changeSubscriptionPlan(subscriptionId, changeData) {
  try {
    if (!subscriptionId) {
      throw new Error('Subscription ID is required');
    }

    if (!changeData.newPricingId) {
      throw new Error('New pricing ID is required');
    }

    // Get current subscription data
    const subResponse = await getDocument(SUBSCRIPTIONS_COLLECTION, subscriptionId);
    if (!subResponse.success) {
      throw new Error(subResponse.message || 'Failed to fetch subscription');
    }

    const currentSubscription = subResponse.data;

    // Prepare update data
    const updateData = {
      productPlanPricing: changeData.newPricingId,
      productName: changeData.newProductName || currentSubscription.productName,
      planName: changeData.newPlanName || currentSubscription.planName,
      pricingName: changeData.newPriceName || '',
      price: changeData.newPrice || currentSubscription.price,
      updatedAt: new Date().toISOString()
    };

    // Update the subscription
    const updateResponse = await updateSubscription(subscriptionId, updateData);

    if (!updateResponse.success) {
      throw new Error(updateResponse.message || 'Failed to change subscription plan');
    }

    // Determine change type (Upgrade or Downgrade or PlanChange)
    let changeType = 'PlanChange';
    if (changeData.newPrice > currentSubscription.price) {
      changeType = 'Upgrade';
    } else if (changeData.newPrice < currentSubscription.price) {
      changeType = 'Downgrade';
    }

    // Create a change record
    const subscriptionChangeData = {
      changeType,
      fromPlanId: currentSubscription.productPlanPricing,
      toPlanId: changeData.newPricingId,
      changeReason: changeData.reason || 'Plan change requested',
      changedBy: changeData.userId || currentSubscription.userId,
      immediateChange: true,
      effectiveDate: new Date().toISOString(),
      proratedAmount: changeData.proratedAmount || 0,
      additionalNotes: `Changed from ${currentSubscription.pricingName || 'previous plan'} to ${changeData.newPriceName || 'new plan'}`
    };

    await createSubscriptionChangeRecord(subscriptionId, subscriptionChangeData);

    return {
      success: true,
      data: updateResponse.data,
      message: 'Subscription plan changed successfully'
    };
  } catch (error) {
    console.error(`Error changing plan for subscription ${subscriptionId}:`, error);
    return {
      success: false,
      message: error.message || 'Failed to change subscription plan'
    };
  }
}

/**
 * Change subscription billing frequency
 * @param {string} subscriptionId - The subscription ID
 * @param {Object} changeData - The changes to apply
 * @param {string} changeData.newFrequency - New billing frequency (day, week, month, year)
 * @param {number} changeData.newInterval - New billing interval (number of frequency units)
 * @param {string} changeData.userId - User making the change
 * @param {string} changeData.reason - Reason for change
 * @returns {Promise<Object>} - Response with updated subscription or error
 */
export async function changeSubscriptionFrequency(subscriptionId, changeData) {
  try {
    if (!subscriptionId) {
      throw new Error('Subscription ID is required');
    }

    if (!changeData.newFrequency) {
      throw new Error('New billing frequency is required');
    }

    // Get current subscription data
    const subResponse = await getDocument(SUBSCRIPTIONS_COLLECTION, subscriptionId);
    if (!subResponse.success) {
      throw new Error(subResponse.message || 'Failed to fetch subscription');
    }

    const currentSubscription = subResponse.data;

    // Calculate the next billing date based on new frequency and interval
    const today = new Date();
    let nextBillingDate = new Date(today);
    const newInterval = changeData.newInterval || currentSubscription.billingInterval || 1;

    switch (changeData.newFrequency.toLowerCase()) {
      case 'day':
        nextBillingDate.setDate(today.getDate() + newInterval);
        break;
      case 'week':
        nextBillingDate.setDate(today.getDate() + (newInterval * 7));
        break;
      case 'month':
        nextBillingDate.setMonth(today.getMonth() + newInterval);
        break;
      case 'year':
        nextBillingDate.setFullYear(today.getFullYear() + newInterval);
        break;
      default:
        throw new Error('Invalid billing frequency');
    }

    // Prepare update data
    const updateData = {
      billingFrequency: changeData.newFrequency,
      billingInterval: newInterval,
      nextBillingDate: nextBillingDate.toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Update the subscription
    const updateResponse = await updateSubscription(subscriptionId, updateData);

    if (!updateResponse.success) {
      throw new Error(updateResponse.message || 'Failed to change subscription frequency');
    }

    // Create a change record
    const subscriptionChangeData = {
      changeType: 'FrequencyChange',
      fromFrequency: currentSubscription.billingFrequency,
      toFrequency: changeData.newFrequency,
      changeReason: changeData.reason || 'Billing frequency change requested',
      changedBy: changeData.userId || currentSubscription.userId,
      immediateChange: true,
      effectiveDate: new Date().toISOString(),
      additionalNotes: `Changed from ${currentSubscription.billingFrequency} (interval: ${currentSubscription.billingInterval}) to ${changeData.newFrequency} (interval: ${newInterval})`
    };

    await createSubscriptionChangeRecord(subscriptionId, subscriptionChangeData);

    return {
      success: true,
      data: updateResponse.data,
      message: 'Subscription billing frequency changed successfully'
    };
  } catch (error) {
    console.error(`Error changing frequency for subscription ${subscriptionId}:`, error);
    return {
      success: false,
      message: error.message || 'Failed to change subscription frequency'
    };
  }
}


export const deleteSubscriptionByAdmin = async (subscriptionId) => {
  try {
    // 4. Finally delete the subscription itself
    const result = await deleteDocument(SUBSCRIPTIONS_COLLECTION, subscriptionId);
    return result;
  } catch (error) {
    console.error(`Error deleting subscription ${subscriptionId}:`, error);
    return {
      success: false,
      message: error.message || 'Failed to delete subscription'
    };
  }
};




/**
* Helper function to send subscription status emails
* @param {string} subscriptionId - The subscription ID
* @param {string} actionType - Type of action (pause, resume, cancel, etc.)
* @param {string} changeReason - Reason for the status change
* @returns {Promise<boolean>} - Success status of email sending
*/
export async function sendSubscriptionNotification(subscriptionId, actionType, changeReason) {
  try {
    // Get subscription details
    const subscriptionResponse = await getSingleSubscription(subscriptionId);

    if (!subscriptionResponse.success) {
      console.error(`Could not fetch subscription data for notification: ${subscriptionResponse.message}`);
      return false;
    }

    const subscription = subscriptionResponse.data;



    // Assuming you have a function to get user data
    // This would need to be implemented or use your existing user data fetching function
    const userData = await getUser(subscription.userId);
    const userEmail = userData.data.email;

    if (!userEmail) {
      console.error(`No email address found for subscription ${subscriptionId}`);
      return false;
    }

    // Send the email notification
    const emailResult = await sendSubscriptionStatusEmail(
      userEmail,
      subscription,
      actionType,
      changeReason
    );

    return emailResult.success;
  } catch (error) {
    console.error(`Error sending subscription notification for ${subscriptionId}:`, error);
    return false;
  }
}
