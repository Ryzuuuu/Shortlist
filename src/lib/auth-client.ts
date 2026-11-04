import { createAuthClient } from 'better-auth/client'

/**
 * Better Auth browser client.
 * Used in Client Components for sign-in, sign-out, and session access.
 */
export const authClient = createAuthClient({
  // Unset means "the origin serving this page", which is right for local, preview and production alike.
  baseURL: process.env.NEXT_PUBLIC_APP_URL || undefined,
})
