// src\lib\cms\server\sdk_storage.js
"use server";

import { createAdminClient, Role, ID, Query, Permission } from './sdk_client';



/**
 * Standardized error handler for storage operations
 * @param {Function} operation - Async function to execute
 * @param {string} errorMessage - Default error message
 */
const handleStorageOperation = async (operation, errorMessage) => {
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
 * List files in a bucket
 * @param {string} bucketId - The bucket's unique ID
 * @param {number} limit - Maximum number of files to return
 * @param {number} offset - Number of files to skip
 */
export const listFiles = async (bucketId, limit = 10, offset = 0) => {
    return handleStorageOperation(
        async () => {
            const { storage } = await createAdminClient();

            return await storage.listFiles(bucketId, [
                Query.offset(offset),
                Query.limit(limit),
                Query.orderDesc("$createdAt"),
            ]);
        },
        `Failed to list files from bucket ${bucketId}`
    );
};

/**
 * Create a file in a bucket
 * @param {string} bucketId - The bucket's unique ID
 * @param {File|string} file - The file to upload (buffer or file path)
 * @param {string} [fileId] - Unique ID for the file (optional)
 * @param {Array} [permissions] - Permissions for the file (optional)
 */
export const uploadFile = async (
    bucketId,
    file,
    fileId = ID.unique(),
    permissions = ['read("any")']
) => {
    return handleStorageOperation(
        async () => {
            const { storage } = await createAdminClient();
            return await storage.createFile(
                bucketId,
                fileId,
                file,
                permissions
            );
        },
        `Failed to upload file to bucket ${bucketId}`
    );
};

/**
 * Get a file's metadata by its ID
 * @param {string} bucketId - The bucket's unique ID
 * @param {string} fileId - The file's unique ID
 */
export const getFile = async (bucketId, fileId) => {
    return handleStorageOperation(
        async () => {
            const { storage } = await createAdminClient();
            return await storage.getFile(bucketId, fileId);
        },
        `Failed to get file ${fileId} from bucket ${bucketId}`
    );
};

/**
 * Update a file in a bucket
 * @param {string} bucketId - The bucket's unique ID
 * @param {string} fileId - The file's unique ID
 * @param {Array} permissions - New permissions for the file
 */
export const updateFile = async (bucketId, fileId, permissions) => {
    return handleStorageOperation(
        async () => {
            const { storage } = await createAdminClient();
            return await storage.updateFile(bucketId, fileId, permissions);
        },
        `Failed to update file ${fileId} in bucket ${bucketId}`
    );
};

/**
 * Delete a file from a bucket
 * @param {string} bucketId - The bucket's unique ID
 * @param {string} fileId - The file's unique ID
 */
export const deleteFile = async (bucketId, fileId) => {
    return handleStorageOperation(
        async () => {
            const { storage } = await createAdminClient();
            await storage.deleteFile(bucketId, fileId);
            return { message: "File deleted successfully" };
        },
        `Failed to delete file ${fileId} from bucket ${bucketId}`
    );
};

/**
 * Get a file's download URL
 * @param {string} bucketId - The bucket's unique ID
 * @param {string} fileId - The file's unique ID
 */
export const getFileForDownload = async (bucketId, fileId) => {
    return handleStorageOperation(
        async () => {
            const { storage } = await createAdminClient();
            return await storage.getFileDownload(bucketId, fileId);
        },
        `Failed to get download URL for file ${fileId} from bucket ${bucketId}`
    );
};

/**
 * Get a file's preview URL
 * @param {string} bucketId - The bucket's unique ID
 * @param {string} fileId - The file's unique ID
 */
export const getFilePreview = async (bucketId, fileId) => {
    return handleStorageOperation(
        async () => {
            const { storage } = await createAdminClient();
            return await storage.getFilePreview(bucketId, fileId);
        },
        `Failed to get preview URL for file ${fileId} from bucket ${bucketId}`
    );
};

/**
 * Get a file's view URL
 * @param {string} bucketId - The bucket's unique ID
 * @param {string} fileId - The file's unique ID
 */
export const getFileForView = async (bucketId, fileId) => {
    return handleStorageOperation(
        async () => {
            const { storage } = await createAdminClient();
            return await storage.getFileView(bucketId, fileId);
        },
        `Failed to get view URL for file ${fileId} from bucket ${bucketId}`
    );
};

/**
 * Check if a bucket exists
 * @param {string} bucketId - The bucket's unique ID
 */
export const isBucketCreated = async (bucketId) => {
    try {
        const { storage } = await createAdminClient();

        // Check if the bucket exists
        const existingBucket = await storage.getBucket(bucketId);

        return {
            success: true,
            exists: true,
            message: `Bucket with ID: ${bucketId} exists.`,
            data: existingBucket,
        };
    } catch (error) {
        // Handle error when the bucket doesn't exist
        if (error.code === 404) {
            return {
                success: true,
                exists: false,
                message: `Bucket with ID: ${bucketId} does not exist.`,
            };
        }

        // Handle other errors
        console.error(`Error checking bucket: ${error.message}`);
        return {
            success: false,
            exists: false,
            message: `Error checking bucket existence: ${error.message}`,
        };
    }
};

/**
 * Create a new bucket
 * @param {string} bucketId - The bucket's unique ID
 * @param {string} bucketName - The name of the bucket
 */
export const createBucket = async (bucketId, bucketName) => {
    try {
        const { storage } = await createAdminClient();
        const teamIdSuperAdmin = process.env.CMS_TEAM_ID_SUPER_ADMIN;
        const teamIdAdmin = process.env.CMS_TEAM_ID_ADMIN;

        // Check if the bucket already exists
        try {
            const existingBucket = await storage.getBucket(bucketId);

            return {
                success: true,
                message: `Bucket with ID: ${bucketId} already exists.`,
                data: existingBucket,
            };
        } catch (error) {
            // If bucket doesn't exist (404), create it
            if (error.code === 404) {
                const newBucket = await storage.createBucket(
                    bucketId,
                    bucketName,
                    [
                        Permission.read(Role.any()),
                        Permission.create(Role.team(teamIdSuperAdmin)),
                        Permission.create(Role.team(teamIdAdmin)),
                        Permission.update(Role.team(teamIdSuperAdmin)),
                        Permission.update(Role.team(teamIdAdmin)),
                        Permission.delete(Role.team(teamIdSuperAdmin)),
                        Permission.delete(Role.team(teamIdAdmin)),
                    ]
                );

                return {
                    success: true,
                    message: `Bucket created successfully.`,
                    data: newBucket,
                };
            } else {
                throw error; // Re-throw for the outer catch
            }
        }
    } catch (error) {
        console.error(`Error with bucket operation for ${bucketId}:`, error);
        return {
            success: false,
            message: `Error: ${error.message}`,
        };
    }
};