// src/lib/cms/server/passkey_utils.js
"use server";

import { createAdminClient, ID, Query } from './sdk_client';

/**
 * Utility functions for passkey implementation with SimpleWebAuthn
 */

/**
 * Convert ArrayBuffer to base64url string (for database storage)
 * @param {ArrayBuffer} buffer - The ArrayBuffer to convert
 * @returns {string} - Base64url encoded string
 */
export function arrayBufferToBase64url(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Convert base64url string to ArrayBuffer (for WebAuthn operations)
 * @param {string} base64url - Base64url encoded string
 * @returns {ArrayBuffer} - The decoded ArrayBuffer
 */
export function base64urlToArrayBuffer(base64url) {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padding = base64.length % 4;
  const padded = base64 + '='.repeat(padding ? 4 - padding : 0);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Convert Uint8Array to hex string (for database storage)
 * @param {Uint8Array} uint8Array - The Uint8Array to convert
 * @returns {string} - Hex encoded string
 */
export function uint8ArrayToHex(uint8Array) {
  return Array.from(uint8Array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Convert hex string to Uint8Array (for WebAuthn operations)
 * @param {string} hex - Hex encoded string
 * @returns {Uint8Array} - The decoded Uint8Array
 */
export function hexToUint8Array(hex) {
  const bytes = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.substr(i, 2), 16));
  }
  return new Uint8Array(bytes);
}

/**
 * Generate a secure random challenge
 * @returns {string} - Base64url encoded challenge
 */
export function generateChallenge() {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  return arrayBufferToBase64url(challenge.buffer);
}

/**
 * Store a challenge in the database
 * @param {string} userId - User ID
 * @param {string} challenge - Base64url encoded challenge
 * @param {string} type - Challenge type ('registration' or 'authentication')
 * @param {number} expirationMinutes - Challenge expiration in minutes (default: 5)
 * @returns {Promise<{success: boolean, challengeId?: string, message?: string}>}
 */
export async function storeChallenge(userId, challenge, type, expirationMinutes = 5) {
  try {
    const { databases } = await createAdminClient();
    const databaseId = process.env.CMS_DB_ID;
    const challengesCollectionId = process.env.CMS_COLLECTION_ID_PASSKEY_CHALLENGES;

    if (!challengesCollectionId) {
      throw new Error("CMS_COLLECTION_ID_PASSKEY_CHALLENGES environment variable is required");
    }

    const expiresAt = new Date(Date.now() + expirationMinutes * 60 * 1000).toISOString();

    const challengeDoc = await databases.createDocument(
      databaseId,
      challengesCollectionId,
      ID.unique(),
      {
        userId,
        challenge,
        type,
        expiresAt
      }
    );

    return {
      success: true,
      challengeId: challengeDoc.$id,
      message: "Challenge stored successfully"
    };

  } catch (error) {
    console.error("Error storing challenge:", error);
    return {
      success: false,
      message: error.message || "Failed to store challenge"
    };
  }
}

/**
 * Retrieve and validate a challenge from the database
 * @param {string} challengeId - Challenge document ID
 * @returns {Promise<{success: boolean, challenge?: any, message?: string}>}
 */
export async function getChallenge(challengeId) {
  try {
    const { databases } = await createAdminClient();
    const databaseId = process.env.CMS_DB_ID;
    const challengesCollectionId = process.env.CMS_COLLECTION_ID_PASSKEY_CHALLENGES;

    if (!challengesCollectionId) {
      throw new Error("CMS_COLLECTION_ID_PASSKEY_CHALLENGES environment variable is required");
    }

    const challengeDoc = await databases.getDocument(
      databaseId,
      challengesCollectionId,
      challengeId
    );

    // Check if challenge has expired
    if (new Date(challengeDoc.expiresAt) < new Date()) {
      // Delete expired challenge
      await databases.deleteDocument(databaseId, challengesCollectionId, challengeId);
      return {
        success: false,
        message: "Challenge has expired"
      };
    }

    return {
      success: true,
      challenge: challengeDoc,
      message: "Challenge retrieved successfully"
    };

  } catch (error) {
    console.error("Error getting challenge:", error);
    return {
      success: false,
      message: error.message || "Challenge not found or expired"
    };
  }
}

/**
 * Delete a challenge from the database
 * @param {string} challengeId - Challenge document ID
 * @returns {Promise<{success: boolean, message?: string}>}
 */
export async function deleteChallenge(challengeId) {
  try {
    const { databases } = await createAdminClient();
    const databaseId = process.env.CMS_DB_ID;
    const challengesCollectionId = process.env.CMS_COLLECTION_ID_PASSKEY_CHALLENGES;

    if (!challengesCollectionId) {
      throw new Error("CMS_COLLECTION_ID_PASSKEY_CHALLENGES environment variable is required");
    }

    await databases.deleteDocument(databaseId, challengesCollectionId, challengeId);

    return {
      success: true,
      message: "Challenge deleted successfully"
    };

  } catch (error) {
    console.error("Error deleting challenge:", error);
    return {
      success: false,
      message: error.message || "Failed to delete challenge"
    };
  }
}

/**
 * Store a passkey credential in the database
 * @param {string} userId - User ID
 * @param {Object} credentialData - Credential data from SimpleWebAuthn
 * @returns {Promise<{success: boolean, credentialId?: string, message?: string}>}
 */
export async function storeCredential(userId, credentialData) {
  try {
    const { databases } = await createAdminClient();
    const databaseId = process.env.CMS_DB_ID;
    const credentialsCollectionId = process.env.CMS_COLLECTION_ID_PASSKEY_CREDENTIALS;

    if (!credentialsCollectionId) {
      throw new Error("CMS_COLLECTION_ID_PASSKEY_CREDENTIALS environment variable is required");
    }

    const credentialDoc = await databases.createDocument(
      databaseId,
      credentialsCollectionId,
      ID.unique(),
      {
        userId,
        credentialId: credentialData.credentialId,
        credentialPublicKey: credentialData.credentialPublicKey,
        counter: credentialData.counter || 0,
        deviceType: credentialData.deviceType || 'multiDevice',
        backedUp: credentialData.backedUp || false,
        transports: credentialData.transports ? JSON.stringify(credentialData.transports) : null,
        createdAt: new Date().toISOString()
      }
    );

    return {
      success: true,
      credentialId: credentialDoc.$id,
      message: "Credential stored successfully"
    };

  } catch (error) {
    console.error("Error storing credential:", error);
    return {
      success: false,
      message: error.message || "Failed to store credential"
    };
  }
}

/**
 * Get all credentials for a user
 * @param {string} userId - User ID
 * @returns {Promise<{success: boolean, credentials?: Array, message?: string}>}
 */
export async function getUserCredentials(userId) {
  try {
    const { databases } = await createAdminClient();
    const databaseId = process.env.CMS_DB_ID;
    const credentialsCollectionId = process.env.CMS_COLLECTION_ID_PASSKEY_CREDENTIALS;

    if (!credentialsCollectionId) {
      throw new Error("CMS_COLLECTION_ID_PASSKEY_CREDENTIALS environment variable is required");
    }

    const credentials = await databases.listDocuments(
      databaseId,
      credentialsCollectionId,
      [Query.equal('userId', userId)]
    );

    return {
      success: true,
      credentials: credentials.documents,
      message: `Found ${credentials.documents.length} credentials`
    };

  } catch (error) {
    console.error("Error getting user credentials:", error);
    return {
      success: false,
      credentials: [],
      message: error.message || "Failed to get credentials"
    };
  }
}

/**
 * Get a specific credential by credential ID
 * @param {string} credentialId - Credential ID (hex encoded)
 * @returns {Promise<{success: boolean, credential?: any, message?: string}>}
 */
export async function getCredentialById(credentialId) {
  try {
    const { databases } = await createAdminClient();
    const databaseId = process.env.CMS_DB_ID;
    const credentialsCollectionId = process.env.CMS_COLLECTION_ID_PASSKEY_CREDENTIALS;

    if (!credentialsCollectionId) {
      throw new Error("CMS_COLLECTION_ID_PASSKEY_CREDENTIALS environment variable is required");
    }

    const credentials = await databases.listDocuments(
      databaseId,
      credentialsCollectionId,
      [Query.equal('credentialId', credentialId)]
    );

    if (credentials.documents.length === 0) {
      return {
        success: false,
        message: "Credential not found"
      };
    }

    return {
      success: true,
      credential: credentials.documents[0],
      message: "Credential found"
    };

  } catch (error) {
    console.error("Error getting credential:", error);
    return {
      success: false,
      message: error.message || "Failed to get credential"
    };
  }
}

/**
 * Update credential counter (for replay attack protection)
 * @param {string} credentialDocId - Credential document ID
 * @param {number} newCounter - New counter value
 * @returns {Promise<{success: boolean, message?: string}>}
 */
export async function updateCredentialCounter(credentialDocId, newCounter) {
  try {
    const { databases } = await createAdminClient();
    const databaseId = process.env.CMS_DB_ID;
    const credentialsCollectionId = process.env.CMS_COLLECTION_ID_PASSKEY_CREDENTIALS;

    if (!credentialsCollectionId) {
      throw new Error("CMS_COLLECTION_ID_PASSKEY_CREDENTIALS environment variable is required");
    }

    await databases.updateDocument(
      databaseId,
      credentialsCollectionId,
      credentialDocId,
      { counter: newCounter }
    );

    return {
      success: true,
      message: "Counter updated successfully"
    };

  } catch (error) {
    console.error("Error updating credential counter:", error);
    return {
      success: false,
      message: error.message || "Failed to update counter"
    };
  }
}

/**
 * Delete a credential
 * @param {string} credentialDocId - Credential document ID
 * @returns {Promise<{success: boolean, message?: string}>}
 */
export async function deleteCredential(credentialDocId) {
  try {
    const { databases } = await createAdminClient();
    const databaseId = process.env.CMS_DB_ID;
    const credentialsCollectionId = process.env.CMS_COLLECTION_ID_PASSKEY_CREDENTIALS;

    if (!credentialsCollectionId) {
      throw new Error("CMS_COLLECTION_ID_PASSKEY_CREDENTIALS environment variable is required");
    }

    await databases.deleteDocument(databaseId, credentialsCollectionId, credentialDocId);

    return {
      success: true,
      message: "Credential deleted successfully"
    };

  } catch (error) {
    console.error("Error deleting credential:", error);
    return {
      success: false,
      message: error.message || "Failed to delete credential"
    };
  }
}

/**
 * Get relying party configuration
 * @returns {Object} - RP configuration for SimpleWebAuthn
 */
export function getRelyingPartyConfig() {
  return {
    rpName: process.env.PASSKEY_RP_NAME || "CyberITEX",
    rpID: process.env.PASSKEY_RP_ID || "localhost",
    origin: process.env.PASSKEY_ORIGIN || "http://localhost:3000"
  };
}

/**
 * Validate environment variables for passkey functionality
 * @returns {boolean} - True if all required env vars are present
 */
export function validatePasskeyEnvironment() {
  const required = [
    'PASSKEY_RP_NAME',
    'PASSKEY_RP_ID', 
    'PASSKEY_ORIGIN',
    'CMS_COLLECTION_ID_PASSKEY_CHALLENGES',
    'CMS_COLLECTION_ID_PASSKEY_CREDENTIALS'
  ];

  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error("Missing required environment variables:", missing);
    return false;
  }

  return true;
}