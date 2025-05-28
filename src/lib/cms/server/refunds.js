// // src/lib/cms/server/refunds.js
// 'use server';
// import { createDocument, updateDocument, getDocument } from './sdk_db';
// import { createRefund, createPartialRefund } from '@/lib/stripe/server/refunds';

// const refundsCollectionId = process.env.CMS_COLLECTION_ID_PAYMENT_REFUNDS;
// const paymentsCollectionId = process.env.CMS_COLLECTION_ID_ORDER_PAYMENTS;

// /**
//  * Process a refund for a payment
//  * @param {string} paymentId - The payment document ID from your CMS
//  * @param {number} refundAmount - Amount to refund (in dollars)
//  * @param {string} reason - Reason for refund
//  * @param {boolean} isPartial - Whether this is a partial refund
//  * @returns {Object} - Result of the refund operation
//  */
// export async function processPaymentRefund(paymentId, refundAmount, reason, isPartial = false) {
//     try {
//         // 1. Get the original payment record
//         const paymentResult = await getDocument(paymentsCollectionId, paymentId);
//         if (!paymentResult.success) {
//             return {
//                 success: false,
//                 message: 'Payment record not found'
//             };
//         }

//         const payment = paymentResult.data;

//         // 2. Validate refund amount
//         const maxRefundAmount = payment.amount - (payment.refundedAmount || 0);
//         if (refundAmount > maxRefundAmount) {
//             return {
//                 success: false,
//                 message: `Refund amount cannot exceed available balance of $${maxRefundAmount.toFixed(2)}`
//             };
//         }

//         // 3. Process refund through payment gateway
//         let gatewayRefundResult;
//         const refundAmountCents = Math.round(refundAmount * 100);

//         switch (payment.paymentGateway) {
//             case 'stripe':
//                 if (!payment.stripePaymentIntentId) {
//                     return {
//                         success: false,
//                         message: 'No Stripe payment intent ID found for this payment'
//                     };
//                 }

//                 if (isPartial) {
//                     gatewayRefundResult = await createPartialRefund(
//                         payment.stripePaymentIntentId,
//                         refundAmountCents,
//                         'requested_by_customer',
//                         {
//                             payment_id: paymentId,
//                             refund_reason: reason,
//                             processed_by: 'admin_panel'
//                         }
//                     );
//                 } else {
//                     gatewayRefundResult = await createRefund(
//                         payment.stripePaymentIntentId,
//                         refundAmountCents,
//                         'requested_by_customer',
//                         {
//                             payment_id: paymentId,
//                             refund_reason: reason,
//                             processed_by: 'admin_panel'
//                         }
//                     );
//                 }
//                 break;

//             case 'paypal':
//                 // Add PayPal refund logic here
//                 return {
//                     success: false,
//                     message: 'PayPal refunds are not yet implemented'
//                 };

//             case 'braintree':
//                 // Add Braintree refund logic here
//                 return {
//                     success: false,
//                     message: 'Braintree refunds are not yet implemented'
//                 };

//             default:
//                 return {
//                     success: false,
//                     message: `Refunds for ${payment.paymentGateway} are not supported`
//                 };
//         }

//         // 4. Check if gateway refund was successful
//         if (!gatewayRefundResult.success) {
//             return {
//                 success: false,
//                 message: `Gateway refund failed: ${gatewayRefundResult.message}`
//             };
//         }

//         // 5. Create refund record in database
//         const refundData = {
//             payment: paymentId,
//             amount: refundAmount,
//             reason: reason,
//             refundedAt: new Date().toISOString(),
//             transactionId: gatewayRefundResult.data.id,
//             paymentGateway: payment.paymentGateway,
//             paymentMethod: payment.paymentMethod,
//             status: gatewayRefundResult.data.status === 'succeeded' ? 'Completed' : 'Pending',
//             failureReason: gatewayRefundResult.data.failure_reason || null
//         };

//         const refundResult = await createDocument(refundsCollectionId, refundData);
//         if (!refundResult.success) {
//             return {
//                 success: false,
//                 message: 'Failed to create refund record in database'
//             };
//         }

//         // 6. Update payment record
//         const newRefundedAmount = (payment.refundedAmount || 0) + refundAmount;
//         const isFullyRefunded = newRefundedAmount >= payment.amount;

//         const paymentUpdateData = {
//             isRefunded: true,
//             refundedAmount: newRefundedAmount,
//             refundedAt: new Date().toISOString(),
//             refundTransactionId: gatewayRefundResult.data.id,
//             refundReason: reason,
//             status: isFullyRefunded ? 'Refunded' : 'Partially_Refunded'
//         };

//         const paymentUpdateResult = await updateDocument(paymentsCollectionId, paymentId, paymentUpdateData);
//         if (!paymentUpdateResult.success) {
//             return {
//                 success: false,
//                 message: 'Refund processed but failed to update payment record'
//             };
//         }

//         return {
//             success: true,
//             data: {
//                 refund: refundResult.data,
//                 payment: paymentUpdateResult.data,
//                 gatewayRefund: gatewayRefundResult.data
//             },
//             message: `${isPartial ? 'Partial refund' : 'Full refund'} of $${refundAmount.toFixed(2)} processed successfully`
//         };

//     } catch (error) {
//         console.error('Error processing refund:', error);
//         return {
//             success: false,
//             message: error.message || 'Failed to process refund'
//         };
//     }
// }

// /**
//  * Get refund history for a payment
//  * @param {string} paymentId - The payment document ID
//  * @returns {Object} - List of refunds for the payment
//  */
// export async function getPaymentRefunds(paymentId) {
//     try {
//         const Query = (await import('./sdk_client')).Query;
//         const { getDocuments } = await import('./sdk_db');

//         const refundsResult = await getDocuments(refundsCollectionId, [
//             Query.equal('payment', paymentId),
//             Query.orderDesc('$createdAt')
//         ]);

//         if (!refundsResult.success) {
//             return {
//                 success: false,
//                 message: 'Failed to fetch refund history'
//             };
//         }

//         return {
//             success: true,
//             data: refundsResult.data.documents
//         };
//     } catch (error) {
//         console.error('Error fetching payment refunds:', error);
//         return {
//             success: false,
//             message: 'Failed to fetch refund history'
//         };
//     }
// }
















'use server';
import { createPayPalFullRefund, createPayPalPartialRefund } from '@/lib/paypal/server/refunds';
import { createRefund, createPartialRefund } from '@/lib/stripe/server/refunds';
import {
    createDocument, updateDocument, getDocument, getDocuments,
    deleteDocument
} from './sdk_db';
import { Query } from './sdk_client';

import { subDays } from 'date-fns';

/**
 * Helper function to map gateway refund status to our internal status
 * @param {string} gatewayStatus - Status from payment gateway
 * @param {string} gateway - Payment gateway name
 * @returns {string} - Internal refund status
 */
function getRefundStatus(gatewayStatus, gateway) {
    switch (gateway) {
        case 'stripe':
            return gatewayStatus === 'succeeded' ? 'Completed' : 'Pending';
        case 'paypal':
            switch (gatewayStatus) {
                case 'COMPLETED':
                    return 'Completed';
                case 'PENDING':
                    return 'Pending';
                case 'FAILED':
                    return 'Failed';
                default:
                    return 'Pending';
            }
        default:
            return 'Pending';
    }
}

const refundsCollectionId = process.env.CMS_COLLECTION_ID_PAYMENT_REFUNDS;
const paymentsCollectionId = process.env.CMS_COLLECTION_ID_ORDER_PAYMENTS;

/**
 * Process a refund for a payment
 * @param {string} paymentId - The payment document ID from your CMS
 * @param {number} refundAmount - Amount to refund (in dollars)
 * @param {string} reason - Reason for refund
 * @param {boolean} isPartial - Whether this is a partial refund
 * @returns {Object} - Result of the refund operation
 */
export async function processPaymentRefund(paymentId, refundAmount, reason, isPartial = false) {
    try {
        // 1. Get the original payment record
        const paymentResult = await getDocument(paymentsCollectionId, paymentId);
        if (!paymentResult.success) {
            return {
                success: false,
                message: 'Payment record not found'
            };
        }

        const payment = paymentResult.data;

        // 2. Validate refund amount
        const maxRefundAmount = payment.amount - (payment.refundedAmount || 0);
        if (refundAmount > maxRefundAmount) {
            return {
                success: false,
                message: `Refund amount cannot exceed available balance of $${maxRefundAmount.toFixed(2)}`
            };
        }

        // 3. Process refund through payment gateway
        let gatewayRefundResult;
        const refundAmountCents = Math.round(refundAmount * 100);

        switch (payment.paymentGateway) {
            case 'stripe':
                if (!payment.stripePaymentIntentId) {
                    return {
                        success: false,
                        message: 'No Stripe payment intent ID found for this payment'
                    };
                }

                if (isPartial) {
                    gatewayRefundResult = await createPartialRefund(
                        payment.stripePaymentIntentId,
                        refundAmountCents,
                        'requested_by_customer',
                        {
                            payment_id: paymentId,
                            refund_reason: reason,
                            processed_by: 'admin_panel'
                        }
                    );
                } else {
                    gatewayRefundResult = await createRefund(
                        payment.stripePaymentIntentId,
                        refundAmountCents,
                        'requested_by_customer',
                        {
                            payment_id: paymentId,
                            refund_reason: reason,
                            processed_by: 'admin_panel'
                        }
                    );
                }
                break;

            case 'paypal':
                if (!payment.paypalTransactionId) {
                    return {
                        success: false,
                        message: 'No PayPal transaction ID found for this payment'
                    };
                }

                if (isPartial) {
                    gatewayRefundResult = await createPayPalPartialRefund(
                        payment.paypalTransactionId,
                        refundAmount, // PayPal expects amount in dollars, not cents
                        payment.currency || 'USD',
                        reason,
                        {
                            payment_id: paymentId,
                            invoice_id: payment.receiptNumber || undefined
                        }
                    );
                } else {
                    gatewayRefundResult = await createPayPalFullRefund(
                        payment.paypalTransactionId,
                        reason,
                        {
                            payment_id: paymentId,
                            invoice_id: payment.receiptNumber || undefined
                        }
                    );
                }
                break;

            case 'braintree':
                // Add Braintree refund logic here
                return {
                    success: false,
                    message: 'Braintree refunds are not yet implemented'
                };

            default:
                return {
                    success: false,
                    message: `Refunds for ${payment.paymentGateway} are not supported`
                };
        }

        // 4. Check if gateway refund was successful
        if (!gatewayRefundResult.success) {
            return {
                success: false,
                message: `Gateway refund failed: ${gatewayRefundResult.message}`
            };
        }

        // 5. Create refund record in database
        const refundData = {
            payment: paymentId,
            amount: refundAmount,
            currency: payment.currency || 'USD',
            reason: reason,
            refundedAt: new Date().toISOString(),
            transactionId: gatewayRefundResult.data.id,
            paymentGateway: payment.paymentGateway,
            paymentMethod: payment.paymentMethod,
            status: getRefundStatus(gatewayRefundResult.data.status, payment.paymentGateway),
            failureReason: gatewayRefundResult.data.failure_reason || null,
            processedBy: 'admin_panel',
            gatewayRefundId: gatewayRefundResult.data.id,
            gatewayResponse: JSON.stringify(gatewayRefundResult.data)
        };

        const refundResult = await createDocument(refundsCollectionId, refundData);
        if (!refundResult.success) {
            return {
                success: false,
                message: 'Failed to create refund record in database'
            };
        }

        // 6. Update payment record
        const newRefundedAmount = (payment.refundedAmount || 0) + refundAmount;
        const isFullyRefunded = newRefundedAmount >= payment.amount;

        const paymentUpdateData = {
            isRefunded: true,
            refundedAmount: newRefundedAmount,
            refundedAt: new Date().toISOString(),
            refundTransactionId: gatewayRefundResult.data.id,
            refundReason: reason,
            status: isFullyRefunded ? 'Refunded' : 'Partially_Refunded'
        };

        const paymentUpdateResult = await updateDocument(paymentsCollectionId, paymentId, paymentUpdateData);
        if (!paymentUpdateResult.success) {
            return {
                success: false,
                message: 'Refund processed but failed to update payment record'
            };
        }

        return {
            success: true,
            data: {
                refund: refundResult.data,
                payment: paymentUpdateResult.data,
                gatewayRefund: gatewayRefundResult.data
            },
            message: `${isPartial ? 'Partial refund' : 'Full refund'} of $${refundAmount.toFixed(2)} processed successfully`
        };

    } catch (error) {
        console.error('Error processing refund:', error);
        return {
            success: false,
            message: error.message || 'Failed to process refund'
        };
    }
}

/**
 * Get refund history for a payment
 * @param {string} paymentId - The payment document ID
 * @returns {Object} - List of refunds for the payment
 */
export async function getPaymentRefunds(paymentId) {
    try {
        const Query = (await import('./sdk_client')).Query;
        const { getDocuments } = await import('./sdk_db');

        const refundsResult = await getDocuments(refundsCollectionId, [
            Query.equal('payment', paymentId),
            Query.orderDesc('$createdAt')
        ]);

        if (!refundsResult.success) {
            return {
                success: false,
                message: 'Failed to fetch refund history'
            };
        }

        return {
            success: true,
            data: refundsResult.data.documents
        };
    } catch (error) {
        console.error('Error fetching payment refunds:', error);
        return {
            success: false,
            message: 'Failed to fetch refund history'
        };
    }
}




/**
 * Fetch refunds with pagination, sorting, and filtering
 * @param {Object} options - Options for fetching refunds
 * @param {number} options.limit - Number of refunds to fetch
 * @param {number} options.offset - Offset for pagination
 * @param {string} options.sortField - Field to sort by
 * @param {string} options.sortOrder - Sort order ('asc' or 'desc')
 * @param {string} options.status - Filter by refund status
 * @param {string} options.paymentMethod - Filter by payment method
 * @param {string} options.paymentGateway - Filter by payment gateway
 * @param {string} options.search - Search term (for transaction ID or reason)
 * @param {string} options.timeFilter - Time filter for refunds
 * @returns {Promise<Object>} - Promise that resolves to refunds data
 */
export async function getRefunds(options = {}) {
    try {
        const {
            search = null,
            status = null,
            timeFilter = null,
            limit = 12,
            offset = 0,
            sortField = '$createdAt',
            sortOrder = 'desc',
            paymentMethod = "",
            paymentGateway = "",
        } = options;

        // Create queries array
        const queries = [
            Query.limit(limit),
            Query.offset(offset)
        ];

        // Add search filter if provided
        if (search) {
            queries.push(
                Query.or([
                    Query.search("transactionId", search),
                    Query.search("reason", search),
                    Query.search("gatewayRefundId", search),
                ])
            );
        }

        // Add status filter
        if (status) {
            queries.push(Query.equal('status', status));
        }

        // Add paymentMethod filter
        if (paymentMethod) {
            queries.push(Query.equal('paymentMethod', paymentMethod));
        }

        // Add paymentGateway filter
        if (paymentGateway) {
            queries.push(Query.equal('paymentGateway', paymentGateway));
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
                queries.push(Query.greaterThan('$createdAt', filterDate.toISOString()));
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

        // Get documents with the constructed queries
        const result = await getDocuments(refundsCollectionId, queries);
        if (!result.success) {
            return {
                success: false,
                data: null,
                message: result.message || "Failed to fetch refunds"
            };
        }

        return {
            success: true,
            data: {
                refunds: result.data.documents,
                total: result.data.total,
            },
            message: "Refunds fetched successfully",
        };
    } catch (error) {
        console.error("Error fetching refunds:", error);
        return {
            success: false,
            data: null,
            message: error.message || "Failed to fetch refunds",
        };
    }
}

/**
 * Fetch a single refund by ID
 * @param {string} refundId - The ID of the refund to fetch
 * @returns {Promise<Object>} - Promise that resolves to refund data
 */
export async function getRefundById(refundId) {
    try {
        // Fetch the refund with payment relationship
        const result = await getDocument(refundsCollectionId, refundId);

        if (!result.success) {
            return {
                success: false,
                data: null,
                message: result.message || "Failed to fetch refund"
            };
        }

        return {
            success: true,
            data: result.data,
            message: "Refund fetched successfully",
        };
    } catch (error) {
        console.error("Error fetching refund:", error);
        return {
            success: false,
            data: null,
            message: error.message || "Failed to fetch refund",
        };
    }
}

/**
 * Delete a refund by ID (admin only - use with caution)
 * @param {string} refundId - The ID of the refund to delete
 * @returns {Promise<Object>} - Promise that resolves to success/failure information
 */
export async function deleteRefundByAdmin(refundId) {
    try {
        await deleteDocument(refundsCollectionId, refundId);

        return {
            success: true,
            message: "Refund record deleted successfully",
        };
    } catch (error) {
        console.error("Error deleting refund:", error);
        return {
            success: false,
            message: error.message || "Failed to delete refund record",
        };
    }
}

/**
 * Get refund statistics
 * @param {Object} options - Filter options
 * @returns {Promise<Object>} - Refund statistics
 */
export async function getRefundStats(options = {}) {
    try {
        const {
            timeFilter = '30days',
            paymentGateway = null
        } = options;

        // Get refunds based on time filter
        const refundsResult = await getRefunds({
            limit: 1000, // Get all refunds for stats
            timeFilter: timeFilter,
            paymentGateway: paymentGateway
        });

        if (!refundsResult.success) {
            return {
                success: false,
                message: "Failed to fetch refund statistics"
            };
        }

        const refunds = refundsResult.data.refunds;

        // Calculate statistics
        const stats = {
            totalRefunds: refunds.length,
            totalAmount: refunds.reduce((sum, refund) => sum + (refund.amount || 0), 0),
            completedRefunds: refunds.filter(r => r.status === 'Completed').length,
            pendingRefunds: refunds.filter(r => r.status === 'Pending').length,
            failedRefunds: refunds.filter(r => r.status === 'Failed').length,
            byGateway: {},
            byMethod: {}
        };

        // Group by gateway
        refunds.forEach(refund => {
            const gateway = refund.paymentGateway || 'unknown';
            if (!stats.byGateway[gateway]) {
                stats.byGateway[gateway] = { count: 0, amount: 0 };
            }
            stats.byGateway[gateway].count++;
            stats.byGateway[gateway].amount += refund.amount || 0;
        });

        // Group by payment method
        refunds.forEach(refund => {
            const method = refund.paymentMethod || 'unknown';
            if (!stats.byMethod[method]) {
                stats.byMethod[method] = { count: 0, amount: 0 };
            }
            stats.byMethod[method].count++;
            stats.byMethod[method].amount += refund.amount || 0;
        });

        return {
            success: true,
            data: stats
        };
    } catch (error) {
        console.error("Error getting refund statistics:", error);
        return {
            success: false,
            message: error.message || "Failed to get refund statistics"
        };
    }
}

