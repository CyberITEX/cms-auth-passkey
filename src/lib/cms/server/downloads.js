'use server';
import { Query } from 'appwrite';
import { createDocument, getDocuments, updateDocument, deleteDocument, getDocument } from './sdk_db';
import { ID } from './sdk_client';
import { uploadFile as sdkUploadFile } from './sdk_storage';
import { getPlanById } from './plans';
const userFilesCollectionId = process.env.CMS_COLLECTION_ID_USER_DOWNLOADABLE_FILES;
const userDownloadsCollectionId = process.env.CMS_COLLECTION_ID_USER_DOWNLOADS;
const userFilesBucketId = process.env.CMS_BUCKET_ID_USER_DOWNLOADABLE_FILES;
/**
 * Standard response handler for downloads operations
 * @param {Object} response - The response to format
 * @returns {Object} - Formatted response
 */
const formatResponse = (response) => {
  if (!response.success) {
    return {
      success: false,
      message: response.message || 'An error occurred while fetching downloads',
      downloads: []
    };
  }
  return {
    success: true,
    downloads: response.data?.documents || [],
    total: response.total
  };
};



/**
 * Get all users download items with filtering, sorting, and pagination
 * @param {number} limit - Maximum number of items to return
 * @param {number} offset - Offset for pagination
 * @param {Object} options - Additional options for filtering and pagination
 * @param {string} options.search - Search term for filenames, descriptions, or source types
 * @param {string} options.status - Filter by enabled status ('true' or 'false')
 * @param {string} options.category - Filter by category
 * @param {string} options.sourceType - Filter by source type
 * @param {string} options.timeFilter - Filter by time period (e.g., '3days', '7days', '30days', '3months')
 * @param {string} options.sortField - Field to sort by (default: '$createdAt')
 * @param {string} options.sortOrder - Sort direction ('asc' or 'desc', default: 'desc')
 * @returns {Promise<Object>} - Download items response
 */
export async function getAllUserDownloadItems(limit = null, offset = 0, options = {}) {
  try {
    // Extract options
    const {
      search = null,
      status = null,
      category = null,
      sourceType = null,
      timeFilter = null,
      sortField = '$createdAt',
      sortOrder = 'desc'
    } = options;

    // Create queries array
    const queries = [];

    // Add limit and offset
    if (limit !== null) queries.push(Query.limit(limit));
    if (offset > 0) queries.push(Query.offset(offset));

    // Add search filter if provided
    if (search) {
      queries.push(
        Query.or([
          Query.search('fileName', search),
          Query.search('description', search),
          Query.search('fileType', search),
          Query.search('sourceType', search),
          Query.search('source', search)
        ])
      );
    }

    // Add status filter (enabled/disabled)
    if (status === 'true' || status === 'false') {
      const isEnabled = status === 'true';
      queries.push(Query.equal('enabled', isEnabled));
    }

    // Add category filter
    if (category && category !== 'all') {
      queries.push(Query.equal('category', category));
    }

    // Add sourceType filter
    if (sourceType && sourceType !== 'all') {
      queries.push(Query.equal('sourceType', sourceType));
    }

    // Add time filter
    if (timeFilter) {
      const now = new Date();
      let filterDate;

      switch (timeFilter) {
        case '3days':
          filterDate = new Date(now.setDate(now.getDate() - 3));
          break;
        case '7days':
          filterDate = new Date(now.setDate(now.getDate() - 7));
          break;
        case '30days':
          filterDate = new Date(now.setDate(now.getDate() - 30));
          break;
        case '3months':
          filterDate = new Date(now.setDate(now.getDate() - 90));
          break;
        default:
          filterDate = null;
      }

      if (filterDate) {
        queries.push(Query.greaterThan('$createdAt', filterDate.toISOString()));
      }
    }

    // Add sorting
    if (sortField) {
      if (sortOrder.toLowerCase() === 'asc') {
        queries.push(Query.orderAsc(sortField));
      } else {
        queries.push(Query.orderDesc(sortField));
      }
    }

    // Get user download items with all filters applied
    const response = await getDocuments(userFilesCollectionId, queries);
    // Get total count for pagination
    const totalCount = response.total || response.documents?.length || 0;

    return {
      success: true,
      downloads: response.data.documents || [],
      total: totalCount,
      message: 'Download items retrieved successfully'
    };
  } catch (error) {
    console.error('Error fetching user downloads:', error);
    return {
      success: false,
      message: error.message || 'Failed to retrieve download history',
      downloads: [],
      total: 0
    };
  }
}

/**
 * Get user download items based on user and company info with filtering, sorting, and pagination
 * @param {string} userId - The user ID
 * @param {string} companyName - Company name
 * @param {string} companyDomain - Company domain
 * @param {string} teamId - Team ID
 * @param {number} limit - Maximum number of items to return
 * @param {number} offset - Offset for pagination
 * @param {Object} options - Additional options for filtering and pagination
 * @param {string} options.search - Search term for filenames, descriptions, or source types
 * @param {string} options.status - Filter by enabled status ('true' or 'false')
 * @param {string} options.category - Filter by category
 * @param {string} options.sourceType - Filter by source type
 * @param {string} options.timeFilter - Filter by time period (e.g., '3days', '7days', '30days', '3months')
 * @param {string} options.sortField - Field to sort by (default: '$createdAt')
 * @param {string} options.sortOrder - Sort direction ('asc' or 'desc', default: 'desc')
 * @returns {Promise<Object>} - Download items response
 */
export async function getUserDownloadItems(
  userId,
  companyIds,
  teamIds,
  limit = null,
  offset = 0,
  options = {}
) {
  try {
    // Extract options
    const {
      search = null,
      status = null,
      category = null,
      sourceType = null,
      timeFilter = null,
      sortField = '$createdAt',
      sortOrder = 'desc'
    } = options;

    // Create an array of conditions where ANY match should return the document
    const orConditions = [Query.equal('isPublic', true)];

    // Add each condition only if the parameter is provided
    if (userId) {
      orConditions.push(Query.equal('userId', userId));
    }

    if (companyIds && companyIds.length > 0) {
      orConditions.push(Query.equal('companyId', companyIds));
    }

    if (teamIds && teamIds.length > 0) {
      orConditions.push(Query.equal('teamId', teamIds));
    }

    // If none of the parameters were provided, return early
    if (orConditions.length === 1) { // Only the isPublic condition
      return {
        success: false,
        message: 'At least one search parameter is required',
        downloads: [],
        total: 0
      };
    }

    // Create queries array starting with the OR condition for ownership/access
    const queries = [Query.or(orConditions)];

    // Add limit and offset
    if (limit !== null) queries.push(Query.limit(limit));
    if (offset > 0) queries.push(Query.offset(offset));

    // Add search filter if provided
    if (search) {
      queries.push(
        Query.or([
          Query.search('fileName', search),
          Query.search('description', search),
          Query.search('fileType', search),
          Query.search('sourceType', search),
          Query.search('source', search)
        ])
      );
    }

    // Add status filter (enabled/disabled)
    if (status === 'true' || status === 'false') {
      const isEnabled = status === 'true';
      queries.push(Query.equal('enabled', isEnabled));
    }

    // Add category filter
    if (category && category !== 'all') {
      queries.push(Query.equal('category', category));
    }

    // Add sourceType filter
    if (sourceType && sourceType !== 'all') {
      queries.push(Query.equal('sourceType', sourceType));
    }

    // Add time filter
    if (timeFilter) {
      const now = new Date();
      let filterDate;

      switch (timeFilter) {
        case '3days':
          filterDate = new Date(now.setDate(now.getDate() - 3));
          break;
        case '7days':
          filterDate = new Date(now.setDate(now.getDate() - 7));
          break;
        case '30days':
          filterDate = new Date(now.setDate(now.getDate() - 30));
          break;
        case '3months':
          filterDate = new Date(now.setDate(now.getDate() - 90));
          break;
        default:
          filterDate = null;
      }

      if (filterDate) {
        queries.push(Query.greaterThan('$createdAt', filterDate.toISOString()));
      }
    }

    // Add sorting
    if (sortField) {
      if (sortOrder.toLowerCase() === 'asc') {
        queries.push(Query.orderAsc(sortField));
      } else {
        queries.push(Query.orderDesc(sortField));
      }
    }

    // Get user download items with all filters applied
    const response = await getDocuments(userFilesCollectionId, queries);

    // Get total count for pagination
    const totalCount = response.total || response.documents?.length || 0;
    return {
      success: true,
      downloads: response.data.documents || [],
      total: totalCount,
      message: 'Download items retrieved successfully'
    };
  } catch (error) {
    console.error('Error fetching user downloads:', error);
    return {
      success: false,
      message: error.message || 'Failed to retrieve download history',
      downloads: [],
      total: 0
    };
  }
}


/**
 * Format downloads data for the UI by combining file availability and download history
 * @param {Array} userDownloads - User download history
 * @param {Array} availableFiles - Available files from plans
 * @returns {Array} - Formatted downloads
 */
export async function formatDownloadsData(availableFiles) {
  // Process each available file
  const formattedFiles = availableFiles.map(file => {
    // Determine file type from filename or stored type
    const fileType = file.fileType || getFileTypeFromFilename(file.fileName);

    // Find matching subscription if subscriptionId exists and order has subscriptions
    let subscription = null;
    if (file.subscriptionId && file.order && file.order.subscriptions &&
      Array.isArray(file.order.subscriptions)) {
      // Find subscription with matching subscriptionId
      subscription = file.order.subscriptions.find(
        sub => sub.$id === file.subscriptionId
      );
    }

    return {
      id: file.$id,
      filename: file.fileName,
      description: file.description || '',
      type: fileType,
      size: file.fileSizeFormatted || formatFileSize(file.fileSize),
      url: file.fileUrl,
      // If it exists in userDownloads, it has been downloaded before
      downloaded: file.lastDownloadedAt ? true : false,
      downloadCount: file.downloadCount,
      sourceType: file.sourceType,
      source: file.source,
      order: file.order,
      enabled: file.enabled,
      subscriptionId: file.subscriptionId,
      isPublic: file.isPublic,
      subscription: subscription, // Add the subscription object if found
      userId: file.userId,
      companyName: file.companyName,
      companyDomain: file.companyDomain,
      teamId: file.teamId,
      date: file.uploadedAt,
      userDownloads: file.userDownloads || [],
    };
  });

  // Sort by date, newest first
  return formattedFiles;
}

/**
 * Helper function to determine file type from filename
 * @param {string} filename - The filename to analyze
 * @returns {string} - The file type/extension
 */
function getFileTypeFromFilename(filename) {
  if (!filename) return 'unknown';

  const parts = filename.split('.');
  if (parts.length > 1) {
    return parts[parts.length - 1].toLowerCase();
  }

  return 'N/A';
}

/**
 * Format file size for display
 * @param {number} bytes - File size in bytes
 * @returns {string} - Formatted file size
 */
function formatFileSize(bytes) {
  if (!bytes || isNaN(bytes)) return 'Unknown size';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * Creates a new download access record
 * @param {Object} accessData - Access information object
 * @returns {Promise<Object>} - Response with success status and data
 */
export async function createDownloadAccess(accessData) {
  try {
    // Validate required parameters based on source type
    const { sourceType, fileID, fileName, fileUrl } = accessData;

    if (!sourceType || !fileID || !fileName || !fileUrl) {
      return {
        success: false,
        message: 'Source type, file ID, file name, and file URL are required'
      };
    }

    // Validate source parameter based on sourceType
    if (sourceType === 'admin' && !accessData.userId) {
      return {
        success: false,
        message: 'User ID is required for admin source type'
      };
    }

    if (sourceType === 'company' && (!accessData.companyId)) {
      return {
        success: false,
        message: 'Company ID is required for company source type'
      };
    }

    // Prepare base access data
    const accessRecord = {
      fileID,
      fileName,
      fileUrl,
      sourceType,
      source: accessData.source || '',
      uploadedAt: new Date().toISOString(),
      enabled: accessData.enabled ?? true,
      downloadCount: 0,
      lastDownloadedAt: null,
      ...accessData
    };

    // Create the access record
    const result = await createDocument(userFilesCollectionId, accessRecord);

    if (!result.success) {
      return {
        success: false,
        message: result.message || 'Failed to create download access'
      };
    }

    return {
      success: true,
      data: result.data
    };
  } catch (error) {
    console.error('Error creating download access:', error);
    return {
      success: false,
      message: error.message || 'Failed to create download access'
    };
  }
}




/**
 * Check if user has access to a file
 * @param {string} userId - User ID
 * @param {string} fileID - File ID
 * @returns {Promise<Object>} - Response with access status
 */
export async function checkDownloadAccess(userId, fileID) {
  try {
    if (!userId || !fileID) {
      return {
        success: false,
        message: 'User ID and file ID are required',
        hasAccess: false
      };
    }

    // Check for active access record
    const accessResponse = await getDocuments(
      userFilesCollectionId,
      [
        Query.equal('userId', userId),
        Query.equal('fileID', fileID),
        Query.equal('enabled', true),
        Query.limit(1)
      ]
    );

    if (!accessResponse.success) {
      return {
        success: false,
        message: 'Failed to check access',
        hasAccess: false
      };
    }

    const hasAccess = accessResponse.data?.documents?.length > 0;

    return {
      success: true,
      hasAccess,
      accessRecord: hasAccess ? accessResponse.data.documents[0] : null
    };
  } catch (error) {
    console.error('Error checking download access:', error);
    return {
      success: false,
      message: error.message || 'Failed to check download access',
      hasAccess: false
    };
  }
}


/**
 * Create download access for all files in a plan
 * @param {string} userId - User ID
 * @param {string} planId - Plan ID
 * @param {string} orderId - Order ID
 * @param {string} subscriptionId - subsciption ID
 * @param {Object} orderDetails - Order details (order number, type, etc.)
 * @returns {Promise<Object>} - Response with success status and created access records
 */
export async function createPlanDownloadAccess(userId, planId, orderId, subscriptionId, orderDetails) {
  try {
    // Get all files associated with the plan
    const planResponse = await getPlanById(planId);
    const planFiles = planResponse.planFiles || [];
    const accessRecords = [];
    const errors = [];

    // Create access for each file
    for (const file of planFiles) {
      const accessData = {
        userId,
        fileID: file.fileID,
        source: orderDetails.orderNumber,
        sourceType: 'order',
        order: orderId,
        fileName: file.fileName,
        fileUrl: file.fileUrl,
        fileType: file.fileType,
        fileSize: file.fileSize,
        fileSizeFormatted: file.fileSizeFormatted,
        description: file.description,
        category: file.category,
        version: file.version,
        subscriptionId: subscriptionId
      };

      const result = await createDownloadAccess(accessData);

      if (result.success) {
        accessRecords.push(result.data);
      } else {
        errors.push({
          fileID: file.fileID,
          error: result.message
        });
      }
    }

    return {
      success: errors.length === 0,
      message: errors.length === 0
        ? 'All download access records created successfully'
        : `Created ${accessRecords.length} of ${planFiles.length} access records`,
      data: {
        created: accessRecords,
        failed: errors
      }
    };
  } catch (error) {
    console.error('Error creating plan download access:', error);
    return {
      success: false,
      message: error.message || 'Failed to create plan download access'
    };
  }
}

/**
 * Create access for a specific user
 * @param {Object} accessData - Access information including userId
 * @returns {Promise<Object>} - Response with success status and created record
 */
export async function createUserDownloadAccess(accessData) {
  try {
    if (!accessData.userId || !accessData.fileID) {
      return {
        success: false,
        message: 'User ID and file ID are required'
      };
    }

    // Set source type to admin
    accessData.sourceType = 'admin';
    accessData.source = 'Admin';

    return await createDownloadAccess(accessData);
  } catch (error) {
    console.error('Error creating user download access:', error);
    return {
      success: false,
      message: error.message || 'Failed to create user download access'
    };
  }
}

/**
 * Create access for a company
 * @param {Object} accessData - Access information including companyName and companyDomain
 * @returns {Promise<Object>} - Response with success status and created record
 */
export async function createCompanyDownloadAccess(accessData) {
  try {
    if (!accessData.companyId || !accessData.fileID) {
      return {
        success: false,
        message: 'Company Id, and file ID are required'
      };
    }

    // Set source type to company
    accessData.sourceType = 'company';
    accessData.source = accessData.companyId;

    return await createDownloadAccess(accessData);
  } catch (error) {
    console.error('Error creating company download access:', error);
    return {
      success: false,
      message: error.message || 'Failed to create company download access'
    };
  }
}

/**
 * Create public access for a file
 * @param {Object} accessData - Access information for public file
 * @returns {Promise<Object>} - Response with success status and created record
 */
export async function createPublicDownloadAccess(accessData) {
  try {
    if (!accessData.fileID) {
      return {
        success: false,
        message: 'File ID is required'
      };
    }

    // Set source type to public
    accessData.sourceType = 'system';
    accessData.source = 'System';
    accessData.isPublic = true;

    return await createDownloadAccess(accessData);
  } catch (error) {
    console.error('Error creating public download access:', error);
    return {
      success: false,
      message: error.message || 'Failed to create public download access'
    };
  }
}

/**
 * Create download access based on the selected type
 * @param {Object} formData - Form data submitted by the user
 * @param {string} currentUserId - ID of the current user creating the access
 * @returns {Promise<Object>} - Response with success status and created record
 */
export async function handleDownloadAccessCreation(formData, currentUserId) {
  try {
    const { sourceType } = formData;

    // Add uploaded by information
    formData.uploadedBy = currentUserId;

    // Create the appropriate access type
    switch (sourceType) {
      case 'admin':
        return await createUserDownloadAccess(formData);
      case 'company':
        return await createCompanyDownloadAccess(formData);
      case 'system':
        return await createPublicDownloadAccess(formData);
      default:
        return {
          success: false,
          message: 'Invalid source type specified'
        };
    }
  } catch (error) {
    console.error('Error handling download access creation:', error);
    return {
      success: false,
      message: error.message || 'Failed to create download access'
    };
  }
}

/**
 * Update download count and last downloaded timestamp, and create a record in userDownloads collection
 * @param {string} accessRecordId - Access record ID
 * @param {string} userId - ID of the user downloading the file
 * @param {Object} clientInfo - Information about the client (userAgent, ipAddress)
 * @returns {Promise<Object>} - Response with success status
 */
export async function recordDownloadActivity(accessRecordId, userId, clientInfo = {}) {
  try {
    if (!accessRecordId) {
      return {
        success: false,
        message: 'Access record ID is required'
      };
    }

    // Get current access record from userFiles collection
    const accessResponse = await getDocument(userFilesCollectionId, accessRecordId);

    if (!accessResponse.success) {
      return {
        success: false,
        message: 'Access record not found'
      };
    }

    const fileRecord = accessResponse.data;
    const currentCount = fileRecord?.downloadCount || 0;
    const timestamp = new Date().toISOString();

    // 1. Update the userFiles record with new download count and timestamp
    const updateResult = await updateDocument(
      userFilesCollectionId,
      accessRecordId,
      {
        downloadCount: currentCount + 1,
        lastDownloadedAt: timestamp
      }
    );

    if (!updateResult.success) {
      return {
        success: false,
        message: 'Failed to update download statistics',
        error: updateResult.message
      };
    }

    // 2. Create a record in the userDownloads collection
    const downloadRecord = {
      userId: userId || fileRecord.userId, // Use provided userId or fallback to file's userId
      file: accessRecordId, // Relationship to the userFiles record
      downloadedAt: timestamp,
      userAgent: clientInfo.userAgent || 'Unknown',
      ipAddress: clientInfo.ipAddress || 'Unknown',
      completed: true,
      downloadError: null,
      // Denormalized fields from the file record for convenience
      fileName: fileRecord.fileName,
      fileType: fileRecord.fileType,
      fileSize: fileRecord.fileSize
    };

    const createDownloadResult = await createDocument(userDownloadsCollectionId, downloadRecord);

    if (!createDownloadResult.success) {
      // Even if this fails, we still updated the file record, so return partial success
      return {
        success: true,
        partialSuccess: true,
        message: 'Download count updated but failed to create download record',
        error: createDownloadResult.message,
        data: updateResult.data
      };
    }

    // Success - both records updated
    return {
      success: true,
      message: 'Download activity recorded successfully',
      data: {
        fileUpdate: updateResult.data,
        downloadRecord: createDownloadResult.data
      }
    };
  } catch (error) {
    console.error('Error recording download activity:', error);
    return {
      success: false,
      message: error.message || 'Failed to record download activity'
    };
  }
}

/**
 * Toggle the enabled status of a download file
 * @param {string} fileId - The ID of the file to toggle
 * @param {boolean} enabled - The new enabled status
 * @returns {Promise<Object>} - Response with success status
 */
export async function toggleDownloadEnabled(fileId, enabled) {
  try {
    if (!fileId) {
      return {
        success: false,
        message: 'File ID is required'
      };
    }

    // Update the file enabled status
    const updateResult = await updateDocument(
      userFilesCollectionId,
      fileId,
      {
        enabled: enabled
      }
    );

    if (!updateResult.success) {
      return {
        success: false,
        message: updateResult.message || 'Failed to update file status'
      };
    }

    return {
      success: true,
      message: `File has been ${enabled ? 'enabled' : 'disabled'} successfully`,
      data: updateResult.data
    };
  } catch (error) {
    console.error('Error toggling download status:', error);
    return {
      success: false,
      message: error.message || 'Failed to update file status'
    };
  }
}

/**
 * Delete a download file
 * @param {string} fileId - The ID of the file to delete
 * @returns {Promise<Object>} - Response with success status
 */
export async function deleteDownloadFile(fileId) {
  try {
    if (!fileId) {
      return {
        success: false,
        message: 'File ID is required'
      };
    }

    // Delete the file
    const deleteResult = await deleteDocument(
      userFilesCollectionId,
      fileId
    );

    if (!deleteResult.success) {
      return {
        success: false,
        message: deleteResult.message || 'Failed to delete file'
      };
    }

    return {
      success: true,
      message: 'File has been deleted successfully',
      data: deleteResult.data
    };
  } catch (error) {
    console.error('Error deleting download file:', error);
    return {
      success: false,
      message: error.message || 'Failed to delete file'
    };
  }
}



/**
 * Upload a file and format the response for the download access form
 * @param {FormData} formData - The form data containing the file
 * @param {string} [bucketId] - The bucket's unique ID where the file will be stored
 * @returns {Promise<Object>} A standardized response with file details
 */
export const uploadFile = async (formData, bucketId = userFilesBucketId) => {
  try {
    // Extract the file from FormData
    const file = formData.get('file');

    if (!file) {
      throw new Error('No file provided');
    }

    // Generate a unique file ID
    const fileId = ID.unique();

    // Upload the file using the SDK function
    const uploadResponse = await sdkUploadFile(bucketId, file, fileId);

    if (!uploadResponse.success) {
      throw new Error(uploadResponse.message || 'File upload failed');
    }

    const fileData = uploadResponse.data;
    // Get the storage endpoint and format the file URL
    // This may need to be adjusted based on your Appwrite configuration
    const storageEndpoint = `${process.env.CMS_ENDPOINT}/storage/buckets/${bucketId}/files`;
    const fileUrl = `${storageEndpoint}/${fileId}/download?project=${process.env.CMS_PROJECT_ID}`;

    // Return formatted response for the form
    return {
      success: true,
      data: {
        fileId: fileData.$id,
        fileName: file.name,
        fileUrl: fileUrl,
        mimeType: file.type,
        size: file.size,
        bucketId: bucketId
      }
    };
  } catch (error) {
    console.error('Error in uploadFile:', error);
    return {
      success: false,
      message: error.message || 'Failed to upload file'
    };
  }
};