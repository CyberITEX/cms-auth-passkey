"use server";

import { createDocument, getDocument, getDocuments, updateDocument, deleteDocument, getDocumentByField } from './sdk_db';
import { Query } from './sdk_client';
/**
 * Get all products with search and filtering support
 * @returns {Promise<Object>} Object containing products array and total count
 */
export async function getProducts(options = {}) {
  // Set default options
  const {
    status = null,
    type = null,
    limit = 20,
    offset = 0,
    sortField = '$createdAt',
    sortOrder = 'asc',
    searchTerm = null,
    category = null,
    tag = null
  } = options;

  // Create queries for this batch
  const queries = [
    Query.limit(limit),
    Query.offset(offset)
  ];

  // Add search filter if provided
  if (searchTerm) {
    // Use multiple contains searches to implement OR search logic
    const searchQueries = [
      Query.search('name', searchTerm),
      Query.search('prettyName', searchTerm),
      Query.search('slug', searchTerm),
      Query.search('description', searchTerm)
    ];

    // Combine the search queries with OR logic
    queries.push(Query.or(searchQueries));
  }

  // Add sorting
  if (sortField) {
    if (sortOrder.toLowerCase() === 'asc') {
      queries.push(Query.orderAsc(sortField));
    } else {
      queries.push(Query.orderDesc(sortField));
    }
  }

  // If category filter is provided, handle category filtering
  if (category) {
    try {
      // First get the category document to access its related products
      const categoryResponse = await getDocument(
        process.env.CMS_COLLECTION_ID_CATEGORIES,
        category
      );

      if (!categoryResponse.success) {
        throw new Error(`Category not found: ${category}`);
      }

      // Get the product IDs from the category's category_products field
      const products = categoryResponse.data.category_products || [];
      const productIds = products.map((p) => p.$id);

      // If no products in this category, return empty result
      if (products.length === 0) {
        return { products: [], total: 0 };
      }

      // Add a query to filter by these product IDs
      queries.push(Query.equal('$id', productIds, 'in'));
    } catch (error) {
      console.error('Error fetching category products:', error);
      throw new Error('Error filtering by category: ' + error.message);
    }
  }

  // If tag filter is provided, handle tag filtering
  if (tag) {
    try {
      // This implementation depends on how tags are stored in your database
      // If tags are stored as documents with relationships to products:
      const tagResponse = await getDocument(
        process.env.CMS_COLLECTION_ID_TAGS,
        tag
      );

      if (!tagResponse.success) {
        throw new Error(`Tag not found: ${tag}`);
      }

      // Get the product IDs from the tag's related products field
      // This assumes a field named tag_products that contains product references
      const products = tagResponse.data.tag_products || [];
      const productIds = products.map((p) => p.$id);

      // If no products with this tag, return empty result
      if (products.length === 0) {
        return { products: [], total: 0 };
      }

      // Add a query to filter by these product IDs
      queries.push(Query.equal('$id', productIds, 'in'));

      // Alternative: If tags are stored directly in products as an array
      // queries.push(Query.equal('tags', tag, 'in'));
    } catch (error) {
      console.error('Error fetching tag products:', error);
      throw new Error('Error filtering by tag: ' + error.message);
    }
  }

  // Fetch the products with all our queries
  const response = await getDocuments(process.env.CMS_COLLECTION_ID_PRODUCTS, queries);

  if (!response.success) {
    console.error('Error fetching products:', response.message);
    throw new Error(response.message);
  }

  return {
    products: response.data.documents || [],
    total: response.data.total || 0
  };
}

/**
 * Get a product by ID
 * @param {string} id - The product ID
 * @returns {Promise<Object>} The product data
 */
export async function getProduct(id) {
  const response = await getDocument(process.env.CMS_COLLECTION_ID_PRODUCTS, id);

  if (!response.success) {
    console.error('Error fetching product:', response.message);
    throw new Error(response.message);
  }

  return response.data;
}

/**
 * Create a new product
 * @param {Object} data - The product data
 * @returns {Promise<Object>} The created product
 */
export async function createProduct(data) {
  const response = await createDocument(process.env.CMS_COLLECTION_ID_PRODUCTS, data);

  if (!response.success) {
    console.error('Error creating product:', response.message);
    throw new Error(response.message);
  }

  return response.data;
}

/**
 * Update an existing product
 * @param {string} id - The product ID
 * @param {Object} data - The updated product data
 * @returns {Promise<Object>} The updated product
 */
export async function updateProduct(id, data) {
  const response = await updateDocument(process.env.CMS_COLLECTION_ID_PRODUCTS, id, data);

  if (!response.success) {
    console.error('Error updating product:', response.message);
    throw new Error(response.message);
  }

  return response.data;
}

/**
 * Delete a product
 * @param {string} id - The product ID to delete
 * @returns {Promise<Object>} The result of the deletion
 */
export async function deleteProduct(id) {
  const response = await deleteDocument(process.env.CMS_COLLECTION_ID_PRODUCTS, id);

  if (!response.success) {
    console.error('Error deleting product:', response.message);
    throw new Error(response.message);
  }

  return response.data;
}

/**
 * Get a product by its slug
 * @param {string} slug - The product slug
 * @returns {Promise<Object|null>} The product or null if not found
 */
export async function getProductBySlug(slug) {
  const response = await getDocumentByField(process.env.CMS_COLLECTION_ID_PRODUCTS, 'slug', slug);

  if (!response.success) {
    // If error is because no document was found, return null
    if (response.message.includes('No document found')) {
      return null;
    }

    console.error('Error fetching product by slug:', response.message);
    throw new Error(response.message);
  }

  return response.data;
}