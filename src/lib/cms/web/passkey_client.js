// src/lib/cms/web/passkey_client.js
"use client";

import { 
  startRegistration, 
  startAuthentication,
  browserSupportsWebAuthn,
  browserSupportsWebAuthnAutofill
} from '@simplewebauthn/browser';

import {
  generatePasskeyRegistrationOptions,
  verifyPasskeyRegistration,
  generatePasskeyAuthenticationOptions,
  verifyPasskeyAuthentication,
  getUserPasskeys,
  deleteUserPasskey
} from '@/lib/cms/server/passkey_server';

/**
 * Check if the browser supports WebAuthn and passkeys
 * @returns {{webAuthnSupported: boolean, autofillSupported: boolean, passkeySupported: boolean}}
 */
export function checkPasskeySupport() {
  const webAuthnSupported = browserSupportsWebAuthn();
  const autofillSupported = browserSupportsWebAuthnAutofill();
  
  // Basic check for passkey support (more comprehensive checks could be added)
  const passkeySupported = webAuthnSupported && 
    typeof window !== 'undefined' && 
    window.PublicKeyCredential && 
    typeof window.PublicKeyCredential.isConditionalMediationAvailable === 'function';

  return {
    webAuthnSupported,
    autofillSupported,
    passkeySupported
  };
}

/**
 * Register a new passkey for the user
 * @param {string} email - User's email address
 * @param {string} userId - Optional: User ID if user already exists
 * @returns {Promise<{success: boolean, data?: any, message?: string}>}
 */
export async function registerPasskey(email, userId = null) {
  try {
    // Check browser support
    const support = checkPasskeySupport();
    if (!support.webAuthnSupported) {
      return {
        success: false,
        message: "Your browser doesn't support passkeys. Please try a different browser or device."
      };
    }

    console.log("[Passkey Client] Starting registration for:", email);

    // Step 1: Get registration options from server
    const optionsResult = await generatePasskeyRegistrationOptions(email, userId);
    if (!optionsResult.success) {
      return {
        success: false,
        message: optionsResult.message || "Failed to get registration options"
      };
    }

    const { options, challengeId, userId: actualUserId } = optionsResult.data;

    console.log("[Passkey Client] Got registration options, prompting user...");

    // Step 2: Start registration with browser
    let registrationResponse;
    try {
      registrationResponse = await startRegistration(options);
      console.log("[Passkey Client] User completed registration prompt");
    } catch (error) {
      console.error("[Passkey Client] Registration prompt failed:", error);
      
      // Handle specific WebAuthn errors
      if (error.name === 'InvalidStateError') {
        return {
          success: false,
          message: "You already have a passkey registered for this account. Please use it to sign in or remove it first."
        };
      } else if (error.name === 'NotAllowedError') {
        return {
          success: false,
          message: "Passkey registration was cancelled or timed out. Please try again."
        };
      } else if (error.name === 'SecurityError') {
        return {
          success: false,
          message: "Security error during passkey registration. Please ensure you're on a secure connection."
        };
      } else if (error.name === 'AbortError') {
        return {
          success: false,
          message: "Passkey registration was cancelled. Please try again."
        };
      } else if (error.name === 'NotSupportedError') {
        return {
          success: false,
          message: "Your device doesn't support this type of passkey. Please try using a password instead."
        };
      } else if (error.name === 'ConstraintError') {
        return {
          success: false,
          message: "The passkey couldn't be created due to device constraints. Please try again."
        };
      }
      
      return {
        success: false,
        message: error.message || "Failed to create passkey. Please try again."
      };
    }

    // Step 3: Verify registration with server
    console.log("[Passkey Client] Verifying registration with server...");
    const verificationResult = await verifyPasskeyRegistration(
      email,
      challengeId,
      registrationResponse,
      window.location.origin
    );

    if (verificationResult.success) {
      console.log("[Passkey Client] Registration successful!");
    }

    return verificationResult;

  } catch (error) {
    console.error("[Passkey Client] Registration error:", error);
    return {
      success: false,
      message: error.message || "An unexpected error occurred during passkey registration"
    };
  }
}

/**
 * Authenticate user with passkey
 * @param {string} email - Optional: User's email for user-specific authentication
 * @param {boolean} conditional - Whether to use conditional UI (autofill)
 * @returns {Promise<{success: boolean, data?: any, message?: string}>}
 */
export async function authenticateWithPasskey(email = null, conditional = false) {
  try {
    // Check browser support
    const support = checkPasskeySupport();
    if (!support.webAuthnSupported) {
      return {
        success: false,
        message: "Your browser doesn't support passkeys. Please try a different browser or device."
      };
    }

    if (conditional && !support.autofillSupported) {
      console.warn("[Passkey Client] Conditional UI not supported, falling back to modal");
      conditional = false;
    }

    console.log(`[Passkey Client] Starting authentication${email ? ` for ${email}` : ''} (conditional: ${conditional})`);

    // Step 1: Get authentication options from server
    const optionsResult = await generatePasskeyAuthenticationOptions(email);
    if (!optionsResult.success) {
      return {
        success: false,
        message: optionsResult.message || "Failed to get authentication options"
      };
    }

    const { options, challengeId } = optionsResult.data;

    console.log("[Passkey Client] Got authentication options, prompting user...");

    // Step 2: Start authentication with browser
    let authenticationResponse;
    try {
      authenticationResponse = await startAuthentication(options, conditional);
      console.log("[Passkey Client] User completed authentication prompt");
    } catch (error) {
      console.error("[Passkey Client] Authentication prompt failed:", error);
      
      // Handle specific WebAuthn errors
      if (error.name === 'NotAllowedError') {
        return {
          success: false,
          message: "Passkey authentication was cancelled or timed out. Please try again."
        };
      } else if (error.name === 'SecurityError') {
        return {
          success: false,
          message: "Security error during passkey authentication. Please ensure you're on a secure connection."
        };
      } else if (error.name === 'AbortError') {
        return {
          success: false,
          message: "Passkey authentication was aborted. Please try again."
        };
      } else if (error.name === 'InvalidStateError') {
        return {
          success: false,
          message: "No passkeys found for this account. Please register a passkey first."
        };
      }
      
      return {
        success: false,
        message: error.message || "Failed to authenticate with passkey. Please try again."
      };
    }

    // Step 3: Verify authentication with server
    console.log("[Passkey Client] Verifying authentication with server...");
    const verificationResult = await verifyPasskeyAuthentication(challengeId, authenticationResponse);

    if (verificationResult.success) {
      console.log("[Passkey Client] Authentication successful!");
    }

    return verificationResult;

  } catch (error) {
    console.error("[Passkey Client] Authentication error:", error);
    return {
      success: false,
      message: error.message || "An unexpected error occurred during passkey authentication"
    };
  }
}

/**
 * Get user's passkeys for account management
 * @param {string} userId - User ID
 * @returns {Promise<{success: boolean, data?: any, message?: string}>}
 */
export async function getUserPasskeyList(userId) {
  try {
    return await getUserPasskeys(userId);
  } catch (error) {
    console.error("[Passkey Client] Error getting passkey list:", error);
    return {
      success: false,
      message: error.message || "Failed to get passkey list"
    };
  }
}

/**
 * Delete a user's passkey
 * @param {string} userId - User ID
 * @param {string} credentialId - Credential ID to delete
 * @returns {Promise<{success: boolean, message?: string}>}
 */
export async function removePasskey(userId, credentialId) {
  try {
    const result = await deleteUserPasskey(userId, credentialId);
    
    if (result.success) {
      console.log("[Passkey Client] Successfully removed passkey");
    }
    
    return result;
  } catch (error) {
    console.error("[Passkey Client] Error removing passkey:", error);
    return {
      success: false,
      message: error.message || "Failed to remove passkey"
    };
  }
}

/**
 * Check if conditional UI (autofill) is available and set it up
 * @param {HTMLInputElement} emailInput - Email input element
 * @param {Function} onSuccess - Callback for successful authentication
 * @param {Function} onError - Callback for authentication errors
 * @returns {Promise<{success: boolean, abort?: Function}>}
 */
export async function setupConditionalAuth(emailInput, onSuccess, onError) {
  try {
    // Check if conditional UI is supported
    const support = checkPasskeySupport();
    if (!support.autofillSupported) {
      console.log("[Passkey Client] Conditional UI not supported");
      return { success: false };
    }

    // Check if conditional mediation is available
    const conditionalMediation = await PublicKeyCredential.isConditionalMediationAvailable();
    if (!conditionalMediation) {
      console.log("[Passkey Client] Conditional mediation not available");
      return { success: false };
    }

    console.log("[Passkey Client] Setting up conditional authentication...");

    // Set up abort controller for cleanup
    const abortController = new AbortController();
    
    // Start conditional authentication (don't await here, let it run in background)
    authenticateWithPasskey(null, true).then(result => {
      if (!abortController.signal.aborted) {
        if (result.success) {
          onSuccess(result);
        } else {
          // Filter out user cancellation errors
          const isCancellation = result.message && (
            result.message.toLowerCase().includes('cancelled') ||
            result.message.toLowerCase().includes('aborted') ||
            result.message.toLowerCase().includes('not allowed') ||
            result.message.toLowerCase().includes('timed out')
          );
          
          if (!isCancellation) {
            onError(result);
          } else {
            console.log("[Passkey Client] Conditional auth cancelled by user (normal behavior)");
          }
        }
      }
    }).catch(error => {
      if (!abortController.signal.aborted) {
        // Filter out user cancellation errors
        const isCancellation = error.message && (
          error.message.toLowerCase().includes('cancelled') ||
          error.message.toLowerCase().includes('aborted') ||
          error.message.toLowerCase().includes('not allowed') ||
          error.message.toLowerCase().includes('timed out')
        );
        
        if (!isCancellation) {
          onError({ success: false, message: error.message });
        } else {
          console.log("[Passkey Client] Conditional auth cancelled by user (normal behavior)");
        }
      }
    });

    // Add autocomplete attribute to input
    emailInput.setAttribute('autocomplete', 'username webauthn');

    return {
      success: true,
      abort: () => {
        abortController.abort();
        console.log("[Passkey Client] Conditional authentication aborted");
      }
    };

  } catch (error) {
    console.error("[Passkey Client] Error setting up conditional auth:", error);
    return { success: false };
  }
}

/**
 * Utility function to format passkey info for display
 * @param {Object} passkey - Passkey credential object
 * @returns {Object} - Formatted passkey info
 */
export function formatPasskeyForDisplay(passkey) {
  const deviceTypeLabels = {
    singleDevice: 'This device only',
    multiDevice: 'Synced across devices'
  };

  const transportLabels = {
    internal: 'Built-in authenticator',
    usb: 'USB security key',
    nfc: 'NFC device',
    ble: 'Bluetooth device',
    hybrid: 'Nearby device'
  };

  const createdDate = new Date(passkey.createdAt).toLocaleDateString();
  const deviceType = deviceTypeLabels[passkey.deviceType] || passkey.deviceType;
  const transports = passkey.transports.map(t => transportLabels[t] || t).join(', ');

  return {
    id: passkey.id,
    createdDate,
    deviceType,
    transports,
    backedUp: passkey.backedUp,
    displayName: `Passkey created ${createdDate}`,
    subtitle: `${deviceType}${transports ? ` • ${transports}` : ''}`
  };
}

/**
 * Higher-order function to add passkey support to existing forms
 * @param {Function} originalSubmitHandler - Original form submit handler
 * @param {string} email - User's email
 * @param {boolean} isRegistration - Whether this is a registration form
 * @returns {Function} - Enhanced submit handler with passkey support
 */
export function withPasskeySupport(originalSubmitHandler, email, isRegistration = false) {
  return async (formData, usePasskey = false) => {
    if (usePasskey) {
      try {
        if (isRegistration) {
          return await registerPasskey(email);
        } else {
          return await authenticateWithPasskey(email);
        }
      } catch (error) {
        return {
          success: false,
          message: error.message || "Passkey operation failed"
        };
      }
    } else {
      // Use original submit handler for traditional auth
      return await originalSubmitHandler(formData);
    }
  };
}

// Export support check for easy access
export { browserSupportsWebAuthn, browserSupportsWebAuthnAutofill } from '@simplewebauthn/browser';