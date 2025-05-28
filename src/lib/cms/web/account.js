// src\lib\cms\web\account.js
"use client";

import { Client, Account } from "appwrite";
import { generateJWTWEB } from "@/lib/cms/server/jwt";
import { getCmsConfig } from './config';
import { deleteCookie } from "@/lib/cms/server/cookieService";
import { registerUser } from '@/lib/cms/server/sdk_account';
import { getUserIdByEmail, getUserSessions, deleteUserSession } from '@/lib/cms/server/sdk_users';
import { verifyRecaptchaToken } from '@/lib/recaptcha/server';

let accountInstance = null;

async function getAccount() {
  if (!accountInstance) {
    const config = await getCmsConfig();

    if (!config.endpoint || !config.projectId) {
      throw new Error("Missing required configuration: Appwrite endpoint or project ID");
    }

    const client = new Client()
      .setEndpoint(config.endpoint)
      .setProject(config.projectId);

    accountInstance = new Account(client);
  }

  return accountInstance;
}

export async function createSSOSession(provider, redirectPath) {
  const origin = window.location.origin;
  const successUrl = `${origin}/oauth?next=${encodeURIComponent(redirectPath)}`;
  const failureUrl = `${origin}/oauth?error=oauth-failed&next=${encodeURIComponent(redirectPath)}`;

  const account = await getAccount();
  await account.createOAuth2Session(provider, successUrl, failureUrl);
}

// Updated createCredentialsSession function
export async function createCredentialsSession(email, password, recaptchaToken) {
  // Handle reCAPTCHA verification more gracefully
  if (recaptchaToken && process.env.NODE_ENV === 'production') {
    try {
      const verification = await verifyRecaptchaToken(recaptchaToken, 'login');
      if (!verification.success && !verification.fallback) {
        console.warn('reCAPTCHA verification failed, but continuing with login');
      }
    } catch (recaptchaError) {
      console.error('reCAPTCHA verification error:', recaptchaError);
      // Continue with login despite reCAPTCHA errors
    }
  }

  try {
    const account = await getAccount();
    const session = await account.createEmailPasswordSession(email, password);
    await generateJWTWEB(session);

    return { success: true };
  } catch (error) {
    if (error.code === 401 && error.message.includes("session is prohibited when a session is active")) {
      // Get user ID from email
      try {
        const userData = await getUserIdByEmail(email);

        if (userData.success) {
          const userId = userData.data;
          // Get active sessions for the user
          const activeUserSessions = await getUserSessions(userId);

          if (activeUserSessions.success && activeUserSessions.data.sessions) {
            const emailSessions = activeUserSessions.data.sessions;

            // Delete all email sessions
            for (const session of emailSessions) {
              try {
                await deleteUserSession(userId, session.$id);
              } catch (deleteError) {
                console.error("Failed to delete session:", deleteError);
                // Continue with other sessions
              }
            }

            // Try to login again after deleting sessions
            try {
              const account = await getAccount();
              const newSession = await account.createEmailPasswordSession(email, password);
              await generateJWTWEB(newSession);
              return { success: true };
            } catch (retryError) {
              return {
                success: false,
                error: `Failed to login after deleting sessions: ${retryError.message}`
              };
            }
          }
        }
      } catch (sessionError) {
        console.error("Error handling active sessions:", sessionError);
      }
    }

    return {
      success: false,
      error: error.message || 'Failed to login with email and password'
    };
  }
}

/**
 * Fetches the current logged-in user's account details.
 * @returns {Promise<Object>} The user object if successful, or an error object.
 */
export async function getCurrentUser() {
  try {
    const account = await getAccount();
    const user = await account.get();
    return { success: true, data: user };
  } catch (error) {
    console.error("Failed to get current user:", error.message);
    // It's good practice to return a structured error,
    // similar to how other functions in this file do.
    return {
      success: false,
      error: error.message || 'Failed to fetch user data',
      code: error.code // Include error code if available for more specific handling
    };
  }
}

export async function registerSSOSession() {

  try {
    const account = await getAccount();
    const session = await account.getSession('current');
    const userData = await account.get();
    const userPrefs = userData?.prefs;

    if (!userPrefs || Object.keys(userPrefs).length === 0) {
      await registerUser({
        email: userData?.email,
        userId: userData?.$id,
        name: userData?.name,
        hostURL: window.location.origin
      });
    }

    await generateJWTWEB(session);
    return { success: true };
  } catch (error) {
    console.error("SSO login error:", error.message);
    return {
      success: false,
      error: error.message || 'Failed to login with SSO'
    };
  }
}

/**
 * Logs out the user by deleting the current session on both Appwrite and clearing cookies
 * @param {string} redirectPath - Optional path to redirect after logout
 * @returns {Promise<{success: boolean, message?: string}>} Result of logout operation
 */
export async function logout(redirectPath = '/login') {
  try {

    // Get Appwrite account instance
    const account = await getAccount();

    try {
      // Try to delete the current Appwrite session
      await account.deleteSession('current');
    } catch (sessionError) {
      console.warn("Failed to delete Appwrite session:", sessionError.message);
      // Continue with logout even if Appwrite session deletion fails
    }

    await deleteCookie();


    // Redirect to the specified path if we're in a browser environment
    if (typeof window !== 'undefined') {
      window.location.href = redirectPath;
    }

    return {
      success: true,
      message: "Logged out successfully"
    };
  } catch (error) {
    console.error("Logout error:", error.message);
    return {
      success: false,
      error: error.message || 'Failed to logout'
    };
  }
}