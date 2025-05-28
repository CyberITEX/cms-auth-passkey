"use server"
import { Query } from './sdk_client';
import {
    getDocument,
    getDocuments,
    deleteDocument
} from './sdk_db';
import { subDays } from 'date-fns';
/**
 * Fetch payments with pagination, sorting, and filtering
 * @param {Object} options - Options for fetching payments
 * @param {number} options.limit - Number of payments to fetch
 * @param {number} options.offset - Offset for pagination
 * @param {string} options.sortField - Field to sort by
 * @param {string} options.sortOrder - Sort order ('asc' or 'desc')
 * @param {string} options.status - Filter by payment status
 * @param {string} options.paymentMethod - Filter by payment method
 * @param {string} options.paymentGateway - Filter by payment gateway
 * @param {string} options.search - Search term (for transaction ID)
 * @returns {Promise<Object>} - Promise that resolves to payments data
 */
const orderPaymentsId = process.env.CMS_COLLECTION_ID_ORDER_PAYMENTS;
export async function getPayments(options = {}) {
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
                    Query.search("userEmail", search),
                    Query.search("userId", search),
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
        const result = await getDocuments(orderPaymentsId, queries);
        if (!result.success) {
            return {
                success: false,
                data: null,
                message: result.message || "Failed to fetch payments"
            };
        }

        return {
            success: true,
            data: {
                payments: result.data.documents,
                total: result.data.total,
            },
            message: "Payments fetched successfully",
        };
    } catch (error) {
        console.error("Error fetching payments:", error);
        return {
            success: false,
            data: null,
            message: error.message || "Failed to fetch payments",
        };
    }
}

/**
 * Fetch a single payment by ID
 * @param {string} paymentId - The ID of the payment to fetch
 * @returns {Promise<Object>} - Promise that resolves to payment data
 */
export async function getPaymentById(paymentId) {
    try {
        // Fetch the payment
        const result = await getDocument(orderPaymentsId, paymentId);

        if (!result.success) {
            return {
                success: false,
                data: null,
                message: result.message || "Failed to fetch payment"
            };
        }

        return {
            success: true,
            data: result.data,
            message: "Payment fetched successfully",
        };
    } catch (error) {
        console.error("Error fetching payment:", error);
        return {
            success: false,
            data: null,
            message: error.message || "Failed to fetch payment",
        };
    }
}

/**
 * Delete a payment by ID (admin only)
 * @param {string} paymentId - The ID of the payment to delete
 * @returns {Promise<Object>} - Promise that resolves to success/failure information
 */
export async function deletePaymentByAdmin(paymentId) {
    try {

        await deleteDocument(
            orderPaymentsId,
            paymentId
        );

        return {
            success: true,
            message: "Payment deleted successfully",
        };
    } catch (error) {
        console.error("Error deleting payment:", error);
        return {
            success: false,
            message: error.message || "Failed to delete payment",
        };
    }
}