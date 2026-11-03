import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { db } from '@/db'
import * as schema from '@/db/schema'
import type { Role } from '@shortlist/core/policy'

/**
 * Better Auth configuration — Shortlist.
 *
 * Auth strategy: email + password only (ASSUMPTION A5 — no magic link, no OAuth).
 *
 * The `users` table is owned by Better Auth and extended with two fields:
 *   • role     — server-side only; `input: false` prevents client injection
 *   • clientId — server-side only; set by admin/seed for client-role users
 *
 * Roles are assigned via the seed script or admin server actions only.
 * Sign-up always creates a 'recruiter' regardless of any role in the request body.
 */
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    /**
     * Map Better Auth's internal table names to our Drizzle schema objects.
     * Better Auth uses singular names internally; we use plural for clarity.
     */
    schema: {
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications,
    },
  }),

  emailAndPassword: {
    enabled: true,
    /**
     * Email verification is disabled — the staffing firm creates accounts
     * server-side (seed / admin action). There is no self-registration flow
     * exposed to end users.
     */
    requireEmailVerification: false,
  },

  session: {
    cookieCache: {
      enabled: true,
      maxAge: 60 * 60 * 24 * 7, // 7 days
    },
  },

  user: {
    additionalFields: {
      /**
       * `input: false` means Better Auth will NEVER read this field from the
       * sign-up / update request body. It can only be written server-side via
       * the DB adapter or databaseHooks.
       */
      role: {
        type: 'string',
        defaultValue: 'recruiter' satisfies Role,
        input: false, // ← role CANNOT be set by the client
        required: false,
      },
      /**
       * clientId is only meaningful for role='client' users.
       * Also server-side only.
       */
      clientId: {
        type: 'string',
        required: false,
        input: false, // ← clientId CANNOT be set by the client
      },
    },
  },

  /**
   * databaseHooks — defense-in-depth.
   * Even if `input: false` were somehow bypassed, this hook enforces the invariant:
   * a freshly created user always gets role='recruiter' and no clientId.
   * Admins set role/clientId via separate server actions after account creation.
   */
  databaseHooks: {
    user: {
      create: {
        before: async (user) => ({
          data: {
            ...user,
            role: 'recruiter' satisfies Role,
            clientId: null,
          },
        }),
      },
    },
  },

  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
})

/** Inferred session + user types (includes role and clientId). */
export type AuthSession = typeof auth.$Infer.Session
export type AuthUser = typeof auth.$Infer.Session.user

/**
 * Server-side session helper for Route Handlers and Server Actions.
 * Pass `headers` from the incoming request.
 *
 * @example
 * const session = await getSession(request.headers)
 * if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
 */
export async function getSession(
  headers: Headers,
): Promise<AuthSession | null> {
  return auth.api.getSession({ headers })
}

const ROLES: readonly Role[] = ['recruiter', 'client', 'delivery_head']

/**
 * Adapt a Better Auth user to the policy's PolicyUser. An unknown or missing
 * role yields null, which `can()` denies, so a bad row fails closed.
 */
export function toPolicyUser(user: AuthUser | null | undefined) {
  if (!user || !ROLES.includes(user.role as Role)) return null
  return { id: user.id, role: user.role as Role, clientId: user.clientId ?? null }
}
