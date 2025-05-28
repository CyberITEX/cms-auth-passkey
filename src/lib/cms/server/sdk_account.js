// src\lib\cms\server\sdk_account.js
"use server";
import { verifyRecaptchaToken } from '@/lib/recaptcha/server';

import { createAdminClient, createClient, createSessionClient, ID } from './sdk_client';
import { updatePrefs } from "./sdk_users";
import { addToTeam, setupUserCompanyTeam } from "./sdk_teams";
import { createCustomer } from "@/lib/stripe/server/customers";

/**
 * Handles API operations with standardized error handling
 */
async function handleOperation(operation, errorContext) {
    try {
        const result = await operation();
        return {
            success: true,
            data: result,
            total: Array.isArray(result) ? result.length : result?.total
        };
    } catch (error) {
        console.error(`${errorContext}:`, error);
        return {
            success: false,
            message: error.message || errorContext
        };
    }
}


export async function registerUser({
    email, // Required parameter
    password,
    hostURL, // Required parameter
    userId = ID.unique(),
    name = "",
    recaptchaToken
}) {
    // Handle reCAPTCHA verification if token is provided and in production
    if (recaptchaToken && process.env.NODE_ENV === 'production') {
        try {
            const verification = await verifyRecaptchaToken(recaptchaToken, 'register');
            if (!verification.success && !verification.fallback) {
                console.error('reCAPTCHA verification failed');
                return {
                    success: false,
                    message: 'Security verification failed. Please try again.'
                };
            }
        } catch (recaptchaError) {
            console.error('reCAPTCHA verification error:', recaptchaError);
            return {
                success: false,
                message: 'Security verification error. Please try again.'
            };
        }
    }

    return handleOperation(async () => {
        const { account } = await createAdminClient();

        try {
            // Create user account (only for email/password flow)
            let newUser;
            if (email && password) {
                newUser = await account.create(userId, email, password);
            } else {
                // For SSO flow, get existing user
                newUser = { $id: userId };
            }

            // Create Stripe customer - use name if available, otherwise default to username
            const username = email.split("@")[0].toLowerCase();
            const customerName = name || username;
            const stripeResponse = await createCustomer(email, customerName, {
                uid: newUser.$id,
            });

            const emailDomain = email.split("@")[1].toLowerCase();
            const isPersonalEmail = ['gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'icloud.com', 'protonmail.com', 'aol.com', 'zoho.com', 'yandex.com', 'mail.com'].includes(emailDomain);

            // Handle company name formatting
            let companyName, teamName, teamId, role;

            if (isPersonalEmail) {
                companyName = "Individual";
                teamName = "Individual";
                teamId = "individual";
                role = "individual";
            } else {
                // Format company name from domain (e.g., "example.com" → "Example")
                const formattedCompanyName = emailDomain.split('.')[0].charAt(0).toUpperCase() + emailDomain.split('.')[0].slice(1);
                companyName = formattedCompanyName; // Keep the original domain as the company identifier
                teamName = formattedCompanyName; // Use formatted name for the team
                teamId = `com_${emailDomain.replace(/\./g, '_')}`;
                role = "member";
            }

            // Set user preferences
            const preferences = {
                firstName: name?.split(" ")[0] || "",
                lastName: name?.split(" ")[1] || "",
                company: companyName,
                domain: emailDomain,
                stripeCustomerId: stripeResponse.data,
                notificationEmails: "True",
                notificationsPush: "True",
                notificationsMarketingEmail: "True",
                notificationsTipsEmail: "True",
                themeColor: "System",
                SSO: password ? "" : "True" // Track if user registered via SSO
            };
            await updatePrefs(newUser.$id, preferences);

            // Add user to visitor team
            const visitorTeamId = process.env.CMS_TEAM_ID_VISITOR;
            if (!visitorTeamId) {
                throw new Error("VISITOR_TEAM_ID is not set in environment variables.");
            }
            await addToTeam(visitorTeamId, newUser.$id, email, hostURL);

            // Create or add user to their appropriate team (company or individual)
            const teamResult = await setupUserCompanyTeam(teamId, teamName, newUser.$id, email, hostURL, role, emailDomain);
            if (!teamResult.success) {
                console.warn(`Team setup warning: ${teamResult.message}`);
                // Continue with registration even if team setup has issues
            }

            return newUser;
        } catch (error) {
            // Handle specific error cases with more user-friendly messages
            if (error.message.includes("A user with the same email already exists")) {
                throw new Error("This email is already registered. Please sign in instead or use a different email address.");
            } else if (error.message.includes("A user with the same")) {
                throw new Error("An account with these credentials already exists. Please sign in or use different credentials.");
            }
            throw error;
        }
    }, `Failed to register user [${email}]`);
}


/**
 * Initiates the password recovery process
 * @param {string} email - User's email address
 * @param {string} hostURL - Base URL for recovery link
 * @param {string} recaptchaToken - Optional reCAPTCHA token for verification
 * @returns {Promise<object>} Result of the operation
 */
export const requestPasswordRecovery = async (email, hostURL, recaptchaToken) => {
    // Handle reCAPTCHA verification if token is provided and in production
    if (recaptchaToken && process.env.NODE_ENV === 'production') {
        try {
            const verification = await verifyRecaptchaToken(recaptchaToken, 'password_reset');
            if (!verification.success && !verification.fallback) {
                console.error('reCAPTCHA verification failed');
                return {
                    success: false,
                    message: 'Security verification failed. Please try again.'
                };
            }
        } catch (recaptchaError) {
            console.error('reCAPTCHA verification error:', recaptchaError);
            return {
                success: false,
                message: 'Security verification error. Please try again.'
            };
        }
    }

    return handleOperation(
        async () => {
            const { account } = await createClient();
            return account.createRecovery(
                email,
                `${hostURL}/reset-password`
            );
        },
        "Failed to initiate password recovery"
    );
};

export const completePasswordReset = async (userId, secret, password) => {
    return handleOperation(
        async () => {
            const { account } = await createSessionClient(secret);
            return account.updateRecovery(userId, secret, password);
        },
        "Failed to complete password reset"
    );
};