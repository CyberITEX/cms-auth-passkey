"use server";

import { createAdminClient } from './sdk_client';

/**
 * Standardized error handler for team management functions
 * @param {Function} operation - Async function to execute
 * @param {string} errorMessage - Default error message
 */
const handleTeamOperation = async (operation, errorMessage) => {
    try {
        const response = await operation();
        return {
            success: true,
            data: response.teams || response.team || response.memberships || response,
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
 * List all teams
 */
export const listTeams = async (queries = [], search) => {
    return handleTeamOperation(
        async () => {
            const { teams } = await createAdminClient();
            const result = await teams.list(queries, search);
            return result;
        },
        "Failed to list teams"
    );
};

/**
 * Create a new team
 * @param {string} teamId - Unique ID for the team
 * @param {string} teamName - Name of the team
 */
export const createTeam = async (teamId, teamName) => {
    return handleTeamOperation(
        async () => {
            const { teams } = await createAdminClient();

            // Check if team exists
            try {
                const existingTeam = await teams.get(teamId);
                // console.log(`Team '${teamName}' already exists.`);
                return existingTeam;
            } catch (error) {
                if (error.code === 404) {
                    // Create team if it doesn't exist
                    return await teams.create(teamId, teamName);
                }
                throw error;
            }
        },
        `Failed to create team '${teamName}'`
    );
};

/**
 * Get a team's details
 * @param {string} teamId - ID of the team to retrieve
 */
export const getTeam = async (teamId) => {
    return handleTeamOperation(
        async () => {
            const { teams } = await createAdminClient();
            return await teams.get(teamId);
        },
        "Failed to get team details"
    );
};

/**
 * Update a team's name
 * @param {string} teamId - ID of the team to update
 * @param {string} name - New name for the team
 */
export const updateTeamName = async (teamId, name) => {
    return handleTeamOperation(
        async () => {
            const { teams } = await createAdminClient();
            return await teams.updateName(teamId, name);
        },
        "Failed to update team name"
    );
};

/**
 * Delete a team
 * @param {string} teamId - ID of the team to delete
 */
export const deleteTeam = async (teamId) => {
    return handleTeamOperation(
        async () => {
            const { teams } = await createAdminClient();
            await teams.delete(teamId);
            return { message: "Team deleted successfully" };
        },
        "Failed to delete team"
    );
};

/**
 * List all memberships in a team
 * @param {string} teamId - ID of the team
 */
export const listTeamMemberships = async (teamId, queries = [], search) => {
    return handleTeamOperation(
        async () => {
            const { teams } = await createAdminClient();
            const result = await teams.listMemberships(teamId, queries, search);
            return result;
        },
        "Failed to list team memberships"
    );
};

/**
 * Sanitize role name to meet requirements
 * @param {string} roleName - Role name to sanitize
 */
const sanitizeRoleName = (roleName) => {
    // Remove invalid characters
    let sanitized = roleName.replace(/[^a-zA-Z0-9._-]/g, "");
    // Trim to 36 characters
    sanitized = sanitized.substring(0, 36);
    // Ensure it doesn't start with a special character
    if (/^[._-]/.test(sanitized)) {
        sanitized = "role" + sanitized;
    }
    return sanitized;
};

/**
 * Create a team membership
 * @param {string} teamId - ID of the team
 * @param {string} email - Email of the new member
 * @param {Array<string>} roles - Roles to assign to the member
 * @param {string} url - Redirect URL for the invitation
 */
export const createTeamMembership = async (teamId, email, roles, url) => {
    return handleTeamOperation(
        async () => {
            const { teams } = await createAdminClient();
            return await teams.createMembership(
                teamId,
                roles,
                email,
                undefined,
                undefined,
                url
            );
        },
        "Failed to create team membership"
    );
};

/**
 * Get a team membership
 * @param {string} teamId - ID of the team
 * @param {string} membershipId - ID of the membership to retrieve
 */
export const getTeamMembership = async (teamId, membershipId) => {
    return handleTeamOperation(
        async () => {
            const { teams } = await createAdminClient();
            return await teams.getMembership(teamId, membershipId);
        },
        "Failed to get team membership details"
    );
};

/**
 * Update a membership's roles
 * @param {string} teamId - ID of the team
 * @param {string} membershipId - ID of the membership to update
 * @param {Array<string>} roles - New roles to assign to the member
 */
export const updateMembership = async (teamId, membershipId, roles) => {
    return handleTeamOperation(
        async () => {
            const { teams } = await createAdminClient();
            return await teams.updateMembershipRoles(
                teamId,
                membershipId,
                roles
            );
        },
        "Failed to update membership roles"
    );
};

/**
 * Delete a team membership
 * @param {string} teamId - ID of the team
 * @param {string} membershipId - ID of the membership to delete
 */
export const deleteTeamMembership = async (teamId, membershipId) => {
    return handleTeamOperation(
        async () => {
            const { teams } = await createAdminClient();
            await teams.deleteMembership(teamId, membershipId);
            return { message: "Team membership deleted successfully" };
        },
        "Failed to delete team membership"
    );
};

/**
 * Get team preferences
 * @param {string} teamId - ID of the team
 */
export const getTeamPreferences = async (teamId) => {
    return handleTeamOperation(
        async () => {
            const { teams } = await createAdminClient();
            const result = await teams.getPrefs(teamId);
            return result.prefs;
        },
        "Failed to get team preferences"
    );
};

/**
 * Update team preferences
 * @param {string} teamId - ID of the team
 * @param {Object} prefs - Preferences to update
 */
export const updateTeamPreferences = async (teamId, prefs) => {
    return handleTeamOperation(
        async () => {
            const { teams } = await createAdminClient();
            const result = await teams.updatePrefs(teamId, prefs);
            return result;
        },
        "Failed to update team preferences"
    );
};

/**
 * Create team memberships for a user across multiple teams
 * @param {Array<string>} teamsArray - Array of teams in format "teamId|teamName"
 * @param {string} name - User's name
 * @param {string} email - User's email
 * @param {string} phone - User's phone
 * @param {string} userID - User's ID
 */
export const createMultiTeamMembership = async (
    teamsArray,
    name,
    email,
    phone,
    userID
) => {
    return handleTeamOperation(
        async () => {
            const { teams } = await createAdminClient();
            const results = [];

            for (const team of teamsArray) {
                const [teamID, teamName] = team.split("|");
                const sanitizedTeamName = sanitizeRoleName(teamName);

                try {
                    const result = await teams.createMembership(
                        teamID,
                        [sanitizedTeamName],
                        email
                    );
                    results.push(result);
                } catch (error) {
                    console.error(
                        `Error creating team membership for team ${teamName}:`,
                        error.message
                    );
                }
            }
            return results;
        },
        "Failed to create multiple team memberships"
    );
};

/**
 * Add a user to a team (creates the team if it doesn't exist)
 * @param {string} teamId - ID of the team
 * @param {string} userId - ID of the user
 * @param {string} email - User's email
 * @param {string} hostURL - Host URL for confirmation
 * @param {Array<string>} roles - Roles to assign to the user
 */
export const addToTeam = async (teamId, userId, email, hostURL, roles = ["visitor"]) => {
    return handleTeamOperation(
        async () => {
            if (!teamId || !userId || !email || !hostURL) {
                throw new Error("Missing required parameters: teamId, userId, email, and hostURL are required");
            }

            const { teams } = await createAdminClient();
            const confirmationUrl = `${hostURL}/account/confirm`;

            // Try to create team (will fail silently if already exists)
            try {
                await teams.get(teamId);
            } catch (error) {
                if (error.code === 404) {
                    await teams.create(teamId, "Visitor");
                }
            }

            // Add user to team
            return await teams.createMembership(
                teamId,
                roles,
                email,
                userId,
                undefined,
                confirmationUrl
            );
        },
        "Failed to add user to team"
    );
};



/**
 * Creates a company or individual team if it doesn't exist and adds the user to it
 * @param {string} teamId - Team ID
 * @param {string} teamName - Team display name
 * @param {string} userId - User ID
 * @param {string} email - User email
 * @param {string} hostURL - Host URL for confirmation
 * @param {string} role - User role in the team
 * @returns {Promise<object>} Result of the operation
 */
export async function setupUserCompanyTeam(teamId, teamName, userId, email, hostURL, role, domain) {
    try {
        // First try to get the team to see if it exists
        const teamResult = await getTeam(teamId);

        // If team doesn't exist, create it
        if (!teamResult.success) {
            const teamRes = await createTeam(teamId, teamName);
            if (teamRes.success) {
                const prefs = {
                    domain: domain,
                    industry: "",
                    address: "",
                    city: "",
                    zipcode: "",
                    state: "",
                    country: "",
                    website: "",
                    contacts: JSON.stringify([{}])
                }
                await updateTeamPreferences(teamId, prefs);
            }

        }

        // Add the user to the team with the specified role
        const membershipResult = await addToTeam(teamId, userId, email, hostURL, [role]);

        return {
            success: true,
            data: membershipResult.data,
            message: `User added to ${teamName} team`
        };
    } catch (error) {
        console.error(`Failed to setup team ${teamName}:`, error);
        return {
            success: false,
            message: `Failed to setup team: ${error.message}`
        };
    }
}
