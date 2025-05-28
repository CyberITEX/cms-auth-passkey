"use server";

import { Client, Databases, Account, Teams, Storage, Users, ID, Query, Permission, Role } from "node-appwrite";

// Helper function to initialize a client
const initializeClient = ({
    endpoint = process.env.CMS_ENDPOINT, 
    projectId = process.env.CMS_PROJECT_ID, 
    key = null,
    session = null
} = {}) => {
    if (!endpoint || !projectId) {
        throw new Error("Missing required environment variables: CMS_ENDPOINT or CMS_PROJECT_ID");
    }

    const client = new Client().setEndpoint(endpoint).setProject(projectId);

    if (key) {
        client.setKey(key);
    }

    if (session) {
        client.setSession(session);
    }

    return client;
};

// Factory function to create client services
const createClientServices = (client) => ({
    account: new Account(client),
    databases: new Databases(client),
    teams: new Teams(client),
    storage: new Storage(client),
    users: new Users(client),
    databaseId: process.env.CMS_DB_ID,
});

// Factory function for creating an admin client
export async function createAdminClient() {
    const client = initializeClient({
        key: process.env.CMS_API_KEY,
    });
    return createClientServices(client);
}

// Factory function for creating a session-based client
export async function createSessionClient(session) {
    const client = initializeClient({
        session,
    });
    return createClientServices(client);
}

// Factory function for creating a basic client
export async function createClient() {
    const client = initializeClient();
    return createClientServices(client);
}

// Export ID generation utility
export { ID, Query, Permission, Role };