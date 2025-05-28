"use server";

/**
 * Gets CMS configuration values
 * @returns {Promise<Object>} Object containing all CMS configuration values
 */
export async function getCmsConfig() {
  return {
    endpoint: process.env.CMS_ENDPOINT,
    projectId: process.env.CMS_PROJECT_ID,
    databaseId: process.env.CMS_DB_ID,
    apiKey: process.env.CMS_API_KEY,
    ticketsBucket: process.env.CMS_BUCKET_ID_SUPPORT_TICKETS_ATTACHMENTS,
  };
}