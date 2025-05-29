// src/lib/cms/server/passkey_config.js
"use server";

/**
 * Server-side passkey configuration
 * Safely exports environment variables to client-side components
 */

/**
 * Get passkey configuration for client-side use
 * Only exports safe, non-sensitive environment variables
 * @returns {Promise<Object>} Passkey configuration object
 */
export async function getPasskeyConfig() {
  return {
    // Relying Party Configuration (safe for client)
    rpName: process.env.PASSKEY_RP_NAME || "CyberITEX",
    rpId: process.env.PASSKEY_RP_ID || "localhost",
    origin: process.env.PASSKEY_ORIGIN || "http://localhost:3000",
    
    // Collection IDs (safe for client - they're not sensitive)
    challengesCollectionId: process.env.CMS_COLLECTION_ID_PASSKEY_CHALLENGES || "passKeyChallenges",
    credentialsCollectionId: process.env.CMS_COLLECTION_ID_PASSKEY_CREDENTIALS || "passKeyCredentials",
    
    // Feature flags
    enabled: process.env.PASSKEY_ENABLED !== "false", // Default to enabled
    developmentMode: process.env.NODE_ENV !== "production",
    
    // UI Configuration
    timeout: parseInt(process.env.PASSKEY_TIMEOUT || "60000"), // 60 seconds default
    userVerification: process.env.PASSKEY_USER_VERIFICATION || "preferred", // required, preferred, discouraged
    authenticatorAttachment: process.env.PASSKEY_AUTHENTICATOR_ATTACHMENT || "platform", // platform, cross-platform, or null
    residentKey: process.env.PASSKEY_RESIDENT_KEY || "preferred", // required, preferred, discouraged
  };
}

/**
 * Get server-side only passkey configuration
 * Includes sensitive environment variables that should never be sent to client
 * @returns {Promise<Object>} Server-side passkey configuration
 */
export async function getPasskeyServerConfig() {
  return {
    // Include all client config
    ...(await getPasskeyConfig()),
    
    // Server-only sensitive configuration
    databaseId: process.env.CMS_DB_ID,
    apiKey: process.env.CMS_API_KEY,
    endpoint: process.env.CMS_ENDPOINT,
    projectId: process.env.CMS_PROJECT_ID,
  };
}

/**
 * Validate passkey environment configuration
 * @returns {Promise<{valid: boolean, missing: string[], warnings: string[]}>}
 */
export async function validatePasskeyConfig() {
  const required = [
    'PASSKEY_RP_NAME',
    'PASSKEY_RP_ID',
    'PASSKEY_ORIGIN',
    'CMS_COLLECTION_ID_PASSKEY_CHALLENGES',
    'CMS_COLLECTION_ID_PASSKEY_CREDENTIALS',
    'CMS_DB_ID',
    'CMS_API_KEY',
    'CMS_ENDPOINT',
    'CMS_PROJECT_ID'
  ];

  const optional = [
    'PASSKEY_ENABLED',
    'PASSKEY_TIMEOUT',
    'PASSKEY_USER_VERIFICATION',
    'PASSKEY_AUTHENTICATOR_ATTACHMENT',
    'PASSKEY_RESIDENT_KEY'
  ];

  const missing = required.filter(key => !process.env[key]);
  const warnings = [];

  // Check for common configuration issues
  if (process.env.PASSKEY_RP_ID === "localhost" && process.env.NODE_ENV === "production") {
    warnings.push("PASSKEY_RP_ID is set to 'localhost' in production environment");
  }

  if (process.env.PASSKEY_ORIGIN?.startsWith("http://") && process.env.NODE_ENV === "production") {
    warnings.push("PASSKEY_ORIGIN uses HTTP in production environment (HTTPS recommended)");
  }

  const timeout = parseInt(process.env.PASSKEY_TIMEOUT || "60000");
  if (timeout < 30000 || timeout > 300000) {
    warnings.push("PASSKEY_TIMEOUT should be between 30 seconds and 5 minutes");
  }

  return {
    valid: missing.length === 0,
    missing,
    warnings,
    optional: optional.filter(key => !process.env[key])
  };
}

/**
 * Get passkey configuration status for admin interface
 * @returns {Promise<Object>} Configuration status information
 */
export async function getPasskeyConfigStatus() {
  const validation = await validatePasskeyConfig();
  const config = await getPasskeyConfig();
  
  return {
    isConfigured: validation.valid,
    environment: process.env.NODE_ENV || "development",
    config: {
      rpName: config.rpName,
      rpId: config.rpId,
      origin: config.origin,
      enabled: config.enabled,
      developmentMode: config.developmentMode
    },
    validation,
    recommendations: await getConfigRecommendations()
  };
}

/**
 * Get configuration recommendations based on current environment
 * @returns {Promise<string[]>} Array of recommendation messages
 */
export async function getConfigRecommendations() {
  const recommendations = [];
  const isProduction = process.env.NODE_ENV === "production";
  
  if (isProduction) {
    if (process.env.PASSKEY_RP_ID === "localhost") {
      recommendations.push("Set PASSKEY_RP_ID to your actual domain name for production");
    }
    
    if (process.env.PASSKEY_ORIGIN?.startsWith("http://")) {
      recommendations.push("Use HTTPS (https://) for PASSKEY_ORIGIN in production");
    }
    
    if (process.env.PASSKEY_USER_VERIFICATION !== "required") {
      recommendations.push("Consider setting PASSKEY_USER_VERIFICATION to 'required' for enhanced security in production");
    }
  } else {
    // Development recommendations
    if (!process.env.PASSKEY_RP_ID || process.env.PASSKEY_RP_ID === "localhost") {
      recommendations.push("PASSKEY_RP_ID is correctly set to 'localhost' for development");
    }
  }

  if (!process.env.PASSKEY_ENABLED || process.env.PASSKEY_ENABLED === "true") {
    recommendations.push("Passkeys are enabled - users can register and authenticate with biometrics");
  }

  return recommendations;
}

/**
 * Get safe environment variables for client-side display (admin interface)
 * Masks sensitive values while showing configuration status
 * @returns {Promise<Object[]>} Array of environment variable objects
 */
export async function getPasskeyEnvVarsForDisplay() {
  const envVars = [
    {
      key: 'PASSKEY_RP_NAME',
      value: process.env.PASSKEY_RP_NAME || 'Not Set',
      required: true,
      sensitive: false,
      description: 'Display name for your application'
    },
    {
      key: 'PASSKEY_RP_ID',
      value: process.env.PASSKEY_RP_ID || 'Not Set',
      required: true,
      sensitive: false,
      description: 'Your domain name (localhost for development)'
    },
    {
      key: 'PASSKEY_ORIGIN',
      value: process.env.PASSKEY_ORIGIN || 'Not Set',
      required: true,
      sensitive: false,
      description: 'Full origin URL of your application'
    },
    {
      key: 'CMS_COLLECTION_ID_PASSKEY_CHALLENGES',
      value: process.env.CMS_COLLECTION_ID_PASSKEY_CHALLENGES || 'Not Set',
      required: true,
      sensitive: false,
      description: 'Appwrite collection ID for passkey challenges'
    },
    {
      key: 'CMS_COLLECTION_ID_PASSKEY_CREDENTIALS',
      value: process.env.CMS_COLLECTION_ID_PASSKEY_CREDENTIALS || 'Not Set',
      required: true,
      sensitive: false,
      description: 'Appwrite collection ID for passkey credentials'
    },
    {
      key: 'CMS_DB_ID',
      value: process.env.CMS_DB_ID ? '***SET***' : 'Not Set',
      required: true,
      sensitive: true,
      description: 'Appwrite database ID'
    },
    {
      key: 'CMS_API_KEY',
      value: process.env.CMS_API_KEY ? '***SET***' : 'Not Set',
      required: true,
      sensitive: true,
      description: 'Appwrite API key'
    },
    {
      key: 'CMS_ENDPOINT',
      value: process.env.CMS_ENDPOINT || 'Not Set',
      required: true,
      sensitive: false,
      description: 'Appwrite endpoint URL'
    },
    {
      key: 'CMS_PROJECT_ID',
      value: process.env.CMS_PROJECT_ID ? '***SET***' : 'Not Set',
      required: true,
      sensitive: true,
      description: 'Appwrite project ID'
    },
    {
      key: 'PASSKEY_ENABLED',
      value: process.env.PASSKEY_ENABLED || 'true (default)',
      required: false,
      sensitive: false,
      description: 'Enable/disable passkey functionality'
    },
    {
      key: 'PASSKEY_TIMEOUT',
      value: process.env.PASSKEY_TIMEOUT || '60000 (default)',
      required: false,
      sensitive: false,
      description: 'Passkey operation timeout in milliseconds'
    },
    {
      key: 'PASSKEY_USER_VERIFICATION',
      value: process.env.PASSKEY_USER_VERIFICATION || 'preferred (default)',
      required: false,
      sensitive: false,
      description: 'User verification requirement (required/preferred/discouraged)'
    }
  ];

  return envVars;
}

/**
 * Re-export utility function from passkey_utils for consistency
 * @returns {Promise<boolean>} - True if all required env vars are present
 */
export async function validatePasskeyEnvironment() {
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