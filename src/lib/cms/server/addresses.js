// src\lib\cms\server\addresses.js
"use server";

import { ID, Query } from './sdk_client';
import { createDocument, getDocuments, updateDocument, deleteDocument, getDocument } from './sdk_db';

/**
 * Get all addresses for a specific user
 * @param {string} userId - The user ID
 * @returns {Promise<Object>} Response with user addresses data or error
 */
export async function getUserAddresses(userId) {
  // Create a Query object for userId
  const queries = [
    Query.equal('userId', userId)
  ];

  const response = await getDocuments(
    process.env.CMS_COLLECTION_ID_USER_ADDRESSES,
    queries
  );

  if (!response.success) {
    console.error('Error fetching user addresses:', response.message);
    throw new Error(response.message);
  }

  return {
    addresses: response.data.documents || [],
    total: response.data.total || 0
  };
}

/**
 * Add a new address for a user
 * @param {string} userId - The user ID
 * @param {Object} data - The address data
 * @returns {Promise<Object>} The created address
 */
export async function addUserAddress(userId, data) {
  try {
    // Prepare the address data with userId and timestamps
    const addressData = {
      ...data,
      userId,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // If this is marked as default, we need to update any existing default addresses
    if (data.default) {
      await updateExistingDefaultAddresses(userId, data.addressType);
    }

    const response = await createDocument(
      process.env.CMS_COLLECTION_ID_USER_ADDRESSES,
      addressData,
      ID.unique()
    );

    if (!response.success) {
      console.error('Error creating user address:', response.message);
      return { success: false, message: response.message };
    }

    return { success: true, data: response.data };
  } catch (error) {
    console.error('Exception creating user address:', error);
    return { success: false, message: error.message || 'Failed to create address' };
  }
}

/**
 * Update an existing user address
 * @param {string} userId - The user ID (for validation)
 * @param {string} addressId - The address ID to update
 * @param {Object} addressData - The updated address data
 * @returns {Promise<Object>} The updated address
 */
export async function updateUserAddress(userId, addressId, addressData) {
  const removeSystemFieldsGeneric = (data) => {
    return Object.fromEntries(
      Object.entries(data).filter(([key]) => !key.startsWith('$'))
    );
  };

  const cleanedDataGeneric = removeSystemFieldsGeneric(addressData);

  // Update the updatedAt timestamp
  const updatedData = {
    ...cleanedDataGeneric,
    updatedAt: new Date()
  };

  // If this is marked as default, we need to update any existing default addresses
  if (addressData.default) {
    await updateExistingDefaultAddresses(userId, addressData.addressType, addressId);
  }

  const response = await updateDocument(
    process.env.CMS_COLLECTION_ID_USER_ADDRESSES,
    addressId,
    updatedData
  );

  if (!response.success) {
    console.error('Error updating user address:', response.message);
    throw new Error(response.message);
  }

  return response.data;
}

/**
 * Delete a user address
 * @param {string} userId - The user ID (for validation)
 * @param {string} addressId - The address ID to delete
 * @returns {Promise<Object>} The result of the deletion
 */
export async function deleteUserAddress(userId, addressId) {
  const response = await deleteDocument(
    process.env.CMS_COLLECTION_ID_USER_ADDRESSES,
    addressId
  );

  if (!response.success) {
    console.error('Error deleting user address:', response.message);
    throw new Error(response.message);
  }

  return response.data;
}

/**
 * Helper function to update existing default addresses when a new default is set
 * @param {string} userId - The user ID
 * @param {string} addressType - The address type (Billing or Shipping)
 * @param {string} excludeAddressId - Optional ID to exclude from updates (for updates)
 */
async function updateExistingDefaultAddresses(userId, addressType, excludeAddressId = null) {
  // Create a Query object to find default addresses of the same type
  const queries = [
    Query.equal('userId', userId),
    Query.equal('addressType', addressType),
    Query.equal('default', true)
  ];

  const response = await getDocuments(
    process.env.CMS_COLLECTION_ID_USER_ADDRESSES,
    queries
  );

  if (!response.success) {
    console.error('Error fetching default addresses:', response.message);
    return;
  }

  // Update all existing default addresses to non-default
  const updatePromises = response.data.documents
    .filter(doc => !excludeAddressId || doc.$id !== excludeAddressId)
    .map(doc =>
      updateDocument(
        process.env.CMS_COLLECTION_ID_USER_ADDRESSES,
        doc.$id,
        { default: false, updatedAt: new Date() }
      )
    );

  await Promise.all(updatePromises);
}


/**
 * Get a specific address for a user by address ID
 * @param {string} userId - The user ID
 * @param {string} addressId - The address ID to retrieve
 * @returns {Promise<Object>} Response with the address data or error
 */
export async function getUserAddress(userId, addressId) {
  try {
    // First get the document to verify it exists
    const response = await getDocument(
      process.env.CMS_COLLECTION_ID_USER_ADDRESSES,
      addressId
    );

    if (!response.success) {
      return {
        success: false,
        message: response.message || 'Address not found'
      };
    }

    // Verify the address belongs to this user
    if (response.data.userId !== userId) {
      return {
        success: false,
        message: 'Address does not belong to this user'
      };
    }

    return {
      success: true,
      data: response.data
    };
  } catch (error) {
    console.error(`Error fetching address ${addressId} for user ${userId}:`, error);
    return {
      success: false,
      message: error.message || 'Failed to fetch address'
    };
  }
}