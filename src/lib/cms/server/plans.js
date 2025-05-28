"use server";

import { Query } from './sdk_client';
import { createDocument, getDocument, getDocuments, updateDocument, deleteDocument } from './sdk_db';
import { getPricingByPlan, getDownloadablesByPlan } from './pricing';

/**
 * Get a plan by ID
 * @param {string} planId - The plan ID
 * @returns {Promise<Object>} The plan data
 */
export async function getPlanById(planId) {
  const response = await getDocument(process.env.CMS_COLLECTION_ID_PRODUCT_PLANS, planId);

  if (!response.success) {
    console.error('Error fetching plan:', response.message);
    throw new Error(response.message);
  }

  return response.data;
}

/**
 * Update an existing plan
 * @param {string} planId - The plan ID
 * @param {Object} data - The updated plan data
 * @returns {Promise<Object>} The updated plan
 */
export async function updatePlan(planId, data) {
  // Add updatedAt timestamp
  const updateData = {
    ...data,
    updatedAt: new Date().toISOString(),
  };

  const response = await updateDocument(process.env.CMS_COLLECTION_ID_PRODUCT_PLANS, planId, updateData);

  if (!response.success) {
    console.error('Error updating plan:', response.message);
    throw new Error(response.message);
  }

  return response.data;
}

/**
 * Create a new plan
 * @param {Object} data - The plan data
 * @returns {Promise<Object>} The created plan
 */
export async function createPlan(data) {
  // Add timestamps if not provided
  const planData = {
    ...data,
    createdAt: data.createdAt || new Date().toISOString(),
    updatedAt: data.updatedAt || new Date().toISOString()
  };

  const response = await createDocument(process.env.CMS_COLLECTION_ID_PRODUCT_PLANS, planData);

  if (!response.success) {
    console.error('Error creating plan:', response.message);
    throw new Error(response.message);
  }

  return response.data;
}

/**
 * Delete a plan
 * @param {string} planId - The plan ID to delete
 * @returns {Promise<Object>} The result of the deletion
 */
export async function deletePlan(planId) {
  const response = await deleteDocument(process.env.CMS_COLLECTION_ID_PRODUCT_PLANS, planId);

  if (!response.success) {
    throw new Error(response.message);
  }

  return response.data;
}

/**
 * Gets all plans with their related data with filtering, sorting, and pagination
 * @param {Object} options - Options for filtering, sorting, and pagination
 * @returns {Promise<Object>} Object containing plans array and total count
 */
export async function getPlans(options = {}) {
  // Set default options
  const {
    limit = 10,
    offset = 0,
    sortField = '$createdAt',
    sortOrder = 'asc',
    searchTerm = null,
    product = null,
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
      Query.search('description', searchTerm),
      Query.search('shortDescription', searchTerm)
    ];

    // Combine the search queries with OR logic
    queries.push(Query.or(searchQueries));
  }

  // Add product filter if provided
  if (product) {
    try {
      // Get plans by product
      const productResponse = await getDocument(
        process.env.CMS_COLLECTION_ID_PRODUCTS,
        product
      );

      if (!productResponse.success) {
        throw new Error(`product not found: ${product}`);
      }
      // Get the plan IDs from the product's product_plans field
      const plans = productResponse.data.productPlans || [];
      const planIds = plans.map((p) => p.$id);

      // If no plans in this product, return empty result
      if (plans.length === 0) {
        return { plans: [], total: 0 };
      }

      // Add a query to filter by these plan IDs
      queries.push(Query.equal('$id', planIds, 'in'));
    } catch (error) {
      console.error('Error fetching product plans:', error);
      throw new Error('Error filtering by product: ' + error.message);
    }
  }



  // If category filter is provided, handle category filtering
  if (category) {
    try {
      // Get plans by category
      const categoryResponse = await getDocument(
        process.env.CMS_COLLECTION_ID_CATEGORIES,
        category
      );

      if (!categoryResponse.success) {
        throw new Error(`Category not found: ${category}`);
      }

      // Get the plan IDs from the category's category_plans field
      const plans = categoryResponse.data.category_plans || [];
      const planIds = plans.map((p) => p.$id);

      // If no plans in this category, return empty result
      if (plans.length === 0) {
        return { plans: [], total: 0 };
      }

      // Add a query to filter by these plan IDs
      queries.push(Query.equal('$id', planIds, 'in'));
    } catch (error) {
      console.error('Error fetching category plans:', error);
      throw new Error('Error filtering by category: ' + error.message);
    }
  }

  // If tag filter is provided, handle tag filtering
  if (tag) {
    try {
      // Get plans by tag
      const tagResponse = await getDocument(
        process.env.CMS_COLLECTION_ID_TAGS,
        tag
      );

      if (!tagResponse.success) {
        throw new Error(`Tag not found: ${tag}`);
      }

      // Get the plan IDs from the tag's related plans field
      const plans = tagResponse.data.tag_plans || [];
      const planIds = plans.map((p) => p.$id);

      // If no plans with this tag, return empty result
      if (plans.length === 0) {
        return { plans: [], total: 0 };
      }

      // Add a query to filter by these plan IDs
      queries.push(Query.equal('$id', planIds, 'in'));
    } catch (error) {
      console.error('Error fetching tag plans:', error);
      throw new Error('Error filtering by tag: ' + error.message);
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
  // Fetch plans with all our queries
  const response = await getDocuments(process.env.CMS_COLLECTION_ID_PRODUCT_PLANS, queries);

  if (!response.success) {
    console.error('Error fetching plans:', response.message);
    throw new Error(response.message);
  }

  const plans = response.data.documents || [];

  // For each plan, fetch the related data in parallel
  const plansWithRelations = await Promise.all(plans.map(async (plan) => {
    try {
      // Get pricing options for each plan
      const pricingOptions = await getPricingByPlan(plan.$id);

      // Get downloadable files if the plan is downloadable
      const downloadFiles = plan.downloadable ? await getDownloadablesByPlan(plan.$id) : [];

      // Return the plan with its related data
      return {
        ...plan,
        pricingOptions,
        downloadFiles
      };
    } catch (error) {
      console.error(`Error fetching related data for plan ${plan.$id}:`, error);
      return plan; // Return the original plan if there's an error
    }
  }));

  return {
    plans: plansWithRelations,
    total: response.data.total || 0
  };
}