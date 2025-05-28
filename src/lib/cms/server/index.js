"use server";

// Import client factory functions
import {
    createAdminClient as _createAdminClient,
    createSessionClient as _createSessionClient,
    createClient as _createClient,
    ID
} from './sdk_client';

// Import product-related functions
import {
    getProducts as _getProducts,
    getProduct as _getProduct,
    createProduct as _createProduct,
    updateProduct as _updateProduct,
    deleteProduct as _deleteProduct,
    getProductBySlug as _getProductBySlug
} from './products';

// Import customer-related functions
import {
    getUsers as _getUsers,
    getUser as _getUser,
    deleteUser as _deleteUser,
    deactivateUser as _deactivateUser,
    activateUser as _activateUser,
    updatePhone as _updatePhone,
    updatePassword as _updatePassword,
    updateName as _updateName,
    getUserSessions as _getUserSessions,
    deleteUserSessions as _deleteUserSessions,
    deleteUserSession as _deleteUserSession,
    getPrefs as _getPrefs,
    updatePrefs as _updatePrefs,
    getUserMemberships as _getUserMemberships
} from './sdk_users';

// Import category-related functions
import {
    getCategories as _getCategories,
    createCategory as _createCategory,
    updateCategory as _updateCategory,
    deleteCategory as _deleteCategory
} from './categories';

// Import tag-related functions
import {
    getTags as _getTags,
    createTag as _createTag,
    updateTag as _updateTag,
    deleteTag as _deleteTag
} from './tags';

// Import plan-related functions
import {
    getPlanById as _getPlanById,
    updatePlan as _updatePlan,
    createPlan as _createPlan,
    deletePlan as _deletePlan,
    getPlans as _getPlans
} from './plans';

// Import pricing-related functions
import {
    createPricing as _createPricing,
    getPricingByPlan as _getPricingByPlan,
    getPricingById as _getPricingById,
    updatePricing as _updatePricing,
    deletePricing as _deletePricing,
    createDownloadable as _createDownloadable,
    getDownloadablesByPlan as _getDownloadablesByPlan,
    deleteDownloadable as _deleteDownloadable
} from './pricing';

// Re-export client factory functions as async functions
export async function createAdminClient() {
    return await _createAdminClient();
}

export async function createSessionClient(session) {
    return await _createSessionClient(session);
}

export async function createClient() {
    return await _createClient();
}

// Re-export product-related functions
export async function getProducts() {
    return await _getProducts();
}

export async function getProduct(id) {
    return await _getProduct(id);
}

export async function createProduct(data) {
    return await _createProduct(data);
}

export async function updateProduct(id, data) {
    return await _updateProduct(id, data);
}

export async function deleteProduct(id) {
    return await _deleteProduct(id);
}

export async function getProductBySlug(slug) {
    return await _getProductBySlug(slug);
}

// Re-export customer-related functions
export async function getUsers(queries, search) {
    return await _getUsers(queries, search);
}

export async function getUser(userId) {
    return await _getUser(userId);
}


export async function deleteUser(userId) {
    return await _deleteUser(userId);
}
export async function deactivateUser(userId) {
    return await _deactivateUser(userId);
}
export async function activateUser(userId) {
    return await _activateUser(userId);
}
export async function updatePhone(userId) {
    return await _updatePhone(userId);
}
export async function updatePassword(userId) {
    return await _updatePassword(userId);
}
export async function updateName(userId) {
    return await _updateName(userId);
}
export async function getUserSessions(userId) {
    return await _getUserSessions(userId);
}
export async function deleteUserSessions(userId) {
    return await _deleteUserSessions(userId);
}
export async function deleteUserSession(userId) {
    return await _deleteUserSession(userId);
}
export async function getPrefs(userId) {
    return await _getPrefs(userId);
}
export async function updatePrefs(userId) {
    return await _updatePrefs(userId);
}
export async function getUserMemberships(userId) {
    return await _getUserMemberships(userId);
}


// Re-export category-related functions
export async function getCategories() {
    return await _getCategories();
}

export async function createCategory(data) {
    return await _createCategory(data);
}

export async function updateCategory(id, data) {
    return await _updateCategory(id, data);
}

export async function deleteCategory(id) {
    return await _deleteCategory(id);
}

// Re-export tag-related functions
export async function getTags() {
    return await _getTags();
}

export async function createTag(data) {
    return await _createTag(data);
}

export async function updateTag(id, data) {
    return await _updateTag(id, data);
}

export async function deleteTag(id) {
    return await _deleteTag(id);
}

// Re-export plan-related functions
export async function getPlanById(planId) {
    return await _getPlanById(planId);
}

export async function updatePlan(planId, data) {
    return await _updatePlan(planId, data);
}

export async function createPlan(data) {
    return await _createPlan(data);
}

export async function deletePlan(planId) {
    return await _deletePlan(planId);
}

export async function getPlans() {
    return await _getPlans();
}

// Re-export pricing-related functions
export async function createPricing(data) {
    return await _createPricing(data);
}

export async function getPricingByPlan(planId) {
    return await _getPricingByPlan(planId);
}

export async function getPricingById(pricingId) {
    return await _getPricingById(pricingId);
}

export async function updatePricing(pricingId, data) {
    return await _updatePricing(pricingId, data);
}

export async function deletePricing(pricingId) {
    return await _deletePricing(pricingId);
}

export async function createDownloadable(data) {
    return await _createDownloadable(data);
}

export async function getDownloadablesByPlan(planId) {
    return await _getDownloadablesByPlan(planId);
}

export async function deleteDownloadable(downloadableId) {
    return await _deleteDownloadable(downloadableId);
}