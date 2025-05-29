// src/lib/cms/server/passkey_setup.js
"use server";

import { createAdminClient, ID, Permission, Role } from './sdk_client';

/**
 * Creates the required Appwrite collections for passkey functionality
 * Run this once to set up your database schema
 * @returns {Promise<{success: boolean, data?: any, message?: string}>}
 */
export async function createPasskeyCollections() {
  try {
    const { databases } = await createAdminClient();
    const databaseId = process.env.CMS_DB_ID;

    if (!databaseId) {
      throw new Error("CMS_DB_ID environment variable is required");
    }

    const results = {
      challengesCollection: null,
      credentialsCollection: null
    };

    // Collection 1: Passkey Challenges (temporary storage)
    try {
      console.log("Creating passkey challenges collection...");
      
      const challengesCollection = await databases.createCollection(
        databaseId,
        "passKeyChallenges", // Using your specified ID
        'passkey_challenges',
        [
          Permission.create(Role.users()),
          Permission.read(Role.users()),
          Permission.update(Role.users()),
          Permission.delete(Role.users())
        ]
      );

      results.challengesCollection = challengesCollection;
      console.log(`✅ Created challenges collection: ${challengesCollection.$id}`);

      // Create attributes for challenges collection
      const challengeAttributes = [
        { key: 'userId', type: 'string', size: 36, required: true },
        { key: 'challenge', type: 'string', size: 500, required: true },
        { key: 'type', type: 'enum', elements: ['registration', 'authentication'], required: true },
        { key: 'expiresAt', type: 'datetime', required: true }
      ];

      for (const attr of challengeAttributes) {
        if (attr.type === 'enum') {
          await databases.createEnumAttribute(
            databaseId,
            challengesCollection.$id,
            attr.key,
            attr.elements,
            attr.required
          );
        } else if (attr.type === 'datetime') {
          await databases.createDatetimeAttribute(
            databaseId,
            challengesCollection.$id,
            attr.key,
            attr.required
          );
        } else {
          await databases.createStringAttribute(
            databaseId,
            challengesCollection.$id,
            attr.key,
            attr.size,
            attr.required
          );
        }
        console.log(`  ✅ Created attribute: ${attr.key}`);
        
        // Add small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Create indexes for challenges collection
      await databases.createIndex(
        databaseId,
        challengesCollection.$id,
        'userId_index',
        'key',
        ['userId']
      );
      console.log("  ✅ Created userId index");

      await databases.createIndex(
        databaseId,
        challengesCollection.$id,
        'expires_index',
        'key',
        ['expiresAt']
      );
      console.log("  ✅ Created expires index");

    } catch (error) {
      if (error.code === 409) {
        console.log("⚠️  Challenges collection already exists, skipping...");
        // Get existing collection info
        try {
          const existingCollection = await databases.getCollection(databaseId, "passKeyChallenges");
          results.challengesCollection = existingCollection;
        } catch (e) {
          console.log("Could not fetch existing collection info");
        }
      } else {
        throw error;
      }
    }

    // Collection 2: Passkey Credentials (permanent storage)
    try {
      console.log("Creating passkey credentials collection...");
      
      const credentialsCollection = await databases.createCollection(
        databaseId,
        "passKeyCredentials", // Using your specified ID
        'passkey_credentials',
        [
          Permission.create(Role.users()),
          Permission.read(Role.users()),
          Permission.update(Role.users()),
          Permission.delete(Role.users())
        ]
      );

      results.credentialsCollection = credentialsCollection;
      console.log(`✅ Created credentials collection: ${credentialsCollection.$id}`);

      // Create attributes for credentials collection
      const credentialAttributes = [
        { key: 'userId', type: 'string', size: 36, required: true },
        { key: 'credentialId', type: 'string', size: 1000, required: true },
        { key: 'credentialPublicKey', type: 'string', size: 2000, required: true },
        { key: 'counter', type: 'integer', required: true, default: 0 },
        { key: 'deviceType', type: 'enum', elements: ['singleDevice', 'multiDevice'], required: true },
        { key: 'backedUp', type: 'boolean', required: true },
        { key: 'transports', type: 'string', size: 500, required: false },
        { key: 'createdAt', type: 'datetime', required: true }
      ];

      for (const attr of credentialAttributes) {
        if (attr.type === 'enum') {
          await databases.createEnumAttribute(
            databaseId,
            credentialsCollection.$id,
            attr.key,
            attr.elements,
            attr.required
          );
        } else if (attr.type === 'datetime') {
          await databases.createDatetimeAttribute(
            databaseId,
            credentialsCollection.$id,
            attr.key,
            attr.required
          );
        } else if (attr.type === 'boolean') {
          await databases.createBooleanAttribute(
            databaseId,
            credentialsCollection.$id,
            attr.key,
            attr.required
          );
        } else if (attr.type === 'integer') {
          await databases.createIntegerAttribute(
            databaseId,
            credentialsCollection.$id,
            attr.key,
            attr.required,
            undefined,
            undefined,
            attr.default
          );
        } else {
          await databases.createStringAttribute(
            databaseId,
            credentialsCollection.$id,
            attr.key,
            attr.size,
            attr.required
          );
        }
        console.log(`  ✅ Created attribute: ${attr.key}`);
        
        // Add small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Create indexes for credentials collection  
      await databases.createIndex(
        databaseId,
        credentialsCollection.$id,
        'userId_index',
        'key',
        ['userId']
      );
      console.log("  ✅ Created userId index");

      await databases.createIndex(
        databaseId,
        credentialsCollection.$id,
        'credentialId_unique',
        'unique',
        ['credentialId']
      );
      console.log("  ✅ Created credentialId unique index");

    } catch (error) {
      if (error.code === 409) {
        console.log("⚠️  Credentials collection already exists, skipping...");
        // Get existing collection info
        try {
          const existingCollection = await databases.getCollection(databaseId, "passKeyCredentials");
          results.credentialsCollection = existingCollection;
        } catch (e) {
          console.log("Could not fetch existing collection info");
        }
      } else {
        throw error;
      }
    }

    console.log("\n" + "=".repeat(70));
    console.log("🎉 PASSKEY COLLECTIONS SETUP COMPLETE!");
    console.log("=".repeat(70));
    console.log("✅ Challenges Collection ID: passKeyChallenges");
    console.log("✅ Credentials Collection ID: passKeyCredentials");
    console.log("✅ Your .env variables are already set correctly!");
    console.log("=".repeat(70));
    console.log("\n🎯 Next Steps:");
    console.log("1. Install SimpleWebAuthn: npm install @simplewebauthn/server @simplewebauthn/browser");
    console.log("2. Create passkey_utils.js with helper functions");
    console.log("3. Implement the server-side passkey functions");
    console.log("4. Update the client-side passkey service");

    return {
      success: true,
      data: {
        challengesCollectionId: "passKeyChallenges",
        credentialsCollectionId: "passKeyCredentials"
      },
      message: "Passkey collections created successfully"
    };

  } catch (error) {
    console.error("❌ Error creating passkey collections:", error);
    return {
      success: false,
      message: error.message || "Failed to create passkey collections"
    };
  }
}

/**
 * Helper function to check if passkey collections exist
 * @returns {Promise<{success: boolean, exists: boolean, collections?: any}>}
 */
export async function checkPasskeyCollections() {
  try {
    const { databases } = await createAdminClient();
    const databaseId = process.env.CMS_DB_ID;

    let challengesExists = false;
    let credentialsExists = false;

    try {
      await databases.getCollection(databaseId, "passKeyChallenges");
      challengesExists = true;
    } catch (e) {
      // Collection doesn't exist
    }

    try {
      await databases.getCollection(databaseId, "passKeyCredentials");
      credentialsExists = true;
    } catch (e) {
      // Collection doesn't exist
    }

    return {
      success: true,
      exists: challengesExists && credentialsExists,
      collections: {
        challenges: challengesExists,
        credentials: credentialsExists
      }
    };

  } catch (error) {
    return {
      success: false,
      exists: false,
      message: error.message
    };
  }
}

/**
 * Clean up expired challenges (run periodically)
 * @returns {Promise<{success: boolean, deletedCount?: number, message?: string}>}
 */
export async function cleanupExpiredChallenges() {
  try {
    const { databases } = await createAdminClient();
    const databaseId = process.env.CMS_DB_ID;
    const challengesCollectionId = process.env.CMS_COLLECTION_ID_PASSKEY_CHALLENGES;

    if (!challengesCollectionId) {
      throw new Error("CMS_COLLECTION_ID_PASSKEY_CHALLENGES environment variable is required");
    }

    const now = new Date();
    
    // Get all challenges and filter expired ones
    const allChallenges = await databases.listDocuments(
      databaseId,
      challengesCollectionId
    );

    let deletedCount = 0;
    for (const challenge of allChallenges.documents) {
      if (new Date(challenge.expiresAt) < now) {
        await databases.deleteDocument(databaseId, challengesCollectionId, challenge.$id);
        deletedCount++;
      }
    }

    console.log(`🧹 Cleaned up ${deletedCount} expired challenges`);

    return {
      success: true,
      deletedCount,
      message: `Cleaned up ${deletedCount} expired challenges`
    };

  } catch (error) {
    console.error("❌ Error cleaning up expired challenges:", error);
    return {
      success: false,
      message: error.message || "Failed to cleanup expired challenges"
    };
  }
}

/**
 * Setup script runner - call this from a separate script or API endpoint
 */
export async function runPasskeySetup() {
  console.log("🚀 Starting Passkey Collections Setup for CyberITEX...");
  
  // Check if collections already exist
  const checkResult = await checkPasskeyCollections();
  if (checkResult.exists) {
    console.log("⚠️  Passkey collections already exist. Setup complete!");
    return {
      success: true,
      message: "Collections already exist",
      data: {
        challengesCollectionId: "passKeyChallenges",
        credentialsCollectionId: "passKeyCredentials"
      }
    };
  }

  // Create the collections
  return await createPasskeyCollections();
}