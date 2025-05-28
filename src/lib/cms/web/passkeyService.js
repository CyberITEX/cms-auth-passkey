// src/lib/cms/web/passkeyService.js
"use client";

import {
    generatePasskeyRegistrationOptions,
    verifyPasskeyRegistration,
    generatePasskeyLoginOptions,
    verifyPasskeyLoginAssertion
} from "@/lib/cms/server/sdk_passkey"; // We'll create this server actions file next

/**
 * Initiates the passkey registration process.
 * @param {string} email - The user's email address.
 * @returns {Promise<{success: boolean, message?: string, data?: any}>}
 */
export async function initiatePasskeyRegistration(email) {
    try {
        console.log("[PasskeyService] Initiating registration for:", email);
        // 1. Get options from server
        const optionsResult = await generatePasskeyRegistrationOptions({ email });
        if (!optionsResult.success) {
            return { success: false, message: optionsResult.message || "Failed to get registration options." };
        }

        const publicKeyCredentialCreationOptions = optionsResult.data;

        // Ensure challenge is ArrayBuffer
        publicKeyCredentialCreationOptions.challenge = Uint8Array.from(atob(publicKeyCredentialCreationOptions.challenge), c => c.charCodeAt(0)).buffer;
        // Ensure user.id is ArrayBuffer
        publicKeyCredentialCreationOptions.user.id = Uint8Array.from(atob(publicKeyCredentialCreationOptions.user.id), c => c.charCodeAt(0)).buffer;

        // 2. Create credential with browser
        const credential = await navigator.credentials.create({
            publicKey: publicKeyCredentialCreationOptions
        });

        console.log("[PasskeyService] Credential created:", credential);

        // 3. Send credential to server for verification and storage
        // Convert ArrayBuffers to base64url for server transmission
        const attestationResponse = {
            id: credential.id,
            rawId: btoa(String.fromCharCode.apply(null, new Uint8Array(credential.rawId))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
            type: credential.type,
            response: {
                attestationObject: btoa(String.fromCharCode.apply(null, new Uint8Array(credential.response.attestationObject))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
                clientDataJSON: btoa(String.fromCharCode.apply(null, new Uint8Array(credential.response.clientDataJSON))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
            },
        };

        const verificationResult = await verifyPasskeyRegistration({ email, credential: attestationResponse });
        return verificationResult;

    } catch (error) {
        console.error("Passkey registration error:", error);
        return { success: false, message: error.message || "Passkey registration failed." };
    }
}

/**
 * Initiates the passkey login process.
 * @param {string} [email] - Optional: User's email, might be needed for some flows.
 * @returns {Promise<{success: boolean, message?: string, data?: any}>}
 */
export async function initiatePasskeyLogin(email = '') {
    try {
        console.log("[PasskeyService] Initiating login for:", email || "any user");
        // Implementation will be similar: get options, navigator.credentials.get(), verify assertion
        alert("Passkey login flow initiated (not fully implemented). Check console.");
        return { success: true, message: "Passkey login flow initiated." };
    } catch (error) {
        console.error("Passkey login error:", error);
        return { success: false, message: error.message || "Passkey login failed." };
    }
}