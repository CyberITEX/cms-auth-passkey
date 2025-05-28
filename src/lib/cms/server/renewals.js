// src/lib/cms/server/renewals.js - SIMPLIFIED VERSION
'use server';

import { subDays, addDays, addWeeks, addMonths, addYears } from 'date-fns';
import {
    createDocument,
    deleteDocument,
    getDocument,
    getDocuments,
    updateDocument,
    getDocumentsByRelation
} from './sdk_db';
import { Query } from './sdk_client';
import { getSingleSubscription, updateSubscription, createSubscriptionChangeRecord } from './subscriptions';
import { sendOrderConfirmationEmail } from '@/functions/email/orderMail';
import { getUser } from './sdk_users';

// Collection names
const RENEWAL_ORDERS_COLLECTION = process.env.CMS_COLLECTION_ID_RENEWAL_ORDERS;
const ORDER_PAYMENTS_COLLECTION = 'orderPayments';
const ORDERS_COLLECTION = 'orders';

/**
 * Calculate next billing date based on frequency and interval
 */
function calculateNextBillingDate(frequency, interval = 1, fromDate = new Date()) {
    switch (frequency.toLowerCase()) {
        case 'day':
            return addDays(fromDate, interval);
        case 'week':
            return addWeeks(fromDate, interval);
        case 'month':
            return addMonths(fromDate, interval);
        case 'year':
            return addYears(fromDate, interval);
        default:
            return addMonths(fromDate, 1);
    }
}

/**
 * Generate renewal order number
 */
function generateRenewalOrderNumber(parentOrderNumber, renewalSequence) {
    return `${parentOrderNumber}-R${renewalSequence.toString().padStart(2, '0')}`;
}

/**
 * Get the last renewal sequence for a parent order
 */
export async function getLastRenewalSequence(parentOrderId) {
    try {
        if (!parentOrderId) {
            throw new Error('Parent order ID is required');
        }

        const response = await getDocuments(
            RENEWAL_ORDERS_COLLECTION,
            [
                Query.equal('parentOrder', parentOrderId),
                Query.orderDesc('renewalSequence'),
                Query.limit(1)
            ]
        );

        if (!response.success) {
            throw new Error(response.message || 'Failed to fetch renewal orders');
        }

        const renewalOrders = response.data.documents || [];

        if (renewalOrders.length > 0) {
            return {
                success: true,
                data: renewalOrders[0].renewalSequence || 0
            };
        }

        return {
            success: true,
            data: 0
        };
    } catch (error) {
        console.error(`Error getting last renewal sequence for order ${parentOrderId}:`, error);
        return {
            success: false,
            message: error.message || 'Failed to get last renewal sequence'
        };
    }
}

/**
 * Create a renewal order for a subscription
 */
export async function createRenewalOrder(subscriptionId, options = {}) {
    try {
        if (!subscriptionId) {
            throw new Error('Subscription ID is required');
        }

        // Get subscription details
        const subscriptionResponse = await getSingleSubscription(subscriptionId);
        if (!subscriptionResponse.success) {
            throw new Error(subscriptionResponse.message || 'Failed to fetch subscription');
        }

        const subscription = subscriptionResponse.data;

        // Get parent order details
        const parentOrderResponse = await getDocument(ORDERS_COLLECTION, subscription.order.$id || subscription.order);
        if (!parentOrderResponse.success) {
            throw new Error('Failed to fetch parent order');
        }

        const parentOrder = parentOrderResponse.data;

        // Get the next renewal sequence
        const lastSequenceResponse = await getLastRenewalSequence(parentOrder.$id);
        if (!lastSequenceResponse.success) {
            throw new Error('Failed to determine renewal sequence');
        }

        const renewalSequence = lastSequenceResponse.data + 1;
        const renewalOrderNumber = generateRenewalOrderNumber(parentOrder.orderNumber, renewalSequence);

        // Calculate pricing with discounts
        const pricing = calculateRenewalPricing(subscription);
        const renewalAmount = pricing.finalPrice;
        const taxAmount = 0; // Set to 0 or implement tax calculation
        const totalAmount = renewalAmount + taxAmount;

        // Calculate next renewal date
        const nextRenewalDate = calculateNextBillingDate(
            subscription.billingFrequency,
            subscription.billingInterval
        );

        // Create renewal order data
        const renewalOrderData = {
            parentOrder: parentOrder.$id,
            renewalOrderNumber,
            subscription: subscription.$id,
            userId: options.userId || subscription.userId,
            renewalSequence,
            renewalDate: new Date().toISOString(),
            nextRenewalDate: nextRenewalDate.toISOString(),
            status: 'Pending',
            renewalAmount,
            taxAmount,
            totalAmount,
            currency: 'USD',
            paymentGateway: options.paymentGateway || 'stripe',
            paymentMethodId: options.paymentMethodId || '',
            attemptCount: 1,
            lastAttemptAt: new Date().toISOString(),
            nextAttemptAt: null,
            notes: options.reason || `Automatic renewal for subscription ${subscription.pricingName}`,
            failureReason: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            completedAt: null,
            failedAt: null,
        };

        // Create the renewal order
        const renewalOrderResponse = await createDocument(RENEWAL_ORDERS_COLLECTION, renewalOrderData);
        if (!renewalOrderResponse.success) {
            throw new Error(renewalOrderResponse.message || 'Failed to create renewal order');
        }

        return {
            success: true,
            data: {
                renewalOrder: renewalOrderResponse.data,
                subscription,
                parentOrder,
                renewalSequence,
                nextRenewalDate: nextRenewalDate.toISOString(),
                pricing
            },
            message: 'Renewal order created successfully'
        };
    } catch (error) {
        console.error(`Error creating renewal order for subscription ${subscriptionId}:`, error);
        return {
            success: false,
            message: error.message || 'Failed to create renewal order'
        };
    }
}

/**
 * Register a payment for a renewal order
 */
export async function registerRenewalPayment(renewalOrderId, paymentData, gateway = 'stripe', userId) {
    try {
        if (!renewalOrderId || !paymentData) {
            throw new Error('Renewal order ID and payment data are required');
        }

        // Get renewal order to determine amounts
        const renewalOrderResponse = await getDocument(RENEWAL_ORDERS_COLLECTION, renewalOrderId);
        if (!renewalOrderResponse.success) {
            throw new Error('Failed to fetch renewal order');
        }

        const renewalOrder = renewalOrderResponse.data;

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
                return Number(paymentData.amount) / 100 || renewalOrder.totalAmount;
            } else if (gateway === 'paypal') {
                return Number(paymentData.amount) || renewalOrder.totalAmount;
            }
            return Number(paymentData.amount) || renewalOrder.totalAmount;
        };

        // Base payment record
        let paymentRecord = {
            renewalOrder: renewalOrderId,
            paymentMethod: getPaymentMethod(),
            amount: formatAmount(),
            currency: paymentData.currency || renewalOrder.currency || 'USD',
            status: gateway === 'paypal' ?
                (paymentData.status === 'COMPLETED' ? 'Completed' : 'Pending') :
                (paymentData.status === 'succeeded' ? 'Completed' : 'Pending'),
            paymentGateway: gateway,
            description: `Renewal payment for order ${renewalOrder.renewalOrderNumber}`,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            transactionId: paymentData.transactionId || '',
            userId: userId || '',
            userEmail: paymentData.receipt_email || paymentData.email || '',
        };

        // Add gateway-specific fields
        if (gateway === 'stripe') {
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
                description: `PayPal renewal payment for order ${renewalOrder.renewalOrderNumber}`,
                userEmail: paymentData.email || '',
            };
        }

        // Create payment record in database
        const paymentResult = await createDocument(ORDER_PAYMENTS_COLLECTION, paymentRecord);

        if (!paymentResult.success) {
            throw new Error(paymentResult.message || 'Failed to create payment record');
        }

        return paymentResult;
    } catch (error) {
        console.error('Error registering renewal payment:', error);
        return {
            success: false,
            message: error.message || 'Failed to register renewal payment'
        };
    }
}

/**
 * Process automatic renewal for a subscription (main renewal function)
 */
export async function processSubscriptionRenewal(subscriptionId, paymentData) {
    try {
        if (!subscriptionId) {
            throw new Error('Subscription ID is required');
        }

        // Get subscription to get userId
        const subscriptionResponse = await getSingleSubscription(subscriptionId);
        if (!subscriptionResponse.success) {
            throw new Error('Failed to fetch subscription');
        }

        const subscription = subscriptionResponse.data;

        // Create renewal order
        const renewalOrderResult = await createRenewalOrder(subscriptionId, {
            reason: 'Automatic subscription renewal',
            paymentGateway: paymentData?.gateway || 'stripe',
            paymentMethodId: paymentData?.paymentMethodId
        });

        if (!renewalOrderResult.success) {
            throw new Error(renewalOrderResult.message || 'Failed to create renewal order');
        }

        const { renewalOrder } = renewalOrderResult.data;

        // Process payment if payment data provided
        if (paymentData && paymentData.paymentData) {
            const paymentResult = await registerRenewalPayment(
                renewalOrder.$id,
                paymentData.paymentData,
                paymentData.gateway || 'stripe',
                subscription.userId
            );

            if (paymentResult.success) {
                // Update renewal order status to completed
                await updateDocument(RENEWAL_ORDERS_COLLECTION, renewalOrder.$id, {
                    status: 'Completed',
                    completedAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                });

                // Update subscription with proper status and next billing date
                await updateSubscription(subscriptionId, {
                    status: 'Active', // Ensure subscription is active
                    nextBillingDate: renewalOrderResult.data.nextRenewalDate,
                    updatedAt: new Date().toISOString()
                });

                // FIX: Create subscription change record using proper enum value
                await createSubscriptionChangeRecord(subscriptionId, {
                    changeType: 'Reactivate', // Using allowed enum value instead of 'Renewal'
                    fromStatus: subscription.status,
                    toStatus: 'Active',
                    changeReason: 'Automatic subscription renewal completed',
                    changedBy: subscription.userId,
                    immediateChange: true,
                    effectiveDate: new Date().toISOString(),
                    additionalNotes: `Renewal order ${renewalOrder.renewalOrderNumber} completed successfully`
                });

                // Update renewal order data in the result
                renewalOrderResult.data.renewalOrder.status = 'Completed';
                renewalOrderResult.data.renewalOrder.completedAt = new Date().toISOString();

            } else {
                // Update renewal order with failure
                await updateDocument(RENEWAL_ORDERS_COLLECTION, renewalOrder.$id, {
                    status: 'Failed',
                    failureReason: paymentResult.message || 'Payment processing failed',
                    failedAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                });

                // Update subscription to PastDue if payment failed
                if (subscription.status === 'Active') {
                    await updateSubscription(subscriptionId, {
                        status: 'PastDue',
                        updatedAt: new Date().toISOString()
                    });
                }

                throw new Error(paymentResult.message || 'Payment processing failed');
            }
        }

        return {
            success: true,
            data: renewalOrderResult.data,
            message: 'Subscription renewal processed successfully'
        };
    } catch (error) {
        console.error(`Error processing subscription renewal for ${subscriptionId}:`, error);
        return {
            success: false,
            message: error.message || 'Failed to process subscription renewal'
        };
    }
}


/**
 * Calculate renewal pricing with discounts
 * @param {Object} subscription - Subscription object
 * @returns {Object} - Pricing breakdown
 */
function calculateRenewalPricing(subscription) {
    const basePrice = subscription.price || 0;
    const existingDiscount = subscription.discountAmount || 0;

    // Apply existing subscription discount
    let discountAmount = existingDiscount;
    let finalPrice = basePrice - discountAmount;

    // Ensure minimum price
    const minimumPrice = 0.50;
    if (finalPrice < minimumPrice) {
        finalPrice = minimumPrice;
        discountAmount = basePrice - minimumPrice;
    }

    // Ensure non-negative values
    finalPrice = Math.max(finalPrice, 0);
    discountAmount = Math.max(discountAmount, 0);

    const discountPercentage = basePrice > 0 ? (discountAmount / basePrice) * 100 : 0;

    return {
        basePrice: parseFloat(basePrice.toFixed(2)),
        discountAmount: parseFloat(discountAmount.toFixed(2)),
        discountPercentage: parseFloat(discountPercentage.toFixed(2)),
        finalPrice: parseFloat(finalPrice.toFixed(2)),
        currency: 'USD'
    };
}


/**
 * Get renewal orders with filtering, sorting, and pagination
 * @param {Object} options - Query options
 * @param {string} options.search - Search term for renewal order number or parent order
 * @param {string} options.status - Filter by status
 * @param {string} options.timeFilter - Time-based filter
 * @param {string} options.sortField - Field to sort by
 * @param {string} options.sortOrder - Sort order (asc/desc)
 * @param {number} options.limit - Number of items per page
 * @param {number} options.offset - Offset for pagination
 * @returns {Promise<Object>} Renewal orders data with pagination info
 */
export async function getRenewalOrders(options = {}) {
    try {
        const {
            search,
            status,
            timeFilter,
            sortField = '$createdAt',
            sortOrder = 'desc',
            limit = 12,
            offset = 0,
            parentOrder,
            userId
        } = options;

        const queries = [];

        if (parentOrder) {
            queries.push(Query.equal('parentOrder', parentOrder));
        }

        if (userId) {
            queries.push(Query.equal('userId', userId));
        }

        // Add status filter
        if (status && status !== 'all') {
            queries.push(Query.equal('status', status));
        }

        // Add time filter
        if (timeFilter && timeFilter !== 'all') {
            const now = new Date();
            let startDate;

            switch (timeFilter) {
                case '3days':
                    startDate = new Date(now.getTime() - (3 * 24 * 60 * 60 * 1000));
                    break;
                case '7days':
                    startDate = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
                    break;
                case '30days':
                    startDate = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
                    break;
                case '3months':
                    startDate = new Date(now.getTime() - (90 * 24 * 60 * 60 * 1000));
                    break;
                default:
                    startDate = null;
            }

            if (startDate) {
                queries.push(Query.greaterThanEqual('$createdAt', startDate.toISOString()));
            }
        }

        // Add search filter
        if (search && search.trim()) {
            // Create OR condition for searching in renewal order number or parent order
            queries.push(Query.or([
                Query.search('renewalOrderNumber', search.trim()),
                Query.search('userId', search.trim())
            ]));
        }

        // Add sorting
        if (sortOrder === 'desc') {
            queries.push(Query.orderDesc(sortField));
        } else {
            queries.push(Query.orderAsc(sortField));
        }

        // Add pagination
        queries.push(Query.limit(limit));
        queries.push(Query.offset(offset));

        // Fetch renewal orders with parent order relationship
        const result = await getDocuments(RENEWAL_ORDERS_COLLECTION, queries);

        if (!result.success) {
            return {
                success: false,
                message: result.message || 'Failed to fetch renewal orders',
                data: {
                    renewalOrders: [],
                    total: 0
                }
            };
        }

        // Get total count for pagination (without limit/offset)
        const countQueries = queries.filter(q =>
            !q.toString().includes('limit(') &&
            !q.toString().includes('offset(') &&
            !q.toString().includes('orderDesc(') &&
            !q.toString().includes('orderAsc(')
        );

        const countResult = await getDocuments(RENEWAL_ORDERS_COLLECTION, countQueries);
        const total = countResult.success ? countResult.data.documents.length : 0;

        return {
            success: true,
            data: {
                renewalOrders: result.data.documents,
                total: total
            }
        };

    } catch (error) {
        console.error('Error fetching renewal orders:', error);
        return {
            success: false,
            message: error.message || 'An error occurred while fetching renewal orders',
            data: {
                renewalOrders: [],
                total: 0
            }
        };
    }
}

/**
 * Get a single renewal order by ID
 * @param {string} renewalOrderId - The renewal order ID
 * @returns {Promise<Object>} Renewal order data
 */
export async function getRenewalOrderById(renewalOrderId) {
    try {
        const result = await getDocument(RENEWAL_ORDERS_COLLECTION, renewalOrderId)

        return {
            success: true,
            data: result.data
        };

    } catch (error) {
        console.error('Error fetching renewal order:', error);
        return {
            success: false,
            message: error.message || 'An error occurred while fetching the renewal order',
            data: null
        };
    }
}

/**
 * Get renewal orders for a specific parent order
 * @param {string} parentOrderId - The parent order ID
 * @returns {Promise<Object>} Renewal orders data
 */
export async function getRenewalOrdersByParentOrder(parentOrderId) {
    try {
        const result = await getDocuments(RENEWAL_ORDERS_COLLECTION, [
            Query.equal('parentOrder', parentOrderId),
            Query.orderDesc('renewalSequence')
        ]);

        if (!result.success) {
            return {
                success: false,
                message: result.message || 'Failed to fetch renewal orders',
                data: []
            };
        }

        return {
            success: true,
            data: result.data.documents
        };

    } catch (error) {
        console.error('Error fetching renewal orders by parent order:', error);
        return {
            success: false,
            message: error.message || 'An error occurred while fetching renewal orders',
            data: []
        };
    }
}

/**
 * Delete a renewal order by admin
 * @param {string} renewalOrderId - The renewal order ID to delete
 * @returns {Promise<Object>} Success/failure response
 */
export async function deleteRenewalOrderByAdmin(renewalOrderId) {
    try {
        // First, get the renewal order to verify it exists
        const renewalOrderResult = await getRenewalOrderById(renewalOrderId);

        if (!renewalOrderResult.success) {
            return {
                success: false,
                message: 'Renewal order not found'
            };
        }

        // Delete the renewal order
        const deleteResult = await deleteDocument(RENEWAL_ORDERS_COLLECTION, renewalOrderId);

        if (!deleteResult.success) {
            return {
                success: false,
                message: deleteResult.message || 'Failed to delete renewal order'
            };
        }

        return {
            success: true,
            message: 'Renewal order deleted successfully'
        };

    } catch (error) {
        console.error('Error deleting renewal order:', error);
        return {
            success: false,
            message: error.message || 'An error occurred while deleting the renewal order'
        };
    }
}

/**
 * Update renewal order status
 * @param {string} renewalOrderId - The renewal order ID
 * @param {string} newStatus - The new status
 * @param {Object} additionalData - Additional data to update
 * @returns {Promise<Object>} Success/failure response
 */
export async function updateRenewalOrderStatus(renewalOrderId, newStatus, additionalData = {}) {
    try {
        const updateData = {
            status: newStatus,
            updatedAt: new Date().toISOString(),
            ...additionalData
        };

        // Add completion or failure timestamps based on status
        if (newStatus === 'Completed') {
            updateData.completedAt = new Date().toISOString();
        } else if (newStatus === 'Failed') {
            updateData.failedAt = new Date().toISOString();
        }

        const result = await updateDocument(RENEWAL_ORDERS_COLLECTION, renewalOrderId, updateData);

        if (!result.success) {
            return {
                success: false,
                message: result.message || 'Failed to update renewal order status'
            };
        }

        return {
            success: true,
            message: 'Renewal order status updated successfully',
            data: result.data
        };

    } catch (error) {
        console.error('Error updating renewal order status:', error);
        return {
            success: false,
            message: error.message || 'An error occurred while updating the renewal order status'
        };
    }
}

/**
 * Get renewal orders that are due for processing
 * @param {Date} beforeDate - Get renewals due before this date
 * @returns {Promise<Object>} Renewal orders due for processing
 */
export async function getDueRenewalOrders(beforeDate = new Date()) {
    try {
        const result = await getDocuments(RENEWAL_ORDERS_COLLECTION, [
            Query.equal('status', 'Pending'),
            Query.lessThanEqual('nextRenewalDate', beforeDate.toISOString()),
            Query.orderAsc('nextRenewalDate')
        ]);

        if (!result.success) {
            return {
                success: false,
                message: result.message || 'Failed to fetch due renewal orders',
                data: []
            };
        }

        return {
            success: true,
            data: result.data.documents
        };

    } catch (error) {
        console.error('Error fetching due renewal orders:', error);
        return {
            success: false,
            message: error.message || 'An error occurred while fetching due renewal orders',
            data: []
        };
    }
}

/**
 * Increment renewal attempt count
 * @param {string} renewalOrderId - The renewal order ID
 * @returns {Promise<Object>} Success/failure response
 */
export async function incrementRenewalAttempt(renewalOrderId) {
    try {
        // Get current renewal order
        const currentOrder = await getRenewalOrderById(renewalOrderId);

        if (!currentOrder.success) {
            return {
                success: false,
                message: 'Renewal order not found'
            };
        }

        const currentAttemptCount = currentOrder.data.attemptCount || 0;
        const newAttemptCount = currentAttemptCount + 1;

        // Calculate next attempt time (e.g., 24 hours from now)
        const nextAttemptAt = new Date();
        nextAttemptAt.setHours(nextAttemptAt.getHours() + 24);

        const updateData = {
            attemptCount: newAttemptCount,
            lastAttemptAt: new Date().toISOString(),
            nextAttemptAt: nextAttemptAt.toISOString(),
            updatedAt: new Date().toISOString()
        };

        const result = await updateDocument(RENEWAL_ORDERS_COLLECTION, renewalOrderId, updateData);

        if (!result.success) {
            return {
                success: false,
                message: result.message || 'Failed to increment renewal attempt count'
            };
        }

        return {
            success: true,
            message: 'Renewal attempt count updated successfully',
            data: result.data
        };

    } catch (error) {
        console.error('Error incrementing renewal attempt:', error);
        return {
            success: false,
            message: error.message || 'An error occurred while updating the renewal attempt count'
        };
    }
}