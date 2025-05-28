"use server";

import { cookies, headers } from "next/headers";

/**
 * Determine the appropriate cookie domain based on the current request host
 * @returns {Promise<string|null>} The domain to use for cookies or null for localhost/IP
 */
export const getCookieDomain = async () => {
  try {
    const headersList = await headers();
    const host = headersList.get("host") || "";

    // Remove port if present
    const domain = host.split(":")[0];

    // Don't set domain for localhost or IP addresses
    if (domain === "localhost" || /^(\d{1,3}\.){3}\d{1,3}$/.test(domain)) {
      return null;
    }

    return domain;
  } catch (error) {
    console.error("Error determining cookie domain:", error);
    return null;
  }
};

/**
 * Get a cookie by name
 * @param {string} name - Name of the cookie to retrieve
 * @returns {Promise<Object>} Cookie value or error response
 */
export const getCookie = async (name) => {
  try {
    const cookieHandler = await cookies();
    const cookie = cookieHandler.get(name);

    return {
      success: true,
      data: cookie,
      exists: !!cookie
    };
  } catch (error) {
    console.error(`Error getting cookie ${name}:`, error);
    return {
      success: false,
      message: error.message || `Failed to get cookie ${name}`,
      exists: false
    };
  }
};

/**
 * Set a cookie with the given name and value
 * @param {string} name - Cookie name
 * @param {string} value - Cookie value
 * @param {Object} options - Optional cookie settings
 * @returns {Promise<Object>} Success or error response
 */
export const setCookie = async (name, value, cookieOptions = {}) => {
  try {
    const cookieHandler = await cookies();
    const domain = await getCookieDomain();
    
    const isCookieDomainEnabled = process.env.COOKIE_DOMAIN !== "False";

    if (domain && isCookieDomainEnabled) {
      cookieOptions.domain = domain;
    }

    cookieHandler.set(name, value, cookieOptions);

    return {
      success: true,
      message: `Cookie ${name} set successfully`
    };
  } catch (error) {
    console.error(`Error setting cookie ${name}:`, error);
    return {
      success: false,
      message: error.message || `Failed to set cookie ${name}`
    };
  }
};

/**
 * Delete a cookie by name
 * @param {string} name - Name of the cookie to delete
 * @returns {Promise<Object>} Success or error response
 */
export const deleteCookie = async (name = process.env.COOKIE_NAME) => {
  try {
    if (!name) {
      throw new Error("Cookie name not provided and COOKIE_NAME environment variable not set");
    }
    
    const cookieHandler = await cookies();
    
    // Check if the cookie exists before attempting to delete it
    const existingCookie = cookieHandler.get(name);
    if (!existingCookie) {
      return {
        success: true,
        message: `Cookie ${name} does not exist, nothing to delete`
      };
    }
    
    const domain = await getCookieDomain();
    const isCookieDomainEnabled = process.env.COOKIE_DOMAIN !== "False";
    
    // First set an expired cookie with the same path/domain
    const deleteOptions = {
      expires: new Date(0),
      path: "/"
    };
    
    if (domain && isCookieDomainEnabled) {
      deleteOptions.domain = domain;
    }
    
    // Set expired cookie then delete it
    cookieHandler.set(name, "", deleteOptions);
    cookieHandler.delete(name);

    return {
      success: true,
      message: `Cookie ${name} deleted successfully`
    };
  } catch (error) {
    // console.error(`Error deleting cookie ${name}:`, error);
    return {
      success: false,
      message: error.message || `Failed to delete cookie ${name}`
    };
  }
};