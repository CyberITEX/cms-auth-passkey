// src\lib\cms\server\cart.js
"use server";

import { Query } from "./sdk_client";
import * as db from "./sdk_db";


/**
 * Calculate and update the cart total after any cart modification
 * @param {string} cartId - The cart ID to calculate totals for
 * @returns {Promise<Object>} - Result containing the calculated totals and success status
 */
export async function getCartTotal(cartId) {
  try {
    if (!cartId) {
      return {
        success: false,
        message: "Cart ID is required",
        total: 0,
        subtotal: 0,
        discountAmount: 0,
        tipAmount: 0,
        tipPercentage: 0,
        transactionFeePercentage: 5,
        transactionFeeAmount: 0,
        taxPercentage: 0,
        taxAmount: 0,
        grandTotal: 0
      };
    }

    // Get the cart document
    const cartResult = await db.getDocument("carts", cartId);

    if (!cartResult.success) {
      return {
        success: false,
        message: "Cart not found",
        total: 0,
        subtotal: 0,
        discountAmount: 0,
        tipAmount: 0,
        tipPercentage: 0,
        transactionFeePercentage: 5,
        transactionFeeAmount: 0,
        taxPercentage: 0,
        taxAmount: 0,
        grandTotal: 0
      };
    }

    const cart = cartResult.data;

    // Get all cart items
    const cartItemsResult = await db.getDocuments(
      "cartItems",
      [Query.equal("cart", cartId)]
    );

    const items = cartItemsResult.success ? cartItemsResult.data.documents : [];

    // Calculate subtotal
    let itemCount = 0;
    let subtotal = 0;

    for (const item of items) {
      itemCount += item.quantity;

      // Get the correct price from productPlanPricing
      const pricing = item.productPlanPricing;
      let itemPrice = pricing.price || 0;

      // Apply the item-level discount if available
      // Note: We're now using the proper discount calculation based on the pricing model
      let itemTotal = itemPrice;

      if (pricing.discountAmount && pricing.discountType === 'percentage') {
        // If discount is percentage-based
        const discountValue = (itemPrice * pricing.discountAmount) / 100;
        itemTotal = itemPrice - discountValue;
      } else if (pricing.discountAmount && pricing.discountType === 'fixed') {
        // If discount is a fixed amount
        itemTotal = itemPrice - pricing.discountAmount;
      }

      // Multiply by quantity and add to subtotal
      subtotal += itemTotal * item.quantity;
    }

    // Get values from cart object
    const discountAmount = cart.discountAmount || 0;
    const tipAmount = cart.tipAmount || 0;
    const tipPercentage = cart.tipPercentage || 0;
    const transactionFeePercentage = cart.transactionFeePercentage || 5;
    const taxPercentage = cart.taxPercentage || 0;

    // Calculate fee amounts based on subtotal
    const transactionFeeAmount = (subtotal * transactionFeePercentage) / 100;

    // Calculate tax on the subtotal after discount
    const taxableAmount = subtotal - discountAmount;
    const taxAmount = (taxableAmount * taxPercentage) / 100;

    // Calculate tip amount if percentage is provided but amount is not
    let calculatedTipAmount = tipAmount;
    if (!tipAmount && tipPercentage > 0) {
      calculatedTipAmount = (subtotal * tipPercentage) / 100;
    }

    // Calculate grand total
    const grandTotal = subtotal - discountAmount + calculatedTipAmount + transactionFeeAmount + taxAmount;

    // Update the cart with calculated totals
    const updateResult = await db.updateDocument("carts", cartId, {
      subtotal: subtotal,
      itemCount: itemCount,
      transactionFeeAmount: transactionFeeAmount,
      taxAmount: taxAmount,
      tipAmount: calculatedTipAmount,
      grandTotal: grandTotal,
      updatedAt: new Date().toISOString()
    });
    return {
      success: updateResult.success,
      message: "Cart totals calculated and updated",
      total: subtotal, // For backward compatibility
      subtotal: subtotal,
      discountAmount: discountAmount,
      tipAmount: calculatedTipAmount,
      tipPercentage: tipPercentage,
      transactionFeePercentage: transactionFeePercentage,
      transactionFeeAmount: transactionFeeAmount,
      taxPercentage: taxPercentage,
      taxAmount: taxAmount,
      grandTotal: grandTotal,
      itemCount: itemCount
    };
  } catch (error) {
    console.error("Error calculating cart total:", error);
    return {
      success: false,
      message: error.message || "Failed to calculate cart total",
      total: 0,
      subtotal: 0,
      discountAmount: 0,
      tipAmount: 0,
      tipPercentage: 0,
      transactionFeePercentage: 5,
      transactionFeeAmount: 0,
      taxPercentage: 0,
      taxAmount: 0,
      grandTotal: 0
    };
  }
}

/**
 * Get or create an active cart for a user
 * @param {string} userId - The user ID
 * @param {string} [cartId] - Optional cart ID to retrieve a specific cart
 * @param {string} [userEmail] - The user email (required for creation)
 * @returns {Promise<Object>} - The cart object
 */
export async function getOrCreateCart(userId, userEmail, cartId) {
  try {
    // If cartId is provided, try to get that specific cart first
    if (cartId) {
      const specificCartResult = await db.getDocument("carts", cartId);
      if (specificCartResult.success) {
        // Ensure the cart belongs to the user for security
        if (specificCartResult.data.userId === userId) {
          return specificCartResult.data;
        }
      }
    } else {
      const existingCartResult = await db.getDocuments("carts", [
        Query.equal("userId", userId),
        Query.equal("createdBy", userId),
        Query.equal("status", "Active"),
        Query.orderAsc("$createdAt"),
        Query.limit(1)
      ]);

      if (existingCartResult.success && existingCartResult.data.total > 0) {
        return existingCartResult.data.documents[0];
      }
    }

    // If no userEmail is provided, we can't create a new cart
    if (!userEmail) {
      throw new Error("User email is required to create a new cart");
    }

    // Create new cart
    const newCartResult = await db.createDocument("carts", {
      userId: userId,
      email: userEmail,
      status: "Active",
      createdBy: userId,
      createdByEmail: userEmail,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      transactionFeePercentage: 5,
      subtotal: 0,
      grandTotal: 0,
      itemCount: 0,
    });

    if (!newCartResult.success) {
      throw new Error(newCartResult.message || "Failed to create cart");
    }

    return newCartResult.data;
  } catch (error) {
    console.error("Error in getOrCreateCart:", error);
    throw error;
  }
}

/**
 * Add an item to the cart
 * @param {string} userId - The user ID
 * @param {string} userEmail - The user email
 * @param {Object} itemData - The item to add to cart
 * @param {string} [cartId] - Optional cart ID to add item to a specific cart
 * @returns {Promise<Object>} - Result of the operation
 */
export async function addToCart(userId, userEmail, itemData, cartId) {
  try {
    // Get or create an active cart
    const cart = await getOrCreateCart(userId, userEmail, cartId);

    // Check if item already exists in cart (same plan & pricing)
    const existingItemsResult = await db.getDocuments("cartItems", [
      Query.equal("cart", cart.$id),
      Query.equal("productPlanPricing", itemData.pricingId)
    ]);

    let itemResult;
    if (existingItemsResult.success && existingItemsResult.data.total > 0) {
      // Update quantity of existing item
      const existingItem = existingItemsResult.data.documents[0];
      itemResult = await db.updateDocument(
        "cartItems",
        existingItem.$id,
        {
          quantity: existingItem.quantity + (itemData.quantity || 1),
          updatedAt: new Date().toISOString()
        }
      );
    } else {
      // Add new item to cart
      itemResult = await db.createDocument("cartItems", {
        // Relationship
        cart: cart.$id,
        productPlanPricing: itemData.pricingId,
        // Quantity & timestamps
        quantity: itemData.quantity || 1,
        notes: itemData.notes || "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }

    // Update the cart's updatedAt timestamp
    await db.updateDocument("carts", cart.$id, {
      updatedAt: new Date().toISOString()
    });

    // Calculate and update cart totals
    const cartTotals = await getCartTotal(cart.$id);

    return {
      success: itemResult.success,
      message: existingItemsResult.success && existingItemsResult.data.total > 0
        ? "Cart updated"
        : "Item added to cart",
      item: itemResult.data,
      totals: cartTotals
    };
  } catch (error) {
    console.error("Error adding to cart:", error);
    return { success: false, message: error.message || "Failed to add item to cart" };
  }
}

/**
 * Update cart item quantity
 * @param {string} cartId - The cart ID
 * @param {string} itemId - The cart item ID
 * @param {number} quantity - The new quantity
 * @returns {Promise<Object>} - Result of the operation
 */
export async function updateCartItemQuantity(cartId, itemId, quantity) {
  try {
    if (quantity <= 0) {
      return await removeCartItem(cartId, itemId);
    }

    const updatedItemResult = await db.updateDocument(
      "cartItems",
      itemId,
      {
        quantity: quantity,
        updatedAt: new Date().toISOString()
      }
    );

    // Also update the cart's updatedAt timestamp
    await db.updateDocument("carts", cartId, {
      updatedAt: new Date().toISOString()
    });

    // Calculate and update cart totals
    const cartTotals = await getCartTotal(cartId);

    return {
      success: updatedItemResult.success,
      message: "Quantity updated",
      item: updatedItemResult.data,
      totals: cartTotals
    };
  } catch (error) {
    console.error("Error updating quantity:", error);
    return { success: false, message: error.message || "Failed to update quantity" };
  }
}

/**
 * Remove an item from the cart
 * @param {string} cartId - The cart ID
 * @param {string} itemId - The cart item ID to remove
 * @returns {Promise<Object>} - Result of the operation
 */
export async function removeCartItem(cartId, itemId) {
  try {
    const deleteResult = await db.deleteDocument("cartItems", itemId);

    // Update cart's updatedAt timestamp
    await db.updateDocument("carts", cartId, {
      updatedAt: new Date().toISOString()
    });

    // Calculate and update cart totals
    const cartTotals = await getCartTotal(cartId);

    return {
      success: deleteResult.success,
      message: "Item removed from cart",
      totals: cartTotals
    };
  } catch (error) {
    console.error("Error removing item:", error);
    return { success: false, message: error.message || "Failed to remove item" };
  }
}

/**
 * Get the current cart with items
 * @param {string} userId - The user ID
 * @param {string} [cartId] - Optional cart ID to get a specific cart
 * @returns {Promise<Object>} - Cart with items or empty cart
 */
export async function getCart(userId, cartId) {
  try {
    let cart = null;

    // If cartId is provided, try to get that specific cart
    if (cartId) {
      const specificCartResult = await db.getDocument("carts", cartId);
      if (specificCartResult.success) {
        // For security, ensure the cart belongs to the user or return empty
        if (specificCartResult.data.userId === userId) {
          cart = specificCartResult.data;
        } else {
          return { cart: null, items: [], itemCount: 0, total: 0 };
        }
      }
    }

    // If no cart found by ID or no ID provided, find by userId
    if (!cart) {
      // If no userId is provided, return empty cart
      if (!userId) {
        return { cart: null, items: [], itemCount: 0, total: 0 };
      }

      // Find active cart for this user
      const cartsResult = await db.getDocuments("carts", [
        Query.equal("userId", userId),
        Query.equal("createdBy", userId),
        Query.equal("status", "Active"),
        Query.orderAsc("$createdAt"),
        Query.limit(1)
      ]);

      if (!cartsResult.success || cartsResult.data.total === 0) {
        return { cart: null, items: [], itemCount: 0, total: 0 };
      }

      cart = cartsResult.data.documents[0];
    }

    // Get cart items
    const cartItemsResult = await db.getDocuments(
      "cartItems",
      [Query.equal("cart", cart.$id)]
    );

    const items = cartItemsResult.success ? cartItemsResult.data.documents : [];
    // Use the pre-calculated values from the cart if available,
    // otherwise calculate on the fly for backward compatibility
    let itemCount = cart.itemCount;
    let total = cart.subtotal;

    // If the pre-calculated values are not available, calculate them
    if (itemCount === undefined || total === undefined) {
      itemCount = 0;
      total = 0;

      for (const item of items) {
        itemCount += item.quantity;
        const itemPrice = item.price || 0;
        const itemDiscount = item.discount || 0;
        total += (itemPrice - itemDiscount) * item.quantity;
      }
    }

    return {
      cart,
      items,
      itemCount,
      total
    };
  } catch (error) {
    console.error("Error getting cart:", error);
    return { cart: null, items: [], itemCount: 0, total: 0 };
  }
}

/**
 * Clear the user's current cart
 * @param {string} userId - The user ID
 * @param {string} [cartId] - Optional cart ID to clear a specific cart
 * @returns {Promise<Object>} - Result of the operation
 */
export async function clearCart(userId, cartId) {
  try {
    if (!userId) {
      return { success: false, message: "User ID is required" };
    }

    let cart = null;

    // If cartId is provided, try to get that specific cart
    if (cartId) {
      const specificCartResult = await db.getDocument("carts", cartId);
      if (specificCartResult.success) {
        // For security, ensure the cart belongs to the user
        if (specificCartResult.data.userId === userId) {
          cart = specificCartResult.data;
        } else {
          return { success: false, message: "Unauthorized access to cart" };
        }
      }
    }

    // If no cart found by ID or no ID provided, find by userId
    if (!cart) {
      // Find active cart
      const cartsResult = await db.getDocuments("carts", [
        Query.equal("userId", userId),
        Query.equal("status", "Active"),
        Query.orderAsc("$createdAt"),
        Query.limit(1)
      ]);

      if (!cartsResult.success || cartsResult.data.total === 0) {
        return { success: true, message: "No active cart found" };
      }

      cart = cartsResult.data.documents[0];
    }

    const deleteResult = await db.deleteDocument("carts", cartId);
    return {
      success: deleteResult.success,
      message: deleteResult.success ? "Cart successfully removed" : "Failed to remove cart",
    };


    // // Get cart items
    // const cartItemsResult = await db.getDocuments(
    //   "cartItems",
    //   [Query.equal("cart", cart.$id)]
    // );

    // // Delete all items
    // if (cartItemsResult.success) {
    //   for (const item of cartItemsResult.data.documents) {
    //     await db.deleteDocument("cartItems", item.$id);
    //   }
    // }

    // Reset cart values
    // const updateResult = await db.updateDocument("carts", cart.$id, {
    //   subtotal: 0,
    //   itemCount: 0,
    //   tipAmount: 0,
    //   tipPercentage: null,
    //   discountAmount: 0,
    //   couponCode: null,
    //   transactionFeePercentage: 5,
    //   grandTotal: 0,
    //   updatedAt: new Date().toISOString()
    // });

    // return {
    //   success: updateResult.success,
    //   message: "Cart cleared"
    // };
  } catch (error) {
    console.error("Error clearing cart:", error);
    return { success: false, message: error.message || "Failed to clear cart" };
  }
}

/**
 * Add or update tip amount to the cart
 * @param {string} userId - The user ID
 * @param {number} tipAmount - The tip amount to add
 * @param {string} tipType - Either "fixed" or "percentage"
 * @param {string} cartId - The cart ID
 * @returns {Promise<Object>} - Result of the operation
 */
export async function addTip(userId, tipAmount, tipType = "fixed", cartId) {
  try {
    const { cart, total } = await getCart(userId, cartId);

    if (!cart) {
      return { success: false, message: "No active cart found" };
    }

    // Calculate tip amount if percentage
    let finalTipAmount = tipAmount;
    let tipPercentage = null;

    if (tipType === "percentage") {
      tipPercentage = tipAmount;
      finalTipAmount = (total * tipAmount) / 100;
    }

    const updateResult = await db.updateDocument(
      "carts",
      cart.$id,
      {
        tipAmount: finalTipAmount,
        tipPercentage: tipPercentage,
        updatedAt: new Date().toISOString()
      }
    );

    // Calculate and update cart totals
    const cartTotals = await getCartTotal(cart.$id);

    return {
      success: updateResult.success,
      message: "Tip added successfully",
      tipAmount: finalTipAmount,
      totals: cartTotals
    };
  } catch (error) {
    console.error("Error adding tip:", error);
    return { success: false, message: error.message || "Failed to add tip" };
  }
}

/**
 * Remove tip from cart
 * @param {string} userId - The user ID
 * @param {string} cartId - The cart ID
 * @returns {Promise<Object>} - Result of the operation
 */
export async function removeTip(userId, cartId) {
  try {
    const { cart } = await getCart(userId, cartId);

    if (!cart) {
      return { success: false, message: "No active cart found" };
    }

    const updateResult = await db.updateDocument(
      "carts",
      cart.$id,
      {
        tipAmount: 0,
        tipPercentage: null,
        updatedAt: new Date().toISOString()
      }
    );

    // Calculate and update cart totals
    const cartTotals = await getCartTotal(cart.$id);

    return {
      success: updateResult.success,
      message: "Tip removed",
      totals: cartTotals
    };
  } catch (error) {
    console.error("Error removing tip:", error);
    return { success: false, message: error.message || "Failed to remove tip" };
  }
}

/**
 * Convert cart to order
 * @param {string} userId - The user ID
 * @param {Object} checkoutData - Additional data needed for checkout
 * @param {string} [cartId] - Optional cart ID to checkout a specific cart
 * @returns {Promise<Object>} - Created order or error
 */
export async function checkout(userId, checkoutData, cartId) {
  try {
    const { cart, items, total } = await getCart(userId, cartId);

    if (!cart) {
      return { success: false, message: "No active cart found" };
    }

    if (items.length === 0) {
      return { success: false, message: "Cart is empty" };
    }

    // Calculate and update cart totals before checkout
    const cartTotals = await getCartTotal(cart.$id);

    // Implement checkout logic here:
    // 1. Create order record
    // 2. Create order items from cart items
    // 3. Process payment
    // 4. Create subscriptions for subscription items
    // 5. Mark cart as completed
    // 6. Return order details

    // This would be implemented based on your checkout flow requirements

    return { success: true, message: "Checkout not yet implemented", totals: cartTotals };
  } catch (error) {
    console.error("Error during checkout:", error);
    return { success: false, message: error.message || "Checkout failed" };
  }
}

/**
 * Get cart count for a user (for header display)
 * @param {string} userId - The user ID
 * @param {string} [cartId] - Optional cart ID to get count for a specific cart
 * @returns {Promise<number>} - Number of items in cart
 */
export async function getCartItemCount(userId, cartId = null) {
  try {
    if (!userId) return 0;

    const { itemCount } = await getCart(userId, cartId);
    return itemCount;
  } catch (error) {
    console.error("Error getting cart count:", error);
    return 0;
  }
}


/**
 * Add a discount amount to the cart
 * @param {string} userId - The user ID
 * @param {number} discountAmount - The discount amount to add (fixed value)
 * @param {string} cartId - The cart ID
 * @returns {Promise<Object>} - Result of the operation
 */
export async function addDiscount(userId, discountAmount, cartId) {
  try {
    const { cart } = await getCart(userId, cartId);

    if (!cart) {
      return { success: false, message: "No active cart found" };
    }

    // Ensure discount is a positive number
    const finalDiscountAmount = Math.max(0, discountAmount);

    const updateResult = await db.updateDocument(
      "carts",
      cart.$id,
      {
        discountAmount: finalDiscountAmount,
        updatedAt: new Date().toISOString()
      }
    );

    // Calculate and update cart totals
    const cartTotals = await getCartTotal(cart.$id);

    return {
      success: updateResult.success,
      message: "Discount added successfully",
      discountAmount: finalDiscountAmount,
      totals: cartTotals
    };
  } catch (error) {
    console.error("Error adding discount:", error);
    return { success: false, message: error.message || "Failed to add discount" };
  }
}


/**
 * Remove discount from cart
 * @param {string} userId - The user ID
 * @param {string} cartId - The cart ID
 * @returns {Promise<Object>} - Result of the operation
 */
export async function removeDiscount(userId, cartId) {
  try {
    const { cart } = await getCart(userId, cartId);

    if (!cart) {
      return { success: false, message: "No active cart found" };
    }

    const updateResult = await db.updateDocument(
      "carts",
      cart.$id,
      {
        discountAmount: 0,
        updatedAt: new Date().toISOString()
      }
    );

    // Calculate and update cart totals
    const cartTotals = await getCartTotal(cart.$id);

    return {
      success: updateResult.success,
      message: "Discount removed",
      totals: cartTotals
    };
  } catch (error) {
    console.error("Error removing discount:", error);
    return { success: false, message: error.message || "Failed to remove discount" };
  }
}