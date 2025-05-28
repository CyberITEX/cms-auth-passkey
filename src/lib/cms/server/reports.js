// src\lib\cms\server\reports.js
"use server";

import { createDocument, getDocumentByField } from './sdk_db';
import { getUserSessionFromCookie, getUser } from '@/lib/cms/server/sdk_users';
import { z } from 'zod';

// Get the security assessments collection ID from environment variables
const SECURITY_ASSESSMENTS_COLLECTION = process.env.CMS_COLLECTION_ID_SECURITY_ASSESSMENTS

/**
 * Zod schema for validating report IDs
 */
const reportIdSchema = z
  .string()
  .trim()
  .min(10, { message: "Report ID must be at least 10 characters" })
  .max(50, { message: "Report ID cannot exceed 50 characters" })
  .regex(/^[A-Za-z0-9\-_]+$/, {
    message: "Report ID can only contain letters, numbers, hyphens, and underscores"
  });

/**
 * Registers an email security assessment report in the database
 * 
 * @param {Object} results - The email security assessment results
 * @param {string} reportId - The unique report ID
 * @param {Object} options - Optional parameters
 * @param {string} options.email - Optional email for non-logged-in users
 * @returns {Promise<Object>} The result of the database operation
 */
export async function registerEmailSecurityReport(results, reportId, options = {}) {
  try {
    // Validate inputs
    if (!results || !reportId) {
      return {
        success: false,
        message: "Missing required parameters"
      };
    }

    try {
      reportIdSchema.parse(reportId);
    } catch (error) {
      return {
        success: false,
        message: error instanceof z.ZodError ? error.errors[0].message : "Invalid report ID format"
      };
    }

    // Get current user information if available
    let userId = null;
    let userEmail = null;

    try {
      const sessionResponse = await getUserSessionFromCookie();
      if (sessionResponse?.success) {
        const userResponse = await getUser(sessionResponse.session.userId);
        if (userResponse.success) {
          userId = userResponse.data.$id;
          userEmail = userResponse.data.email;
        }
      }
    } catch (error) {
      console.log("No authenticated user for this report");
      // Continue without user data
    }

    // Use provided email from options if no user is logged in
    if (!userEmail && options.email && validateEmail(options.email)) {
      userEmail = options.email;
    }

    // Calculate expiration date (90 days from now)
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + 90);

    // Prepare document data
    const reportData = {
      createdAt: new Date(),
      reportId: reportId,
      domain: results.domain,
      userId: userId,
      email: userEmail,
      score: results.score.score,
      grade: results.score.grade,
      type: "EmailSecurity",
      status: "Valid",
      reportData: JSON.stringify(results)
    };

    // Save to database
    const response = await createDocument(
      SECURITY_ASSESSMENTS_COLLECTION,
      reportData,
      null // Generate a unique document ID
    );

    return {
      success: response.success,
      reportId: reportId,
      expirationDate: expirationDate,
      message: response.success
        ? "Report registered successfully"
        : response.message || "Failed to register report"
    };
  } catch (error) {
    console.error("Error registering security report:", error);
    return {
      success: false,
      message: error.message || "An error occurred while registering the report"
    };
  }
}

/**
 * Verifies and retrieves an email security report by its report ID
 * 
 * @param {string} reportId - The unique report ID to verify
 * @returns {Promise<Object>} The verification result
 */
export async function verifyEmailSecurityReport(reportId) {
  try {
    // Validate the report ID
    if (!reportId) {
      return {
        success: false,
        verified: false,
        message: "Report ID is required"
      };
    }

    try {
      // Use Zod to validate the report ID format
      reportIdSchema.parse(reportId);
    } catch (error) {
      return {
        success: false,
        verified: false,
        message: error instanceof z.ZodError ? error.errors[0].message : "Invalid report ID format"
      };
    }

    // Fetch document from database using the reportId field
    const response = await getDocumentByField(SECURITY_ASSESSMENTS_COLLECTION, "reportId", reportId);

    if (!response.success || !response.data) {
      return {
        success: false,
        verified: false,
        message: "Report not found"
      };
    }

    const report = response.data;

    // Check if report is expired
    const creationDate = new Date(report.createdAt);
    const expirationDate = new Date(creationDate);
    expirationDate.setDate(expirationDate.getDate() + 90);

    const isExpired = new Date() > expirationDate;

    // Parse report data
    let reportData = {};
    try {
      reportData = JSON.parse(report.reportData || "{}");
    } catch (e) {
      console.error("Error parsing report data:", e);
    }

    return {
      success: true,
      verified: true,
      report: {
        reportId: report.reportId,
        domain: report.domain,
        createdAt: creationDate,
        expirationDate: expirationDate,
        status: isExpired ? "Expired" : report.status,
        type: report.type
      },
      data: reportData, // Full assessment data if needed
      message: isExpired ? "Report has expired" : "Report verified successfully"
    };
  } catch (error) {
    console.error("Error verifying security report:", error);
    return {
      success: false,
      verified: false,
      message: error.message || "An error occurred while verifying the report"
    };
  }
}

/**
 * Server action to verify a report by ID
 * For direct use from client components
 * 
 * @param {string} reportId - The report ID to verify
 * @returns {Promise<Object>} The verification result
 */
export async function verifyReport(reportId) {
  try {
    // Verify the report using the main verification function
    return await verifyEmailSecurityReport(reportId);
  } catch (error) {
    console.error('Error in verification server action:', error);
    return {
      success: false,
      verified: false,
      message: "Server error while verifying report"
    };
  }
}

/**
 * Retrieves all email security reports for a specific domain
 * 
 * @param {string} domain - The domain to retrieve reports for
 * @returns {Promise<Object>} The list of reports
 */
export async function getEmailSecurityReportsByDomain(domain) {
  try {
    if (!domain) {
      return {
        success: false,
        message: "Domain is required",
        reports: []
      };
    }

    // This is a placeholder function that would need to be implemented
    // using your specific database SDK's query capabilities

    return {
      success: true,
      message: "Domain reports query not implemented",
      reports: []
    };
  } catch (error) {
    console.error("Error fetching domain reports:", error);
    return {
      success: false,
      message: error.message || "An error occurred while fetching domain reports",
      reports: []
    };
  }
}

/**
 * Update a report's status in the database
 * 
 * @param {string} reportId - The report ID to update
 * @param {string} status - The new status ('Valid', 'Expired', 'Failed')
 * @returns {Promise<Object>} The result of the update operation
 */
export async function updateReportStatus(reportId, status) {
  try {
    if (!reportId || !status) {
      return {
        success: false,
        message: "Report ID and status are required"
      };
    }

    // Validate the status value
    if (!['Valid', 'Expired', 'Failed'].includes(status)) {
      return {
        success: false,
        message: "Invalid status value. Must be 'Valid', 'Expired', or 'Failed'"
      };
    }

    // This is a placeholder function that would need to be implemented
    // using your specific database SDK's update capabilities

    return {
      success: true,
      message: "Status update not implemented",
      reportId: reportId
    };
  } catch (error) {
    console.error("Error updating report status:", error);
    return {
      success: false,
      message: error.message || "An error occurred while updating report status"
    };
  }
}


// Helper function to validate email
function validateEmail(email) {
  const re = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
  return re.test(String(email).toLowerCase());
}