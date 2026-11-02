import { createAuthClient } from 'better-auth/client'

/**
 * Better Auth browser client.
 * Used in Client Components for sign-in, sign-out, and session access.
 */
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
})
