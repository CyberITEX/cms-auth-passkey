"use server";

import { ID } from './sdk_client';
import { createDocument, getDocuments, updateDocument, deleteDocument } from './sdk_db';

/**
 * Get all categories
 * @returns {Promise<Object>} Response with categories data or error
 */
export async function getCategories() {
  const response = await getDocuments(process.env.CMS_COLLECTION_ID_CATEGORIES);
  
  if (!response.success) {
    console.error('Error fetching categories:', response.message);
    throw new Error(response.message);
  }
  
  // Handle the new response format which includes documents property
  return {
    categories: response.data.documents || [],
    total: response.data.total || 0
  };
}

/**
 * Create a new category
 * @param {Object} data - The category data
 * @returns {Promise<Object>} The created category
 */
export async function createCategory(data) {
  const response = await createDocument(process.env.CMS_COLLECTION_ID_CATEGORIES, data, ID.unique());
  
  if (!response.success) {
    console.error('Error creating category:', response.message);
    throw new Error(response.message);
  }
  
  return response.data;
}

/**
 * Update an existing category
 * @param {string} id - The category ID
 * @param {Object} data - The updated category data
 * @returns {Promise<Object>} The updated category
 */
export async function updateCategory(id, data) {
  const response = await updateDocument(process.env.CMS_COLLECTION_ID_CATEGORIES, id, data);
  
  if (!response.success) {
    console.error('Error updating category:', response.message);
    throw new Error(response.message);
  }
  
  return response.data;
}

/**
 * Delete a category
 * @param {string} id - The category ID to delete
 * @returns {Promise<Object>} The result of the deletion
 */
export async function deleteCategory(id) {
  const response = await deleteDocument(process.env.CMS_COLLECTION_ID_CATEGORIES, id);
  
  if (!response.success) {
    console.error('Error deleting category:', response.message);
    throw new Error(response.message);
  }
  
  return response.data;
}