"use server";

import { createDocument, getDocuments, updateDocument } from "./sdk_db";

// Environment variables
const dbId = process.env.CMS_DB_SETTINGS_ID;
const collectionId = process.env.CMS_COLLECTION_ID_SMTP_CONFIG;

/**
 * Standard handler for SMTP configuration operations
 * @param {Function} operation - Async function to execute
 * @param {string} errorMessage - Default error message
 */
const handleSMTPOperation = async (operation, errorMessage) => {
    try {
        // Validate environment variables
        if (!dbId || !collectionId) {
            throw new Error("Missing required environment variables for SMTP config.");
        }
        
        const response = await operation();
        return {
            success: true,
            data: response,
            total: response?.total || (Array.isArray(response) ? response.length : undefined)
        };
    } catch (error) {
        console.error(`${errorMessage}:`, error);
        return {
            success: false,
            message: error.message || errorMessage
        };
    }
};

/**
 * Get SMTP configuration from the database
 */
export async function getSMTPConfig() {
    return handleSMTPOperation(
        async () => {
            const result = await getDocuments(collectionId, [], dbId);
            
            if (!result?.success || !result?.data?.documents?.length) {
                throw new Error("No SMTP configuration found.");
            }
            
            return result.data.documents[0];
        },
        "Failed to retrieve SMTP configuration"
    );
}

/**
 * Create SMTP configuration with default values if none exists
 */
export async function createSMTPConfig() {
    return handleSMTPOperation(
        async () => {
            // Default configuration data
            const defaultConfig = {
                recipientMail: "example@example.com", 
                smtp_host: "example.com",
                smtp_user: "user@example.com",
                smtp_secure: "false",
                smtp_port: 587,
                smtp_password: "password",
            };
            
            // Check for existing configuration
            const existingConfigResponse = await getSMTPConfig();
            
            // Create new configuration if none exists
            if (!existingConfigResponse.success || !existingConfigResponse.data?.$id) {
                const result = await createDocument(collectionId, defaultConfig, null, dbId);
                return result;
            }
            
            // If configuration already exists, return it
            return existingConfigResponse.data;
        },
        "Failed to create SMTP configuration"
    );
}

/**
 * Update existing SMTP configuration
 * @param {Object} data - New SMTP configuration data
 */
export async function updateSMTPConfig(data) {
    return handleSMTPOperation(
        async () => {
            // Get existing configuration
            const existingConfigResponse = await getSMTPConfig();
            
            if (!existingConfigResponse.success || !existingConfigResponse.data?.$id) {
                throw new Error("No existing SMTP configuration found to update.");
            }
            
            const documentId = existingConfigResponse.data.$id;
            
            // Update configuration with new data
            const result = await updateDocument(collectionId, documentId, data, dbId);
            return result;
        },
        "Failed to update SMTP configuration"
    );
}