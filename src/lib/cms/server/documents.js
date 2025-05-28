"use server";

import { ID, Query } from './sdk_client';
import { 
  createDocument, 
  getDocument, 
  getDocuments, 
  updateDocument, 
  deleteDocument 
} from './sdk_db';
import { 
  uploadFile, 
  deleteFile, 
  getFileForDownload,
  isBucketCreated,
  createBucket
} from './sdk_storage';

// Constants
const COLLECTION_ID = 'userDocuments';
const BUCKET_ID = 'userDocuments';

/**
 * Ensures the documents storage bucket exists
 * @returns {Promise<Object>} Response indicating success or failure
 */
export async function ensureDocumentsBucketExists() {
  try {
    // Check if the bucket exists
    const bucketCheckResponse = await isBucketCreated(BUCKET_ID);
    
    if (!bucketCheckResponse.success) {
      return {
        success: false,
        message: `Error checking bucket: ${bucketCheckResponse.message}`
      };
    }
    
    // If bucket doesn't exist, create it
    if (!bucketCheckResponse.exists) {
      const createResponse = await createBucket(BUCKET_ID, 'Client Documents Storage');
      
      if (!createResponse.success) {
        return {
          success: false,
          message: `Failed to create documents bucket: ${createResponse.message}`
        };
      }
      
      return {
        success: true,
        message: 'Document storage bucket created successfully',
        data: createResponse.data
      };
    }
    
    return {
      success: true,
      message: 'Document storage bucket already exists',
      data: bucketCheckResponse.data
    };
  } catch (error) {
    console.error('Error ensuring documents bucket exists:', error);
    return {
      success: false,
      message: `Failed to ensure documents bucket exists: ${error.message}`
    };
  }
}

/**
 * Upload document file and create document record
 * @param {Object} file - The file to upload
 * @param {Object} documentData - Document metadata
 * @param {string} documentData.title - Document title
 * @param {string} documentData.userId - Owner user ID
 * @param {string} documentData.type - Document type (contract, nda, etc.)
 * @param {string} documentData.description - Document description (optional)
 * @param {boolean} documentData.requiresSignature - Whether signature is required (optional)
 * @param {boolean} documentData.isTemplate - Whether this is a template (optional)
 * @param {string} documentData.createdBy - Admin user ID who uploaded the document
 * @param {Array} documentData.tags - Document tags (optional)
 * @returns {Promise<Object>} Response containing document data
 */
export async function uploadDocumentWithFile(file, documentData) {
  try {
    // Ensure bucket exists
    const bucketResponse = await ensureDocumentsBucketExists();
    if (!bucketResponse.success) {
      return {
        success: false,
        message: bucketResponse.message
      };
    }
    
    // Upload the file
    const fileId = ID.unique();
    const uploadResponse = await uploadFile(BUCKET_ID, file, fileId);
    
    if (!uploadResponse.success) {
      return {
        success: false,
        message: `Failed to upload file: ${uploadResponse.message}`
      };
    }
    
    // Get file metadata
    const fileData = uploadResponse.data;
    
    // Create document record
    const now = new Date().toISOString();
    const document = {
      userId: documentData.userId,
      fileName: file.name,
      title: documentData.title,
      type: documentData.type || 'other',
      status: documentData.status || 'available',
      format: file.name.split('.').pop(),
      size: file.size.toString(),
      fileUrl: fileData.$id,
      dateCreated: now,
      dateModified: now,
      signedDate: null,
      expirationDate: documentData.expirationDate || null,
      createdBy: documentData.createdBy,
      requiresSignature: documentData.requiresSignature || false,
      isTemplate: documentData.isTemplate || false,
      signatories: documentData.signatories || '[]',
      tags: documentData.tags || [],
      description: documentData.description || '',
      fileId: fileData.$id
    };
    
    const docResponse = await createDocument(COLLECTION_ID, document);
    
    if (!docResponse.success) {
      // If document creation fails, delete the uploaded file to avoid orphaned files
      await deleteFile(BUCKET_ID, fileId);
      
      return {
        success: false,
        message: `Failed to create document record: ${docResponse.message}`
      };
    }
    
    return {
      success: true,
      message: 'Document uploaded successfully',
      data: docResponse.data
    };
  } catch (error) {
    console.error('Error uploading document with file:', error);
    return {
      success: false,
      message: `Failed to upload document: ${error.message}`
    };
  }
}

/**
 * Get documents for a specific user
 * @param {string} userId - User ID to fetch documents for
 * @param {Object} options - Options for filtering documents
 * @param {string} options.type - Filter by document type (optional)
 * @param {string} options.status - Filter by document status (optional)
 * @param {number} options.limit - Maximum number of documents to return (optional)
 * @param {number} options.offset - Number of documents to skip (optional)
 * @returns {Promise<Object>} Response containing documents
 */
export async function getUserDocuments(userId, options = {}) {
  try {
    const { type, status, limit = 50, offset = 0 } = options;
    
    // Build queries
    const queries = [Query.equal('userId', userId)];
    
    if (type) {
      queries.push(Query.equal('type', type));
    }
    
    if (status) {
      queries.push(Query.equal('status', status));
    }
    
    // Add pagination
    queries.push(Query.limit(limit));
    queries.push(Query.offset(offset));
    queries.push(Query.orderDesc('dateModified'));
    
    const response = await getDocuments(COLLECTION_ID, queries);
    
    return {
      success: true,
      data: response.data.documents,
      total: response.data.total
    };
  } catch (error) {
    console.error('Error fetching user documents:', error);
    return {
      success: false,
      message: `Failed to fetch documents: ${error.message}`
    };
  }
}

/**
 * Get document details including file metadata
 * @param {string} documentId - Document ID to fetch
 * @returns {Promise<Object>} Response containing document data
 */
export async function getDocumentDetails(documentId) {
  try {
    const response = await getDocument(COLLECTION_ID, documentId);
    
    if (!response.success) {
      return {
        success: false,
        message: `Failed to fetch document: ${response.message}`
      };
    }
    
    return {
      success: true,
      data: response.data
    };
  } catch (error) {
    console.error('Error fetching document details:', error);
    return {
      success: false,
      message: `Failed to fetch document details: ${error.message}`
    };
  }
}

/**
 * Update document metadata
 * @param {string} documentId - Document ID to update
 * @param {Object} updateData - New document data
 * @returns {Promise<Object>} Response containing updated document
 */
export async function updateDocumentMetadata(documentId, updateData) {
  try {
    // Fetch current document to ensure it exists
    const currentDoc = await getDocument(COLLECTION_ID, documentId);
    
    if (!currentDoc.success) {
      return {
        success: false,
        message: `Document not found: ${currentDoc.message}`
      };
    }
    
    // Update only allowed fields
    const allowedFields = [
      'title', 'type', 'status', 'description', 'requiresSignature',
      'isTemplate', 'signatories', 'tags', 'expirationDate', 'signedDate'
    ];
    
    const validUpdateData = {};
    
    for (const field of allowedFields) {
      if (updateData[field] !== undefined) {
        validUpdateData[field] = updateData[field];
      }
    }
    
    // Add modification timestamp
    validUpdateData.dateModified = new Date().toISOString();
    
    const response = await updateDocument(COLLECTION_ID, documentId, validUpdateData);
    
    if (!response.success) {
      return {
        success: false,
        message: `Failed to update document: ${response.message}`
      };
    }
    
    return {
      success: true,
      message: 'Document updated successfully',
      data: response.data
    };
  } catch (error) {
    console.error('Error updating document metadata:', error);
    return {
      success: false,
      message: `Failed to update document: ${error.message}`
    };
  }
}

/**
 * Replace document file while keeping metadata
 * @param {string} documentId - Document ID to update
 * @param {Object} file - New file to upload
 * @returns {Promise<Object>} Response indicating success or failure
 */
export async function replaceDocumentFile(documentId, file) {
  try {
    // Get current document
    const docResponse = await getDocument(COLLECTION_ID, documentId);
    
    if (!docResponse.success) {
      return {
        success: false,
        message: `Document not found: ${docResponse.message}`
      };
    }
    
    const document = docResponse.data;
    
    // Delete old file
    if (document.fileId) {
      await deleteFile(BUCKET_ID, document.fileId);
    }
    
    // Upload new file
    const fileId = ID.unique();
    const uploadResponse = await uploadFile(BUCKET_ID, file, fileId);
    
    if (!uploadResponse.success) {
      return {
        success: false,
        message: `Failed to upload new file: ${uploadResponse.message}`
      };
    }
    
    // Update document record
    const updateData = {
      fileName: file.name,
      format: file.name.split('.').pop(),
      size: file.size.toString(),
      fileId: fileId,
      dateModified: new Date().toISOString()
    };
    
    const updateResponse = await updateDocument(COLLECTION_ID, documentId, updateData);
    
    if (!updateResponse.success) {
      // If update fails, clean up new file
      await deleteFile(BUCKET_ID, fileId);
      
      return {
        success: false,
        message: `Failed to update document record: ${updateResponse.message}`
      };
    }
    
    return {
      success: true,
      message: 'Document file replaced successfully',
      data: updateResponse.data
    };
  } catch (error) {
    console.error('Error replacing document file:', error);
    return {
      success: false,
      message: `Failed to replace document file: ${error.message}`
    };
  }
}

/**
 * Delete document and its associated file
 * @param {string} documentId - Document ID to delete
 * @returns {Promise<Object>} Response indicating success or failure
 */
export async function deleteDocumentWithFile(documentId) {
  try {
    // Get document to get the file ID
    const docResponse = await getDocument(COLLECTION_ID, documentId);
    
    if (!docResponse.success) {
      return {
        success: false,
        message: `Document not found: ${docResponse.message}`
      };
    }
    
    const document = docResponse.data;
    
    // Delete document record first
    const deleteResponse = await deleteDocument(COLLECTION_ID, documentId);
    
    if (!deleteResponse.success) {
      return {
        success: false,
        message: `Failed to delete document record: ${deleteResponse.message}`
      };
    }
    
    // Then delete the file
    if (document.fileId) {
      const fileDeleteResponse = await deleteFile(BUCKET_ID, document.fileId);
      
      if (!fileDeleteResponse.success) {
        console.warn(`Document record deleted but file deletion failed: ${fileDeleteResponse.message}`);
        
        return {
          success: true,
          message: 'Document deleted but file deletion failed',
          warnings: [`File deletion failed: ${fileDeleteResponse.message}`]
        };
      }
    }
    
    return {
      success: true,
      message: 'Document and file deleted successfully'
    };
  } catch (error) {
    console.error('Error deleting document with file:', error);
    return {
      success: false,
      message: `Failed to delete document: ${error.message}`
    };
  }
}

/**
 * Download document file
 * @param {string} documentId - Document ID to download
 * @returns {Promise<Object>} Response containing file download data
 */
export async function downloadDocument(documentId) {
  try {
    // Get document to get the file ID
    const docResponse = await getDocument(COLLECTION_ID, documentId);
    
    if (!docResponse.success) {
      return {
        success: false,
        message: `Document not found: ${docResponse.message}`
      };
    }
    
    const document = docResponse.data;
    
    // Verify file ID exists
    if (!document.fileId) {
      return {
        success: false,
        message: 'Document has no associated file'
      };
    }
    
    // Get file download data
    const downloadResponse = await getFileForDownload(BUCKET_ID, document.fileId);
    
    if (!downloadResponse.success) {
      return {
        success: false,
        message: `Failed to get file download: ${downloadResponse.message}`
      };
    }
    
    // Update last accessed timestamp
    await updateDocument(COLLECTION_ID, documentId, {
      dateModified: new Date().toISOString()
    }).catch(error => {
      console.warn('Error updating document access timestamp:', error);
    });
    
    return {
      success: true,
      data: downloadResponse.data,
      fileName: document.fileName,
      mimeType: getMimeTypeFromFormat(document.format)
    };
  } catch (error) {
    console.error('Error downloading document:', error);
    return {
      success: false,
      message: `Failed to download document: ${error.message}`
    };
  }
}

/**
 * Get MIME type from file format
 * @param {string} format - File format extension
 * @returns {string} MIME type
 */
function getMimeTypeFromFormat(format) {
  const mimeTypes = {
    'pdf': 'application/pdf',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls': 'application/vnd.ms-excel',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'ppt': 'application/vnd.ms-powerpoint',
    'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'txt': 'text/plain',
    'csv': 'text/csv',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif'
  };
  
  return mimeTypes[format.toLowerCase()] || 'application/octet-stream';
}

/**
 * Set document status
 * @param {string} documentId - Document ID to update
 * @param {string} status - New status to set
 * @returns {Promise<Object>} Response indicating success or failure
 */
export async function setDocumentStatus(documentId, status) {
  try {
    const validStatuses = [
      'available', 
      'pending_signature', 
      'awaiting_countersignature', 
      'signed', 
      'expired', 
      'template'
    ];
    
    if (!validStatuses.includes(status)) {
      return {
        success: false,
        message: `Invalid status: ${status}. Must be one of: ${validStatuses.join(', ')}`
      };
    }
    
    const updateData = {
      status,
      dateModified: new Date().toISOString()
    };
    
    // If status is signed, add signed date
    if (status === 'signed') {
      updateData.signedDate = new Date().toISOString();
    }
    
    const response = await updateDocument(COLLECTION_ID, documentId, updateData);
    
    if (!response.success) {
      return {
        success: false,
        message: `Failed to update document status: ${response.message}`
      };
    }
    
    return {
      success: true,
      message: `Document status updated to "${status}"`,
      data: response.data
    };
  } catch (error) {
    console.error('Error setting document status:', error);
    return {
      success: false,
      message: `Failed to set document status: ${error.message}`
    };
  }
}

/**
 * Update document signatories
 * @param {string} documentId - Document ID to update
 * @param {Array} signatories - Array of signatory objects
 * @returns {Promise<Object>} Response indicating success or failure
 */
export async function updateDocumentSignatories(documentId, signatories) {
  try {
    // Validate signatories format
    if (!Array.isArray(signatories)) {
      return {
        success: false,
        message: 'Signatories must be an array'
      };
    }
    
    // Validate each signatory has required fields
    for (const signatory of signatories) {
      if (!signatory.name || !signatory.email) {
        return {
          success: false,
          message: 'Each signatory must have name and email'
        };
      }
      
      if (!signatory.status) {
        signatory.status = 'pending';
      }
      
      // Validate status is valid
      if (!['pending', 'signed', 'rejected'].includes(signatory.status)) {
        return {
          success: false,
          message: `Invalid signatory status: ${signatory.status}. Must be one of: pending, signed, rejected`
        };
      }
    }
    
    // Convert signatories to JSON string
    const signatoriesJson = JSON.stringify(signatories);
    
    // Update document
    const response = await updateDocument(COLLECTION_ID, documentId, {
      signatories: signatoriesJson,
      dateModified: new Date().toISOString()
    });
    
    if (!response.success) {
      return {
        success: false,
        message: `Failed to update document signatories: ${response.message}`
      };
    }
    
    return {
      success: true,
      message: 'Document signatories updated successfully',
      data: response.data
    };
  } catch (error) {
    console.error('Error updating document signatories:', error);
    return {
      success: false,
      message: `Failed to update document signatories: ${error.message}`
    };
  }
}

/**
 * Find documents by tags
 * @param {Array} tags - Tags to search for
 * @param {string} [userId] - Optionally filter by user ID
 * @returns {Promise<Object>} Response containing documents
 */
export async function findDocumentsByTags(tags, userId = null) {
  try {
    if (!Array.isArray(tags) || tags.length === 0) {
      return {
        success: false,
        message: 'Tags must be a non-empty array'
      };
    }
    
    // Build queries
    const queries = [Query.contains('tags', tags)];
    
    if (userId) {
      queries.push(Query.equal('userId', userId));
    }
    
    // Add sorting and pagination
    queries.push(Query.orderDesc('dateModified'));
    queries.push(Query.limit(50));
    
    const response = await getDocuments(COLLECTION_ID, queries);
    
    return {
      success: true,
      data: response.data.documents,
      total: response.data.total
    };
  } catch (error) {
    console.error('Error finding documents by tags:', error);
    return {
      success: false,
      message: `Failed to find documents by tags: ${error.message}`
    };
  }
}

/**
 * Search for documents by title or description
 * @param {string} searchTerm - Term to search for
 * @param {Object} options - Search options
 * @param {string} options.userId - Filter by user ID (optional)
 * @param {string} options.type - Filter by document type (optional)
 * @param {string} options.status - Filter by document status (optional)
 * @returns {Promise<Object>} Response containing documents
 */
export async function searchDocuments(searchTerm, options = {}) {
  try {
    const { userId, type, status } = options;
    
    if (!searchTerm || typeof searchTerm !== 'string') {
      return {
        success: false,
        message: 'Search term must be a non-empty string'
      };
    }
    
    // Build queries
    const queries = [];
    
    // Add filters
    if (userId) {
      queries.push(Query.equal('userId', userId));
    }
    
    if (type) {
      queries.push(Query.equal('type', type));
    }
    
    if (status) {
      queries.push(Query.equal('status', status));
    }
    
    // Split search term into words
    const searchWords = searchTerm.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    
    // Get documents matching filters
    const response = await getDocuments(COLLECTION_ID, queries);
    
    if (!response.success) {
      return {
        success: false,
        message: `Failed to search documents: ${response.message}`
      };
    }
    
    // Filter results by search term
    const matchingDocuments = response.data.documents.filter(doc => {
      const title = (doc.title || '').toLowerCase();
      const description = (doc.description || '').toLowerCase();
      const fileName = (doc.fileName || '').toLowerCase();
      
      // Check if any search word is in the title, description or filename
      return searchWords.some(word => 
        title.includes(word) || 
        description.includes(word) || 
        fileName.includes(word)
      );
    });
    
    return {
      success: true,
      data: matchingDocuments,
      total: matchingDocuments.length
    };
  } catch (error) {
    console.error('Error searching documents:', error);
    return {
      success: false,
      message: `Failed to search documents: ${error.message}`
    };
  }
}

/**
 * Get document count by type for a user
 * @param {string} userId - User ID to get stats for
 * @returns {Promise<Object>} Response with document counts by type
 */
export async function getDocumentStatsByType(userId) {
  try {
    // Get all user documents
    const response = await getUserDocuments(userId, { limit: 1000 });
    
    if (!response.success) {
      return {
        success: false,
        message: `Failed to get documents: ${response.message}`
      };
    }
    
    const documents = response.data;
    
    // Count documents by type
    const typeCountMap = {};
    documents.forEach(doc => {
      const type = doc.type || 'other';
      typeCountMap[type] = (typeCountMap[type] || 0) + 1;
    });
    
    // Count documents by status
    const statusCountMap = {};
    documents.forEach(doc => {
      const status = doc.status || 'available';
      statusCountMap[status] = (statusCountMap[status] || 0) + 1;
    });
    
    return {
      success: true,
      data: {
        totalDocuments: documents.length,
        byType: typeCountMap,
        byStatus: statusCountMap
      }
    };
  } catch (error) {
    console.error('Error getting document stats:', error);
    return {
      success: false,
      message: `Failed to get document stats: ${error.message}`
    };
  }
}