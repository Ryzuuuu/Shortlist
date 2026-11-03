import { describe, it, expect } from 'vitest'
import { anonymiseId, isAnonymisedId } from '../anonymise'
import { can } from '../policy'

describe('anonymiseId', () => {
  it('is deterministic for the same id and key', () => {
    expect(anonymiseId('cand-1', 'k')).toBe(anonymiseId('cand-1', 'k'))
  })

  it('differs by id and by key, and never contains the id', () => {
    expect(anonymiseId('cand-1', 'k')).not.toBe(anonymiseId('cand-2', 'k'))
    expect(anonymiseId('cand-1', 'k')).not.toBe(anonymiseId('cand-1', 'other'))
    expect(anonymiseId('cand-1', 'k')).not.toContain('cand-1')
  })

  it('is recognisable as anonymised and refuses an empty key', () => {
    expect(isAnonymisedId(anonymiseId('x', 'k'))).toBe(true)
    expect(isAnonymisedId('cand-1')).toBe(false)
    expect(isAnonymisedId(null)).toBe(false)
    expect(() => anonymiseId('x', '')).toThrow()
  })
})

describe('audit:read policy', () => {
  const res = { type: 'insights' as const }
  it('is delivery_head only', () => {
    expect(can({ id: 'd', role: 'delivery_head' }, 'audit:read', res)).toBe(true)
    expect(can({ id: 'r', role: 'recruiter' }, 'audit:read', res)).toBe(false)
    expect(can({ id: 'c', role: 'client', clientId: 'A' }, 'audit:read', res)).toBe(false)
    expect(can(null, 'audit:read', res)).toBe(false)
  })
})
