import { NextResponse } from 'next/server';
import { getUserSessionFromCookie } from '@/lib/cms/server/sdk_users';

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  // Since the matcher ensures this middleware only runs for /account routes,
  // we can proceed directly with authentication checks.

  try {
    // getUserSessionFromCookie handles:
    // 1. Retrieving the cookie
    // 2. Local JWT verification (decryption, signature, claims)
    // 3. Server-side check: Verifies if the session ID from JWT is still active on Appwrite
    // 4. Deletes cookie if session is invalid server-side or JWT is invalid
    const sessionCheck = await getUserSessionFromCookie();

    if (sessionCheck.success && sessionCheck.session) {
      // Session is valid both locally (JWT) and on the server
      return NextResponse.next();
    } else {
      // Session is invalid (e.g., JWT invalid, or session not found/active on server)
      // getUserSessionFromCookie might have already deleted the cookie if invalid.
      console.warn('Middleware: Session validation failed or session not active.', sessionCheck.message);
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('next', pathname);
      loginUrl.searchParams.set('error', 'session_invalid_or_expired');
      return NextResponse.redirect(loginUrl);
    }
  } catch (error) { // Catch any unexpected errors from getUserSessionFromCookie itself
    console.error('Middleware: Unexpected error during session validation:', error.message);
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    loginUrl.searchParams.set('error', 'session_check_failed');
    return NextResponse.redirect(loginUrl);
  }
}

export const config = {
  matcher: ['/account/:path*'], // Only apply middleware to /account and its sub-paths
};