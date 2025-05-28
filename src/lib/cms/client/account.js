"use client";

import { createAdminClient } from "./client";
import { generateJWT } from "@/lib/cms/server/jwt";


/**
 * Login using email and password
 * 
 * @param {string} email - User's email address
 * @param {string} password - User's password
 * @returns {Promise} - Promise that resolves to the session data
 */
export async function createCredentialsSession(email, password) {
  try {
    
    const { account } = await createAdminClient();
    
    const session = await account.createEmailPasswordSession(email, password);
    await generateJWT(session);
    return {
      success: true,
      data: session
    };
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Failed to login with email and password'
    };
  }
}



/**
 * Login using email and password
 * 
 * @param {string} userId - User ID
 * @param {string} secret - OAuth2 Secret
 * @returns {Promise} - Promise that resolves to the session data
 */
export async function createSSOSession(userId, secret) {
  try {
    const { account } = await createAdminClient();
    const session = await account.createSession(userId, secret);
    await generateJWT(session);
    return {
      success: true,
      data: session
    };
  } catch (error) {
    console.error("SSO login error0:", error.message);
    return {
      success: false,
      error: error.message || 'Failed to login with SSO'
    };
  }
}