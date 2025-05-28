"use server";

import { createDocument, getDocuments, updateDocument, deleteDocument } from './sdk_db';

/**
 * Get all tags
 * @returns {Promise<Object>} Response with tags data and total count
 */
export async function getTags() {
  const response = await getDocuments(process.env.CMS_COLLECTION_ID_TAGS);
  
  if (!response.success) {
    console.error('Error fetching tags:', response.message);
    throw new Error(response.message);
  }
  
  // Handle the new response format which includes documents property
  return {
    tags: response.data.documents || [],
    total: response.data.total || 0
  };
}

/**
 * Create a new tag
 * @param {Object} data - The tag data
 * @returns {Promise<Object>} The created tag
 */
export async function createTag(data) {
  const response = await createDocument(process.env.CMS_COLLECTION_ID_TAGS, data);
  
  if (!response.success) {
    console.error('Error creating tag:', response.message);
    throw new Error(response.message);
  }
  
  return response.data;
}

/**
 * Update an existing tag
 * @param {string} id - The tag ID
 * @param {Object} data - The updated tag data
 * @returns {Promise<Object>} The updated tag
 */
export async function updateTag(id, data) {
  const response = await updateDocument(process.env.CMS_COLLECTION_ID_TAGS, id, data);
  
  if (!response.success) {
    console.error('Error updating tag:', response.message);
    throw new Error(response.message);
  }
  
  return response.data;
}

/**
 * Delete a tag
 * @param {string} id - The tag ID to delete
 * @returns {Promise<Object>} The result of the deletion
 */
export async function deleteTag(id) {
  const response = await deleteDocument(process.env.CMS_COLLECTION_ID_TAGS, id);
  
  if (!response.success) {
    console.error('Error deleting tag:', response.message);
    throw new Error(response.message);
  }
  
  return response.data;
}