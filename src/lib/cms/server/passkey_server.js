// src/lib/cms/server/passkey_server.js
"use server";

import { 
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} from '@simplewebauthn/server';

import {
  storeChallenge,
  getChallenge,
  deleteChallenge,
  storeCredential,
  getUserCredentials,
  getCredentialById,
  updateCredentialCounter,
  getRelyingPartyConfig,
  validatePasskeyEnvironment,
  uint8ArrayToHex,
  hexToUint8Array
} from './passkey_utils';

import { registerUser } from './sdk_account';
import { generateJWT } from './jwt';
import { getUserIdByEmail } from './sdk_users';

/**
 * Generate passkey registration options for a user
 * @param {string} email - User's email address
 * @param {string} userId - Optional: User ID if user already exists
 * @returns {Promise<{success: boolean, data?: any, message?: string}>}
 */
export async function generatePasskeyRegistrationOptions(email, userId = null) {
  try {
    // Validate environment
    if (!(await validatePasskeyEnvironment())) {
      return {
        success: false,
        message: "Server configuration error. Please check environment variables."
      };
    }

    const rpConfig = await getRelyingPartyConfig();
    
    // If no userId provided, check if user exists or generate a new one
    let actualUserId = userId;
    if (!actualUserId) {
      try {
        const userResult = await getUserIdByEmail(email);
        if (userResult.success) {
          actualUserId = userResult.data;
        } else {
          // User doesn't exist, generate a temporary ID that will be used during registration
          actualUserId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }
      } catch (error) {
        actualUserId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      }
    }

    // Check for existing credentials to avoid duplicate registrations
    let excludeCredentials = [];
    if (!actualUserId.startsWith('temp_')) {
      const existingCreds = await getUserCredentials(actualUserId);
      if (existingCreds.success && existingCreds.credentials.length > 0) {
        excludeCredentials = existingCreds.credentials.map(cred => ({
          id: hexToUint8Array(cred.credentialId),
          type: 'public-key',
          transports: cred.transports ? JSON.parse(cred.transports) : undefined
        }));
      }
    }

    // Generate registration options
    const options = await generateRegistrationOptions({
      rpName: rpConfig.rpName,
      rpID: rpConfig.rpID,
      userID: new TextEncoder().encode(actualUserId), // Convert string to Uint8Array
      userName: email,
      userDisplayName: email.split('@')[0], // Use part before @ as display name
      attestationType: 'none', // 'direct', 'indirect', or 'none'
      excludeCredentials,
      authenticatorSelection: {
        authenticatorAttachment: 'platform', // 'platform', 'cross-platform', or undefined
        userVerification: 'preferred', // 'required', 'preferred', or 'discouraged'
        residentKey: 'preferred', // 'required', 'preferred', or 'discouraged'
      },
      supportedAlgorithmIDs: [-7, -257], // ES256 and RS256
    });

    // Store the challenge in database
    const challengeResult = await storeChallenge(
      actualUserId,
      options.challenge,
      'registration',
      5 // 5 minutes expiration
    );

    if (!challengeResult.success) {
      return {
        success: false,
        message: "Failed to store challenge. Please try again."
      };
    }

    console.log(`[Passkey] Generated registration options for ${email}`);

    return {
      success: true,
      data: {
        options,
        challengeId: challengeResult.challengeId,
        userId: actualUserId
      },
      message: "Registration options generated successfully"
    };

  } catch (error) {
    console.error("Error generating registration options:", error);
    return {
      success: false,
      message: error.message || "Failed to generate registration options"
    };
  }
}

/**
 * Verify passkey registration response and create user account
 * @param {string} email - User's email address
 * @param {string} challengeId - Challenge ID from registration options
 * @param {Object} registrationResponse - Response from WebAuthn API
 * @param {string} hostURL - Host URL for user registration
 * @returns {Promise<{success: boolean, data?: any, message?: string}>}
 */
export async function verifyPasskeyRegistration(email, challengeId, registrationResponse, hostURL) {
  try {
    console.log(`[Passkey Server] Starting verification for ${email}`);
    
    // Get the stored challenge
    const challengeResult = await getChallenge(challengeId);
    if (!challengeResult.success) {
      console.error("[Passkey Server] Challenge retrieval failed:", challengeResult.message);
      return {
        success: false,
        message: "Invalid or expired challenge"
      };
    }

    const { challenge: challengeDoc } = challengeResult;
    const rpConfig = await getRelyingPartyConfig();

    console.log("[Passkey Server] Verifying registration response...");

    // Verify the registration response
    const verification = await verifyRegistrationResponse({
      response: registrationResponse,
      expectedChallenge: challengeDoc.challenge,
      expectedOrigin: rpConfig.origin,
      expectedRPID: rpConfig.rpID,
    });

    const { verified, registrationInfo } = verification;

    if (!verified) {
      console.error("[Passkey Server] Registration verification failed");
      // Clean up challenge
      await deleteChallenge(challengeId);
      return {
        success: false,
        message: "Registration verification failed"
      };
    }

    console.log("[Passkey Server] Registration verified successfully");

    // Get credential info
    const { credential, credentialDeviceType, credentialBackedUp } = registrationInfo;

    // Create or get user account
    let actualUserId = challengeDoc.userId;
    
    if (actualUserId.startsWith('temp_')) {
      console.log("[Passkey Server] Creating new user account...");
      // Create new user account
      const userResult = await registerUser({
        email,
        hostURL,
        name: email.split('@')[0], // Use email prefix as name
        // No password for passkey-only users
      });

      if (!userResult.success) {
        console.error("[Passkey Server] User creation failed:", userResult.message);
        await deleteChallenge(challengeId);
        return {
          success: false,
          message: userResult.message || "Failed to create user account"
        };
      }

      actualUserId = userResult.data.$id;
      console.log("[Passkey Server] User account created with ID:", actualUserId);
    }

    // Store the credential
    const credentialData = {
      credentialId: await uint8ArrayToHex(credential.id),
      credentialPublicKey: await uint8ArrayToHex(credential.publicKey),
      counter: credential.counter,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      transports: registrationResponse.response.transports || []
    };

    console.log("[Passkey Server] Storing credential...");
    const storeResult = await storeCredential(actualUserId, credentialData);
    if (!storeResult.success) {
      console.error("[Passkey Server] Credential storage failed:", storeResult.message);
      await deleteChallenge(challengeId);
      return {
        success: false,
        message: "Failed to store credential"
      };
    }

    // Clean up challenge
    await deleteChallenge(challengeId);

    // Generate session (using your existing JWT system)
    console.log("[Passkey Server] Generating session...");
    const sessionData = {
      $id: `passkey_${Date.now()}`,
      userId: actualUserId,
      provider: 'passkey',
      providerUid: credentialData.credentialId.substring(0, 20), // First 20 chars as identifier
      expire: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
    };

    await generateJWT(sessionData);

    console.log(`[Passkey Server] Successfully registered passkey for ${email}`);

    return {
      success: true,
      data: {
        userId: actualUserId,
        credentialId: storeResult.credentialId
      },
      message: "Passkey registered successfully"
    };

  } catch (error) {
    console.error("Error verifying registration:", error);
    // Clean up challenge on error
    try {
      await deleteChallenge(challengeId);
    } catch (cleanupError) {
      console.error("Error cleaning up challenge:", cleanupError);
    }
    
    return {
      success: false,
      message: error.message || "Registration verification failed"
    };
  }
}

/**
 * Generate passkey authentication options
 * @param {string} email - Optional: User's email address for user-specific auth
 * @returns {Promise<{success: boolean, data?: any, message?: string}>}
 */
export async function generatePasskeyAuthenticationOptions(email = null) {
  try {
    if (!(await validatePasskeyEnvironment())) {
      return {
        success: false,
        message: "Server configuration error. Please check environment variables."
      };
    }

    const rpConfig = getRelyingPartyConfig();
    let allowCredentials = [];
    let userId = null;

    // If email provided, get user-specific credentials
    if (email) {
      try {
        const userResult = await getUserIdByEmail(email);
        if (userResult.success) {
          userId = userResult.data;
          const credsResult = await getUserCredentials(userId);
          
          if (credsResult.success && credsResult.credentials.length > 0) {
            allowCredentials = await Promise.all(credsResult.credentials.map(async (cred) => ({
              id: await hexToUint8Array(cred.credentialId),
              type: 'public-key',
              transports: cred.transports ? JSON.parse(cred.transports) : undefined
            })));
          }
        }
      } catch (error) {
        console.warn("Could not fetch user credentials for email:", email);
        // Continue with discoverable credentials (no allowCredentials)
      }
    }

    // Generate authentication options
    const options = await generateAuthenticationOptions({
      rpID: rpConfig.rpID,
      allowCredentials: allowCredentials.length > 0 ? allowCredentials : undefined,
      userVerification: 'preferred',
      timeout: 60000, // 60 seconds
    });

    // Store the challenge
    const challengeResult = await storeChallenge(
      userId || 'discoverable', // Use 'discoverable' for resident key authentication
      options.challenge,
      'authentication',
      5 // 5 minutes expiration
    );

    if (!challengeResult.success) {
      return {
        success: false,
        message: "Failed to store challenge. Please try again."
      };
    }

    console.log(`[Passkey] Generated authentication options${email ? ` for ${email}` : ' (discoverable)'}`);

    return {
      success: true,
      data: {
        options,
        challengeId: challengeResult.challengeId
      },
      message: "Authentication options generated successfully"
    };

  } catch (error) {
    console.error("Error generating authentication options:", error);
    return {
      success: false,
      message: error.message || "Failed to generate authentication options"
    };
  }
}

/**
 * Verify passkey authentication response and create session
 * @param {string} challengeId - Challenge ID from authentication options
 * @param {Object} authenticationResponse - Response from WebAuthn API
 * @returns {Promise<{success: boolean, data?: any, message?: string}>}
 */
export async function verifyPasskeyAuthentication(challengeId, authenticationResponse) {
  try {
    // Get the stored challenge
    const challengeResult = await getChallenge(challengeId);
    if (!challengeResult.success) {
      return {
        success: false,
        message: "Invalid or expired challenge"
      };
    }

    const { challenge: challengeDoc } = challengeResult;
    const rpConfig = await getRelyingPartyConfig();

    // Get the credential from database
    const credentialId = await uint8ArrayToHex(new Uint8Array(authenticationResponse.rawId));
    const credResult = await getCredentialById(credentialId);
    
    if (!credResult.success) {
      await deleteChallenge(challengeId);
      return {
        success: false,
        message: "Credential not found"
      };
    }

    const storedCredential = credResult.credential;

    // Prepare authenticator data for verification
    const authenticator = {
      credentialID: await hexToUint8Array(storedCredential.credentialId),
      credentialPublicKey: await hexToUint8Array(storedCredential.credentialPublicKey),
      counter: storedCredential.counter,
      transports: storedCredential.transports ? JSON.parse(storedCredential.transports) : undefined
    };

    // Verify the authentication response
    const verification = await verifyAuthenticationResponse({
      response: authenticationResponse,
      expectedChallenge: challengeDoc.challenge,
      expectedOrigin: rpConfig.origin,
      expectedRPID: rpConfig.rpID,
      authenticator,
    });

    const { verified, authenticationInfo } = verification;

    if (!verified) {
      await deleteChallenge(challengeId);
      return {
        success: false,
        message: "Authentication verification failed"
      };
    }

    // Update credential counter to prevent replay attacks
    const { newCounter } = authenticationInfo;
    if (newCounter > storedCredential.counter) {
      await updateCredentialCounter(storedCredential.$id, newCounter);
    }

    // Clean up challenge
    await deleteChallenge(challengeId);

    // Generate session using your existing JWT system
    const sessionData = {
      $id: `passkey_auth_${Date.now()}`,
      userId: storedCredential.userId,
      provider: 'passkey',
      providerUid: credentialId.substring(0, 20),
      expire: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
    };

    await generateJWT(sessionData);

    console.log(`[Passkey] Successfully authenticated user ${storedCredential.userId}`);

    return {
      success: true,
      data: {
        userId: storedCredential.userId,
        credentialId: storedCredential.$id
      },
      message: "Authentication successful"
    };

  } catch (error) {
    console.error("Error verifying authentication:", error);
    // Clean up challenge on error
    try {
      await deleteChallenge(challengeId);
    } catch (cleanupError) {
      console.error("Error cleaning up challenge:", cleanupError);
    }
    
    return {
      success: false,
      message: error.message || "Authentication verification failed"
    };
  }
}

/**
 * Get user's passkey credentials (for account management)
 * @param {string} userId - User ID
 * @returns {Promise<{success: boolean, data?: any, message?: string}>}
 */
export async function getUserPasskeys(userId) {
  try {
    const result = await getUserCredentials(userId);
    
    if (result.success) {
      // Format credentials for frontend display
      const formattedCredentials = result.credentials.map(cred => ({
        id: cred.$id,
        createdAt: cred.createdAt,
        deviceType: cred.deviceType,
        backedUp: cred.backedUp,
        transports: cred.transports ? JSON.parse(cred.transports) : [],
        // Don't expose sensitive data like public keys
      }));

      return {
        success: true,
        data: formattedCredentials,
        message: `Found ${formattedCredentials.length} passkeys`
      };
    }

    return result;

  } catch (error) {
    console.error("Error getting user passkeys:", error);
    return {
      success: false,
      message: error.message || "Failed to get user passkeys"
    };
  }
}

/**
 * Delete a user's passkey credential
 * @param {string} userId - User ID
 * @param {string} credentialDocId - Credential document ID
 * @returns {Promise<{success: boolean, message?: string}>}
 */
export async function deleteUserPasskey(userId, credentialDocId) {
  try {
    // First verify the credential belongs to the user
    const { databases } = await createAdminClient();
    const databaseId = process.env.CMS_DB_ID;
    const credentialsCollectionId = process.env.CMS_COLLECTION_ID_PASSKEY_CREDENTIALS;

    const credential = await databases.getDocument(
      databaseId,
      credentialsCollectionId,
      credentialDocId
    );

    if (credential.userId !== userId) {
      return {
        success: false,
        message: "Unauthorized: Credential does not belong to user"
      };
    }

    const result = await deleteCredential(credentialDocId);
    
    if (result.success) {
      console.log(`[Passkey] Deleted passkey ${credentialDocId} for user ${userId}`);
    }

    return result;

  } catch (error) {
    console.error("Error deleting user passkey:", error);
    return {
      success: false,
      message: error.message || "Failed to delete passkey"
    };
  }
}