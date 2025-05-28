// src\lib\recaptcha\client.js
"use client";

import { useEffect, useState, useCallback, useRef } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Loads the reCAPTCHA Enterprise script and initializes
 * Handles environment differences internally
 * @returns {Object} - reCAPTCHA client functions
 */
export function useRecaptcha() {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const scriptRef = useRef(null);
  const pathname = usePathname();
  const needsReinitialize = useRef(false);

  // Check environment
  const isProduction = process.env.NEXT_PUBLIC_NODE_ENV === 'production';

  // Cleanup function to remove the script without setting state
  const cleanup = useCallback(() => {
    if (scriptRef.current && document.head.contains(scriptRef.current)) {
      document.head.removeChild(scriptRef.current);
      scriptRef.current = null;
    }

    // Reset grecaptcha object reference
    if (window.grecaptcha) {
      window.grecaptcha = undefined;
    }

    // Instead of directly setting state, flag that we need reinitialization
    needsReinitialize.current = true;
  }, []);

  // Main effect for loading reCAPTCHA
  useEffect(() => {
    // In non-production, we just mark reCAPTCHA as "loaded"
    if (!isProduction) {
      if (!isLoaded) {
        setIsLoaded(true);
      }
      return;
    }

    // Check if we need to reinitialize or if we're already in the right state
    if (needsReinitialize.current) {
      setIsLoaded(false);
      setIsLoading(false);
      setError(null);
      needsReinitialize.current = false;
    }

    // Only proceed with loading if not already loaded/loading
    if (!isLoaded && !isLoading && !window.grecaptcha) {
      const loadRecaptcha = async () => {
        try {
          setIsLoading(true);

          // Check if we have a site key
          const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
          if (!siteKey) {
            throw new Error('reCAPTCHA site key is missing');
          }

          // console.log("Loading reCAPTCHA with site key:", siteKey);

          // Create script element
          const script = document.createElement('script');
          script.src = `https://www.google.com/recaptcha/enterprise.js?render=${siteKey}`;
          script.async = true;
          script.defer = true;
          script.id = 'recaptcha-script';
          scriptRef.current = script;

          // Use a simpler approach to script loading
          script.onload = () => {
            // console.log("reCAPTCHA script loaded successfully");

            // Check for grecaptcha
            if (window.grecaptcha && window.grecaptcha.enterprise) {
              // console.log("reCAPTCHA initialized successfully");
              setIsLoaded(true);
            } else {
              console.error('reCAPTCHA script loaded but grecaptcha object is not available');
              setError('reCAPTCHA object not available');
            }
            setIsLoading(false);
          };

          script.onerror = () => {
            console.error("reCAPTCHA script failed to load");
            setError('Failed to load reCAPTCHA script');
            setIsLoading(false);
          };

          // Add script to document
          document.head.appendChild(script);

        } catch (err) {
          console.error('Error loading reCAPTCHA:', err);
          setError(err.message);
          setIsLoading(false);
        }
      };

      loadRecaptcha();
    }

    // Run cleanup when component unmounts or URL changes
    return () => {
      // Only clean up DOM elements without setting state
      if (scriptRef.current && document.head.contains(scriptRef.current)) {
        document.head.removeChild(scriptRef.current);
        scriptRef.current = null;
      }

      if (window.grecaptcha) {
        window.grecaptcha = undefined;
      }
    };
  }, [isProduction, isLoaded, isLoading, pathname]);

  /**
   * Execute reCAPTCHA verification for a specific action
   * @param {string} action - The action name to verify
   * @returns {Promise<string>} - The reCAPTCHA token
   */
  const executeRecaptcha = useCallback(async (action) => {
    // For non-production, return a mock token
    if (!isProduction) {
      return 'dev-environment';
    }

    // If reCAPTCHA hasn't loaded, return a fallback token
    if (!isLoaded || !window.grecaptcha || !window.grecaptcha.enterprise) {
      console.warn('reCAPTCHA not available, returning fallback token');
      return 'recaptcha-unavailable';
    }

    try {
      const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
      // console.log(`Executing reCAPTCHA for action: ${action}`);

      const token = await window.grecaptcha.enterprise.execute(
        siteKey,
        { action }
      );

      // console.log('reCAPTCHA token obtained successfully');
      return token;
    } catch (err) {
      console.error('reCAPTCHA execution error:', err);
      // Return a fallback token instead of throwing
      return 'recaptcha-execution-failed';
    }
  }, [isLoaded, isProduction]);

  /**
   * Manually reset the reCAPTCHA state
   */
  const resetRecaptcha = useCallback(() => {
    cleanup();
    // Force a reset of states on next render
    needsReinitialize.current = true;
  }, [cleanup]);

  return {
    isLoaded,
    isLoading,
    error,
    executeRecaptcha,
    resetRecaptcha
  };
}


/**
 * Higher-order function that enhances form submission with reCAPTCHA verification
 * @param {Function} submitFn - The original form submission function
 * @param {string} action - The reCAPTCHA action name
 * @returns {Function} - Enhanced submission function with reCAPTCHA verification
 */
export function withRecaptcha(submitFn, action) {
  return async (...args) => {
    try {
      let token = 'recaptcha-unavailable';

      const isProduction = process.env.NEXT_PUBLIC_NODE_ENV === 'production';

      // Only attempt to get reCAPTCHA token in production
      if (isProduction && window.grecaptcha && window.grecaptcha.enterprise) {
        try {
          token = await window.grecaptcha.enterprise.execute(
            process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY,
            { action }
          );
          // console.log('reCAPTCHA token obtained successfully');
        } catch (recaptchaErr) {
          console.warn('reCAPTCHA execution failed:', recaptchaErr);
        }
      } else {
        token = 'dev-environment';
      }

      // Add token to the last argument if it's an object (usually event)
      const lastArg = args[args.length - 1];
      if (lastArg && typeof lastArg === 'object') {
        lastArg.recaptchaToken = token;
      }

      // Call the original submit function with the arguments
      return await submitFn(...args);
    } catch (err) {
      console.error('Form submission failed:', err);
      throw err; // Rethrow to let the caller handle it
    }
  };
}