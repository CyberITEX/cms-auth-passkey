'use server';

import { SignJWT, jwtVerify, compactDecrypt, CompactEncrypt } from 'jose';
import { getUserMemberships, getUser } from './sdk_users';
import pako from 'pako';
import { setCookie, deleteCookie } from "./cookieService";

/**
 * Generates a signed and encrypted JWT token using `jose`
 * @param {Object} payload - The data to encode in the JWT
 * @param {number} expirationInSeconds - The expiration time for the token in seconds
 * @returns {Promise<string>} - The generated encrypted JWT token
 */
export const generateEncryptedJWT = async (payload, expirationInSeconds) => {
  if (!process.env.JWT_SIGNING_SECRET) {
    throw new Error('JWT_SIGNING_SECRET is not defined in environment variables');
  }

  if (!process.env.JWT_ENCRYPTION_SECRET) {
    throw new Error('JWT_ENCRYPTION_SECRET is not defined in environment variables');
  }

  const signingKey = new TextEncoder().encode(process.env.JWT_SIGNING_SECRET);
  const encryptionKey = new TextEncoder().encode(process.env.JWT_ENCRYPTION_SECRET);

  try {
    // Step 1: Sign the payload to create a JWS (Signed JWT)
    const signedToken = await new SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256' }) // HMAC SHA-256
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + expirationInSeconds)
      .setIssuer('cyberitex-admin')
      .setAudience('cyberitex-clients')
      .sign(signingKey);

    // Step 2: Compress the signed token if it's large (over 1KB)
    const signedTokenBytes = new TextEncoder().encode(signedToken);
    let bytesToEncrypt;

    // Only compress if the payload is large enough to benefit from compression
    if (signedTokenBytes.length > 1024) {
      try {
        const compressed = pako.deflate(signedTokenBytes);
        // Only use compression if it actually reduces size
        if (compressed.length < signedTokenBytes.length) {
          bytesToEncrypt = new Uint8Array([1, ...compressed]); // Prefix with 1 to indicate compression
        } else {
          bytesToEncrypt = new Uint8Array([0, ...signedTokenBytes]); // Prefix with 0 to indicate no compression
        }
      } catch (compressionError) {
        console.error('Compression failed, using uncompressed token');
        bytesToEncrypt = new Uint8Array([0, ...signedTokenBytes]); // Prefix with 0 to indicate no compression
      }
    } else {
      // Small payload, don't compress
      bytesToEncrypt = new Uint8Array([0, ...signedTokenBytes]); // Prefix with 0 to indicate no compression
    }

    // Step 3: Encrypt the (possibly compressed) signed JWT token
    const encryptedToken = await new CompactEncrypt(bytesToEncrypt)
      .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' }) // Symmetric encryption
      .encrypt(encryptionKey);

    return encryptedToken; // Return the encrypted JWE token
  } catch (error) {
    // Safer error logging that doesn't expose details in production
    if (process.env.NODE_ENV === 'development') {
      console.error('JWT generation error:', error.message);
    } else {
      console.error('JWT generation error occurred');
    }
    throw new Error(`Failed to generate encrypted JWT: ${process.env.NODE_ENV === 'development' ? error.message : 'See server logs'}`);
  }
};

/**
 * Verifies and decrypts an encrypted JWT token using `jose`
 * @param {string} token - The encrypted JWT token to verify and decode
 * @returns {Promise<Object>} - The decoded payload if the token is valid
 * @throws {Error} - If the token is invalid, expired, or decryption fails
 */
export const verifyJWT = async (token) => {
  if (!process.env.JWT_SIGNING_SECRET || !process.env.JWT_ENCRYPTION_SECRET) {
    throw new Error('JWT secrets are not defined in environment variables');
  }

  if (!token) {
    throw new Error('Token is not defined');
  }

  const signingKey = new TextEncoder().encode(process.env.JWT_SIGNING_SECRET);
  const encryptionKey = new TextEncoder().encode(process.env.JWT_ENCRYPTION_SECRET);

  try {
    // Step 1: Decrypt the encrypted token using compactDecrypt
    const { plaintext } = await compactDecrypt(token, encryptionKey);

    // Check if plaintext has data
    if (!plaintext || plaintext.length < 2) {
      throw new Error('Decrypted token is invalid or empty');
    }

    // Step 2: Check if the decrypted data is compressed (first byte is the flag)
    const compressionFlag = plaintext[0];
    let decodedData;

    if (compressionFlag === 1) {
      // Data is compressed, decompress it (skip the first byte)
      try {
        const compressedData = plaintext.slice(1);
        const decompressedData = pako.inflate(compressedData);
        decodedData = new TextDecoder().decode(decompressedData);
      } catch (decompressionError) {
        console.error('JWT decompression error:', process.env.NODE_ENV === 'development' ? decompressionError.message : '');
        throw new Error('Failed to decompress token');
      }
    } else {
      // Data is not compressed, just decode it (skip the first byte)
      decodedData = new TextDecoder().decode(plaintext.slice(1));
    }

    // Step 3: Verify the signed JWT with expected claims
    const { payload } = await jwtVerify(
      decodedData,
      signingKey,
      {
        issuer: 'cyberitex-admin',
        audience: 'cyberitex-clients'
      }
    );
    return payload;
  } catch (error) {
    // Safer error logging that doesn't expose details in production
    if (process.env.NODE_ENV === 'development') {
      console.error('JWT verification error:', error.message);
    } else {
      console.error('JWT verification error occurred');
    }
    throw new Error('Invalid or expired token');
  }
};

/**
 * Generates a JWT and sets it as a session cookie
 * @param {Object} session - The session data
 * @param {Object} options - Optional cookie options
 * @returns {Promise<Object>} Success or error response
 */
export const generateJWT = async (session, options = {}) => {
  try {
    const userData = await getUser(session.userId);
    const membershipsResponse = await getUserMemberships(session.userId);

    // Construct payload
    const userMemberships = membershipsResponse?.data?.memberships || [];
    const payload = {
      session,
      userId: session.userId,
      email: userData?.data?.email,
      teams: userMemberships.map((m) => ({
        teamId: m.teamId,
        teamName: m.teamName,
        roles: m.roles,
      })),
    };

    const currentTime = Math.floor(Date.now() / 1000);
    const sessionExpireTime = Math.floor(
      new Date(session.expire).getTime() / 1000
    );
    const expirationInSeconds = sessionExpireTime - currentTime;
    
    if (expirationInSeconds <= 0) {
      throw new Error(
        "Session expiration time is invalid or has already passed."
      );
    }

    // Generate a signed JWT
    const JWTToken = await generateEncryptedJWT(
      payload,
      expirationInSeconds
    );

    // Set cookie options
    const cookieOptions = {
      httpOnly: true,
      sameSite: "strict",
      expires: new Date(session.expire),
      path: "/",
      secure: process.env.NODE_ENV === "production",
      maxAge: expirationInSeconds,
      ...options
    };

    // Set the cookie
    const cookieResult = await setCookie(process.env.COOKIE_NAME, JWTToken, cookieOptions);
    
    return {
      success: cookieResult.success,
      message: cookieResult.message || 'JWT session established',
      token: process.env.NODE_ENV === 'development' ? JWTToken : undefined // Only return token in development
    };
  } catch (error) {
    console.error('Error generating JWT session:', error);
    return {
      success: false,
      message: error.message || 'Failed to generate JWT session'
    };
  }
};


export const generateJWTWEB = async (session, options = {}) => {
  try {
    const payload = {
      $id: session.$id,
      userId: session.userId,
    };

    const currentTime = Math.floor(Date.now() / 1000);
    const sessionExpireTime = Math.floor(
      new Date(session.expire).getTime() / 1000
    );
    const expirationInSeconds = sessionExpireTime - currentTime;
    
    if (expirationInSeconds <= 0) {
      throw new Error(
        "Session expiration time is invalid or has already passed."
      );
    }

    // Generate a signed JWT
    const JWTToken = await generateEncryptedJWT(
      payload,
      expirationInSeconds
    );

    // Set cookie options
    const cookieOptions = {
      httpOnly: true,
      sameSite: "strict",
      expires: new Date(session.expire),
      path: "/",
      secure: process.env.NODE_ENV === "production",
      maxAge: expirationInSeconds,
      ...options
    };

    // Set the cookie
    const cookieResult = await setCookie(process.env.COOKIE_NAME, JWTToken, cookieOptions);
    
    return {
      success: cookieResult.success,
      message: cookieResult.message || 'JWT session established',
      token: process.env.NODE_ENV === 'development' ? JWTToken : undefined // Only return token in development
    };
  } catch (error) {
    console.error('Error generating JWT session:', error);
    return {
      success: false,
      message: error.message || 'Failed to generate JWT session'
    };
  }
};

/**
 * Revoke the current JWT session
 * @returns {Promise<Object>} Success or error response
 */
export const revokeJWT = async () => {
  try {
    const result = await deleteCookie(process.env.COOKIE_NAME);
    return {
      success: result.success,
      message: result.message || 'JWT session revoked'
    };
  } catch (error) {
    console.error('Error revoking JWT session:', error);
    return {
      success: false,
      message: error.message || 'Failed to revoke JWT session'
    };
  }
};