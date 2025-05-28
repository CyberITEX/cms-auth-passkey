"use server";

import { ID } from './sdk_client';
import { createDocument, getDocument, updateDocument, deleteDocument, getDocumentsByRelation } from './sdk_db';

/**
 * Creates a new pricing option
 * @param {Object} data - The pricing data
 * @returns {Promise<Object>} The created pricing document
 */
export async function createPricing(data) {
  // Ensure required fields are present
  if (!data.plan || !data.name || !data.pricingModel) {
    throw new Error('Missing required fields for pricing creation');
  }
  // Format data with all the new pricing attributes
  const pricingData = {
    // Basic information
    name: data.name,
    plan: data.plan,
    product: data.product,
    pricingModel: data.pricingModel,
    isDefault: data.isDefault || false,
    bestValue: data.bestValue || false,

    // Cost-based pricing
    cost: data.cost || 0,
    profitType: data.profitType || 'percentage',
    profitAmount: data.profitAmount || 0,

    // Discount-based pricing
    regularPrice: data.regularPrice || 0,
    discountType: data.discountType || 'percentage',
    discountAmount: data.discountAmount || 0,
    saving: data.saving || 0,

    // Final pricing
    price: data.price || 0,

    // Partner pricing
    partnerPrice: data.partnerPrice || 0,
    partnerDiscountType: data.partnerDiscountType || 'percentage',
    partnerDiscountAmount: data.partnerDiscountAmount || 0,

    // Equivalent pricing
    yearlyPrice: data.yearlyPrice || 0,
    monthlyPrice: data.monthlyPrice || 0,

    // Timestamps
    createdAt: data.createdAt || new Date().toISOString(),
    updatedAt: data.updatedAt || new Date().toISOString(),
  };

  // Add subscription-specific fields if this is a subscription pricing
  if (data.pricingModel === 'subscription') {
    pricingData.billingFrequency = data.billingFrequency || 'month';
    pricingData.billingCycle = data.billingCycle || 'UntilCanceled';
    pricingData.billingInterval = data.billingInterval || 1;

    // Only add billingFixedDuration if billingCycle is Fixed
    if (data.billingCycle === 'Fixed') {
      pricingData.billingFixedDuration = data.billingFixedDuration || 1;
    }
  }

  // Add usage-based specific fields if this is a usage-based pricing
  if (data.pricingModel === 'usage-based') {
    pricingData.usageUnit = data.usageUnit || '';
    pricingData.usageSize = data.usageSize || 1;
    pricingData.usagePrice = data.usagePrice || 0;
    pricingData.usageMin = data.usageMin || 0;
    pricingData.usageMax = data.usageMax || 0;
    pricingData.billingFrequency = data.billingFrequency || 'month'; // Usage-based can also have billing frequency
  }

  // Perform intelligent price calculations if needed

  // Calculate price based on cost and profit (if not already set)
  if (!data.price && data.cost && data.profitAmount) {
    const cost = parseFloat(data.cost) || 0;
    const profitAmount = parseFloat(data.profitAmount) || 0;

    if (cost > 0 && profitAmount > 0) {
      if (data.profitType === 'fixed') {
        pricingData.price = cost + profitAmount;
      } else { // percentage
        pricingData.price = cost * (1 + (profitAmount / 100));
      }
    }
  }

  // Calculate price and saving based on regularPrice and discount (if not already set)
  if (!data.price && data.regularPrice && data.discountAmount) {
    const regularPrice = parseFloat(data.regularPrice) || 0;
    const discountAmount = parseFloat(data.discountAmount) || 0;

    if (regularPrice > 0 && discountAmount > 0) {
      if (data.discountType === 'fixed') {
        pricingData.price = Math.max(0, regularPrice - discountAmount);
        pricingData.saving = discountAmount;
      } else { // percentage
        const calculatedPrice = regularPrice * (1 - (discountAmount / 100));
        pricingData.price = calculatedPrice;
        pricingData.saving = regularPrice - calculatedPrice;
      }
    }
  }

  // Calculate partner price based on price and partner discount (if not already set)
  if (!data.partnerPrice && data.price && data.partnerDiscountAmount) {
    const price = parseFloat(data.price) || parseFloat(pricingData.price) || 0;
    const partnerDiscountAmount = parseFloat(data.partnerDiscountAmount) || 0;

    if (price > 0 && partnerDiscountAmount > 0) {
      if (data.partnerDiscountType === 'fixed') {
        pricingData.partnerPrice = Math.max(0, price - partnerDiscountAmount);
      } else { // percentage
        pricingData.partnerPrice = price * (1 - (partnerDiscountAmount / 100));
      }
    }
  }

  // Calculate monthly and yearly prices (if not already set)
  if (data.price && data.billingFrequency && data.billingInterval) {
    const price = parseFloat(data.price) || parseFloat(pricingData.price) || 0;
    const billingInterval = parseInt(data.billingInterval) || 1;

    if (price > 0) {
      if (!data.monthlyPrice) {
        let monthlyPrice = 0;

        // Calculate monthly equivalent
        switch (data.billingFrequency) {
          case 'day':
            monthlyPrice = price * 30 / billingInterval;
            break;
          case 'week':
            monthlyPrice = price * 4.33 / billingInterval; // Average weeks in a month
            break;
          case 'month':
            monthlyPrice = price / billingInterval;
            break;
          case 'year':
            monthlyPrice = price / (12 * billingInterval);
            break;
          default:
            monthlyPrice = price; // one-off
        }

        pricingData.monthlyPrice = parseFloat(monthlyPrice.toFixed(2));
      }

      if (!data.yearlyPrice) {
        let yearlyPrice = 0;

        // Calculate yearly equivalent
        switch (data.billingFrequency) {
          case 'day':
            yearlyPrice = price * 365 / billingInterval;
            break;
          case 'week':
            yearlyPrice = price * 52 / billingInterval;
            break;
          case 'month':
            yearlyPrice = price * 12 / billingInterval;
            break;
          case 'year':
            yearlyPrice = price / billingInterval;
            break;
          default:
            yearlyPrice = price; // one-off
        }

        pricingData.yearlyPrice = parseFloat(yearlyPrice.toFixed(2));
      }
    }
  }

  // Round all monetary values to 2 decimal places for consistency
  const monetaryFields = ['cost', 'price', 'regularPrice', 'saving', 'partnerPrice',
    'monthlyPrice', 'yearlyPrice', 'usagePrice'];

  monetaryFields.forEach(field => {
    if (pricingData[field]) {
      pricingData[field] = parseFloat(parseFloat(pricingData[field]).toFixed(2));
    }
  });

  const response = await createDocument(process.env.CMS_COLLECTION_ID_PRODUCT_PLAN_PRICING, pricingData);

  if (!response.success) {
    console.error('Error creating pricing:', response.message);
    throw new Error(response.message);
  }

  return response.data;
}

/**
 * Creates a new downloadable file
 * @param {Object} data - The downloadable file data
 * @returns {Promise<Object>} The created downloadable document
 */
export async function createDownloadable(data) {
  // Ensure required fields are present
  if (!data.plan || !data.fileName || !data.fileID || !data.fileUrl) {
    throw new Error('Missing required fields for downloadable file creation');
  }

  const downloadableData = {
    plan: data.plan,
    fileName: data.fileName,
    fileID: data.fileID,
    fileUrl: data.fileUrl,
    uploadedAt: new Date().toISOString()
  };

  const response = await createDocument(process.env.CMS_COLLECTION_ID_PRODUCT_PLAN_FILES, downloadableData, ID.unique());

  if (!response.success) {
    console.error('Error creating downloadable file:', response.message);
    throw new Error(response.message);
  }

  return response.data;
}

/**
 * Gets all pricing options for a specific plan
 * @param {string} planId - The ID of the plan
 * @returns {Promise<Object>} Object containing pricing options and total count
 */
export async function getPricingByPlan(planId) {
  const response = await getDocumentsByRelation(process.env.CMS_COLLECTION_ID_PRODUCT_PLAN_PRICING, 'plan', planId);

  if (!response.success) {
    console.error('Error fetching pricing options:', response.message);
    throw new Error(response.message);
  }

  return response.data.documents || [];
}

/**
 * Gets all downloadable files for a specific plan
 * @param {string} planId - The ID of the plan
 * @returns {Promise<Object>} Object containing downloadable files and total count
 */
export async function getDownloadablesByPlan(planId) {
  const response = await getDocumentsByRelation(process.env.CMS_COLLECTION_ID_PRODUCT_PLAN_FILES, 'plan', planId);

  if (!response.success) {
    console.error('Error fetching downloadable files:', response.message);
    throw new Error(response.message);
  }

  return response.data.documents || [];
}

/**
 * Gets a specific pricing option by ID
 * @param {string} pricingId - The ID of the pricing option
 * @returns {Promise<Object>} The pricing document
 */
export async function getPricingById(pricingId) {
  const response = await getDocument(process.env.CMS_COLLECTION_ID_PRODUCT_PLAN_PRICING, pricingId);

  if (!response.success) {
    console.error('Error fetching pricing option:', response.message);
    throw new Error(response.message);
  }

  return response.data;
}

/**
 * Updates an existing pricing option
 * @param {string} pricingId - The ID of the pricing option to update
 * @param {Object} data - The updated pricing data
 * @returns {Promise<Object>} The updated pricing document
 */
export async function updatePricing(pricingId, data) {
  // Add updatedAt timestamp
  const updateData = {
    ...data,
    updatedAt: new Date().toISOString(),
  };
  const removeSystemFieldsGeneric = (data) => {
    return Object.fromEntries(
      Object.entries(data).filter(([key]) => !key.startsWith('$'))
    );
  };

  const cleanedDataGeneric = removeSystemFieldsGeneric(updateData);

  const response = await updateDocument(process.env.CMS_COLLECTION_ID_PRODUCT_PLAN_PRICING, pricingId, cleanedDataGeneric);

  if (!response.success) {
    console.error('Error updating pricing option:', response.message);
    throw new Error(response.message);
  }

  return response.data;
}

/**
 * Deletes a pricing option
 * @param {string} pricingId - The ID of the pricing option to delete
 * @returns {Promise<Object>} The result of the deletion operation
 */
export async function deletePricing(pricingId) {
  const response = await deleteDocument(process.env.CMS_COLLECTION_ID_PRODUCT_PLAN_PRICING, pricingId);

  if (!response.success) {
    console.error('Error deleting pricing option:', response.message);
    throw new Error(response.message);
  }

  return response.data;
}

/**
 * Deletes a downloadable file
 * @param {string} downloadableId - The ID of the downloadable file to delete
 * @returns {Promise<Object>} The result of the deletion operation
 */
export async function deleteDownloadable(downloadableId) {
  const response = await deleteDocument(process.env.CMS_COLLECTION_ID_PRODUCT_PLAN_FILES, downloadableId);

  if (!response.success) {
    console.error('Error deleting downloadable file:', response.message);
    throw new Error(response.message);
  }

  return response.data;
}