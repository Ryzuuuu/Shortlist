/**
 * proxy.ts — Next.js 16 route proxy (replaces middleware.ts).
 *
 * Responsibility: redirect unauthenticated users to /login for protected routes.
 * Role-specific enforcement (e.g. client cannot access /recruiter) is done inside
 * each Route Handler / Server Action via can(), NOT here — per Next.js guidance
 * to not rely solely on proxy for auth (see proxy.md in Next.js docs).
 *
 * NOTE: The proxy runs for every matched request. We keep it lightweight —
 * only check for the Better Auth session cookie existence. Full session
 * validation happens in the route handlers.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/** Routes that require a session cookie to be present. */
const PROTECTED_PREFIXES = [
  '/recruiter',
  '/portal',
  '/delivery',
  '/api/recruiter',
  '/api/portal',
  '/api/delivery',
  '/api/candidates',
  '/api/requisitions',
  '/api/upload',
]

/** The Better Auth session cookie name (default). */
const SESSION_COOKIE = 'better-auth.session_token'

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix),
  )

  if (!isProtected) return NextResponse.next()

  // Check for session cookie presence (lightweight — full validation in handlers)
  const hasSession =
    request.cookies.has(SESSION_COOKIE) ||
    request.cookies.has('__Secure-' + SESSION_COOKIE)

  if (!hasSession) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('from', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (static files)
     * - _next/image (image optimisation)
     * - favicon.ico, public assets
     * - /api/auth (Better Auth's own endpoints — must be public)
     */
    '/((?!_next/static|_next/image|favicon.ico|api/auth).*)',
  ],
}
