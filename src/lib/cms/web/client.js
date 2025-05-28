"use client";

import { Client, Account, Storage, ID } from "appwrite";
import { getCmsConfig } from './config';

// Initialize config state
let cmsConfig = null;

// Helper function to initialize a client
const initializeClient = async ({ session = null } = {}) => {
    if (!cmsConfig) {
        cmsConfig = await getCmsConfig();
    }

    if (!cmsConfig.endpoint || !cmsConfig.projectId) {
        throw new Error("Missing required configuration: Appwrite endpoint or project ID");
    }

    const client = new Client().setEndpoint(cmsConfig.endpoint).setProject(cmsConfig.projectId);

    if (session) {
        client.setSession(session);
    }

    return client;
};

// Factory function to create client services
const createClientServices = (client) => ({
    client: client,
    account: new Account(client),
    storage: new Storage(client),
    databaseId: cmsConfig.databaseId,
});

// Factory function for creating a session-based client
export async function createSessionClient(session) {
    const client = await initializeClient({
        session,
    });
    return createClientServices(client);
}

// Factory function for creating a basic client
export async function createClient() {
    const client = await initializeClient();
    return createClientServices(client);
}

// Export ID generation utility
export { ID };