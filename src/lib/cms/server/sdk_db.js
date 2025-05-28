// src\lib\cms\server\sdk_db.js
"use server";

import { createAdminClient, ID, Query } from './sdk_client';

/**
 * Standardized error handler for document operations
 * @param {Function} operation - Async function to execute
 * @param {string} errorMessage - Default error message
 */
const handleDocumentOperation = async (operation, errorMessage) => {
    try {
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
 * Creates a new document in the specified collection
 * @param {string} collectionId - The ID of the collection
 * @param {Object} data - The document data
 * @param {string} [documentId] - Optional document ID (generates unique ID if not provided)
 * @param {string} [databaseId] - Optional database ID (uses the one from createAdminClient if not provided)
 */
export async function createDocument(collectionId, data, documentId = null, databaseId = null) {
    return handleDocumentOperation(
        async () => {
            const { databases, databaseId: defaultDbId } = await createAdminClient();
            const id = documentId || ID.unique();
            const dbId = databaseId || defaultDbId;

            return await databases.createDocument(dbId, collectionId, id, data);
        },
        `Failed to create document in ${collectionId}`
    );
}

/**
 * Gets a document by ID from the specified collection
 * @param {string} collectionId - The ID of the collection
 * @param {string} documentId - The ID of the document to retrieve
 * @param {string} [databaseId] - Optional database ID (uses the one from createAdminClient if not provided)
 */
export async function getDocument(collectionId, documentId, databaseId = null) {
    return handleDocumentOperation(
        async () => {
            const { databases, databaseId: defaultDbId } = await createAdminClient();
            const dbId = databaseId || defaultDbId;

            return await databases.getDocument(dbId, collectionId, documentId);
        },
        `Failed to fetch document ${documentId} from ${collectionId}`
    );
}

/**
 * Lists documents from a collection with optional query parameters
 * @param {string} collectionId - The ID of the collection
 * @param {Array} [queries] - Optional array of Query objects
 * @param {string} [databaseId] - Optional database ID (uses the one from createAdminClient if not provided)
 */
export async function getDocuments(collectionId, queries = [], databaseId = null) {
    return handleDocumentOperation(
        async () => {
            const { databases, databaseId: defaultDbId } = await createAdminClient();
            const dbId = databaseId || defaultDbId;

            const response = await databases.listDocuments(dbId, collectionId, queries);

            return {
                documents: response.documents,
                total: response.total
            };
        },
        `Failed to list documents from ${collectionId}`
    );
}

/**
 * Updates an existing document
 * @param {string} collectionId - The ID of the collection
 * @param {string} documentId - The ID of the document to update
 * @param {Object} data - The updated data
 * @param {string} [databaseId] - Optional database ID (uses the one from createAdminClient if not provided)
 */
export async function updateDocument(collectionId, documentId, data, databaseId = null) {
    // Convert documentId to string if it's an object
    // const docId = typeof documentId === 'object' ? JSON.stringify(documentId) : documentId;    
    return handleDocumentOperation(
        async () => {
            const { databases, databaseId: defaultDbId } = await createAdminClient();
            const dbId = databaseId || defaultDbId;
            return await databases.updateDocument(
                dbId,
                collectionId,
                documentId,
                data
            );
        },
        `Failed to update document ${documentId} in ${collectionId}`

    );
}

/**
 * Deletes a document
 * @param {string} collectionId - The ID of the collection
 * @param {string} documentId - The ID of the document to delete
 * @param {string} [databaseId] - Optional database ID (uses the one from createAdminClient if not provided)
 */
export async function deleteDocument(collectionId, documentId, databaseId = null) {
    return handleDocumentOperation(
        async () => {
            const { databases, databaseId: defaultDbId } = await createAdminClient();
            const dbId = databaseId || defaultDbId;

            return await databases.deleteDocument(dbId, collectionId, documentId);
        },
        `Failed to delete document ${documentId} from ${collectionId}`
    );
}

/**
 * Gets a document by a specific field value
 * @param {string} collectionId - The ID of the collection
 * @param {string} fieldName - The field name to search by
 * @param {any} fieldValue - The value to search for
 * @param {string} [databaseId] - Optional database ID (uses the one from createAdminClient if not provided)
 */
export async function getDocumentByField(collectionId, fieldName, fieldValue, databaseId = null) {
    return handleDocumentOperation(
        async () => {
            const { databases, databaseId: defaultDbId } = await createAdminClient();
            const dbId = databaseId || defaultDbId;

            const response = await databases.listDocuments(
                dbId,
                collectionId,
                [
                    Query.equal(fieldName, fieldValue),
                    Query.limit(1)
                ]
            );

            if (response.documents.length === 0) {
                throw new Error(`No document found with ${fieldName} = ${fieldValue}`);
            }

            return response.documents[0];
        },
        `Failed to fetch document by ${fieldName} from ${collectionId}`
    );
}

/**
 * Gets documents by relation to another document
 * @param {string} collectionId - The ID of the collection
 * @param {string} relationField - The relation field name
 * @param {string} relationId - The ID of the related document
 * @param {string} [databaseId] - Optional database ID (uses the one from createAdminClient if not provided)
 */
export async function getDocumentsByRelation(collectionId, relationField, relationId, databaseId = null) {
    return handleDocumentOperation(
        async () => {
            const { databases, databaseId: defaultDbId } = await createAdminClient();
            const dbId = databaseId || defaultDbId;

            const response = await databases.listDocuments(
                dbId,
                collectionId,
                [Query.equal(relationField, relationId)]
            );

            return {
                documents: response.documents,
                total: response.total
            };
        },
        `Failed to fetch documents related to ${relationId} from ${collectionId}`
    );
}