/**
 * packages/core/src/policy.ts
 *
 * The single authorisation function for Shortlist.
 * Used by EVERY API route and server action — never bypassed.
 *
 * Design:
 *  • Pure TypeScript — no framework, DB, or network imports.
 *  • can(user, action, resource) → boolean
 *  • null/undefined user → always false (unauthenticated).
 *  • delivery_head → full access.
 *  • recruiter → read/write candidates & requisitions; cannot access insights.
 *  • client → read-only on their own client's submissions; masked contacts
 *    until shortlisted (enforced in the query layer, not here).
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type Role = 'recruiter' | 'client' | 'delivery_head'

/**
 * Minimal user shape required by the policy — matches AuthUser from auth.ts
 * without importing anything from Next.js or Better Auth.
 */
export interface PolicyUser {
  id: string
  role: Role
  /** Non-null only for role='client' users. */
  clientId?: string | null
}

/**
 * All actions that require authorisation in the system.
 */
export type PolicyAction =
  // Candidate lifecycle
  | 'candidate:read'
  | 'candidate:write'
  | 'candidate:delete'
  | 'candidate:submit' // recruiter submits to client
  | 'candidate:view_cv' // opens the CV panel → sets viewedByRecruiterAt
  | 'candidate:retry_upload'
  // Submissions / portal
  | 'submission:read'
  | 'submission:feedback' // client shortlists / rejects / proposes slot
  // Requisitions
  | 'requisition:read'
  | 'requisition:write'
  // File upload
  | 'upload:create'
  // Delivery head only
  | 'insights:read'
  | 'report:export'
  // Admin / user management (delivery_head only)
  | 'user:write'

/**
 * The resource being accessed. `owningClientId` is the client organisation
 * that owns the resource (e.g., the client a requisition belongs to).
 * Pass null/undefined when the resource has no client owner (e.g., insights).
 */
export interface PolicyResource {
  type:
    | 'candidate'
    | 'submission'
    | 'requisition'
    | 'upload'
    | 'insights'
    | 'report'
    | 'user'
  /**
   * The client organisation this resource belongs to.
   * Required for client-role authorisation checks.
   */
  owningClientId?: string | null
}

// ─── Permission tables ────────────────────────────────────────────────────────

/**
 * Actions that recruiter may perform (regardless of owningClientId).
 * Recruiters work across all clients.
 */
const RECRUITER_ALLOWED = new Set<PolicyAction>([
  'candidate:read',
  'candidate:write',
  'candidate:delete',
  'candidate:submit',
  'candidate:view_cv',
  'candidate:retry_upload',
  'submission:read',
  'requisition:read',
  'requisition:write',
  'upload:create',
])

/**
 * Actions that a client user may perform — subject to owningClientId check.
 * Clients are read-only on their own submissions; they cannot write candidates.
 */
const CLIENT_ALLOWED = new Set<PolicyAction>([
  'candidate:read', // masked profile until shortlisted — enforced in query layer
  'submission:read',
  'submission:feedback',
])

// ─── Policy function ──────────────────────────────────────────────────────────

/**
 * `can` — the single authorisation gate for the entire application.
 *
 * Call this at the start of every Route Handler and Server Action.
 * Never inline permission logic elsewhere.
 *
 * @param user   - The authenticated user, or null/undefined if unauthenticated.
 * @param action - The action being attempted.
 * @param resource - The resource being acted upon.
 * @returns true if allowed, false otherwise.
 *
 * @example
 * const session = await getSession(request.headers)
 * if (!can(session?.user, 'candidate:read', { type: 'candidate', owningClientId: req.clientId })) {
 *   return Response.json({ error: 'Forbidden' }, { status: 403 })
 * }
 */
export function can(
  user: PolicyUser | null | undefined,
  action: PolicyAction,
  resource: PolicyResource,
): boolean {
  // Rule 1: unauthenticated → always denied
  if (!user) return false

  // Rule 2: delivery_head → full access
  if (user.role === 'delivery_head') return true

  // Rule 3: recruiter
  if (user.role === 'recruiter') {
    return RECRUITER_ALLOWED.has(action)
  }

  // Rule 4: client
  if (user.role === 'client') {
    // Must be an allowed action for clients
    if (!CLIENT_ALLOWED.has(action)) return false

    // Client isolation: must match their own organisation.
    // If the resource has an owningClientId, it must equal the user's clientId.
    // If owningClientId is null/undefined (shouldn't happen for client-scoped resources),
    // we deny by default (fail-secure).
    if (resource.owningClientId == null) return false
    return resource.owningClientId === user.clientId
  }

  // Fallback: deny
  return false
}
