// src\lib\cms\server\sdk_users.js
"use server";

import { createAdminClient, createSessionClient, Query, ID } from './sdk_client';
import { verifyJWT } from "./jwt";
import { deleteCookie, getCookie } from "./cookieService";
import { getCartItemCount } from "./cart";
import { addToTeam, setupUserCompanyTeam } from './sdk_teams';
// import { createCustomer } from '@/lib/stripe/server/customers';

/**
 * Standardized error handler for user management functions
 * @param {Function} operation - Async function to execute
 * @param {string} errorMessage - Default error message
 */
const handleUserOperation = async (operation, errorMessage) => {
    try {
        const response = await operation();
        return {
            success: true,
            data: response,
            total: response?.total || (Array.isArray(response) ? response.length : undefined)
        };
    } catch (error) {
        console.error(`${errorMessage}:`, error);
        return {
            success: false,
            message: error.message || errorMessage
        };
    }
};


/**
 * Get list of users with optional queries and search
 * @param {Array} queries - Optional query parameters
 * @param {string} search - Optional search term
 */
export async function getUsers(queries = [], search = '') {
    return handleUserOperation(
        async () => {
            const { users } = await createAdminClient();
            const response = search
                ? await users.list(queries, search)
                : await users.list(queries);
            return response;
        },
        "Failed to fetch users"
    );
}

/**
 * Get a user by ID
 * @param {string} userId - The user ID
 */
export async function getUser(userId) {
    return handleUserOperation(
        async () => {
            const { users } = await createAdminClient();
            return await users.get(userId);
        },
        `Failed to fetch user with ID ${userId}`
    );
}

/**
 * Get user by current session
 */
export async function getUserBySession() {
    const sessionCookie = await getCookie(process.env.COOKIE_NAME);

    if (!sessionCookie.exists) {
        return {
            success: false,
            message: "No session cookie found"
        };
    }

    try {
        const sessionPayload = await verifyJWT(sessionCookie.data.value);
        const { account } = await createSessionClient(sessionPayload.session.secret);

        // Try to get user data and catch 401 specifically
        let userData;
        try {
            userData = await account.get(sessionPayload.userId);
        } catch (error) {
            // Check if it's a 401 error
            if (error.code === 401 || error.status === 401 || error.statusCode === 401) {
                console.log("401 Unauthorized: Deleting session cookie");
                await deleteCookie(process.env.COOKIE_NAME);
                return {
                    success: false,
                    message: "Session unauthorized"
                };
            }
            // Rethrow other errors
            throw error;
        }

        // Continue with the rest of the function if account.get is successful
        const membershipsResponse = await getUserMemberships(sessionPayload.userId);
        const userMemberships = membershipsResponse?.data?.memberships || [];

        const userTeams = {
            teams: userMemberships.map((m) => ({
                teamId: m.teamId,
                teamName: m.teamName,
                roles: m.roles,
            })),
        };

        // Compare session teams with user teams
        const sortedSessionTeams = [...sessionPayload.teams].sort((a, b) =>
            a.teamId.localeCompare(b.teamId));
        const sortedUserTeams = [...userTeams.teams].sort((a, b) =>
            a.teamId.localeCompare(b.teamId));

        // Sort roles arrays within each team
        sortedSessionTeams.forEach(team => team.roles.sort());
        sortedUserTeams.forEach(team => team.roles.sort());

        // Compare the sorted arrays
        const areTeamsEqual = JSON.stringify(sortedSessionTeams) ===
            JSON.stringify(sortedUserTeams);

        if (!areTeamsEqual) {
            await account.deleteSession(sessionPayload.session.$id);
            await deleteCookie(process.env.COOKIE_NAME);
            throw new Error("User teams mismatch with session teams");
        }

        return { success: true, userData, userTeams };

    } catch (error) {
        // Delete cookie on any other error
        console.error("Authentication error:", error.message);
        await deleteCookie(process.env.COOKIE_NAME);

        return {
            success: false,
            message: "Failed to authenticate user session",
            error: error.message
        };
    }
}


export async function getUserSessionFromCookie() {
    const sessionCookie = await getCookie(process.env.COOKIE_NAME);

    if (!sessionCookie.exists) {
        return {
            success: false,
            message: "No session cookie found"
        };
    }

    try {
        const sessionPayload = await verifyJWT(sessionCookie.data.value);
        const userSessions = await getUserSessions(sessionPayload.userId);

        // Check if the session exists in the user's active sessions
        if (!userSessions.success || userSessions.data.total === 0) {
            // console.error("No active sessions found for user");
            await deleteCookie(process.env.COOKIE_NAME);
            return {
                success: false,
                message: "No active sessions found for user"
            };
        }

        // Check if the session ID from JWT exists in the user's sessions
        const sessionExists = userSessions.data.sessions.some(
            session => session.$id === sessionPayload.$id
        );

        if (!sessionExists) {
            // console.error("Session ID not found in user's active sessions");
            await deleteCookie(process.env.COOKIE_NAME);
            return {
                success: false,
                message: "Invalid session"
            };
        }

        // Session is valid
        return {
            success: true,
            session: sessionPayload
        };

    } catch (error) {
        // Delete cookie on any other error
        console.error("Authentication error:", error.message);
        await deleteCookie(process.env.COOKIE_NAME);

        return {
            success: false,
            message: "Failed to authenticate user session",
            error: error.message
        };
    }
}

/**
 * Logout current user
 */
export async function logout() {
    const sessionCookie = await getCookie(process.env.COOKIE_NAME);

    if (!sessionCookie.exists) {
        return {
            success: true,
            message: "No session to logout"
        };
    }

    return handleUserOperation(
        async () => {
            const sessionPayload = await verifyJWT(sessionCookie.data.value);
            const { account } = await createSessionClient(sessionPayload.session.secret);

            // Delete the session
            await account.deleteSession(sessionPayload.session.$id);

            // Remove the cookie
            await deleteCookie(process.env.COOKIE_NAME);

            return {
                message: "User logged out successfully"
            };
        },
        "Failed to log out user"
    ).catch(async (error) => {
        // Clean up cookie even on error
        await deleteCookie(process.env.COOKIE_NAME);

        return {
            success: true,
            message: "Logout completed"
        };
    });
}

/**
 * Delete a user
 * @param {string} userId - The user ID to delete
 */
export async function deleteUser(userId) {
    return handleUserOperation(
        async () => {
            const { users } = await createAdminClient();
            return await users.delete(userId);
        },
        `Failed to delete user with ID ${userId}`
    );
}

/**
 * Update user account status
 * @param {string} userId - The user ID
 * @param {boolean} isActive - Whether to activate or deactivate
 */
const updateUserStatus = async (userId, isActive) => {
    return handleUserOperation(
        async () => {
            const { users } = await createAdminClient();
            return await users.updateStatus(userId, isActive);
        },
        `Failed to ${isActive ? 'activate' : 'deactivate'} user with ID ${userId}`
    );
};

/**
 * Deactivate a user account
 * @param {string} userId - The user ID to deactivate
 */
export async function deactivateUser(userId) {
    return updateUserStatus(userId, false);
}

/**
 * Activate a user account
 * @param {string} userId - The user ID to activate
 */
export async function activateUser(userId) {
    return updateUserStatus(userId, true);
}

/**
 * Update a user's phone number
 * @param {string} userId - The user ID
 * @param {string} phoneNum - The new phone number
 */
export async function updatePhone(userId, phoneNum) {
    return handleUserOperation(
        async () => {
            const { users } = await createAdminClient();
            return await users.updatePhone(userId, phoneNum);
        },
        `Failed to update phone for user with ID ${userId}`
    );
}

/**
 * Update a user's password
 * @param {string} userId - The user ID
 * @param {string} newPassword - The new password
 */
export async function updatePassword(userId, newPassword) {
    return handleUserOperation(
        async () => {
            const { users } = await createAdminClient();
            return await users.updatePassword(userId, newPassword);
        },
        `Failed to update password for user with ID ${userId}`
    );
}

/**
 * Update a user's name
 * @param {string} userId - The user ID
 * @param {string} newName - The new name
 */
export async function updateName(userId, newName) {
    return handleUserOperation(
        async () => {
            const { users } = await createAdminClient();
            return await users.updateName(userId, newName);
        },
        `Failed to update name for user with ID ${userId}`
    );
}

/**
 * Get a user's active sessions
 * @param {string} userId - The user ID
 */
export async function getUserSessions(userId) {
    return handleUserOperation(
        async () => {
            const { users } = await createAdminClient();
            return await users.listSessions(userId);
        },
        `Failed to fetch sessions for user with ID ${userId}`
    );
}

/**
 * Delete all sessions for a user
 * @param {string} userId - The user ID
 */
export async function deleteUserSessions(userId) {
    return handleUserOperation(
        async () => {
            const { users } = await createAdminClient();
            return await users.deleteSessions(userId);
        },
        `Failed to delete sessions for user with ID ${userId}`
    );
}

/**
 * Delete a specific session for a user
 * @param {string} userId - The user ID
 * @param {string} sessionId - The session ID to delete
 */
export async function deleteUserSession(userId, sessionId) {
    return handleUserOperation(
        async () => {
            const { users } = await createAdminClient();
            return await users.deleteSession(userId, sessionId);
        },
        `Failed to delete session ${sessionId} for user with ID ${userId}`
    );
}

/**
 * Get a user's team memberships
 * @param {string} userId - The user ID
 */
export async function getUserMemberships(userId) {
    return handleUserOperation(
        async () => {
            const { users } = await createAdminClient();
            return await users.listMemberships(userId);
        },
        `Failed to fetch memberships for user with ID ${userId}`
    );
}

/**
 * Get a user's preferences
 * @param {string} userId - The user ID
 */
export async function getPrefs(userId) {
    return handleUserOperation(
        async () => {
            const { users } = await createAdminClient();
            return await users.getPrefs(userId);
        },
        `Failed to fetch preferences for user with ID ${userId}`
    );
}

/**
 * Update a user's preferences by merging new values with existing ones
 * @param {string} userId - The user ID
 * @param {Object} newPreferences - The new preferences to merge with existing ones
 */
export async function updatePrefs(userId, newPreferences) {
    return handleUserOperation(
        async () => {
            const { users } = await createAdminClient();

            // First, get the current preferences
            const currentPrefs = await users.getPrefs(userId);

            // Merge current preferences with new ones
            // This ensures we don't lose existing preferences when updating
            const mergedPreferences = {
                ...currentPrefs,
                ...newPreferences
            };

            // Update with the merged preferences
            return await users.updatePrefs(userId, mergedPreferences);
        },
        `Failed to update preferences for user with ID ${userId}`
    );
}

/**
 * Replace all user preferences with a completely new set
 * @param {string} userId - The user ID
 * @param {Object} newPreferences - The complete new preferences object to replace existing ones
 */
export async function replacePrefs(userId, newPreferences) {
    return handleUserOperation(
        async () => {
            const { users } = await createAdminClient();
            return await users.updatePrefs(userId, newPreferences);
        },
        `Failed to replace preferences for user with ID ${userId}`
    );
}



/**
 * Get a user ID by email address (case insensitive)
 * @param {string} email - The email to search for
 */
export async function getUserIdByEmail(email) {
    return handleUserOperation(
        async () => {
            const { users } = await createAdminClient();

            // Option 1: If your SDK/database supports case-insensitive queries
            const response = await users.list([
                // Some SDKs have case-insensitive query options
                Query.equal('email', email.toLowerCase())
            ]);

            // Option 2: If case-insensitive queries aren't supported, fetch and filter
            if (response.total === 0) {
                // Fallback to manual filtering
                const allUsers = await users.list();
                const matchingUser = allUsers.users.find(
                    user => user.email.toLowerCase() === email.toLowerCase()
                );

                if (!matchingUser) {
                    throw new Error(`No user found with email: ${email}`);
                }

                return matchingUser.$id;
            }

            return response.users[0].$id;
        },
        `Failed to find user ID for email ${email}`
    );
}





/**
 * Get all user header data in a single optimized request
 * @returns {Object} Combined header data including login status, user details, cart, and theme preference
 */
export async function getUserHeaderData() {
    // Default response for unauthenticated users
    const defaultResponse = {
        success: true,
        isLoggedIn: false,
        cartItemCount: 0,
        userId: null,
        userName: null,
        isInAdminTeam: false,
        isInSuperAdminTeam: false,
        userTheme: null,
        chatUserData: null
    };

    try {
        // Check for session first
        const sessionResponse = await getUserSessionFromCookie();

        if (!sessionResponse.success) {
            return defaultResponse;
        }

        const userId = sessionResponse.session.userId;

        // Fetch all data in parallel
        const [userData, teamsData, cartCount] = await Promise.all([
            getUser(userId),
            getUserMemberships(userId),
            getCartItemCount(userId)
        ]);

        if (!userData.success) {
            return defaultResponse;
        }

        // Process team membership
        const userTeams = teamsData.data.memberships;
        const isInSuperAdminTeam = userTeams.some(team => team.teamId === 'super_admin');
        const isInAdminTeam = isInSuperAdminTeam || userTeams.some(team => team.teamId === 'admin');

        // Get user name with fallbacks
        const userName = (userData.data.prefs?.firstName && userData.data.prefs.firstName !== "")
            ? userData.data.prefs.firstName
            : userData.data.name || userData.data.email;

        // Extract theme from user preferences
        let userTheme = null;
        const themePreference = userData.data.prefs?.themeColor;

        // Normalize theme name if present (to lowercase for ThemeProvider)
        if (themePreference && ["Light", "Dark", "System"].includes(themePreference)) {
            userTheme = themePreference.toLowerCase();
        }

        // Prepare chat user data if not in admin team
        let chatUserData = null;
        if (!isInAdminTeam) {
            chatUserData = {
                isLoggedIn: true,
                userId: userData.data.$id,
                userName: userName,
                userEmail: userData.data?.email || "",
                userPhone: userData.data?.phone || "",
                userCompany: userData.data?.prefs?.company || ""
            };
        }

        return {
            success: true,
            isLoggedIn: true,
            userId: userData.data.$id,
            userName: userName,
            cartItemCount: cartCount,
            isInAdminTeam: isInAdminTeam,
            isInSuperAdminTeam: isInSuperAdminTeam,
            userTheme: userTheme,
            chatUserData: chatUserData
        };
    } catch (error) {
        console.error("Error fetching header data:", error);
        return {
            ...defaultResponse,
            success: false,
            error: error.message
        };
    }
}


/**
 * Adds a new user through admin interface
 * 
 * @param {Object} userData - User data
 * @param {string} userData.email - User email (required)
 * @param {string} userData.password - User password (required)
 * @param {string} userData.firstName - First name (required)
 * @param {string} userData.lastName - Last name (required)
 * @param {string} userData.team - Team ID to add user to (required)
 * @param {string} userData.company - Company name (optional, derived from email)
 * @param {string} userData.domain - Company domain (optional, derived from email)
 * @returns {Promise<Object>} - Result of the operation
 */
export async function addUserByAdmin(userData) {
    return handleUserOperation(
        async () => {
            // Validate required fields
            if (!userData.email || !userData.password || !userData.firstName || !userData.lastName) {
                throw new Error("Missing required fields: email, password, firstName, and lastName are required");
            }

            const { account, users } = await createAdminClient();
            const userId = ID.unique();

            // Generate full name
            const name = `${userData.firstName} ${userData.lastName}`;

            // Extract domain from email if not provided
            const emailDomain = userData.domain || userData.email.split('@')[1].toLowerCase();
            const isPersonalEmail = ['gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'icloud.com', 'protonmail.com', 'aol.com', 'zoho.com', 'yandex.com', 'mail.com'].includes(emailDomain);

            // Handle company name formatting (similar to registerUser)
            let companyName, teamName, teamId, role;

            if (isPersonalEmail) {
                companyName = "Individual";
                teamName = "Individual";
                teamId = "individual";
                role = "individual";
            } else {
                // Format company name from domain (e.g., "example.com" → "Example")
                const formattedCompanyName = userData.company.split('.')[0].charAt(0).toUpperCase() + emailDomain.split('.')[0].slice(1) || emailDomain.split('.')[0].charAt(0).toUpperCase() + emailDomain.split('.')[0].slice(1);
                companyName = formattedCompanyName;
                teamName = formattedCompanyName;
                teamId = `com_${emailDomain.replace(/\./g, '_')}`;
                role = "member";
            }

            // Create the user account
            const newUser = await account.create(
                userId,
                userData.email,
                userData.password,
                name
            );

            // Create Stripe customer if function exists
            let stripeCustomerId = '';
            // try {
            //     const stripeResponse = await createCustomer(userData.email, name, {
            //         uid: newUser.$id,
            //     });

            //     if (stripeResponse.success) {
            //         stripeCustomerId = stripeResponse.data || '';
            //     }
            // } catch (error) {
            //     // Log but don't fail if Stripe customer creation fails
            //     console.error("Failed to create Stripe customer:", error);
            // }

            // Set user preferences
            const preferences = {
                firstName: userData.firstName,
                lastName: userData.lastName,
                company: companyName,
                domain: emailDomain,
                stripeCustomerId: stripeCustomerId,
                notificationEmails: "True",
                notificationsPush: "True",
                notificationsMarketingEmail: "True",
                notificationsTipsEmail: "True",
                themeColor: "System",
                SSO: "" // Admin-created users don't use SSO
            };

            await updatePrefs(newUser?.$id, preferences);

            // Add user to visitor team (like in registerUser)
            const visitorTeamId = process.env.CMS_TEAM_ID_VISITOR;
            if (!visitorTeamId) {
                throw new Error("VISITOR_TEAM_ID is not set in environment variables.");
            }
            await addToTeam(visitorTeamId, newUser.$id, userData.email, userData.hostURL);

            // Create or add user to their appropriate team (company or individual)
            const teamResult = await setupUserCompanyTeam(teamId, teamName, newUser.$id, userData.email, userData.hostURL, role, emailDomain);
            if (!teamResult.success) {
                console.warn(`Team setup warning: ${teamResult.message}`);
                // Continue with registration even if team setup has issues
            }

            // Add user to additional specified team if provided
            if (userData.team && userData.team !== teamId) {
                try {
                    await addToTeam(userData.team, newUser.$id, userData.email, userData.hostURL, [`${userData.team}`]);
                } catch (teamError) {
                    console.error("Failed to add user to additional team:", teamError);
                    // Don't fail the entire operation if additional team assignment fails
                }
            }

            // Verify user's email automatically (since admin is creating it)
            await users.updateEmailVerification(newUser.$id, true);

            return {
                userId: newUser.$id,
                name,
                email: userData.email,
                firstName: userData.firstName,
                lastName: userData.lastName,
                company: companyName,
                domain: emailDomain
            };
        },
        `Failed to add user: ${userData.email}`
    );
}