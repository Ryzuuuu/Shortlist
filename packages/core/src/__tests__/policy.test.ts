import { describe, it, expect } from 'vitest'
import { can, type PolicyUser, type PolicyAction, type PolicyResource } from '../policy'

// ─── Test fixtures ─────────────────────────────────────────────────────────────

const recruiter: PolicyUser = { id: 'u-recruiter', role: 'recruiter', clientId: null }
const deliveryHead: PolicyUser = { id: 'u-dh', role: 'delivery_head', clientId: null }
const clientA: PolicyUser = { id: 'u-client-a', role: 'client', clientId: 'client-a' }
const clientB: PolicyUser = { id: 'u-client-b', role: 'client', clientId: 'client-b' }

const resClientA: PolicyResource = { type: 'candidate', owningClientId: 'client-a' }
const resClientB: PolicyResource = { type: 'candidate', owningClientId: 'client-b' }
const resInsights: PolicyResource = { type: 'insights' }
const resNoOwner: PolicyResource = { type: 'candidate', owningClientId: null }

// ─── Unauthenticated ──────────────────────────────────────────────────────────

describe('unauthenticated user', () => {
  it('is denied for every action', () => {
    const actions: PolicyAction[] = [
      'candidate:read', 'candidate:write', 'candidate:submit',
      'submission:read', 'insights:read', 'report:export', 'user:write',
    ]
    for (const action of actions) {
      expect(can(null, action, resClientA), `null user, action=${action}`).toBe(false)
      expect(can(undefined, action, resClientA), `undefined user, action=${action}`).toBe(false)
    }
  })
})

// ─── delivery_head ────────────────────────────────────────────────────────────

describe('delivery_head', () => {
  it('can perform every action', () => {
    const actions: PolicyAction[] = [
      'candidate:read', 'candidate:write', 'candidate:delete', 'candidate:submit',
      'candidate:view_cv', 'candidate:retry_upload',
      'submission:read', 'submission:feedback',
      'requisition:read', 'requisition:write',
      'upload:create', 'insights:read', 'report:export', 'user:write',
    ]
    for (const action of actions) {
      expect(can(deliveryHead, action, resClientA), `delivery_head, action=${action}`).toBe(true)
    }
  })

  it('can access insights', () => {
    expect(can(deliveryHead, 'insights:read', resInsights)).toBe(true)
  })
})

// ─── recruiter ────────────────────────────────────────────────────────────────

describe('recruiter', () => {
  it('can read, write, submit, view_cv candidates', () => {
    expect(can(recruiter, 'candidate:read', resClientA)).toBe(true)
    expect(can(recruiter, 'candidate:write', resClientA)).toBe(true)
    expect(can(recruiter, 'candidate:submit', resClientA)).toBe(true)
    expect(can(recruiter, 'candidate:view_cv', resClientA)).toBe(true)
  })

  it('can manage requisitions and uploads', () => {
    expect(can(recruiter, 'requisition:read', resClientA)).toBe(true)
    expect(can(recruiter, 'requisition:write', resClientA)).toBe(true)
    expect(can(recruiter, 'upload:create', resClientA)).toBe(true)
  })

  it('CANNOT access insights (delivery_head only)', () => {
    expect(can(recruiter, 'insights:read', resInsights)).toBe(false)
  })

  it('CANNOT export reports', () => {
    expect(can(recruiter, 'report:export', resInsights)).toBe(false)
  })

  it('CANNOT manage users', () => {
    expect(can(recruiter, 'user:write', { type: 'user' })).toBe(false)
  })

  it('CANNOT leave client feedback (portal action)', () => {
    expect(can(recruiter, 'submission:feedback', resClientA)).toBe(false)
  })
})

// ─── client isolation ─────────────────────────────────────────────────────────

describe('client isolation', () => {
  it('client A can read their own candidates', () => {
    expect(can(clientA, 'candidate:read', resClientA)).toBe(true)
  })

  it('client A CANNOT read client B candidates', () => {
    // This is the critical isolation test
    expect(can(clientA, 'candidate:read', resClientB)).toBe(false)
  })

  it('client B CANNOT read client A candidates', () => {
    expect(can(clientB, 'candidate:read', resClientA)).toBe(false)
  })

  it('client is denied when resource has no owningClientId (fail-secure)', () => {
    expect(can(clientA, 'candidate:read', resNoOwner)).toBe(false)
  })

  it('client A can read their own submissions', () => {
    expect(can(clientA, 'submission:read', { type: 'submission', owningClientId: 'client-a' })).toBe(true)
  })

  it('client A can give feedback on their own submissions', () => {
    expect(can(clientA, 'submission:feedback', { type: 'submission', owningClientId: 'client-a' })).toBe(true)
  })

  it('client CANNOT submit candidates (recruiter-only action)', () => {
    expect(can(clientA, 'candidate:submit', resClientA)).toBe(false)
  })

  it('client CANNOT write candidates', () => {
    expect(can(clientA, 'candidate:write', resClientA)).toBe(false)
  })

  it('client CANNOT access insights', () => {
    expect(can(clientA, 'insights:read', resInsights)).toBe(false)
  })

  it('client CANNOT access other client insights even if delivery_head role was faked', () => {
    // Ensure there is no bypass via a crafted user object
    const fakeDH: PolicyUser = { id: 'u-fake', role: 'client', clientId: 'client-a' }
    expect(can(fakeDH, 'insights:read', resInsights)).toBe(false)
  })
})

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('client with undefined clientId cannot access any resource', () => {
    const noClientUser: PolicyUser = { id: 'u-broken', role: 'client', clientId: undefined }
    expect(can(noClientUser, 'candidate:read', resClientA)).toBe(false)
  })

  it('client with null clientId cannot access any resource', () => {
    const noClientUser: PolicyUser = { id: 'u-broken', role: 'client', clientId: null }
    expect(can(noClientUser, 'candidate:read', resClientA)).toBe(false)
  })
})
