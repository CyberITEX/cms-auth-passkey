// src/lib/recaptcha/index.js

// Re-export all functions from client and server modules
export * from './client';
export * from './server';

// Define common action constants
export const RECAPTCHA_ACTIONS = {
  LOGIN: 'login',
  REGISTER: 'register',
  PASSWORD_RESET: 'password_reset',
  EMAIL_SECURITY_ASSESSMENT: 'email_security_assessment',
  CONTACT_FORM: 'contact_form'
};

