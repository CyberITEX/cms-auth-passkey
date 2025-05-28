// src/lib/cms/server/orders.js
'use server';

import { getCart, clearCart } from './cart';
import { getUser } from './sdk_users';
import { subDays } from 'date-fns';
import {
  createDocument,
  deleteDocument,
  getDocument,
  getDocuments,
  updateDocument,
  getDocumentsByRelation
} from './sdk_db';
import { Query } from './sdk_client';
import { cancelSubscription, deleteSubscriptionByAdmin, pauseSubscription, resumeSubscription } from './subscriptions';
import { createPlanDownloadAccess } from './downloads';
import { sendOrderConfirmationEmail, sendOrderStatusUpdateEmail } from '@/functions/email/orderMail';
// Collection names
const ORDERS_COLLECTION = 'orders';
const ORDER_ITEMS_COLLECTION = 'orderItems';
const ORDER_PAYMENTS_COLLECTION = 'orderPayments';
const ORDER_SUBSCRIPTIONS_COLLECTION = 'orderSubscriptions';

/**
 * Register a payment in the database
 * @param {string} orderId - The order ID
 * @param {Object} paymentData - Payment data from Stripe or PayPal
 * @param {string} gateway - Payment gateway used (stripe, paypal, braintree, bankTransfer, other)
 * @returns {Object} - Response with success status and data or error message
 */
export const registerPayment = async (orderId, paymentData, gateway = 'stripe', userId) => {
  try {
    if (!orderId) {
      throw new Error('Order ID is required');
    }

    if (!paymentData) {
      throw new Error('Payment data is required');
    }

    // Map payment method based on gateway
    const getPaymentMethod = () => {
      switch (gateway) {
        case 'stripe':
          return paymentData.payment_method_types?.[0] === 'card' ? 'creditCard' : 'other';
        case 'paypal':
          return 'digitalWallet';
        case 'bankTransfer':
          return 'bankTransfer';
        default:
          return 'other';
      }
    };

    // Format amount correctly based on gateway
    const formatAmount = () => {
      if (gateway === 'stripe') {
        // Stripe amount is in cents, convert to dollars
        return Number(paymentData.amount) / 100 || 0;
      } else if (gateway === 'paypal') {
        // PayPal amount is already in dollars
        return Number(paymentData.amount) || 0;
      }
      return Number(paymentData.amount) || 0;
    };

    // Base payment record that matches schema
    let paymentRecord = {
      order: orderId,
      paymentMethod: getPaymentMethod(),
      amount: formatAmount(),
      currency: paymentData.currency || 'USD',
      status: gateway === 'paypal' ?
        (paymentData.status === 'COMPLETED' ? 'Completed' : 'Pending') :
        (paymentData.status === 'succeeded' ? 'Completed' : 'Pending'),
      paymentGateway: gateway,
      description: `Payment for order ${orderId}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      transactionId: paymentData.transactionId || '', // Will be populated based on gateway
      userId: userId || '',
      userEmail: paymentData.receipt_email || paymentData.email || '',
    };

    // Add gateway-specific fields based on schema
    if (gateway === 'stripe') {
      // Use latest_charge as the transactionId if available
      const transactionId = paymentData.latest_charge?.id || paymentData.id;

      paymentRecord = {
        ...paymentRecord,
        transactionId: transactionId,
        stripePaymentId: paymentData.id || transactionId,
        stripePaymentIntentId: paymentData.id,
        stripePaymentMethodId: paymentData.payment_method || '',
        stripeCustomerId: paymentData.customer || '',
        paymentMethodDetails: paymentData.latest_charge?.payment_method_details?.card?.brand
          ? `${paymentData.latest_charge.payment_method_details.card.brand} ending in ${paymentData.latest_charge.payment_method_details.card.last4}`
          : '',
        receiptUrl: paymentData.latest_charge?.receipt_url || '',
      };
    } else if (gateway === 'paypal') {
      paymentRecord = {
        ...paymentRecord,
        transactionId: paymentData.transactionId || '',
        paypalTransactionId: paymentData.transactionId || '',
        paypalPayerId: paymentData.payerId || '',
        description: `PayPal payment for order ${orderId}`,
        userEmail: paymentData.email || '',
      };
    } else if (gateway === 'braintree') {
      paymentRecord = {
        ...paymentRecord,
        transactionId: paymentData.transactionId || paymentData.id,
        braintreeTransactionId: paymentData.transactionId || '',
        braintreePaymentMethodToken: paymentData.paymentMethodToken || '',
      };
    } else if (gateway === 'bankTransfer') {
      paymentRecord = {
        ...paymentRecord,
        transactionId: paymentData.referenceNumber || `BT-${Date.now()}`,
        bankName: paymentData.bankName || '',
        bankTransferReference: paymentData.referenceNumber || '',
        status: 'Pending', // Bank transfers typically start as pending
      };
    }

    // Create payment record in database using SDK function
    const paymentResult = await createDocument(
      ORDER_PAYMENTS_COLLECTION,
      paymentRecord
    );

    if (!paymentResult.success) {
      throw new Error(paymentResult.message || 'Failed to create payment record');
    }

    // Update order status to Processing
    const orderUpdateResult = await updateDocument(
      ORDERS_COLLECTION,
      orderId,
      {
        status: 'Processing',
        paidAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
    );

    if (!orderUpdateResult.success) {
      console.warn('Payment recorded but failed to update order status:', orderUpdateResult.message);
    }

    return paymentResult;
  } catch (error) {
    console.error('Error registering payment:', error);
    return {
      success: false,
      message: error.message || 'Failed to register payment'
    };
  }
};

/**
 * Create an order in the database
 * @param {string} userId - User ID
 * @param {string} cartId - Cart ID
 * @param {string} billingAddress - Billing address
 * @param {Object} paymentData - Payment data
 * @param {Object} options - Additional options
 * @returns {Object} - Response with success status and order data
 */
export const createOrder = async (userId, cartId, billingAddress, paymentData, options = {}) => {
  try {
    // Validate required fields
    if (!userId || !cartId) {
      throw new Error('User ID and Cart ID are required');
    }

    // Get cart data
    const cartData = await getCart(userId, cartId);
    if (!cartData.cart) {
      throw new Error('Cart not found');
    }

    // Get user info
    const userResponse = await getUser(userId);
    if (!userResponse.success) {
      throw new Error('User not found');
    }

    // Get address details
    let addressDetails = billingAddress;

    // Create a formatted address string
    let formattedAddress = '';
    if (addressDetails) {
      formattedAddress = JSON.stringify({
        name: addressDetails.addressName,
        line1: addressDetails.addressLine1,
        line2: addressDetails.addressLine2 || '',
        city: addressDetails.city,
        state: addressDetails.state,
        postalCode: addressDetails.postalCode,
        country: addressDetails.country,
        email: addressDetails.email || userResponse.data.email,
      });
    }

    // Generate order number
    // const orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    // In your database schema


    const prefix = "ORD";
    const lastOrderNumber = await getLastOrderNumber();
    let orderNumber;

    if (lastOrderNumber) {
      // Extract the numeric part from the last order number
      const lastNumericPart = parseInt(lastOrderNumber.replace(prefix, ""));

      // Increment it by 1
      const nextNumericPart = lastNumericPart + 1;

      // Format with padding
      const paddedId = nextNumericPart.toString().padStart(6, '0');
      orderNumber = `${prefix}${paddedId}`;
    } else {
      orderNumber = "ORD001001"; // Starting point if no previous orders
    }


    // const orderNumber = cartData.cart.$id;

    // Create order document
    const orderData = {
      orderNumber,
      userId,
      status: 'Pending', // Will be updated to Processing after payment
      type: 'Order', // Default, may be updated for subscriptions
      billingAddress: formattedAddress,

      // Cart-related data
      discountAmount: cartData.cart.discountAmount || 0,
      tipPercentage: cartData.cart.tipPercentage || 0,
      tipAmount: cartData.cart.tipAmount || 0,
      transactionFeePercentage: cartData.cart.transactionFeePercentage || 0,
      transactionFeeAmount: cartData.cart.transactionFeeAmount || 0,
      couponCode: cartData.cart.couponCode || '',
      currency: 'USD',

      // Timestamps
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),

      // Set cart relationship
      order_cart_relation: cartId,

      // Set coupon relationship if applicable
      ...(cartData.cart.cart_coupon_relation ? { order_coupon_relation: cartData.cart.cart_coupon_relation.$id } : {})
    };

    // Add payment details if available
    if (paymentData) {
      if (paymentData.gateway === 'stripe') {
        orderData.paymentGateway = 'stripe';
        orderData.stripePaymentMethodId = paymentData.paymentMethodId || '';
      } else if (paymentData.gateway === 'paypal') {
        orderData.paymentGateway = 'paypal';
      }
    }

    // Add additional options
    if (options.notes) {
      orderData.notes = options.notes;
    }

    // Create order using SDK function
    return await createDocument(ORDERS_COLLECTION, orderData, cartData.cart.$id);
  } catch (error) {
    console.error('Error creating order:', error);
    return {
      success: false,
      message: error.message || 'Failed to create order'
    };
  }
};


export const getLastOrderNumber = async () => {
  try {
    // Get a batch of orders
    const response = await getDocuments(
      ORDERS_COLLECTION,
      [
        Query.orderDesc('$createdAt'), // Order by creation date, newest first
        Query.limit(1)                 // Limit to just one result
      ]
    );

    // Check if we have any documents and return the order number
    if (response.success && response.data.documents && response.data.documents.length > 0) {
      return response.data.documents[0].orderNumber || null;
    }

    // Return null or a default value if no documents found
    return null;
  } catch (e) {
    console.error('Error fetching last order number:', e);
    // Either rethrow the error or return a default value
    throw e; // Uncomment to rethrow
    // return null; // Uncomment to return null instead
  }
}


/**
 * Create order items for an order
 * @param {string} orderId - Order ID
 * @param {string} userId - User ID
 * @param {string} cartId - Cart ID
 * @returns {Object} - Response with success status and order items data
 */
export const createOrderItems = async (orderId, userId, cartId) => {
  try {
    // Get cart with items
    const cartData = await getCart(userId, cartId);
    if (!cartData.cart || !cartData.items || cartData.items.length === 0) {
      throw new Error('Cart has no items');
    }

    const orderItems = [];
    const subscriptionItems = [];

    // Process each cart item
    for (const item of cartData.items) {
      // Access the productPlanPricing directly from the cart item
      const productPlanPricing = item.productPlanPricing || {};
      const product = productPlanPricing.product || {};
      const plan = productPlanPricing.plan || {};
      // Calculate item subtotal with proper discount handling
      let itemPrice = productPlanPricing.price || 0;
      let discountAmount = 0;

      if (productPlanPricing.discountAmount && productPlanPricing.discountType === 'percentage') {
        discountAmount = (itemPrice * productPlanPricing.discountAmount) / 100;
      } else if (productPlanPricing.discountAmount && productPlanPricing.discountType === 'fixed') {
        discountAmount = productPlanPricing.discountAmount;
      }

      const itemSubtotal = (itemPrice - discountAmount) * item.quantity;

      // Prepare order item data with the EXACT field names from your schema
      const orderItemData = {
        // Relationships
        order: orderId,
        productPlanPricing: productPlanPricing.$id || null,
        product: product.$id,
        plan: plan.$id,

        // String fields
        notes: item.notes || "",

        // Numeric fields
        price: itemPrice,
        discountAmount: discountAmount, // Note: renamed from "discount" to "discountAmount" per schema
        subtotal: itemSubtotal,
        quantity: item.quantity || 1,

        // Enum field
        pricingModel: productPlanPricing.pricingModel || 'one-off',

        // JSON string field
        billingDetails: JSON.stringify({
          billingFrequency: productPlanPricing.billingFrequency || 'one-off',
          billingInterval: productPlanPricing.billingInterval || 1,
          billingCycle: productPlanPricing.billingCycle || 'UntilCanceled'
        }),

        // Timestamp fields
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Create order item using SDK function
      const orderItemResult = await createDocument(ORDER_ITEMS_COLLECTION, orderItemData);

      if (!orderItemResult.success) {
        throw new Error(`Failed to create order item: ${orderItemResult.message}`);
      }

      orderItems.push(orderItemResult.data);

      // If this is a subscription item, track it for subscription creation
      if (productPlanPricing.pricingModel === 'subscription') {
        subscriptionItems.push({
          orderItem: orderItemResult.data,
          item: {
            pricingId: productPlanPricing.$id, // Only store IDs that exist in schema
            productName: product.prettyName || product.name,
            planName: plan.prettyName || plan.name,
            pricingName: productPlanPricing.name,
            price: itemPrice,
            billingFrequency: productPlanPricing.billingFrequency,
            billingInterval: productPlanPricing.billingInterval,
            billingCycle: productPlanPricing.billingCycle,
            pricingModel: productPlanPricing.pricingModel,
            discountAmount: discountAmount
          }
        });
      }
    }

    // Return the created order items and subscription items
    return {
      success: true,
      data: {
        orderItems,
        subscriptionItems
      }
    };
  } catch (error) {
    console.error('Error creating order items:', error);
    return {
      success: false,
      message: error.message || 'Failed to create order items'
    };
  }
};

/**
 * Create subscriptions for subscription items
 * @param {string} orderId - Order ID
 * @param {string} userId - User ID
 * @param {Array} subscriptionItems - Items that need subscriptions
 * @returns {Object} - Response with success status and subscriptions data
 */
export const createSubscriptions = async (orderId, userId, subscriptionItems) => {
  try {
    if (!subscriptionItems || subscriptionItems.length === 0) {
      return { success: true, data: [] };
    }

    const subscriptions = [];

    // Process each subscription item
    for (const { orderItem, item } of subscriptionItems) {
      // Determine next billing date based on frequency
      const nextBillingDate = calculateNextBillingDate(
        item.billingFrequency || 'month',
        item.billingInterval || 1
      );

      // FIXED: Only include fields that exist in the schema
      // Based on your schema, we do NOT include productId or planId as standalone fields
      const subscriptionData = {
        userId,
        order: orderId,

        // Use the relationship field from the schema - this is the key field as per your schema
        productPlanPricing: item.pricingId,

        // Denormalized fields - these are in your schema
        productName: item.productName || 'Unknown Product',
        planName: item.planName || 'Unknown Plan',
        pricingName: item.pricingName || 'Unknown Pricing',

        // Billing details - these match your schema
        price: item.price,
        discountAmount: item.discountAmount || 0,
        billingFrequency: item.billingFrequency || 'month',
        billingCycle: item.billingCycle || 'UntilCanceled',
        billingInterval: item.billingInterval || 1,
        nextBillingDate: nextBillingDate.toISOString(),

        // Status field as per schema
        status: 'Active',

        // Timestamps
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Create subscription using SDK function
      const subscriptionResult = await createDocument(
        ORDER_SUBSCRIPTIONS_COLLECTION,
        subscriptionData
      );

      if (!subscriptionResult.success) {
        throw new Error(`Failed to create subscription for ${item.productName}: ${subscriptionResult.message}`);
      }

      subscriptions.push(subscriptionResult.data);

      // Update the order type to reflect it includes subscriptions
      await updateDocument(
        ORDERS_COLLECTION,
        orderId,
        {
          type: 'Subscription',
          updatedAt: new Date().toISOString()
        }
      );
    }

    return {
      success: true,
      data: subscriptions // Return subscriptions directly in data
    };
  } catch (error) {
    console.error('Error creating subscriptions:', error);
    return {
      success: false,
      message: error.message || 'Failed to create subscriptions',
      data: [] // Provide empty array for consistent access
    };
  }
};

/**
 * Complete order processing after payment
 * @param {string} userId - User ID
 * @param {string} cartId - Cart ID
 * @param {string} billingAddress - Billing address
 * @param {Object} paymentData - Payment data
 * @param {Object} options - Additional options
 * @returns {Object} - Response with success status and order data
 */
export const processOrderAfterPayment = async (userId, cartId, billingAddress, paymentData, options = {}) => {
  try {
    // 1. Validate required parameters
    if (!userId || !cartId) {
      throw new Error('User ID and Cart ID are required');
    }

    // 2. Verify payment is complete before proceeding
    if (!paymentData || !paymentData.paymentData) {
      throw new Error('Payment data is missing or incomplete');
    }

    // 3. Additional payment verification based on gateway
    if (paymentData.gateway === 'stripe') {
      // Verify Stripe payment intent exists
      if (!paymentData.paymentData.paymentIntentId) {
        throw new Error('Stripe payment intent ID is missing');
      }

      // Optional: Verify Stripe payment status with Stripe API
      // const stripeVerification = await verifyStripePayment(paymentData.paymentData.paymentIntentId);
      // if (!stripeVerification.success) {
      //   throw new Error('Payment verification failed: ' + stripeVerification.message);
      // }
    } else if (paymentData.gateway === 'paypal') {
      // Verify PayPal transaction ID exists
      if (!paymentData.paymentData.transactionId) {
        throw new Error('PayPal transaction ID is missing');
      }

      // Optional: Verify PayPal payment status with PayPal API
      // const paypalVerification = await verifyPayPalPayment(paymentData.paymentData.transactionId);
      // if (!paypalVerification.success) {
      //   throw new Error('PayPal payment verification failed: ' + paypalVerification.message);
      // }
    } else {
      throw new Error('Unsupported payment gateway');
    }

    // 4. Create the order (only after payment verified)
    const orderResult = await createOrder(userId, cartId, billingAddress, paymentData, options);
    if (!orderResult.success) {
      throw new Error(orderResult.message || 'Failed to create order');
    }

    const orderId = orderResult.data.$id;

    // 5. Create the order items
    const orderItemsResult = await createOrderItems(orderId, userId, cartId);
    if (!orderItemsResult.success) {
      // If order items creation fails, we should try to delete the order
      await deleteOrder(orderId).catch(error => {
        console.error('Failed to delete order after order items creation failure:', error);
      });
      throw new Error(orderItemsResult.message || 'Failed to create order items');
    }

    // 6. Handle subscription items if any
    let subscriptionsResult = { success: true, data: [] }; // Default empty array
    if (orderItemsResult.data && orderItemsResult.data.subscriptionItems &&
      orderItemsResult.data.subscriptionItems.length > 0) {

      console.log('Creating subscriptions for:', orderItemsResult.data.subscriptionItems.length, 'items');

      subscriptionsResult = await createSubscriptions(
        orderId,
        userId,
        orderItemsResult.data.subscriptionItems
      );

      if (!subscriptionsResult.success) {
        console.error('Failed to create subscriptions:', subscriptionsResult.message);
        // We don't fail the whole process for subscription creation failure
        // But we should log this for follow-up
      }
    }


    // 7. Create download access based on subscription items
    const downloadAccessResults = [];
    if (subscriptionsResult.data) {
      for (const item of subscriptionsResult.data) {
        if (item.productPlanPricing && item.productPlanPricing.plan.downloadable) {
          const sourceIdentifier = `SUB-${orderResult.data.orderNumber}`
          // Create access for all files in this plan
          const accessResult = await createPlanDownloadAccess(
            userId,
            item.productPlanPricing.plan.$id,
            orderId,
            item.$id,
            {
              orderNumber: sourceIdentifier,
              type: 'subscription'
            }
          );

          downloadAccessResults.push({
            planId: item.productPlanPricing.plan.$id,
            ...accessResult
          });
        }
      }
    }

    if (orderItemsResult.data && orderItemsResult.data.orderItems) {
      for (const orderItem of orderItemsResult.data.orderItems) {
        if (orderItem.plan && orderItem.plan.downloadable && (orderItem.pricingModel === 'one-off')) {
          const sourceIdentifier = orderResult.data.orderNumber;
          // Create access for all files in this plan
          const accessResult = await createPlanDownloadAccess(
            userId,
            orderItem.plan.$id,
            orderId,
            null,
            {
              orderNumber: sourceIdentifier,
              type: 'order'
            }
          );

          downloadAccessResults.push({
            planId: orderItem.plan.$id,
            ...accessResult
          });
        }
      }
    }

    // 7. Register the payment record in the database
    const paymentResult = await registerPayment(
      orderId,
      paymentData.paymentData,
      paymentData.gateway || 'stripe',
      userId
    );

    if (!paymentResult.success) {
      console.error('Failed to register payment record:', paymentResult.message);
      // This is non-critical as payment is already verified and processed
      // The payment record is mainly for internal tracking
    }

    // 8. Update order status based on payment and subscription status
    let orderStatus = 'Processing';
    let orderType = 'Order';

    // Determine order type based on subscription items
    if (orderItemsResult.data &&
      orderItemsResult.data.subscriptionItems &&
      orderItemsResult.data.subscriptionItems.length > 0) {
      orderType = 'Subscription';
    }

    await updateDocument(
      ORDERS_COLLECTION,
      orderId,
      {
        status: orderStatus,
        type: orderType,
        paidAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ).catch(error => {
      console.error('Failed to update order status:', error);
      // Non-critical, order is still valid
    });

    // 9. Clear the cart only after everything is processed successfully
    await clearCart(userId, cartId).catch(error => {
      console.error('Failed to clear cart:', error);
      // Non-critical, but should be logged
    });


    // NEW STEP: 10. Send order confirmation email
    // Get customer email from user data or billing address
    let customerEmail = null;

    // Try to get email from options first
    if (options.customerEmail) {
      customerEmail = options.customerEmail;
    }
    // Then try to get from billing address
    else if (billingAddress && billingAddress.email) {
      customerEmail = billingAddress.email;
    } else if (orderResult.data.order_cart_relation.email) {
      customerEmail = orderResult.data.order_cart_relation.email;
    }
    // Lastly, try to get from user record
    else {
      // Get user details to find email
      const userResult = await getUser(userId);
      if (userResult.success && userResult.data && userResult.data.email) {
        customerEmail = userResult.data.email;
      }
    }
    // Send confirmation email if we have customer email
    if (customerEmail) {
      // Prepare order data for email template
      const orderData = {
        orderId,
        orderNumber: orderResult.data.orderNumber,
        orderStatus,
        orderType,
        orderItems: orderItemsResult.data ? orderItemsResult.data.orderItems || [] : [],
        payment: paymentResult.success ? paymentResult.data : null,
        billingAddress,
        totalAmount: orderResult.data.order_cart_relation.grandTotal || paymentData.paymentData.amount / 100 || null,
        subtotal: orderResult.data.order_cart_relation.subtotal,
        transactionFeePercentage: orderResult.data.transactionFeePercentage,
        transactionFeeAmount: orderResult.data.transactionFeeAmount,
        discountAmount: orderResult.data.discountAmount,
        tipAmount: orderResult.data.tipAmount,
        tipPercentage: orderResult.data.tipPercentage
      };

      // Send confirmation email
      try {
        const emailRes = await sendOrderConfirmationEmail(customerEmail, orderData);
        console.log('Order confirmation email result:', emailRes);
      } catch (error) {
        console.error('Error sending order confirmation email:', error);
        // Non-critical, order processing continues
      }
    } else {
      console.warn('Could not send order confirmation email: Customer email not found');
    }

    // 10. Return success with comprehensive order data
    return {
      success: true,
      data: {
        orderId,
        orderNumber: orderResult.data.orderNumber,
        orderStatus,
        orderType,
        orderItems: orderItemsResult.data ? orderItemsResult.data.orderItems || [] : [],
        subscriptions: subscriptionsResult.data || [], // Access data directly
        payment: paymentResult.success ? paymentResult.data : null
      }
    };
  } catch (error) {
    console.error('Error processing order:', error);
    return {
      success: false,
      message: error.message || 'Failed to process order'
    };
  }
};


/**
 * Calculate the next billing date based on frequency and interval
 * @param {string} frequency - Billing frequency (day, week, month, year)
 * @param {number} interval - Billing interval
 * @returns {Date} - Next billing date
 */
function calculateNextBillingDate(frequency, interval = 1) {
  const now = new Date();
  let nextDate = new Date(now);

  switch (frequency) {
    case 'day':
      nextDate.setDate(now.getDate() + interval);
      break;
    case 'week':
      nextDate.setDate(now.getDate() + (interval * 7));
      break;
    case 'month':
      nextDate.setMonth(now.getMonth() + interval);
      break;
    case 'year':
      nextDate.setFullYear(now.getFullYear() + interval);
      break;
    default:
      // Default to one month
      nextDate.setMonth(now.getMonth() + 1);
  }

  return nextDate;
}

/**
 * Delete an order and all related records (for rollback purposes)
 * @param {string} orderId - The order ID to delete
 * @returns {Promise<Object>} - Result of deletion operation
 */
const deleteOrder = async (orderId) => {
  try {
    // 1. Delete order items
    const orderItemsResponse = await getOrderItems(orderId);
    if (orderItemsResponse.success && orderItemsResponse.data && orderItemsResponse.data.documents) {
      for (const item of orderItemsResponse.data.documents) {
        await deleteDocument(ORDER_ITEMS_COLLECTION, item.$id).catch(e =>
          console.error(`Failed to delete order item ${item.$id}:`, e)
        );
      }
    }

    // 2. Delete subscriptions
    const subscriptionsResponse = await getOrderSubscription(orderId);
    if (subscriptionsResponse.success && subscriptionsResponse.data && subscriptionsResponse.data.documents) {
      for (const subscription of subscriptionsResponse.data.documents) {
        await deleteDocument(ORDER_SUBSCRIPTIONS_COLLECTION, subscription.$id).catch(e =>
          console.error(`Failed to delete subscription ${subscription.$id}:`, e)
        );
      }
    }

    // 3. Delete payment records
    const paymentsResponse = await getOrderPayments(orderId);
    if (paymentsResponse.success && paymentsResponse.data && paymentsResponse.data.documents) {
      for (const payment of paymentsResponse.data.documents) {
        await deleteDocument(ORDER_PAYMENTS_COLLECTION, payment.$id).catch(e =>
          console.error(`Failed to delete payment record ${payment.$id}:`, e)
        );
      }
    }

    // 4. Finally delete the order itself
    const result = await deleteDocument(ORDERS_COLLECTION, orderId);

    return result;
  } catch (error) {
    console.error(`Error deleting order ${orderId}:`, error);
    return {
      success: false,
      message: error.message || 'Failed to delete order'
    };
  }
};


/**
 * Get order by ID
 * @param {string} orderId - Order ID
 * @returns {Object} - Response with success status and order data
 */
export const getOrder = async (orderId) => {
  return await getDocument(ORDERS_COLLECTION, orderId);
};

/**
 * Get order items for an order
 * @param {string} orderId - Order ID
 * @returns {Object} - Response with success status and order items data
 */
export const getOrderItems = async (orderId) => {
  try {
    // Use getDocumentsByRelation to fetch items related to this order
    const result = await getDocumentsByRelation(
      ORDER_ITEMS_COLLECTION,
      'order',
      orderId
    );

    // Return the result as is
    return result;
  } catch (error) {
    console.error(`Error fetching order items for order ${orderId}:`, error);
    return {
      success: false,
      message: error.message || 'Failed to fetch order items',
      data: { documents: [] } // Provide an empty documents array for consistency
    };
  }
};

/**
 * Get payment records for an order
 * @param {string} orderId - Order ID
 * @returns {Object} - Response with success status and payment data
 */
export const getOrderPayments = async (orderId) => {
  return await getDocumentsByRelation(
    ORDER_PAYMENTS_COLLECTION,
    'order',
    orderId
  );
};

/**
 * Get subscription for an order
 * @param {string} orderId - Order ID
 * @returns {Object} - Response with success status and subscription data
 */
export const getOrderSubscription = async (orderId) => {
  return await getDocumentsByRelation(
    ORDER_SUBSCRIPTIONS_COLLECTION,
    'order',
    orderId
  );
};


/**
 * Get orders for a specific user with flexible pagination
 * @param {string} userId - The user ID
 * @param {Object} options - Additional options for filtering and pagination
 * @param {string} options.search - Search term for order IDs or products (optional)
 * @param {string} options.status - Filter by order status (optional)
 * @param {string} options.type - Filter by order type (optional)
 * @param {string} options.timeFilter - Filter by time period (e.g., '3days', '7days', '30days', '3months')
 * @param {number} options.limit - Maximum number of orders to return
 * @param {number} options.offset - Offset for pagination
 * @param {string} options.sortField - Field to sort by
 * @param {string} options.sortOrder - Sort direction ('asc' or 'desc')
 * @returns {Promise<Object>} - Response with filtered orders or error
 */
export async function getUserOrders(userId, options = {}) {
  try {
    if (!userId) {
      throw new Error('User ID is required');
    }
    // Set default options
    const {
      search = null,
      status = null,
      type = null,
      timeFilter = null,
      limit = 12,
      offset = 0,
      sortField = '$createdAt',
      sortOrder = 'desc'
    } = options;

    // Create queries array
    const queries = [
      Query.equal('userId', userId),
      Query.limit(limit),
      Query.offset(offset)
    ];

    // Add search filter if provided
    // Note: Since direct text search might not be supported, 
    // you might need to implement this differently based on your backend
    if (search) {
      // Sample implementation - adjust according to your backend capabilities
      // This searches in orderNumber which is likely indexed
      queries.push(Query.search('orderNumber', search));

      // Alternative: If your backend doesn't support direct text search
      // you might need to fetch all orders and filter on the server side
    }

    // Add status filter
    if (status) {
      queries.push(Query.equal('status', status));
    }

    // Add type filter
    if (type) {
      queries.push(Query.equal('type', type));
    }

    // Add time filter
    if (timeFilter) {
      const now = new Date();
      let filterDate;

      switch (timeFilter) {
        case '3days':
          filterDate = subDays(now, 3);
          break;
        case '7days':
          filterDate = subDays(now, 7);
          break;
        case '30days':
          filterDate = subDays(now, 30);
          break;
        case '3months':
          filterDate = subDays(now, 90);
          break;
        default:
          filterDate = null;
      }

      if (filterDate) {
        queries.push(Query.greaterThan('createdAt', filterDate.toISOString()));
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

    // Get orders with filters
    const response = await getDocuments(ORDERS_COLLECTION, queries);

    if (!response.success) {
      throw new Error(response.message || 'Failed to fetch orders');
    }

    // Get the order items, payments, and related data for each order
    const orders = response.data.documents || [];
    const totalCount = response.data.total || 0;

    return {
      success: true,
      data: {
        orders: orders,
        total: totalCount
      }
    };
  } catch (error) {
    console.error(`Error fetching orders:`, error);
    return {
      success: false,
      message: error.message || 'Failed to fetch orders'
    };
  }
}

/**
 * Get orders with flexible filtering and pagination
 * @param {Object} options - Additional options for filtering and pagination
 * @param {string} options.search - Search term for order IDs or products (optional)
 * @param {string} options.status - Filter by order status (optional)
 * @param {string} options.type - Filter by order type (optional)
 * @param {string} options.timeFilter - Filter by time period (e.g., '3days', '7days', '30days', '3months')
 * @param {number} options.limit - Maximum number of orders to return
 * @param {number} options.offset - Offset for pagination
 * @param {string} options.sortField - Field to sort by
 * @param {string} options.sortOrder - Sort direction ('asc' or 'desc')
 * @returns {Promise<Object>} - Response with filtered orders or error
 */
export async function getOrders(options = {}) {
  try {
    // Set default options
    const {
      search = null,
      status = null,
      type = null,
      timeFilter = null,
      limit = 12,
      offset = 0,
      sortField = '$createdAt',
      sortOrder = 'desc'
    } = options;

    // Create queries array
    const queries = [
      Query.limit(limit),
      Query.offset(offset)
    ];

    // Add search filter if provided
    // Note: Since direct text search might not be supported, 
    // you might need to implement this differently based on your backend
    if (search) {
      // Sample implementation - adjust according to your backend capabilities
      // This searches in orderNumber which is likely indexed
      queries.push(Query.search('orderNumber', search));

      // Alternative: If your backend doesn't support direct text search
      // you might need to fetch all orders and filter on the server side
    }

    // Add status filter
    if (status) {
      queries.push(Query.equal('status', status));
    }

    // Add type filter
    if (type) {
      queries.push(Query.equal('type', type));
    }

    // Add time filter
    if (timeFilter) {
      const now = new Date();
      let filterDate;

      switch (timeFilter) {
        case '3days':
          filterDate = subDays(now, 3);
          break;
        case '7days':
          filterDate = subDays(now, 7);
          break;
        case '30days':
          filterDate = subDays(now, 30);
          break;
        case '3months':
          filterDate = subDays(now, 90);
          break;
        default:
          filterDate = null;
      }

      if (filterDate) {
        queries.push(Query.greaterThan('createdAt', filterDate.toISOString()));
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

    // Get orders with filters
    const response = await getDocuments(ORDERS_COLLECTION, queries);

    if (!response.success) {
      throw new Error(response.message || 'Failed to fetch orders');
    }

    // Get the order items, payments, and related data for each order
    const orders = response.data.documents || [];
    const totalCount = response.data.total || 0;

    return {
      success: true,
      data: {
        orders: orders,
        total: totalCount
      }
    };
  } catch (error) {
    console.error(`Error fetching orders:`, error);
    return {
      success: false,
      message: error.message || 'Failed to fetch orders'
    };
  }
}


export const deleteOrderByAdmin = async (orderId) => {
  try {
    // 4. Finally delete the order itself
    const result = await deleteDocument(ORDERS_COLLECTION, orderId);

    return result;
  } catch (error) {
    console.error(`Error deleting order ${orderId}:`, error);
    return {
      success: false,
      message: error.message || 'Failed to delete order'
    };
  }
};


/**
 * Update an order's status and manage related subscriptions
 * @param {string} orderId - The order ID
 * @param {string} status - The new status (Pending, Processing, Completed, Canceled, Failed)
 * @param {Object} options - Additional options
 * @param {string} options.changeReason - Optional note about the status change
 * @param {string} options.userId - ID of the user making the change (for subscription updates)
 * @returns {Object} - Response with success status and updated order data
 */
export const updateOrderStatus = async (orderId, status, options = {}) => {
  try {
    if (!orderId) {
      throw new Error('Order ID is required');
    }

    // Validate status
    const validStatuses = ['Pending', 'Processing', 'Completed', 'Canceled', 'Failed'];
    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
    }

    // Get current order data to verify it exists
    const orderResponse = await getDocument(ORDERS_COLLECTION, orderId);
    if (!orderResponse.success) {
      throw new Error('Order not found');
    }

    const order = orderResponse.data;
    if (!order) {
      throw new Error('Order not found');
    }

    // Prepare update data
    const updateData = {
      status,
      updatedAt: new Date().toISOString(),
    };

    // Add timestamp for specific status events
    switch (status) {
      case 'Completed':
        updateData.completedAt = new Date().toISOString();
        break;
      case 'Canceled':
        updateData.canceledAt = new Date().toISOString();
        break;
      case 'Failed':
        updateData.failedAt = new Date().toISOString();
        break;
    }

    // Add changeReason if provided
    if (options.changeReason) {
      const currentTime = new Date().toISOString();
      const newChangeReasonEntry = {
        user: options.userId || 'system',
        time: currentTime,
        note: options.changeReason,
        status: status
      };

      let changeReasonArray = [];

      // If the order already has changeReason as a string, try to parse it
      if (order.changeReason) {
        try {
          // Try to parse if it's a JSON string
          if (typeof order.changeReason === 'string') {
            const parsed = JSON.parse(order.changeReason);
            if (Array.isArray(parsed)) {
              changeReasonArray = parsed;
            } else {
              // If it's a string but not a JSON array, treat as legacy note
              const legacyEntry = {
                user: 'system',
                time: updateData.updatedAt,
                note: order.changeReason,
                status: 'Unknown'
              };
              changeReasonArray = [legacyEntry];
            }
          }
        } catch (e) {
          // If parsing fails, assume it's a plain string (old format)
          const legacyEntry = {
            user: 'system',
            time: updateData.updatedAt,
            note: order.changeReason,
            status: 'Unknown'
          };
          changeReasonArray = [legacyEntry];
        }
      }

      // Add the new entry to the array
      changeReasonArray.push(newChangeReasonEntry);

      // Stringify the array to store as a string in the database
      updateData.changeReason = JSON.stringify(changeReasonArray);
    }

    // Handle subscriptions based on the order status change
    if (order.subscriptions && order.subscriptions.length > 0) {
      if (status === 'Canceled' || status === 'Failed') {
        for (const subscription of order.subscriptions) {
          await deleteSubscriptionByAdmin(
            subscription.$id
          ).catch(error => {
            console.warn(`Failed to delete subscription ${subscription.$id}:`, error);
          });
        }
      } else if (status === 'Pending') {
        for (const subscription of order.subscriptions) {
          await pauseSubscription(
            subscription.$id,
            options.userId || 'system',
            `Order status changed to Pending by admin - subscription paused temporarily`
          ).catch(error => {
            console.warn(`Failed to pause subscription ${subscription.$id}:`, error);
          });
        }
      } else if (status === 'Completed' && order.status === "Pending") {
        for (const subscription of order.subscriptions) {
          await resumeSubscription(
            subscription.$id,
            options.userId || 'system',
            `Order status changed by admin Pending to Completed - subscription activated`
          ).catch(error => {
            console.warn(`Failed to activate subscription ${subscription.$id}:`, error);
          });
        }
      }
    }
    // Update the order
    const result = await updateDocument(ORDERS_COLLECTION, orderId, updateData);
    const userData = await getUser(order.userId);
    // If update successful and customer email exists, send status update email
    if (result.success && userData.data.email) {
      // Prepare order data for email template
      const orderData = {
        orderId,
        orderNumber: order.orderNumber,
        orderStatus: status,
        orderItems: order.items || [],
        totalAmount: order.orderPayments[0].amount || 0
      };

      // Send status update email asynchronously (don't await)
      await sendOrderStatusUpdateEmail(userData.data.email, orderData, order.status, options.changeReason)
        .catch(error => {
          console.error('Failed to send order status update email:', error);
        });
    }

    return {
      success: result.success,
      data: result.data,
      message: `Order status successfully updated to ${status}`,
      subscriptionsProcessed: order.subscriptions?.length || 0
    };
  } catch (error) {
    console.error('Error updating order status:', error);
    return {
      success: false,
      message: error.message || 'Failed to update order status'
    };
  }
};
