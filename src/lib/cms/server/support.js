'use server';

import { Query } from 'appwrite';
import { getDocuments, createDocument, updateDocument, deleteDocument } from './sdk_db';
import { uploadFile, deleteFile } from './sdk_storage';


/**
 * Standard response handler for support ticket operations
 */
const formatResponse = (response) => {
    if (!response.success) {
        return {
            success: false,
            message: response.message || 'An error occurred while fetching support tickets',
            tickets: []
        };
    }

    // Parse messages from string to array for each ticket
    const tickets = response.data?.documents || [];
    tickets.forEach(ticket => {
        if (ticket.messages && typeof ticket.messages === 'string') {
            try {
                ticket.messages = JSON.parse(ticket.messages);
            } catch (e) {
                console.error('Error parsing messages for ticket:', ticket.$id, e);
                ticket.messages = [];
            }
        }
    });

    return {
        success: true,
        tickets: tickets
    };
};

/**
 * Upload file attachments for a support ticket
 */
async function uploadAttachments(userId, ticketId, files) {
    if (!files || files.length === 0) return [];

    const uploadedFiles = [];

    for (const file of files) {
        // Upload the file
        const uploadResponse = await uploadFile(
            process.env.CMS_BUCKET_ID_SUPPORT_TICKETS_ATTACHMENTS,
            file,
            undefined,
            [`read("user:${userId}")`, `read("team:any")`]
        );

        if (uploadResponse.success) {
            // Store complete file metadata instead of just the ID
            uploadedFiles.push({
                fileId: uploadResponse.data.$id,
                bucketId: process.env.CMS_BUCKET_ID_SUPPORT_TICKETS_ATTACHMENTS,
                fileName: uploadResponse.data.name,
                mimeType: uploadResponse.data.mimeType,
                fileSize: uploadResponse.data.sizeOriginal
            });
        } else {
            console.error('Error uploading file:', uploadResponse.message);
        }
    }

    return uploadedFiles;
}

/**
 * Create a new support ticket with optional file attachments
 */
export async function createSupportTicket(userId, ticketData, files = []) {
    try {
        if (!userId) {
            return { success: false, message: 'User ID is required' };
        }

        const currentTime = new Date().toISOString();

        // Create the initial ticket
        const ticketToCreate = {
            userId,
            userEmail: ticketData.userEmail || null,
            subject: ticketData.subject,
            category: ticketData.category,
            description: ticketData.description,
            status: 'open',
            priority: ticketData.priority || 'medium',
            attachments: [],
            createdAt: currentTime,
            updatedAt: currentTime,
            resolvedAt: null,
            assignedTo: null,
            responseTime: null,
            tags: [],
            isEscalated: false,
            messages: JSON.stringify([])
        };

        // Create the ticket
        const ticketResponse = await createDocument(process.env.CMS_COLLECTION_ID_SUPPORT_TICKETS, ticketToCreate);

        if (!ticketResponse.success) {
            return { success: false, message: ticketResponse.message || 'Failed to create support ticket' };
        }

        const ticket = ticketResponse.data;

        // Upload attachments if any
        const uploadedFiles = files && files.length > 0
            ? await uploadAttachments(userId, ticket.$id, files)
            : [];

        // Extract just the fileIds for the attachments array
        const fileIds = uploadedFiles.map(file => file.fileId);

        // Create the initial message with description and attachments
        const messagesArray = [
            {
                sender: 'user',
                content: ticketData.description,
                timestamp: currentTime,
                attachments: uploadedFiles // Store complete file metadata
            }
        ];

        // Update the ticket with message and attachments
        const updateResponse = await updateDocument(
            process.env.CMS_COLLECTION_ID_SUPPORT_TICKETS,
            ticket.$id,
            {
                messages: JSON.stringify(messagesArray),
                attachments: fileIds
            }
        );

        if (!updateResponse.success) {
            return { success: false, message: updateResponse.message || 'Failed to add initial message to ticket' };
        }

        // Parse messages back to array for the response
        const updatedTicket = updateResponse.data;
        if (updatedTicket.messages && typeof updatedTicket.messages === 'string') {
            updatedTicket.messages = JSON.parse(updatedTicket.messages);
        }

        return {
            success: true,
            ticket: updatedTicket
        };
    } catch (error) {
        console.error('Error creating support ticket:', error);
        return { success: false, message: error.message || 'Failed to create support ticket' };
    }
}

/**
 * Get all support tickets for a user
 */
export async function getUserSupportTickets(userId) {
    try {
        if (!userId) {
            return { success: false, message: 'User ID is required', tickets: [] };
        }

        // Get all tickets for the user
        const response = await getDocuments(
            process.env.CMS_COLLECTION_ID_SUPPORT_TICKETS,
            [
                Query.equal('userId', userId),
                Query.orderDesc('$updatedAt'),
                Query.limit(100)
            ]
        );

        return formatResponse(response);
    } catch (error) {
        console.error('Error fetching user support tickets:', error);
        return {
            success: false,
            message: error.message || 'Failed to retrieve support tickets',
            tickets: []
        };
    }
}

/**
 * Get a specific support ticket
 */
export async function getSupportTicket(ticketId) {
    try {
        if (!ticketId) {
            return { success: false, message: 'Ticket ID is required' };
        }

        // Get the ticket
        const response = await getDocuments(
            process.env.CMS_COLLECTION_ID_SUPPORT_TICKETS,
            [
                Query.equal('$id', ticketId),
                Query.limit(1)
            ]
        );

        if (!response.success || response.data?.documents?.length === 0) {
            return { success: false, message: 'Support ticket not found' };
        }

        const ticket = response.data.documents[0];

        // Parse messages from string to array
        if (ticket.messages && typeof ticket.messages === 'string') {
            ticket.messages = JSON.parse(ticket.messages);
        }

        return {
            success: true,
            ticket: ticket
        };
    } catch (error) {
        console.error('Error fetching support ticket:', error);
        return { success: false, message: error.message || 'Failed to retrieve support ticket' };
    }
}

/**
 * Add a message to a support ticket with optional file attachments
 */
export async function addTicketMessage(ticketId, sender, content, files = []) {
    try {
        if (!ticketId || !sender || (!content && (!files || files.length === 0))) {
            return { success: false, message: 'Ticket ID, sender, and either content or files are required' };
        }

        // Get the current ticket
        const ticketResponse = await getSupportTicket(ticketId);
        if (!ticketResponse.success) {
            return ticketResponse;
        }

        const ticket = ticketResponse.ticket;

        // Upload attachments if any
        const uploadedFiles = files && files.length > 0
            ? await uploadAttachments(ticket.userId, ticketId, files)
            : [];

        // Extract just the fileIds for the attachments array
        const fileIds = uploadedFiles.map(file => file.fileId);

        // Ensure messages is an array
        const currentMessages = Array.isArray(ticket.messages) ? ticket.messages : [];

        // Create the new message
        const newMessage = {
            sender,
            content: content || '',
            timestamp: new Date().toISOString(),
            attachments: uploadedFiles // Store complete file metadata
        };

        // Add message to the ticket
        const updatedMessages = [...currentMessages, newMessage];

        // Update ticket status based on sender
        let newStatus = ticket.status;
        if (sender === 'support' && (ticket.status === 'open' || ticket.status === 'in_progress')) {
            newStatus = 'waiting_on_customer';
        } else if (sender === 'user' && ticket.status === 'waiting_on_customer') {
            newStatus = 'in_progress';
        }

        // Update the ticket
        const ticketAttachments = Array.isArray(ticket.attachments) ? ticket.attachments : [];
        const updateResponse = await updateDocument(
            process.env.CMS_COLLECTION_ID_SUPPORT_TICKETS,
            ticketId,
            {
                messages: JSON.stringify(updatedMessages),
                attachments: [...ticketAttachments, ...fileIds],
                status: newStatus,
                updatedAt: new Date().toISOString()
            }
        );

        if (!updateResponse.success) {
            return { success: false, message: updateResponse.message || 'Failed to add message to support ticket' };
        }

        // Parse messages back to array for the response
        const updatedTicket = updateResponse.data;
        if (updatedTicket.messages && typeof updatedTicket.messages === 'string') {
            updatedTicket.messages = JSON.parse(updatedTicket.messages);
        }

        return {
            success: true,
            ticket: updatedTicket
        };
    } catch (error) {
        console.error('Error adding message to support ticket:', error);
        return { success: false, message: error.message || 'Failed to add message to support ticket' };
    }
}


/**
 * Update support ticket status
 */
export async function updateTicketStatus(ticketId, status) {
    try {
        if (!ticketId || !status) {
            return { success: false, message: 'Ticket ID and status are required' };
        }

        // Validate status value
        const validStatuses = ['open', 'in_progress', 'waiting_on_customer', 'resolved', 'closed'];
        if (!validStatuses.includes(status)) {
            return { success: false, message: `Invalid status value. Must be one of: ${validStatuses.join(', ')}` };
        }

        const updates = {
            status,
            updatedAt: new Date().toISOString()
        };

        // If marking as resolved/closed, add resolvedAt timestamp
        if (status === 'resolved' || status === 'closed') {
            updates.resolvedAt = new Date().toISOString();
        }

        // Update the ticket status
        const updateResponse = await updateDocument(process.env.CMS_COLLECTION_ID_SUPPORT_TICKETS, ticketId, updates);

        if (!updateResponse.success) {
            return { success: false, message: updateResponse.message || 'Failed to update support ticket status' };
        }

        // Parse messages for the response
        const ticket = updateResponse.data;
        if (ticket.messages && typeof ticket.messages === 'string') {
            ticket.messages = JSON.parse(ticket.messages);
        }

        return {
            success: true,
            ticket: ticket
        };
    } catch (error) {
        console.error('Error updating support ticket status:', error);
        return { success: false, message: error.message || 'Failed to update support ticket status' };
    }
}



// Add these new functions to src\lib\cms\server\support.js

/**
 * Get all support tickets (for admin view)
 */
export async function getAllSupportTickets() {
    try {
        // Get all tickets, sorted by most recently updated
        const response = await getDocuments(
            process.env.CMS_COLLECTION_ID_SUPPORT_TICKETS,
            [
                Query.orderDesc('$updatedAt'),
                Query.limit(100)
            ]
        );

        return formatResponse(response);
    } catch (error) {
        console.error('Error fetching all support tickets:', error);
        return {
            success: false,
            message: error.message || 'Failed to retrieve support tickets',
            tickets: []
        };
    }
}

/**
 * Assign a ticket to an agent
 */
export async function assignTicketToAgent(ticketId, agentId, agentEmail) {
    try {
        if (!ticketId || !agentId) {
            return { success: false, message: 'Ticket ID and agent ID are required' };
        }

        // Get the current ticket first
        const ticketResponse = await getSupportTicket(ticketId);
        if (!ticketResponse.success) {
            return ticketResponse;
        }

        const ticket = ticketResponse.ticket;

        // Update the ticket with agent info
        const updateResponse = await updateDocument(
            process.env.CMS_COLLECTION_ID_SUPPORT_TICKETS,
            ticketId,
            {
                assignedTo: agentId,
                agentEmail: agentEmail || null,
                updatedAt: new Date().toISOString(),
                // If ticket is 'open', change to 'in_progress' when assigned
                status: ticket.status === 'open' ? 'in_progress' : ticket.status
            }
        );

        if (!updateResponse.success) {
            return { success: false, message: updateResponse.message || 'Failed to assign ticket to agent' };
        }

        // Parse messages for the response
        const updatedTicket = updateResponse.data;
        if (updatedTicket.messages && typeof updatedTicket.messages === 'string') {
            updatedTicket.messages = JSON.parse(updatedTicket.messages);
        }

        return {
            success: true,
            ticket: updatedTicket
        };
    } catch (error) {
        console.error('Error assigning ticket to agent:', error);
        return { success: false, message: error.message || 'Failed to assign ticket to agent' };
    }
}




/**
 * Delete a support ticket and all associated files
 * @param {string} ticketId - The ID of the ticket to delete
 * @returns {Promise<Object>} Result of the operation
 */
export async function deleteTicket(ticketId) {
    try {
        if (!ticketId) {
            return { success: false, message: 'Ticket ID is required' };
        }

        // First, get the ticket details to find all associated files
        const ticketResponse = await getSupportTicket(ticketId);

        if (!ticketResponse.success) {
            return { success: false, message: `Failed to retrieve ticket: ${ticketResponse.message}` };
        }

        const ticket = ticketResponse.ticket;
        const allFileIds = new Set();

        // Collect all file IDs from the ticket attachments
        if (ticket.attachments && Array.isArray(ticket.attachments)) {
            ticket.attachments.forEach(fileId => {
                if (typeof fileId === 'string') {
                    allFileIds.add(fileId);
                }
            });
        }

        // Collect all file IDs from message attachments
        if (ticket.messages && Array.isArray(ticket.messages)) {
            ticket.messages.forEach(message => {
                if (message.attachments && Array.isArray(message.attachments)) {
                    message.attachments.forEach(attachment => {
                        const fileId = typeof attachment === 'string' ? attachment : attachment.fileId;
                        if (fileId) {
                            allFileIds.add(fileId);
                        }
                    });
                }
            });
        }

        // Delete all associated files first
        const fileDeleteResults = [];

        for (const fileId of allFileIds) {
            try {
                const deleteResult = await deleteFile(process.env.CMS_BUCKET_ID_SUPPORT_TICKETS_ATTACHMENTS, fileId);
                fileDeleteResults.push({
                    fileId,
                    success: deleteResult.success,
                    message: deleteResult.success ? 'File deleted successfully' : deleteResult.message
                });
            } catch (fileError) {
                console.error(`Error deleting file ${fileId}:`, fileError);
                fileDeleteResults.push({
                    fileId,
                    success: false,
                    message: fileError.message || 'Unknown error'
                });
            }
        }

        // Then delete the ticket document
        const response = await deleteDocument(process.env.CMS_COLLECTION_ID_SUPPORT_TICKETS, ticketId);

        if (!response.success) {
            return {
                success: false,
                message: response.message || 'Failed to delete ticket',
                fileResults: fileDeleteResults
            };
        }

        return {
            success: true,
            message: `Ticket and ${allFileIds.size} associated files deleted successfully`,
            fileResults: fileDeleteResults,
            fileCount: allFileIds.size
        };
    } catch (error) {
        console.error('Error deleting ticket:', error);
        return { success: false, message: error.message || 'Failed to delete ticket' };
    }
}

/**
 * Delete multiple support tickets and their associated files
 * @param {Array<string>} ticketIds - Array of ticket IDs to delete
 * @returns {Promise<Object>} Result of the operation
 */
export async function deleteMultipleTickets(ticketIds) {
    try {
        if (!ticketIds || !Array.isArray(ticketIds) || ticketIds.length === 0) {
            return { success: false, message: 'Valid ticket IDs are required' };
        }

        const results = [];
        let allSuccessful = true;
        let totalFilesDeleted = 0;

        // Delete each ticket one by one
        for (const ticketId of ticketIds) {
            const response = await deleteTicket(ticketId);

            results.push({
                ticketId,
                success: response.success,
                message: response.message,
                fileResults: response.fileResults
            });

            if (!response.success) {
                allSuccessful = false;
            } else {
                totalFilesDeleted += response.fileCount || 0;
            }
        }

        return {
            success: allSuccessful,
            message: allSuccessful
                ? `All ${ticketIds.length} tickets and ${totalFilesDeleted} associated files deleted successfully`
                : 'Some tickets could not be deleted',
            results,
            ticketsCount: ticketIds.length,
            filesCount: totalFilesDeleted
        };
    } catch (error) {
        console.error('Error deleting multiple tickets:', error);
        return { success: false, message: error.message || 'Failed to delete tickets' };
    }
}