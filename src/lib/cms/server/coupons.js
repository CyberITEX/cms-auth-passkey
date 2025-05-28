// src\lib\cms\server\coupons.js
"use server";

import { Query } from "./sdk_client";
import * as db from "./sdk_db";
import { getCart, getCartTotal } from "./cart";

/**
 * Apply a coupon to the cart
 * @param {string} userId - The user ID
 * @param {string} couponCode - The coupon code to apply
 * @param {string} cartId - The cart ID
 * @returns {Promise<Object>} - Result of the operation with discount information
 */
export async function applyCoupon(userId, couponCode, cartId) {
    try {
        const { cart, items, total } = await getCart(userId, cartId);

        if (!cart) {
            return { success: false, message: "No active cart found" };
        }

        if (items.length === 0) {
            return { success: false, message: "Cart is empty" };
        }

        // Find coupon - query for coupons where the provided code exists in the code array
        const couponsResult = await db.getDocuments(
            process.env.CMS_COLLECTION_ID_COUPONS,
            [
                Query.contains("code", [couponCode]), // Modified to work with an array field
                Query.equal("status", "Active")
            ]
        );

        if (!couponsResult.success || couponsResult.data.total === 0) {
            return { success: false, message: "Invalid or expired coupon code" };
        }

        const coupon = couponsResult.data.documents[0];

        // Validate coupon
        const now = new Date();

        // Check expiration
        if (coupon.expirationDate && new Date(coupon.expirationDate) < now) {
            await db.updateDocument(
                process.env.CMS_COLLECTION_ID_COUPONS,
                coupon.$id,
                { status: "Expired" }
            );
            return { success: false, message: "Coupon has expired" };
        }

        // Check usage limit
        if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
            return { success: false, message: "Coupon usage limit has been reached" };
        }

        // Check if user-specific
        if (coupon.isUserSpecific && coupon.userId !== userId) {
            return { success: false, message: "This coupon is not valid for your account" };
        }

        // Check minimum order amount
        if (coupon.minimumOrderAmount && total < coupon.minimumOrderAmount) {
            return {
                success: false,
                message: `Order must be at least $${coupon.minimumOrderAmount} to use this coupon`
            };
        }

        // Calculate discount
        let discountAmount = 0;

        if (coupon.discountType === "percentage") {
            // Percentage discount
            discountAmount = total * (coupon.discountValue / 100);

            // Apply maximum discount cap if specified
            if (coupon.maximumDiscountAmount && discountAmount > coupon.maximumDiscountAmount) {
                discountAmount = coupon.maximumDiscountAmount;
            }
        } else {
            // Fixed amount discount
            discountAmount = coupon.discountValue;

            // Ensure discount doesn't exceed order total
            if (discountAmount > total) {
                discountAmount = total;
            }
        }

        // Store the coupon in cart using relationship
        const updateResult = await db.updateDocument(
            "carts",
            cart.$id,
            {
                cart_coupon_relation: coupon.$id, // Use the relationship field
                couponCode: couponCode, // Store the specific code that was used
                discountAmount: discountAmount,
                updatedAt: new Date().toISOString()
            }
        );

        // Increment the coupon usage count
        await db.updateDocument(
            process.env.CMS_COLLECTION_ID_COUPONS,
            coupon.$id,
            {
                usedCount: (coupon.usedCount || 0) + 1
            }
        );

        // Calculate and update cart totals after applying the coupon
        const cartTotals = await getCartTotal(cart.$id);

        return {
            success: updateResult.success,
            message: "Coupon applied successfully",
            coupon,
            discountAmount,
            total: total - discountAmount,
            totals: cartTotals
        };
    } catch (error) {
        console.error("Error applying coupon:", error);
        return { success: false, message: error.message || "Failed to apply coupon" };
    }
}

/**
 * Remove the applied coupon from the cart
 * @param {string} userId - The user ID
 * @param {string} cartId - The cart ID
 * @returns {Promise<Object>} - Result of the operation
 */
export async function removeCoupon(userId, cartId) {
    try {
        if (!cartId) {
            return { success: false, message: "No active cart found" };
        }

        const updateResult = await db.updateDocument(
            "carts",
            cartId,
            {
                cart_coupon_relation: null,
                couponCode: null,
                discountAmount: 0,
                updatedAt: new Date().toISOString()
            }
        );

        // Calculate and update cart totals after removing the coupon
        const cartTotals = await getCartTotal(cartId);

        return {
            success: updateResult.success,
            message: "Coupon removed",
            totals: cartTotals
        };
    } catch (error) {
        console.error("Error removing coupon:", error);
        return { success: false, message: error.message || "Failed to remove coupon" };
    }
}

/**
* Create a new coupon
* @param {Object} couponData - Coupon information
* @param {string} couponData.code - The coupon code (or array of codes)
* @param {string} couponData.discountType - Type of discount ("percentage" or "fixed")
* @param {number} couponData.discountValue - Value of the discount (percentage or fixed amount)
* @param {string} couponData.description - Description of the coupon
* @param {Date} [couponData.expirationDate] - Expiration date (optional)
* @param {number} [couponData.usageLimit] - Maximum number of times coupon can be used (optional)
* @param {boolean} [couponData.isUserSpecific] - Whether the coupon is for a specific user (optional)
* @param {string} [couponData.userId] - User ID if the coupon is user-specific (optional)
* @param {number} [couponData.minimumOrderAmount] - Minimum order amount required (optional)
* @param {number} [couponData.maximumDiscountAmount] - Maximum discount cap for percentage discounts (optional)
* @returns {Promise<Object>} - Result of the operation
*/
export async function createCoupon(couponData) {
    try {
        // Validate required fields
        if (!couponData.code) {
            return { success: false, message: "Coupon code is required" };
        }

        if (!couponData.discountType || !["percentage", "fixed"].includes(couponData.discountType)) {
            return { success: false, message: "Valid discount type (percentage or fixed) is required" };
        }

        if (couponData.discountValue === undefined || couponData.discountValue <= 0) {
            return { success: false, message: "Valid discount value is required" };
        }

        // For percentage discounts, ensure the value is between 0 and 100
        if (couponData.discountType === "percentage" && couponData.discountValue > 100) {
            return { success: false, message: "Percentage discount cannot exceed 100%" };
        }

        // Check if user-specific coupon has a userId
        if (couponData.isUserSpecific && !couponData.userId) {
            return { success: false, message: "User ID is required for user-specific coupons" };
        }

        // Format the code(s) as an array if it's not already
        const codeArray = Array.isArray(couponData.code) ? couponData.code : [couponData.code];

        // Check if any of the codes already exist
        const existingCouponsResult = await db.getDocuments(
            process.env.CMS_COLLECTION_ID_COUPONS,
            [
                Query.containsAny("code", codeArray)
            ]
        );

        if (existingCouponsResult.success && existingCouponsResult.data.total > 0) {
            const existingCodes = existingCouponsResult.data.documents.flatMap(doc => doc.code);
            const duplicates = codeArray.filter(code => existingCodes.includes(code));

            if (duplicates.length > 0) {
                return {
                    success: false,
                    message: `The following coupon codes already exist: ${duplicates.join(", ")}`
                };
            }
        }

        // Prepare coupon document
        const couponDocument = {
            code: codeArray,
            discountType: couponData.discountType,
            discountValue: couponData.discountValue,
            description: couponData.description || "",
            status: "Active",
            usedCount: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        // Add optional fields if they exist
        if (couponData.expirationDate) {
            couponDocument.expirationDate = new Date(couponData.expirationDate).toISOString();
        }

        if (couponData.usageLimit) {
            couponDocument.usageLimit = couponData.usageLimit;
        }

        if (couponData.isUserSpecific) {
            couponDocument.isUserSpecific = true;
            couponDocument.userId = couponData.userId;
        }

        if (couponData.minimumOrderAmount) {
            couponDocument.minimumOrderAmount = couponData.minimumOrderAmount;
        }

        if (couponData.maximumDiscountAmount) {
            couponDocument.maximumDiscountAmount = couponData.maximumDiscountAmount;
        }

        // Create the coupon in the database
        const result = await db.createDocument(
            process.env.CMS_COLLECTION_ID_COUPONS,
            couponDocument
        );

        return {
            success: result.success,
            message: "Coupon created successfully",
            coupon: result.data
        };
    } catch (error) {
        console.error("Error creating coupon:", error);
        return { success: false, message: error.message || "Failed to create coupon" };
    }
}

/**
 * Update an existing coupon
 * @param {string} couponId - ID of the coupon to update
 * @param {Object} updateData - Updated coupon information
 * @returns {Promise<Object>} - Result of the operation
 */
export async function updateCoupon(couponId, updateData) {
    try {
        // Get the existing coupon
        const couponResult = await db.getDocument(
            process.env.CMS_COLLECTION_ID_COUPONS,
            couponId
        );

        if (!couponResult.success) {
            return { success: false, message: "Coupon not found" };
        }

        const coupon = couponResult.data;

        // If updating the coupon code, check if the new code already exists
        if (updateData.code && updateData.code !== coupon.code) {
            const codeArray = Array.isArray(updateData.code) ? updateData.code : [updateData.code];

            const existingCouponsResult = await db.getDocuments(
                process.env.CMS_COLLECTION_ID_COUPONS,
                [
                    Query.containsAny("code", codeArray),
                    Query.notEqual("$id", couponId) // Exclude the current coupon
                ]
            );

            if (existingCouponsResult.success && existingCouponsResult.data.total > 0) {
                const existingCodes = existingCouponsResult.data.documents.flatMap(doc => doc.code);
                const duplicates = codeArray.filter(code => existingCodes.includes(code));

                if (duplicates.length > 0) {
                    return {
                        success: false,
                        message: `The following coupon codes already exist: ${duplicates.join(", ")}`
                    };
                }
            }
        }

        // For percentage discounts, ensure the value is between 0 and 100
        if (updateData.discountType === "percentage" && updateData.discountValue > 100) {
            return { success: false, message: "Percentage discount cannot exceed 100%" };
        }

        // Check if user-specific coupon has a userId
        if (updateData.isUserSpecific === true && !updateData.userId && !coupon.userId) {
            return { success: false, message: "User ID is required for user-specific coupons" };
        }

        // Prepare update document
        const updateDocument = {
            ...updateData,
            updatedAt: new Date().toISOString()
        };

        // If expirationDate is provided, format it properly
        if (updateData.expirationDate) {
            updateDocument.expirationDate = new Date(updateData.expirationDate).toISOString();
        }

        // Update the coupon in the database
        const result = await db.updateDocument(
            process.env.CMS_COLLECTION_ID_COUPONS,
            couponId,
            updateDocument
        );

        return {
            success: result.success,
            message: "Coupon updated successfully",
            coupon: result.data
        };
    } catch (error) {
        console.error("Error updating coupon:", error);
        return { success: false, message: error.message || "Failed to update coupon" };
    }
}

/**
 * Get coupons with optional filtering
 * @param {Object} [filters] - Optional filters for coupons
 * @param {string} [filters.status] - Filter by status ("Active", "Expired", etc.)
 * @param {boolean} [filters.isUserSpecific] - Filter by user-specific flag
 * @param {string} [filters.userId] - Filter by user ID for user-specific coupons
 * @param {string} [filters.code] - Filter by specific coupon code
 * @param {number} [limit=100] - Maximum number of coupons to return
 * @param {number} [offset=0] - Offset for pagination
 * @returns {Promise<Object>} - Result with coupon list
 */
export async function getCoupons(filters = {}, limit = 100, offset = 0) {
    try {
        // Build query conditions
        const queryConditions = [];

        if (filters.status) {
            queryConditions.push(Query.equal("status", filters.status));
        }

        if (filters.isUserSpecific !== undefined) {
            queryConditions.push(Query.equal("isUserSpecific", filters.isUserSpecific));
        }

        if (filters.userId) {
            queryConditions.push(Query.equal("userId", filters.userId));
        }

        if (filters.code) {
            queryConditions.push(Query.contains("code", [filters.code]));
        }

        // Add expiration filter to exclude expired coupons if status is Active
        if (filters.status === "Active") {
            const now = new Date().toISOString();
            queryConditions.push(
                Query.or(
                    Query.equal("expirationDate", null),
                    Query.greaterThan("expirationDate", now)
                )
            );
        }

        // Get coupons
        const couponsResult = await db.getDocuments(
            process.env.CMS_COLLECTION_ID_COUPONS,
            queryConditions,
            limit,
            offset,
            "createdAt", // Sort by creation date
            "DESC" // Most recent first
        );

        if (!couponsResult.success) {
            return {
                success: false,
                message: "Failed to retrieve coupons",
                coupons: []
            };
        }

        return {
            success: true,
            message: "Coupons retrieved successfully",
            coupons: couponsResult.data.documents,
            total: couponsResult.data.total,
            limit,
            offset
        };
    } catch (error) {
        console.error("Error retrieving coupons:", error);
        return {
            success: false,
            message: error.message || "Failed to retrieve coupons",
            coupons: []
        };
    }
}